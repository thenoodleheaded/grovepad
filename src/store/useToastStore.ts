import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  action?: { label: string; run: () => void }
}

export interface ToastOptions {
  action?: Toast['action']
  duration?: number
}

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, options?: ToastOptions) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  addToast: (message, options) => {
    const id = crypto.randomUUID()
    // Keep at most 3 toasts; oldest drops off the back.
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, message, action: options?.action }] }))
    setTimeout(() => {
      set((state) => {
        const toasts = state.toasts.filter((toast) => toast.id !== id)
        return toasts.length === state.toasts.length ? state : { toasts }
      })
    }, options?.duration ?? (options?.action ? 6000 : 2800))
  },
  removeToast: (id) =>
    set((state) => {
      const toasts = state.toasts.filter((toast) => toast.id !== id)
      return toasts.length === state.toasts.length ? state : { toasts }
    }),
}))
