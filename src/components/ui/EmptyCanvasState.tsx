import { BookOpen, Plus, Zap } from 'lucide-react'
import { useCanvasWidgetCount } from '../../hooks/useCanvasWidgets'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { screenToWorld } from '../../types/spatial'

function viewCenterWorld() {
  const canvas = useCanvasStore.getState()
  return screenToWorld(
    { x: canvas.viewportSize.width / 2, y: canvas.viewportSize.height / 2 },
    { x: canvas.pan.x, y: canvas.pan.y, zoom: canvas.zoom },
  )
}

export function EmptyCanvasState() {
  const isEmpty = useCanvasWidgetCount() === 0
  const shaping = useWidgetStore((state) => state.ghostConfig !== null)

  if (!isEmpty || shaping) return null

  // The plate is authored for the dark backdrop; the light theme's bright
  // canvas re-skins it in CSS ([data-theme='light'] .gp-empty-plate).
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-5">
      <section
        data-canvas-ui
        aria-label="Empty canvas actions"
        className="gp-fade gp-empty-plate pointer-events-auto relative flex w-full max-w-[20rem] flex-col items-center overflow-hidden rounded-[30px] px-6 pb-7 pt-9 text-center"
      >
        <span className="gp-empty-mark relative">
          <img src="/brand/logo-light.png" alt="" aria-hidden className="relative block h-14 w-14" />
        </span>

        <h1 className="mt-5 text-[17px] font-semibold leading-tight tracking-[-0.012em] text-white">
          Start with one useful thing
        </h1>

        <button
          type="button"
          onClick={() => useWidgetStore.getState().openAddWidget(viewCenterWorld())}
          className="gp-empty-primary mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-[16px] text-[13px] font-semibold text-neutral-950"
        >
          <Plus size={15} strokeWidth={2.5} aria-hidden />
          Add widget
        </button>

        <div className="mt-2.5 grid w-full grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => useWidgetStore.getState().setQuickAddOpen(true)}
            className="gp-empty-ghost flex h-10 items-center justify-center gap-2 rounded-[14px] text-xs font-medium text-neutral-300"
          >
            <Zap size={13} aria-hidden />
            Quick capture
          </button>
          <button
            type="button"
            onClick={() => useWidgetStore.getState().setRecipesOpen(true)}
            className="gp-empty-ghost flex h-10 items-center justify-center gap-2 rounded-[14px] text-xs font-medium text-neutral-300"
          >
            <BookOpen size={13} aria-hidden />
            Recipes
          </button>
        </div>
      </section>
    </div>
  )
}
