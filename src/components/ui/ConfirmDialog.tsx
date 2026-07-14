import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useOverlayLifecycle } from '../../store/useOverlayStore'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useOverlayLifecycle(open)
  useFocusTrap(open, panelRef, cancelRef)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gp-confirm-title"
      aria-describedby="gp-confirm-description"
      className="fixed inset-0 z-[240] flex items-center justify-center p-5"
    >
      <div
        role="presentation"
        className="gp-scrim gp-fade absolute inset-0 bg-black/55"
        onPointerDown={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="gp-dialog gp-pop gp-panel relative z-10 w-full max-w-sm overflow-hidden rounded-3xl p-5 shadow-2xl outline-none"
      >
        <div className="flex gap-3.5">
          <span
            aria-hidden
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
              destructive
                ? 'border-red-400/25 bg-red-400/10 text-red-300'
                : 'border-amber-400/25 bg-amber-400/10 text-amber-300'
            }`}
          >
            <AlertTriangle size={17} />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 id="gp-confirm-title" className="text-sm font-semibold text-neutral-100">
              {title}
            </h2>
            <p id="gp-confirm-description" className="mt-1 text-xs leading-relaxed text-neutral-500">
              {description}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className="h-9 rounded-xl border gp-hairline px-3.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className={`h-9 rounded-xl px-3.5 text-xs font-semibold transition-[background-color,transform] active:scale-[0.97] ${
              destructive
                ? 'bg-red-500 text-white hover:bg-red-400'
                : 'bg-emerald-400 text-neutral-950 hover:bg-emerald-300'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
