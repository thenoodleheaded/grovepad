import { create } from 'zustand'

export type InterfaceScale = 1 | 1.15 | 1.3
export type VisualQuality = 'full' | 'balanced' | 'economy'

export interface AppPreferences {
  interfaceScale: InterfaceScale
  reduceMotion: boolean
  highContrast: boolean
  canvasAura: boolean
  auraIntensity: number
  gridIntensity: number
  magneticHover: boolean
  pencilHoverPreview: boolean
  showMinimap: boolean
  visualQuality: VisualQuality
}

interface SettingsState extends AppPreferences {
  open: boolean
  setOpen: (open: boolean) => void
  update: (next: Partial<AppPreferences>) => void
  reset: () => void
}

const STORAGE_KEY = 'grovepad:settings:v1'

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  interfaceScale: 1.3,
  reduceMotion: false,
  highContrast: false,
  canvasAura: true,
  auraIntensity: 100,
  gridIntensity: 100,
  // Opt-in: the pointer-following lean makes cards wobble during ordinary
  // mouse travel, and hit geometry stops matching the stored layout.
  magneticHover: false,
  pencilHoverPreview: true,
  showMinimap: true,
  visualQuality: 'balanced',
}

function clampPercent(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : fallback
}

function loadPreferences(): AppPreferences {
  if (typeof localStorage === 'undefined') return DEFAULT_APP_PREFERENCES
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<AppPreferences>
    return {
      ...DEFAULT_APP_PREFERENCES,
      ...raw,
      interfaceScale: raw.interfaceScale === 1 || raw.interfaceScale === 1.15 || raw.interfaceScale === 1.3
        ? raw.interfaceScale
        : DEFAULT_APP_PREFERENCES.interfaceScale,
      auraIntensity: clampPercent(raw.auraIntensity, DEFAULT_APP_PREFERENCES.auraIntensity),
      gridIntensity: clampPercent(raw.gridIntensity, DEFAULT_APP_PREFERENCES.gridIntensity),
      visualQuality: raw.visualQuality === 'full' || raw.visualQuality === 'balanced' || raw.visualQuality === 'economy'
        ? raw.visualQuality
        : DEFAULT_APP_PREFERENCES.visualQuality,
    }
  } catch {
    return DEFAULT_APP_PREFERENCES
  }
}

function applyPreferences(settings: AppPreferences): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--gp-ui-scale', String(settings.interfaceScale))
  root.style.setProperty('--gp-grid-intensity', String(settings.gridIntensity / 100))
  root.style.setProperty('--gp-aura-intensity', String(settings.auraIntensity / 100))
  root.dataset.motion = settings.reduceMotion ? 'reduced' : 'system'
  root.dataset.contrast = settings.highContrast ? 'high' : 'standard'
  root.dataset.magneticHover = settings.magneticHover ? 'on' : 'off'
  root.dataset.pencilHover = settings.pencilHoverPreview ? 'on' : 'off'
  root.dataset.visualQuality = settings.visualQuality
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('gp-settings-preferences'))
}

const initial = loadPreferences()
applyPreferences(initial)

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  ...initial,
  open: false,
  setOpen: (open) => set({ open }),
  update: (next) => {
    const preferences: AppPreferences = {
      interfaceScale: next.interfaceScale ?? get().interfaceScale,
      reduceMotion: next.reduceMotion ?? get().reduceMotion,
      highContrast: next.highContrast ?? get().highContrast,
      canvasAura: next.canvasAura ?? get().canvasAura,
      auraIntensity: clampPercent(next.auraIntensity, get().auraIntensity),
      gridIntensity: clampPercent(next.gridIntensity, get().gridIntensity),
      magneticHover: next.magneticHover ?? get().magneticHover,
      pencilHoverPreview: next.pencilHoverPreview ?? get().pencilHoverPreview,
      showMinimap: next.showMinimap ?? get().showMinimap,
      visualQuality: next.visualQuality ?? get().visualQuality,
    }
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    applyPreferences(preferences)
    set(preferences)
  },
  reset: () => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_APP_PREFERENCES))
    applyPreferences(DEFAULT_APP_PREFERENCES)
    set(DEFAULT_APP_PREFERENCES)
  },
}))
