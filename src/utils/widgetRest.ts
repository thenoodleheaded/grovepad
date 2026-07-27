import type { Size, Vector2D, Widget } from '../types/spatial'
import { GRID_SIZE } from '../types/spatial'
import { widgetDefinition } from '../widgets/registry'
import { restingFace } from './restingFace'

/**
 * The floating title row — icon square, name, and the static action buttons —
 * lives in a one-cell strip ABOVE a card's own box. It is chrome, but it is
 * chrome that must not be drawn over, so every geometry pass that reserves
 * space for a widget reserves this strip too (`widgetShowsTitleRow`).
 */
export const WIDGET_TITLE_ROW = GRID_SIZE // 40

/**
 * Whether a widget actually shows that row right now. Mirrors WidgetCard's own
 * rule so the reserved space and the painted chrome can never disagree: an
 * icon and an icon-faced resting tile ARE their own identity mark and float no
 * capsule, and a glued member hands its name to the group frame — unless it is
 * pinned open, where that row carries its only Pin control.
 */
export function widgetShowsTitleRow(widget: Widget, options: { glued?: boolean } = {}): boolean {
  if (widget.iconified === true) return false
  if (isWidgetResting(widget, { expandedWidgetId: null }) && restingFace(widget).model.kind === 'icon') {
    return false
  }
  if (options.glued && widget.metadata.pinned !== true) return false
  return true
}

// ---------------------------------------------------------------------------
// Resting-face system, pure decisions.
//
// Every widget type shows a compact, non-editable summary tile at rest by
// default and only becomes the full
// interactive card while ephemerally expanded (see useWidgetRestStore).
// The stored widget record is untouched: `size` keeps the full-card
// dimensions, so expansion needs no layout mutation and collapse needs no
// restore step. Everything that draws or anchors to a widget's on-screen
// footprint (card shell, relation/dependency lines, wires) must go through
// `effectiveWidgetSize` so visuals and geometry can never disagree.
// ---------------------------------------------------------------------------

/** The stock expand/collapse window, and the fallback wherever the live
 * duration cannot be read (tests, SSR, a detached node). Kept in step with the
 * `--gp-motion-layout` default in index.css. */
export const REST_TRANSITION_MS = 300

/**
 * How long THIS card's expand or collapse glide will actually take.
 *
 * `--gp-motion-layout` is not a constant: the Fine-tune menu (Motion → Layout
 * movement) moves it anywhere between 80ms and 800ms, and
 * `prefers-reduced-motion` flattens it to nothing. So every hold that has to
 * outlive the glide — the outgoing content subtree, the blur halo, the
 * stacking lift that keeps a collapsing card above its neighbours — must read
 * the duration off the element that is actually transitioning, never off the
 * constant above. When the two clocks drift apart the seam is visible: a hold
 * SHORTER than the glide unmounts the content mid-flight, blinks the halo out
 * while it is still at full strength, and drops a half-collapsed card behind
 * the widgets it is still covering; a hold LONGER than the glide leaves
 * full-size content sitting inside a tile that has already finished closing.
 */
export function restGlideMs(element: Element | null | undefined): number {
  if (!element || typeof window === 'undefined' || !window.getComputedStyle) {
    return REST_TRANSITION_MS
  }
  // The card box glides on one shorthand, so every listed property shares a
  // duration; the first entry is the whole story.
  const [first] = window.getComputedStyle(element).transitionDuration.split(',')
  const raw = first?.trim()
  if (!raw) return REST_TRANSITION_MS
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value < 0) return REST_TRANSITION_MS
  return raw.endsWith('ms') ? value : value * 1000
}

export interface WidgetRestContext {
  expandedWidgetId: string | null
  /** The offset captured when the expanded card opened (useWidgetRestStore).
   * Absent means "not expanded, or nothing to offset". */
  expandedOffset?: Vector2D | null
}

/** Whether the resting system governs this widget at all right now. An
 * eligible widget is in exactly one of two states: resting, or the single
 * ephemerally expanded card. Glued widgets are governed exactly like
 * standalone widgets — they rest to their content tile, expand on click, and
 * pin open; welds hug whatever footprint each card shows. */
function restEligible(widget: Widget, _ctx: WidgetRestContext): boolean {
  // A widget of an unknown type (a retired module in a loaded board) has no
  // registry entry. Treat it as never resting rather than dereferencing
  // `undefined` — a crash here in the glue geometry took the whole canvas down.
  const definition = widgetDefinition(widget.type) as ReturnType<typeof widgetDefinition> | undefined
  if (!definition || definition.restingFace === false) return false
  // A user-authored icon state outranks the resting system entirely.
  if (widget.iconified === true) return false
  // Pinned means held open: the card leaves the accordion for good rather than
  // becoming its expanded member, so it keeps its stored footprint exactly —
  // no resting tile, no centre-anchored offset, no lifted stacking order. A
  // permanent state must not draw somewhere its saved position doesn't say.
  if (widget.metadata.pinned === true) return false
  return true
}

/** Whether this widget currently shows its resting face. */
export function isWidgetResting(widget: Widget, ctx: WidgetRestContext): boolean {
  return restEligible(widget, ctx) && ctx.expandedWidgetId !== widget.id
}

/** Whether this widget is the one currently expanded out of its resting face.
 * Not the same as a bare `expandedWidgetId` comparison: a stale id left over
 * from a card that has since been iconified
 * must not still read as expanded. */
export function isWidgetRestExpanded(widget: Widget, ctx: WidgetRestContext): boolean {
  return restEligible(widget, ctx) && ctx.expandedWidgetId === widget.id
}

/** Content-derived footprint of the resting tile — exactly the box the
 * face's information needs (see restingFace.ts), down to one bare icon cell. */
export function restingTileSize(widget: Pick<Widget, 'type' | 'data' | 'size' | 'title'>): Size {
  return restingFace(widget).size
}

/** The size the widget actually occupies on screen right now. */
export function effectiveWidgetSize(widget: Widget, resting: boolean): Size {
  return resting ? restingTileSize(widget) : widget.size
}

/** The offset a card opens with, so it grows out of the middle of the tile it
 * replaces rather than unfolding down-and-right from a shared top-left corner:
 * the thing you pressed stays under the pointer. Computed once, at the moment
 * of expansion — see `restExpansionOffsetFor`. */
export function expansionOffsetFor(tile: Size, full: Size): Vector2D {
  return {
    x: (tile.width - full.width) / 2,
    y: (tile.height - full.height) / 2,
  }
}

/** The offset an expanded card is currently drawn at. Read from the context
 * rather than recomputed, because it is frozen for the life of the expansion:
 * deriving it from the live size made every resize move the card by half the
 * change, which grew both sides however few you had hold of. Like the
 * expansion itself this is view-only — the stored position never moves — so
 * every surface that draws or anchors to the expanded card has to add it, or
 * its geometry detaches from the card it belongs to. */
export function restExpansionOffset(widget: Widget, ctx: WidgetRestContext): Vector2D {
  if (!isWidgetRestExpanded(widget, ctx)) return { x: 0, y: 0 }
  return ctx.expandedOffset ?? { x: 0, y: 0 }
}

/** The widget at its idle footprint: the resting tile when it rests, its
 * stored box otherwise (pinned, iconified, or a type that never rests). This
 * is the box glue geometry and settling must measure — weld seams, world
 * bounds for edge routing, and collision clusters all have to agree on the
 * same footprint, or lines anchor to a phantom full-card box the eye can't
 * see. Deliberately ignores the ephemeral expansion (expandedWidgetId: null):
 * an expanded member floats above the plate; the plate and its bounds stay
 * put around the tiles. */
export function restingFootprintWidget(widget: Widget): Widget {
  return isWidgetResting(widget, { expandedWidgetId: null })
    ? { ...widget, size: restingTileSize(widget) }
    : widget
}

/** The widget with its on-screen footprint substituted in — size while
 * resting, centre-anchored position while expanded. For geometry consumers
 * (relation/dependency lines, wires) that anchor to widget bounds. */
export function widgetWithEffectiveSize(widget: Widget, ctx: WidgetRestContext): Widget {
  if (isWidgetResting(widget, ctx)) return { ...widget, size: restingTileSize(widget) }
  const offset = restExpansionOffset(widget, ctx)
  if (offset.x === 0 && offset.y === 0) return widget
  return {
    ...widget,
    position: { x: widget.position.x + offset.x, y: widget.position.y + offset.y },
  }
}
