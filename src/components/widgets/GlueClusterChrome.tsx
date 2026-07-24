import { memo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Check, Group, Maximize2, Minimize2, Star, Trash2, Ungroup } from 'lucide-react'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useWidgetRestStore } from '../../store/useWidgetRestStore'
import { requestWidgetDeletion } from '../../store/useWidgetDeletionDialogStore'
import { clusterEnvelope, GLUE_FRAME_BAND } from '../../utils/glueGeometry'
import type { WorldRect } from '../../utils/canvasView'

/** The frame's reserved band, owned by glueGeometry so the drawn lines and the
 * cluster's link anchor agree on exactly one boundary. */
const LINE_BAND = GLUE_FRAME_BAND
/** Height of the title/button row that floats above the top boundary line —
 * tall enough for the 28px icon square a widget's title row uses. The row
 * lives INSIDE the group's technical rectangle (`clusterChromeEnvelope`). */
const TITLE_H = 28

/** The group's STATIC action buttons — the same fixed set a widget's own
 * title row carries, applied to every member at once. Collapse/expand and
 * Ungroup follow as the group's own controls. No customize menu. */
const GROUP_BUTTONS: ReadonlyArray<{ id: 'completed' | 'favorite' | 'delete'; icon: typeof Check; label: string }> = [
  { id: 'completed', icon: Check, label: 'Complete all' },
  { id: 'favorite', icon: Star, label: 'Favorite all' },
  { id: 'delete', icon: Trash2, label: 'Delete group' },
]

/** Flat primitives only — a nested rect object would break `useShallow`'s
 * one-level compare and re-render forever. */
interface ClusterView {
  x: number
  y: number
  width: number
  height: number
  name: string | undefined
  collapsed: boolean
  hidden: boolean
  allCompleted: boolean
  allFavorite: boolean
  anyChecklist: boolean
}

const HIDDEN_VIEW: ClusterView = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  name: undefined,
  collapsed: false,
  hidden: true,
  allCompleted: false,
  allFavorite: false,
  anyChecklist: false,
}

/** One cluster's group frame: a subtle boundary line above and below the
 * welded widgets, and a title + buttons row above the top line wearing the
 * same static action buttons a widget's own name row has. */
const ClusterFrame = memo(function ClusterFrame({ glueId }: { glueId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
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
      const members = cluster.widgetIds
        .map((id) => state.widgets[id])
        .filter((w): w is NonNullable<typeof w> => Boolean(w))
      return {
        x: env.x,
        y: env.y,
        width: env.width,
        height: env.height,
        name: cluster.name,
        collapsed: cluster.collapsed === true,
        hidden,
        allCompleted: members.length > 0 && members.every((w) => w.metadata.completed === true),
        allFavorite: members.length > 0 && members.every((w) => w.metadata.favorite === true),
        // Mirrors the widget rule: the Completed control only shows where
        // completion means something.
        anyChecklist: members.some((w) => w.type === 'checklist'),
      }
    }),
  )

  if (view.hidden) return null
  const { x: envX, y: envY, width: envWidth, height: envHeight, name, collapsed } = view

  const topLineY = envY - LINE_BAND
  const bottomLineY = envY + envHeight
  const titleY = topLineY - TITLE_H - 4

  const memberIds = () => useWidgetStore.getState().glues[glueId]?.widgetIds ?? []

  const toggledFor = (id: 'completed' | 'favorite' | 'delete'): boolean =>
    (id === 'completed' && view.allCompleted) || (id === 'favorite' && view.allFavorite)

  const runAction = (id: 'completed' | 'favorite' | 'delete') => {
    const store = useWidgetStore.getState()
    const ids = memberIds()
    if (ids.length === 0) return
    if (id === 'completed') {
      store.updateWidgetsMetadata(ids, { completed: !view.allCompleted })
    } else if (id === 'favorite') {
      store.updateWidgetsMetadata(ids, { favorite: !view.allFavorite })
    } else if (id === 'delete') {
      requestWidgetDeletion(ids)
    }
  }

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
      setEditing(false)
    }
  }

  return (
    <div className="absolute left-0 top-0" data-canvas-ui>
      {/* Title row, above the top boundary line. Same anatomy as a single
          widget's title: a tinted icon square, the bold name beside it, and the
          static action buttons in their own cells to the right — no pill. */}
      <div
        className="gp-group-bar absolute flex items-center gap-0.5"
        style={{ left: envX, top: titleY, height: TITLE_H }}
      >
        <span className="gp-group-icon" aria-hidden>
          <Group size={14} aria-hidden />
        </span>
        {editing ? (
          <input
            ref={inputRef}
            defaultValue={name ?? ''}
            placeholder="Group"
            aria-label="Group name"
            spellCheck={false}
            autoFocus
            className="gp-group-name ml-1 w-24 bg-transparent outline-none"
            onBlur={() => {
              commitName()
              setEditing(false)
            }}
            onKeyDown={onNameKey}
          />
        ) : (
          <span
            className="gp-group-name ml-1 mr-1 max-w-[200px] truncate"
            onDoubleClick={() => setEditing(true)}
          >
            {name || 'Group'}
          </span>
        )}
        {GROUP_BUTTONS.map(({ id, icon: IconComponent, label }) => {
          if (id === 'completed' && !view.anyChecklist) return null
          const toggled = toggledFor(id)
          return (
            <button
              key={id}
              type="button"
              className="gp-group-btn"
              title={label}
              aria-label={label}
              aria-pressed={toggled}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                runAction(id)
              }}
              style={toggled ? { color: 'var(--gp-relation-outline)' } : undefined}
            >
              <IconComponent
                size={12}
                fill={id === 'favorite' && toggled ? 'currentColor' : 'none'}
                aria-hidden
              />
            </button>
          )
        })}
        <button
          type="button"
          className="gp-group-btn"
          title={collapsed ? 'Expand all' : 'Collapse all'}
          aria-label={collapsed ? 'Expand all widgets' : 'Collapse all widgets'}
          onClick={() => useWidgetStore.getState().setClusterCollapsed(glueId, !collapsed)}
        >
          {collapsed ? <Maximize2 size={12} aria-hidden /> : <Minimize2 size={12} aria-hidden />}
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

/** One unbroken boundary line across the cluster's full width. It carries no
 * notch: connecting relation lines now stop OUTSIDE the frame (the cluster is a
 * single link endpoint), so nothing has to pass through the line. */
function BoundaryLine({ x, y, width }: { x: number; y: number; width: number }) {
  return (
    <div
      aria-hidden
      className="absolute flex items-center"
      style={{ left: x, top: y, width, height: LINE_BAND }}
    >
      <span className="gp-group-line" style={{ width }} />
    </div>
  )
}

/**
 * World-space layer drawing the group frame for every glue cluster on the
 * active canvas: the top and bottom boundary lines and the title/button row.
 * Members read as one object through their own local aura pooling on the
 * canvas behind them; this is the outer chrome.
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
