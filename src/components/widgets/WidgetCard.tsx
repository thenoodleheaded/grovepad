import { memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Check, Sparkles, Star, Trash2, TriangleAlert, Pin } from 'lucide-react'
import { ErrorBoundary } from '../ErrorBoundary'
import { useCanvasStore } from '../../store/useCanvasStore'
import { isRecentlySpawned, useWidgetStore } from '../../store/useWidgetStore'
import { requestWidgetDeletion } from '../../store/useWidgetDeletionDialogStore'
import type { ModuleData } from '../../types/spatial'
import { GRID_SIZE, WIDGET_MAX_EDGE } from '../../types/spatial'
import { WIDGET_HOVER_RIGHT, WIDGET_HOVER_TOP } from '../../utils/widgetBounds'
import { findGlueSnap, foldedMemberInsets, glueMemberInsets } from '../../utils/glueGeometry'
import { resolveLinkTargetAt } from '../../utils/linkTarget'
import { PointerDragSession } from '../../utils/pointerDrag'
import {
  beginDragDisplacement,
  cancelDragDisplacement,
  endDragDisplacement,
  updateDragDisplacement,
  useDragDisplacementStore,
} from '../../store/dragDisplacement'
import { movedIdsForWidget } from '../../store/widgetCollection'
import { expandMovedWidgetIds } from '../../store/widgetGraph'
import { contentFitHeight } from '../../utils/widgetContentFloor'
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

/** Stable "no glue inset" so an unglued card's selector keeps one identity. */
const GLUE_NO_INSET = { left: 0, right: 0, top: 0, bottom: 0 } as const

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
  // A glued member hides its own floating title capsule: the cluster's group
  // frame (GlueClusterChrome) carries the shared group name above the whole
  // cluster, so a per-card label would only clutter and collide with it.
  const isGluedMember = useWidgetStore((state) => Boolean(state.widgetGlueIndex[widgetId]))
  // This card's cluster is folded. A folded cluster is ONE object: it wears
  // one hover state, answers one click (unfold), and its members are inert
  // single-cell icons — no per-icon lift, resize, ports, or expand.
  const inFoldedCluster = useWidgetStore((state) => {
    const glueId = state.widgetGlueIndex[widgetId]
    return glueId ? state.glues[glueId]?.collapsed === true : false
  })

  // Render inset for a glued member: each welded edge gives up GLUE_HALF_GAP so
  // the seam is carved equally from both cards and the cluster's outer corners
  // stay on the grid. Zero on every free edge and when unglued. useShallow so a
  // fresh object with identical numbers never re-renders the card.
  const glueInset = useWidgetStore(
    useShallow((state) => {
      const glueId = state.widgetGlueIndex[widgetId]
      if (!glueId) return GLUE_NO_INSET
      const cluster = state.glues[glueId]
      // Folded, every cell gives up the seam on all four edges instead: the
      // block reads as one even grid of icons rather than end cells painting
      // wider than the ones between them.
      if (cluster?.collapsed === true) return foldedMemberInsets()
      return glueMemberInsets(widgetId, cluster?.widgetIds ?? [], state.widgets)
    }),
  )

  const ghostOffset = useDragDisplacementStore((state) => state.offsets[widgetId])
  const settlePending = useDragDisplacementStore((state) => state.pendingSettleIds.has(widgetId))
  const isRenaming = useWidgetStore((state) => state.renamingWidgetId === widgetId)
  const [titleEditing, setTitleEditing] = useState(false)
  const lastTitleClickRef = useRef(0)
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
  // While one card is held open, every other card is BACKGROUND. The open card
  // is the thing being worked in — a neighbour underneath it lighting up, and
  // leaning toward the cursor, as the pointer crosses on its way to the open
  // card reads as if the click would land there. Background cards keep their
  // click (the accordion still opens the next card), but nothing about them
  // answers the pointer merely passing over.
  const backgrounded = expandedWidgetId !== null && expandedWidgetId !== widgetId
  /** No hover response at all: bloom, lift, magnetic tilt, outline-resize
   * proximity, and the hovered-widget signal the relation layers read. */
  const hoverInert = backgrounded || inFoldedCluster
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

  // A collapsed cluster is ONE object on the board — a collected row of icons.
  // So a single click anywhere on it unfolds the whole cluster back to the
  // positions, sizes and scale states the fold remembered, rather than opening
  // the one icon that happened to be under the pointer.
  const unfoldCollapsedCluster = (): boolean => {
    const store = useWidgetStore.getState()
    const glueId = store.widgetGlueIndex[widgetId]
    if (!glueId || store.glues[glueId]?.collapsed !== true) return false
    store.setClusterCollapsed(glueId, false)
    return true
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
      if (unfoldCollapsedCluster()) return
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

  // The pointer can already be resting on this card when it becomes background
  // (another card expands under the keyboard, a cluster folds under the
  // cursor): no pointerleave ever fires, so the lift and the hover signal would
  // simply stay lit. Drop both the moment the card stops answering hover.
  useEffect(() => {
    if (!hoverInert) return
    magneticHover.suspend()
    edgeResize.onEdgeHoverLeave()
    if (useWidgetStore.getState().hoveredWidgetId === widgetId) {
      useWidgetStore.getState().setHoveredWidgetId(null)
    }
    // magneticHover/edgeResize are stable per-render facades over refs; keying
    // this on the state change alone is what keeps it a one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverInert, widgetId])

  // Trigger title editing when renamed via F2 or external action.
  useEffect(() => {
    if (isRenaming) {
      setTitleEditing(true)
      useWidgetStore.getState().stopRenaming()
    }
  }, [isRenaming])

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
    // An option-drag is a precision welding gesture: neighbors must hold
    // perfectly still while a seam is being aimed, so it never arms the
    // displacement system at all.
    if (!glueDragRef.current) beginDragDisplacement()
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
        if (glueDragRef.current) return
        const fresh = useWidgetStore.getState()
        // What actually moved: the selection expanded through every touched
        // glue cluster and strict family (the same expansion moveWidget applied).
        const movingIds = expandMovedWidgetIds(
          movedIdsForWidget(dragWidgetId, fresh.selectedIds, fresh.widgets),
          fresh,
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
    if (sourceId !== targetId) {
      state.addRelation(sourceId, targetId, 'parent')
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
      // A card that shows no outline affordance must not answer one: while it
      // is background (another card is held open) or folded into a collapsed
      // cluster, the press falls through to select/drag/open instead of
      // silently starting an invisible resize.
      !hoverInert &&
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
      // No pulling one icon out of a folded collection: while a cluster is
      // collapsed it is a single object, so ⌥-drag moves it whole like any
      // other drag rather than unwelding whichever icon was under the pointer.
      glueDragRef.current = e.altKey && !inFoldedCluster
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
    if (!session && !widget.metadata.locked && !hoverInert) magneticHover.move(e)
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
        // The preview must equal the drop. Release ungues whenever the drop
        // welds nothing (see onPointerUp), so the pull-off must be ARMED on
        // exactly that condition — not on the stricter "a full cell clear of
        // every clustermate". Between the two lay a silent band: no weld
        // target lit, no dashed pull-off shown, and a release there tore the
        // member out of its group with no warning. The band is real estate a
        // hand passes through constantly, because `findGlueSnap` also needs
        // half a cell of FACING overlap — slide a card along its neighbour and
        // the weld dies while the distance never changes.
        const glueId = state.widgetGlueIndex[dragged.id]
        const members = glueId ? state.glues[glueId]?.widgetIds ?? [] : []
        state.setUnglueIntentWidgetId(!snap && members.length > 0 ? dragged.id : null)
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
      if (draggedId === widgetId && unfoldCollapsedCluster()) {
        // The whole collection opened; no per-widget expansion on top of it.
      } else if (resting && draggedId === widgetId) {
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
      // Option-drag resolution: the weld the preview promised, or — for a
      // member released ANYWHERE off a seam — the pull-off. A release between
      // "welds here" and "a full cell clear of everyone" used to resolve to
      // nothing, leaving a card that touches no one still on the cluster's
      // books (framed with the group, moving with it, parked off-grid). If the
      // drop welds nothing, the member comes off; the seam-forgiveness in
      // `findGlueSnap` is what protects a small jiggle from reading as a pull.
      // Both outcomes ride the drag's history step.
      if (glueDragRef.current) {
        if (state.glueIntent?.draggedId === draggedId) {
          state.commitGlue()
        } else if (state.widgetGlueIndex[draggedId]) {
          state.unglueWidget(draggedId, { skipHistory: true, heldByPointer: true })
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
    const wasGlueDrag = glueDragRef.current
    const moved = session.end()
    // A cancelled option-drag resolves EXACTLY as a release does. The card has
    // already been moved by the gesture, so simply dropping the intents left a
    // member on the cluster's books welded to nothing — off-seam, off-grid,
    // framed by and dragging with a group it no longer touches: the half-out
    // state the release path exists to prevent. Pointer-cancel is not rare; a
    // touch or pen drag loses capture to any system gesture. Same history step,
    // same two outcomes, no third one.
    if (moved && wasGlueDrag) {
      if (state.glueIntent?.draggedId === draggedId) {
        state.commitGlue()
      } else if (state.widgetGlueIndex[draggedId]) {
        state.unglueWidget(draggedId, { skipHistory: true, heldByPointer: true })
      }
    }
    state.setGlueIntent(null)
    state.setUnglueIntentWidgetId(null)
    glueDragRef.current = false
    if (!moved) {
      magneticHover.endDrag()
      return
    }
    const settled = useWidgetStore.getState()
    const ids =
      !wasGlueDrag && settled.selectedIds.has(draggedId) && settled.selectedIds.size > 1
        ? [...settled.selectedIds]
        : [draggedId]
    settled.settleWidgets(ids)
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

  // The title row's button set is STATIC — no customize menu, no per-widget
  // visibility flags. Pin, Favorite, and Delete on every card; the Completed
  // checkbox only where completion means something (checklists).
  const isButtonActive = (btnId: string) => {
    switch (btnId) {
      case 'pin':
      case 'favorite':
      case 'delete':
        return true
      case 'completed':
        return widget.type === 'checklist'
      default:
        return false
    }
  }

  // Pinning hands the card a permanent open state, so it no longer needs the
  // single ephemeral expansion slot — release it first, or the accordion keeps
  // a member that can never collapse. The control is the title row's Pin
  // button, a default like Favorite and Delete.
  // (Position locking is a separate thing, in the right-click menu.)
  const togglePin = () => {
    if (!widget.metadata.pinned && expandedWidgetId === widgetId) {
      // What the pin is interrupting, captured before the slot is released:
      // a card opened out of an icon must come back to that exact icon when it
      // is unpinned, not drop onto a resting tile it never showed. Only the
      // expansion still knows — by now the card itself is an ordinary full card.
      const origin = useWidgetRestStore.getState().expandedFrom
      const from = origin?.kind === 'icon'
        ? { kind: 'icon' as const, width: origin.size.width, height: origin.size.height }
        : { kind: 'rest' as const }
      // Pin means "hold this card open", so the slot is released WITHOUT the
      // fold-back to the expansion's origin — restoring it would iconify the
      // very card being pinned. The view offset the expansion was drawn at is
      // handed to the pin action instead: pinned cards draw at their stored
      // position, so absorbing the offset there keeps the card exactly where
      // the user sees it rather than jumping diagonally back to the anchor.
      const absorbOffset = useWidgetRestStore.getState().expandedOffset
      useWidgetRestStore.getState().collapseWidget({ restoreOrigin: false })
      useWidgetStore.getState().toggleWidgetPinned(widgetId, { absorbOffset, from })
      return
    }
    // Pinning without the expansion slot (a card that never rests) still
    // records where it came from; unpinning a card that was already open just
    // leaves it open, which is what `rest` means for a non-resting type.
    useWidgetStore.getState().toggleWidgetPinned(widgetId, { from: { kind: 'rest' } })
  }

  const handleButtonClick = (btnId: string) => {
    if (btnId === 'pin') {
      togglePin()
    } else if (btnId === 'completed') {
      const nextVal = !widget.metadata.completed
      useWidgetStore.getState().updateWidgetMetadata(widgetId, { completed: nextVal })
    } else if (btnId === 'favorite') {
      useWidgetStore.getState().toggleWidgetFavorite(widgetId)
    } else if (btnId === 'delete') {
      requestWidgetDeletion(widgetId)
    }
  }

  const isButtonToggled = (btnId: string) =>
    (btnId === 'pin' && widget.metadata.pinned) ||
    (btnId === 'completed' && widget.metadata.completed) ||
    (btnId === 'favorite' && widget.metadata.favorite)

  const getButtonStyle = (btnId: string): CSSProperties =>
    isButtonToggled(btnId) ? { color: cardAccent } : {}

  const getButtonClass = (btnId: string) => {
    let base = "flex h-[34px] w-[34px] items-center justify-center shrink-0 rounded-full filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0"
    if (!isButtonToggled(btnId)) {
      base += " text-neutral-400 hover:text-neutral-200"
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
  // otherwise land on the neighbour above. Renaming (F2) still forces it back,
  // and so do the two states whose only control lives in that row: the
  // ephemerally expanded member (floating above the cluster, so nothing is
  // under the row) and a pinned member (the row is the only unpin).
  const titleChromeHidden =
    capsuleHidden ||
    (isGluedMember && !titleEditing && !restExpanded && widget.metadata.pinned !== true)
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
  const baseSize = resting && restTile ? restTile : widget.size
  // A glued member shrinks by its welded-edge insets and shifts by the leading
  // (left/top) insets, so the gap comes out of both cards equally and the
  // cluster's outer corners hold the grid. An expanded card floats free of the
  // cluster, so it never insets. Everything downstream reads this effective box.
  const glueShrunk = restExpanded ? GLUE_NO_INSET : glueInset
  const effectiveSize = {
    width: baseSize.width - glueShrunk.left - glueShrunk.right,
    height: baseSize.height - glueShrunk.top - glueShrunk.bottom,
  }
  const glueOffset = { x: glueShrunk.left, y: glueShrunk.top }
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
          widget.position.x + (ghostOffset?.x ?? 0) + restOffset.x + glueOffset.x
        }px, ${
          widget.position.y + (ghostOffset?.y ?? 0) + restOffset.y + glueOffset.y
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
        data-hover-inert={hoverInert || undefined}
        data-cluster-collapsed={inFoldedCluster || undefined}
        data-resize-edge={hoverInert ? undefined : edgeResize.resizeEdgeAttribute}
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
          if (unfoldCollapsedCluster()) return
          expandFromIcon()
        }}
        // Capture phase: this must run for presses on the card's own controls
        // too, before the magnetic offset can slide them out from under the
        // pointer and turn the click into a no-op.
        onPointerDownCapture={() => magneticHover.freeze()}
        onFocus={() => useWidgetStore.getState().selectWidget(widgetId, false)}
        onKeyDown={onCardKeyDown}
        onPointerEnter={(event) => {
          if (widget.metadata.locked || hoverInert) return
          useWidgetStore.getState().setHoveredWidgetId(widgetId)
          magneticHover.enter(event)
        }}
        onPointerLeave={() => {
          edgeResize.onEdgeHoverLeave()
          if (widget.metadata.locked || hoverInert) return
          magneticHover.leave()
          if (useWidgetStore.getState().hoveredWidgetId === widgetId) {
            useWidgetStore.getState().setHoveredWidgetId(null)
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={(event) => {
          if (!hoverInert) edgeResize.onEdgeHoverMove(event)
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
          // A folded collection is a button: one click unfolds it, so it says
          // "press me" rather than "grab me" (and never "resize me").
          cursor: inFoldedCluster
            ? 'pointer'
            : edgeResize.resizeCursor ?? (dragRef.current?.moved ? 'grabbing' : 'grab'),
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

      {/* The static title-row button set. A resting tile keeps the title
          capsule (its identity floats above the face) but mounts none of the
          action buttons. Buttons sit in one row after the title — no
          customize menu, no wrapping into columns, no entrance animation. */}
      {(() => {
        // Estimate title width dynamically based on typical character widths (7px for text-xs font-bold)
        // Icon takes 40px cell. Input takes w-24 (96px). Truncation limits it to 200px.
        const estimatedTitleWidth = titleEditing ? 96 : Math.min(200, widget.title.length * 7)
        const titleAreaWidthResting = 40 + 4 + estimatedTitleWidth + 8
        const titleAreaCells = Math.ceil(titleAreaWidthResting / 40)
        const titleAreaWidth = titleAreaCells * 40

        const visibleButtons = [
          { id: 'pin', icon: Pin, label: 'Pin' },
          { id: 'completed', icon: Check, label: 'Completed' },
          { id: 'favorite', icon: Star, label: 'Favorite' },
          { id: 'delete', icon: Trash2, label: 'Delete' },
        ].filter((btn) => isButtonActive(btn.id))

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

              {/* The static action buttons, one row after the title. None
                  mount while resting — a resting tile is non-interactive
                  beyond click-to-expand, drag, and ports. */}
              {!resting && visibleButtons.map((btn, index) => {
                const IconComponent = btn.icon
                return (
                  <div
                    key={btn.id}
                    className="gp-card-action absolute top-0 w-10 h-10 flex items-center justify-center z-30 pointer-events-auto"
                    style={{ transform: `translate(${titleAreaWidth + index * 40}px, 0px)` }}
                  >
                    <button
                      type="button"
                      title={btn.label}
                      aria-label={btn.label}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleButtonClick(btn.id)
                      }}
                      className={getButtonClass(btn.id)}
                      style={getButtonStyle(btn.id)}
                    >
                      <IconComponent
                        size={15}
                        className={btn.id === 'pin' ? 'rotate-45' : undefined}
                        fill={
                          (btn.id === 'favorite' && widget.metadata.favorite) ||
                          (btn.id === 'pin' && widget.metadata.pinned)
                            ? 'currentColor'
                            : 'none'
                        }
                      />
                    </button>
                  </div>
                )
              })}
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
            useWidgetStore.getState().updateWidgetData(widgetId, dataWearingSkin(current, value, def))
          }}
        />
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
      {/* A folded member has no rail: wiring a single-cell icon inside a
          collection that answers one click is not a thing you can aim at.
          Existing wires still land on it — they follow the box, not the rail. */}
      {!inFoldedCluster && <PortRail widgetId={widgetId} />}
      </article>
    </div>
  )
})
