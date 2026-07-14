import { useState } from 'react'
import { Cloud, X } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useWidgetStore } from '../../store/useWidgetStore'

export function GuestBackupNudge() {
  const session = useAuthStore((state) => state.session)
  const count = useWidgetStore((state) => Object.keys(state.widgets).length)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('grovepad:backup-nudge') === 'dismissed')
  if (session || count < 15 || dismissed) return null
  return (
    <div data-canvas-ui className="gp-panel gp-pop fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-amber-300/20 px-4 py-2.5 shadow-2xl">
      <Cloud size={14} className="text-amber-300" aria-hidden />
      <div><p className="text-xs font-medium text-neutral-200">This board lives only on this device</p><p className="text-[10px] text-neutral-500">Sign in to keep it backed up across devices.</p></div>
      <button type="button" onClick={() => useAuthStore.getState().exitGuest()} className="rounded-lg bg-amber-300/15 px-2 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-300/25">Sign in</button>
      <button type="button" aria-label="Dismiss" onClick={() => { setDismissed(true); localStorage.setItem('grovepad:backup-nudge', 'dismissed') }} className="text-neutral-600 hover:text-white"><X size={11} /></button>
    </div>
  )
}
