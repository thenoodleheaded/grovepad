import type { InteractionMode } from './adaptiveInput'

export type WidgetPointerIntent = 'ignore' | 'target-link' | 'select' | 'drag' | 'link'

const INTERACTIVE_SELECTOR =
  'button, input, textarea, select, [contenteditable="true"], [data-widget-interactive="true"]'

/**
 * Whether a press landed on something that owns its own pointer behaviour.
 *
 * Deliberately typed against `Element`, not `HTMLElement`: an icon button's
 * hit area is mostly the `<svg>` glyph inside it, and an SVGElement is not an
 * HTMLElement. Guarding on HTMLElement made every icon-only control read as
 * bare card surface — the card began a drag, captured the pointer, and the
 * button's click never fired.
 */
export function isInteractiveWidgetTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLElement && target.isContentEditable) return true
  return target.closest(INTERACTIVE_SELECTOR) !== null
}

interface WidgetPointerIntentInput {
  pointerType: string
  interactionMode: InteractionMode
  isInteractiveTarget: boolean
  isLocked: boolean
  hasModifier: boolean
  wantsLink: boolean
  isTargetingLink: boolean
}

export function resolveWidgetPointerIntent({
  pointerType,
  interactionMode,
  isInteractiveTarget,
  isLocked,
  hasModifier,
  wantsLink,
  isTargetingLink,
}: WidgetPointerIntentInput): WidgetPointerIntent {
  // Target-picking is a temporary canvas mode. It must win over inner inputs,
  // tables, and buttons; otherwise content-heavy widgets have no tappable
  // surface that can complete the relation on touch screens.
  if (isTargetingLink) return 'target-link'
  if (
    isInteractiveTarget &&
    (pointerType === 'touch' || pointerType === 'pen') &&
    interactionMode === 'select'
  ) return 'select'
  if (isInteractiveTarget && !hasModifier) return 'ignore'
  if (isLocked) return 'select'
  if (wantsLink && pointerType === 'mouse') return 'link'
  if (pointerType === 'touch') return 'select'
  if (pointerType === 'pen') return interactionMode === 'select' ? 'drag' : 'select'
  return 'drag'
}

/** Square (screen px) at a card's bottom-right that always means "resize".
 * Slightly larger than the 13px visual bracket so imprecise grabs still land. */
export const RESIZE_CORNER_ZONE_PX = 22

/**
 * True when a card press lands in the resize-corner zone. The corner handle's
 * own pointer-events wake only on card :hover (chrome discipline), so a press
 * that arrives in the same instant as the approach falls through to the card
 * and would start a move. The card routes such presses back to resize.
 */
export function pressWithinResizeCorner(
  cardRect: { right: number; bottom: number },
  clientX: number,
  clientY: number,
  zone: number = RESIZE_CORNER_ZONE_PX,
): boolean {
  const dx = cardRect.right - clientX
  const dy = cardRect.bottom - clientY
  return dx >= 0 && dx <= zone && dy >= 0 && dy <= zone
}

export function usesAdditiveWidgetSelection(
  pointerType: string,
  interactionMode: InteractionMode,
  shiftKey: boolean,
): boolean {
  return shiftKey || ((pointerType === 'touch' || pointerType === 'pen') && interactionMode === 'select')
}
