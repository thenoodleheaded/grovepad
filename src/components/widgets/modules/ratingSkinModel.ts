import type { RatingData } from '../../../types/spatial'
import type { WidgetSkinState } from '../../../utils/widgetSkins'

export type RatingSkinMode = NonNullable<RatingData['skin']>

export const RATING_SKINS: readonly RatingSkinMode[] = [
  'stars',
  'slider',
  'emoji',
  'traffic_light',
  'nps',
  'rubric',
  'confidence',
]

export interface RatingChoice {
  value: number
  label: string
}

export const EMOJI_CHOICES = [
  { value: 1, emoji: '😞', label: 'Awful' },
  { value: 2, emoji: '🙁', label: 'Poor' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '🤩', label: 'Amazing' },
] as const

export const TRAFFIC_CHOICES = [
  { value: 1, label: 'Needs attention', tone: 'red' },
  { value: 3, label: 'Watch closely', tone: 'amber' },
  { value: 5, label: 'On track', tone: 'green' },
] as const

export interface RatingCriterion {
  id: string
  label: string
  value: number
}

const DEFAULT_CRITERIA: readonly RatingCriterion[] = [
  { id: 'quality', label: 'Quality', value: 0 },
  { id: 'fit', label: 'Fit', value: 0 },
  { id: 'finish', label: 'Finish', value: 0 },
]

export function ratingSkinMode(value: unknown): RatingSkinMode {
  return typeof value === 'string' && RATING_SKINS.includes(value as RatingSkinMode)
    ? value as RatingSkinMode
    : 'stars'
}

/** Persisted and circuit-written numbers are untrusted; every skin shares 0–5. */
export function clampRating(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(5, Math.max(0, Math.round(numeric * 10) / 10))
}

export function formatRating(value: unknown): string {
  const rating = clampRating(value)
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1)
}

export function ratingWord(value: unknown): string {
  const rating = clampRating(value)
  if (rating === 0) return 'Not rated'
  if (rating < 1.5) return 'Very poor'
  if (rating < 2.5) return 'Poor'
  if (rating < 3.5) return 'Okay'
  if (rating < 4.5) return 'Good'
  return 'Excellent'
}

export function npsScore(value: unknown): number {
  return Math.round(clampRating(value) * 2)
}

export function ratingFromNps(score: unknown): number {
  const numeric = typeof score === 'number' ? score : Number(score)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(10, Math.max(0, Math.round(numeric))) / 2
}

export function npsBand(score: unknown): 'Detractor' | 'Passive' | 'Promoter' {
  const numeric = Math.min(10, Math.max(0, Math.round(Number(score) || 0)))
  if (numeric <= 6) return 'Detractor'
  if (numeric <= 8) return 'Passive'
  return 'Promoter'
}

export function trafficChoice(value: unknown): typeof TRAFFIC_CHOICES[number] | null {
  const rating = clampRating(value)
  if (rating <= 0) return null
  if (rating < 2.5) return TRAFFIC_CHOICES[0]
  if (rating < 4.5) return TRAFFIC_CHOICES[1]
  return TRAFFIC_CHOICES[2]
}

function boundedText(value: unknown, fallback: string, limit = 48): string {
  return typeof value === 'string' ? value.slice(0, limit) : fallback
}

export function ratingCriteria(
  state: WidgetSkinState,
  fallbackValue: unknown = 0,
): RatingCriterion[] {
  const seedValue = clampRating(fallbackValue)
  if (!Array.isArray(state.criteria)) {
    return DEFAULT_CRITERIA.map((row) => ({ ...row, value: seedValue }))
  }

  const rows: RatingCriterion[] = []
  for (const [index, candidate] of state.criteria.slice(0, 5).entries()) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const record = candidate as Record<string, unknown>
    rows.push({
      id: boundedText(record.id, `criterion-${index + 1}`, 80),
      label: boundedText(record.label, `Criterion ${index + 1}`),
      value: clampRating(record.value),
    })
  }
  return rows.length > 0
    ? rows
    : DEFAULT_CRITERIA.map((row) => ({ ...row, value: seedValue }))
}

export function rubricAverage(criteria: readonly RatingCriterion[]): number {
  if (criteria.length === 0) return 0
  return Math.round(
    criteria.reduce((total, criterion) => total + clampRating(criterion.value), 0)
      / criteria.length * 10,
  ) / 10
}

export interface RatingConfidence {
  percent: number
  evidence: string
}

export function ratingConfidence(state: WidgetSkinState): RatingConfidence {
  const percent = Number(state.percent)
  return {
    percent: Number.isFinite(percent)
      ? Math.min(100, Math.max(0, Math.round(percent)))
      : 50,
    evidence: boundedText(state.evidence, '', 140),
  }
}

/** Native radio-style movement shared by every discrete presentation. */
export function ratingChoiceForKey(
  choices: readonly number[],
  current: number,
  key: string,
): number | null {
  if (choices.length === 0) return null
  if (key === 'Home') return choices[0]!
  if (key === 'End') return choices[choices.length - 1]!

  const direction =
    key === 'ArrowRight' || key === 'ArrowUp'
      ? 1
      : key === 'ArrowLeft' || key === 'ArrowDown'
        ? -1
        : 0
  if (direction === 0) return null

  const exact = choices.indexOf(current)
  const nearest = exact >= 0
    ? exact
    : choices.reduce(
        (best, value, index) =>
          Math.abs(value - current) < Math.abs(choices[best]! - current) ? index : best,
        0,
      )
  return choices[Math.min(choices.length - 1, Math.max(0, nearest + direction))]!
}
