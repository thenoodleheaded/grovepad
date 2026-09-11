import type { ActiveInput, InteractionMode, ViewportClass } from './adaptiveInput'

/**
 * The minimap is useful permanent chrome on a large canvas, but on a phone or
 * a short landscape viewport it would compete with the mode dock and zoom
 * controls. Compact viewports therefore open it only for the current visit;
 * the user's persisted larger-screen preference is left untouched.
 */
export function isMinimapExpanded(
  viewportClass: ViewportClass,
  desktopCollapsed: boolean,
  compactExpanded: boolean,
  shortViewport = false,
): boolean {
  return viewportClass === 'phone' || shortViewport ? compactExpanded : !desktopCollapsed
}

/**
 * A single tab is just a second label for the canvas the breadcrumbs already
 * name, so the row stays hidden until there is something to switch between. On
 * a phone that rule is absolute: the row costs a band of canvas it cannot
 * spare, and the canvas tree covers the same ground in a surface built for
 * small screens.
 */
export function isCanvasTabRowVisible(
  viewportClass: ViewportClass,
  openTabCount: number,
): boolean {
  return viewportClass !== 'phone' && openTabCount > 1
}

/**
 * Whether the canvas wears its touch chrome: the bottom mode dock, and the
 * selection-bar controls that stand in for Shift and the keyboard. Phones and
 * tablets always do, whatever is plugged in; a desktop-width screen does once
 * a finger or Pencil is the input in use. This mirrors the CSS rule that shows
 * `.gp-canvas-mode-dock` in 01-tokens-base.css, so the dock and the controls
 * that assume it appear and disappear together.
 */
export function usesTouchCanvasChrome(
  viewportClass: ViewportClass,
  activeInput: ActiveInput,
): boolean {
  return viewportClass !== 'desktop' || activeInput === 'touch' || activeInput === 'pen'
}

/**
 * Undo and Redo ride in the mode dock only where ZoomControls has dropped its
 * own pair (phone and tablet widths). A touch session on a desktop-width
 * screen already has them in the zoom row, and a second pair would be noise.
 */
export function modeDockShowsHistory(viewportClass: ViewportClass): boolean {
  return viewportClass !== 'desktop'
}

/**
 * A finger has no Shift key, so the selection bar offers "Select more": one
 * tap into Select mode, where every further tap adds to the selection. It is
 * offered only from Navigate. In Select mode taps already add, and in Circuit
 * mode switching tools would silently drop the wiring session.
 */
export function offersSelectMore(
  touchChrome: boolean,
  interactionMode: InteractionMode,
): boolean {
  return touchChrome && interactionMode === 'navigate'
}
