import { GitMerge } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import type { Widget, WidgetGroup } from '../../types/spatial'
import {
  GROUP_PAD,
  convexHull,
  paddedMemberCorners,
  shrinkWrapPath,
} from '../../utils/groupGeometry'
import { linkAnchorId, resolveLinkTargetAt } from '../../utils/linkTarget'
import { clampPopover } from '../../utils/popoverPosition'
import { PointerDragSession } from '../../utils/pointerDrag'

interface LinkDragState {
  pointerId: number
  rafId: number
  clientX: number
  clientY: number
}

const EMPTY_MEMBERS: Widget[] = []

/**
 * Group visual: a single taut elastic band shrink-wrapped around the member
 * widgets. The band is the convex hull of the members' padded corners —
 * rounded where it bends around a widget, sagging slightly inward across
 * empty spans like stretched rubber. Tightness depicts the grouping itself.
 * When a widget is dragged over the group, the band relaxes open to accept
 * it (CSS `d` transition morphs taut → relaxed; both paths share structure).
 *
 * One SVG path, recomputed only when members move — no per-frame cost.
 */
export const GroupPlate = memo(function GroupPlate({ group }: { group: WidgetGroup }) {
  const groupId = group.id
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

  // Holds [data-drop-morph] on the band for one transition-length after the
  // drop-target state ends, so the relax→taut morph still animates on the way
  // out (the `d` transition is otherwise suppressed while a drag is live).
  const [dropMorphHold, setDropMorphHold] = useState(false)
  useEffect(() => {
    if (isDropTarget) {
      setDropMorphHold(true)
      return
    }
    if (!dropMorphHold) return
    const timer = window.setTimeout(() => setDropMorphHold(false), 260)
    return () => window.clearTimeout(timer)
  }, [isDropTarget, dropMorphHold])

  const [labelEditing, setLabelEditing] = useState(false)
  const [showMenu, setShowMenu] = useState<{ x: number; y: number } | null>(null)
  useOverlayLifecycle(showMenu !== null)
  const dragRef = useRef<PointerDragSession | null>(null)
  const linkDragRef = useRef<LinkDragState | null>(null)
  // First live member stands in for the group as a single relation endpoint —
  // RelationLines routes any relation touching a grouped widget to the
  // group's bounding box, so any member works as the anchor.
  const anchorId = members[0]?.id ?? null

  const geometry = useMemo(() => {
    if (members.length === 0) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const w of members) {
      minX = Math.min(minX, w.position.x)
      minY = Math.min(minY, w.position.y)
      maxX = Math.max(maxX, w.position.x + w.size.width)
      maxY = Math.max(maxY, w.position.y + w.size.height)
    }
    if (!Number.isFinite(minX)) return null
    const hull = convexHull(paddedMemberCorners(members))
    return {
      x: minX - GROUP_PAD,
      y: minY - GROUP_PAD,
      width: maxX - minX + GROUP_PAD * 2,
      height: maxY - minY + GROUP_PAD * 2,
      taut: shrinkWrapPath(hull, 1),
      relaxed: shrinkWrapPath(hull, 0),
    }
  }, [members])

  if (!geometry) return null

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

  const onPointerDown = (e: ReactPointerEvent<Element>) => {
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
    dragRef.current = new PointerDragSession(e, {
      onFirstMove: () => useWidgetStore.getState().snapshotHistory(),
      onDelta: (dx, dy) =>
        useWidgetStore
          .getState()
          .moveGroup(groupId, { x: dx, y: dy }, useCanvasStore.getState().zoom),
    })
  }

  const onPointerMove = (e: ReactPointerEvent<Element>) => {
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

  const onPointerUp = (e: ReactPointerEvent<Element>) => {
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
      const widgetIds = useWidgetStore.getState().groups[groupId]?.widgetIds ?? []
      useWidgetStore.getState().settleWidgets(widgetIds)
    }
  }

  const onPointerCancel = (e: ReactPointerEvent<Element>) => {
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

  const color = group.color

  return (
    <>
      <div
        className="gp-widget-motion absolute left-0 top-0"
        style={{
          transform: `translate3d(${geometry.x}px, ${geometry.y}px, 0)`,
          width: geometry.width,
          height: geometry.height,
          // Hit-testing lives on the band path below, not this box — empty
          // bounding-box corners outside the band stay click-through.
          pointerEvents: 'none',
          // No paint containment: the name pill floats above the band and
          // the band itself can exceed the box — same invariant as WidgetCard.
          contain: 'layout style',
        }}
      >
        <svg
          className="absolute inset-0 overflow-visible"
          width={geometry.width}
          height={geometry.height}
          viewBox={`${geometry.x} ${geometry.y} ${geometry.width} ${geometry.height}`}
          style={{ pointerEvents: 'none' }}
        >
          <defs>
            {/* Glass fill: white sheen at the top-left melting into a faint
                color tint — same trick as .gp-glass, one static paint. */}
            <linearGradient id={`gp-band-${groupId}`} x1="0" y1="0" x2="0.7" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity={isDropTarget ? 0.14 : 0.09} />
              <stop offset="0.45" stopColor={color} stopOpacity={isDropTarget ? 0.10 : 0.06} />
              <stop offset="1" stopColor={color} stopOpacity={isDropTarget ? 0.05 : 0.02} />
            </linearGradient>
          </defs>
          <path
            data-group-id={groupId}
            data-drop-morph={isDropTarget || dropMorphHold ? true : undefined}
            d={isDropTarget ? geometry.relaxed : geometry.taut}
            fill={`url(#gp-band-${groupId})`}
            stroke={isDropTarget ? `${color}cc` : `${color}77`}
            strokeWidth={isDropTarget ? 2.5 : 2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onLostPointerCapture={onPointerCancel}
            onContextMenu={onContextMenu}
            onDoubleClick={(event) => { event.stopPropagation(); useCanvasStore.getState().fitRect({ x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height }, 120) }}
            className="gp-band-motion cursor-grab active:cursor-grabbing"
            style={{ pointerEvents: 'all' }}
          />
        </svg>

        {/* Group name pill — floats above the band like a widget's title
            capsule. Offset clears the topmost member's own -top-9 capsule,
            which sits only GROUP_PAD below the band's top edge. */}
        <div className="absolute inset-x-0 z-20 flex justify-center" style={{ top: -60 }}>
          <div
            className="gp-title-capsule pointer-events-auto flex h-8 max-w-[80%] cursor-grab items-center gap-1.5 rounded-full px-3 shadow-md active:cursor-grabbing"
            style={{ background: `${color}22` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onLostPointerCapture={onPointerCancel}
            onContextMenu={onContextMenu}
            onDoubleClick={(event) => { event.stopPropagation(); useCanvasStore.getState().fitRect({ x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height }, 120) }}
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
        </div>

        {/* Drop-target hint */}
        {isDropTarget && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center" aria-hidden>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ color, background: `${color}20`, border: `1px solid ${color}50` }}
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
