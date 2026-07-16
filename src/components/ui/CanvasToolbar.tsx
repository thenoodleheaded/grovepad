import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  ChevronsUpDown,
  CircuitBoard,
  Ellipsis,
  Keyboard,
  Moon,
  Maximize2,
  Network,
  PanelLeft,
  Pencil,
  Plus,
  Search,
  Settings,
  SquarePlus,
  Sun,
  Trash2,
  Wind,
  Zap,
} from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useCircuitStore } from '../../store/useCircuitStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { useThemeStore } from '../../store/useThemeStore'
import { getCanvasPath, useWidgetStore } from '../../store/useWidgetStore'
import { screenToWorld } from '../../types/spatial'
import { IconButton } from './IconButton'
import { AccountChip } from './AccountChip'
import { ConfirmDialog } from './ConfirmDialog'
import { belowAnchor, clampPopover } from '../../utils/popoverPosition'
import { useCanvasTreeStore } from '../../store/useCanvasTreeStore'

/** World point at the view center — spawn target for toolbar creation. */
function viewCenterWorld() {
  const { pan, zoom, viewportSize } = useCanvasStore.getState()
  return screenToWorld(
    { x: viewportSize.width / 2, y: viewportSize.height / 2 },
    { x: pan.x, y: pan.y, zoom },
  )
}

// ---------------------------------------------------------------------------
// Workspace dropdown — the single dropdown of the app.
// ---------------------------------------------------------------------------

function WorkspaceDropdown() {
  const workspaces = useWidgetStore((state) => state.workspaces)
  const canvases = useWidgetStore((state) => state.canvases)
  const widgets = useWidgetStore((state) => state.widgets)
  const activeWorkspaceId = useWidgetStore((state) => state.activeWorkspaceId)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [draggingWorkspace, setDraggingWorkspace] = useState<string | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState({ x: 0, y: 0 })

  useOverlayLifecycle(open)

  const active = workspaces[activeWorkspaceId]
  const list = Object.values(workspaces).sort(
    (a, b) => (a.sortIndex ?? a.createdAt) - (b.sortIndex ?? b.createdAt),
  )

  const openMenu = () => {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (rect) setAnchor(belowAnchor(rect, 256, Math.min(420, 74 + list.length * 40), 6))
    setCreating(false)
    setRenamingId(null)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onDoubleClick={() => { if (active) { setRenamingId(active.id); openMenu() } }}
        className="flex h-7 max-w-44 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-700/50"
      >
        <span className="truncate">{active?.name ?? 'Workspace'}</span>
        <ChevronsUpDown size={12} className="shrink-0 text-neutral-500" aria-hidden />
      </button>

      {open &&
        createPortal(
          <>
            <div
              role="presentation"
              className="fixed inset-0 z-[120]"
              onPointerDown={() => setOpen(false)}
            />
            <div
              role="menu"
              className="gp-menu gp-pop gp-panel fixed z-[130] max-h-[min(70vh,420px)] w-64 origin-top-left overflow-y-auto rounded-2xl p-1.5 shadow-2xl"
              style={{ left: anchor.x, top: anchor.y }}
            >
              <p className="px-3 pb-1 pt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                Workspaces
              </p>
              {list.map((ws) => {
                const isActive = ws.id === activeWorkspaceId
                const canvasIds = new Set(Object.values(canvases).filter((canvas) => canvas.workspaceId === ws.id).map((canvas) => canvas.id))
                const widgetCount = Object.values(widgets).filter((widget) => canvasIds.has(widget.canvasId)).length
                if (renamingId === ws.id) {
                  return (
                    <div key={ws.id} className="px-2 py-1">
                      <input
                        defaultValue={ws.name}
                        autoFocus
                        aria-label="Workspace name"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            useWidgetStore.getState().renameWorkspace(ws.id, e.currentTarget.value)
                            setRenamingId(null)
                          }
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        onBlur={(e) => {
                          useWidgetStore.getState().renameWorkspace(ws.id, e.currentTarget.value)
                          setRenamingId(null)
                        }}
                        className="w-full rounded-lg border border-emerald-500/40 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-100 outline-none"
                      />
                    </div>
                  )
                }
                return (
                  <div
                    key={ws.id}
                    draggable
                    onDragStart={() => setDraggingWorkspace(ws.id)}
                    onDragEnd={() => setDraggingWorkspace(null)}
                    onDragOver={(event) => { if (draggingWorkspace && draggingWorkspace !== ws.id) event.preventDefault() }}
                    onDrop={() => { if (draggingWorkspace) useWidgetStore.getState().reorderWorkspace(draggingWorkspace, ws.id); setDraggingWorkspace(null) }}
                    className="group/ws flex items-center gap-1 px-1.5"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        useWidgetStore.getState().switchWorkspace(ws.id)
                        setOpen(false)
                      }}
                      className={`flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-xs transition-colors ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : 'text-neutral-300 hover:bg-neutral-800'
                      }`}
                    >
                      <span className="w-3.5 shrink-0">
                        {isActive ? <Check size={12} aria-hidden /> : <span className="block h-2 w-2 rounded-full" style={{ background: ws.tint ?? '#64748b' }} />}
                      </span>
                      <span className="truncate">{ws.name}</span>
                      <span className="ml-auto shrink-0 font-mono text-[9px] text-neutral-600">{widgetCount}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Rename ${ws.name}`}
                      onClick={() => setRenamingId(ws.id)}
                      className="shrink-0 rounded-md p-1 text-neutral-600 opacity-100 transition-opacity hover:text-neutral-300 focus-visible:opacity-100 sm:opacity-0 sm:group-hover/ws:opacity-100"
                    >
                      <Pencil size={11} aria-hidden />
                    </button>
                    {list.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Delete ${ws.name}`}
                        onClick={() => {
                          setDeleteTarget({ id: ws.id, name: ws.name })
                          setOpen(false)
                        }}
                        className="shrink-0 rounded-md p-1 text-neutral-600 opacity-100 transition-opacity hover:text-red-400 focus-visible:opacity-100 sm:opacity-0 sm:group-hover/ws:opacity-100"
                      >
                        <Trash2 size={11} aria-hidden />
                      </button>
                    )}
                  </div>
                )
              })}

              <div className="mx-2 my-1.5 border-t gp-hairline" />

              {creating ? (
                <div className="px-2 pb-1">
                  <input
                    placeholder="Workspace name…"
                    autoFocus
                    aria-label="New workspace name"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                        useWidgetStore.getState().createWorkspace(e.currentTarget.value)
                        setOpen(false)
                      }
                      if (e.key === 'Escape') setCreating(false)
                    }}
                    className="w-full rounded-lg border border-emerald-500/40 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-100 outline-none placeholder:text-neutral-600"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setCreating(true)}
                  className="mx-1.5 flex h-8 w-[calc(100%-12px)] items-center gap-2 rounded-lg px-2 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
                >
                  <Plus size={12} aria-hidden />
                  New workspace
                </button>
              )}
            </div>
          </>,
          document.body,
        )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete “${deleteTarget?.name ?? 'workspace'}”?`}
        description="Every canvas, widget, connection, and group inside this workspace will be removed. You can immediately undo this from the confirmation toast."
        confirmLabel="Delete workspace"
        destructive
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) useWidgetStore.getState().deleteWorkspace(deleteTarget.id)
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Breadcrumbs — the canvas path inside the active workspace.
// ---------------------------------------------------------------------------

function CanvasBreadcrumbs() {
  const canvases = useWidgetStore((state) => state.canvases)
  const activeCanvasId = useWidgetStore((state) => state.activeCanvasId)
  const path = getCanvasPath(canvases, activeCanvasId)
  if (path.length <= 1 && path[0]?.name === 'Origin') {
    // Root only — show a subtle Origin marker.
    return <span className="px-1 text-xs text-neutral-500">Origin</span>
  }

  // Deep paths collapse the middle: Origin / … / Parent / Current
  const display =
    path.length > 4
      ? [path[0]!, null, path[path.length - 2]!, path[path.length - 1]!]
      : path

  return (
    <nav aria-label="Canvas path" className="flex min-w-0 items-center">
      {display.map((canvas, index) => {
        if (canvas === null) {
          return (
            <span key="ellipsis" className="flex items-center text-neutral-600">
              <span className="px-0.5 text-xs">…</span>
              <ChevronRight size={11} aria-hidden />
            </span>
          )
        }
        const isLast = index === display.length - 1
        return (
          <span key={canvas.id} className="flex min-w-0 items-center">
            <button
              type="button"
              disabled={isLast}
              onClick={() => useWidgetStore.getState().navigateToCanvas(canvas.id)}
              className={`max-w-32 truncate rounded-md px-1.5 py-0.5 text-xs transition-colors ${
                isLast
                  ? 'font-medium text-neutral-200'
                  : 'text-neutral-500 hover:bg-neutral-700/50 hover:text-neutral-200'
              }`}
            >
              {canvas.name}
            </button>
            {!isLast && <ChevronRight size={11} className="shrink-0 text-neutral-600" aria-hidden />}
          </span>
        )
      })}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function ToolbarOverflow() {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState({ x: 0, y: 0 })
  const theme = useThemeStore((state) => state.theme)

  useOverlayLifecycle(open)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const show = () => {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (rect) {
      setAnchor(clampPopover(rect.right - 208, rect.bottom + 8, 208, 292))
    }
    setOpen(true)
  }

  const action = (run: () => void) => {
    run()
    setOpen(false)
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label="More canvas actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-neutral-700/60 hover:text-white lg:hidden"
      >
        <Ellipsis size={16} aria-hidden />
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[120]" onPointerDown={() => setOpen(false)} />
            <div
              role="menu"
              className="gp-menu gp-pop gp-panel fixed z-[130] w-52 overflow-hidden rounded-2xl p-1.5 shadow-2xl"
              style={{ left: anchor.x, top: anchor.y }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => action(() => useCircuitStore.getState().toggleCircuitMode())}
                className="flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                <CircuitBoard size={13} className="text-sky-400" aria-hidden />
                Circuit mode
              </button>
              <div className="my-1 border-t gp-hairline" />
              <button
                type="button"
                role="menuitem"
                onClick={() => action(() => useWidgetStore.getState().untangleCanvas())}
                className="flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                <Wind size={13} className="text-sky-400" aria-hidden />
                Untangle layout
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => action(() => useWidgetStore.getState().autoScaleCanvas())}
                className="flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                <Maximize2 size={13} className="text-amber-400" aria-hidden />
                Auto-fit sizes
              </button>
              <div className="my-1 border-t gp-hairline" />
              <button
                type="button"
                role="menuitem"
                onClick={() => action(() => useThemeStore.getState().toggle())}
                className="flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                {theme === 'dark' ? <Sun size={13} aria-hidden /> : <Moon size={13} aria-hidden />}
                {theme === 'dark' ? 'Light theme' : 'Dark theme'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => action(() => useWidgetStore.getState().setShortcutsOpen(true))}
                className="flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                <Keyboard size={13} aria-hidden />
                Keyboard shortcuts
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  action(() => useWidgetStore.getState().openAddWidget(viewCenterWorld(), 'packs'))
                }
                className="flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                <Settings size={13} aria-hidden />
                Domain packs
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}

/** Floating top bar: identity + navigation on the left, actions on the right. */
export function CanvasToolbar() {
  const circuitMode = useCircuitStore((state) => state.circuitMode)
  const toggleCircuitMode = useCircuitStore((state) => state.toggleCircuitMode)
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggle)
  const canGoBack = useCanvasStore((state) => state.canGoBack)
  const canGoForward = useCanvasStore((state) => state.canGoForward)

  return (
    <div
      data-canvas-ui
      className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-2 sm:inset-x-4 sm:top-4 sm:gap-3"
    >
      {/* Left: account + identity + the one dropdown + breadcrumb trail */}
      <div className="gp-toolbar gp-panel pointer-events-auto flex h-11 min-w-0 max-w-[calc(100vw-8.5rem)] select-none items-center gap-1 rounded-2xl px-1.5 shadow-xl sm:max-w-[calc(100vw-13rem)] sm:px-2 lg:max-w-[56vw]">
        <AccountChip />
        <span className="hidden items-center gap-1.5 px-1.5 text-xs font-bold tracking-tight text-neutral-200 sm:inline-flex">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-emerald-400"
            style={{ boxShadow: '0 0 10px oklch(88% 0.31 136 / 0.85)' }}
          />
          grove
          <span className="-ml-1.5 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            pad
          </span>
        </span>
        <div className="hidden h-5 w-px bg-neutral-700/70 sm:block" aria-hidden />
        <WorkspaceDropdown />
        <div className="hidden h-5 w-px bg-neutral-700/70 lg:block" aria-hidden />
        <div className="hidden items-center lg:flex">
          <IconButton label="Previous view (Alt+Left)" disabled={!canGoBack} onClick={() => useCanvasStore.getState().goBack()}>
            <ArrowLeft size={12} />
          </IconButton>
          <IconButton label="Next view (Alt+Right)" disabled={!canGoForward} onClick={() => useCanvasStore.getState().goForward()}>
            <ArrowRight size={12} />
          </IconButton>
        </div>
        <div className="hidden min-w-0 lg:block">
          <CanvasBreadcrumbs />
        </div>
      </div>

      {/* Right: actions */}
      <div className="gp-toolbar gp-panel pointer-events-auto flex h-11 shrink-0 select-none items-center gap-0.5 rounded-2xl px-1 shadow-xl sm:gap-1 sm:px-1.5">
        <IconButton label="Open canvas tree" onClick={() => useCanvasTreeStore.getState().setOpen(true)}>
          <PanelLeft size={13} aria-hidden />
        </IconButton>
        <button
          type="button"
          onClick={() => useWidgetStore.getState().openAddWidget(viewCenterWorld())}
          title="Browse the widget library (or double-click the canvas)"
          className="flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-br from-emerald-500/25 to-emerald-500/10 px-2.5 text-xs font-semibold text-emerald-300 shadow-[inset_0_0_0_1px_oklch(88%_0.31_136_/_0.28),0_0_16px_oklch(88%_0.31_136_/_0.10)] transition-[background-color,color,transform,box-shadow,scale] hover:from-emerald-500/35 hover:to-emerald-500/15 hover:text-emerald-200 hover:shadow-[inset_0_0_0_1px_oklch(88%_0.31_136_/_0.45),0_0_22px_oklch(88%_0.31_136_/_0.22)] active:scale-[0.96]"
        >
          <SquarePlus size={13} aria-hidden />
          <span className="hidden sm:inline">Widget</span>
        </button>
        <button
          type="button"
          onClick={() => useWidgetStore.getState().setQuickAddOpen(true)}
          title="Capture and interpret a thought (N)"
          aria-label="Quick capture (N)"
          className="gp-toolbar-action flex h-9 items-center gap-1.5 rounded-xl px-2 text-xs font-medium text-neutral-400 transition-[background-color,color,transform,scale] hover:bg-neutral-700/60 hover:text-white active:scale-[0.96]"
        >
          <Zap size={13} aria-hidden />
          <span className="hidden xl:inline">Capture</span>
        </button>
        <button
          type="button"
          onClick={() => {
            const point = viewCenterWorld()
            useWidgetStore.getState().startGhostShaper(point.x, point.y)
          }}
          title="Shape a tree directly on the canvas"
          className="gp-toolbar-action hidden h-9 items-center gap-1.5 rounded-xl px-2 text-xs font-medium text-neutral-400 transition-[background-color,color,transform,scale] hover:bg-neutral-700/60 hover:text-white active:scale-[0.96] md:flex"
        >
          <Network size={13} aria-hidden />
          <span className="hidden xl:inline">Shape</span>
        </button>
        <div className="hidden h-5 w-px bg-neutral-700/70 lg:block" aria-hidden />
        <span className="hidden lg:inline-flex">
          <IconButton label="Circuit mode (W)" onClick={toggleCircuitMode}>
            <CircuitBoard size={14} className={circuitMode ? 'text-sky-400' : undefined} />
          </IconButton>
        </span>
        <IconButton
          label="Search (⌘K)"
          onClick={() => useWidgetStore.getState().setPaletteOpen(true)}
        >
          <Search size={14} />
        </IconButton>
        <div className="hidden h-5 w-px bg-neutral-700/70 lg:block" aria-hidden />
        <span className="hidden lg:inline-flex">
          <IconButton
            label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </IconButton>
          <IconButton
            label="Keyboard shortcuts (?)"
            onClick={() => useWidgetStore.getState().setShortcutsOpen(true)}
          >
            <Keyboard size={14} />
          </IconButton>
          <IconButton
            label="Domain packs"
            onClick={() => useWidgetStore.getState().openAddWidget(viewCenterWorld(), 'packs')}
          >
            <Settings size={14} />
          </IconButton>
        </span>
        <ToolbarOverflow />
      </div>
    </div>
  )
}
