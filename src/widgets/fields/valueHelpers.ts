import type {
  DecisionMatrixData,
  FormField,
  FormulaData,
  UnitConverterData,
} from '../../types/spatial'
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

export function formulaValue(data: FormulaData): number {
  const a = Number.isFinite(data.a) ? data.a : 0
  const b = Number.isFinite(data.b) ? data.b : 0
  if (data.operator === 'add') return a + b
  if (data.operator === 'subtract') return a - b
  if (data.operator === 'multiply') return a * b
  if (data.operator === 'divide') return b === 0 ? 0 : a / b
  return b === 0 ? 0 : a % b
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

export const CONVERSION_FACTORS = {
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  mass: { mg: 0.000001, g: 0.001, kg: 1, oz: 0.0283495, lb: 0.453592, t: 1000 },
  time: { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, week: 604800 },
} as const

export function convertedUnit(data: UnitConverterData): number {
  const value = Number.isFinite(data.value) ? data.value : 0
  if (data.category !== 'temperature') {
    const factors = CONVERSION_FACTORS[data.category] as Record<string, number>
    return (value * (factors[data.from] ?? 1)) / (factors[data.to] ?? 1)
  }
  let celsius = value
  if (data.from === 'F') celsius = (value - 32) * (5 / 9)
  else if (data.from === 'K') celsius = value - 273.15
  if (data.to === 'F') return celsius * (9 / 5) + 32
  if (data.to === 'K') return celsius + 273.15
  return celsius
}

