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

export function usesAdditiveWidgetSelection(
  pointerType: string,
  interactionMode: InteractionMode,
  shiftKey: boolean,
): boolean {
  return shiftKey || ((pointerType === 'touch' || pointerType === 'pen') && interactionMode === 'select')
}
