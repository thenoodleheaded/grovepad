import { useState } from 'react'
import { ChevronRight, File, Pencil, Trash2, X } from 'lucide-react'
import { useCanvasTreeStore } from '../../store/useCanvasTreeStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { requestWidgetDeletion } from '../../store/useWidgetDeletionDialogStore'
import type { CanvasMeta } from '../../types/spatial'

export function CanvasTreeDrawer() {
  const open = useCanvasTreeStore((state) => state.open)
  const workspaces = useWidgetStore((state) => state.workspaces)
  const canvases = useWidgetStore((state) => state.canvases)
  const widgets = useWidgetStore((state) => state.widgets)
  const activeWorkspaceId = useWidgetStore((state) => state.activeWorkspaceId)
  const activeCanvasId = useWidgetStore((state) => state.activeCanvasId)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
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
  const renderBranch = (canvas: CanvasMeta, depth: number): React.ReactNode => (
    <div key={canvas.id}>
      <div
        draggable={canvas.parentCanvasId !== null}
        onDragStart={() => setDragging(canvas.id)}
        onDragEnd={() => setDragging(null)}
        onDragOver={(event) => { if (dragging && dragging !== canvas.id) event.preventDefault() }}
        onDrop={() => { if (dragging) useWidgetStore.getState().reparentCanvas(dragging, canvas.id); setDragging(null) }}
        className={`group/tree flex h-8 items-center gap-1 rounded-lg pr-1 text-xs ${canvas.id === activeCanvasId ? 'bg-violet-400/12 text-violet-200' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
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
          <button type="button" onClick={() => useWidgetStore.getState().navigateToCanvas(canvas.id)} className="min-w-0 flex-1 truncate text-left">{canvas.name}</button>
        )}
        <span className=" text-[9px] text-neutral-600">{Object.values(widgets).filter((widget) => widget.canvasId === canvas.id).length}</span>
        <button type="button" aria-label={`Rename ${canvas.name}`} onClick={() => setRenaming(canvas.id)} className="pointer-events-none opacity-0 group-hover/tree:opacity-100 group-hover/tree:pointer-events-auto"><Pencil size={10} /></button>
        {canvas.parentCanvasId !== null && (
          <button
            type="button"
            aria-label={`Delete ${canvas.name}`}
            onClick={() => {
              const state = useWidgetStore.getState()
              const owner = Object.values(state.widgets).find((widget) => widget.type === 'canvas_node' && (widget.data as { canvasId?: string }).canvasId === canvas.id)
              if (owner) requestWidgetDeletion([owner.id])
            }}
            className="text-neutral-600 pointer-events-none opacity-0 hover:text-red-400 group-hover/tree:opacity-100 group-hover/tree:pointer-events-auto"
          ><Trash2 size={10} /></button>
        )}
      </div>
      {(children.get(canvas.id) ?? []).map((child) => renderBranch(child, depth + 1))}
    </div>
  )
  return (
    <aside data-canvas-ui aria-label="Canvas tree" className="gp-panel gp-pop fixed bottom-16 left-4 top-16 z-40 w-72 overflow-hidden rounded-2xl border gp-hairline shadow-2xl">
      <header className="flex h-11 items-center justify-between border-b gp-hairline px-3"><div><p className="text-xs font-semibold text-neutral-200">{workspace.name}</p><p className="text-[9px] text-neutral-600">Drag canvases to reorganize</p></div><button type="button" aria-label="Close canvas tree" onClick={() => useCanvasTreeStore.getState().setOpen(false)} className="text-neutral-500 hover:text-white"><X size={13} /></button></header>
      <div className="h-[calc(100%-44px)] overflow-y-auto p-2">{renderBranch(canvases[workspace.rootCanvasId]!, 0)}</div>
    </aside>
  )
}
