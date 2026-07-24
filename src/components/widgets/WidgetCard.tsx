import { memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Check, Plus, Sparkles, Star, Trash2, TriangleAlert, Pin, Copy, FileText } from 'lucide-react'
import { ErrorBoundary } from '../ErrorBoundary'
import { useCanvasStore } from '../../store/useCanvasStore'
import { isRecentlySpawned, useWidgetStore } from '../../store/useWidgetStore'
import { requestWidgetDeletion } from '../../store/useWidgetDeletionDialogStore'
import type { ModuleData } from '../../types/spatial'
import { GRID_SIZE, WIDGET_MAX_EDGE } from '../../types/spatial'
import { WIDGET_HOVER_RIGHT, WIDGET_HOVER_TOP } from '../../utils/widgetBounds'
import {
  findGlueSnap,
  glueBoxRect,
  GLUE_MIN_OVERLAP,
  GLUE_SEAM_MAX,
  pulledFreeOfCluster,
} from '../../utils/glueGeometry'
import { resolveLinkTargetAt } from '../../utils/linkTarget'
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
import { usesStrictRelations } from '../../utils/relationPolicy'
import {
  expansionOffsetFor,
  isWidgetRestExpanded,
  isWidgetResting,
  REST_TRANSITION_MS,
  restExpansionOffset,
  restingTileSize,
} from '../../utils/widgetRest'
import { restingFace } from '../../utils/restingFace'
import { useTransientValue } from '../../hooks/useTransientValue'
import { useWidgetClock } from '../../hooks/useWidgetClock'
import { WidgetClockRing } from './WidgetClockRing'
import { useWidgetRestStore } from '../../store/useWidgetRestStore'
import { isWidgetSizingGestureActive } from '../../store/widgetSizingGesture'
import { widgetHasButtonOverflow } from '../../utils/widgetButtonLayout'
import { widgetToMarkdown } from '../../utils/widgetMarkdown'
import { DEFAULT_SIZING, widgetDefinition } from '../../widgets/registry'
import { FloatingBadges } from './FloatingBadges'
import { PortRail } from './PortRail'
import { WidgetSkinRoller } from './WidgetSkinRoller'
import { currentSkin, dataWearingSkin, skinsFor, widgetAccent } from '../../utils/widgetSkins'
import { setCollaborativeEditingWidget } from '../../collaboration/collaborationController'
import { useWidgetSkinSwitch } from './useWidgetSkinSwitch'
import { dependencyStatusLabel } from '../../utils/dependencyGeometry'
import { WidgetRenderer } from './WidgetRenderer'
import { WidgetRestingFace } from './WidgetRestingFace'
import { useContentFloor } from './useContentFloor'
import { useWidgetResize } from './useWidgetResize'
import { useWidgetMagneticHover } from './useWidgetMagneticHover'
import { useAdaptiveInputStore } from '../../store/useAdaptiveInputStore'
import { treeRevealDelay } from '../../store/treeReveal'
import {
  isInteractiveWidgetTarget,
  resolveWidgetPointerIntent,
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

const isInteractiveTarget = isInteractiveWidgetTarget

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
  const isFlashing = useWidgetStore((state) => state.flashWidgetId === widgetId)
  // An option-drag has pulled this glued widget past glue range — release now
  // and it comes off. Drives the dashed "letting go" outline.
  const hasUnglueIntent = useWidgetStore((state) => state.unglueIntentWidgetId === widgetId)
  // This card is the target an option-drag would weld to right now — glows so
  // the near-invisible seam preview is not the only "about to glue" cue.
  const isGlueTarget = useWidgetStore((state) => state.glueIntent?.targetId === widgetId)
  // A clustermate is welded directly onto this card's top edge, so this card's
  // own title label — which floats half a cell above the card — would land on
  // that neighbour. Suppress it; the topmost card carries the cluster's title.
  const hasGluedNeighborAbove = useWidgetStore((state) => {
    const glueId = state.widgetGlueIndex[widgetId]
    if (!glueId) return false
    const self = state.widgets[widgetId]
    if (!self) return false
    const members = state.glues[glueId]?.widgetIds ?? []
    const selfBox = glueBoxRect(self)
    for (const memberId of members) {
      if (memberId === widgetId) continue
      const other = state.widgets[memberId]
      if (!other) continue
      const box = glueBoxRect(other)
      const gapY = selfBox.y - (box.y + box.height)
      const overlapX =
        Math.min(selfBox.x + selfBox.width, box.x + box.width) - Math.max(selfBox.x, box.x)
      if (gapY >= -2 && gapY <= GLUE_SEAM_MAX && overlapX >= GLUE_MIN_OVERLAP) return true
    }
    return false
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
  // Option-drag: the glue gesture. The grabbed widget moves alone (its
  // cluster stays put) and the drag continuously reads as "about to weld"
  // (within a cell of a target) or "pulling free" (past a cell from every
  // clustermate).
  const glueDragRef = useRef(false)
  const layoutRef = useRef<HTMLDivElement | null>(null)
  const articleRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const expandedWidgetId = useWidgetRestStore((state) => state.expandedWidgetId)
  const expandedOffset = useWidgetRestStore((state) => state.expandedOffset)
  const restCtx = { expandedWidgetId, expandedOffset }
  const resting = Boolean(widget && isWidgetResting(widget, restCtx))
  const restExpanded = Boolean(widget && isWidgetRestExpanded(widget, restCtx))
  // An expanded card floats above *everything else* — and "everything" is a
  // moving target, because bring-to-front grows zIndex metadata without bound.
  // So the lift is one past the live top of the board, never a constant a
  // well-travelled board could out-climb. Computed only for the expanded card;
  // every other card selects a cheap 0.
  const restLiftZ = useWidgetStore((state) =>
    expandedWidgetId === widgetId
      ? Object.values(state.widgets).reduce((top, w) => Math.max(top, w.metadata.zIndex ?? 0), 0) + 1
      : 0,
  )
  // The tile this card rests as. Also the box the face keeps while fading, so
  // an expanding card doesn't stretch its own outgoing face on the way out.
  const restTile = widget && (resting || restExpanded) ? restingTileSize(widget) : null
  // The box actually on screen: the resting tile when one shows, otherwise the
  // stored card. The outline gesture measures itself against what the user can
  // see, never against a dormant size hiding behind a tile.
  const onScreenSize = (resting && restTile ? restTile : widget?.size) ?? { width: 0, height: 0 }
  // Resting swaps a mounted content subtree for the resting face. Holding the
  // outgoing content for one layout beat lets the two cross-fade instead of
  // the content vanishing the instant the box starts shrinking.
  const [contentLingering, holdContent] = useTransientValue(false)
  const wasRestingRef = useRef(resting)
  useEffect(() => {
    if (resting && !wasRestingRef.current) holdContent(true, REST_TRANSITION_MS)
    wasRestingRef.current = resting
  }, [resting, holdContent])
  // The expanded card's blur halo outlives the expansion by one layout beat so
  // it can fade out alongside the card's collapse glide instead of vanishing
  // the frame the slot clears. The stacking lift is held for the same beat, or
  // the fading halo would drop beneath the neighbours it is still covering.
  const [haloLingering, holdHalo] = useTransientValue(false)
  const wasRestExpandedRef = useRef(restExpanded)
  useEffect(() => {
    if (!restExpanded && wasRestExpandedRef.current) holdHalo(true, REST_TRANSITION_MS)
    wasRestExpandedRef.current = restExpanded
  }, [restExpanded, holdHalo])
  // No content mounts while resting, so the content-floor pass must not run
  // (it would read an absent element and try to shrink the dormant full size).
  const shouldFitContent = Boolean(widget && !widget.iconified && !resting)
  const fitContentType = widget?.type

  // The face model decides the tile's box AND its chrome exceptions: an icon
  // face is a bare 2×2 icon cell, an image face is a glassless photograph that
  // keeps its resize handle at rest.
  const restFaceKind = widget && resting ? restingFace(widget).model.kind : null
  const restIcon = restFaceKind === 'icon'
  const restImage = restFaceKind === 'image'

  // A timer wears its remaining phase as marks around its own outline — the
  // card becomes the dial, at every scale state including the resting tile.
  const clock = useWidgetClock(widget)

  // Opening a card centres it on the tile it replaces. The offset is captured
  // here, once, and then held for the life of the expansion — see the note on
  // `expandedOffset` in useWidgetRestStore for why it must not be re-derived.
  const expandFromRest = () => {
    const live = useWidgetStore.getState().widgets[widgetId]
    if (!live) return
    useWidgetRestStore.getState().expandWidget(
      widgetId,
      expansionOffsetFor(restingTileSize(live), live.size),
      { kind: 'rest' },
    )
  }

  // A plain click on an icon opens the widget, exactly like a click on a
  // resting tile. The scale-state change lands the resting tile centred where
  // the icon sat, and the ephemeral expansion then opens the card out of that
  // tile, so the thing you pressed stays under the pointer throughout. The
  // icon being left — exact square included — is captured as the expansion's
  // origin: closing the card folds it back into that very icon, so for a card
  // that takes the expansion slot the scale change skips history (the
  // open-and-close pair nets to no edit at all).
  const expandFromIcon = () => {
    const store = useWidgetStore.getState()
    const live = store.widgets[widgetId]
    if (!live?.iconified) return
    const origin = { kind: 'icon', size: live.size } as const
    const willRest =
      widgetDefinition(live.type).restingFace !== false &&
      live.metadata.pinned !== true
    // A card the resting system doesn't govern never collapses back, so its
    // opening stays a durable, undoable scale change like before.
    store.setWidgetScaleState(widgetId, 'full', { skipHistory: willRest })
    const restored = useWidgetStore.getState().widgets[widgetId]
    if (!restored || restored.iconified) return
    // A widget that doesn't rest is already fully open at its stored box; the
    // expansion slot is only for cards that would otherwise sit as a tile.
    if (willRest) {
      useWidgetRestStore.getState().expandWidget(
        widgetId,
        expansionOffsetFor(restingTileSize(restored), restored.size),
        origin,
      )
    }
  }

  const edgeResize = useWidgetResize(widgetId, widget, {
    resting,
    restingImage: restImage,
    effectiveSize: onScreenSize,
    elementRef: articleRef,
    restExpanded,
    // Hold the magnetic lift exactly where it is for the length of a scale,
    // instead of dropping it and letting the card snap back to centre.
    onGestureStart: () => magneticHover.hold(),
    onGestureEnd: () => magneticHover.release(),
    onEdgeClick: () => {
      // The outline was pressed but never dragged, so honour what the press
      // would have meant on the card body itself.
      useWidgetStore.getState().selectWidget(widgetId, false)
      if (resting) expandFromRest()
      else if (widget?.iconified) expandFromIcon()
    },
  })
  useContentFloor(widgetId, contentRef, fitContentType, shouldFitContent)
  const magneticHover = useWidgetMagneticHover(
    articleRef,
    layoutRef,
    Boolean(widget?.metadata?.locked),
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

  const skinSwitch = useWidgetSkinSwitch(widget ? widget.iconified === true : false)

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
    dragRef.current = new PointerDragSession(e, {
      onFirstMove: () => {
        if (snapshotOnMove) useWidgetStore.getState().snapshotHistory()
      },
      onDelta: (dx, dy) => {
        const st = useWidgetStore.getState()
        const zoom = useCanvasStore.getState().zoom
        st.moveWidget(
          dragWidgetId,
          { x: dx, y: dy },
          zoom,
          glueDragRef.current ? { soloGlued: true, moveSelection: false } : undefined,
        )
        const fresh = useWidgetStore.getState()
        // What actually moved: the solo widget in an option-drag, otherwise
        // the selection expanded through every touched glue cluster (the same
        // expansion moveWidget applied).
        const movingIds = (glueDragRef.current
          ? [dragWidgetId]
          : movedIdsForWidget(dragWidgetId, fresh.selectedIds, fresh.widgets).flatMap((id) => {
              const glueId = fresh.widgetGlueIndex[id]
              return glueId ? fresh.glues[glueId]?.widgetIds ?? [id] : [id]
            })
        ).filter((id, index, all) => all.indexOf(id) === index && !fresh.widgets[id]?.metadata.locked)
        const safeZoom = zoom > 0 ? zoom : 1
        updateDragDisplacement(movingIds, { x: dx / safeZoom, y: dy / safeZoom })
      },
    })
  }

  // Resolves an active "Link as child of…" gesture the instant this widget is
  // clicked, rather than waiting for pointerup with zero movement — real
  // clicks always carry a pixel or two of jitter, which used to be
  // misread as a drag and silently swallow the link (leaving the picker
  // stuck).
  const tryCompleteTargetedLink = (): boolean => {
    const state = useWidgetStore.getState()
    const dependencySource = state.dependencyLinkSource
    if (dependencySource) {
      if (dependencySource !== widgetId) state.addRelation(dependencySource, widgetId, 'blocker')
      state.clearDependencyLink()
      return true
    }
    const childSource = state.childLinkSource
    if (!childSource) return false
    const targetId = widgetId
    const sourceId = childSource
    const source = state.widgets[sourceId]
    const strict = usesStrictRelations(state.canvases[source?.canvasId ?? state.activeCanvasId])
    if (sourceId !== targetId) {
      state.addRelation(strict ? targetId : sourceId, strict ? sourceId : targetId, 'parent')
    }
    state.clearChildLink()
    return true
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    const isModifier = e.shiftKey || e.metaKey || e.ctrlKey || e.altKey
    const interactionMode = useAdaptiveInputStore.getState().interactionMode
    const linkingState = useWidgetStore.getState()
    // The outline owns any press that lands on it. It answers before the move
    // gesture so approaching an edge and pressing in one motion resizes rather
    // than silently dragging the card away.
    if (
      !isModifier &&
      widget.metadata.locked !== true &&
      !linkingState.childLinkSource &&
      !linkingState.dependencyLinkSource &&
      !isInteractiveTarget(e.target)
    ) {
      // Only a press the outline actually takes may drop the magnetic offset.
      // Suspending before knowing that reset the lift on *every* grab, so a
      // card visibly snapped back to its unlifted position the instant it was
      // picked up. An ordinary drag keeps the offset: `freeze` (capture phase)
      // pins it under the finger and `beginDrag` carries it through the drag.
      if (edgeResize.onEdgePointerDown(e)) return
    }
    const intent = resolveWidgetPointerIntent({
      pointerType: e.pointerType,
      interactionMode,
      isInteractiveTarget: isInteractiveTarget(e.target),
      isLocked: widget.metadata.locked === true,
      hasModifier: isModifier,
      wantsLink: e.metaKey,
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
      startDrag(e, true)
    } else {
      const state = useWidgetStore.getState()
      activeSelectionAdditive.current = additive
      glueDragRef.current = e.altKey
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
    if (session?.moved && glueDragRef.current) {
      // The option-drag continuously answers "what would release do?": weld
      // to the nearest facing widget within a cell, pull free of the cluster
      // past a cell, or nothing yet. The seam layer previews the answer.
      const state = useWidgetStore.getState()
      const dragged = state.widgets[activeDragWidgetId.current]
      if (dragged) {
        const snap = findGlueSnap(dragged, state.widgets)
        state.setGlueIntent(
          snap
            ? {
                draggedId: dragged.id,
                targetId: snap.targetId,
                position: snap.position,
                axis: snap.axis,
              }
            : null,
        )
        const glueId = state.widgetGlueIndex[dragged.id]
        const members = glueId ? state.glues[glueId]?.widgetIds ?? [] : []
        const pullingFree =
          !snap && members.length > 0 && pulledFreeOfCluster(dragged, members, state.widgets)
        state.setUnglueIntentWidgetId(pullingFree ? dragged.id : null)
        // While the gesture is about to weld, neighbors must not scatter.
        setDragDisplacementSuppressed(Boolean(snap))
      }
    }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const link = linkDragRef.current
    if (link && link.pointerId === e.pointerId) {
      if (link.rafId !== 0) cancelAnimationFrame(link.rafId)
      linkDragRef.current = null
      const targetId = resolveLinkTargetAt(e.clientX, e.clientY)
      useWidgetStore.getState().endLinkDrag(targetId !== widgetId ? targetId : null)
      return
    }

    const session = dragRef.current
    if (!session || session.pointerId !== e.pointerId) return
    dragRef.current = null
    const draggedId = activeDragWidgetId.current

    if (!session.end()) {
      cancelDragDisplacement()
      useWidgetStore.getState().selectWidget(draggedId, activeSelectionAdditive.current)
      // A stationary click on a resting face summons the full card. Ephemeral
      // view state only — accordion, no history, nothing persisted. A click
      // on an icon opens the widget the same way (that one is a real state
      // change, so it carries its own undo step).
      if (resting && draggedId === widgetId) {
        expandFromRest()
      } else if (widget.iconified && draggedId === widgetId) {
        expandFromIcon()
      }
    } else {
      const state = useWidgetStore.getState()
      const liveWidget = state.widgets[draggedId]
      // The preview becomes real exactly at drop: displaced neighbors take
      // their ghost positions inside the same history step the first-move
      // snapshot opened, then the settle pass resolves whatever the
      // budget left overlapped.
      const ghostOffsets = endDragDisplacement()
      if (Object.keys(ghostOffsets).length > 0) state.applyGhostDisplacement(ghostOffsets)
      // Option-drag resolution: the weld the preview promised, or the pull-off
      // the distance implied. Both ride the drag's history step.
      if (glueDragRef.current) {
        if (state.glueIntent?.draggedId === draggedId) {
          state.commitGlue()
        } else if (state.unglueIntentWidgetId === draggedId) {
          state.unglueWidget(draggedId, { skipHistory: true })
        }
      }
      const settled = useWidgetStore.getState()
      const ids =
        !glueDragRef.current && settled.selectedIds.has(draggedId) && settled.selectedIds.size > 1
          ? [...settled.selectedIds]
          : [draggedId]
      // Icon placement snaps only when a real move is released. Keeping
      // this out of the shared settle path means resizing, cancellation,
      // and other layout passes do not unexpectedly move the icon.
      if (liveWidget?.iconified && !settled.widgetGlueIndex[draggedId]) state.snapWidgetToGrid(draggedId)
      settled.settleWidgets(ids)
    }
    useWidgetStore.getState().setGlueIntent(null)
    useWidgetStore.getState().setUnglueIntentWidgetId(null)
    glueDragRef.current = false
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
    state.setGlueIntent(null)
    state.setUnglueIntentWidgetId(null)
    glueDragRef.current = false
    if (!session.end()) {
      magneticHover.endDrag()
      return
    }
    const ids =
      state.selectedIds.has(draggedId) && state.selectedIds.size > 1
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
    if (widget.iconified) return
    // While the outline is being dragged the pointer is the sole author of
    // this card's box. A shrink reflows the content taller, and answering that
    // here would grow the card back between two frames of the drag — the card
    // trading sizes with the gesture at pointer speed.
    if (isWidgetSizingGestureActive(widgetId)) return
    const sizing = widgetDefinition(widget.type).sizing
    const fittedHeight = contentFitHeight(
      contentHeight,
      sizing?.minHeight ?? DEFAULT_SIZING.minHeight,
      // The absolute ceiling binds the content reporter too: without it an
      // autoHeight card kept proposing a taller box than the store would ever
      // accept, so every render re-fired a resize that could not land.
      Math.min(
        WIDGET_MAX_EDGE,
        sizing?.autoHeight ? sizing.maxHeight ?? WIDGET_MAX_EDGE : sizing?.maxHeight ?? DEFAULT_SIZING.maxHeight,
      ),
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
      case 'favorite':
        return widget.metadata.showFavoriteButton !== false || !!widget.metadata.favorite
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
      case 'favorite':
        useWidgetStore.getState().updateWidgetMetadata(widgetId, {
          showFavoriteButton: !isButtonActive('favorite')
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

  // Pinning hands the card a permanent open state, so it no longer needs the
  // single ephemeral expansion slot — release it first, or the accordion keeps
  // a member that can never collapse. The control lives on its own as a
  // floating pill above the expanded card rather than in the customize row.
  // (Position locking is a separate thing, in the right-click menu.)
  const togglePin = () => {
    if (!widget.metadata.pinned && expandedWidgetId === widgetId) {
      // Pin means "hold this card open", so the slot is released WITHOUT the
      // fold-back to the expansion's origin — restoring it would iconify the
      // very card being pinned. The view offset the expansion was drawn at is
      // handed to the pin action instead: pinned cards draw at their stored
      // position, so absorbing the offset there keeps the card exactly where
      // the user sees it rather than jumping diagonally back to the anchor.
      const absorbOffset = useWidgetRestStore.getState().expandedOffset
      useWidgetRestStore.getState().collapseWidget({ restoreOrigin: false })
      useWidgetStore.getState().toggleWidgetPinned(widgetId, { absorbOffset })
      return
    }
    useWidgetStore.getState().toggleWidgetPinned(widgetId)
  }

  const handleButtonClick = (btnId: string) => {
    if (isAddMenuOpen) {
      toggleButtonVisibility(btnId)
    } else {
      if (btnId === 'completed') {
        const nextVal = !widget.metadata.completed
        useWidgetStore.getState().updateWidgetMetadata(widgetId, { completed: nextVal })
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
    const accentColor = cardAccent
    
    if (isMenuOpen) {
      if (active) {
        return { color: accentColor }
      }
    } else {
      const isToggled =
        (btnId === 'completed' && widget.metadata.completed) ||
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
        (btnId === 'favorite' && widget.metadata.favorite)
      if (!isToggled) {
        base += " text-neutral-400 hover:text-neutral-200"
      }
    }
    return base
  }

  const iconified = widget.iconified === true
  // The resting tile is its own identity — the floating capsule would repeat it.
  // The capsule stays visible while resting: it IS the tile's identity (icon
  // + name), so the face below spends every pixel on data instead.
  // Icon-face resting tiles hide it too: the tile IS the icon, and a floating
  // name capsule wider than the icon cell would defeat the shrink entirely.
  const capsuleHidden = (iconified || restIcon) && !titleEditing
  // A card welded below a clustermate hides its floating title too — it would
  // otherwise land on the neighbour above. Renaming (F2) still forces it back.
  const titleChromeHidden = capsuleHidden || (hasGluedNeighborAbove && !titleEditing)
  const def = widgetDefinition(widget.type)
  const treeRevealMs = treeRevealDelay('widget', widgetId)
  const Icon = def.icon
  // One skin is not a choice: the icon stays a plain identity mark rather than
  // a button that opens a roller with nothing to roll to.
  const skins = skinsFor(widget, def)
  const activeSkin = skins.length > 1 ? currentSkin(widget, def) : null
  // The skin owns the card's hue — icon tile, resting tile, aura, buttons.
  const cardAccent = widgetAccent(widget, def)
  const panelized = PANELIZED_TYPES.has(widget.type) && !iconified
  // Full cards use the slightly squarer backplate radius R0 = 22. The bare
  // icon cell rounds a little further; the glassless image sits at 12.
  // An icon can be scaled 2×2 → 3×3, so its corner and glyph track its edge
  // rather than sitting at one hardcoded size that only suits the floor.
  const iconLike = iconified
  const iconEdge = iconified
    ? Math.min(widget.size.width, widget.size.height)
    : 0
  // The glyph that stands for the widget in ANY icon state — the minimized
  // icon square, the bare-icon resting tile empty widgets fall back to, and the
  // drag chip. It fills a generous share of whichever box it sits in, so an
  // icon reads as an icon from across the board rather than a tiny mark.
  const iconGlyphBox = iconEdge > 0
    ? iconEdge
    : restIcon && restTile
      ? Math.min(restTile.width, restTile.height)
      : 0
  const iconGlyphSize = iconGlyphBox > 0 ? Math.round(iconGlyphBox * 0.52) : 20
  const widgetRadius = restIcon
    ? 16
    : restImage
      ? 12
      : resting
        ? 18
        : iconLike
          ? Math.round(iconEdge * 0.26)
          : 22
  const effectiveSize = resting && restTile ? restTile : widget.size
  // The offset this card opened with: it grows out of the middle of its own
  // tile, so the thing you pressed stays put instead of the card unfolding
  // down-and-right. Captured once at expansion and held still after that, so
  // resizing an open card moves only the side you grabbed. View-only —
  // `widget.position` never moves.
  const restOffset = restExpansionOffset(widget, restCtx)
  // Whether this card's own button cluster overflows the title row into the
  // vertical column past the right edge — the hover catch-all only reaches
  // that extra half-cell when there's real chrome out there to cover.
  const hasButtonOverflow = widgetHasButtonOverflow(widget)

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
      data-unglue-intent={hasUnglueIntent || undefined}
      data-glue-target={isGlueTarget || undefined}
      data-settle-pending={settlePending || undefined}
      className="gp-widget-layout-motion group/widget-shell absolute left-0 top-0"
      style={{
        // The ghost offset rides on the same positioning transform: displaced
        // cards preview their post-drop spot without their stored position
        // (or anything downstream of it) changing until commit.
        transform: `translate3d(${
          widget.position.x + (ghostOffset?.x ?? 0) + restOffset.x
        }px, ${
          widget.position.y + (ghostOffset?.y ?? 0) + restOffset.y
        }px, 0)`,
        width: effectiveSize.width,
        height: effectiveSize.height,
        // An ephemerally expanded card floats above resting neighbors it
        // overlaps — expansion is a view, so it never displaces the layout.
        // The lift tracks the board's live top (restLiftZ) with 320 as the
        // floor, and holds through the collapse glide while the halo fades.
        zIndex: restExpanded || haloLingering ? Math.max(320, restLiftZ) : widget.metadata.zIndex ?? 0,
      }}
    >
      {(restExpanded || haloLingering) && (
        /* The floor shadow under the expanded card: a ring of backdrop blur
           reaching three grid cells past every edge, riding this lifted
           wrapper so it sits ON TOP of every neighbouring widget. Painted
           before the article in DOM order, so the card itself stays crisp. */
        <div
          aria-hidden
          className="gp-rest-halo"
          data-halo-out={!restExpanded || undefined}
        />
      )}
      <article
        ref={articleRef}
        data-widget-id={widgetId}
        data-selected={isSelected || undefined}
        data-auto-height={def.sizing?.autoHeight || undefined}
        data-link-source={isLinkDragSource || undefined}
        data-locked={widget.metadata.locked || undefined}
        data-blocked={isBlocked || undefined}
        data-panels={panelized || undefined}
        data-resting={resting || undefined}
        data-rest-face={restFaceKind ?? undefined}
        data-rest-expanded={restExpanded || undefined}
        data-resize-edge={edgeResize.resizeEdgeAttribute}
        tabIndex={isSelected ? 0 : -1}
        aria-label={`${widget.title}, ${def.label} widget`}
        title={iconified || restIcon ? widget.title : undefined}
        onClickCapture={(e) => {
          // A double-click on an iconified card expands it before a
          // full-surface child control can consume the second click. (A plain
          // click already opens via the pointer-up path; this stays as the
          // safety net for presses that a child control swallowed.)
          if (e.detail !== 2 || isInteractiveTarget(e.target)) return
          if (!iconified) return
          e.preventDefault()
          e.stopPropagation()
          expandFromIcon()
        }}
        // Capture phase: this must run for presses on the card's own controls
        // too, before the magnetic offset can slide them out from under the
        // pointer and turn the click into a no-op.
        onPointerDownCapture={() => magneticHover.freeze()}
        onFocus={() => useWidgetStore.getState().selectWidget(widgetId, false)}
        onKeyDown={onCardKeyDown}
        onPointerEnter={(event) => {
          if (widget.metadata.locked) return
          useWidgetStore.getState().setHoveredWidgetId(widgetId)
          magneticHover.enter(event)
        }}
        onPointerLeave={() => {
          edgeResize.onEdgeHoverLeave()
          if (widget.metadata.locked) return
          magneticHover.leave()
          if (useWidgetStore.getState().hoveredWidgetId === widgetId) {
            useWidgetStore.getState().setHoveredWidgetId(null)
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={(event) => {
          edgeResize.onEdgeHoverMove(event)
          onPointerMove(event)
        }}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
        onContextMenu={onContextMenu}
        className={`gp-widget-card gp-card-motion group/widget absolute inset-0 flex flex-col gp-glass gp-backplate ${
          treeRevealMs !== null ? 'gp-tree-widget-reveal' : isRecentlySpawned(widgetId) ? 'gp-spawn' : ''
        } ${
          widget.metadata.completed ? 'opacity-55 saturate-50' : ''
        } ${isFlashing ? 'gp-flash' : ''}`}
        style={{
          borderRadius: widgetRadius,
          cursor: edgeResize.resizeCursor ?? (dragRef.current?.moved ? 'grabbing' : 'grab'),
          '--gp-widget-accent': cardAccent,
          '--gp-widget-radius': `${widgetRadius}px`,
          '--gp-tree-reveal-delay': `${treeRevealMs ?? 0}ms`,
          // No paint containment here: the title capsule, badges, and detach
          // button intentionally overflow the card bounds and would be clipped.
          contain: 'layout style',
        } as CSSProperties}
      >
      {/* Hover catch-all — one gapless rectangle so group-hover chrome
          (favorite/lock row, skin trigger) never flickers as the cursor moves
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
        style={{ top: -WIDGET_HOVER_TOP, left: 0, right: hasButtonOverflow && !resting ? -WIDGET_HOVER_RIGHT : 0, bottom: 0 }}
      />

      {/* AI Hydration Overlay */}
      {widget.isHydrating && (
        <div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-neutral-950/90"
          style={{ borderRadius: 22 }}
        >
          <div className="relative flex items-center justify-center">
            <Sparkles size={22} className="animate-pulse text-emerald-400" />
            <span className="absolute h-8 w-8 animate-ping rounded-full border border-emerald-500/30 opacity-70" />
          </div>
          <span className="text-[10px] font-semibold text-neutral-300 animate-pulse">AI digesting details...</span>
        </div>
      )}

      {/* Dynamic wrapping logic for top row vs right column. A resting tile
          keeps the title capsule (its identity floats above the face) but
          mounts none of the action buttons. */}
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
          { id: 'favorite', icon: Star, label: 'Favorite' },
          { id: 'duplicate', icon: Copy, label: 'Duplicate' },
          { id: 'markdown', icon: FileText, label: 'Markdown' },
          { id: 'delete', icon: Trash2, label: 'Delete' },
        ]

        // Define the sequence of elements to render based on the menu state
        type SequenceItem = { id: string, type: 'button' | 'plus' }
        let renderSequence: SequenceItem[] = []

        if (isAddMenuOpen) {
          // When open, all buttons are visible in order.
          renderSequence = allButtons.map(b => ({ id: b.id, type: 'button' }))
          renderSequence.push({ id: 'plus', type: 'plus' })
        } else {
          // When closed, only active buttons + Plus are visible.
          renderSequence = allButtons.filter(b => isButtonActive(b.id)).map(b => ({ id: b.id, type: 'button' }))
          renderSequence.push({ id: 'plus', type: 'plus' })
        }

        // Overflow buttons run down a column past the card's right edge. On a
        // short card that column used to trail straight down into empty canvas
        // below the card; instead we wrap it into a second column once it would
        // pass the card's bottom, keeping every button beside the card (and so
        // within the card's own hover reach). Bound the column length by how
        // many whole 40px cells tall the card is.
        const rowsPerColumn = Math.max(1, Math.floor(widget.size.height / 40))

        // Helper to get position of any element by its index in the flow sequence
        const getPosForIndex = (index: number) => {
          if (index < maxHorizontalCount) {
            // Fits in the title row, next to the title — unchanged.
            return { x: titleAreaWidth + index * 40, y: 0 }
          }
          // Overflow: fill a column down the right edge, then wrap rightward.
          // Each button sits centered on a clean 40px grid cell — no per-index
          // corner-hugging nudge, so the cluster reads as an even grid.
          const overflowIndex = index - maxHorizontalCount
          const column = Math.floor(overflowIndex / rowsPerColumn)
          const rowInColumn = overflowIndex % rowsPerColumn
          return { x: widget.size.width + 6 + column * 40, y: (rowInColumn + 1) * 40 }
        }

        // The position where the Plus button sits when the menu is closed
        const closedPlusIndex = allButtons.filter(b => isButtonActive(b.id)).length
        const closedPlusPos = getPosForIndex(closedPlusIndex)

        // Unified layout resolving engine
        const resolvePosition = (id: string, type: 'button' | 'plus') => {
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
              inert={iconified ? true : undefined}
              aria-hidden={iconified || undefined}
              className={`gp-card-chrome pointer-events-none absolute bottom-full left-0 right-0 z-20 h-10 transition-opacity duration-300 ${
                titleChromeHidden ? 'opacity-0' : 'opacity-100'
              }`}
            >
              <div
                ref={skinSwitch.titleRowRef}
                className={`gp-widget-move-handle gp-touch-target absolute left-0 top-0 h-10 flex items-center select-none ${
                  widget.metadata.locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
                } ${titleChromeHidden ? 'pointer-events-none' : 'pointer-events-auto'}`}
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
                {/* Naked Title Icon: occupies exactly 70% of 40px cell (28px).
                    For a widget with skins, this doubles as the skin-roller
                    trigger — its own icon and hue are the worn skin's. */}
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  {activeSkin ? (
                    <button
                      ref={skinSwitch.triggerRef}
                      type="button"
                      aria-label={`Change ${widget.title} skin (currently ${activeSkin.label})`}
                      aria-expanded={skinSwitch.open}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        skinSwitch.setOpen(!skinSwitch.open)
                      }}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] transition-transform active:scale-90"
                      style={{
                        color: cardAccent,
                        background: `${cardAccent}1c`,
                        boxShadow: `inset 0 0 0 1px ${cardAccent}30`,
                        // While the roller flies the chosen icon back to this
                        // slot, the slot itself is empty — otherwise the same
                        // icon sits here waiting and the flight lands on a
                        // duplicate of itself.
                        visibility: skinSwitch.handingBack ? 'hidden' : undefined,
                      }}
                    >
                      <activeSkin.icon size={14} aria-hidden />
                    </button>
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px]"
                      style={{
                        color: cardAccent,
                        background: `${cardAccent}1c`,
                        boxShadow: `inset 0 0 0 1px ${cardAccent}30`,
                      }}
                    >
                      <Icon size={14} aria-hidden />
                    </span>
                  )}
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

              {/* Engine-powered absolutely positioned customizable buttons.
                  None mount while resting — a resting tile is non-interactive
                  beyond click-to-expand, drag, and ports. */}
              {!resting && allButtons.map((btn) => {
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
                      <IconComponent size={15} fill={btn.id === 'favorite' && widget.metadata.favorite && !isAddMenuOpen ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                )
              })}

              {/* Plus '+' Toggle Button */}
              {!resting && (
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
                  style={isAddMenuOpen ? { color: cardAccent } : undefined}
                >
                  <Plus size={15} className={`transition-transform duration-200 ${isAddMenuOpen ? 'rotate-45' : ''}`} aria-hidden />
                </button>
              </div>
              )}
            </div>
          </>
        )
      })()}

      {activeSkin && skinSwitch.open && (
        <WidgetSkinRoller
          currentValue={activeSkin.value}
          skins={skins}
          anchorRef={skinSwitch.titleRowRef}
          iconHomeRef={skinSwitch.triggerRef}
          onClose={() => {
            skinSwitch.setOpen(false)
            skinSwitch.setHandingBack(false)
          }}
          onCommit={(value) => {
            // Clear this slot for the incoming icon before it starts flying.
            skinSwitch.setHandingBack(true)
            // Read the freshest widget rather than closing over this render's
            // copy — the card may have changed while the drum was open.
            const current = useWidgetStore.getState().widgets[widgetId]
            if (!current) return
            useWidgetStore.getState().updateWidgetData(widgetId, dataWearingSkin(current, value))
          }}
        />
      )}

      {/* Pin control — a default floating pill above the expanded card. It is
          shown exactly when pinning is meaningful: while the card is the
          ephemerally expanded member (so you can hold it open), or while it is
          already pinned (so you can let it rest again). A resting tile, an
          icon, and a widget that never rests all skip it — there is nothing to
          hold open. It rides the card's own transform. */}
      {(restExpanded || widget.metadata.pinned) && !iconified && (
        <div
          className="gp-widget-pin-float pointer-events-auto absolute left-1/2 z-40 -translate-x-1/2"
          style={{ bottom: 'calc(100% + 44px)' }}
        >
          <button
            type="button"
            title={widget.metadata.pinned ? 'Unpin — let it rest again' : 'Pin open'}
            aria-label={widget.metadata.pinned ? 'Unpin widget' : 'Pin widget open'}
            aria-pressed={!!widget.metadata.pinned}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              togglePin()
            }}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all duration-200 active:scale-95 filter drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0"
            style={
              widget.metadata.pinned
                ? { color: '#0a0a0a', background: cardAccent, boxShadow: `0 0 0 1px ${cardAccent}` }
                : { color: cardAccent, background: `${cardAccent}1c`, boxShadow: `inset 0 0 0 1px ${cardAccent}40` }
            }
          >
            <Pin size={13} className="rotate-45" fill={widget.metadata.pinned ? 'currentColor' : 'none'} aria-hidden />
            {widget.metadata.pinned ? 'Pinned' : 'Pin'}
          </button>
        </div>
      )}

      {/* Icon state keeps one unmistakable identity mark and no partial UI —
          the worn skin's own mark and hue, so a shrunken card still says
          which skin it is. */}
      <div
        aria-hidden={!iconLike}
        className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-300 ${
          iconLike || restIcon ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {(() => {
          const IdentityIcon = activeSkin?.icon ?? Icon
          return (
            <IdentityIcon
              size={iconGlyphSize}
              style={{ color: cardAccent }}
              aria-hidden
            />
          )
        })()}
      </div>

      {/* Resting face — the widget's concise, non-editable identity at rest.
          Per-type faces (chart sparkline, and drawing thumbnails to come) live
          in WidgetRestingFace; types without one fall back to identity alone.
          Pointer-transparent: the article's own handlers provide drag-to-move
          and click-to-expand. */}
      {restTile && (
        <div
          aria-hidden={!resting || undefined}
          className="gp-rest-face pointer-events-none absolute left-1/2 top-1/2 z-10"
          style={{
            // Pinned to the tile's own box and centred rather than stretched to
            // `inset-0`. While resting the two are identical (the card *is* the
            // tile); while expanding it keeps the outgoing face at its natural
            // size instead of smearing it across the growing card. Centring is
            // exact because the growth is centre-anchored.
            width: restTile.width,
            height: restTile.height,
            marginLeft: -restTile.width / 2,
            marginTop: -restTile.height / 2,
            opacity: resting ? 1 : 0,
          }}
        >
          <WidgetRestingFace widget={widget} />
        </div>
      )}

      {/* Dependency explainer — dimming alone doesn't say why a card is muted */}
      {isBlocked && (
        <div aria-label={`${widget.title} is blocked by ${blockerNames || 'an unresolved dependency'}`} className="pointer-events-none absolute -bottom-2.5 left-1/2 z-20 flex max-w-[90%] -translate-x-1/2 items-center gap-1 rounded-full border border-amber-500/40 bg-neutral-950/95 px-2 py-0.5 shadow-md">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span className="truncate  text-[9px] font-medium uppercase tracking-wide text-amber-300">
            {dependencyStatusLabel(widget.title, blockerNames ? blockerNames.split(', ') : [])}
          </span>
        </div>
      )}

      {/* Widget content — fades out for dormant icon tiles, and does not
          mount at all for a resting tile: skipping the content subtree is
          where the resting system's memory/CPU savings actually come from.
          Panelized widgets carry their own glass subpanels, so the shell padding tightens. */}
      {(!resting || contentLingering) && (
      <div
        ref={contentRef}
        inert={iconLike || resting ? true : undefined}
        aria-hidden={iconLike || resting || undefined}
        className={`gp-widget-content ${restExpanded ? 'gp-rest-content-in' : ''} flex-1 overflow-hidden rounded-[20px] p-2.5 transition-opacity duration-300 ${
          iconLike || resting ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        onFocusCapture={(event) => {
          const editable =
            event.target instanceof HTMLElement &&
            (event.target.matches('input, textarea, select, [contenteditable="true"]') ||
              event.target.isContentEditable)
          // Collaborator presence for every widget type. Doing this centrally
          // replaces per-widget wiring that only two renderers ever adopted,
          // so "Editing <widget>" was silently missing everywhere else.
          if (editable) setCollaborativeEditingWidget(widgetId)
        }}
        onBlurCapture={(event) => {
          // Only clear when focus actually leaves this card, not while moving
          // between two fields inside it.
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          setCollaborativeEditingWidget(null)
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
      )}

      {/* The resize affordance is the outline itself: the stretch of border
          nearest the pointer thickens, and both stretches do at a corner. */}
      <span aria-hidden className="gp-resize-edge pointer-events-none z-20" />

      {clock && (
        <WidgetClockRing
          width={effectiveSize.width}
          height={effectiveSize.height}
          radius={widgetRadius}
          fraction={clock.fraction}
          tone={clock.tone}
          running={clock.running}
          urgent={clock.urgent}
        />
      )}

      <FloatingBadges widgetId={widgetId} />
      <PortRail widgetId={widgetId} />
      </article>
    </div>
  )
})
