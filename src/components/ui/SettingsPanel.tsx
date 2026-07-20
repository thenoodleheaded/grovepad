import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Accessibility,
  Blocks,
  Check,
  Database,
  Download,
  Gauge,
  Keyboard,
  MousePointer2,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react'
import { supabaseConfigured } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { usePersistenceStatusStore } from '../../store/usePersistenceStatusStore'
import {
  useSettingsStore,
  type AppPreferences,
  type InterfaceScale,
  type VisualQuality,
} from '../../store/useSettingsStore'
import { useThemeStore } from '../../store/useThemeStore'
import { useToastStore } from '../../store/useToastStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { screenToWorld } from '../../types/spatial'
import { importBoardFileOntoCanvas } from '../../utils/boardCanvasImport'
import { buildGrovepadPackage, readGrovepadPackage } from '../../utils/grovepadPackage'
import { localDayKey } from '../../utils/localDate'
import { useFocusTrap } from '../../hooks/useFocusTrap'

type Category = 'appearance' | 'canvas' | 'input' | 'performance' | 'data'

const CATEGORIES = [
  { id: 'appearance' as const, label: 'Appearance', description: 'Theme, scale, contrast', icon: Palette },
  { id: 'canvas' as const, label: 'Canvas', description: 'Grid, glow, navigation', icon: SlidersHorizontal },
  { id: 'input' as const, label: 'Input', description: 'Mouse, touch, Pencil', icon: MousePointer2 },
  { id: 'performance' as const, label: 'Performance', description: 'Visual workload', icon: Gauge },
  { id: 'data' as const, label: 'Data & account', description: 'Files and cloud sync', icon: Database },
]

function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="gp-settings-row flex min-h-20 items-center justify-between gap-6 rounded-2xl px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-100">{title}</p>
        <p className="mt-0.5 max-w-xl text-xs leading-5 text-neutral-500">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`gp-settings-toggle relative h-8 w-14 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${checked ? 'bg-emerald-400/75' : 'bg-neutral-700'}`}
    >
      <span className={`absolute top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-emerald-700 shadow-md transition-transform ${checked ? 'translate-x-7' : 'translate-x-1'}`}>
        {checked && <Check size={12} strokeWidth={3} aria-hidden />}
      </span>
    </button>
  )
}

function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-xl bg-neutral-950/45 p-1 shadow-[inset_0_0_0_1px_var(--gp-hairline)]">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${value === option.value ? 'bg-neutral-700/90 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-200'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function RangeControl({ value, onChange, label, disabled = false }: { value: number; onChange: (value: number) => void; label: string; disabled?: boolean }) {
  return (
    <div className="flex w-48 items-center gap-3">
      <input aria-label={label} disabled={disabled} type="range" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-emerald-400 disabled:opacity-35" />
      <span className="w-9 text-right text-xs tabular-nums text-neutral-400">{value}%</span>
    </div>
  )
}

function viewCenterWorld() {
  const { pan, zoom, viewportSize } = useCanvasStore.getState()
  return screenToWorld(
    { x: viewportSize.width / 2, y: viewportSize.height / 2 },
    { x: pan.x, y: pan.y, zoom },
  )
}

export function SettingsPanel() {
  const open = useSettingsStore((state) => state.open)
  const settings = useSettingsStore()
  const theme = useThemeStore((state) => state.theme)
  const session = useAuthStore((state) => state.session)
  const syncEnabled = usePersistenceStatusStore((state) => state.syncEnabled)
  const [category, setCategory] = useState<Category>('appearance')
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useOverlayLifecycle(open)
  useFocusTrap(open, panelRef, closeRef)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useSettingsStore.getState().setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  const update = (next: Partial<AppPreferences>) => settings.update(next)
  const exportPackage = async () => {
    try {
      const bytes = await buildGrovepadPackage(useWidgetStore.getState())
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.grovepad.board+zip' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `grovepad-${localDayKey()}.grovepad`
      link.click()
      URL.revokeObjectURL(url)
      useToastStore.getState().addToast('Grovepad package downloaded')
    } catch {
      useToastStore.getState().addToast('Could not build the Grovepad package')
    }
  }
  const importPackage = async (file: File | undefined) => {
    if (!file) return
    try {
      const imported = await readGrovepadPackage(new Uint8Array(await file.arrayBuffer()))
      await importBoardFileOntoCanvas({ ...imported, filename: file.name })
      useSettingsStore.getState().setOpen(false)
    } catch {
      useToastStore.getState().addToast('That file is not a valid .grovepad package')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const content = {
    appearance: (
      <>
        <SettingRow title="Color theme" description="Choose the canvas and interface appearance used on this device.">
          <Segmented value={theme} label="Color theme" options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} onChange={(value) => useThemeStore.getState().setTheme(value)} />
        </SettingRow>
        <SettingRow title="Interface size" description="Scales application panels and controls without changing widget dimensions or board geometry.">
          <Segmented value={settings.interfaceScale} label="Interface size" options={[{ value: 1 as InterfaceScale, label: '100%' }, { value: 1.15 as InterfaceScale, label: '115%' }, { value: 1.3 as InterfaceScale, label: '130%' }]} onChange={(interfaceScale) => update({ interfaceScale })} />
        </SettingRow>
        <SettingRow title="High contrast" description="Strengthens panel separation, text, controls, and keyboard focus rings.">
          <Toggle checked={settings.highContrast} onChange={(highContrast) => update({ highContrast })} label="High contrast" />
        </SettingRow>
        <SettingRow title="Reduce motion" description="Stops decorative transitions and soft movement while preserving direct manipulation.">
          <Toggle checked={settings.reduceMotion} onChange={(reduceMotion) => update({ reduceMotion })} label="Reduce motion" />
        </SettingRow>
      </>
    ),
    canvas: (
      <>
        <SettingRow title="Ambient widget glow" description="Lets nearby widget colors softly influence the canvas. Economy mode pauses it automatically.">
          <Toggle checked={settings.canvasAura} onChange={(canvasAura) => update({ canvasAura })} label="Ambient widget glow" />
        </SettingRow>
        <SettingRow title="Glow strength" description="Controls how strongly widget accents appear in the ambient canvas light.">
          <RangeControl disabled={!settings.canvasAura || settings.visualQuality === 'economy'} value={settings.auraIntensity} onChange={(auraIntensity) => update({ auraIntensity })} label="Glow strength" />
        </SettingRow>
        <SettingRow title="Grid visibility" description="Adjusts both the coarse structure grid and fine placement dots.">
          <RangeControl value={settings.gridIntensity} onChange={(gridIntensity) => update({ gridIntensity })} label="Grid visibility" />
        </SettingRow>
        <SettingRow title="Canvas minimap" description="Shows the navigable board overview in the lower corner.">
          <Toggle checked={settings.showMinimap} onChange={(showMinimap) => update({ showMinimap })} label="Canvas minimap" />
        </SettingRow>
      </>
    ),
    input: (
      <>
        <div className="gp-settings-callout rounded-2xl p-4">
          <p className="text-sm font-semibold text-emerald-200">Sketchpad ink is focus-owned</p>
          <p className="mt-1 text-xs leading-5 text-neutral-400">Focus a Sketchpad, then draw immediately with a mouse or Apple Pencil. Fingers remain reserved for navigation and palm rejection; there is no separate Pencil mode.</p>
        </div>
        <SettingRow title="Magnetic widget hover" description="Lets a widget lean a few pixels toward a fine cursor. It stops at rest and costs nothing when idle.">
          <Toggle checked={settings.magneticHover} onChange={(magneticHover) => update({ magneticHover })} label="Magnetic widget hover" />
        </SettingRow>
        <SettingRow title="Apple Pencil hover preview" description="Shows the precise brush or eraser footprint before Pencil touches a focused Sketchpad.">
          <Toggle checked={settings.pencilHoverPreview} onChange={(pencilHoverPreview) => update({ pencilHoverPreview })} label="Apple Pencil hover preview" />
        </SettingRow>
        <SettingRow title="Keyboard and gesture reference" description="Review every canvas, editing, selection, and navigation shortcut.">
          <button type="button" onClick={() => { settings.setOpen(false); useWidgetStore.getState().setShortcutsOpen(true) }} className="gp-settings-action"><Keyboard size={14} />Open shortcuts</button>
        </SettingRow>
      </>
    ),
    performance: (
      <>
        <SettingRow title="Visual quality" description="Balanced is the recommended default. Economy pauses ambient glow and cursor magnetism to extend battery life.">
          <Segmented value={settings.visualQuality} label="Visual quality" options={[{ value: 'full' as VisualQuality, label: 'Full' }, { value: 'balanced' as VisualQuality, label: 'Balanced' }, { value: 'economy' as VisualQuality, label: 'Economy' }]} onChange={(visualQuality) => update({ visualQuality })} />
        </SettingRow>
        <SettingRow title="Performance monitor" description="Opens the live FPS, frame-time, hitch, and memory overlay. Use it only while diagnosing canvas performance.">
          <button type="button" onClick={() => window.dispatchEvent(new Event('gp-toggle-performance-monitor'))} className="gp-settings-action"><Gauge size={14} />Toggle monitor</button>
        </SettingRow>
        <div className="gp-settings-callout rounded-2xl p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">How Grovepad stays light</p>
          <p className="mt-2 text-xs leading-5 text-neutral-500">Canvas effects stop scheduling frames once settled. Far-zoom rendering flattens detail automatically, and Economy mode removes the two optional pointer-driven effects entirely.</p>
        </div>
      </>
    ),
    data: (
      <>
        <SettingRow title="Grovepad file" description="Export a complete portable package, or import one as a new Canvas card without replacing current work.">
          <div className="flex gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="gp-settings-action"><Upload size={14} />Import</button>
            <button type="button" onClick={() => void exportPackage()} className="gp-settings-action"><Download size={14} />Export</button>
          </div>
        </SettingRow>
        <input ref={fileRef} type="file" accept=".grovepad,application/vnd.grovepad.board+zip" className="hidden" onChange={(event) => void importPackage(event.currentTarget.files?.[0])} />
        <SettingRow title="Cloud sync" description={session ? 'Keeps workspaces available across signed-in devices while retaining the local copy.' : 'Sign in from the account menu to make boards available across devices.'}>
          <Toggle disabled={!session || !supabaseConfigured} checked={Boolean(session && supabaseConfigured && syncEnabled)} onChange={(enabled) => { if (session && supabaseConfigured) usePersistenceStatusStore.getState().setSyncEnabled(enabled) }} label="Cloud sync" />
        </SettingRow>
        <SettingRow title="Domain packs" description="Choose which specialized widget collections appear in the widget library.">
          <button type="button" onClick={() => { settings.setOpen(false); useWidgetStore.getState().openAddWidget(viewCenterWorld(), 'packs') }} className="gp-settings-action"><Blocks size={14} />Manage packs</button>
        </SettingRow>
        <SettingRow title="Reset interface settings" description="Restores the recommended 130% panel size and all visual and interaction defaults. Board content is untouched.">
          <button type="button" onClick={() => { settings.reset(); useToastStore.getState().addToast('Interface settings reset') }} className="gp-settings-action text-amber-200"><RotateCcw size={14} />Reset</button>
        </SettingRow>
      </>
    ),
  }[category]

  return createPortal(
    <div className="gp-settings-overlay fixed inset-0 z-[260] flex items-center justify-center p-5" role="dialog" aria-modal="true" aria-labelledby="gp-settings-title">
      <button type="button" tabIndex={-1} aria-label="Close settings" onClick={() => settings.setOpen(false)} className="gp-settings-backdrop absolute inset-0 cursor-default" />
      <div ref={panelRef} tabIndex={-1} className="gp-settings-panel gp-panel gp-pop relative z-10 flex h-[min(760px,calc(100dvh-40px))] w-[min(1120px,calc(100vw-40px))] overflow-hidden rounded-[30px] outline-none">
        <aside className="gp-settings-sidebar flex w-72 shrink-0 flex-col border-r gp-hairline p-4">
          <div className="flex items-center gap-3 px-2 py-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/12 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,.18)]"><SlidersHorizontal size={20} /></span>
            <div><h1 id="gp-settings-title" className="text-lg font-semibold text-neutral-100">Settings</h1><p className="text-xs text-neutral-500">This device</p></div>
          </div>
          <nav className="mt-4 space-y-1" aria-label="Settings categories">
            {CATEGORIES.map(({ id, label, description, icon: Icon }) => (
              <button key={id} type="button" aria-current={category === id ? 'page' : undefined} onClick={() => setCategory(id)} className={`gp-settings-category flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${category === id ? 'bg-emerald-400/10 text-neutral-100' : 'text-neutral-500 hover:bg-white/[0.035] hover:text-neutral-200'}`}>
                <Icon size={17} className={category === id ? 'text-emerald-300' : undefined} />
                <span><span className="block text-sm font-semibold">{label}</span><span className="block text-[10px] text-neutral-600">{description}</span></span>
              </button>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl bg-black/15 p-3 text-[10px] leading-4 text-neutral-600"><Accessibility size={13} className="mb-1 text-neutral-500" />Settings are stored locally and never alter exported board content.</div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto p-7">
          <div className="sticky top-0 z-10 -mx-1 mb-5 flex items-center justify-between bg-[var(--gp-surface-panel)]/90 px-1 pb-3 backdrop-blur-xl">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300/80">{CATEGORIES.find((item) => item.id === category)?.label}</p><p className="mt-1 text-sm text-neutral-500">Tune Grovepad for the way you work.</p></div>
            <button ref={closeRef} type="button" aria-label="Close settings" onClick={() => settings.setOpen(false)} className="gp-touch-target flex h-10 w-10 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-700/60 hover:text-white"><X size={18} /></button>
          </div>
          <div className="space-y-3">{content}</div>
        </main>
      </div>
    </div>,
    document.body,
  )
}
