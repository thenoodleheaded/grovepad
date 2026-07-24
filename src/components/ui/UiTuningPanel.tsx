import { useEffect, useState } from 'react'
import { SlidersHorizontal, RotateCcw, X, Sparkles } from 'lucide-react'
import { useUiTuningStore } from '../../store/useUiTuningStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import {
  effectiveTuneValue,
  TUNE_CATEGORIES,
  type TuneField,
} from './uiTuning'

const ADVANCED_GLOW = import.meta.env.DEV

const CHIP = 'rounded-full px-2.5 py-1 text-[11px] transition-colors'
const NUM_INPUT =
  'w-14 shrink-0 rounded bg-neutral-900/70 px-1 py-0.5 text-right tabular-nums text-[10px] text-neutral-200 outline-none focus:bg-neutral-800'

/** Trailing zero-free readout so 0.30 shows as 0.3 and 120 shows as 120. */
function readout(field: TuneField, value: number): string {
  const text = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
  return `${text}${field.unit}`
}

/**
 * The owner-facing appearance tuner (opened with G). One category is shown at a
 * time so the shell keeps a stable height; every slider previews live and
 * persists locally. The shell is fixed and clamped to the viewport so it can
 * never run off a screen edge, scrolling internally when a category is tall.
 */
export function UiTuningPanel() {
  const values = useUiTuningStore((state) => state.values)
  const setValue = useUiTuningStore((state) => state.setValue)
  const resetAll = useUiTuningStore((state) => state.resetAll)
  const setOpen = useUiTuningStore((state) => state.setOpen)

  const [tab, setTab] = useState(TUNE_CATEGORIES[0]?.id ?? '')

  useOverlayLifecycle(true)

  // The canvas shortcut layer stops at the overlay guard while this is open, so
  // the panel owns Escape itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  const category = TUNE_CATEGORIES.find((c) => c.id === tab) ?? TUNE_CATEGORIES[0]
  const overrideCount = Object.keys(values).length

  const openGlowTuner = () => {
    // Lazily reach for the dev-only aura store without importing it at module
    // scope, so the production bundle never pulls it in.
    import('../../store/useAuraTuningStore').then((m) => m.useAuraTuningStore.getState().setOpen(true))
  }

  return (
    <div
      data-canvas-ui
      role="dialog"
      aria-label="Fine-tune appearance"
      // `.gp-popup-surface` forces `position: relative`, which beats layered
      // Tailwind position utilities — so the viewport anchoring is set inline
      // where it wins the cascade, keeping the panel clamped inside the screen.
      style={{ position: 'fixed', top: '4rem', right: '1rem' }}
      className="gp-popup-surface gp-dialog gp-panel z-40 flex max-h-[calc(100vh-5rem)] w-[360px] max-w-[calc(100vw-2rem)] select-none flex-col overflow-hidden rounded-2xl shadow-xl"
    >
      <div className="flex items-center gap-2 border-b gp-hairline px-3 py-2 text-xs">
        <SlidersHorizontal size={13} className="text-emerald-400" aria-hidden />
        <span className="font-semibold text-neutral-200">Fine-tune</span>
        {overrideCount > 0 && (
          <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
            {overrideCount} changed
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={resetAll}
            disabled={overrideCount === 0}
            title="Reset everything to defaults"
            aria-label="Reset all tuning to defaults"
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-neutral-400 transition-colors enabled:hover:bg-neutral-800 enabled:hover:text-neutral-200 disabled:opacity-30"
          >
            <RotateCcw size={11} aria-hidden /> Reset
          </button>
          <button
            type="button"
            aria-label="Close fine-tune"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b gp-hairline bg-neutral-950/30 px-2.5 py-1.5">
        {TUNE_CATEGORIES.map((c) => {
          const changed = c.fields.some((f) => f.id in values)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setTab(c.id)}
              className={`${CHIP} ${
                category?.id === c.id
                  ? 'bg-neutral-700/60 text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {c.label}
              {changed && category?.id !== c.id ? ' •' : ''}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto px-3 py-3">
        {category?.fields.map((field) => {
          const value = effectiveTuneValue(field, values)
          const overridden = field.id in values
          return (
            <div key={field.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[12px] text-neutral-300">{field.label}</span>
                <span className="tabular-nums text-[11px] text-neutral-400">
                  {readout(field, value)}
                </span>
                <button
                  type="button"
                  disabled={!overridden}
                  title="Revert to default"
                  aria-label={`Revert ${field.label}`}
                  onClick={() => setValue(field.id, null)}
                  className="rounded p-0.5 text-neutral-600 transition-colors enabled:hover:bg-neutral-800 enabled:hover:text-neutral-200 disabled:opacity-0"
                >
                  <RotateCcw size={11} aria-hidden />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  className="min-w-0 flex-1 accent-emerald-400"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={value}
                  aria-label={field.label}
                  onChange={(e) => setValue(field.id, Number(e.target.value))}
                />
                <input
                  type="number"
                  className={NUM_INPUT}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={value}
                  onChange={(e) => setValue(field.id, Number(e.target.value))}
                />
              </div>
              {field.help && (
                <p className="text-[10.5px] leading-snug text-neutral-500">{field.help}</p>
              )}
            </div>
          )
        })}

        {ADVANCED_GLOW && category?.id === TUNE_CATEGORIES[0]?.id && (
          <button
            type="button"
            onClick={openGlowTuner}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-lg border gp-hairline py-1.5 text-[11px] text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <Sparkles size={12} aria-hidden /> Advanced glow tuner
          </button>
        )}
      </div>
    </div>
  )
}
