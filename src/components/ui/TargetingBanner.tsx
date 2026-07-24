import { useEffect } from 'react'
import { Cable, Link2, Network } from 'lucide-react'
import { useWidgetStore } from '../../store/useWidgetStore'
import { usesStrictRelations } from '../../utils/relationPolicy'

/** Top-center banner shown during an active link gesture (Cmd+drag or "Link as child of…"). */
export function TargetingBanner() {
  const isLinking = useWidgetStore((state) => state.linkDrag !== null)
  const childLinkSource = useWidgetStore((state) => state.childLinkSource)
  const dependencyLinkSource = useWidgetStore((state) => state.dependencyLinkSource)
  const strictRelations = useWidgetStore((state) =>
    usesStrictRelations(state.canvases[state.activeCanvasId]),
  )
  const isActive = isLinking || childLinkSource !== null || dependencyLinkSource !== null

  useEffect(() => {
    if (!isActive) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (isLinking) useWidgetStore.getState().endLinkDrag(null)
      if (childLinkSource) useWidgetStore.getState().clearChildLink()
      if (dependencyLinkSource) useWidgetStore.getState().clearDependencyLink()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isActive, isLinking, childLinkSource, dependencyLinkSource])

  if (!isActive) return null

  return (
    <div
      data-canvas-ui
      className="gp-canvas-ui-scale gp-toolbar gp-panel absolute left-1/2 top-4 z-20 flex -translate-x-1/2 select-none items-center gap-2 rounded-2xl px-4 py-2 text-xs text-neutral-100 shadow-xl"
      style={{ borderColor: 'rgba(99,102,241,0.55)' }}
    >
      {dependencyLinkSource ? (
        <>
          <Cable size={13} className="text-amber-400" aria-hidden />
          <span>
            Click the widget that depends on this prerequisite ·{' '}
            <kbd className="rounded border border-neutral-600 bg-neutral-800 px-1  text-[10px]">
              Esc
            </kbd>{' '}
            to cancel
          </span>
        </>
      ) : childLinkSource ? (
        <>
          <Network size={13} className="text-indigo-400" aria-hidden />
          <span>
            {strictRelations ? 'Click a widget to set it as parent' : 'Click a widget to connect'} ·{' '}
            <kbd className="rounded border border-neutral-600 bg-neutral-800 px-1  text-[10px]">
              Esc
            </kbd>{' '}
            to cancel
          </span>
        </>
      ) : (
        <>
          <Link2 size={13} className="text-indigo-400" aria-hidden />
          <span>
            Linking — release on a widget to connect ·{' '}
            <kbd className="rounded border border-neutral-600 bg-neutral-800 px-1  text-[10px]">
              Esc
            </kbd>{' '}
            to cancel
          </span>
        </>
      )}
    </div>
  )
}
