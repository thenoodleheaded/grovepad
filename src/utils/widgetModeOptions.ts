import type { WidgetModeOption } from '../widgets/contracts/registry'

/** The active option (falling back to the first one for a stale/unknown mode value) and the rest, in declared order. */
export function resolveModeOptions(
  options: readonly WidgetModeOption[],
  mode: string,
): { current: WidgetModeOption; others: WidgetModeOption[] } | null {
  if (options.length === 0) return null
  const current = options.find((option) => option.value === mode) ?? options[0]!
  return { current, others: options.filter((option) => option.value !== current.value) }
}
