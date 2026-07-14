import { create } from 'zustand'
import type { Vector2D } from '../types/spatial'
import type { ThoughtPlan } from '../utils/thoughtInterpreter'

/**
 * Shared state between the compact Quick Add bar (a screen-space overlay)
 * and the blueprint preview layer (rendered inside the canvas world
 * transform). The bar owns all inputs and decisions; the layer only draws.
 */

export type QuickAddPreviewPhase =
  /** Deterministic plan, settled — this is what ⏎ creates. */
  | 'live'
  /** Scaffold showing while the local model elaborates it (≤ 5s). */
  | 'composing'
  /** Explicit "think deeper" pass running on the current plan. */
  | 'deepening'

export interface QuickAddCandidate {
  id: string
  /** Short human label shown in the switcher ("Trip planning hub"). */
  label: string
  sublabel?: string
  badge?: 'recommended' | 'ai' | 'starter'
  plan: ThoughtPlan
}

interface QuickAddPreviewState {
  active: boolean
  phase: QuickAddPreviewPhase
  candidates: QuickAddCandidate[]
  index: number
  /** World-space anchor: the preview tree is centered on anchor.x, growing
   *  downward from anchor.y. Commit uses the same point so the real widgets
   *  land exactly where the blueprint stood. */
  anchor: Vector2D | null
  setPreview: (update: {
    candidates: QuickAddCandidate[]
    index?: number
    phase?: QuickAddPreviewPhase
    anchor?: Vector2D
  }) => void
  setPhase: (phase: QuickAddPreviewPhase) => void
  select: (index: number) => void
  cycle: (delta: number) => void
  clear: () => void
}

export const useQuickAddPreviewStore = create<QuickAddPreviewState>((set, get) => ({
  active: false,
  phase: 'live',
  candidates: [],
  index: 0,
  anchor: null,
  setPreview: ({ candidates, index, phase, anchor }) =>
    set((state) => ({
      active: candidates.length > 0,
      candidates,
      index: Math.max(0, Math.min(candidates.length - 1, index ?? state.index)),
      phase: phase ?? state.phase,
      anchor: anchor ?? state.anchor,
    })),
  setPhase: (phase) => set({ phase }),
  select: (index) =>
    set((state) => ({ index: Math.max(0, Math.min(state.candidates.length - 1, index)) })),
  cycle: (delta) => {
    const { candidates, index } = get()
    if (candidates.length < 2) return
    set({ index: (index + delta + candidates.length) % candidates.length })
  },
  clear: () => set({ active: false, candidates: [], index: 0, anchor: null, phase: 'live' }),
}))

/** The plan currently on the canvas blueprint — what ⏎ will create. */
export function activePreviewPlan(state: QuickAddPreviewState): ThoughtPlan | null {
  return state.candidates[state.index]?.plan ?? null
}
