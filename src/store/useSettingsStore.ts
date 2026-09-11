import { create } from 'zustand'

export type SettingsSection = 'general' | 'controls' | 'canvas' | 'account' | 'data'

/**
 * How much visual work the app is allowed to do, richest first.
 *
 * `high` is the stock look and stays exactly what the app rendered before
 * quality tiers existed — every reduction lives in the other two tiers, never
 * as a change to the default. `balanced` keeps the same material language but
 * shrinks per-frame cost (weaker blur, fewer aura emitters, shorter motion, no
 * glow rings). `low` is the lightweight tier: no backdrop blur anywhere, no
 * ambient aura canvas, flat card and panel paint instead of layered gradients,
 * and effectively no animation.
 */
export type VisualQuality = 'high' | 'balanced' | 'low'

/** Richest first, so UI can render the tiers without restating the order. */
export const VISUAL_QUALITY_ORDER: readonly VisualQuality[] = ['high', 'balanced', 'low']

/** Validates unknown data (restored localStorage, an imported file) into a tier. */
export function sanitizeVisualQuality(value: unknown): VisualQuality {
  return VISUAL_QUALITY_ORDER.includes(value as VisualQuality) ? (value as VisualQuality) : 'high'
}

export interface AppPreferences {
  reduceMotion: boolean
  canvasAura: boolean
  magneticHover: boolean
  /** Visual budget for the whole app; see `VisualQuality`. */
  visualQuality: VisualQuality
  /** Device-local opt-in for loopback access from MCP-capable AI clients. */
  mcpConnector: boolean
  /**
   * Device-local consent for anonymous usage counting. On by default and
   * turned off here; off means the analytics SDK is never downloaded, so
   * refusing costs a person nothing and sends nothing. Flip the default in
   * `DEFAULT_APP_PREFERENCES` to make counting opt-in instead — the runtime,
   * the Settings copy and the privacy page all read this one preference.
   */
  usageAnalytics: boolean
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
  magneticHover: true,
  visualQuality: 'high',
  mcpConnector: false,
  usageAnalytics: true,
}

function loadPreferences(): AppPreferences {
  if (typeof localStorage === 'undefined') return DEFAULT_APP_PREFERENCES
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<AppPreferences>
    return {
      reduceMotion: raw.reduceMotion ?? DEFAULT_APP_PREFERENCES.reduceMotion,
      canvasAura: raw.canvasAura ?? DEFAULT_APP_PREFERENCES.canvasAura,
      magneticHover: raw.magneticHover ?? DEFAULT_APP_PREFERENCES.magneticHover,
      visualQuality: sanitizeVisualQuality(raw.visualQuality),
      mcpConnector: raw.mcpConnector ?? DEFAULT_APP_PREFERENCES.mcpConnector,
      usageAnalytics: raw.usageAnalytics ?? DEFAULT_APP_PREFERENCES.usageAnalytics,
    }
  } catch {
    return DEFAULT_APP_PREFERENCES
  }
}

function applyPreferences(settings: AppPreferences): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  // The lightweight tier is motion-free by definition, so it reduces motion
  // without flipping the separate preference the owner set by hand.
  root.dataset.motion =
    settings.reduceMotion || settings.visualQuality === 'low' ? 'reduced' : 'system'
  root.dataset.quality = settings.visualQuality
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
      magneticHover: next.magneticHover ?? get().magneticHover,
      visualQuality: sanitizeVisualQuality(next.visualQuality ?? get().visualQuality),
      mcpConnector: next.mcpConnector ?? get().mcpConnector,
      usageAnalytics: next.usageAnalytics ?? get().usageAnalytics,
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
