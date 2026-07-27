import { describe, expect, it } from 'vitest'
import {
  clampRating,
  npsBand,
  npsScore,
  ratingChoiceForKey,
  ratingConfidence,
  ratingCriteria,
  ratingFromNps,
  rubricAverage,
  trafficChoice,
} from './ratingSkinModel'

describe('rating skin model', () => {
  it('keeps every presentation on one bounded 0–5 value', () => {
    expect(clampRating(-4)).toBe(0)
    expect(clampRating(2.26)).toBe(2.3)
    expect(clampRating(80)).toBe(5)
    expect(clampRating('broken')).toBe(0)
  })

  it('maps the visible NPS scale to the shared rating without losing half steps', () => {
    expect(ratingFromNps(0)).toBe(0)
    expect(ratingFromNps(7)).toBe(3.5)
    expect(ratingFromNps(10)).toBe(5)
    expect(npsScore(3.5)).toBe(7)
    expect(npsBand(6)).toBe('Detractor')
    expect(npsBand(8)).toBe('Passive')
    expect(npsBand(9)).toBe('Promoter')
  })

  it('turns any shared value into the nearest honest traffic signal', () => {
    expect(trafficChoice(0)).toBeNull()
    expect(trafficChoice(1.8)?.tone).toBe('red')
    expect(trafficChoice(3.7)?.tone).toBe('amber')
    expect(trafficChoice(4.8)?.tone).toBe('green')
  })

  it('normalizes persisted rubric rows and derives their published average', () => {
    const criteria = ratingCriteria({
      criteria: [
        { id: 'a', label: 'Quality', value: 4 },
        { id: 'b', label: 'Fit', value: 3.5 },
        { id: 'c', label: 'Finish', value: 12 },
      ],
    })
    expect(criteria.map((row) => row.value)).toEqual([4, 3.5, 5])
    expect(rubricAverage(criteria)).toBe(4.2)
  })

  it('seeds a newly worn Rubric from the rating already on the card', () => {
    expect(ratingCriteria({}, 4).map((row) => row.value)).toEqual([4, 4, 4])
  })

  it('bounds confidence details read from untrusted saved data', () => {
    expect(ratingConfidence({ percent: 140, evidence: 'Clear tests' })).toEqual({
      percent: 100,
      evidence: 'Clear tests',
    })
    expect(ratingConfidence({})).toEqual({ percent: 50, evidence: '' })
  })

  it('provides native arrow, Home, and End movement for discrete controls', () => {
    const choices = [1, 3, 5]
    expect(ratingChoiceForKey(choices, 3, 'ArrowRight')).toBe(5)
    expect(ratingChoiceForKey(choices, 3, 'ArrowLeft')).toBe(1)
    expect(ratingChoiceForKey(choices, 1, 'End')).toBe(5)
    expect(ratingChoiceForKey(choices, 5, 'Home')).toBe(1)
    expect(ratingChoiceForKey(choices, 3, 'Enter')).toBeNull()
  })
})
