import { useEffect, useRef, useState } from 'react'
import { useOverlayLifecycle } from '../../store/useOverlayStore'

/**
 * Open/close state for the widget mode switcher. The trigger (the title
 * capsule's own icon) and the plate it opens live in different parts of the
 * card's DOM tree, so outside-click detection checks both refs rather than
 * relying on one wrapping container.
 */
export function useWidgetModeSwitch(hidden: boolean) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const plateRef = useRef<HTMLDivElement | null>(null)
  useOverlayLifecycle(open)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || plateRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (hidden) setOpen(false)
  }, [hidden])

  return { open, setOpen, triggerRef, plateRef }
}
