import { AlertTriangle, RefreshCw } from 'lucide-react'
import { PERSISTED_BOARD_VERSION } from '../../types/persistence'
import type { PersistenceCompatibilityBlock as CompatibilityBlock } from '../../store/usePersistenceStatusStore'

interface PersistenceCompatibilityBlockProps {
  block: CompatibilityBlock
}

export function PersistenceCompatibilityBlock({ block }: PersistenceCompatibilityBlockProps) {
  const location = block.source === 'cloud' ? 'your cloud board' : 'the board on this device'

  return (
    <main className="flex h-dvh w-screen items-center justify-center bg-neutral-950 p-6 text-neutral-100">
      <section
        aria-labelledby="gp-compatibility-title"
        className="gp-panel w-full max-w-md rounded-3xl border border-amber-400/20 p-6 shadow-2xl"
        data-persistence-compatibility-block
      >
        <span
          aria-hidden
          className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10 text-amber-300"
        >
          <AlertTriangle size={19} />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300/80">
          Protected read-only state
        </p>
        <h1 id="gp-compatibility-title" className="mt-2 text-xl font-semibold tracking-tight">
          This board needs a newer Grovepad
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          Grovepad found format version {block.foundVersion} in {location}. This build safely supports
          through version {PERSISTED_BOARD_VERSION}, so editing and saving are paused to prevent data loss.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-neutral-950 transition-[background-color,transform] hover:bg-emerald-300 active:scale-[0.98]"
        >
          <RefreshCw size={15} aria-hidden />
          Refresh Grovepad
        </button>
        <p className="mt-3 text-xs leading-5 text-neutral-600">
          If this screen remains after refreshing, install or open the latest Grovepad build. The newer
          board has not been overwritten.
        </p>
      </section>
    </main>
  )
}
