import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayDismiss } from '../../hooks/useOverlayDismiss'

interface DialogShellProps {
  open: boolean
  onClose: () => void
  /** id of the element naming the dialog (aria-labelledby). */
  labelledBy: string
  /** id of the element describing the dialog, when one exists. */
  describedBy?: string
  /** Positioning/padding classes for the fixed wrapper. */
  wrapperClassName?: string
  /** Extra classes on the scrim (darkness/blur variants). */
  scrimClassName?: string
  /** The panel element itself — must carry ref + tabIndex from `panelRef`. */
  children: ReactNode
  panelRef: RefObject<HTMLDivElement | null>
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Set false when the surface owns its own Escape handling. */
  escape?: boolean
}

/**
 * Portal + dialog semantics + scrim + dismiss triple shared by every modal
 * surface. The caller renders its own panel as `children` (with `panelRef`
 * attached) so panel chrome stays fully under the surface's control.
 */
export function DialogShell({
  open,
  onClose,
  labelledBy,
  describedBy,
  wrapperClassName = 'fixed inset-0 z-[300] flex items-center justify-center p-5',
  scrimClassName = 'bg-black/55',
  children,
  panelRef,
  initialFocusRef,
  escape,
}: DialogShellProps) {
  useOverlayDismiss(open, onClose, { containerRef: panelRef, initialFocusRef, escape })

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      {...(describedBy ? { 'aria-describedby': describedBy } : {})}
      className={wrapperClassName}
    >
      <div
        role="presentation"
        className={`gp-scrim gp-fade absolute inset-0 ${scrimClassName}`}
        onPointerDown={onClose}
      />
      {children}
    </div>,
    document.body,
  )
}
