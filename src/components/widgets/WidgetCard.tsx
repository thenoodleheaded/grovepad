import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { LockKeyhole, Sparkles, Star, TriangleAlert, Unlink, UnlockKeyhole } from 'lucide-react'
import { ErrorBoundary } from '../ErrorBoundary'
import { useCanvasStore } from '../../store/useCanvasStore'
import { isRecentlySpawned, useWidgetStore } from '../../store/useWidgetStore'
import { useFocusStore } from '../../store/useFocusStore'
import { clearLiveWidgetSizing, getLiveWidgetSizing, mergeWidgetSizing, setLiveWidgetSizing } from '../../store/liveWidgetSizing'
import type { ModuleData, Size, Widget, WidgetGroup } from '../../types/spatial'
import { GRID_SIZE } from '../../types/spatial'
import { convexHull, paddedMemberCorners } from '../../utils/groupGeometry'
import { linkAnchorId, resolveLinkTargetAt } from '../../utils/linkTarget'
import { PointerDragSession } from '../../utils/pointerDrag'
import { measureWidgetContentFloor } from '../../utils/widgetContentFloor'
import { crossedBothScaleAxes, fullWidgetResizeBounds, type WidgetScaleState } from '../../utils/widgetScale'
import { DEFAULT_SIZING, widgetDefinition } from '../../widgets/registry'
import { FloatingBadges } from './FloatingBadges'
import { FocusModeLayer } from './FocusModeLayer'
import { PortRail } from './PortRail'
import { WidgetRenderer } from './WidgetRenderer'

const PANELIZED_TYPES = new Set([
  'checklist',
  'bullets',
  'sticky_note',
  'branch_gate',
  'decision',
  'random_picker',
  'priority_matrix',
  'pros_cons',
  'swot',
])

interface WidgetCardProps {
  widgetId: string
}

interface LinkDragState {
  pointerId: number
  rafId: number
  clientX: number
  clientY: number
}

interface ResizeState {
  pointerId: number
  startX: number
  startY: number
  startWidth: number
  startHeight: number
  state: WidgetScaleState
  committed: boolean
  historyCaptured: boolean
  moved: boolean
  rafId: number
  pending: Size | null
  disposeWindowListeners: () => void
}

interface ResizePointerSample {
  pointerId: number
  clientX: number
  clientY: number
}

const GROUP_DROP_DWELL_MS = 350

interface GroupDropIntent {
  groupId: string | null
  since: number
}

function pointInConvexPolygon(x: number, y: number, polygon: Array<{ x: number; y: number }>): boolean {
  if (polygon.length < 3) return false
  let sign = 0
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index]!
    const b = polygon[(index + 1) % polygon.length]!
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)
    if (Math.abs(cross) < 0.001) continue
    const nextSign = Math.sign(cross)
    if (sign !== 0 && nextSign !== sign) return false
    sign = nextSign
  }
  return true
}

function findDropGroup(
  widget: Widget,
  groups: Record<string, WidgetGroup>,
  widgets: Record<string, Widget>,
  widgetGroupIndex: Record<string, string>,
): string | null {
  const cx = widget.position.x + widget.size.width / 2
  const cy = widget.position.y + widget.size.height / 2
  const currentGroupId = widgetGroupIndex[widget.id]
  for (const [gid, group] of Object.entries(groups)) {
    if (gid === currentGroupId) continue
    const members = group.widgetIds
      .map((id) => widgets[id])
      .filter((member): member is Widget => Boolean(member))
    const hull = convexHull(paddedMemberCorners(members))
    if (pointInConvexPolygon(cx, cy, hull)) {
      return gid
    }
  }
  return null
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.tagName === 'BUTTON' ||
    target.closest('button') !== null
  )
}

export const WidgetCard = memo(function WidgetCard({ widgetId }: WidgetCardProps) {
  const widget = useWidgetStore((state) => state.widgets[widgetId])
  const isBlocked = useWidgetStore((state) => state.blockedWidgetIds.has(widgetId))
  const isLinkDragSource = useWidgetStore((state) => state.linkDrag?.sourceId === widgetId)
  const isSelected = useWidgetStore((state) => state.selectedIds.has(widgetId))
  const isFocused = useFocusStore((state) => state.focusedWidgetId === widgetId)
  const isFlashing = useWidgetStore((state) => state.flashWidgetId === widgetId)
  const groupId = useWidgetStore((state) => state.widgetGroupIndex[widgetId])
  const groupColor = useWidgetStore((state) => {
    const gid = state.widgetGroupIndex[widgetId]
    return gid ? state.groups[gid]?.color : undefined
  })

  const isRenaming = useWidgetStore((state) => state.renamingWidgetId === widgetId)
  const [titleEditing, setTitleEditing] = useState(false)
  const dragRef = useRef<PointerDragSession | null>(null)
  const linkDragRef = useRef<LinkDragState | null>(null)
  const groupDropRef = useRef<GroupDropIntent>({ groupId: null, since: 0 })
  const resizeRef = useRef<ResizeState | null>(null)
  const activeDragWidgetId = useRef(widgetId)
  const articleRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const shouldFitContent = Boolean(widget && !widget.collapsed && !widget.iconified)
  const fitContentType = widget?.type

  useEffect(() => () => {
    const resize = resizeRef.current
    if (!resize) return
    if (resize.rafId !== 0) cancelAnimationFrame(resize.rafId)
    resize.disposeWindowListeners()
    document.body.removeAttribute('data-widget-dragging')
    document.body.removeAttribute('data-widget-resizing')
  }, [])

  // The mounted renderer declares its real floor. Unlike an outer overflow
  // check, this reads complete input/ellipsis text and recursively composes
  // rows, grids, and stacked panels, so visually chopped text is detectable.
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content || !fitContentType || !shouldFitContent) {
      clearLiveWidgetSizing(widgetId)
      return
    }
    let raf = 0
    let ready = false
    const readyTimer = window.setTimeout(() => {
      ready = true
      measure()
    }, 360)
    const measure = () => {
      if (!ready) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const ui = content.querySelector<HTMLElement>('.gp-widget-ui')
        if (!ui) return
        const live = useWidgetStore.getState().widgets[widgetId]
        if (!live || live.collapsed || live.iconified) return
        const fallback = {
          ...DEFAULT_SIZING,
          ...widgetDefinition(live.type).sizing,
        }
        const result = measureWidgetContentFloor(ui, live.size, fallback)
        setLiveWidgetSizing(widgetId, result.sizing)
        if (result.growTo.width > live.size.width || result.growTo.height > live.size.height) {
          useWidgetStore.getState().resizeWidget(widgetId, result.growTo)
        }
      })
    }
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(content)
    const mutationObserver = new MutationObserver(measure)
    mutationObserver.observe(content, { childList: true, subtree: true, characterData: true })
    content.addEventListener('input', measure, true)
    content.addEventListener('change', measure, true)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(readyTimer)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      content.removeEventListener('input', measure, true)
      content.removeEventListener('change', measure, true)
      clearLiveWidgetSizing(widgetId)
    }
  }, [fitContentType, shouldFitContent, widgetId])

  // Lazy modules can first appear one frame after the shell. This outer probe
  // is retained as a backstop for a renderer that has not yet declared enough
  // information for the intrinsic floor composer.
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content || !shouldFitContent) return
    let raf = 0
    const fitOverflow = () => {
      const live = useWidgetStore.getState().widgets[widgetId]
      if (!live || live.collapsed || live.iconified) return
      const overflow = Math.ceil(content.scrollHeight - content.clientHeight)
      if (overflow <= 1) return

      const maxHeight = widgetDefinition(live.type).sizing?.maxHeight ?? Infinity
      const height = Math.min(
        maxHeight,
        Math.ceil((live.size.height + overflow + 4) / GRID_SIZE) * GRID_SIZE,
      )
      if (height > live.size.height) {
        useWidgetStore.getState().resizeWidget(widgetId, { ...live.size, height })
      }
    }
    const readyTimer = window.setTimeout(() => {
      raf = requestAnimationFrame(fitOverflow)
    }, 360)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(readyTimer)
    }
  }, [shouldFitContent, widgetId])

  // Trigger title editing when renamed via F2 or external action.
  useEffect(() => {
    if (isRenaming) {
      setTitleEditing(true)
      useWidgetStore.getState().stopRenaming()
    }
  }, [isRenaming])

  if (!widget) return null

  // ── Unified pointer handling on the card body (and capsule for drag) ──────

  const startDrag = (e: ReactPointerEvent<HTMLElement>, isLink: boolean, dragWidgetId = widgetId, snapshotOnMove = true) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    if (isLink) {
      const { pan, zoom } = useCanvasStore.getState()
      linkDragRef.current = {
        pointerId: e.pointerId,
        rafId: 0,
        clientX: e.clientX,
        clientY: e.clientY,
      }
      useWidgetStore.getState().startLinkDrag(
        widgetId,
        { x: (e.clientX - pan.x) / zoom, y: (e.clientY - pan.y) / zoom },
        { x: e.clientX, y: e.clientY },
      )
      return
    }
    activeDragWidgetId.current = dragWidgetId
    groupDropRef.current = { groupId: null, since: 0 }
    dragRef.current = new PointerDragSession(e, {
      onFirstMove: () => { if (snapshotOnMove) useWidgetStore.getState().snapshotHistory() },
      onDelta: (dx, dy) => {
        const st = useWidgetStore.getState()
        const zoom = useCanvasStore.getState().zoom
        st.moveWidget(dragWidgetId, { x: dx, y: dy }, zoom)
        const widget = st.widgets[dragWidgetId]
        if (widget) {
          const gid = findDropGroup(widget, st.groups, st.widgets, st.widgetGroupIndex)
          const now = performance.now()
          const intent = groupDropRef.current
          if (gid !== intent.groupId) {
            groupDropRef.current = { groupId: gid, since: now }
            if (st.dragOverGroupId !== null) st.setDragOverGroupId(null)
          } else if (gid && now - intent.since >= GROUP_DROP_DWELL_MS) {
            if (st.dragOverGroupId !== gid) st.setDragOverGroupId(gid)
          } else if (!gid && st.dragOverGroupId !== null) {
            st.setDragOverGroupId(null)
          }
        }
      },
    })
  }

  // Resolves an active "Link as child of…" gesture the instant this widget is
  // clicked, rather than waiting for pointerup with zero movement — real
  // clicks always carry a pixel or two of jitter, which used to be
  // misread as a drag and silently swallow the link (leaving the picker
  // stuck). Grouped widgets resolve to their group's anchor member so the
  // relation always attaches at the group, never to an individual member.
  const tryCompleteTargetedLink = (): boolean => {
    const state = useWidgetStore.getState()
    const dependencySource = state.dependencyLinkSource
    if (dependencySource) {
      const prerequisiteId = linkAnchorId(state, dependencySource)
      const dependentId = linkAnchorId(state, widgetId)
      if (prerequisiteId !== dependentId) state.addRelation(prerequisiteId, dependentId, 'blocker')
      state.clearDependencyLink()
      return true
    }
    const childSource = state.childLinkSource
    if (!childSource) return false
    const targetId = linkAnchorId(state, widgetId)
    const sourceId = linkAnchorId(state, childSource)
    if (sourceId !== targetId) state.addRelation(targetId, sourceId, 'parent')
    state.clearChildLink()
    return true
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    if (isInteractiveTarget(e.target)) return
    // In focus mode the card is pinned: islands own the pointer, not drags.
    if (isFocused) return
    e.preventDefault()
    e.stopPropagation()
    if (tryCompleteTargetedLink()) return
    if (widget.metadata.locked) {
      useWidgetStore.getState().selectWidget(widgetId, e.shiftKey)
      return
    }
    useWidgetStore.getState().bringWidgetToFront(widgetId)
    if (e.metaKey) {
      // A grouped widget can't be an individual link source — only the
      // group box (GroupPlate) can start a connection for its members.
      if (!groupId) startDrag(e, true)
    } else {
      const state = useWidgetStore.getState()
      if (!e.shiftKey && !state.selectedIds.has(widgetId)) state.selectWidget(widgetId, false)
      if (e.altKey) {
        const [cloneId] = state.duplicateWidgets([widgetId])
        if (cloneId) startDrag(e, false, cloneId, false)
      } else {
        startDrag(e, false)
      }
    }
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
      const sourceAnchor = linkAnchorId(useWidgetStore.getState(), widgetId)
      useWidgetStore.getState().endLinkDrag(targetId !== sourceAnchor ? targetId : null)
      return
    }

    const session = dragRef.current
    if (!session || session.pointerId !== e.pointerId) return
    dragRef.current = null
    const draggedId = activeDragWidgetId.current

    if (!session.end()) {
      groupDropRef.current = { groupId: null, since: 0 }
      useWidgetStore.getState().setDragOverGroupId(null)
      useWidgetStore.getState().selectWidget(draggedId, e.shiftKey)
    } else {
      const state = useWidgetStore.getState()
      const intent = groupDropRef.current
      const liveWidget = state.widgets[draggedId]
      const dropGroupId =
        liveWidget &&
        intent.groupId &&
        state.dragOverGroupId === intent.groupId &&
        performance.now() - intent.since >= GROUP_DROP_DWELL_MS &&
        findDropGroup(liveWidget, state.groups, state.widgets, state.widgetGroupIndex) === intent.groupId
          ? intent.groupId
          : null
      groupDropRef.current = { groupId: null, since: 0 }
      const ids =
        state.selectedIds.has(draggedId) && state.selectedIds.size > 1
          ? [...state.selectedIds]
          : [draggedId]
      state.settleWidgets(ids)
      // Drop into group if hovering over one
      state.setDragOverGroupId(null)
      if (dropGroupId) state.joinGroup(dropGroupId, draggedId)
    }
  }

  const onContextMenu = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const state = useWidgetStore.getState()
    if (!state.selectedIds.has(widgetId)) state.selectWidget(widgetId, false)
    state.openContextMenu(widgetId, e.clientX, e.clientY)
  }

  const onCardKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (isInteractiveTarget(event.target) && event.target !== event.currentTarget) return
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      useWidgetStore.getState().openContextMenu(widgetId, rect.right, rect.top + 20)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      useWidgetStore.getState().startRenaming(widgetId)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      useWidgetStore.getState().clearSelection()
      ;(document.querySelector('[data-canvas-viewport]') as HTMLElement | null)?.focus()
      return
    }
    if (!event.key.startsWith('Arrow')) return
    event.preventDefault()
    const cx = widget.position.x + widget.size.width / 2
    const cy = widget.position.y + widget.size.height / 2
    const candidates = Object.values(useWidgetStore.getState().widgets)
      .filter((other) => other.id !== widgetId && other.canvasId === widget.canvasId)
      .map((other) => {
        const dx = other.position.x + other.size.width / 2 - cx
        const dy = other.position.y + other.size.height / 2 - cy
        const directional = event.key === 'ArrowRight' ? dx > 0 && Math.abs(dy) <= Math.abs(dx) * 1.5 : event.key === 'ArrowLeft' ? dx < 0 && Math.abs(dy) <= Math.abs(dx) * 1.5 : event.key === 'ArrowDown' ? dy > 0 && Math.abs(dx) <= Math.abs(dy) * 1.5 : dy < 0 && Math.abs(dx) <= Math.abs(dy) * 1.5
        return { other, directional, distance: Math.hypot(dx, dy) }
      })
      .filter((item) => item.directional)
      .sort((a, b) => a.distance - b.distance)
    const next = candidates[0]?.other
    if (next) {
      useWidgetStore.getState().selectWidget(next.id, false)
      ;(document.querySelector(`[data-widget-id="${CSS.escape(next.id)}"] article`) as HTMLElement | null)?.focus()
    }
  }

  // ── Resize handle ────────────────────────────────────────────────────────

  const commitScaleState = (resize: ResizeState, target: WidgetScaleState) => {
    if (resize.rafId !== 0) {
      cancelAnimationFrame(resize.rafId)
      resize.rafId = 0
    }
    resize.pending = null
    resize.committed = true
    if (!resize.historyCaptured) {
      useWidgetStore.getState().snapshotHistory()
      resize.historyCaptured = true
    }
    // A state change is a single terminal decision for this drag. Releasing
    // and starting a new gesture is required before another state can change.
    document.body.removeAttribute('data-widget-dragging')
    useWidgetStore.getState().setWidgetScaleState(widgetId, target, true)
  }

  const onResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if (isFocused) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.setAttribute(
      'data-widget-resizing',
      widgetDefinition(widget.type).sizing?.autoHeight ? 'width' : 'both',
    )
    const move = (event: PointerEvent) => onResizePointerMove(event)
    const end = (event: PointerEvent) => onResizePointerEnd(event)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    resizeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: widget.size.width,
      startHeight: widget.size.height,
      state: widget.collapsed ? 'pill' : widget.iconified ? 'icon' : 'full',
      committed: false,
      historyCaptured: false,
      moved: false,
      rafId: 0,
      pending: null,
      disposeWindowListeners: () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
        window.removeEventListener('pointercancel', end)
      },
    }
  }

  const onResizePointerMove = (e: ResizePointerSample) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== e.pointerId || resize.committed) return
    if (!resize.moved) {
      resize.moved = true
      if (resize.state === 'full') {
        useWidgetStore.getState().snapshotHistory()
        resize.historyCaptured = true
      }
      // Suppress the size transition while the handle is held so per-frame
      // resize updates track the pointer exactly (same trick as drags).
      document.body.setAttribute('data-widget-dragging', 'true')
    }
    const zoom = useCanvasStore.getState().zoom
    const dx = (e.clientX - resize.startX) / zoom
    const dy = (e.clientY - resize.startY) / zoom

    if (resize.state === 'pill' || resize.state === 'icon') {
      if (crossedBothScaleAxes(dx, dy)) {
        commitScaleState(resize, resize.state === 'pill' ? 'full' : 'pill')
        return
      }
      if (resize.state === 'pill' && crossedBothScaleAxes(-dx, -dy)) {
        commitScaleState(resize, 'icon')
        return
      }
      return
    }

    const sizing = mergeWidgetSizing(widgetDefinition(widget.type).sizing, getLiveWidgetSizing(widgetId))
    const { minWidth, minHeight, maxWidth, maxHeight } = fullWidgetResizeBounds(sizing, DEFAULT_SIZING)
    // Content-fit widgets: height always follows the content reporter, so the
    // handle only drives width.
    const lockHeight = sizing?.autoHeight === true
    const rawWidth = resize.startWidth + dx
    const rawHeightIntent = resize.startHeight + dy
    const rawHeight = lockHeight ? resize.startHeight : rawHeightIntent

    // Collapsing requires deliberate diagonal shrink intent beyond both live
    // minima. A single-axis shrink or any maximum-bound overscale only clamps.
    if (crossedBothScaleAxes(minWidth - rawWidth, minHeight - rawHeightIntent)) {
      commitScaleState(resize, 'pill')
      return
    }

    resize.pending = {
      width: Math.min(maxWidth, Math.max(minWidth, rawWidth)),
      height: Math.min(maxHeight, Math.max(minHeight, rawHeight)),
    }

    if (resize.rafId === 0) {
      resize.rafId = requestAnimationFrame(() => {
        resize.rafId = 0
        // Free-form while dragging — no grid stepping.
        if (resize.pending) useWidgetStore.getState().resizeWidget(widgetId, resize.pending, false)
      })
    }
  }

  const onResizePointerEnd = (e: Pick<ResizePointerSample, 'pointerId'>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== e.pointerId) return
    resizeRef.current = null
    if (resize.rafId !== 0) cancelAnimationFrame(resize.rafId)
    resize.disposeWindowListeners()
    document.body.removeAttribute('data-widget-dragging')
    document.body.removeAttribute('data-widget-resizing')
    if (resize.moved && !resize.committed && resize.state === 'full') {
      if (resize.pending) useWidgetStore.getState().resizeWidget(widgetId, resize.pending)
      useWidgetStore.getState().settleWidgets([widgetId])
    }
  }

  // ── Data + height ─────────────────────────────────────────────────────────

  const handleDataUpdate = (data: ModuleData) =>
    useWidgetStore.getState().updateWidgetData(widgetId, data)

  const handleHeightChange = (contentHeight: number) => {
    if (widget.collapsed || widget.iconified) return
    const sizing = widgetDefinition(widget.type).sizing
    const snapped = Math.min(
      sizing?.maxHeight ?? Infinity,
      Math.max(GRID_SIZE * 2, Math.ceil((contentHeight + 24) / GRID_SIZE) * GRID_SIZE),
    )
    // Content is allowed to grow a large card, never to make it jitter back
    // and forth as controls mount, animate, or temporarily disappear.
    if (snapped > widget.size.height) {
      useWidgetStore.getState().resizeWidget(widgetId, { ...widget.size, height: snapped })
    }
  }

  const commitTitle = (title: string) => {
    useWidgetStore.getState().updateWidgetTitle(widgetId, title.trim() || 'Widget')
    setTitleEditing(false)
  }

  const collapsed = widget.collapsed === true
  const iconified = widget.iconified === true
  const capsuleHidden = (collapsed || iconified) && !titleEditing
  const def = widgetDefinition(widget.type)
  const Icon = def.icon
  const panelized = PANELIZED_TYPES.has(widget.type) && !collapsed && !iconified
  // Full cards use the slightly squarer backplate radius R0 = 22.
  const widgetRadius = collapsed ? 18 : iconified ? 14 : 22

  return (
    // Positioning lives on this outer wrapper as its own translate3d, kept
    // separate from the card's hover scale/lift below. Browsers compose the
    // `transform` property *before* the independent `scale`/`translate`
    // properties, so putting both on one element made the hover scale's
    // origin resolve near the world origin instead of the card itself —
    // the further a card sat from (0,0), the more it visibly drifted on
    // hover. Splitting them onto nested elements keeps each transform in
    // its own local coordinate space.
    <div
      data-widget-id={widgetId}
      className="gp-widget-layout-motion absolute left-0 top-0"
      style={{
        transform: `translate3d(${widget.position.x}px, ${widget.position.y}px, 0)`,
        width: widget.size.width,
        height: widget.size.height,
        zIndex: widget.metadata.zIndex ?? 0,
      }}
    >
      <article
        ref={articleRef}
        data-widget-id={widgetId}
        data-selected={isSelected || undefined}
        data-focused={isFocused || undefined}
        data-auto-height={def.sizing?.autoHeight || undefined}
        data-link-source={isLinkDragSource || undefined}
        data-panels={panelized || undefined}
        tabIndex={isSelected ? 0 : -1}
        aria-label={`${widget.title}, ${def.label} widget`}
        title={iconified ? widget.title : undefined}
        onClickCapture={(e) => {
          // Enter on the second click before a full-surface child control can
          // consume it. The first click still performs the user's intended
          // control action; the second is reserved for focus, preventing an
          // Add/Toggle/etc. button from firing twice.
          if (e.detail !== 2 || isFocused) return
          e.preventDefault()
          e.stopPropagation()
          if (collapsed || iconified) {
            useWidgetStore.getState().setWidgetScaleState(widgetId, 'full')
            return
          }
          // An expanded card enters focus mode — camera locks on, islands unlock.
          useFocusStore.getState().enterFocus(widgetId)
        }}
        onFocus={() => useWidgetStore.getState().selectWidget(widgetId, false)}
        onKeyDown={onCardKeyDown}
        onPointerEnter={() => useWidgetStore.getState().setHoveredWidgetId(widgetId)}
        onPointerLeave={() => {
          if (useWidgetStore.getState().hoveredWidgetId === widgetId) {
            useWidgetStore.getState().setHoveredWidgetId(null)
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={onContextMenu}
        className={`gp-widget-card gp-card-motion gp-glass group/widget absolute inset-0 flex flex-col ${
          isRecentlySpawned(widgetId) ? 'gp-spawn' : ''
        } ${isFlashing ? 'gp-flash' : ''} ${isBlocked ? 'opacity-60' : 'opacity-100'}`}
        style={{
          borderRadius: widgetRadius,
          cursor: dragRef.current?.moved ? 'grabbing' : 'grab',
          '--gp-widget-accent': widget.metadata.accent ?? def.accent,
          '--gp-widget-radius': `${widgetRadius}px`,
          // No paint containment here: the title capsule, badges, and detach
          // button intentionally overflow the card bounds and would be clipped.
          contain: 'layout style',
        } as CSSProperties}
      >
      {/* AI Hydration Overlay */}
      {widget.isHydrating && (
        <div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-neutral-950/90"
          style={{ borderRadius: collapsed ? 18 : 22 }}
        >
          <div className="relative flex items-center justify-center">
            <Sparkles size={22} className="animate-pulse text-emerald-400" />
            <span className="absolute h-8 w-8 animate-ping rounded-full border border-emerald-500/30 opacity-70" />
          </div>
          <span className="text-[10px] font-semibold text-neutral-300 animate-pulse">AI digesting details...</span>
        </div>
      )}

      {/* Floating editable title capsule — sits above the card border,
          left-aligned to the card edge. Fades out when collapsed: the pill
          body takes over as the title. Lock/favorite share the same row,
          just to the title's right — subtle, revealed on hover, and staying
          visible once toggled on. */}
      <div
        className={`gp-card-chrome pointer-events-none absolute inset-x-0 -top-9 z-20 flex items-center gap-1.5 pl-3 transition-opacity duration-300 ${
          capsuleHidden ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div
          className={`gp-title-capsule flex h-8 min-w-[64px] max-w-[62%] cursor-grab items-center justify-center rounded-full border border-neutral-600 bg-neutral-950/95 px-3 shadow-md active:cursor-grabbing ${
            capsuleHidden ? 'pointer-events-none' : 'pointer-events-auto'
          }`}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            if (titleEditing) return
            e.stopPropagation()
            if (tryCompleteTargetedLink()) return
            startDrag(e, false)
          }}
          onPointerMove={(e) => onPointerMove(e)}
          onPointerUp={(e) => onPointerUp(e)}
          onPointerCancel={(e) => onPointerUp(e)}
        >
          <span
            aria-hidden
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px]"
            style={{
              color: widget.metadata.accent ?? def.accent,
              background: `${widget.metadata.accent ?? def.accent}1c`,
              boxShadow: `inset 0 0 0 1px ${widget.metadata.accent ?? def.accent}30`,
            }}
          >
            <Icon size={10} aria-hidden />
          </span>
          {titleEditing ? (
            <input
              defaultValue={widget.title}
              onBlur={(e) => commitTitle(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle(e.currentTarget.value)
                if (e.key === 'Escape') setTitleEditing(false)
              }}
              onClick={(e) => e.stopPropagation()}
              className="ml-1.5 w-full bg-transparent text-center text-xs font-medium text-neutral-200 outline-none"
              autoFocus
            />
          ) : (
            <span
              className="ml-1.5 max-w-full cursor-text truncate text-xs font-medium text-neutral-300 select-none"
              onDoubleClick={(e) => {
                e.stopPropagation()
                setTitleEditing(true)
              }}
            >
              {widget.title}
            </span>
          )}
        </div>

        <div
          className={`pointer-events-auto flex items-center gap-1 transition-opacity duration-200 ${
            widget.metadata.locked || widget.metadata.favorite
              ? 'opacity-100'
              : 'opacity-0 group-hover/widget:opacity-100 focus-within:opacity-100'
          }`}
        >
          <button
            type="button"
            aria-label={widget.metadata.favorite ? 'Remove from favorites' : 'Favorite widget'}
            aria-pressed={!!widget.metadata.favorite}
            onClick={(e) => {
              e.stopPropagation()
              useWidgetStore.getState().toggleWidgetFavorite(widgetId)
            }}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-neutral-950/90 transition-colors ${
              widget.metadata.favorite
                ? 'border-amber-400/50 text-amber-300'
                : 'border-neutral-700/70 text-neutral-500 hover:text-amber-200'
            }`}
          >
            <Star size={10} aria-hidden fill={widget.metadata.favorite ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            aria-label={widget.metadata.locked ? 'Unlock widget' : 'Lock widget'}
            aria-pressed={!!widget.metadata.locked}
            onClick={(e) => {
              e.stopPropagation()
              useWidgetStore.getState().toggleWidgetLocked(widgetId)
            }}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-neutral-950/90 transition-colors ${
              widget.metadata.locked
                ? 'border-neutral-500 text-neutral-300'
                : 'border-neutral-700/70 text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {widget.metadata.locked ? (
              <UnlockKeyhole size={10} aria-hidden />
            ) : (
              <LockKeyhole size={10} aria-hidden />
            )}
          </button>
        </div>
      </div>

      {/* Collapsed pill title — lives inside the body so the pill IS the widget */}
      <div
        aria-hidden={!collapsed}
        className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-1.5 px-4 transition-opacity duration-300 ${
          collapsed ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <Icon size={12} className="shrink-0" style={{ color: def.accent }} aria-hidden />
        <span
          className="truncate text-xs font-medium text-neutral-200 select-none"
        >
          {widget.title}
        </span>
      </div>

      {/* Icon mode keeps one unmistakable identity mark and no partial UI. */}
      <div
        aria-hidden={!iconified}
        className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-300 ${
          iconified ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <Icon size={28} style={{ color: def.accent }} aria-hidden />
      </div>

      {/* Dependency explainer — dimming alone doesn't say why a card is muted */}
      {isBlocked && (
        <div className="pointer-events-none absolute -bottom-2.5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-amber-500/40 bg-neutral-950/95 px-2 py-0.5 shadow-md">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span className="font-mono text-[9px] font-medium uppercase tracking-wide text-amber-300">
            Waiting on dependency
          </span>
        </div>
      )}

      {/* Widget content — fades out for dormant collapsed cards.
          Panelized widgets carry their own glass subpanels, so the shell padding tightens. */}
      <div
        ref={contentRef}
        className={`gp-widget-content flex-1 overflow-hidden rounded-[20px] p-2.5 transition-opacity duration-300 ${
          collapsed || iconified ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      >
        <ErrorBoundary
          key={widget.id}
          fallback={(retry) => (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
              <TriangleAlert size={18} className="text-amber-400" aria-hidden />
              <p className="text-[11px] text-neutral-500">This widget failed to render.</p>
              <button
                type="button"
                onClick={retry}
                className="rounded-md border gp-hairline px-2 py-1 text-[11px] text-neutral-300 hover:bg-neutral-800"
              >
                Try again
              </button>
            </div>
          )}
        >
          <WidgetRenderer
            widget={widget}
            onUpdate={handleDataUpdate}
            onHeightChange={handleHeightChange}
          />
        </ErrorBoundary>
      </div>

      <div
        role="presentation"
        title={collapsed || iconified ? 'Drag to expand' : def.sizing?.autoHeight ? 'Resize width' : 'Resize'}
        onPointerDown={onResizePointerDown}
        className="gp-card-chrome gp-resize-handle absolute bottom-2 right-2 z-20 h-3 w-3 cursor-nwse-resize"
      />

      {groupId && groupColor && (
        <button
          type="button"
          title="Detach from group"
          aria-label="Detach from group"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.stopPropagation()
            useWidgetStore.getState().removeFromGroup(groupId, widgetId)
          }}
          className="gp-card-chrome absolute -right-2 top-2 z-30 flex h-7 w-7 scale-95 items-center justify-center rounded-full border bg-neutral-950/95 text-neutral-200 opacity-0 shadow-lg transition hover:scale-100 focus:scale-100 focus:opacity-100 group-hover/widget:opacity-100"
          style={{
            borderColor: `${groupColor}80`,
            boxShadow: `0 0 0 1px ${groupColor}1f, 0 8px 24px rgba(0,0,0,0.35)`,
          }}
        >
          <Unlink size={12} aria-hidden />
        </button>
      )}

      {!groupId && (
        <button
          type="button"
          title="Drag to connect"
          aria-label={`Connect ${widget.title} to another widget`}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            event.stopPropagation()
            startDrag(event, true)
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="gp-card-chrome absolute -right-2 top-1/2 z-30 flex h-4 w-4 -translate-y-1/2 scale-75 items-center justify-center rounded-full border border-violet-300/55 bg-neutral-950 text-violet-200 opacity-0 shadow-[0_0_14px_rgba(167,139,250,.45)] transition group-hover/widget:scale-100 group-hover/widget:opacity-100 focus:scale-100 focus:opacity-100"
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-violet-300" />
        </button>
      )}

      <FloatingBadges widgetId={widgetId} />
      <PortRail widgetId={widgetId} />
      <FocusModeLayer
        widgetId={widgetId}
        hostRef={articleRef}
        active={isFocused}
        layout={widget.metadata.islandLayout}
        version={widget.data}
      />
      </article>
    </div>
  )
})
