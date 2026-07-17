import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { useFocusStore } from '../../store/useFocusStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import type { IslandLayout } from '../../types/spatial'
import { GRID_SIZE } from '../../types/spatial'
import {
  insertDraggedAtPointer,
  mergeReorderDomain,
  screenVectorToLocal,
  visualFlowOrder,
} from '../../utils/focusModeReorder'
import { safePersistedIslandSize } from '../../utils/focusModeSizing'
import { widgetDefinition } from '../../widgets/registry'

// ---------------------------------------------------------------------------
// Focus mode — island rearrangement (glass constitution, Article XVIII).
//
// One component, two duties:
//
// 1. ALWAYS: apply the widget's persisted `islandLayout` (order + sizes) to
//    its `.gp-island` elements, so an arrangement made in focus mode is what
//    the resting card shows. Order is applied via CSS `order`; a plain block
//    stack is promoted to a flex column (`gp-island-flow`) only once the
//    user has actually reordered — untouched widgets render byte-identically.
//
// 2. IN FOCUS: overlay per-island chrome. Each reorderable island's whole
//    body is a drag surface — grab it anywhere to float it and rearrange,
//    its siblings sliding aside (FLIP) to open a landing slot. Where the
//    island's sizing charter allows, a resize handle rides its corner; every
//    resize is clamped by the behavior class and min/max bounds and snapped
//    to the 4px sub-grid. Escape or clicking outside the card exits.
//
// Island identity: `data-island="<id>"` set by the renderer, falling back to
// the island's slot index (`i0`, `i1`, …) — the same stable-order assumption
// the retired panelSizes system used.
// ---------------------------------------------------------------------------

/** Sizing charter behaviors — see Article XVIII.1 in the glass constitution. */
export type IslandSizing = 'free' | 'width' | 'aspect' | 'fixed'

interface IslandInfo {
  id: string
  element: HTMLElement
  sizing: IslandSizing
  /** Overlay-space rect (host-relative, unscaled CSS px). */
  x: number
  y: number
  width: number
  height: number
  /** Reordering is meaningful only inside a sibling flow domain. */
  reorderable: boolean
}

/** Material islands, plus bare `data-island` opt-ins (e.g. chart surfaces
 *  that keep their own styling but still participate in focus layout). */
const ISLAND_SELECTOR = '.gp-island, [data-island]'
/** Charter floors/ceilings (Article XVIII.1). */
const MIN_W = 64
const MIN_H = 32
const MAX_H = 420
/** The 4px sub-grid every focus-mode geometry change snaps to. */
const SUB_GRID = 4

const snap4 = (value: number) => Math.round(value / SUB_GRID) * SUB_GRID
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i])
const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Lift a real island out of the flow so it can float under the cursor. */
function liftIsland(element: HTMLElement): void {
  element.classList.add('gp-island-lift')
  element.style.position = 'relative'
  element.style.zIndex = '40'
  element.style.willChange = 'transform'
  element.style.pointerEvents = 'none'
  element.style.transition = 'none'
}

/** Return a lifted island to the flow; also clears any FLIP leftovers. */
function resetIsland(element: HTMLElement): void {
  element.classList.remove('gp-island-lift')
  element.style.position = ''
  element.style.zIndex = ''
  element.style.willChange = ''
  element.style.pointerEvents = ''
  element.style.transition = ''
  element.style.transform = ''
}

function islandSizing(element: HTMLElement): IslandSizing {
  const declared = element.getAttribute('data-island-size')
  if (declared === 'free' || declared === 'width' || declared === 'aspect' || declared === 'fixed') {
    return declared
  }
  return 'free'
}

function numberAttr(element: HTMLElement, name: string, fallback: number): number {
  const raw = element.getAttribute(name)
  const parsed = raw === null ? NaN : parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function collectIslands(host: HTMLElement): HTMLElement[] {
  const all = [...host.querySelectorAll<HTMLElement>(ISLAND_SELECTOR)]
  // Islands never nest (Article XIII) — keep outermost only, defensively.
  return all.filter((island) => !all.some((other) => other !== island && other.contains(island)))
}

function islandId(element: HTMLElement, index: number): string {
  return element.getAttribute('data-island') ?? `i${index}`
}

function measureIslands(host: HTMLElement): IslandInfo[] {
  const hostRect = host.getBoundingClientRect()
  const scaleX = host.offsetWidth > 0 ? hostRect.width / host.offsetWidth : 1
  const scaleY = host.offsetHeight > 0 ? hostRect.height / host.offsetHeight : 1
  const elements = collectIslands(host)
  const siblingCounts = new Map<HTMLElement, number>()
  elements.forEach((element) => {
    const parent = element.parentElement
    if (parent) siblingCounts.set(parent, (siblingCounts.get(parent) ?? 0) + 1)
  })
  return elements
    .map((element, index) => {
      const rect = element.getBoundingClientRect()
      const parent = element.parentElement
      return {
        id: islandId(element, index),
        element,
        sizing: islandSizing(element),
        x: (rect.left - hostRect.left) / scaleX,
        y: (rect.top - hostRect.top) / scaleY,
        width: rect.width / scaleX,
        height: rect.height / scaleY,
        reorderable: parent !== null && (siblingCounts.get(parent) ?? 0) > 1,
      }
    })
    .sort((a, b) => a.y - b.y || a.x - b.x)
}

function clearAppliedSize(island: HTMLElement): void {
  if (!island.hasAttribute('data-focus-layout-size')) return
  island.style.width = ''
  island.style.height = ''
  island.style.flex = ''
  island.removeAttribute('data-focus-layout-size')
}

function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
}

function layoutFitsContent(host: HTMLElement, islands: HTMLElement[]): boolean {
  const content = host.querySelector<HTMLElement>('.gp-widget-content') ?? host
  const bounds = content.getBoundingClientRect()
  const rects = islands.map((island) => island.getBoundingClientRect())
  if (rects.some((rect) =>
    rect.left < bounds.left - 1 || rect.top < bounds.top - 1 ||
    rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1
  )) return false
  return !rects.some((rect, index) => rects.slice(index + 1).some((other) => rectsOverlap(rect, other)))
}

/** Apply persisted order + sizes to the live DOM islands. Returns false when
 * stale geometry had to be dropped in favor of the renderer's natural flow. */
function applyLayout(host: HTMLElement, layout: IslandLayout | undefined): boolean {
  const islands = collectIslands(host)
  if (islands.length === 0) return true
  let rejectedSize = false
  const order = layout?.order
  if (order && order.length > 0) {
    const parents = new Set(islands.map((island) => island.parentElement).filter(Boolean))
    parents.forEach((parent) => {
      if (!(parent instanceof HTMLElement)) return
      const siblings = islands.filter((island) => island.parentElement === parent)
      // Promote a block stack to an ordered flex column; flex/grid parents
      // honor `order` natively and keep their own layout.
      if (getComputedStyle(parent).display === 'block') parent.classList.add('gp-island-flow')
      siblings.forEach((island) => {
        const globalIndex = islands.indexOf(island)
        const position = order.indexOf(islandId(island, globalIndex))
        island.style.order = position >= 0 ? String(position) : String(order.length + globalIndex)
      })
    })
  }
  islands.forEach((island, index) => {
    clearAppliedSize(island)
    const size = layout?.sizes?.[islandId(island, index)]
    if (!size) return
    const sizing = islandSizing(island)
    const parentWidth = island.parentElement?.clientWidth ?? 0
    const minWidth = Math.max(MIN_W, numberAttr(island, 'data-island-min-w', MIN_W))
    const minHeight = Math.max(MIN_H, numberAttr(island, 'data-island-min-h', MIN_H))
    const safe = safePersistedIslandSize(size, {
      sizing,
      minWidth,
      minHeight,
      maxWidth: Math.max(minWidth, numberAttr(island, 'data-island-max-w', parentWidth)),
      maxHeight: Math.max(minHeight, Math.min(MAX_H, numberAttr(island, 'data-island-max-h', MAX_H))),
      containerWidth: parentWidth,
    })
    if (!safe || safe.width !== size.width || (sizing !== 'width' && safe.height !== size.height)) {
      rejectedSize = true
      return
    }
    if (safe.width !== undefined) island.style.width = `${safe.width}px`
    if (safe.height !== undefined) island.style.height = `${safe.height}px`
    island.style.flex = '0 0 auto'
    island.setAttribute('data-focus-layout-size', '')
  })
  if (!rejectedSize && layoutFitsContent(host, islands)) return true
  islands.forEach(clearAppliedSize)
  return false
}

function persistLayout(widgetId: string, patch: Partial<IslandLayout>): void {
  useWidgetStore.setState((state) => {
    const widget = state.widgets[widgetId]
    if (!widget) return state
    const current = widget.metadata.islandLayout ?? {}
    return {
      widgets: {
        ...state.widgets,
        [widgetId]: {
          ...widget,
          metadata: { ...widget.metadata, islandLayout: { ...current, ...patch } },
        },
      },
    }
  })
}

/** Grow the card if the new island arrangement overflows it (never shrink). */
function growCardToContent(widgetId: string, host: HTMLElement): void {
  const content = host.querySelector<HTMLElement>('.gp-widget-content')
  if (!content) return
  const overflow = Math.ceil(content.scrollHeight - content.clientHeight)
  if (overflow <= 1) return
  const store = useWidgetStore.getState()
  const widget = store.widgets[widgetId]
  if (!widget) return
  const maxHeight = widgetDefinition(widget.type).sizing?.maxHeight ?? Infinity
  const height = Math.min(
    maxHeight,
    Math.ceil((widget.size.height + overflow + 4) / GRID_SIZE) * GRID_SIZE,
  )
  if (height > widget.size.height) store.resizeWidget(widgetId, { ...widget.size, height })
}

interface FocusModeLayerProps {
  widgetId: string
  hostRef: RefObject<HTMLElement | null>
  /** True while this widget is the focus-mode subject. */
  active: boolean
  layout: IslandLayout | undefined
  /** Re-measure trigger — the widget's data object. */
  version: unknown
}

export function FocusModeLayer({ widgetId, hostRef, active, layout, version }: FocusModeLayerProps) {
  const [islands, setIslands] = useState<IslandInfo[]>([])
  const [announcement, setAnnouncement] = useState('')
  type ResizeGesture = {
    kind: 'resize'
    pointerId: number
    id: string
    element: HTMLElement
    sizing: IslandSizing
    startX: number
    startY: number
    startW: number
    startH: number
    ratio: number
    minW: number
    minH: number
    maxW: number
    maxH: number
    scaleX: number
    scaleY: number
    changed: boolean
  }
  type ReorderGesture = {
    kind: 'reorder'
    pointerId: number
    id: string
    element: HTMLElement
    parent: HTMLElement
    /** All islands in the card, in stable DOM order — for id lookup + persist. */
    all: HTMLElement[]
    /** The reorder domain: the dragged island and its flow siblings. */
    siblings: HTMLElement[]
    startCursorX: number
    startCursorY: number
    /** Dragged island's viewport top at gesture start. */
    startTop: number
    startLeft: number
    /** Dragged island's natural (transform-cleared) top at the current order. */
    naturalTop: number
    naturalLeft: number
    /** Current visual order (island ids) within the domain. */
    order: string[]
    /** Card axes, so screen-space drag/FLIP deltas convert to local px. */
    scaleX: number
    scaleY: number
    /** Live FLIP slide per sibling, so a new move supersedes the old one. */
    flips: Map<HTMLElement, Animation>
    changed: boolean
  }
  const gestureRef = useRef<ResizeGesture | ReorderGesture | null>(null)
  /** The island currently lifted for a float-drag, so an interrupted gesture
   *  (focus exit / unmount) can restore it instead of leaving stuck styles. */
  const liftedRef = useRef<HTMLElement | null>(null)

  // Duty 1 — saved arrangements always apply, focused or not. Re-runs when
  // the widget's data changes shape (rows added, panels mounted, …).
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    let raf = 0
    let dropped = false
    const apply = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (gestureRef.current) return
        const accepted = applyLayout(host, layout)
        if (!accepted && !dropped && layout?.sizes && Object.keys(layout.sizes).length > 0) {
          dropped = true
          persistLayout(widgetId, { sizes: {} })
        }
      })
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(host)
    const content = host.querySelector<HTMLElement>('.gp-widget-content')
    if (content) observer.observe(content)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [hostRef, layout, version, active, widgetId])

  // Duty 2 — measure islands for the chrome overlay while focused.
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!active || !host) {
      setIslands([])
      return
    }
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        setIslands(measureIslands(host))
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    collectIslands(host).forEach((island) => observer.observe(island))
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [active, hostRef, version, layout])

  // Exit paths: Escape anywhere, or any pointerdown outside the card.
  useEffect(() => {
    if (!active) return
    const host = hostRef.current
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      useFocusStore.getState().exitFocus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (host && event.target instanceof Node && host.contains(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      useFocusStore.getState().exitFocus()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('pointerdown', onPointerDown, { capture: true })
    }
  }, [active, hostRef])

  // If focus is left (or the card unmounts) mid-drag, restore the lifted
  // island and any siblings still carrying transient FLIP styles — they live
  // outside React and would otherwise stick.
  useEffect(() => {
    if (active) return
    const gesture = gestureRef.current
    if (gesture?.kind === 'reorder') {
      gesture.flips.forEach((anim) => anim.cancel())
    }
    if (liftedRef.current) resetIsland(liftedRef.current)
    liftedRef.current = null
    gestureRef.current = null
    hostRef.current?.removeAttribute('data-focus-reordering')
  }, [active, hostRef])

  useEffect(() => () => {
    if (liftedRef.current) resetIsland(liftedRef.current)
    liftedRef.current = null
  }, [])

  if (!active || islands.length === 0) return null

  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>, island: IslandInfo) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* pointer vanished — gesture simply won't track */
    }
    const host = hostRef.current
    const hostRect = host?.getBoundingClientRect()
    const scaleX = host && hostRect && host.offsetWidth > 0 ? hostRect.width / host.offsetWidth : 1
    const scaleY = host && hostRect && host.offsetHeight > 0 ? hostRect.height / host.offsetHeight : 1
    const containerW = island.element.parentElement?.clientWidth ?? island.width
    const minW = Math.max(MIN_W, numberAttr(island.element, 'data-island-min-w', MIN_W))
    const minH = Math.max(MIN_H, numberAttr(island.element, 'data-island-min-h', MIN_H))
    // Renderer-specific values may tighten the charter, never loosen it.
    const maxW = Math.max(minW, Math.min(containerW, numberAttr(island.element, 'data-island-max-w', containerW)))
    const maxH = Math.max(minH, Math.min(MAX_H, numberAttr(island.element, 'data-island-max-h', MAX_H)))
    useWidgetStore.getState().snapshotHistory(`island:${widgetId}`)
    gestureRef.current = {
      kind: 'resize',
      pointerId: event.pointerId,
      id: island.id,
      element: island.element,
      sizing: island.sizing,
      startX: event.clientX,
      startY: event.clientY,
      startW: island.width,
      startH: island.height,
      ratio: island.height > 0 ? island.width / island.height : 1,
      minW,
      minH,
      maxW,
      maxH,
      scaleX,
      scaleY,
      changed: false,
    }
  }

  const moveResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.kind !== 'resize' || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    const { x: dx, y: dy } = screenVectorToLocal(
      { x: event.clientX - gesture.startX, y: event.clientY - gesture.startY },
      gesture.scaleX,
      gesture.scaleY,
    )
    let width = snap4(Math.min(gesture.maxW, Math.max(gesture.minW, gesture.startW + dx)))
    let height = snap4(Math.min(gesture.maxH, Math.max(gesture.minH, gesture.startH + dy)))
    if (gesture.sizing === 'width') {
      height = gesture.startH
    } else if (gesture.sizing === 'aspect') {
      // Width leads; height follows the locked ratio, then both re-clamp.
      height = snap4(Math.min(gesture.maxH, Math.max(gesture.minH, width / gesture.ratio)))
      width = snap4(Math.min(gesture.maxW, Math.max(gesture.minW, height * gesture.ratio)))
    }
    gesture.element.style.width = `${width}px`
    if (gesture.sizing !== 'width') gesture.element.style.height = `${height}px`
    gesture.element.style.flex = '0 0 auto'
    gesture.changed = true
  }

  const endResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.kind !== 'resize' || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null
    if (!gesture.changed) return
    const rect = gesture.element.getBoundingClientRect()
    const size: { width?: number; height?: number } = { width: Math.round(rect.width / gesture.scaleX) }
    if (gesture.sizing !== 'width') size.height = Math.round(rect.height / gesture.scaleY)
    const current = useWidgetStore.getState().widgets[widgetId]?.metadata.islandLayout
    persistLayout(widgetId, { sizes: { ...current?.sizes, [gesture.id]: size } })
    const host = hostRef.current
    if (host) growCardToContent(widgetId, host)
  }

  // --- Reorder as a float-drag ------------------------------------------
  // The panel is grabbed anywhere on its body (no handle). The dragged
  // island lifts out of the flow and tracks the cursor; its siblings slide
  // to open a landing slot via FLIP. On release it eases into that slot.

  const beginReorder = (event: ReactPointerEvent<HTMLDivElement>, island: IslandInfo) => {
    if (event.button !== 0) return
    const host = hostRef.current
    const parent = island.element.parentElement
    if (!host || !parent) return
    event.preventDefault()
    event.stopPropagation()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* pointer vanished — gesture simply won't track */
    }
    const all = collectIslands(host)
    const siblings = all.filter((element) => element.parentElement === parent)
    const order = visualFlowOrder(siblings.map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        id: islandId(element, all.indexOf(element)),
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }
    }))
    const hostRect = host.getBoundingClientRect()
    const scaleX = host.offsetWidth > 0 ? hostRect.width / host.offsetWidth : 1
    const scaleY = host.offsetHeight > 0 ? hostRect.height / host.offsetHeight : 1
    useWidgetStore.getState().snapshotHistory(`island:${widgetId}`)
    const startRect = island.element.getBoundingClientRect()
    liftIsland(island.element)
    liftedRef.current = island.element
    host.setAttribute('data-focus-reordering', '')
    gestureRef.current = {
      kind: 'reorder',
      pointerId: event.pointerId,
      id: island.id,
      element: island.element,
      parent,
      all,
      siblings,
      startCursorX: event.clientX,
      startCursorY: event.clientY,
      startTop: startRect.top,
      startLeft: startRect.left,
      naturalTop: startRect.top,
      naturalLeft: startRect.left,
      order,
      scaleX,
      scaleY,
      flips: new Map(),
      changed: false,
    }
  }

  const moveReorder = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.kind !== 'reorder' || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    const { element: dragged, siblings, all } = gesture
    const idOf = (el: HTMLElement) => islandId(el, all.indexOf(el))
    const cursorY = event.clientY

    // Where would the dragged island land? Insert it among the *other*
    // islands at the first one whose midpoint the cursor sits above.
    const others = siblings
      .filter((el) => el !== dragged)
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    const nextOrder = insertDraggedAtPointer(
      gesture.id,
      others.map(({ el, rect }) => ({
        id: idOf(el),
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      })),
      { x: event.clientX, y: cursorY },
    )

    if (!sameOrder(nextOrder, gesture.order)) {
      // FLIP via the Web Animations API: record the others' current tops,
      // reflow into the new order, then play each from its old position with
      // a self-cleaning animation — no inline transform is ever left behind,
      // so an interrupted drag can't strand a panel mid-slide.
      const first = new Map(others.map((o) => [o.el, { left: o.rect.left, top: o.rect.top }] as const))
      dragged.style.transform = '' // measure the dragged slot naturally
      nextOrder.forEach((id, index) => {
        const el = siblings.find((s) => idOf(s) === id)
        if (el) el.style.order = String(index)
      })
      if (getComputedStyle(gesture.parent).display === 'block') {
        gesture.parent.classList.add('gp-island-flow')
      }
      const duration = prefersReducedMotion() ? 0 : 200
      others.forEach(({ el }) => {
        const last = el.getBoundingClientRect()
        const start = first.get(el) ?? { left: last.left, top: last.top }
        // Screen-space delta → local px (the card itself is zoom-scaled).
        const delta = screenVectorToLocal(
          { x: start.left - last.left, y: start.top - last.top },
          gesture.scaleX,
          gesture.scaleY,
        )
        if (!delta.x && !delta.y) return
        gesture.flips.get(el)?.cancel()
        gesture.flips.set(
          el,
          el.animate(
            [{ transform: `translate(${delta.x}px, ${delta.y}px)` }, { transform: 'translate(0, 0)' }],
            { duration, easing: 'cubic-bezier(0.2, 0.7, 0.25, 1)' },
          ),
        )
      })
      const naturalRect = dragged.getBoundingClientRect()
      gesture.naturalTop = naturalRect.top
      gesture.naturalLeft = naturalRect.left
      gesture.order = nextOrder
      gesture.changed = true
    }

    // Keep the original grab point under the cursor in both axes. Clamp the
    // viewport target to the card, then convert that vector to local CSS px.
    const hostRect = hostRef.current?.getBoundingClientRect()
    const draggedRect = dragged.getBoundingClientRect()
    const rawLeft = gesture.startLeft + event.clientX - gesture.startCursorX
    const rawTop = gesture.startTop + cursorY - gesture.startCursorY
    const targetLeft = hostRect ? clamp(rawLeft, hostRect.left, hostRect.right - draggedRect.width) : rawLeft
    const targetTop = hostRect ? clamp(rawTop, hostRect.top, hostRect.bottom - draggedRect.height) : rawTop
    const { x: tx, y: ty } = screenVectorToLocal(
      { x: targetLeft - gesture.naturalLeft, y: targetTop - gesture.naturalTop },
      gesture.scaleX,
      gesture.scaleY,
    )
    dragged.style.transform = `translate(${tx}px, ${ty}px) scale(1.015)`
  }

  const endReorder = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.kind !== 'reorder' || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null
    const host = hostRef.current
    const dragged = gesture.element
    host?.removeAttribute('data-focus-reordering')

    // Ease the panel from its floating position into the landing slot. The
    // siblings' FLIP animations own themselves and settle without help.
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      dragged.removeEventListener('transitionend', settle)
      resetIsland(dragged)
      liftedRef.current = null
      if (host) requestAnimationFrame(() => setIslands(measureIslands(host)))
    }
    dragged.style.transition = 'transform 240ms cubic-bezier(0.2, 0.7, 0.25, 1)'
    dragged.style.transform = 'translate(0px, 0px) scale(1)'
    dragged.addEventListener('transitionend', settle)
    window.setTimeout(settle, 320)

    if (!gesture.changed || !host) return
    // Persist: splice the new sibling order back into the card's full order.
    const idOf = (el: HTMLElement) => islandId(el, gesture.all.indexOf(el))
    const siblingOrder = [...gesture.siblings]
      .sort((a, b) => Number(a.style.order || 0) - Number(b.style.order || 0))
      .map(idOf)
    const savedOrder = useWidgetStore.getState().widgets[widgetId]?.metadata.islandLayout?.order ?? []
    const allIds = gesture.all.map((element, index) => islandId(element, index))
    persistLayout(widgetId, { order: mergeReorderDomain(savedOrder, allIds, siblingOrder) })
  }

  const reorderWithKeyboard = (island: IslandInfo, direction: -1 | 1) => {
    const host = hostRef.current
    const parent = island.element.parentElement
    if (!host || !parent) return
    const all = collectIslands(host)
    const siblings = all.filter((element) => element.parentElement === parent)
    const idOf = (element: HTMLElement) => islandId(element, all.indexOf(element))
    const order = visualFlowOrder(siblings.map((element) => {
      const rect = element.getBoundingClientRect()
      return { id: idOf(element), left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }))
    const index = order.indexOf(island.id)
    const nextIndex = clamp(index + direction, 0, order.length - 1)
    if (index < 0 || nextIndex === index) return
    const next = [...order]
    ;[next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!]
    useWidgetStore.getState().snapshotHistory(`island:${widgetId}`)
    const savedOrder = useWidgetStore.getState().widgets[widgetId]?.metadata.islandLayout?.order ?? []
    persistLayout(widgetId, { order: mergeReorderDomain(savedOrder, all.map(idOf), next) })
    setAnnouncement(`Panel ${island.id} moved to position ${nextIndex + 1} of ${order.length}.`)
  }

  const resizeWithKeyboard = (island: IslandInfo, dx: number, dy: number) => {
    const containerW = island.element.parentElement?.clientWidth ?? island.width
    const minW = Math.max(MIN_W, numberAttr(island.element, 'data-island-min-w', MIN_W))
    const minH = Math.max(MIN_H, numberAttr(island.element, 'data-island-min-h', MIN_H))
    const maxW = Math.max(minW, Math.min(containerW, numberAttr(island.element, 'data-island-max-w', containerW)))
    const maxH = Math.max(minH, Math.min(MAX_H, numberAttr(island.element, 'data-island-max-h', MAX_H)))
    let width = snap4(clamp(island.width + dx, minW, maxW))
    let height = snap4(clamp(island.height + dy, minH, maxH))
    if (island.sizing === 'width') height = island.height
    if (island.sizing === 'aspect') {
      const ratio = island.height > 0 ? island.width / island.height : 1
      height = snap4(clamp(width / ratio, minH, maxH))
      width = snap4(clamp(height * ratio, minW, maxW))
    }
    useWidgetStore.getState().snapshotHistory(`island:${widgetId}`)
    const current = useWidgetStore.getState().widgets[widgetId]?.metadata.islandLayout
    persistLayout(widgetId, { sizes: { ...current?.sizes, [island.id]: { width, ...(island.sizing === 'width' ? {} : { height }) } } })
    setAnnouncement(`Panel ${island.id} resized to ${width} by ${height} pixels.`)
  }

  return (
    <div role="group" aria-label="Focused panel layout controls" className="pointer-events-none absolute inset-0 z-30">
      <span className="sr-only" aria-live="polite">{announcement}</span>
      {islands.map((island) => (
        <div
          key={island.id}
          role={island.reorderable ? 'button' : undefined}
          tabIndex={island.reorderable ? 0 : undefined}
          aria-label={island.reorderable ? `Drag to rearrange panel ${island.id}` : undefined}
          title={island.reorderable ? 'Drag to rearrange' : undefined}
          className={`gp-focus-island absolute${island.reorderable ? ' gp-focus-island--drag pointer-events-auto' : ''}`}
          style={{ left: island.x, top: island.y, width: island.width, height: island.height }}
          onPointerDown={island.reorderable ? (event) => beginReorder(event, island) : undefined}
          onPointerMove={island.reorderable ? moveReorder : undefined}
          onPointerUp={island.reorderable ? endReorder : undefined}
          onPointerCancel={island.reorderable ? endReorder : undefined}
          onKeyDown={island.reorderable ? (event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); reorderWithKeyboard(island, -1) }
            if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); reorderWithKeyboard(island, 1) }
          } : undefined}
        >
          {island.sizing !== 'fixed' && (
            <button
              type="button"
              aria-label={`Resize panel ${island.id}`}
              title={
                island.sizing === 'aspect'
                  ? 'Resize (keeps its proportions)'
                  : island.sizing === 'width'
                    ? 'Resize width'
                    : 'Resize'
              }
              data-sizing={island.sizing}
              className="gp-focus-resize pointer-events-auto"
              onPointerDown={(event) => beginResize(event, island)}
              onPointerMove={moveResize}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              onKeyDown={(event) => {
                const amount = event.shiftKey ? 16 : SUB_GRID
                if (event.key === 'ArrowLeft') { event.preventDefault(); resizeWithKeyboard(island, -amount, 0) }
                if (event.key === 'ArrowRight') { event.preventDefault(); resizeWithKeyboard(island, amount, 0) }
                if (event.key === 'ArrowUp' && island.sizing !== 'width') { event.preventDefault(); resizeWithKeyboard(island, 0, -amount) }
                if (event.key === 'ArrowDown' && island.sizing !== 'width') { event.preventDefault(); resizeWithKeyboard(island, 0, amount) }
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}
