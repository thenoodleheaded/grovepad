import { useEffect } from 'react'
import { create } from 'zustand'

// ---------------------------------------------------------------------------
// Overlay tracking — a plain reference count of open floating UI (modals,
// menus, dropdowns, popovers). Popups keep local `useState` for their own
// open/closed flag, which is the right call for each component, but the
// canvas still needs one global answer to "is anything floating open right
// now?" so it can suspend double-click-to-create and keyboard shortcuts —
// otherwise pressing Delete while a menu is open could nuke the selection
// underneath it. Each popup pushes on open and pops on close/unmount.
// ---------------------------------------------------------------------------

interface OverlayStoreState {
  count: number
}

const useOverlayStore = create<OverlayStoreState>()(() => ({ count: 0 }))

function pushOverlay(): void {
  useOverlayStore.setState((s) => ({ count: s.count + 1 }))
}

function popOverlay(): void {
  useOverlayStore.setState((s) => ({ count: Math.max(0, s.count - 1) }))
}

export function isOverlayOpen(): boolean {
  return useOverlayStore.getState().count > 0
}

/** Registers `open` with the global overlay count for the component's lifetime. */
export function useOverlayLifecycle(open: boolean): void {
  useEffect(() => {
    if (!open) return
    pushOverlay()
    return () => popOverlay()
  }, [open])
}
