import { Copy, FileText, GitMerge, Star, Trash2 } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { requestWidgetDeletion } from '../../store/useWidgetDeletionDialogStore'
import { useFocusStore } from '../../store/useFocusStore'
import type { Widget, WidgetGroup } from '../../types/spatial'
import { groupPlateGeometry } from '../../utils/groupOutline'
import { linkAnchorId, resolveLinkTargetAt } from '../../utils/linkTarget'
import { clampPopover } from '../../utils/popoverPosition'
import { PointerDragSession } from '../../utils/pointerDrag'
import {
  beginDragDisplacement,
  cancelDragDisplacement,
  endDragDisplacement,
  updateDragDisplacement,
  useDragDisplacementStore,
} from '../../store/dragDisplacement'
import { widgetsToMarkdown } from '../../utils/widgetMarkdown'
import { treeRevealDelay } from '../../store/treeReveal'

interface LinkDragState {
  pointerId: number
  rafId: number
  clientX: number
  clientY: number
}

const EMPTY_MEMBERS: Widget[] = []

/** One shared E0 glass backplate beneath every member widget in the group. */
export const GroupPlate = memo(function GroupPlate({ group }: { group: WidgetGroup }) {
  const groupId = group.id
  const treeRevealMs = treeRevealDelay('group', groupId)
  // Subscribe to member widgets only — dragging unrelated widgets elsewhere
  // on the board must not re-render every visible plate.
  const members = useWidgetStore(
    useShallow((state) => {
      const g = state.groups[groupId]
      if (!g) return EMPTY_MEMBERS
      const list: Widget[] = []
      for (const widgetId of g.widgetIds) {
        const widget = state.widgets[widgetId]
        if (widget) list.push(widget)
      }
      return list
    }),
  )
  const isDropTarget = useWidgetStore((state) => state.dragOverGroupId === groupId)
  const focusedWidgetId = useFocusStore((state) => state.focusedWidgetId)
  const isFocusGroup = Boolean(
    focusedWidgetId && members.some((member) => member.id === focusedWidgetId),
  )

  const [labelEditing, setLabelEditing] = useState(false)
  const [showMenu, setShowMenu] = useState<{ x: number; y: number } | null>(null)
  useOverlayLifecycle(showMenu !== null)
  const dragRef = useRef<PointerDragSession | null>(null)
  const linkDragRef = useRef<LinkDragState | null>(null)
  // First live member stands in for the group as a single relation endpoint —
  // RelationLines routes any relation touching a grouped widget to the
  // group's bounding box, so any member works as the anchor.
  const anchorId = members[0]?.id ?? null

  // A displaced group is one rigid cluster, so every member carries the same
  // ghost offset — reading the anchor's is reading the whole plate's.
  const ghostOffset = useDragDisplacementStore((state) =>
    anchorId ? state.offsets[anchorId] : undefined,
  )

  // Union silhouette of member hover footprints (title row + button chrome
  // included) — the plate wraps the widgets' real interactive shape, not a
  // bounding rectangle.
  const plate = useMemo(() => groupPlateGeometry(members), [members])

  if (!plate) return null
  const geometry = plate.bounds

  // Resolves an active "Link as child of…" gesture immediately on click —
  // waiting for a zero-movement pointerup misses ordinary pointer jitter
  // and leaves the picker stuck (same rationale as WidgetCard).
  const tryCompleteTargetedLink = (): boolean => {
    if (!anchorId) return false
    const state = useWidgetStore.getState()
    const dependencySource = state.dependencyLinkSource
    if (dependencySource) {
      const sourceId = linkAnchorId(state, dependencySource)
      if (sourceId !== anchorId) state.addRelation(sourceId, anchorId, 'blocker')
      state.clearDependencyLink()
      return true
    }
    const childSource = state.childLinkSource
    if (!childSource) return false
    const sourceId = linkAnchorId(state, childSource)
    if (sourceId !== anchorId) state.addRelation(anchorId, sourceId, 'parent')
    state.clearChildLink()
    return true
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    useCanvasStore.getState().cancelViewAnimation()
    if (tryCompleteTargetedLink()) return
    e.currentTarget.setPointerCapture(e.pointerId)
    if (e.metaKey && anchorId) {
      const { pan, zoom } = useCanvasStore.getState()
      linkDragRef.current = { pointerId: e.pointerId, rafId: 0, clientX: e.clientX, clientY: e.clientY }
      useWidgetStore.getState().startLinkDrag(
        anchorId,
        { x: (e.clientX - pan.x) / zoom, y: (e.clientY - pan.y) / zoom },
        { x: e.clientX, y: e.clientY },
      )
      return
    }
    beginDragDisplacement()
    dragRef.current = new PointerDragSession(e, {
      onFirstMove: () => useWidgetStore.getState().snapshotHistory(),
      onDelta: (dx, dy) => {
        const zoom = useCanvasStore.getState().zoom
        useWidgetStore.getState().moveGroup(groupId, { x: dx, y: dy }, zoom)
        const fresh = useWidgetStore.getState()
        const movingIds = (fresh.groups[groupId]?.widgetIds ?? []).filter(
          (id) => !fresh.widgets[id]?.metadata.locked,
        )
        const safeZoom = zoom > 0 ? zoom : 1
        updateDragDisplacement(movingIds, { x: dx / safeZoom, y: dy / safeZoom })
      },
    })
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const link = linkDragRef.current
    if (link && link.pointerId === e.pointerId) {
      link.clientX = e.clientX
      link.clientY = e.clientY
      if (link.rafId === 0) {
        link.rafId = requestAnimationFrame(() => {
          link.rafId = 0
          const { pan, zoom } = useCanvasStore.getState()
          useWidgetStore.getState().updateLinkDragCursor(
            { x: (link.clientX - pan.x) / zoom, y: (link.clientY - pan.y) / zoom },
            { x: link.clientX, y: link.clientY },
          )
        })
      }
      return
    }
    dragRef.current?.move(e)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const link = linkDragRef.current
    if (link && link.pointerId === e.pointerId) {
      if (link.rafId !== 0) cancelAnimationFrame(link.rafId)
      linkDragRef.current = null
      const targetId = resolveLinkTargetAt(e.clientX, e.clientY)
      useWidgetStore.getState().endLinkDrag(targetId !== anchorId ? targetId : null)
      return
    }
    const session = dragRef.current
    if (!session || session.pointerId !== e.pointerId) return
    dragRef.current = null
    if (session.end()) {
      const state = useWidgetStore.getState()
      const ghostOffsets = endDragDisplacement()
      if (Object.keys(ghostOffsets).length > 0) state.applyGhostDisplacement(ghostOffsets)
      const widgetIds = state.groups[groupId]?.widgetIds ?? []
      state.settleWidgets(widgetIds)
    } else {
      cancelDragDisplacement()
    }
  }

  const onPointerCancel = (e: ReactPointerEvent<HTMLElement>) => {
    const link = linkDragRef.current
    if (link && link.pointerId === e.pointerId) {
      if (link.rafId !== 0) cancelAnimationFrame(link.rafId)
      linkDragRef.current = null
      useWidgetStore.getState().endLinkDrag(null)
      return
    }
    const session = dragRef.current
    if (!session || session.pointerId !== e.pointerId) return
    dragRef.current = null
    cancelDragDisplacement()
    if (session.end()) {
      const widgetIds = useWidgetStore.getState().groups[groupId]?.widgetIds ?? []
      useWidgetStore.getState().settleWidgets(widgetIds)
    }
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowMenu({ x: e.clientX, y: e.clientY })
  }

  // Group-wide equivalents of the widget title row's action buttons: same
  // affordances, scoped to every member at once instead of one card.
  const toggleFavorite = () => useWidgetStore.getState().toggleGroupFavorite(groupId)

  const duplicateGroup = () => {
    const state = useWidgetStore.getState()
    const newIds = state.duplicateWidgets(group.widgetIds)
    // duplicateWidgets carries wires but not group membership — reassemble it
    // so the clone keeps acting as one group, not a loose pile of copies.
    if (newIds.length >= 2) state.createGroup(newIds, group.label)
  }

  const copyGroupAsMarkdown = () => {
    navigator.clipboard.writeText(widgetsToMarkdown(members))
  }

  const deleteGroup = () => {
    // deleteWidgets already drops any group left with fewer than 2 members,
    // so removing every member dissolves the group as a side effect.
    requestWidgetDeletion(group.widgetIds)
  }

  const color = group.color

  return (
    <>
      <div
        role="group"
        aria-label={`${group.label} group`}
        data-group-id={groupId}
        data-focus-group={isFocusGroup || undefined}
        data-drop-target={isDropTarget || undefined}
        data-ghost-displaced={ghostOffset ? true : undefined}
        className={`gp-widget-motion gp-group-backplate pointer-events-none absolute left-0 top-0 ${
          treeRevealMs !== null ? 'gp-tree-group-reveal' : ''
        }`}
        style={{
          transform: `translate3d(${geometry.x + (ghostOffset?.x ?? 0)}px, ${
            geometry.y + (ghostOffset?.y ?? 0)
          }px, 0)`,
          width: geometry.width,
          height: geometry.height,
          '--gp-widget-accent': color,
          '--gp-tree-reveal-delay': `${treeRevealMs ?? 0}ms`,
          contain: 'layout style',
        } as CSSProperties}
      >
        {/* Grab surface. clip-path clips hit-testing too, so a concave notch
            between members stays plain canvas instead of grabbing the group. */}
        <div
          className="pointer-events-auto absolute inset-0 cursor-grab active:cursor-grabbing"
          style={{ clipPath: `path("${plate.hitPath}")` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={onPointerCancel}
          onContextMenu={onContextMenu}
          onDoubleClick={(event) => {
            event.stopPropagation()
            useCanvasStore.getState().fitRect(geometry, 120)
          }}
        />
        {/* Shared glass carved to the union silhouette. clip-path removes the
            box's own border and shadow, so gp-group-plate-shape swaps in
            silhouette-following drop-shadows and the SVG below draws the
            hairline along the same path. */}
        <div
          aria-hidden
          className="gp-glass gp-backplate gp-group-plate-shape gp-group-backplate-visual pointer-events-none absolute inset-0"
          style={{ clipPath: `path("${plate.glassPath}")` }}
        />
        <svg
          aria-hidden
          className="gp-group-plate-outline pointer-events-none absolute inset-0"
          width={geometry.width}
          height={geometry.height}
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        >
          <path d={plate.glassPath} />
        </svg>
        {/* Group name pill straddles the plate's top-left edge like a tab:
            low enough that the settle gap band keeps foreign cards off it,
            high enough to clear the topmost member's own floating title row
            (which occupies the lower half of the plate's pad band). Floating
            it fully above the plate let neighboring cards cover it; sitting
            fully inside put it under member title chrome. */}
        <div className="absolute z-20 flex items-center gap-1.5" style={{ top: -14, left: 14 }}>
          <div
            className="gp-title-capsule pointer-events-auto flex h-8 max-w-[50%] cursor-grab items-center gap-1.5 rounded-full px-3 shadow-md active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onLostPointerCapture={onPointerCancel}
            onContextMenu={onContextMenu}
            onDoubleClick={(event) => { event.stopPropagation(); useCanvasStore.getState().fitRect(geometry, 120) }}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            {labelEditing ? (
              <input
                defaultValue={group.label}
                autoFocus
                onBlur={(e) => {
                  const val = e.currentTarget.value.trim()
                  if (val) useWidgetStore.getState().renameGroup(groupId, val)
                  setLabelEditing(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setLabelEditing(false)
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-full min-w-[48px] max-w-[160px] rounded bg-transparent text-xs font-bold tracking-wide outline-none"
                style={{ color }}
              />
            ) : (
              <span
                className="cursor-text truncate text-xs font-bold tracking-wide select-none"
                style={{ color }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setLabelEditing(true)
                }}
              >
                {group.label}
              </span>
            )}
          </div>

          <div className="gp-plate-action pointer-events-auto flex items-center gap-1">
            <button
              type="button"
              title="Favorite group"
              aria-label={group.favorite ? 'Remove group from favorites' : 'Favorite group'}
              aria-pressed={Boolean(group.favorite)}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); toggleFavorite() }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-colors hover:text-neutral-200"
              style={group.favorite ? { color } : undefined}
            >
              <Star size={13} aria-hidden fill={group.favorite ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              title="Duplicate group"
              aria-label="Duplicate group"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); duplicateGroup() }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-colors hover:text-neutral-200"
            >
              <Copy size={13} aria-hidden />
            </button>
            <button
              type="button"
              title="Copy group as Markdown"
              aria-label="Copy group as Markdown"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); copyGroupAsMarkdown() }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-colors hover:text-neutral-200"
            >
              <FileText size={13} aria-hidden />
            </button>
            <button
              type="button"
              title="Delete group"
              aria-label="Delete group and its widgets"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); deleteGroup() }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-colors hover:text-red-300"
            >
              <Trash2 size={13} aria-hidden />
            </button>
          </div>
        </div>

        {/* Drop-target hint */}
        {isDropTarget && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center" aria-hidden>
            <span
              className="gp-title-capsule rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ color }}
            >
              drop to join
            </span>
          </div>
        )}
      </div>

      {showMenu && (
        <GroupContextMenu
          groupId={groupId}
          anchorId={anchorId}
          x={showMenu.x}
          y={showMenu.y}
          onClose={() => setShowMenu(null)}
          onRename={() => {
            setShowMenu(null)
            setLabelEditing(true)
          }}
        />
      )}
    </>
  )
})

function GroupContextMenu({
  groupId,
  anchorId,
  x,
  y,
  onClose,
  onRename,
}: {
  groupId: string
  anchorId: string | null
  x: number
  y: number
  onClose: () => void
  onRename: () => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const { x: left, y: top } = clampPopover(x, y, 176, 190)

  return createPortal(
    <>
      <div
        data-canvas-ui
        className="fixed inset-0 z-[195]"
        onPointerDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <div
        data-canvas-ui
        className="gp-menu gp-pop gp-panel fixed z-[196] w-44 origin-top-left overflow-hidden rounded-2xl p-1.5 shadow-2xl"
        style={{ left, top }}
      >
        <button
          type="button"
          onClick={onRename}
          className="block w-full px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800"
        >
          Rename group
        </button>
        <button
          type="button"
          onClick={() => {
            useWidgetStore.getState().compactGroup(groupId)
            onClose()
          }}
          className="block w-full px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800"
        >
          Tighten group
        </button>
        {anchorId && (
          <>
            <div className="my-1 border-t border-neutral-800" />
            <button
              type="button"
              onClick={() => {
                useWidgetStore.getState().startChildLink(anchorId)
                onClose()
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800"
            >
              <GitMerge size={13} aria-hidden />
              Link group as child of…
            </button>
          </>
        )}
        <div className="my-1 border-t border-neutral-800" />
        <button
          type="button"
          onClick={() => {
            useWidgetStore.getState().dissolveGroup(groupId)
            onClose()
          }}
          className="block w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10"
        >
          Dissolve group
        </button>
      </div>
    </>,
    document.body,
  )
}
