import { useEffect, useRef, useState } from 'react'

/**
 * Open/close state for the widget skin roller. The trigger is the title
 * capsule's own icon, and the roller opens in place over the title row, so
 * this hook holds both the open flag and a ref to that row for measuring.
 *
 * Nothing here listens to the document: the roller owns dismissal, and a
 * global listener would fire on the very pointer-down that starts a roll.
 */
export function useWidgetSkinSwitch(hidden: boolean) {
  const [open, setOpen] = useState(false)
  // True from the moment a skin is committed until the roller has finished
  // closing. The roller flies the chosen icon back to the title capsule, and
  // the capsule is already wearing that same icon — so it stands aside for
  // the length of the flight, and the arriving icon is the only one visible.
  const [handingBack, setHandingBack] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const titleRowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!hidden) return
    setOpen(false)
    setHandingBack(false)
  }, [hidden])

  return { open, setOpen, handingBack, setHandingBack, triggerRef, titleRowRef }
}
