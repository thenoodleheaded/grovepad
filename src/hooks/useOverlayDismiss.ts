import { useEffect, type RefObject } from 'react'
import { useFocusTrap } from './useFocusTrap'
import { useOverlayLifecycle } from '../store/useOverlayStore'

/**
 * The standard lifecycle triple every temporary surface repeats: register
 * with the global overlay count, trap focus inside the panel, and close on
 * Escape. Surfaces with richer keyboard handling (list navigation, staged
 * escapes) keep their own key handler and pass `escape: false`.
 */
export function useOverlayDismiss(
  open: boolean,
  onClose: () => void,
  options: {
    containerRef: RefObject<HTMLElement | null>
    initialFocusRef?: RefObject<HTMLElement | null>
    /** Set false when the surface owns its own Escape handling. */
    escape?: boolean
  },
): void {
  useOverlayLifecycle(open)
  useFocusTrap(open, options.containerRef, options.initialFocusRef)
  const escape = options.escape ?? true

  useEffect(() => {
    if (!open || !escape) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, escape, onClose])
}
