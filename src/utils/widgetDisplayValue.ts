export function formatVitalValue(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—'
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
      notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard',
    }).format(value)
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  const text = String(value ?? '').trim()
  return text || '—'
}
