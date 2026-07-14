import { create } from 'zustand'
import { useCanvasStore } from './useCanvasStore'
import { useWidgetStore } from './useWidgetStore'
import type { Vector2D } from '../types/spatial'

// ---------------------------------------------------------------------------
// Focus mode — one widget under the lens (glass constitution, Article XVIII).
//
// Entered by double-clicking an expanded card. The camera glides to frame the
// widget and LOCKS (no pan, no zoom, no widget drags) while its islands
// unlock for rearranging and rule-constrained scaling. Escape or any click
// outside the card exits, restoring the exact camera the user left.
// ---------------------------------------------------------------------------

interface FocusState {
  focusedWidgetId: string | null
  /** Camera to restore on exit — captured at entry. */
  savedView: { pan: Vector2D; zoom: number } | null
  enterFocus: (widgetId: string) => void
  exitFocus: () => void
}

/** Screen margin the focused card keeps from the viewport edges. */
const FOCUS_FIT_MARGIN = 96

export const useFocusStore = create<FocusState>()((set, get) => ({
  focusedWidgetId: null,
  savedView: null,

  enterFocus: (widgetId) => {
    if (get().focusedWidgetId === widgetId) return
    const widget = useWidgetStore.getState().widgets[widgetId]
    if (!widget || widget.collapsed || widget.iconified) return
    const camera = useCanvasStore.getState()
    const savedView = get().savedView ?? { pan: camera.pan, zoom: camera.zoom }
    camera.fitRect(
      {
        x: widget.position.x,
        y: widget.position.y,
        width: widget.size.width,
        height: widget.size.height,
      },
      FOCUS_FIT_MARGIN,
    )
    document.body.setAttribute('data-focus-mode', 'true')
    set({ focusedWidgetId: widgetId, savedView })
  },

  exitFocus: () => {
    const { focusedWidgetId, savedView } = get()
    if (!focusedWidgetId) return
    document.body.removeAttribute('data-focus-mode')
    if (savedView) {
      useCanvasStore.getState().animateView(savedView.pan, savedView.zoom, 240)
    }
    set({ focusedWidgetId: null, savedView: null })
  },
}))

// The subject can vanish under the lens (undo, automation delete, cascade) —
// exit cleanly instead of leaving a locked camera pointed at nothing.
useWidgetStore.subscribe((state) => {
  const { focusedWidgetId, exitFocus } = useFocusStore.getState()
  if (focusedWidgetId && !state.widgets[focusedWidgetId]) exitFocus()
})
