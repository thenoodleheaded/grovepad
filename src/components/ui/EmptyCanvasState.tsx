import { Command, Network, Plus, Zap } from 'lucide-react'
import { useCanvasWidgetCount } from '../../hooks/useCanvasWidgets'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { screenToWorld } from '../../types/spatial'
import { createLifeTemplate, LIFE_TEMPLATES } from '../../utils/lifeTemplates'

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

  if (!isEmpty) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-5">
      <section
        data-canvas-ui
        aria-label="Empty canvas actions"
        className="gp-fade gp-panel pointer-events-auto w-full max-w-md overflow-hidden rounded-[28px] p-1 shadow-2xl"
      >
        <div className="rounded-[24px] border gp-hairline bg-neutral-950/35 px-6 py-6 text-center sm:px-8 sm:py-7">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 shadow-[0_0_28px_rgba(163,230,53,0.12)]">
            <Network size={18} aria-hidden />
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-neutral-100">
            Start with one useful thing
          </h1>
          <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-neutral-500">
            Add a widget, pour in a quick list, then connect ideas into branches as your board grows.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => useWidgetStore.getState().openAddWidget(viewCenterWorld())}
              className="flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-400 text-xs font-semibold text-neutral-950 transition-[background-color,transform,scale] hover:bg-emerald-300 active:scale-[0.97]"
            >
              <Plus size={14} aria-hidden />
              Add widget
            </button>
            <button
              type="button"
              onClick={() => useWidgetStore.getState().setQuickAddOpen(true)}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border gp-hairline bg-neutral-900/65 text-xs font-semibold text-neutral-300 transition-[background-color,color,transform,scale] hover:bg-neutral-800 hover:text-white active:scale-[0.97]"
            >
              <Zap size={13} aria-hidden />
              Quick capture
            </button>
          </div>

          <div className="mt-4 border-t gp-hairline pt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-600">Start from a working system</p>
            <div className="grid grid-cols-2 gap-1.5">
              {LIFE_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  title={template.description}
                  onClick={() => createLifeTemplate(template, viewCenterWorld())}
                  className="rounded-lg border gp-hairline bg-neutral-900/45 px-2 py-2 text-left text-[10px] font-medium text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
                >
                  {template.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={createLiveDemo}
            className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-violet-400/25 bg-violet-400/10 text-xs font-semibold text-violet-200 transition-colors hover:bg-violet-400/20"
          >
            <Network size={13} aria-hidden />
            See a live connected demo
          </button>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t gp-hairline pt-4 text-[10px] text-neutral-600">
            <span className="flex items-center gap-1.5">
              <Command size={10} aria-hidden /> K searches everything
            </span>
            <span>Drag empty space to move</span>
            <span>Shift + drag to select</span>
          </div>
        </div>
      </section>
    </div>
  )
}
