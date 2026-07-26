import { Network, Plus, Zap } from 'lucide-react'
import { useCanvasWidgetCount } from '../../hooks/useCanvasWidgets'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useThemeStore } from '../../store/useThemeStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { screenToWorld } from '../../types/spatial'

function viewCenterWorld() {
  const canvas = useCanvasStore.getState()
  return screenToWorld(
    { x: canvas.viewportSize.width / 2, y: canvas.viewportSize.height / 2 },
    { x: canvas.pan.x, y: canvas.pan.y, zoom: canvas.zoom },
  )
}

function createLiveDemo(): void {
  const origin = viewCenterWorld()
  const store = useWidgetStore.getState()
  const checklist = store.createWidget('Launch checklist', { x: origin.x - 420, y: origin.y - 180 }, 'checklist')
  const decision = store.createWidget('Ready to publish?', { x: origin.x, y: origin.y - 180 }, 'decision')
  const timer = store.createWidget('Focus sprint', { x: origin.x - 420, y: origin.y + 180 }, 'timer')
  const progress = store.createWidget('Launch progress', { x: origin.x, y: origin.y + 180 }, 'progress')
  const note = store.createWidget('Share the result', { x: origin.x + 420, y: origin.y }, 'notes')
  store.addRelation(checklist, decision, 'parent')
  store.addRelation(decision, note, 'parent')
  store.addRelation(timer, progress, 'parent')
  store.addRelation(progress, note, 'parent')
  store.selectWidgets([checklist, decision, timer, progress, note])
}

export function EmptyCanvasState() {
  const isEmpty = useCanvasWidgetCount() === 0
  const shaping = useWidgetStore((state) => state.ghostConfig !== null)
  const theme = useThemeStore((state) => state.theme)

  if (!isEmpty || shaping) return null

  // Tailwind utilities win over the stylesheet's theme selectors, so the plate
  // picks its own ink instead of being re-coloured from CSS.
  const light = theme === 'light'
  const headingInk = light ? 'text-neutral-900' : 'text-neutral-100'
  const ghostInk = light ? 'text-neutral-700 hover:text-neutral-900' : 'text-neutral-200 hover:text-white'
  const quietInk = light
    ? 'text-neutral-500 hover:text-neutral-900'
    : 'text-neutral-400 hover:text-neutral-100'

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-5">
      <section
        data-canvas-ui
        aria-label="Empty canvas actions"
        className="gp-fade gp-empty-plate pointer-events-auto flex w-full max-w-[19rem] flex-col items-center rounded-[26px] px-6 py-7 text-center"
      >
        <img
          src={light ? '/brand/logo-dark.png' : '/brand/logo-light.png'}
          alt=""
          aria-hidden
          className="h-12 w-12"
        />
        <h1 className={`mt-3 text-[15px] font-semibold tracking-tight ${headingInk}`}>
          Start with one useful thing
        </h1>

        <div className="mt-5 grid w-full grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => useWidgetStore.getState().openAddWidget(viewCenterWorld())}
            className="flex h-10 items-center justify-center gap-2 rounded-2xl bg-emerald-400 text-xs font-semibold text-neutral-950 transition-[background-color,transform,scale] hover:bg-emerald-300 active:scale-[0.97]"
          >
            <Plus size={14} aria-hidden />
            Add widget
          </button>
          <button
            type="button"
            onClick={() => useWidgetStore.getState().setQuickAddOpen(true)}
            className={`gp-empty-ghost flex h-10 items-center justify-center gap-2 rounded-2xl text-xs font-semibold transition-[background-color,color,transform,scale] active:scale-[0.97] ${ghostInk}`}
          >
            <Zap size={13} aria-hidden />
            Quick capture
          </button>
        </div>

        <button
          type="button"
          onClick={createLiveDemo}
          className={`mt-3 flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-[11px] font-medium transition-colors ${quietInk}`}
        >
          <Network size={12} aria-hidden />
          See a live connected demo
        </button>
      </section>
    </div>
  )
}
