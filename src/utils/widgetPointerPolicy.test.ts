import { describe, expect, it } from 'vitest'
import {
  pressWithinResizeCorner,
  RESIZE_CORNER_ZONE_PX,
  resolveWidgetPointerIntent,
  shouldEnterWidgetEditFocus,
  usesAdditiveWidgetSelection,
} from './widgetPointerPolicy'

const base = {
  pointerType: 'mouse',
  interactionMode: 'navigate' as const,
  isInteractiveTarget: false,
  isFocused: false,
  isLocked: false,
  hasModifier: false,
  wantsLink: false,
  isGrouped: false,
  isTargetingLink: false,
}

describe('widget pointer policy', () => {
  it('preserves mouse body dragging and mouse relation gestures', () => {
    expect(resolveWidgetPointerIntent(base)).toBe('drag')
    expect(resolveWidgetPointerIntent({ ...base, wantsLink: true, hasModifier: true })).toBe('link')
  })

  it('selects from touch content instead of accidentally moving the widget', () => {
    expect(resolveWidgetPointerIntent({ ...base, pointerType: 'touch' })).toBe('select')
  })

  it('lets Pencil manipulate only while the Select tool is explicit', () => {
    expect(resolveWidgetPointerIntent({ ...base, pointerType: 'pen' })).toBe('select')
    expect(resolveWidgetPointerIntent({ ...base, pointerType: 'pen', interactionMode: 'select' })).toBe('drag')
  })

  it('leaves controls and focused widgets with their own pointer ownership', () => {
    expect(resolveWidgetPointerIntent({ ...base, isInteractiveTarget: true })).toBe('ignore')
    expect(resolveWidgetPointerIntent({ ...base, isFocused: true })).toBe('ignore')
    expect(resolveWidgetPointerIntent({ ...base, isLocked: true })).toBe('select')
  })

  it('makes explicit touch Select own controls instead of activating them', () => {
    expect(resolveWidgetPointerIntent({
      ...base,
      pointerType: 'touch',
      interactionMode: 'select',
      isInteractiveTarget: true,
    })).toBe('select')
  })

  it('lets relation target mode claim even an interactive widget surface', () => {
    expect(
      resolveWidgetPointerIntent({
        ...base,
        pointerType: 'touch',
        isInteractiveTarget: true,
        isFocused: true,
        isTargetingLink: true,
      }),
    ).toBe('target-link')
  })

  it('makes explicit touch/Pencil Select mode additive without Shift', () => {
    expect(usesAdditiveWidgetSelection('touch', 'select', false)).toBe(true)
    expect(usesAdditiveWidgetSelection('pen', 'select', false)).toBe(true)
    expect(usesAdditiveWidgetSelection('touch', 'navigate', false)).toBe(false)
    expect(usesAdditiveWidgetSelection('mouse', 'select', false)).toBe(false)
    expect(usesAdditiveWidgetSelection('mouse', 'navigate', true)).toBe(true)
  })

  it('enters focused editing only from a touch or Pencil control in Navigate mode', () => {
    const editBase = {
      pointerType: 'touch',
      interactionMode: 'navigate' as const,
      isInteractiveTarget: true,
      isTextEntryTarget: false,
      isInsideContent: true,
      isAlreadyFocused: false,
      isTargetingLink: false,
    }
    expect(shouldEnterWidgetEditFocus(editBase)).toBe(true)
    expect(shouldEnterWidgetEditFocus({ ...editBase, pointerType: 'mouse' })).toBe(false)
    expect(shouldEnterWidgetEditFocus({ ...editBase, interactionMode: 'select' })).toBe(false)
    expect(shouldEnterWidgetEditFocus({ ...editBase, isTargetingLink: true })).toBe(false)
    expect(shouldEnterWidgetEditFocus({ ...editBase, isInsideContent: false })).toBe(false)
    expect(shouldEnterWidgetEditFocus({ ...editBase, pointerType: 'pen', isTextEntryTarget: true })).toBe(false)
    expect(shouldEnterWidgetEditFocus({ ...editBase, pointerType: 'touch', isTextEntryTarget: true })).toBe(true)
  })

  it('routes presses inside the bottom-right corner zone to resize', () => {
    const rect = { right: 440, bottom: 240 }
    // Dead center of the 13px bracket and the zone's inner edge both count.
    expect(pressWithinResizeCorner(rect, 433, 233)).toBe(true)
    expect(pressWithinResizeCorner(rect, 440 - RESIZE_CORNER_ZONE_PX, 240 - RESIZE_CORNER_ZONE_PX)).toBe(true)
    // One px past the zone on either axis is the card body again.
    expect(pressWithinResizeCorner(rect, 440 - RESIZE_CORNER_ZONE_PX - 1, 233)).toBe(false)
    expect(pressWithinResizeCorner(rect, 433, 240 - RESIZE_CORNER_ZONE_PX - 1)).toBe(false)
    // Outside the card (hover catch-all territory) never resizes.
    expect(pressWithinResizeCorner(rect, 441, 233)).toBe(false)
    expect(pressWithinResizeCorner(rect, 433, 241)).toBe(false)
  })
})
