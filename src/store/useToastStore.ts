import { create } from 'zustand'

/**
 * Toast tones. `info` is the quiet default; `success` confirms a completed
 * action; `danger` marks failures (save errors, unreadable files) so they no
 * longer look identical to routine acknowledgements — and they linger longer.
 */
export type ToastTone = 'info' | 'success' | 'danger'

export interface Toast {
  id: string
  message: string
  tone: ToastTone
  action?: { label: string; run: () => void }
  /** Playing its exit animation; the view finalizes removal on transition end. */
  leaving?: boolean
}

export interface ToastOptions {
  action?: Toast['action']
  duration?: number
  tone?: ToastTone
}

/** How many toasts are on screen at once. Older ones bow out as new ones land. */
const VISIBLE_LIMIT = 3

/**
 * Runaway guard. Exiting toasts stay in the list until their animation ends, so
 * the array is briefly longer than the visible limit; past this ceiling the
 * oldest are dropped outright rather than queued behind animations.
 */
const HARD_LIMIT = 6

/** Mark one toast as leaving, or return the same array when nothing changes. */
function withLeaving(toasts: readonly Toast[], id: string): Toast[] | null {
  let changed = false
  const next = toasts.map((toast) => {
    if (toast.id !== id || toast.leaving) return toast
    changed = true
    return { ...toast, leaving: true }
  })
  return changed ? next : null
}

/**
 * Admit a new toast: anything beyond the visible limit is marked `leaving` so it
 * animates out instead of disappearing mid-sentence. `retiredIds` names the ones
 * just retired, so the caller can guarantee their removal the same way a
 * user-dismissed toast is guaranteed.
 */
export function admitToast(
  toasts: readonly Toast[],
  next: Toast,
): { toasts: Toast[]; retiredIds: string[] } {
  const visible = toasts.filter((toast) => !toast.leaving)
  const overflow = Math.max(0, visible.length - (VISIBLE_LIMIT - 1))
  const retiring = new Set(visible.slice(0, overflow).map((toast) => toast.id))
  return {
    toasts: [
      ...toasts.map((toast) => (retiring.has(toast.id) ? { ...toast, leaving: true } : toast)),
      next,
    ].slice(-HARD_LIMIT),
    retiredIds: [...retiring],
  }
}

/**
 * Longest we will wait for the exit transition to report itself before removing
 * the row anyway. This does NOT drive the visible timing — CSS owns that, and
 * `transitionend` normally finalizes well before this fires. It exists because a
 * transition that never runs never reports: an unrendered container, a
 * background tab, or a near-zero reduced-motion duration would otherwise strand
 * a toast on screen forever, which is worse than the abrupt removal it replaced.
 */
const EXIT_FAILSAFE_MS = 400

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, options?: ToastOptions) => void
  /** Start the exit animation. `removeToast` finalizes, from the view or the failsafe. */
  dismissToast: (id: string) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>()((set, get) => {
  const beginExit = (id: string) => {
    set((state) => {
      const next = withLeaving(state.toasts, id)
      return next ? { toasts: next } : state
    })
    // Idempotent: a no-op once the view has already finalized this id.
    setTimeout(() => get().removeToast(id), EXIT_FAILSAFE_MS)
  }

  return {
    toasts: [],
    addToast: (message, options) => {
      const id = crypto.randomUUID()
      const tone = options?.tone ?? 'info'
      const admitted = admitToast(get().toasts, { id, message, tone, action: options?.action })
      set({ toasts: admitted.toasts })
      // Crowded-out toasts are already animating; guarantee their removal too.
      for (const retiredId of admitted.retiredIds) {
        setTimeout(() => get().removeToast(retiredId), EXIT_FAILSAFE_MS)
      }
      setTimeout(
        () => beginExit(id),
        options?.duration ?? (options?.action || tone === 'danger' ? 6000 : 2800),
      )
    },
    dismissToast: beginExit,
    removeToast: (id) =>
      set((state) => {
        const toasts = state.toasts.filter((toast) => toast.id !== id)
        return toasts.length === state.toasts.length ? state : { toasts }
      }),
  }
})
