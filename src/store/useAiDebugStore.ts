import { create } from 'zustand'

export type AiCallPhase = 'topology' | 'hydration' | 'quickadd-deterministic' | 'quickadd-model'
type AiCallStatus = 'pending' | 'ok' | 'error' | 'aborted'

export interface AiDebugEntry {
  id: string
  startedAt: number
  phase: AiCallPhase
  /** Human handle for the call — the map title or the widget being hydrated. */
  label: string
  model: string
  status: AiCallStatus
  durationMs: number
  /** Full prompt text as sent, one block per message role. */
  prompt: string
  /** Raw model output (structured-output JSON text); empty until resolved. */
  response: string
  promptTokens: number
  completionTokens: number
  error: string | null
  /** Compact outcome suitable for comparing deterministic and model passes. */
  summary: string
}

interface BeginCallInit {
  phase: AiCallPhase
  label: string
  model: string
  prompt: string
}

interface EndCallResult {
  status: Exclude<AiCallStatus, 'pending'>
  response?: string
  promptTokens?: number
  completionTokens?: number
  error?: string | null
  summary?: string
}

interface UpdateCallResult {
  response?: string
  summary?: string
}

/** Bounded trace so a long session with many hydrations can't grow unbounded. */
const MAX_ENTRIES = 100

interface AiDebugState {
  entries: AiDebugEntry[]
  isOpen: boolean
  beginCall: (init: BeginCallInit) => string
  updateCall: (id: string, result: UpdateCallResult) => void
  endCall: (id: string, result: EndCallResult) => void
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  clear: () => void
}

/**
 * In-memory trace of every AI request the app makes (import topology pass,
 * per-widget hydration). Rendered by AiDebugPanel (toggle with `I`) and
 * exposed on the dev-only `__grovepad` hook for console inspection.
 * Newest entry first; never persisted.
 */
export const useAiDebugStore = create<AiDebugState>()((set) => ({
  entries: [],
  beginCall: (init) => {
    const id = crypto.randomUUID()
    const entry: AiDebugEntry = {
      id,
      startedAt: Date.now(),
      phase: init.phase,
      label: init.label,
      model: init.model,
      status: 'pending',
      durationMs: 0,
      prompt: init.prompt,
      response: '',
      promptTokens: 0,
      completionTokens: 0,
      error: null,
      summary: '',
    }
    set((state) => ({ entries: [entry, ...state.entries].slice(0, MAX_ENTRIES) }))
    return id
  },
  updateCall: (id, result) => {
    set((state) => {
      let changed = false
      const entries = state.entries.map((entry) => {
        if (entry.id === id && entry.status === 'pending') {
          changed = true
          return {
            ...entry,
            response: result.response ?? entry.response,
            summary: result.summary ?? entry.summary,
            durationMs: Date.now() - entry.startedAt,
          }
        }
        return entry
      })
      return changed ? { entries } : state
    })
  },
  endCall: (id, result) => {
    set((state) => {
      let changed = false
      const entries = state.entries.map((entry) => {
        if (entry.id === id && entry.status === 'pending') {
          changed = true
          return {
            ...entry,
            status: result.status,
            response: result.response ?? entry.response,
            promptTokens: result.promptTokens ?? entry.promptTokens,
            completionTokens: result.completionTokens ?? entry.completionTokens,
            error: result.error ?? null,
            summary: result.summary ?? entry.summary,
            durationMs: Date.now() - entry.startedAt,
          }
        }
        return entry
      })
      return changed ? { entries } : state
    })
  },
  isOpen: false,
  setOpen: (isOpen) =>
    set((state) => (state.isOpen === isOpen ? state : { isOpen })),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  clear: () => set((state) => (state.entries.length === 0 ? state : { entries: [] })),
}))
