import type { InteractionMode } from './adaptiveInput'

export type CanvasPointerIntent = 'pan' | 'select' | 'zoom-region' | 'none'

interface CanvasPointerIntentInput {
  button: number
  pointerType: string
  interactionMode: InteractionMode
  isEmptyCanvas: boolean
  isSpaceHeld: boolean
  isZHeld: boolean
  isShiftHeld: boolean
}

/** One decision table for mouse, trackpad clicks, touch, and Pencil. Two-finger
 * pinch is resolved before this function because it always owns navigation. */
export function resolveCanvasPointerIntent({
  button,
  interactionMode,
  isEmptyCanvas,
  isSpaceHeld,
  isZHeld,
  isShiftHeld,
}: CanvasPointerIntentInput): CanvasPointerIntent {
  if (button === 1) return 'pan'
  if (button !== 0 || !isEmptyCanvas) return 'none'
  if (isSpaceHeld) return 'pan'
  if (isZHeld) return 'zoom-region'
  if (isShiftHeld || interactionMode === 'select') return 'select'
  if (interactionMode === 'navigate') return 'pan'
  return 'none'
}
