import type { ViewportClass } from './adaptiveInput'

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
