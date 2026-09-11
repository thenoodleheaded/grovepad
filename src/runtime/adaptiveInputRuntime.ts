import { useAdaptiveInputStore } from '../store/useAdaptiveInputStore'
import {
  virtualKeyboardInset,
  virtualKeyboardIsOpen,
  visibleViewportFromWindow,
} from '../utils/visibleViewport'

type MediaKey = 'coarse' | 'fine' | 'hover' | 'reducedMotion'

/**
 * Owns device-capability listeners for the whole app. The service writes only
 * discrete capability/modality changes to Zustand; pointer movement remains
 * entirely outside React and never becomes a render-frequency subscription.
 */
export function initAdaptiveInputRuntime(): () => void {
  const media: Record<MediaKey, MediaQueryList> = {
    coarse: window.matchMedia('(any-pointer: coarse)'),
    fine: window.matchMedia('(any-pointer: fine)'),
    hover: window.matchMedia('(any-hover: hover)'),
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)'),
  }

  const updateCapabilities = () => {
    const viewport = visibleViewportFromWindow()
    const keyboardInset = virtualKeyboardInset(window.innerHeight, viewport)
    useAdaptiveInputStore.getState().updateCapabilities({
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
      hasCoarsePointer: media.coarse.matches,
      hasFinePointer: media.fine.matches,
      canHover: media.hover.matches,
      reducedMotion: media.reducedMotion.matches,
    })
    const root = document.documentElement
    root.style.setProperty('--gp-keyboard-inset', `${keyboardInset}px`)
    const keyboardOpen = virtualKeyboardIsOpen(keyboardInset)
    root.dataset.virtualKeyboard = keyboardOpen ? 'open' : 'closed'
    if (!keyboardOpen) restoreDocumentScroll()
  }

  // iOS WebKit ignores `interactive-widget=resizes-content`, so focusing a
  // field scrolls the whole document to lift it above the keyboard. Grovepad
  // never scrolls the document itself (html and body are overflow: hidden), and
  // iOS does not reliably scroll it back once the keyboard closes, which left
  // the top toolbar stranded under the status bar for the rest of the session.
  // Put the document back, but only when nothing is being edited: resetting
  // while a field has focus would drop that field behind the keyboard.
  let restoreFrame = 0
  const isEditingText = () => {
    const active = document.activeElement as HTMLElement | null | undefined
    if (!active) return false
    return active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)
  }
  const restoreDocumentScroll = () => {
    if ((window.scrollX || 0) === 0 && (window.scrollY || 0) === 0) return
    window.cancelAnimationFrame(restoreFrame)
    // Deferred a frame: during a focus move, focusout fires before the next
    // field is focused, and resetting in between would fight iOS mid-transition.
    restoreFrame = window.requestAnimationFrame(() => {
      restoreFrame = 0
      if (!isEditingText()) window.scrollTo(0, 0)
    })
  }

  const syncDocumentState = () => {
    const state = useAdaptiveInputStore.getState()
    const root = document.documentElement
    root.dataset.activeInput = state.activeInput
    root.dataset.interactionMode = state.interactionMode
    root.dataset.viewportClass = state.capabilities.viewportClass
    root.dataset.hasCoarsePointer = state.capabilities.hasCoarsePointer ? 'true' : 'false'
    root.dataset.hasFinePointer = state.capabilities.hasFinePointer ? 'true' : 'false'
    root.dataset.canHover = state.capabilities.canHover ? 'true' : 'false'
  }

  const onPointer = (event: PointerEvent) => {
    useAdaptiveInputStore.getState().notePointerInput(event.pointerType)
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.key.length > 0) {
      useAdaptiveInputStore.getState().noteKeyboardInput()
    }
  }

  updateCapabilities()
  syncDocumentState()
  const unsubscribe = useAdaptiveInputStore.subscribe(syncDocumentState)
  window.addEventListener('pointerdown', onPointer, { capture: true, passive: true })
  window.addEventListener('pointerover', onPointer, { capture: true, passive: true })
  window.addEventListener('keydown', onKey, { capture: true })
  window.addEventListener('resize', updateCapabilities, { passive: true })
  window.addEventListener('focusout', restoreDocumentScroll, { capture: true })
  window.visualViewport?.addEventListener('resize', updateCapabilities, { passive: true })
  for (const query of Object.values(media)) query.addEventListener('change', updateCapabilities)

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    unsubscribe()
    window.removeEventListener('pointerdown', onPointer, { capture: true })
    window.removeEventListener('pointerover', onPointer, { capture: true })
    window.removeEventListener('keydown', onKey, { capture: true })
    window.removeEventListener('resize', updateCapabilities)
    window.removeEventListener('focusout', restoreDocumentScroll, { capture: true })
    if (restoreFrame) window.cancelAnimationFrame(restoreFrame)
    window.visualViewport?.removeEventListener('resize', updateCapabilities)
    for (const query of Object.values(media)) query.removeEventListener('change', updateCapabilities)
  }
}
