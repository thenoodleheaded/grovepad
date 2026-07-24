import { memo, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Ungroup, Minimize2, Maximize2 } from 'lucide-react'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useWidgetRestStore } from '../../store/useWidgetRestStore'
import { clusterEnvelope } from '../../utils/glueGeometry'
import type { WorldRect } from '../../utils/canvasView'

/** Reserved band above and below the cluster for each boundary line — 0.3 of a
 * grid cell, the same measure as the weld seam. */
const LINE_BAND = 12
/** Height of the title/button row that floats above the top boundary line. */
const TITLE_H = 26
/** Centre notch in each boundary line so a connecting relation line passes
 * through the frame instead of being blocked by it. */
const CONNECT_GAP = 34

/** Flat primitives only — a nested rect object would break `useShallow`'s
 * one-level compare and re-render forever. */
interface ClusterView {
  x: number
  y: number
  width: number
  height: number
  name: string | undefined
  allIconified: boolean
  hidden: boolean
}

const HIDDEN_VIEW: ClusterView = { x: 0, y: 0, width: 0, height: 0, name: undefined, allIconified: false, hidden: true }

/** One cluster's group frame: a subtle boundary line above and below the
 * welded widgets, and a title + buttons row above the top line. */
const ClusterFrame = memo(function ClusterFrame({ glueId }: { glueId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const expandedWidgetId = useWidgetRestStore((state) => state.expandedWidgetId)

  const view = useWidgetStore(
    useShallow((state): ClusterView => {
      const cluster = state.glues[glueId]
      if (!cluster || cluster.widgetIds.length < 2) return HIDDEN_VIEW
      const env: WorldRect | null = clusterEnvelope(cluster.widgetIds, state.widgets)
      if (!env) return HIDDEN_VIEW
      // While a member floats out expanded, the frame would sit over stale
      // resting-tile geometry — hide it until the cluster settles back.
      const hidden = Boolean(expandedWidgetId && cluster.widgetIds.includes(expandedWidgetId))
      const allIconified = cluster.widgetIds.every((id) => state.widgets[id]?.iconified)
      return { x: env.x, y: env.y, width: env.width, height: env.height, name: cluster.name, allIconified, hidden }
    }),
  )

  if (view.hidden) return null
  const { x: envX, y: envY, width: envWidth, height: envHeight, name, allIconified } = view

  const topLineY = envY - LINE_BAND
  const bottomLineY = envY + envHeight
  const titleY = topLineY - TITLE_H - 4

  const commitName = () => {
    const value = inputRef.current?.value ?? ''
    useWidgetStore.getState().renameGlue(glueId, value)
  }
  const onNameKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      inputRef.current?.blur()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      if (inputRef.current) inputRef.current.value = name ?? ''
      inputRef.current?.blur()
    }
  }

  return (
    <div className="absolute left-0 top-0" data-canvas-ui>
      {/* Title + buttons, above the top boundary line. */}
      <div
        className="gp-group-bar absolute flex items-center gap-1"
        style={{ left: envX, top: titleY, height: TITLE_H, maxWidth: Math.max(envWidth, 160) }}
      >
        <input
          ref={inputRef}
          defaultValue={name ?? ''}
          placeholder="Group"
          aria-label="Group name"
          spellCheck={false}
          className="gp-group-name min-w-0 flex-1 bg-transparent outline-none"
          onBlur={commitName}
          onKeyDown={onNameKey}
        />
        <button
          type="button"
          className="gp-group-btn"
          title={allIconified ? 'Expand all' : 'Collapse all'}
          aria-label={allIconified ? 'Expand all widgets' : 'Collapse all widgets'}
          onClick={() => useWidgetStore.getState().setClusterCollapsed(glueId, !allIconified)}
        >
          {allIconified ? <Maximize2 size={12} aria-hidden /> : <Minimize2 size={12} aria-hidden />}
        </button>
        <button
          type="button"
          className="gp-group-btn"
          title="Ungroup"
          aria-label="Ungroup widgets"
          onClick={() => useWidgetStore.getState().unglueCluster(glueId)}
        >
          <Ungroup size={12} aria-hidden />
        </button>
      </div>

      <BoundaryLine y={topLineY} x={envX} width={envWidth} />
      <BoundaryLine y={bottomLineY} x={envX} width={envWidth} />
    </div>
  )
})

/** A subtle full-width boundary line with a centre notch for a connecting line.
 * Sits inside a reserved `LINE_BAND` so it never crowds the welded widgets. */
function BoundaryLine({ x, y, width }: { x: number; y: number; width: number }) {
  const notch = width > CONNECT_GAP * 2 ? CONNECT_GAP : 0
  const side = notch ? (width - notch) / 2 : width
  return (
    <div
      aria-hidden
      className="absolute flex items-center"
      style={{ left: x, top: y, width, height: LINE_BAND }}
    >
      <span className="gp-group-line" style={{ width: side }} />
      {notch > 0 && <span style={{ width: notch }} />}
      {notch > 0 && <span className="gp-group-line" style={{ width: side }} />}
    </div>
  )
}

/**
 * World-space layer drawing the group frame for every glue cluster on the
 * active canvas: the top and bottom boundary lines and the title/button row.
 * The welds themselves are painted by GlueSeamLayer; this is the outer chrome.
 */
export function GlueClusterChrome() {
  const glueIds = useWidgetStore(
    useShallow((state) =>
      Object.keys(state.glues).filter((id) => {
        const first = state.glues[id]?.widgetIds[0]
        return Boolean(first && state.widgets[first]?.canvasId === state.activeCanvasId)
      }),
    ),
  )
  if (glueIds.length === 0) return null
  return (
    <div className="absolute left-0 top-0">
      {glueIds.map((id) => (
        <ClusterFrame key={id} glueId={id} />
      ))}
    </div>
  )
}
