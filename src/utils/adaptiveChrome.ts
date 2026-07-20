import type { ViewportClass } from './adaptiveInput'

/**
 * The minimap is useful permanent chrome on a large canvas, but on a phone it
 * would compete with the mode dock and zoom controls. A phone therefore opens
 * it only for the current visit; the user's persisted desktop preference is
 * left untouched.
 */
export function isMinimapExpanded(
  viewportClass: ViewportClass,
  desktopCollapsed: boolean,
  phoneExpanded: boolean,
): boolean {
  return viewportClass === 'phone' ? phoneExpanded : !desktopCollapsed
}
