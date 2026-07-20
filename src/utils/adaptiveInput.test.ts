import { describe, expect, it } from 'vitest'
import {
  activeInputFromPointer,
  deriveAdaptiveInputCapabilities,
  interactionModeAcceptsDirectManipulation,
  viewportClassForWidth,
} from './adaptiveInput'

describe('adaptive input contracts', () => {
  it('classifies room by viewport width instead of user agent', () => {
    expect(viewportClassForWidth(390)).toBe('phone')
    expect(viewportClassForWidth(639)).toBe('phone')
    expect(viewportClassForWidth(640)).toBe('tablet')
    expect(viewportClassForWidth(1023)).toBe('tablet')
    expect(viewportClassForWidth(1024)).toBe('desktop')
  })

  it('keeps pointer capabilities independent so hybrid iPads stay hybrid', () => {
    expect(
      deriveAdaptiveInputCapabilities({
        width: 834,
        height: 1194,
        hasCoarsePointer: true,
        hasFinePointer: true,
        canHover: true,
        reducedMotion: false,
      }),
    ).toEqual({
      width: 834,
      height: 1194,
      hasCoarsePointer: true,
      hasFinePointer: true,
      canHover: true,
      reducedMotion: false,
      viewportClass: 'tablet',
      isLandscape: false,
    })
  })

  it('recognizes Pencil without losing the last input to synthetic events', () => {
    expect(activeInputFromPointer('pen', 'touch')).toBe('pen')
    expect(activeInputFromPointer('', 'pen')).toBe('pen')
  })

  it('reserves direct manipulation for selection and connection tools', () => {
    expect(interactionModeAcceptsDirectManipulation('edit', 'pen')).toBe(false)
    expect(interactionModeAcceptsDirectManipulation('select', 'touch')).toBe(true)
    expect(interactionModeAcceptsDirectManipulation('connect', 'pen')).toBe(true)
    expect(interactionModeAcceptsDirectManipulation('navigate', 'mouse')).toBe(false)
  })
})
