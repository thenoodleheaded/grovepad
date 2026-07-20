import type { InteractionMode } from './adaptiveInput'

export type WidgetPointerIntent = 'ignore' | 'target-link' | 'select' | 'drag' | 'link'

interface WidgetPointerIntentInput {
  pointerType: string
  interactionMode: InteractionMode
  isInteractiveTarget: boolean
  isFocused: boolean
  isLocked: boolean
  hasModifier: boolean
  wantsLink: boolean
  isGrouped: boolean
  isTargetingLink: boolean
}

export function resolveWidgetPointerIntent({
  pointerType,
  interactionMode,
  isInteractiveTarget,
  isFocused,
  isLocked,
  hasModifier,
  wantsLink,
  isGrouped,
  isTargetingLink,
}: WidgetPointerIntentInput): WidgetPointerIntent {
  // Target-picking is a temporary canvas mode. It must win over inner inputs,
  // tables, and buttons; otherwise content-heavy widgets have no tappable
  // surface that can complete the relation on touch screens.
  if (isTargetingLink) return 'target-link'
  if (isFocused) return 'ignore'
  if (
    isInteractiveTarget &&
    (pointerType === 'touch' || pointerType === 'pen') &&
    interactionMode === 'select'
  ) return 'select'
  if (isInteractiveTarget && !hasModifier) return 'ignore'
  if (isLocked) return 'select'
  if (wantsLink && !isGrouped && pointerType === 'mouse') return 'link'
  if (pointerType === 'touch') return 'select'
  if (pointerType === 'pen') return interactionMode === 'select' ? 'drag' : 'select'
  return 'drag'
}

export function shouldEnterWidgetEditFocus({
  pointerType,
  interactionMode,
  isInteractiveTarget,
  isTextEntryTarget,
  isInsideContent,
  isAlreadyFocused,
  isTargetingLink,
}: {
  pointerType: string
  interactionMode: InteractionMode
  isInteractiveTarget: boolean
  isTextEntryTarget: boolean
  isInsideContent: boolean
  isAlreadyFocused: boolean
  isTargetingLink: boolean
}): boolean {
  return (
    (pointerType === 'touch' || pointerType === 'pen') &&
    !(pointerType === 'pen' && isTextEntryTarget) &&
    interactionMode === 'navigate' &&
    isInteractiveTarget &&
    isInsideContent &&
    !isAlreadyFocused &&
    !isTargetingLink
  )
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
