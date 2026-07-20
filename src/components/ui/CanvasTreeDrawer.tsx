import { useEffect, useRef, useState } from 'react'
import { ChevronRight, File, FolderInput, Pencil, Square, Trash2, X } from 'lucide-react'
import { useCanvasTreeStore } from '../../store/useCanvasTreeStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { requestWidgetDeletion } from '../../store/useWidgetDeletionDialogStore'
import type { CanvasMeta } from '../../types/spatial'
import { useAdaptiveInputStore } from '../../store/useAdaptiveInputStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { canvasParentTargets } from '../../utils/canvasTreePolicy'
import {
  buildCanvasOutline,
  nextCanvasOutlineKey,
  type CanvasOutlineNavigationKey,
} from '../../utils/canvasOutline'
import { frameCanvas } from '../../utils/cameraFraming'
import { MODULE_LABELS } from '../../types/moduleLabels'

const OUTLINE_NAV_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
])

export function CanvasTreeDrawer() {
  const open = useCanvasTreeStore((state) => state.open)
  const workspaces = useWidgetStore((state) => state.workspaces)
  const canvases = useWidgetStore((state) => state.canvases)
  const widgets = useWidgetStore((state) => state.widgets)
  const activeWorkspaceId = useWidgetStore((state) => state.activeWorkspaceId)
  const activeCanvasId = useWidgetStore((state) => state.activeCanvasId)
  const selectedIds = useWidgetStore((state) => state.selectedIds)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [movingCanvas, setMovingCanvas] = useState<string | null>(null)
  const viewportClass = useAdaptiveInputStore((state) => state.capabilities.viewportClass)
  const modalDrawer = viewportClass !== 'desktop'
  const asideRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useOverlayLifecycle(open && modalDrawer)
  useFocusTrap(open && modalDrawer, asideRef, closeRef)
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (movingCanvas) setMovingCanvas(null)
      else useCanvasTreeStore.getState().setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, movingCanvas])
  if (!open) return null
  const workspace = workspaces[activeWorkspaceId]
  if (!workspace) return null
  const children = new Map<string | null, CanvasMeta[]>()
  for (const canvas of Object.values(canvases)) {
    if (canvas.workspaceId !== activeWorkspaceId) continue
    const list = children.get(canvas.parentCanvasId) ?? []
    list.push(canvas)
    children.set(canvas.parentCanvasId, list)
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  }
  const widgetsByCanvas = new Map<string, typeof widgets[string][]>()
  for (const widget of Object.values(widgets)) {
    if (widget.type === 'canvas_node' || canvases[widget.canvasId]?.workspaceId !== activeWorkspaceId) continue
    const list = widgetsByCanvas.get(widget.canvasId) ?? []
    list.push(widget)
    widgetsByCanvas.set(widget.canvasId, list)
  }
  for (const list of widgetsByCanvas.values()) {
    list.sort((a, b) =>
      a.position.y - b.position.y ||
      a.position.x - b.position.x ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
    )
  }
  const outlineEntries = buildCanvasOutline(
    canvases,
    widgets,
    activeWorkspaceId,
    workspace.rootCanvasId,
  )
  const focusOutlineEntry = (key: string) => {
    asideRef.current
      ?.querySelector<HTMLElement>(`[data-outline-key="${CSS.escape(key)}"]`)
      ?.focus()
  }
  const handleOutlineKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    key: string,
    activate: () => void,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate()
      return
    }
    if (!OUTLINE_NAV_KEYS.has(event.key)) return
    event.preventDefault()
    focusOutlineEntry(nextCanvasOutlineKey(
      outlineEntries,
      key,
      event.key as CanvasOutlineNavigationKey,
    ))
  }
  const activateWidget = (widgetId: string) => {
    const widget = useWidgetStore.getState().widgets[widgetId]
    if (!widget) return
    if (widget.canvasId !== useWidgetStore.getState().activeCanvasId) {
      useWidgetStore.getState().navigateToCanvas(widget.canvasId)
    }
    useWidgetStore.getState().selectWidget(widget.id, false)
    frameCanvas('selection', 180)
  }
  const renderBranch = (canvas: CanvasMeta, depth: number): React.ReactNode => (
    <div key={canvas.id} role="none">
      <div
        draggable={canvas.parentCanvasId !== null}
        onDragStart={() => setDragging(canvas.id)}
        onDragEnd={() => setDragging(null)}
        onDragOver={(event) => { if (dragging && dragging !== canvas.id) event.preventDefault() }}
        onDrop={() => { if (dragging) useWidgetStore.getState().reparentCanvas(dragging, canvas.id); setDragging(null) }}
        className={`group/tree flex min-h-11 items-center gap-1 rounded-lg pr-1 text-xs ${canvas.id === activeCanvasId ? 'bg-violet-400/12 text-violet-200' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
        style={{ paddingLeft: 7 + depth * 14 }}
      >
        <ChevronRight size={10} className={children.get(canvas.id)?.length ? 'text-neutral-600' : 'opacity-0'} />
        <File size={11} aria-hidden />
        {renaming === canvas.id ? (
          <input
            autoFocus
            defaultValue={canvas.name}
            onBlur={(event) => { useWidgetStore.getState().renameCanvas(canvas.id, event.currentTarget.value); setRenaming(null) }}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(null) }}
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        ) : (
          <button
            type="button"
            role="treeitem"
            aria-level={depth + 1}
            aria-current={canvas.id === activeCanvasId ? 'page' : undefined}
            aria-expanded={((children.get(canvas.id)?.length ?? 0) + (widgetsByCanvas.get(canvas.id)?.length ?? 0)) > 0 ? true : undefined}
            data-outline-key={`canvas:${canvas.id}`}
            onClick={() => useWidgetStore.getState().navigateToCanvas(canvas.id)}
            onKeyDown={(event) => handleOutlineKey(event, `canvas:${canvas.id}`, () => useWidgetStore.getState().navigateToCanvas(canvas.id))}
            className="min-h-11 min-w-0 flex-1 truncate text-left"
          >
            {canvas.name}
          </button>
        )}
        <span aria-label={`${widgetsByCanvas.get(canvas.id)?.length ?? 0} cards`} className="text-[9px] text-neutral-600">{widgetsByCanvas.get(canvas.id)?.length ?? 0}</span>
        {canvas.parentCanvasId !== null && (
          <button
            type="button"
            aria-label={`Move ${canvas.name}`}
            onClick={() => setMovingCanvas(canvas.id)}
            className="gp-tree-row-action gp-touch-target pointer-events-none flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 opacity-0 hover:text-violet-200 group-hover/tree:pointer-events-auto group-hover/tree:opacity-100"
          >
            <FolderInput size={11} aria-hidden />
          </button>
        )}
        <button type="button" aria-label={`Rename ${canvas.name}`} onClick={() => setRenaming(canvas.id)} className="gp-tree-row-action gp-touch-target pointer-events-none flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 opacity-0 hover:text-neutral-200 group-hover/tree:pointer-events-auto group-hover/tree:opacity-100"><Pencil size={10} /></button>
        {canvas.parentCanvasId !== null && (
          <button
            type="button"
            aria-label={`Delete ${canvas.name}`}
            onClick={() => {
              const state = useWidgetStore.getState()
              const owner = Object.values(state.widgets).find((widget) => widget.type === 'canvas_node' && (widget.data as { canvasId?: string }).canvasId === canvas.id)
              if (owner) requestWidgetDeletion([owner.id])
            }}
            className="gp-tree-row-action gp-touch-target pointer-events-none flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 opacity-0 hover:text-red-400 group-hover/tree:opacity-100 group-hover/tree:pointer-events-auto"
          ><Trash2 size={10} /></button>
        )}
      </div>
      {(widgetsByCanvas.get(canvas.id) ?? []).map((widget) => (
        <div key={widget.id} role="none" className="group/outline flex min-h-11 items-center gap-2 rounded-lg pr-2 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-white" style={{ paddingLeft: 23 + depth * 14 }}>
          <Square size={8} aria-hidden className="shrink-0 text-emerald-400/70" />
          <button
            type="button"
            role="treeitem"
            aria-level={depth + 2}
            aria-selected={selectedIds.has(widget.id)}
            aria-label={`${widget.title}, ${MODULE_LABELS[widget.type]} card`}
            data-outline-key={`widget:${widget.id}`}
            onClick={() => activateWidget(widget.id)}
            onKeyDown={(event) => handleOutlineKey(event, `widget:${widget.id}`, () => activateWidget(widget.id))}
            className="min-h-11 min-w-0 flex-1 truncate text-left"
          >
            <span className="block truncate text-neutral-300">{widget.title}</span>
            <span className="block truncate text-[9px] text-neutral-600">{MODULE_LABELS[widget.type]}</span>
          </button>
        </div>
      ))}
      {(children.get(canvas.id) ?? []).map((child) => renderBranch(child, depth + 1))}
    </div>
  )
  const moving = movingCanvas ? canvases[movingCanvas] : undefined
  const moveTargets = movingCanvas ? canvasParentTargets(canvases, movingCanvas) : []
  return (
    <>
      <button
        type="button"
        aria-label="Close canvas tree"
        className="gp-canvas-tree-scrim fixed inset-0 z-[39] hidden bg-black/55"
        onClick={() => useCanvasTreeStore.getState().setOpen(false)}
      />
      <aside
        ref={asideRef}
        data-canvas-ui
        aria-label="Canvas tree"
        aria-modal={modalDrawer || undefined}
        role={modalDrawer ? 'dialog' : undefined}
        className="gp-canvas-tree gp-panel gp-pop fixed bottom-16 left-4 top-16 z-40 w-72 overflow-hidden rounded-2xl border gp-hairline shadow-2xl"
      >
        <header className="flex min-h-11 items-center justify-between border-b gp-hairline px-3">
          <div>
            <p className="text-xs font-semibold text-neutral-200">{workspace.name}</p>
            <p className="text-[9px] text-neutral-600">Drag or use Move to reorganize</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close canvas tree"
            onClick={() => useCanvasTreeStore.getState().setOpen(false)}
            className="gp-touch-target flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-800 hover:text-white"
          >
            <X size={13} />
          </button>
        </header>
        <div
          role="tree"
          aria-label={`${workspace.name} canvas and card outline`}
          className="h-[calc(100%-44px)] overflow-y-auto p-2"
        >
          {renderBranch(canvases[workspace.rootCanvasId]!, 0)}
        </div>
      </aside>
      {moving && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Move ${moving.name}`}
          className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
        >
          <button
            type="button"
            aria-label="Cancel moving canvas"
            className="absolute inset-0 bg-black/65"
            onClick={() => setMovingCanvas(null)}
          />
          <div className="gp-dialog gp-panel relative z-10 max-h-[70dvh] w-full max-w-sm overflow-hidden rounded-t-3xl p-2 shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between px-2 py-2">
              <div>
                <p className="text-sm font-semibold text-neutral-100">Move “{moving.name}”</p>
                <p className="text-[11px] text-neutral-500">Choose its new parent canvas.</p>
              </div>
              <button type="button" aria-label="Cancel moving canvas" onClick={() => setMovingCanvas(null)} className="gp-touch-target flex h-9 w-9 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-800 hover:text-white"><X size={14} /></button>
            </div>
            <div className="max-h-[55dvh] overflow-y-auto pb-[var(--gp-safe-bottom)]">
              {moveTargets.length === 0 && (
                <p className="px-3 py-8 text-center text-xs text-neutral-500">No other legal parent canvas.</p>
              )}
              {moveTargets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => {
                    useWidgetStore.getState().reparentCanvas(moving.id, target.id)
                    setMovingCanvas(null)
                  }}
                  className="gp-touch-target flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white"
                >
                  <File size={13} className="text-violet-300" aria-hidden />
                  <span className="truncate">{target.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
