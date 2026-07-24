import { create } from 'zustand'
import {
  DEFAULT_AURA_DOCUMENT,
  sanitizeAuraDocument,
  type AuraThemeTuning,
  type AuraTuningDocument,
  type CanvasColorTuning,
} from '../components/canvas/auraTuning'
import type { Theme } from './useThemeStore'

const STORAGE_KEY = 'gp-aura-tuning'

function readStored(): AuraTuningDocument {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_AURA_DOCUMENT
    return sanitizeAuraDocument(JSON.parse(raw))
  } catch {
    // A corrupt or unreadable draft must never keep the board from rendering.
    return DEFAULT_AURA_DOCUMENT
  }
}

function persist(doc: AuraTuningDocument): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
  } catch {
    // Private-mode or quota failures are not worth interrupting tuning for.
  }
}

interface AuraTuningState {
  isOpen: boolean
  doc: AuraTuningDocument
  toggleOpen: () => void
  setOpen: (open: boolean) => void
  setAuraValue: <K extends keyof AuraThemeTuning>(theme: Theme, key: K, value: AuraThemeTuning[K]) => void
  setCanvasValue: (theme: Theme, key: keyof CanvasColorTuning, value: string) => void
  setAccent: (type: string, theme: Theme, value: string | null) => void
  replace: (doc: AuraTuningDocument) => void
  reset: () => void
}

/**
 * Dev-only tuning state for the ambient aura, its accent sources, and the canvas
 * colours behind it. Persisted to localStorage so a tuning session survives the
 * reloads that fine-tuning inevitably involves; `replace` accepts a pasted
 * document so exported values can be round-tripped back in.
 */
export const useAuraTuningStore = create<AuraTuningState>()((set, get) => ({
  isOpen: false,
  doc: readStored(),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  setOpen: (isOpen) => set((state) => (state.isOpen === isOpen ? state : { isOpen })),
  setAuraValue: (theme, key, value) => {
    const doc = get().doc
    const next: AuraTuningDocument = {
      ...doc,
      aura: { ...doc.aura, [theme]: { ...doc.aura[theme], [key]: value } },
    }
    const clean = sanitizeAuraDocument(next)
    persist(clean)
    set({ doc: clean })
  },
  setCanvasValue: (theme, key, value) => {
    const doc = get().doc
    const next: AuraTuningDocument = {
      ...doc,
      canvas: { ...doc.canvas, [theme]: { ...doc.canvas[theme], [key]: value } },
    }
    const clean = sanitizeAuraDocument(next)
    persist(clean)
    set({ doc: clean })
  },
  setAccent: (type, theme, value) => {
    const doc = get().doc
    const entry = { ...(doc.accents[type] ?? {}) }
    if (value === null) delete entry[theme]
    else entry[theme] = value
    const accents = { ...doc.accents }
    if (entry.dark || entry.light) accents[type] = entry
    else delete accents[type]
    const clean = sanitizeAuraDocument({ ...doc, accents })
    persist(clean)
    set({ doc: clean })
  },
  replace: (incoming) => {
    const clean = sanitizeAuraDocument(incoming)
    persist(clean)
    set({ doc: clean })
  },
  reset: () => {
    persist(DEFAULT_AURA_DOCUMENT)
    set({ doc: DEFAULT_AURA_DOCUMENT })
  },
}))
