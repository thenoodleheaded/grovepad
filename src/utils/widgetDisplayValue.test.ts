import { describe, expect, it } from 'vitest'
import { formatVitalValue } from './widgetDisplayValue'

describe('formatVitalValue', () => {
  it('keeps summary numbers readable without exposing floating-point noise', () => {
    expect(formatVitalValue(377.1236778684743)).toBe('377.12')
    expect(formatVitalValue(Number.NaN)).toBe('—')
  })

  it('preserves meaningful text and gives empty values a visible placeholder', () => {
    expect(formatVitalValue('breakfast: ; lunch: ; dinner:')).toBe('breakfast: ; lunch: ; dinner:')
    expect(formatVitalValue('  ')).toBe('—')
  })
})
