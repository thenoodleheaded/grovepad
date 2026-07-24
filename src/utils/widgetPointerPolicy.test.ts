import { describe, expect, it } from 'vitest'
import { resolveWidgetPointerIntent, usesAdditiveWidgetSelection } from './widgetPointerPolicy'

const base = {
  pointerType: 'mouse',
  interactionMode: 'navigate' as const,
  isInteractiveTarget: false,
  isLocked: false,
  hasModifier: false,
  wantsLink: false,
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

  it('leaves controls with their own pointer ownership', () => {
    expect(resolveWidgetPointerIntent({ ...base, isInteractiveTarget: true })).toBe('ignore')
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

})
