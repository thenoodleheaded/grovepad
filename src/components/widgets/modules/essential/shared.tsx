import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { clamp } from './sharedPrimitives'

/** Shared micro-components for the essential widget modules. Extracted verbatim from EssentialWidgets.tsx. */
export function SmallAction({
  label,
  onClick,
  children,
  danger = false,
  disabled = false,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-25 ${
        danger
          ? 'text-neutral-700 hover:bg-red-500/10 hover:text-red-400'
          : 'text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300'
      }`}
    >
      {children}
    </button>
  )
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[10px] font-medium text-neutral-600 transition-colors hover:bg-neutral-800/70 hover:text-neutral-300"
    >
      <Plus size={10} aria-hidden />
      {label}
    </button>
  )
}

export function Stat({
  label,
  value,
  accent = 'text-neutral-300',
}: {
  label: string
  value: string | number
  accent?: string
}) {
  return (
    <div className="gp-well min-w-0 px-2 py-2">
      <p className="gp-label truncate">{label}</p>
      <p className={`gp-value truncate ${accent}`}>{value}</p>
    </div>
  )
}

export function ProgressBar({ value, color = '#34d399' }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800/80">
      <div
        className="h-full rounded-full transition-[width] duration-300 ease-out"
        style={{ width: `${clamp(value, 0, 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inputs and branch logic
// ---------------------------------------------------------------------------
