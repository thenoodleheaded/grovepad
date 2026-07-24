import { describe, expect, it } from 'vitest'
import {
  effectiveTuneValue,
  formatTuneValue,
  sanitizeTuningValues,
  TUNE_CATEGORIES,
  TUNE_FIELDS,
} from './uiTuning'

const haloBlur = TUNE_FIELDS.haloBlur!
const haloSoftness = TUNE_FIELDS.haloSoftness!
const motionLayout = TUNE_FIELDS.motionLayout!
const haloDim = TUNE_FIELDS.haloDim!

describe('uiTuning catalogue', () => {
  it('exposes a flat lookup covering every category field', () => {
    const flat = TUNE_CATEGORIES.flatMap((c) => c.fields)
    expect(Object.keys(TUNE_FIELDS)).toHaveLength(flat.length)
    for (const field of flat) expect(TUNE_FIELDS[field.id]).toBe(field)
  })

  it('gives every field a default inside its own bounds', () => {
    for (const field of Object.values(TUNE_FIELDS)) {
      expect(field.default).toBeGreaterThanOrEqual(field.min)
      expect(field.default).toBeLessThanOrEqual(field.max)
    }
  })
})

describe('sanitizeTuningValues', () => {
  it('drops unknown keys and defaults, keeps genuine overrides', () => {
    const out = sanitizeTuningValues({
      haloBlur: 20,
      haloSoftness: haloSoftness.default, // equals default → omitted
      bogusKey: 5,
    })
    expect(out).toEqual({ haloBlur: 20 })
  })

  it('clamps out-of-range numbers into bounds', () => {
    expect(sanitizeTuningValues({ haloBlur: 999 })).toEqual({ haloBlur: haloBlur.max })
    expect(sanitizeTuningValues({ motionLayout: -50 })).toEqual({ motionLayout: motionLayout.min })
  })

  it('ignores non-finite and non-numeric values', () => {
    expect(sanitizeTuningValues({ haloBlur: Number.NaN })).toEqual({})
    expect(sanitizeTuningValues({ haloBlur: 'wide' })).toEqual({})
    expect(sanitizeTuningValues(null)).toEqual({})
  })
})

describe('effectiveTuneValue', () => {
  it('returns the override when present, else the default', () => {
    expect(effectiveTuneValue(haloBlur, { haloBlur: 22 })).toBe(22)
    expect(effectiveTuneValue(haloBlur, {})).toBe(haloBlur.default)
  })

  it('clamps a stored value that has drifted out of range', () => {
    expect(effectiveTuneValue(haloBlur, { haloBlur: 9999 })).toBe(haloBlur.max)
  })
})

describe('formatTuneValue', () => {
  it('appends the field unit', () => {
    expect(formatTuneValue(haloBlur, 13)).toBe('13px')
    expect(formatTuneValue(haloSoftness, 55)).toBe('55%')
    expect(formatTuneValue(motionLayout, 300)).toBe('300ms')
    expect(formatTuneValue(haloDim, 0.3)).toBe('0.3')
  })
})
