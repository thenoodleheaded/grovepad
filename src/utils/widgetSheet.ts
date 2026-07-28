import type { ViewportClass } from './adaptiveInput'
import { clamp } from './math'

/**
 * The phone presentation of an opened widget.
 *
 * On a laptop a widget opens *in place*: the tile grows into the full card
 * where it sits, and the board stays visible around it (see widgetRest.ts and
 * useWidgetRestStore). A phone has no room for that — a full card is wider
 * than the screen, so opening in place either overflows the viewport or forces
 * the camera to chase the card. There the widget instead becomes its own
 * screen: a layer above everything, grown out of the exact rectangle the tile
 * occupied so the thing you tapped visibly becomes the thing you are looking
 * at, and folded back onto that same rectangle when it closes.
 *
 * Everything here is pure screen geometry — CSS pixels in viewport
 * coordinates, the same space `getBoundingClientRect()` reports — so the
 * flight can be reasoned about and tested without a DOM.
 */

/** A rectangle in viewport coordinates, plus the corner radius it is drawn
 * with. The radius travels with the rect because the sheet folds back onto a
 * resting tile, an icon square, or a bare image, and those round differently. */
export interface SheetOrigin {
  left: number
  top: number
  width: number
  height: number
  radius: number
}

export interface SheetViewport {
  width: number
  height: number
}

/**
 * Whether an opened widget takes over the screen instead of expanding in
 * place. Keyed on available room, never on a guessed device: a narrow browser
 * window on a laptop gets the same honest presentation, and a phone rotated
 * into a wide split view goes back to the in-place expansion without a reload.
 */
export function widgetOpensAsSheet(viewportClass: ViewportClass): boolean {
  return viewportClass === 'phone'
}

/** The sheet fully open: the clip is the whole layer and the corners are square,
 * because a screen has no corners of its own. */
export const SHEET_OPEN_CLIP = 'inset(0px 0px 0px 0px round 0px)'

/**
 * The `clip-path` that frames exactly `origin` inside a viewport-sized layer.
 *
 * This is the whole animation. The sheet's content is laid out at full size
 * from the first frame and never scales, so nothing inside it is ever squashed
 * or stretched; only the window onto it grows. Transitioning between this and
 * `SHEET_OPEN_CLIP` is therefore an undistorted grow-out-of-the-tile — the
 * same trick a phone home screen uses to open an app out of its icon.
 *
 * Insets are clamped into the layer: a tile sitting half off-screen (or one
 * measured a frame after a pan) still produces a legal, visible starting
 * window rather than a clip that reaches outside its own box.
 */
export function sheetOriginClip(origin: SheetOrigin, viewport: SheetViewport): string {
  const left = clamp(origin.left, 0, viewport.width)
  const top = clamp(origin.top, 0, viewport.height)
  const right = clamp(viewport.width - (origin.left + origin.width), 0, viewport.width - left)
  const bottom = clamp(viewport.height - (origin.top + origin.height), 0, viewport.height - top)
  const radius = Math.max(0, origin.radius)
  return `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`
}

/** The corner a sheet folds back onto when the card's own radius cannot be
 * read. Matches the full card's R0 in the glass constitution. */
export const SHEET_FALLBACK_RADIUS = 22

/**
 * The one DOM read in this module: where a widget's card sits on screen right
 * now, and what corner it is drawn with.
 *
 * Both ends of the flight go through this, so the rectangle a sheet grows out
 * of and the one it folds back onto can never be measured two different ways.
 * It is re-read at close rather than remembered, because the board can be
 * panned, zoomed or re-laid-out while a sheet is open. Returns null when the
 * card is not mounted — culled far off-screen, or deleted.
 */
export function widgetSheetOrigin(widgetId: string): SheetOrigin | null {
  const layout = document.querySelector(`[data-widget-id="${CSS.escape(widgetId)}"]`)
  if (!(layout instanceof HTMLElement)) return null
  const box = layout.getBoundingClientRect()
  if (box.width <= 0 || box.height <= 0) return null
  // The card's radius is set inline per scale state (tile 18, icon 16, bare
  // image 12, full card 22), so it is read off the element rather than guessed.
  const card = layout.querySelector('article')
  const radius = card ? Number.parseFloat(window.getComputedStyle(card).borderTopLeftRadius) : Number.NaN
  return {
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    radius: Number.isFinite(radius) ? radius : SHEET_FALLBACK_RADIUS,
  }
}

/**
 * The point a sheet grows out of and shrinks back into: the middle of the tile
 * or icon that was tapped, in viewport coordinates.
 *
 * The content inside the sheet scales around this point rather than around the
 * middle of the screen. That is the difference between a panel appearing over
 * the board and the widget itself coming toward you out of its own icon — a
 * tile in the bottom corner has to open from the bottom corner, or the eye
 * loses track of what became what.
 */
export function sheetOriginCenter(origin: SheetOrigin): { x: number; y: number } {
  return { x: origin.left + origin.width / 2, y: origin.top + origin.height / 2 }
}

/**
 * Where a sheet grows from when its tile cannot be measured — the card was
 * culled off-screen, or deleted while open. A small centred square reads as
 * "this came from the board" without pretending to know a position it doesn't.
 */
export function sheetFallbackOrigin(viewport: SheetViewport): SheetOrigin {
  const width = Math.min(220, viewport.width * 0.6)
  const height = Math.min(220, viewport.height * 0.4)
  return {
    left: (viewport.width - width) / 2,
    top: (viewport.height - height) / 2,
    width,
    height,
    radius: SHEET_FALLBACK_RADIUS,
  }
}

// ---------------------------------------------------------------------------
// Pull-down to dismiss
// ---------------------------------------------------------------------------

/** Past this much of the screen's height, letting go closes the sheet. */
const SHEET_DISMISS_FRACTION = 0.18
/** …but never further than this, so a tall phone doesn't demand a long haul. */
const SHEET_DISMISS_CEILING = 140

/**
 * How far the sheet actually travels for a given finger movement. Downward
 * drags follow the finger exactly; upward ones are absorbed, because there is
 * nothing above a full screen to pull it into and a sheet that lifts off the
 * top edge only exposes bare page behind it.
 */
export function sheetDragTravel(deltaY: number): number {
  return Math.max(0, deltaY)
}

/** Whether letting go here closes the sheet rather than snapping it back. */
export function sheetDragDismisses(travel: number, viewportHeight: number): boolean {
  const threshold = Math.min(SHEET_DISMISS_CEILING, viewportHeight * SHEET_DISMISS_FRACTION)
  return travel >= threshold
}

/**
 * The scrim's strength while the sheet is being pulled down: full at rest,
 * thinning as the board is revealed behind it, so the drag reads as letting
 * the screen go rather than sliding an opaque panel around.
 */
export function sheetDragScrim(travel: number, viewportHeight: number): number {
  if (viewportHeight <= 0) return 1
  return clamp(1 - travel / viewportHeight, 0, 1)
}
