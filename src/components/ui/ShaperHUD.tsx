import { useEffect } from 'react'
import { Network } from 'lucide-react'
import { useWidgetStore } from '../../store/useWidgetStore'
import { ghostTreeUnconfiguredCount, ghostTreeWidgetCount } from '../../types/spatial'
import { isOverlayOpen } from '../../store/useOverlayStore'

/**
 * Fixed bottom-center banner shown while the Ghost Tree Shaper is active.
 * Owns the Esc-to-cancel listener so it only exists while relevant.
 */
export function ShaperHUD() {
  const config = useWidgetStore((state) => state.ghostConfig)

  useEffect(() => {
    if (!config) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isOverlayOpen()) useWidgetStore.getState().cancelGhostShaper()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [config])

  if (!config) return null

  const count = ghostTreeWidgetCount(config.nodes)
  const unconfigured = ghostTreeUnconfiguredCount(config.nodes)

  return (
    <div
      data-canvas-ui
      className="gp-canvas-ui-scale gp-toolbar gp-pop gp-panel fixed bottom-6 left-1/2 z-[220] flex -translate-x-1/2 select-none items-center gap-4 rounded-2xl border border-emerald-700/50 px-4 py-2.5 shadow-2xl"
      style={{ transformOrigin: '50% 100%' }}
    >
      <Network size={16} className="shrink-0 text-emerald-400" aria-hidden />
      <div className="text-xs">
        <p className="font-medium text-neutral-200">
          Tree layout:{' '}
          <span className="font-semibold text-emerald-300 tabular-nums">{config.nodes.length}</span> Nodes
          · recursive tree shaping
        </p>
        <p className="text-neutral-500">
          {unconfigured > 0
            ? `${unconfigured} ${unconfigured === 1 ? 'point needs' : 'points need'} widgets · press a dotted + to choose`
            : `${count} ${count === 1 ? 'widget' : 'widgets'} will be created · pull nodes directly to sculpt`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => useWidgetStore.getState().cancelGhostShaper()}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={unconfigured > 0}
          onClick={() => useWidgetStore.getState().commitGhostTree()}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-35"
        >
          Create Tree
        </button>
      </div>
    </div>
  )
}
