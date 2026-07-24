import { create } from 'zustand'

export type SettingsSection = 'general' | 'controls' | 'canvas' | 'account' | 'data'

export interface AppPreferences {
  reduceMotion: boolean
  canvasAura: boolean
  gridIntensity: number
  magneticHover: boolean
  /** Device-local opt-in for loopback access from MCP-capable AI clients. */
  mcpConnector: boolean
}

interface SettingsState extends AppPreferences {
  open: boolean
  section: SettingsSection
  setOpen: (open: boolean, section?: SettingsSection) => void
  setSection: (section: SettingsSection) => void
  update: (next: Partial<AppPreferences>) => void
  reset: () => void
}

const STORAGE_KEY = 'grovepad:settings:v1'

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  reduceMotion: false,
  canvasAura: true,
  gridIntensity: 100,
  // Opt-in: the pointer-following lean makes cards wobble during ordinary
  // mouse travel, and hit geometry stops matching the stored layout.
  magneticHover: false,
  mcpConnector: false,
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
      reduceMotion: raw.reduceMotion ?? DEFAULT_APP_PREFERENCES.reduceMotion,
      canvasAura: raw.canvasAura ?? DEFAULT_APP_PREFERENCES.canvasAura,
      gridIntensity: clampPercent(raw.gridIntensity, DEFAULT_APP_PREFERENCES.gridIntensity),
      magneticHover: raw.magneticHover ?? DEFAULT_APP_PREFERENCES.magneticHover,
      mcpConnector: raw.mcpConnector ?? DEFAULT_APP_PREFERENCES.mcpConnector,
    }
  } catch {
    return DEFAULT_APP_PREFERENCES
  }
}

function applyPreferences(settings: AppPreferences): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.removeProperty('--gp-ui-scale')
  root.style.setProperty('--gp-grid-intensity', String(settings.gridIntensity / 100))
  root.style.removeProperty('--gp-aura-intensity')
  root.dataset.motion = settings.reduceMotion ? 'reduced' : 'system'
  delete root.dataset.contrast
  root.dataset.magneticHover = settings.magneticHover ? 'on' : 'off'
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('gp-settings-preferences'))
}

const initial = loadPreferences()
applyPreferences(initial)

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  ...initial,
  open: false,
  section: 'general',
  setOpen: (open, section) => set(section ? { open, section } : { open }),
  setSection: (section) => set({ section }),
  update: (next) => {
    const preferences: AppPreferences = {
      reduceMotion: next.reduceMotion ?? get().reduceMotion,
      canvasAura: next.canvasAura ?? get().canvasAura,
      gridIntensity: clampPercent(next.gridIntensity, get().gridIntensity),
      magneticHover: next.magneticHover ?? get().magneticHover,
      mcpConnector: next.mcpConnector ?? get().mcpConnector,
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
