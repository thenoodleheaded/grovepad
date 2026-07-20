import { create } from 'zustand'
import { useWidgetStore } from './useWidgetStore'
import { useAdaptiveInputStore } from './useAdaptiveInputStore'
import type { InteractionMode } from '../utils/adaptiveInput'

// ---------------------------------------------------------------------------
// Focus mode — one widget under the lens (glass constitution, Article XVIII).
//
// Entered by double-clicking an expanded card. The islands unlock for 
// rearranging and rule-constrained scaling. Escape or any click
// outside the card exits.
// ---------------------------------------------------------------------------

export type FocusPurpose = 'layout' | 'edit'

interface FocusState {
  focusedWidgetId: string | null
  focusPurpose: FocusPurpose | null
  savedInteractionMode: InteractionMode | null
  enterFocus: (widgetId: string, purpose?: FocusPurpose) => void
  exitFocus: () => void
}

let focusReturnTarget: HTMLElement | null = null
let focusPurposeFrame = 0

function publishFocusPurpose(purpose: FocusPurpose): void {
  if (typeof document === 'undefined') return
  if (focusPurposeFrame !== 0) cancelAnimationFrame(focusPurposeFrame)
  if (purpose === 'layout') {
    focusPurposeFrame = 0
    document.body.setAttribute('data-focus-purpose', purpose)
    return
  }
  focusPurposeFrame = requestAnimationFrame(() => {
    focusPurposeFrame = 0
    if (useFocusStore.getState().focusPurpose === purpose) {
      document.body.setAttribute('data-focus-purpose', purpose)
    }
  })
}

export const useFocusStore = create<FocusState>()((set, get) => ({
  focusedWidgetId: null,
  focusPurpose: null,
  savedInteractionMode: null,

  enterFocus: (widgetId, purpose = 'layout') => {
    const currentFocus = get()
    if (currentFocus.focusedWidgetId === widgetId) {
      if (currentFocus.focusPurpose === purpose) return
      publishFocusPurpose(purpose)
      useAdaptiveInputStore.getState().setInteractionMode(
        purpose === 'edit' ? 'edit' : currentFocus.savedInteractionMode ?? 'navigate',
      )
      set({ focusPurpose: purpose })
      return
    }
    const widget = useWidgetStore.getState().widgets[widgetId]
    if (!widget || widget.collapsed || widget.iconified) return
    focusReturnTarget = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null
    const currentMode = useAdaptiveInputStore.getState().interactionMode
    const savedInteractionMode = currentMode === 'connect'
      ? 'navigate'
      : currentMode
    if (typeof document !== 'undefined') {
      document.body.setAttribute('data-focus-mode', 'true')
    }
    useAdaptiveInputStore.getState().setInteractionMode(
      purpose === 'edit' ? 'edit' : savedInteractionMode,
    )
    set({ focusedWidgetId: widgetId, focusPurpose: purpose, savedInteractionMode })
    publishFocusPurpose(purpose)
    queueMicrotask(() => {
      if (typeof document === 'undefined' || purpose === 'edit') return
      const subject = [...document.querySelectorAll<HTMLElement>('article[data-widget-id]')]
        .find((element) => element.dataset.widgetId === widgetId)
      subject?.focus({ preventScroll: true })
    })
  },

  exitFocus: () => {
    const { focusedWidgetId, savedInteractionMode } = get()
    if (!focusedWidgetId) return
    let subject: HTMLElement | undefined
    if (typeof document !== 'undefined') {
      if (focusPurposeFrame !== 0) cancelAnimationFrame(focusPurposeFrame)
      focusPurposeFrame = 0
      subject = [...document.querySelectorAll<HTMLElement>('article[data-widget-id]')]
        .find((element) => element.dataset.widgetId === focusedWidgetId)
      if (subject?.contains(document.activeElement) && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
      document.body.removeAttribute('data-focus-mode')
      document.body.removeAttribute('data-focus-purpose')
    }
    useAdaptiveInputStore.getState().setInteractionMode(savedInteractionMode ?? 'navigate')
    set({ focusedWidgetId: null, focusPurpose: null, savedInteractionMode: null })
    const target = focusReturnTarget
    focusReturnTarget = null
    // Never hand focus back into the card being exited: on non-desktop
    // viewport classes, refocusing an editor there auto-re-enters edit focus
    // (WidgetCard onFocusCapture) and Done becomes an inescapable loop.
    if (target && subject?.contains(target)) return
    queueMicrotask(() => {
      if (target?.isConnected) target.focus({ preventScroll: true })
    })
  },
}))

// The subject can vanish under the lens (undo, automation delete, cascade) —
// exit cleanly instead of leaving a locked camera pointed at nothing.
useWidgetStore.subscribe((state) => {
  const { focusedWidgetId, exitFocus } = useFocusStore.getState()
  if (focusedWidgetId && !state.widgets[focusedWidgetId]) exitFocus()
})
