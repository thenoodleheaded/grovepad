import { RefreshCw } from 'lucide-react'
import { usePersistenceStatusStore } from '../../store/usePersistenceStatusStore'

export function DeployUpdateBanner() {
  const updateAvailable = usePersistenceStatusStore((state) => state.deployUpdateAvailable)
  if (!updateAvailable) return null

  return <DeployUpdateNotice />
}

export function DeployUpdateNotice() {
  return (
    <aside
      aria-label="Grovepad update available"
      className="gp-panel fixed left-1/2 top-4 z-[230] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-emerald-400/20 px-3 py-2 shadow-2xl"
      data-deploy-update-banner
    >
      <p className="text-xs text-neutral-300">A newer Grovepad build is ready.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-emerald-400 px-3 text-xs font-semibold text-neutral-950 transition-[background-color,transform] hover:bg-emerald-300 active:scale-[0.98]"
      >
        <RefreshCw size={13} aria-hidden />
        Refresh
      </button>
    </aside>
  )
}
