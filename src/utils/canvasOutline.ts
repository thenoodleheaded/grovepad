import type { CanvasMeta, Widget } from '../types/spatial'

type CanvasOutlineEntryKind = 'canvas' | 'widget'

export interface CanvasOutlineEntry {
  key: string
  kind: CanvasOutlineEntryKind
  id: string
  level: number
  parentKey: string | null
}

const canvasKey = (id: string) => `canvas:${id}`
const widgetKey = (id: string) => `widget:${id}`

/** A deterministic reading order for a spatial board. Canvas hierarchy stays
 * structural; cards inside each canvas use top-to-bottom, then left-to-right
 * position so the outline is stable and meaningful without relying on DOM
 * culling or current zoom. Canvas-node cards are omitted because their target
 * canvases already appear as structural entries. */
export function buildCanvasOutline(
  canvases: Record<string, CanvasMeta>,
  widgets: Record<string, Widget>,
  workspaceId: string,
  rootCanvasId: string,
): CanvasOutlineEntry[] {
  const childCanvases = new Map<string | null, CanvasMeta[]>()
  for (const canvas of Object.values(canvases)) {
    if (canvas.workspaceId !== workspaceId) continue
    const list = childCanvases.get(canvas.parentCanvasId) ?? []
    list.push(canvas)
    childCanvases.set(canvas.parentCanvasId, list)
  }
  for (const list of childCanvases.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  }

  const canvasWidgets = new Map<string, Widget[]>()
  for (const widget of Object.values(widgets)) {
    if (widget.type === 'canvas_node') continue
    const canvas = canvases[widget.canvasId]
    if (!canvas || canvas.workspaceId !== workspaceId) continue
    const list = canvasWidgets.get(widget.canvasId) ?? []
    list.push(widget)
    canvasWidgets.set(widget.canvasId, list)
  }
  for (const list of canvasWidgets.values()) {
    list.sort((a, b) =>
      a.position.y - b.position.y ||
      a.position.x - b.position.x ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
    )
  }

  const entries: CanvasOutlineEntry[] = []
  const walk = (canvasId: string, level: number, parentKey: string | null) => {
    const canvas = canvases[canvasId]
    if (!canvas || canvas.workspaceId !== workspaceId) return
    const key = canvasKey(canvas.id)
    entries.push({ key, kind: 'canvas', id: canvas.id, level, parentKey })
    for (const widget of canvasWidgets.get(canvas.id) ?? []) {
      entries.push({
        key: widgetKey(widget.id),
        kind: 'widget',
        id: widget.id,
        level: level + 1,
        parentKey: key,
      })
    }
    for (const child of childCanvases.get(canvas.id) ?? []) {
      walk(child.id, level + 1, key)
    }
  }
  walk(rootCanvasId, 1, null)
  return entries
}

export type CanvasOutlineNavigationKey =
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Home'
  | 'End'

export function nextCanvasOutlineKey(
  entries: readonly CanvasOutlineEntry[],
  currentKey: string,
  key: CanvasOutlineNavigationKey,
): string {
  if (entries.length === 0) return currentKey
  const index = Math.max(0, entries.findIndex((entry) => entry.key === currentKey))
  const current = entries[index]!
  if (key === 'Home') return entries[0]!.key
  if (key === 'End') return entries.at(-1)!.key
  if (key === 'ArrowUp') return entries[Math.max(0, index - 1)]!.key
  if (key === 'ArrowDown') return entries[Math.min(entries.length - 1, index + 1)]!.key
  if (key === 'ArrowLeft') return current.parentKey ?? current.key
  const child = entries.find((entry) => entry.parentKey === current.key)
  return child?.key ?? current.key
}
