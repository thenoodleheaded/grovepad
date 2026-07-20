import { memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Check, Maximize2, Plus, Sparkles, Star, Trash2, TriangleAlert, Unlink, Pin, Copy, FileText } from 'lucide-react'
import { ErrorBoundary } from '../ErrorBoundary'
import { useCanvasStore } from '../../store/useCanvasStore'
import { isRecentlySpawned, useWidgetStore } from '../../store/useWidgetStore'
import { useFocusStore } from '../../store/useFocusStore'
import { requestWidgetDeletion } from '../../store/useWidgetDeletionDialogStore'
import type { ModuleData } from '../../types/spatial'
import { GRID_SIZE } from '../../types/spatial'
import {
  groupAtWorldPoint,
  groupWorldBoundsExcluding,
  WIDGET_HOVER_RIGHT,
  WIDGET_HOVER_TOP,
  worldRectContainsPoint,
} from '../../utils/groupGeometry'
import type { WorldRect } from '../../utils/canvasView'
import { linkAnchorId, resolveLinkTargetAt } from '../../utils/linkTarget'
import { PointerDragSession } from '../../utils/pointerDrag'
import {
  beginDragDisplacement,
  cancelDragDisplacement,
  endDragDisplacement,
  setDragDisplacementSuppressed,
  updateDragDisplacement,
  useDragDisplacementStore,
} from '../../store/dragDisplacement'
import { movedIdsForWidget } from '../../store/widgetCollection'
import { contentFitHeight } from '../../utils/widgetContentFloor'
import { widgetHasButtonOverflow } from '../../utils/widgetButtonLayout'
import { widgetToMarkdown } from '../../utils/widgetMarkdown'
import { DEFAULT_SIZING, widgetDefinition } from '../../widgets/registry'
import { FloatingBadges } from './FloatingBadges'
import { FocusModeLayer } from './FocusModeLayer'
import { PortRail } from './PortRail'
import { WidgetModePill } from './WidgetModePill'
import { useWidgetModeSwitch } from './useWidgetModeSwitch'
import { dependencyStatusLabel } from '../../utils/dependencyGeometry'
import { WidgetRenderer } from './WidgetRenderer'
import { useContentFloor } from './useContentFloor'
import { useWidgetResize } from './useWidgetResize'
import { useWidgetMagneticHover } from './useWidgetMagneticHover'
import { useAdaptiveInputStore } from '../../store/useAdaptiveInputStore'
import { treeRevealDelay } from '../../store/treeReveal'
import {
  pressWithinResizeCorner,
  resolveWidgetPointerIntent,
  shouldEnterWidgetEditFocus,
  usesAdditiveWidgetSelection,
} from '../../utils/widgetPointerPolicy'

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

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.tagName === 'BUTTON' ||
    target.closest('[data-widget-interactive="true"]') !== null ||
    target.closest('button') !== null
  )
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.closest('[contenteditable="true"]') !== null
  )
}

export const WidgetCard = memo(function WidgetCard({ widgetId }: WidgetCardProps) {
  const widget = useWidgetStore((state) => state.widgets[widgetId])
  const isBlocked = useWidgetStore((state) => state.blockedWidgetIds.has(widgetId))
  const blockerNames = useWidgetStore((state) => Object.values(state.relations)
    .filter((relation) => relation.type === 'blocker' && !relation.isResolved && relation.toId === widgetId)
    .map((relation) => state.widgets[relation.fromId]?.title)
    .filter((title): title is string => Boolean(title))
    .join(', '))
  const isLinkDragSource = useWidgetStore((state) => state.linkDrag?.sourceId === widgetId)
  const isSelected = useWidgetStore((state) => state.selectedIds.has(widgetId))
  const isFocused = useFocusStore((state) => state.focusedWidgetId === widgetId)
  const focusPurpose = useFocusStore((state) => state.focusPurpose)
  const focusedWidgetId = useFocusStore((state) => state.focusedWidgetId)
  const isFocusBackground = focusedWidgetId !== null && focusedWidgetId !== widgetId
  const isFlashing = useWidgetStore((state) => state.flashWidgetId === widgetId)
  const groupId = useWidgetStore((state) => state.widgetGroupIndex[widgetId])
  const groupColor = useWidgetStore((state) => {
    const gid = state.widgetGroupIndex[widgetId]
    return gid ? state.groups[gid]?.color : undefined
  })

  const ghostOffset = useDragDisplacementStore((state) => state.offsets[widgetId])
  const settlePending = useDragDisplacementStore((state) => state.pendingSettleIds.has(widgetId))
  const isRenaming = useWidgetStore((state) => state.renamingWidgetId === widgetId)
  const [titleEditing, setTitleEditing] = useState(false)
  const lastTitleClickRef = useRef(0)
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false)
  const dragRef = useRef<PointerDragSession | null>(null)
  const linkDragRef = useRef<LinkDragState | null>(null)
  const activeDragWidgetId = useRef(widgetId)
  const activeSelectionAdditive = useRef(false)
  const dragOriginGroupId = useRef<string | null>(null)
  const dragOriginGroupRetention = useRef<WorldRect | null>(null)
  const layoutRef = useRef<HTMLDivElement | null>(null)
  const articleRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const shouldFitContent = Boolean(widget && !widget.collapsed && !widget.iconified)
  const fitContentType = widget?.type

  const { onResizePointerDown } = useWidgetResize(widgetId, widget, isFocused)
  useContentFloor(widgetId, contentRef, fitContentType, shouldFitContent)
  const magneticHover = useWidgetMagneticHover(
    articleRef,
    layoutRef,
    isFocused || isFocusBackground || Boolean(widget?.metadata?.locked),
  )

  // Trigger title editing when renamed via F2 or external action.
  useEffect(() => {
    if (isRenaming) {
      setTitleEditing(true)
      useWidgetStore.getState().stopRenaming()
    }
  }, [isRenaming])

  // Click outside to close the custom action '+' dropdown
  useEffect(() => {
    if (!isAddMenuOpen) return
    const closeMenu = () => setIsAddMenuOpen(false)
    window.addEventListener('pointerdown', closeMenu)
    return () => window.removeEventListener('pointerdown', closeMenu)
  }, [isAddMenuOpen])

  const modeSwitch = useWidgetModeSwitch(widget ? widget.collapsed === true || widget.iconified === true : false)

  if (!widget) return null

  // ── Unified pointer handling on the card body (and capsule for drag) ──────

  const startDrag = (e: ReactPointerEvent<HTMLElement>, isLink: boolean, dragWidgetId = widgetId, snapshotOnMove = true) => {
    // Direct manipulation owns the camera from this point forward. Stop any
    // earlier fit/navigation tween so history cannot appear to move the board
    // while a widget gesture is being committed or reversed.
    useCanvasStore.getState().cancelViewAnimation()
    e.currentTarget.setPointerCapture(e.pointerId)
    if (isLink) {
      magneticHover.suspend()
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
    magneticHover.beginDrag()
    beginDragDisplacement()
    activeDragWidgetId.current = dragWidgetId
    const state = useWidgetStore.getState()
    const originGroupId = state.widgetGroupIndex[dragWidgetId] ?? null
    dragOriginGroupId.current = originGroupId
    dragOriginGroupRetention.current = originGroupId
      ? groupWorldBoundsExcluding(state.groups[originGroupId]!, state.widgets, dragWidgetId)
      : null
    dragRef.current = new PointerDragSession(e, {
      onFirstMove: () => { if (snapshotOnMove) useWidgetStore.getState().snapshotHistory() },
      onDelta: (dx, dy) => {
        const st = useWidgetStore.getState()
        const zoom = useCanvasStore.getState().zoom
        st.moveWidget(dragWidgetId, { x: dx, y: dy }, zoom, {
          moveSelection: !st.widgetGroupIndex[dragWidgetId],
        })
        const fresh = useWidgetStore.getState()
        const movingIds = (fresh.widgetGroupIndex[dragWidgetId]
          ? [dragWidgetId]
          : movedIdsForWidget(dragWidgetId, fresh.selectedIds, fresh.widgets)
        ).filter((id) => !fresh.widgets[id]?.metadata.locked)
        const safeZoom = zoom > 0 ? zoom : 1
        updateDragDisplacement(movingIds, { x: dx / safeZoom, y: dy / safeZoom })
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
    const isModifier = e.shiftKey || e.metaKey || e.ctrlKey || e.altKey
    const interactionMode = useAdaptiveInputStore.getState().interactionMode
    const linkingState = useWidgetStore.getState()
    // The corner handle's pointer-events wake only on :hover, so a press that
    // arrives together with the approach lands on the card instead and would
    // silently become a move. Route corner presses back to the resize gesture.
    if (
      !isFocused &&
      !isModifier &&
      widget.metadata.locked !== true &&
      e.pointerType !== 'touch' &&
      !linkingState.childLinkSource &&
      !linkingState.dependencyLinkSource &&
      !isInteractiveTarget(e.target) &&
      pressWithinResizeCorner(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY)
    ) {
      magneticHover.suspend()
      onResizePointerDown(e)
      return
    }
    const intent = resolveWidgetPointerIntent({
      pointerType: e.pointerType,
      interactionMode,
      isInteractiveTarget: isInteractiveTarget(e.target),
      isFocused,
      isLocked: widget.metadata.locked === true,
      hasModifier: isModifier,
      wantsLink: e.metaKey,
      isGrouped: Boolean(groupId),
      isTargetingLink: Boolean(
        linkingState.childLinkSource || linkingState.dependencyLinkSource,
      ),
    })
    if (intent === 'ignore') return
    e.preventDefault()
    e.stopPropagation()
    if (intent === 'target-link') {
      tryCompleteTargetedLink()
      return
    }
    const additive = usesAdditiveWidgetSelection(e.pointerType, interactionMode, e.shiftKey)
    if (intent === 'select') {
      useWidgetStore.getState().selectWidget(widgetId, additive)
      return
    }
    useWidgetStore.getState().bringWidgetToFront(widgetId)
    if (intent === 'link') {
      // A grouped widget can't be an individual link source — only the
      // group box (GroupPlate) can start a connection for its members.
      startDrag(e, true)
    } else {
      const state = useWidgetStore.getState()
      activeSelectionAdditive.current = additive
      if (!additive && !state.selectedIds.has(widgetId)) state.selectWidget(widgetId, false)
      startDrag(e, false)
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const link = linkDragRef.current
    if (link && link.pointerId === e.pointerId) {
      magneticHover.suspend()
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
    const session = dragRef.current
    if (!session && !widget.metadata.locked) magneticHover.move(e)
    session?.move(e)
    if (session?.moved) {
      const state = useWidgetStore.getState()
      const dragged = state.widgets[activeDragWidgetId.current]
      if (dragged) {
        const { pan, zoom } = useCanvasStore.getState()
        const dropGroupId = groupAtWorldPoint(
          { x: (e.clientX - pan.x) / zoom, y: (e.clientY - pan.y) / zoom },
          state.groups,
          state.widgets,
          { canvasId: dragged.canvasId, excludeGroupId: state.widgetGroupIndex[dragged.id] },
        )
        state.setDragOverGroupId(dropGroupId)
        const pointerWorld = {
          x: (e.clientX - pan.x) / zoom,
          y: (e.clientY - pan.y) / zoom,
        }
        const shouldDetach = Boolean(
          dragOriginGroupId.current &&
          !dropGroupId &&
          !worldRectContainsPoint(dragOriginGroupRetention.current, pointerWorld),
        )
        layoutRef.current?.toggleAttribute('data-detach-intent', shouldDetach)
        // Over a plate the gesture means "join this group"; inside the origin
        // group's retention bounds it means "rearrange within" — displacement
        // must stand down for both so glass hover stays unambiguous.
        setDragDisplacementSuppressed(
          Boolean(dropGroupId) || Boolean(dragOriginGroupId.current && !shouldDetach),
        )
      }
    }
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
      cancelDragDisplacement()
      useWidgetStore.getState().setDragOverGroupId(null)
      useWidgetStore.getState().selectWidget(draggedId, activeSelectionAdditive.current)
    } else {
      const state = useWidgetStore.getState()
      const liveWidget = state.widgets[draggedId]
      const { pan, zoom } = useCanvasStore.getState()
      const dropGroupId = liveWidget
        ? groupAtWorldPoint(
            { x: (e.clientX - pan.x) / zoom, y: (e.clientY - pan.y) / zoom },
            state.groups,
            state.widgets,
            { canvasId: liveWidget.canvasId, excludeGroupId: state.widgetGroupIndex[draggedId] },
          )
        : null
      state.setDragOverGroupId(null)
      // The preview becomes real exactly at drop: displaced neighbors take
      // their ghost positions inside the same history step the first-move
      // snapshot opened, then the settle pass resolves whatever the
      // budget left overlapped.
      const ghostOffsets = endDragDisplacement()
      if (Object.keys(ghostOffsets).length > 0) state.applyGhostDisplacement(ghostOffsets)
      const originGroupId = dragOriginGroupId.current
      const shouldDetach = layoutRef.current?.hasAttribute('data-detach-intent') === true
      if (dropGroupId) {
        // Joining keeps the cursor-selected position and never repacks or
        // collision-shifts the group's existing members.
        state.snapWidgetToGrid(draggedId)
        state.joinGroup(dropGroupId, draggedId)
      } else if (originGroupId && shouldDetach) {
        state.snapWidgetToGrid(draggedId)
        state.removeFromGroup(originGroupId, draggedId, {
          skipHistory: true,
          preservePosition: true,
        })
        state.settleWidgets([draggedId])
      } else {
        const ids =
          state.widgetGroupIndex[draggedId]
            ? [draggedId]
            : state.selectedIds.has(draggedId) && state.selectedIds.size > 1
            ? [...state.selectedIds]
            : [draggedId]
        state.settleWidgets(ids)
      }
    }
    layoutRef.current?.removeAttribute('data-detach-intent')
    dragOriginGroupId.current = null
    dragOriginGroupRetention.current = null
    magneticHover.endDrag(e)
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
    const draggedId = activeDragWidgetId.current
    const state = useWidgetStore.getState()
    state.setDragOverGroupId(null)
    layoutRef.current?.removeAttribute('data-detach-intent')
    dragOriginGroupId.current = null
    dragOriginGroupRetention.current = null
    if (!session.end()) {
      magneticHover.endDrag()
      return
    }
    const ids =
      state.widgetGroupIndex[draggedId]
        ? [draggedId]
        : state.selectedIds.has(draggedId) && state.selectedIds.size > 1
        ? [...state.selectedIds]
        : [draggedId]
    state.settleWidgets(ids)
    magneticHover.endDrag()
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

  // ── Data + height ─────────────────────────────────────────────────────────

  const handleDataUpdate = (data: ModuleData) =>
    useWidgetStore.getState().updateWidgetData(widgetId, data, {
      // Typing and sliders should coalesce; every completed ink/erase gesture
      // is a discrete physical action and must have its own Undo step.
      coalesceHistory: widget.type !== 'sketchpad',
    })

  const handleHeightChange = (contentHeight: number) => {
    if (widget.collapsed || widget.iconified) return
    const sizing = widgetDefinition(widget.type).sizing
    const fittedHeight = contentFitHeight(
      contentHeight,
      sizing?.minHeight ?? DEFAULT_SIZING.minHeight,
      sizing?.autoHeight ? sizing.maxHeight ?? Infinity : sizing?.maxHeight ?? DEFAULT_SIZING.maxHeight,
      24,
      GRID_SIZE,
    )
    // A content-owned axis converges to its natural height in either direction.
    // Other widgets retain the grow-only rule so transient controls cannot
    // make a manually sized card jitter smaller.
    if (sizing?.autoHeight ? fittedHeight !== widget.size.height : fittedHeight > widget.size.height) {
      useWidgetStore.getState().resizeWidget(widgetId, { ...widget.size, height: fittedHeight })
    }
  }

  const enterPreferredFocus = () => {
    const hasArrangeableContent = Boolean(
      articleRef.current?.querySelector('.gp-island, [data-island]'),
    )
    useFocusStore.getState().enterFocus(
      widgetId,
      hasArrangeableContent ? 'layout' : 'edit',
    )
  }

  const commitTitle = (title: string) => {
    useWidgetStore.getState().updateWidgetTitle(widgetId, title.trim() || 'Widget')
    setTitleEditing(false)
  }

  const copyAsMarkdown = () => {
    navigator.clipboard.writeText(widgetToMarkdown(widget))
  }

  const isButtonActive = (btnId: string) => {
    switch (btnId) {
      case 'completed':
        return widget.metadata.showDoneCheckbox ?? (widget.type === 'checklist')
      case 'pin':
        return !!widget.metadata.showPinButton || !!widget.metadata.locked
      case 'favorite':
        return widget.metadata.showFavoriteButton !== false || !!widget.metadata.favorite
      case 'focus':
        return widget.metadata.showFocusButton !== false
      case 'duplicate':
        return !!widget.metadata.showDuplicateButton
      case 'markdown':
        return !!widget.metadata.showMarkdownButton
      case 'delete':
        return widget.metadata.showDeleteButton !== false
      default:
        return false
    }
  }

  const toggleButtonVisibility = (btnId: string) => {
    switch (btnId) {
      case 'completed':
        useWidgetStore.getState().updateWidgetMetadata(widgetId, {
          showDoneCheckbox: !isButtonActive('completed')
        })
        break
      case 'pin':
        useWidgetStore.getState().updateWidgetMetadata(widgetId, {
          showPinButton: !isButtonActive('pin')
        })
        break
      case 'favorite':
        useWidgetStore.getState().updateWidgetMetadata(widgetId, {
          showFavoriteButton: !isButtonActive('favorite')
        })
        break
      case 'focus':
        useWidgetStore.getState().updateWidgetMetadata(widgetId, {
          showFocusButton: !isButtonActive('focus')
        })
        break
      case 'duplicate':
        useWidgetStore.getState().updateWidgetMetadata(widgetId, {
          showDuplicateButton: !isButtonActive('duplicate')
        })
        break
      case 'markdown':
        useWidgetStore.getState().updateWidgetMetadata(widgetId, {
          showMarkdownButton: !isButtonActive('markdown')
        })
        break
      case 'delete':
        useWidgetStore.getState().updateWidgetMetadata(widgetId, {
          showDeleteButton: !isButtonActive('delete')
        })
        break
    }
  }

  const handleButtonClick = (btnId: string) => {
    if (isAddMenuOpen) {
      toggleButtonVisibility(btnId)
    } else {
      if (btnId === 'completed') {
        const nextVal = !widget.metadata.completed
        useWidgetStore.getState().updateWidgetMetadata(widgetId, { completed: nextVal })
      } else if (btnId === 'pin') {
        useWidgetStore.getState().toggleWidgetLocked(widgetId)
      } else if (btnId === 'focus') {
        enterPreferredFocus()
      } else if (btnId === 'favorite') {
        useWidgetStore.getState().toggleWidgetFavorite(widgetId)
      } else if (btnId === 'duplicate') {
        useWidgetStore.getState().duplicateWidgets([widgetId])
      } else if (btnId === 'markdown') {
        copyAsMarkdown()
      } else if (btnId === 'delete') {
        requestWidgetDeletion(widgetId)
      }
    }
  }

  const getButtonStyle = (btnId: string, isMenuOpen: boolean): CSSProperties => {
    const active = isButtonActive(btnId)
    const accentColor = widget.metadata.accent ?? def.accent
    
    if (isMenuOpen) {
      if (active) {
        return { color: accentColor }
      }
    } else {
      const isToggled = 
        (btnId === 'completed' && widget.metadata.completed) ||
        (btnId === 'pin' && widget.metadata.locked) ||
        (btnId === 'favorite' && widget.metadata.favorite)
      if (isToggled) {
        return { color: accentColor }
      }
    }
    return {}
  }

  const getButtonClass = (btnId: string, isMenuOpen: boolean) => {
    const active = isButtonActive(btnId)
    let base = "flex h-[34px] w-[34px] items-center justify-center shrink-0 rounded-full transition-all duration-300 ease-out filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0"
    
    if (isMenuOpen) {
      if (!active) {
        base += " text-neutral-600/40 hover:text-neutral-400/60"
      }
    } else {
      const isToggled = 
        (btnId === 'completed' && widget.metadata.completed) ||
        (btnId === 'pin' && widget.metadata.locked) ||
        (btnId === 'favorite' && widget.metadata.favorite)
      if (!isToggled) {
        base += " text-neutral-400 hover:text-neutral-200"
      }
    }
    return base
  }

  const collapsed = widget.collapsed === true
  const iconified = widget.iconified === true
  const capsuleHidden = (collapsed || iconified) && !titleEditing
  const def = widgetDefinition(widget.type)
  const treeRevealMs = treeRevealDelay('widget', widgetId)
  const Icon = def.icon
  const panelized = PANELIZED_TYPES.has(widget.type) && !collapsed && !iconified
  // Full cards use the slightly squarer backplate radius R0 = 22.
  const widgetRadius = collapsed ? 18 : iconified ? 14 : 22
  // Whether this card's own button cluster overflows the title row into the
  // vertical column past the right edge — the hover catch-all only reaches
  // that extra half-cell when there's real chrome out there to cover.
  const hasButtonOverflow = widgetHasButtonOverflow(widget, Boolean(groupId))

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
      ref={layoutRef}
      data-widget-id={widgetId}
      data-ghost-displaced={ghostOffset ? true : undefined}
      data-settle-pending={settlePending || undefined}
      className="gp-widget-layout-motion group/widget-shell absolute left-0 top-0"
      style={{
        // The ghost offset rides on the same positioning transform: displaced
        // cards preview their post-drop spot without their stored position
        // (or anything downstream of it) changing until commit.
        transform: `translate3d(${widget.position.x + (ghostOffset?.x ?? 0)}px, ${
          widget.position.y + (ghostOffset?.y ?? 0)
        }px, 0)`,
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
        data-focus-purpose={isFocused ? focusPurpose ?? undefined : undefined}
        data-auto-height={def.sizing?.autoHeight || undefined}
        data-link-source={isLinkDragSource || undefined}
        data-locked={widget.metadata.locked || undefined}
        data-blocked={isBlocked || undefined}
        data-panels={panelized || undefined}
        data-grouped={groupId || undefined}
        tabIndex={isSelected || isFocused ? 0 : -1}
        inert={isFocusBackground ? true : undefined}
        aria-hidden={isFocusBackground || undefined}
        aria-label={`${widget.title}, ${def.label} widget`}
        title={iconified ? widget.title : undefined}
        onClickCapture={(e) => {
          // Enter on the second click before a full-surface child control can
          // consume it. The first click still performs the user's intended
          // control action; the second is reserved for focus, preventing an
          // Add/Toggle/etc. button from firing twice.
          if (e.detail !== 2 || isFocused || isInteractiveTarget(e.target)) return
          e.preventDefault()
          e.stopPropagation()
          if (collapsed || iconified) {
            useWidgetStore.getState().setWidgetScaleState(widgetId, 'full')
            return
          }
          // An expanded island-based card enters layout focus. Flat widgets
          // (Notes, Quote, single-field composers) have nothing to arrange,
          // so their same gesture opens useful content editing instead.
          enterPreferredFocus()
        }}
        onPointerDownCapture={(event) => {
          const target = event.target
          const linkState = useWidgetStore.getState()
          if (shouldEnterWidgetEditFocus({
            pointerType: event.pointerType,
            interactionMode: useAdaptiveInputStore.getState().interactionMode,
            isInteractiveTarget: isInteractiveTarget(target),
            isTextEntryTarget: isTextEntryTarget(target),
            isInsideContent:
              target instanceof Element && target.closest('.gp-widget-content') !== null,
            isAlreadyFocused: isFocused,
            isTargetingLink: Boolean(
              linkState.childLinkSource || linkState.dependencyLinkSource,
            ),
          })) {
            useFocusStore.getState().enterFocus(widgetId, 'edit')
          }
        }}
        onFocus={() => useWidgetStore.getState().selectWidget(widgetId, false)}
        onKeyDown={onCardKeyDown}
        onPointerEnter={(event) => {
          if (widget.metadata.locked) return
          useWidgetStore.getState().setHoveredWidgetId(widgetId)
          magneticHover.enter(event)
        }}
        onPointerLeave={() => {
          if (widget.metadata.locked) return
          magneticHover.leave()
          if (useWidgetStore.getState().hoveredWidgetId === widgetId) {
            useWidgetStore.getState().setHoveredWidgetId(null)
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
        onContextMenu={onContextMenu}
        className={`gp-widget-card gp-card-motion group/widget absolute inset-0 flex flex-col ${
          groupId ? 'gp-island gp-grouped-widget' : 'gp-glass gp-backplate'
        } ${
          treeRevealMs !== null ? 'gp-tree-widget-reveal' : isRecentlySpawned(widgetId) ? 'gp-spawn' : ''
        } ${
          widget.metadata.completed ? 'opacity-55 saturate-50' : ''
        } ${isFlashing ? 'gp-flash' : ''}`}
        style={{
          borderRadius: widgetRadius,
          cursor: dragRef.current?.moved ? 'grabbing' : 'grab',
          '--gp-widget-accent': widget.metadata.accent ?? def.accent,
          '--gp-widget-radius': `${widgetRadius}px`,
          '--gp-tree-reveal-delay': `${treeRevealMs ?? 0}ms`,
          // No paint containment here: the title capsule, badges, and detach
          // button intentionally overflow the card bounds and would be clipped.
          contain: 'layout style',
        } as CSSProperties}
      >
      {/* Hover catch-all — one gapless rectangle so group-hover chrome
          (favorite/lock row, mode pill) never flickers as the cursor moves
          between the card and the chrome that floats outside its own box.
          It cannot reuse the shell's own box (`layoutRef`) for this: that
          box is also the reference rect for the magnetic-hover tilt effect,
          and enlarging it would throw off that geometry. So this is a
          separate, invisible, lowest-stacked layer sized to the card plus
          half a grid cell above (the title spot, always) and half a cell to
          the right (only when the button cluster actually overflows there —
          otherwise there's no chrome to cover and no reason to widen the hit
          area). Everything real renders after it in DOM order, so it only
          ever "shows through" hit-testing in that empty margin, never
          stealing a click from actual chrome or content. */}
      <div
        aria-hidden
        className="pointer-events-auto absolute"
        style={{ top: -WIDGET_HOVER_TOP, left: 0, right: hasButtonOverflow ? -WIDGET_HOVER_RIGHT : 0, bottom: 0 }}
      />

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

      {/* Dynamic wrapping logic for top row vs right column */}
      {(() => {
        // Estimate title width dynamically based on typical character widths (7px for text-xs font-bold)
        // Icon takes 40px cell. Input takes w-24 (96px). Truncation limits it to 200px.
        const estimatedTitleWidth = titleEditing ? 96 : Math.min(200, widget.title.length * 7)
        const titleAreaWidthResting = 40 + 4 + estimatedTitleWidth + 8
        const titleAreaCells = Math.ceil(titleAreaWidthResting / 40)
        const titleAreaWidth = titleAreaCells * 40
        const maxHorizontalSpace = widget.size.width - titleAreaWidth
        const maxHorizontalCount = Math.max(0, Math.floor(maxHorizontalSpace / 40))
        
        const allButtons = [
          { id: 'completed', icon: Check, label: 'Completed' },
          { id: 'pin', icon: Pin, label: 'Pin' },
          { id: 'focus', icon: Maximize2, label: 'Focus' },
          { id: 'favorite', icon: Star, label: 'Favorite' },
          { id: 'duplicate', icon: Copy, label: 'Duplicate' },
          { id: 'markdown', icon: FileText, label: 'Markdown' },
          { id: 'delete', icon: Trash2, label: 'Delete' },
        ]

        // Define the sequence of elements to render based on the menu state
        type SequenceItem = { id: string, type: 'button' | 'detach' | 'plus' }
        let renderSequence: SequenceItem[] = []

        if (isAddMenuOpen) {
          // When open, Detach is hidden. All buttons are visible in order.
          renderSequence = allButtons.map(b => ({ id: b.id, type: 'button' }))
          renderSequence.push({ id: 'plus', type: 'plus' })
        } else {
          // When closed, only active buttons + Detach (if present) + Plus are visible.
          renderSequence = allButtons.filter(b => isButtonActive(b.id)).map(b => ({ id: b.id, type: 'button' }))
          if (groupId && groupColor) {
            renderSequence.push({ id: 'detach', type: 'detach' })
          }
          renderSequence.push({ id: 'plus', type: 'plus' })
        }

        // Helper to get position of any element by its index in the flow sequence
        const getPosForIndex = (index: number) => {
          if (index < maxHorizontalCount) {
            return { x: titleAreaWidth + index * 40, y: 0 }
          } else {
            const verticalIndex = index - maxHorizontalCount
            // Shift to hug the rounded 22px card corners down the right side
            const shift = verticalIndex === 0 ? -7 : verticalIndex === 1 ? -2 : 0
            return { x: widget.size.width + 6 + shift, y: (verticalIndex + 1) * 40 }
          }
        }

        // The position where the Plus button sits when the menu is closed
        const closedPlusIndex = allButtons.filter(b => isButtonActive(b.id)).length + (groupId && groupColor ? 1 : 0)
        const closedPlusPos = getPosForIndex(closedPlusIndex)

        // Unified layout resolving engine
        const resolvePosition = (id: string, type: 'button' | 'detach' | 'plus') => {
          const indexInRender = renderSequence.findIndex(item => item.id === id && item.type === type)
          if (indexInRender !== -1) {
            return getPosForIndex(indexInRender) // It is visible and assigned a slot in the grid sequence
          } else {
            return closedPlusPos // It is hidden! It perfectly hides inside the closed Plus button's position!
          }
        }

        return (
          <>
            <div
              inert={collapsed || iconified ? true : undefined}
              aria-hidden={collapsed || iconified || undefined}
              className={`gp-card-chrome pointer-events-none absolute bottom-full left-0 right-0 z-20 h-10 transition-opacity duration-300 ${
                capsuleHidden ? 'opacity-0' : 'opacity-100'
              }`}
            >
              <div
                className={`gp-widget-move-handle gp-touch-target absolute left-0 top-0 h-10 flex items-center select-none ${
                  widget.metadata.locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
                } ${capsuleHidden ? 'pointer-events-none' : 'pointer-events-auto'}`}
                style={{ width: `${titleAreaWidth}px` }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return
                  if (titleEditing) return
                  
                  // Manual double-click detection (needed because e.preventDefault() here blocks onDoubleClick event)
                  const now = Date.now()
                  if (now - lastTitleClickRef.current < 250) {
                    e.preventDefault()
                    e.stopPropagation()
                    setTitleEditing(true)
                    return
                  }
                  lastTitleClickRef.current = now

                  e.preventDefault()
                  e.stopPropagation()
                  if (tryCompleteTargetedLink()) return
                  if (widget.metadata.locked) {
                    useWidgetStore.getState().selectWidget(widgetId, false)
                    return
                  }
                  useWidgetStore.getState().bringWidgetToFront(widgetId)
                  if (!useWidgetStore.getState().selectedIds.has(widgetId)) {
                    useWidgetStore.getState().selectWidget(widgetId, false)
                  }
                  activeSelectionAdditive.current = false
                  startDrag(e, false)
                }}
                onPointerMove={(e) => onPointerMove(e)}
                onPointerUp={(e) => onPointerUp(e)}
                onPointerCancel={(e) => onPointerCancel(e)}
                onLostPointerCapture={(e) => onPointerCancel(e)}
              >
                {/* Naked Title Icon: occupies exactly 70% of 40px cell (28px) */}
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px]"
                    style={{
                      color: widget.metadata.accent ?? def.accent,
                      background: `${widget.metadata.accent ?? def.accent}1c`,
                      boxShadow: `inset 0 0 0 1px ${widget.metadata.accent ?? def.accent}30`,
                    }}
                  >
                    <Icon size={14} aria-hidden />
                  </span>
                </div>

                {/* Title Text / Edit Input: begins precisely at Cell 1 (40px) */}
                {titleEditing ? (
                  <input
                    aria-label="Widget title"
                    defaultValue={widget.title}
                    onBlur={(e) => commitTitle(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitTitle(e.currentTarget.value)
                      if (e.key === 'Escape') setTitleEditing(false)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="h-7 bg-transparent ml-1 text-xs font-bold text-neutral-200 outline-none w-24 border-b border-neutral-600 pointer-events-auto"
                    autoFocus
                  />
                ) : (
                  <span
                    className={`max-w-[200px] truncate ml-1 text-xs font-bold transition-all ${
                      widget.metadata.completed ? 'line-through text-neutral-500' : 'text-neutral-200'
                    }`}
                  >
                    {widget.title}
                  </span>
                )}
              </div>

              {/* Engine-powered absolutely positioned customizable buttons */}
              {allButtons.map((btn) => {
                const IconComponent = btn.icon
                const isActive = isButtonActive(btn.id)
                const isVisible = isAddMenuOpen || isActive
                const pos = resolvePosition(btn.id, 'button')
                
                return (
                  <div 
                    key={btn.id}
                    className={`gp-card-action absolute top-0 w-10 h-10 flex items-center justify-center transition-all duration-300 ease-out z-30 ${isVisible ? 'pointer-events-auto' : 'pointer-events-none'}`}
                    style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
                  >
                    <button
                      type="button"
                      title={isAddMenuOpen ? `Toggle ${btn.label} Button Persistence` : btn.label}
                      aria-label={btn.label}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleButtonClick(btn.id)
                      }}
                      className={`${getButtonClass(btn.id, isAddMenuOpen)} transition-all duration-300 ease-out ${
                        isVisible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                      }`}
                      style={getButtonStyle(btn.id, isAddMenuOpen)}
                    >
                      <IconComponent size={15} className={btn.id === 'pin' ? 'rotate-45' : undefined} fill={btn.id === 'favorite' && widget.metadata.favorite && !isAddMenuOpen ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                )
              })}

              {/* Detach Group Button */}
              {groupId && groupColor && (
                <div 
                  className={`gp-card-action absolute top-0 w-10 h-10 flex items-center justify-center transition-all duration-300 ease-out z-30 ${!isAddMenuOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
                  style={{ transform: `translate(${resolvePosition('detach', 'detach').x}px, ${resolvePosition('detach', 'detach').y}px)` }}
                >
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
                    className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center text-neutral-400 transition-all duration-300 ease-out hover:text-neutral-200 filter drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)] outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                      !isAddMenuOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                    }`}
                  >
                    <Unlink size={15} aria-hidden style={{ color: groupColor }} />
                  </button>
                </div>
              )}

              {/* Plus '+' Toggle Button */}
              <div
                className="gp-card-action absolute top-0 w-10 h-10 flex items-center justify-center transition-all duration-300 ease-out z-40 pointer-events-auto"
                style={{ transform: `translate(${resolvePosition('plus', 'plus').x}px, ${resolvePosition('plus', 'plus').y}px)` }}
              >
                <button
                  type="button"
                  aria-label="Customize header buttons"
                  title="Customize header buttons"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsAddMenuOpen(!isAddMenuOpen)
                  }}
                  className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center transition-colors filter drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)] outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                    isAddMenuOpen ? '' : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                  style={isAddMenuOpen ? { color: widget.metadata.accent ?? def.accent } : undefined}
                >
                  <Plus size={15} className={`transition-transform duration-200 ${isAddMenuOpen ? 'rotate-45' : ''}`} aria-hidden />
                </button>
              </div>
            </div>
          </>
        )
      })()}

      {def.modes && def.modes.length > 0 && (
        <WidgetModePill
          mode={(widget.data as { mode: string }).mode}
          options={def.modes}
          hidden={capsuleHidden}
          open={modeSwitch.open}
          onClose={() => modeSwitch.setOpen(false)}
          plateRef={modeSwitch.plateRef}
          onChange={(nextMode) => {
            useWidgetStore.getState().updateWidgetData(widgetId, { ...widget.data, mode: nextMode } as ModuleData)
          }}
        />
      )}

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
        <div aria-label={`${widget.title} is blocked by ${blockerNames || 'an unresolved dependency'}`} className="pointer-events-none absolute -bottom-2.5 left-1/2 z-20 flex max-w-[90%] -translate-x-1/2 items-center gap-1 rounded-full border border-amber-500/40 bg-neutral-950/95 px-2 py-0.5 shadow-md">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span className="truncate  text-[9px] font-medium uppercase tracking-wide text-amber-300">
            {dependencyStatusLabel(widget.title, blockerNames ? blockerNames.split(', ') : [])}
          </span>
        </div>
      )}

      {/* Widget content — fades out for dormant collapsed cards.
          Panelized widgets carry their own glass subpanels, so the shell padding tightens. */}
      <div
        ref={contentRef}
        inert={collapsed || iconified ? true : undefined}
        aria-hidden={collapsed || iconified || undefined}
        className={`gp-widget-content flex-1 overflow-hidden rounded-[20px] p-2.5 transition-opacity duration-300 ${
          collapsed || iconified ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        onFocusCapture={(event) => {
          if (
            !isFocused &&
            useAdaptiveInputStore.getState().capabilities.viewportClass !== 'desktop' &&
            event.target instanceof HTMLElement &&
            (event.target.matches('input, textarea, select, [contenteditable="true"]') ||
              event.target.isContentEditable)
          ) {
            useFocusStore.getState().enterFocus(widgetId, 'edit')
          }
        }}
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
        onPointerDown={(event) => {
          magneticHover.suspend()
          onResizePointerDown(event)
        }}
        className="gp-card-chrome gp-widget-resize-target absolute bottom-2 right-2 z-20 h-[13px] w-[13px] cursor-nwse-resize"
      >
        <span className="gp-resize-handle pointer-events-none absolute bottom-0 right-0 h-[13px] w-[13px]" />
      </div>

      {!groupId && !collapsed && !iconified && (
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
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={onPointerCancel}
          className="gp-card-chrome pointer-events-none absolute -right-3.5 top-1/2 z-30 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-violet-200 opacity-0 transition group-hover/widget:pointer-events-auto group-hover/widget:opacity-100 focus:pointer-events-auto focus:opacity-100"
        >
          <span aria-hidden className="relative h-3 w-3 rounded-full border border-violet-300/55 bg-neutral-950 shadow-[0_0_14px_rgba(167,139,250,.45)] after:absolute after:inset-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-violet-300" />
        </button>
      )}

      <FloatingBadges widgetId={widgetId} />
      <PortRail widgetId={widgetId} />
      <FocusModeLayer
        widgetId={widgetId}
        hostRef={articleRef}
        active={isFocused}
        layoutActive={focusPurpose === 'layout'}
        layout={widget.metadata.islandLayout}
        version={widget.data}
      />
      </article>
    </div>
  )
})
