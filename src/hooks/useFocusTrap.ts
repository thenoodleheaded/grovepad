import { useEffect, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Keeps keyboard focus inside a temporary surface and restores the previous
 * focus target when it closes. Dialogs can still own Escape and arrow keys;
 * this hook deliberately handles only initial focus, Tab, and restoration.
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return
    const previous = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const frame = requestAnimationFrame(() => {
      const container = containerRef.current
      if (!container) return
      const first = container.querySelector<HTMLElement>(FOCUSABLE)
      ;(initialFocusRef?.current ?? first ?? container).focus({ preventScroll: true })
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const container = containerRef.current
      if (!container) return
      const focusable = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null,
      )
      if (focusable.length === 0) {
        event.preventDefault()
        container.focus({ preventScroll: true })
        return
      }
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (!container.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown, true)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [active, containerRef, initialFocusRef])
}
