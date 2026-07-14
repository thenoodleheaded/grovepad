import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useToastStore } from '../../store/useToastStore'

/** Portaled toast stack — bottom-center, above the selection bar, below dialogs. */
export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts)
  if (toasts.length === 0) return null
  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-20 left-1/2 z-[190] flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="gp-toast gp-pop gp-panel pointer-events-auto flex min-h-10 items-center gap-2.5 rounded-2xl px-4 py-2 shadow-2xl"
        >
          <span className="text-xs text-neutral-200">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.run()
                useToastStore.getState().removeToast(toast.id)
              }}
              className="rounded-lg px-1.5 py-1 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-400/10 hover:text-emerald-200"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => useToastStore.getState().removeToast(toast.id)}
            className="text-neutral-600 transition-colors hover:text-neutral-300"
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
