import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAdaptiveInputStore } from '../../store/useAdaptiveInputStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { isCanvasTabRowVisible } from '../../utils/adaptiveChrome'

/**
 * The open-canvas row. A tab is a pointer, not a document: the viewport still
 * renders exactly one canvas, and switching tabs runs the same navigation the
 * breadcrumbs and canvas tree use, so each canvas keeps its own camera.
 */
export function CanvasTabs() {
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const viewportClass = useAdaptiveInputStore((state) => state.capabilities.viewportClass)
  const { openTabs, activeTabId, canvases, activeWorkspaceId, workspaces } = useWidgetStore(
    useShallow((state) => ({
      openTabs: state.openTabs,
      activeTabId: state.activeTabId,
      canvases: state.canvases,
      activeWorkspaceId: state.activeWorkspaceId,
      workspaces: state.workspaces,
    })),
  )

  if (!isCanvasTabRowVisible(viewportClass, openTabs.length)) return null

  const rootCanvasId = workspaces[activeWorkspaceId]?.rootCanvasId

  return (
    <div
      data-canvas-ui
      className="gp-canvas-ui-scale gp-safe-canvas-top-left-row2 pointer-events-none absolute z-30 flex max-w-[calc(100vw-2rem)]"
    >
      <div
        role="tablist"
        aria-label="Open canvases"
        className="gp-toolbar gp-panel gp-canvas-tabs pointer-events-auto flex min-w-0 select-none items-center gap-1 rounded-2xl px-1.5 py-1 shadow-xl"
      >
        <div className="gp-canvas-tab-scroller flex min-w-0 items-center gap-1">
          {openTabs.map((tab) => {
            const name = canvases[tab.canvasId]?.name ?? 'Canvas'
            const selected = tab.id === activeTabId
            return (
              <div
                key={tab.id}
                role="tab"
                tabIndex={selected ? 0 : -1}
                aria-selected={selected}
                data-active={selected || undefined}
                data-dragging={tab.id === draggingTabId || undefined}
                title={name}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  // Firefox refuses to start a drag with an empty payload.
                  event.dataTransfer.setData('text/plain', tab.id)
                  setDraggingTabId(tab.id)
                }}
                onDragOver={(event) => {
                  if (!draggingTabId || draggingTabId === tab.id) return
                  event.preventDefault()
                  useWidgetStore.getState().reorderCanvasTab(draggingTabId, tab.id)
                }}
                onDragEnd={() => setDraggingTabId(null)}
                onClick={() => useWidgetStore.getState().activateCanvasTab(tab.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  useWidgetStore.getState().activateCanvasTab(tab.id)
                }}
                onAuxClick={(event) => {
                  // Middle-click closes, matching every other tabbed interface.
                  if (event.button !== 1) return
                  event.preventDefault()
                  useWidgetStore.getState().closeCanvasTab(tab.id)
                }}
                className="gp-canvas-tab flex h-8 min-w-0 max-w-[11rem] cursor-default items-center gap-1 rounded-xl pl-2.5 pr-1 text-xs font-medium"
              >
                <span className="truncate">{name}</span>
                <button
                  type="button"
                  aria-label={`Close ${name} tab`}
                  onClick={(event) => {
                    event.stopPropagation()
                    useWidgetStore.getState().closeCanvasTab(tab.id)
                  }}
                  className="gp-canvas-tab-close grid h-5 w-5 flex-none place-items-center rounded-md"
                >
                  <X size={11} aria-hidden />
                </button>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          aria-label="Open a new tab on this workspace's origin canvas"
          title="New tab"
          disabled={!rootCanvasId}
          onClick={() => {
            if (rootCanvasId) useWidgetStore.getState().openCanvasTab(rootCanvasId)
          }}
          className="gp-canvas-frosted-control grid h-7 w-7 flex-none place-items-center rounded-lg border-0 text-neutral-400 transition-[background-color,color,transform,scale] hover:text-white active:scale-[0.94] disabled:opacity-35"
        >
          <Plus size={13} aria-hidden />
        </button>
      </div>
    </div>
  )
}
