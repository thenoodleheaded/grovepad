import type { CanvasMeta, CanvasNodeData, Relation, Widget, WidgetGlue } from '../types/spatial'
import type { Connection } from '../types/circuit'

/**
 * In-memory widget clipboard — survives interactions, not page reloads.
 * Shared by the canvas shortcut layer and both context menus so copy, cut,
 * and paste behave identically from keyboard and pointer. The window 'paste'
 * listener in CanvasViewport arbitrates this clipboard against OS content.
 *
 * The clipboard carries a structural payload, not bare widget records: wires,
 * glue clusters, and relation links wholly inside the copied set travel with
 * it, and a copied canvas card carries its backing canvas subtree. Paste can
 * therefore rebuild the exact structure the user copied — the same promise
 * duplicate has always kept.
 */
export interface WidgetClipboardPayload {
  /** The directly copied cards, in selection order. */
  widgets: Widget[]
  /** Backing canvases of copied canvas cards, recursively (deletion-cascade closure). */
  canvases: CanvasMeta[]
  /** Widgets living on those captured canvases. */
  canvasWidgets: Widget[]
  /** Wires with both endpoints inside the copied closure. */
  connections: Connection[]
  /** Glue clusters whose every member is inside the copied closure. */
  glues: WidgetGlue[]
  /** Relation links with both endpoints inside the copied closure. */
  relations: Relation[]
}

export interface ClipboardCaptureState {
  widgets: Record<string, Widget>
  canvases: Record<string, CanvasMeta>
  connections: Record<string, Connection>
  glues: Record<string, WidgetGlue>
  relations: Record<string, Relation>
}

/** Wrap bare widget records (legacy callers, tests) into an empty-structure payload. */
export function payloadFromWidgets(widgets: Widget[]): WidgetClipboardPayload {
  return { widgets, canvases: [], canvasWidgets: [], connections: [], glues: [], relations: [] }
}

/**
 * Snapshot `ids` plus everything that structurally belongs to them: the canvas
 * subtree under each copied canvas card (the same closure deletion cascades
 * through, so cut → paste round-trips exactly what the cut removed), and every
 * wire, glue cluster, and relation living wholly inside that closure.
 */
export function captureClipboardPayload(
  state: ClipboardCaptureState,
  ids: string[],
): WidgetClipboardPayload {
  const roots = [...new Set(ids)]
    .map((id) => state.widgets[id])
    .filter((widget): widget is Widget => widget !== undefined)

  // Canvas closure: each copied canvas card's backing canvas, then every
  // canvas parented anywhere below it — mirroring analyzeWidgetDeletion.
  const capturedCanvasIds = new Set<string>()
  const queue: string[] = []
  for (const widget of roots) {
    if (widget.type !== 'canvas_node') continue
    const canvasId = (widget.data as CanvasNodeData).canvasId
    if (state.canvases[canvasId] && !capturedCanvasIds.has(canvasId)) {
      capturedCanvasIds.add(canvasId)
      queue.push(canvasId)
    }
  }
  while (queue.length > 0) {
    const parentId = queue.pop()!
    for (const canvas of Object.values(state.canvases)) {
      if (canvas.parentCanvasId === parentId && !capturedCanvasIds.has(canvas.id)) {
        capturedCanvasIds.add(canvas.id)
        queue.push(canvas.id)
      }
    }
  }

  const rootIdSet = new Set(roots.map((widget) => widget.id))
  const canvasWidgets = Object.values(state.widgets).filter(
    (widget) => capturedCanvasIds.has(widget.canvasId) && !rootIdSet.has(widget.id),
  )

  const closure = new Set([...rootIdSet, ...canvasWidgets.map((widget) => widget.id)])
  return {
    widgets: roots,
    canvases: [...capturedCanvasIds].map((id) => state.canvases[id]!),
    canvasWidgets,
    connections: Object.values(state.connections).filter(
      (connection) => closure.has(connection.fromId) && closure.has(connection.toId),
    ),
    glues: Object.values(state.glues).filter((glue) =>
      glue.widgetIds.every((memberId) => closure.has(memberId)),
    ),
    relations: Object.values(state.relations).filter(
      (relation) => closure.has(relation.fromId) && closure.has(relation.toId),
    ),
  }
}

let clipboard: WidgetClipboardPayload = payloadFromWidgets([])

export function setClipboardPayload(payload: WidgetClipboardPayload): void {
  clipboard = payload
}

export function getClipboardPayload(): WidgetClipboardPayload {
  return clipboard
}

export function clipboardWidgetCount(): number {
  return clipboard.widgets.length
}
