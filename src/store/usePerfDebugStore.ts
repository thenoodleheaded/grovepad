import { create } from 'zustand'

interface PerfDebugState {
  isOpen: boolean
  toggleOpen: () => void
  close: () => void
}

/** Visibility only — the panel owns all sampling itself while mounted, so
 * there is nothing else worth persisting here. */
export const usePerfDebugStore = create<PerfDebugState>((set) => ({
  isOpen: false,
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  close: () => set({ isOpen: false }),
}))
