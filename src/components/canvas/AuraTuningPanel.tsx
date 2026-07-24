import { useMemo, useState } from 'react'
import { Palette, RotateCcw, ClipboardCopy, X } from 'lucide-react'
import { useAuraTuningStore } from '../../store/useAuraTuningStore'
import { useThemeStore, type Theme } from '../../store/useThemeStore'
import { orderedDefinitions } from '../../widgets/registry'
import {
  AURA_NUMERIC_KEYS,
  auraNumericBounds,
  sanitizeAuraDocument,
  type AuraThemeTuning,
  type CanvasColorTuning,
} from './auraTuning'

const NUMERIC_LABELS: Record<string, string> = {
  alpha: 'Overall intensity',
  coreAlpha: 'Centre intensity',
  midStop: 'Bright ring position',
  midAlpha: 'Bright ring intensity',
  reach: 'Reach (× widget size)',
  scatter: 'Scatter radius',
  blur: 'Blur',
  minRadius: 'Min radius (× screen)',
  maxRadius: 'Max radius (× screen)',
  maxEmitters: 'Max emitters',
  settleMs: 'Settle delay (ms)',
  glide: 'Glide speed',
}

const CANVAS_LABELS: Record<keyof CanvasColorTuning, string> = {
  canvasTintBase: 'Canvas tint base',
  gridCoarse: 'Grid (coarse)',
  gridFine: 'Grid (fine)',
}

const STEPS: Record<string, number> = { maxEmitters: 1, settleMs: 10, blur: 0.5 }

type Tab = 'aura' | 'canvas' | 'accents' | 'export'

const ROW = 'flex items-center gap-2 px-3 py-1 text-[11px] text-neutral-400'
const TEXT_INPUT =
  'min-w-0 flex-1 rounded bg-neutral-900/70 px-1.5 py-0.5 text-[10px] text-neutral-200 outline-none focus:bg-neutral-800'
const NUM_INPUT =
  'w-16 shrink-0 rounded bg-neutral-900/70 px-1 py-0.5 text-right tabular-nums text-[10px] text-neutral-200 outline-none focus:bg-neutral-800'
const CHIP = 'rounded px-2 py-0.5 transition-colors'

/** A colour input only accepts `#rrggbb`, so anything else stays text-only. */
function hexOrNull(value: string): string | null {
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : null
}

/**
 * Dev-only tuning surface for the ambient aura, the accents that feed it, and the
 * canvas colours behind it. Every edit previews live on the board; the Export tab
 * emits the whole document as one block to paste back for baking into the app.
 */
export function AuraTuningPanel() {
  const doc = useAuraTuningStore((state) => state.doc)
  const setAuraValue = useAuraTuningStore((state) => state.setAuraValue)
  const setCanvasValue = useAuraTuningStore((state) => state.setCanvasValue)
  const setAccent = useAuraTuningStore((state) => state.setAccent)
  const replace = useAuraTuningStore((state) => state.replace)
  const reset = useAuraTuningStore((state) => state.reset)
  const setOpen = useAuraTuningStore((state) => state.setOpen)
  const activeTheme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)

  const [tab, setTab] = useState<Tab>('aura')
  const [accentFilter, setAccentFilter] = useState('')
  const [importText, setImportText] = useState('')
  const [notice, setNotice] = useState('')

  // Edits always target the theme currently on screen, so what you tune is what
  // you are looking at. The switcher below flips the board itself.
  const theme: Theme = activeTheme
  const tuning = doc.aura[theme]

  const definitions = useMemo(() => orderedDefinitions(), [])
  const filteredDefinitions = useMemo(() => {
    const needle = accentFilter.trim().toLowerCase()
    if (!needle) return definitions
    return definitions.filter(
      (d) => d.type.toLowerCase().includes(needle) || d.label.toLowerCase().includes(needle),
    )
  }, [definitions, accentFilter])

  const exportJson = useMemo(() => JSON.stringify(doc, null, 2), [doc])
  const overrideCount = Object.keys(doc.accents).length

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice((current) => (current === message ? '' : current)), 2400)
  }

  const copyExport = () => {
    navigator.clipboard
      .writeText(exportJson)
      .then(() => flash('Copied — paste this back in chat to bake it in'))
      .catch(() => flash('Clipboard blocked — select the text below and copy manually'))
  }

  const applyImport = () => {
    try {
      replace(sanitizeAuraDocument(JSON.parse(importText)))
      setImportText('')
      flash('Applied')
    } catch {
      flash('That is not valid JSON')
    }
  }

  return (
    <div
      data-canvas-ui
      role="dialog"
      aria-label="Aura tuning"
      className="gp-popup-surface gp-dialog gp-panel absolute right-4 top-28 z-10 flex w-[380px] max-w-[calc(100vw-2rem)] select-none flex-col overflow-hidden rounded-2xl shadow-xl"
    >
      <div className="flex items-center gap-2 border-b gp-hairline px-3 py-2 text-xs text-neutral-400">
        <Palette size={13} className="text-emerald-400" aria-hidden />
        <span className="font-semibold text-neutral-300">Aura tuning</span>
        <div className="ml-auto flex items-center gap-1 text-[10px]">
          {(['dark', 'light'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={`${CHIP} ${theme === value ? 'bg-neutral-700/60 text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              {value}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Close aura tuning"
          onClick={() => setOpen(false)}
          className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          <X size={12} aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-1 border-b gp-hairline bg-neutral-950/30 px-3 py-1.5 text-[10px]">
        {(['aura', 'canvas', 'accents', 'export'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`${CHIP} ${tab === value ? 'bg-neutral-700/60 text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'}`}
          >
            {value}
            {value === 'accents' && overrideCount > 0 ? ` (${overrideCount})` : ''}
          </button>
        ))}
      </div>

      <div className="flex max-h-[60vh] flex-col overflow-y-auto py-1">
        {tab === 'aura' && (
          <>
            {AURA_NUMERIC_KEYS.map((key) => {
              const [min, max] = auraNumericBounds(key)
              const step = STEPS[key] ?? (max - min) / 200
              const value = tuning[key] as number
              return (
                <label key={key} className={ROW}>
                  <span className="w-32 shrink-0">{NUMERIC_LABELS[key] ?? key}</span>
                  <input
                    type="range"
                    className="min-w-0 flex-1 accent-emerald-400"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => setAuraValue(theme, key, Number(e.target.value) as never)}
                  />
                  <input
                    type="number"
                    className={NUM_INPUT}
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => setAuraValue(theme, key, Number(e.target.value) as never)}
                  />
                </label>
              )
            })}
            <label className={ROW}>
              <span className="w-32 shrink-0">Blend mode</span>
              <select
                className={TEXT_INPUT}
                value={tuning.blend}
                onChange={(e) =>
                  setAuraValue(theme, 'blend', e.target.value as AuraThemeTuning['blend'])
                }
              >
                <option value="lighter">lighter (additive)</option>
                <option value="source-over">source-over (overpaint)</option>
              </select>
            </label>
          </>
        )}

        {tab === 'canvas' &&
          (Object.keys(CANVAS_LABELS) as Array<keyof CanvasColorTuning>).map((key) => {
            const value = doc.canvas[theme][key]
            const hex = hexOrNull(value)
            return (
              <label key={key} className={ROW}>
                <span className="w-32 shrink-0">{CANVAS_LABELS[key]}</span>
                {hex ? (
                  <input
                    type="color"
                    className="h-5 w-6 shrink-0 rounded bg-transparent"
                    value={hex}
                    onChange={(e) => setCanvasValue(theme, key, e.target.value)}
                  />
                ) : (
                  <span
                    aria-hidden
                    className="h-5 w-6 shrink-0 rounded border gp-hairline"
                    style={{ background: value }}
                  />
                )}
                <input
                  type="text"
                  className={TEXT_INPUT}
                  value={value}
                  spellCheck={false}
                  onChange={(e) => setCanvasValue(theme, key, e.target.value)}
                />
              </label>
            )
          })}

        {tab === 'accents' && (
          <>
            <div className="px-3 py-1">
              <input
                type="search"
                className={`${TEXT_INPUT} w-full`}
                placeholder="Filter widgets…"
                value={accentFilter}
                spellCheck={false}
                onChange={(e) => setAccentFilter(e.target.value)}
              />
            </div>
            {filteredDefinitions.map((definition) => {
              const override = doc.accents[definition.type]?.[theme]
              const effective = override ?? definition.accent
              const hex = hexOrNull(effective)
              return (
                <label key={definition.type} className={ROW}>
                  <span className="w-28 shrink-0 truncate" title={definition.type}>
                    {definition.label}
                  </span>
                  <input
                    type="color"
                    className="h-5 w-6 shrink-0 rounded bg-transparent"
                    value={hex ?? '#ffffff'}
                    onChange={(e) => setAccent(definition.type, theme, e.target.value)}
                  />
                  <input
                    type="text"
                    className={TEXT_INPUT}
                    value={effective}
                    spellCheck={false}
                    onChange={(e) => setAccent(definition.type, theme, e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={!override}
                    title="Revert to the registry value"
                    aria-label={`Revert ${definition.label} accent`}
                    onClick={() => setAccent(definition.type, theme, null)}
                    className="rounded p-1 text-neutral-600 transition-colors enabled:hover:bg-neutral-800 enabled:hover:text-neutral-200 disabled:opacity-30"
                  >
                    <RotateCcw size={11} aria-hidden />
                  </button>
                </label>
              )
            })}
          </>
        )}

        {tab === 'export' && (
          <div className="flex flex-col gap-2 px-3 py-2 text-[11px] text-neutral-400">
            <p>
              This is the complete tuning document for both themes — everything needed to
              bake these values in. Copy it and paste it back in chat.
            </p>
            <button
              type="button"
              onClick={copyExport}
              className="flex items-center justify-center gap-1.5 rounded bg-neutral-800 py-1 text-neutral-200 transition-colors hover:bg-neutral-700"
            >
              <ClipboardCopy size={12} aria-hidden /> Copy tuning JSON
            </button>
            <textarea
              readOnly
              value={exportJson}
              rows={10}
              spellCheck={false}
              className="w-full resize-y rounded bg-neutral-900/70 p-2 tabular-nums text-[10px] text-neutral-300 outline-none"
            />
            <p>Paste a document here to restore it:</p>
            <textarea
              value={importText}
              rows={3}
              spellCheck={false}
              placeholder="Paste tuning JSON…"
              onChange={(e) => setImportText(e.target.value)}
              className="w-full resize-y rounded bg-neutral-900/70 p-2 tabular-nums text-[10px] text-neutral-300 outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={applyImport}
                disabled={!importText.trim()}
                className="flex-1 rounded bg-neutral-800 py-1 text-neutral-200 transition-colors enabled:hover:bg-neutral-700 disabled:opacity-40"
              >
                Apply pasted
              </button>
              <button
                type="button"
                onClick={reset}
                className="flex-1 rounded bg-neutral-800 py-1 text-neutral-200 transition-colors hover:bg-neutral-700"
              >
                Reset to defaults
              </button>
            </div>
          </div>
        )}
      </div>

      <div
        aria-live="polite"
        className="min-h-[22px] border-t gp-hairline px-3 py-1 text-[10px] text-emerald-400"
      >
        {notice}
      </div>
    </div>
  )
}
