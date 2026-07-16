import { create } from 'zustand'
import type { ModuleType } from '../types/spatial'

const FAVORITES_KEY = 'gp-favorite-widgets'
const HIDDEN_PACK_WIDGETS_KEY = 'gp-hidden-pack-widgets'

interface WidgetPickerPrefsState {
  favoriteWidgetTypes: ModuleType[]
  toggleFavoriteWidgetType: (type: ModuleType) => void
  hiddenPackWidgetTypes: ModuleType[]
  toggleHiddenPackWidgetType: (type: ModuleType) => void
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

function toggled(list: ModuleType[], type: ModuleType): ModuleType[] {
  return list.includes(type) ? list.filter((t) => t !== type) : [...list, type]
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
}))
