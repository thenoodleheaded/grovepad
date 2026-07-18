import { localDayKey } from '../../../../utils/localDate'

/** Shared style classes and numeric guards for the essential widget modules. Extracted verbatim from EssentialWidgets.tsx. */
export const inputClass =
  'gp-input w-full min-w-0 px-2 text-neutral-200 outline-none placeholder:text-neutral-700'
export const numericClass =
  'bg-transparent  tabular-nums text-neutral-200 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
export const panelClass = 'gp-island'

export function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, finite(value)))
}

export function todayISO(): string {
  return localDayKey()
}
