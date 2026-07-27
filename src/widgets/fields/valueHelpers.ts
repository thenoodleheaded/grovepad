import type {
  DecisionMatrixData,
  FormField,
} from '../../types/spatial'
export { convertedUnit } from '../../components/widgets/modules/unitConverterSkinModel'
import type { FieldValue } from '../contracts/fields'

export function num(v: FieldValue): number {
  if (Array.isArray(v)) return v.at(-1)?.v ?? 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'boolean') return v ? 1 : 0
  const parsed = parseFloat(v)
  return Number.isFinite(parsed) ? parsed : 0
}

export function text(v: FieldValue): string {
  if (Array.isArray(v)) return v.map((point) => point.v).join(', ')
  return typeof v === 'string' ? v : String(v)
}

export function bool(v: FieldValue): boolean {
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v >= 1
  return v === 'true' || v === '1' || v === 'yes' || v === 'on'
}

export function primaryZoneTime(zones: string[]): string {
  const zone = zones[0]
  if (!zone) return '--:--'
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: zone }).format(new Date())
  } catch {
    return '--:--'
  }
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export function daysUntil(date: string): number {
  if (!date) return 0
  const target = new Date(`${date}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.ceil((target.getTime() - today.getTime()) / 86_400_000)
  return Number.isFinite(days) ? days : 0
}

export function formFieldFilled(field: FormField): boolean {
  if (field.type === 'checkbox') return field.value === true
  return String(field.value).trim().length > 0
}

export function decisionWinner(data: DecisionMatrixData): { label: string; score: number } {
  let winner = { label: '', score: 0 }
  data.options.forEach((option) => {
    const score = data.criteria.reduce(
      (sum, criterion, index) =>
        sum +
        (Number.isFinite(criterion.weight) ? criterion.weight : 0) *
          (Number.isFinite(option.scores[index]) ? option.scores[index]! : 0),
      0,
    )
    if (!winner.label || score > winner.score) winner = { label: option.label, score }
  })
  return winner
}
