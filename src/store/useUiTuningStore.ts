import { create } from 'zustand'
import {
  applyUiTuning,
  sanitizeTuningValues,
  TUNE_FIELDS,
  type TuningValues,
} from '../components/ui/uiTuning'

const STORAGE_KEY = 'gp-ui-tuning'

function readStored(): TuningValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return sanitizeTuningValues(JSON.parse(raw))
  } catch {
    // A corrupt draft must never keep the board from rendering.
    return {}
  }
}

function persist(values: TuningValues): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values))
  } catch {
    // Private-mode or quota failures are not worth interrupting tuning for.
  }
}

interface UiTuningState {
  isOpen: boolean
  values: TuningValues
  toggleOpen: () => void
  setOpen: (open: boolean) => void
  /** Set one knob. Passing its default (or null) clears the override. */
  setValue: (id: string, value: number | null) => void
  /** Clear every override, returning the whole app to its stock look. */
  resetAll: () => void
}

/**
 * Local, owner-facing appearance tuning. Values persist to localStorage so a
 * fine-tuning session survives reloads, and are pushed onto the document as CSS
 * custom properties the moment they change — this never touches board data,
 * history, or anything synced to other collaborators.
 */
export const useUiTuningStore = create<UiTuningState>()((set, get) => ({
  isOpen: false,
  values: readStored(),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  setOpen: (isOpen) => set((state) => (state.isOpen === isOpen ? state : { isOpen })),
  setValue: (id, value) => {
    const field = TUNE_FIELDS[id]
    if (!field) return
    const next = { ...get().values }
    if (value === null || value === field.default || !Number.isFinite(value)) {
      delete next[id]
    } else {
      next[id] = Math.min(Math.max(value, field.min), field.max)
    }
    persist(next)
    applyUiTuning(next)
    set({ values: next })
  },
  resetAll: () => {
    persist({})
    applyUiTuning({})
    set({ values: {} })
  },
}))

// Apply any persisted overrides once at startup, before the panel is ever
// opened, so a reload keeps the look the owner tuned.
applyUiTuning(useUiTuningStore.getState().values)
