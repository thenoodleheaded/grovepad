import { create } from 'zustand'
import type { ModuleType } from '../types/spatial'

const FAVORITES_KEY = 'gp-favorite-widgets'
const HIDDEN_PACK_WIDGETS_KEY = 'gp-hidden-pack-widgets'
const RECENTS_KEY = 'gp-recent-widgets'
const STUDY_FOCUS_KEY = 'gp-study-focus'

/** How many recently placed widget types the picker remembers. */
export const RECENT_WIDGET_LIMIT = 8

interface WidgetPickerPrefsState {
  favoriteWidgetTypes: ModuleType[]
  toggleFavoriteWidgetType: (type: ModuleType) => void
  hiddenPackWidgetTypes: ModuleType[]
  toggleHiddenPackWidgetType: (type: ModuleType) => void
  recentWidgetTypes: ModuleType[]
  recordRecentWidgetType: (type: ModuleType) => void
  /**
   * Narrows every widget-browsing surface to STUDY_FOCUS_TYPES. Purely a
   * viewing preference: it lives in localStorage, never in the board, so it
   * hides nothing that a board already holds and deletes nothing anywhere.
   */
  studyFocus: boolean
  setStudyFocus: (value: boolean) => void
}

function readTypeList(key: string): ModuleType[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((v): v is ModuleType => typeof v === 'string') : []
  } catch {
    return []
  }
}

function writeTypeList(key: string, types: ModuleType[]): void {
  localStorage.setItem(key, JSON.stringify(types))
}

/**
 * Study focus starts ON. A student's picker is the default here, so the full
 * 181-widget library is opt-in rather than opt-out.
 *
 * Only an ABSENT key means "never chosen". A stored 'false' is the user having
 * switched the filter off, and must survive every reload — re-defaulting it to
 * on would make the switch feel broken. Exported so the rule can be tested
 * without a DOM.
 */
export function initialStudyFocus(raw: string | null): boolean {
  return raw === null ? true : raw === 'true'
}

function readStoredFlag(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function toggled(list: ModuleType[], type: ModuleType): ModuleType[] {
  return list.includes(type) ? list.filter((t) => t !== type) : [...list, type]
}

/** Most-recent-first, deduplicated, capped. Exported for tests. */
export function promoteRecent(list: ModuleType[], type: ModuleType, limit = RECENT_WIDGET_LIMIT): ModuleType[] {
  return [type, ...list.filter((t) => t !== type)].slice(0, limit)
}

export const useWidgetPickerPrefsStore = create<WidgetPickerPrefsState>()((set, get) => ({
  favoriteWidgetTypes: readTypeList(FAVORITES_KEY),
  toggleFavoriteWidgetType: (type) => {
    const next = toggled(get().favoriteWidgetTypes, type)
    writeTypeList(FAVORITES_KEY, next)
    set({ favoriteWidgetTypes: next })
  },
  hiddenPackWidgetTypes: readTypeList(HIDDEN_PACK_WIDGETS_KEY),
  toggleHiddenPackWidgetType: (type) => {
    const next = toggled(get().hiddenPackWidgetTypes, type)
    writeTypeList(HIDDEN_PACK_WIDGETS_KEY, next)
    set({ hiddenPackWidgetTypes: next })
  },
  recentWidgetTypes: readTypeList(RECENTS_KEY),
  recordRecentWidgetType: (type) => {
    const next = promoteRecent(get().recentWidgetTypes, type)
    writeTypeList(RECENTS_KEY, next)
    set({ recentWidgetTypes: next })
  },
  studyFocus: initialStudyFocus(readStoredFlag(STUDY_FOCUS_KEY)),
  setStudyFocus: (value) => {
    localStorage.setItem(STUDY_FOCUS_KEY, String(value))
    set({ studyFocus: value })
  },
}))
