import { lazy, Suspense, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore, type CanvasState } from '../../store/useCanvasStore'
import { useAiDebugStore } from '../../store/useAiDebugStore'
import { isOverlayOpen } from '../../store/useOverlayStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useToastStore } from '../../store/useToastStore'
import { useCanvasEvents } from '../../hooks/useCanvasEvents'
import { GRID_SIZE, screenToWorld } from '../../types/spatial'
import type { Widget } from '../../types/spatial'
import { boundsForWidgets } from '../../utils/widgetBounds'
import { stagePendingImport } from '../../utils/pendingImport'
import { writeMediaBlob } from '../../utils/boardDatabase'
import { startAppRuntime } from '../../runtime/appRuntime'
import { GhostTreeShaper } from './GhostTreeShaper'
import { QuickAddPreviewLayer } from './QuickAddPreviewLayer'
import { GridLayer } from './GridLayer'
import { PerformanceMonitor } from './PerformanceMonitor'
import { RelationLines } from './RelationLines'
import { DependencyLines } from './DependencyLines'
import { WireLayer } from './WireLayer'
import { AutomationRuntime } from './AutomationRuntime'
import { useCircuitStore } from '../../store/useCircuitStore'
import { useFocusStore } from '../../store/useFocusStore'
import { GroupLayer } from '../widgets/GroupLayer'
import { WidgetLayer } from '../widgets/WidgetLayer'
import { CanvasContextMenu } from '../ui/CanvasContextMenu'
import { CanvasToolbar } from '../ui/CanvasToolbar'
import { SelectionActionBar } from '../ui/SelectionActionBar'
import { ShaperHUD } from '../ui/ShaperHUD'
import { TargetingBanner } from '../ui/TargetingBanner'
import { WidgetContextMenu } from '../ui/WidgetContextMenu'
import { ZoomControls } from '../ui/ZoomControls'
import { ToastContainer } from '../ui/ToastContainer'
import { EmptyCanvasState } from '../ui/EmptyCanvasState'
import { CloudConflictDialog } from '../ui/CloudConflictDialog'
import { CanvasNavigator } from '../ui/CanvasNavigator'
import { CanvasAmbient } from './CanvasAmbient'
import { GuestBackupNudge } from '../ui/GuestBackupNudge'
import { DeployUpdateBanner } from '../ui/DeployUpdateBanner'
import { CanvasTreeDrawer } from '../ui/CanvasTreeDrawer'
import { TimerTitleRuntime } from './TimerTitleRuntime'
import { WidgetDeletionDialog } from '../ui/WidgetDeletionDialog'
import { requestWidgetDeletion } from '../../store/useWidgetDeletionDialogStore'
import { frameCanvas } from '../../utils/cameraFraming'

const AddWidgetModal = lazy(() =>
  import('../ui/AddWidgetModal').then((module) => ({ default: module.AddWidgetModal })),
)
const CommandPalette = lazy(() =>
  import('../ui/CommandPalette').then((module) => ({ default: module.CommandPalette })),
)
const ImportDocumentModal = lazy(() =>
  import('../ui/ImportDocumentModal').then((module) => ({ default: module.ImportDocumentModal })),
)
const QuickAddSheet = lazy(() =>
  import('../ui/QuickAddSheet').then((module) => ({ default: module.QuickAddSheet })),
)
const ShortcutsOverlay = lazy(() =>
  import('../ui/ShortcutsOverlay').then((module) => ({ default: module.ShortcutsOverlay })),
)
const AI_DEBUG_ENABLED = import.meta.env.DEV
const AiDebugPanel = AI_DEBUG_ENABLED
  ? lazy(() =>
      import('./AiDebugPanel').then((module) => ({ default: module.AiDebugPanel })),
    )
  : null

if (import.meta.env.DEV) {
  Object.assign(window, { __grovepad: { useWidgetStore, useCanvasStore, useAiDebugStore, useCircuitStore } })
}

/** In-memory clipboard — persists across interactions but not page reloads. */
let clipboardWidgets: Widget[] = []

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

function zoomFromKeyboard(factor: number): void {
  const canvas = useCanvasStore.getState()
  canvas.zoomToAnimated(canvas.zoom * factor, {
    x: canvas.viewportSize.width / 2,
    y: canvas.viewportSize.height / 2,
  })
}

// Far-zoom detail shedding: below ENTER, `data-canvas-lod="far"` goes on
// <body> and index.css drops each card's backdrop-blur chrome and shadows —
// they're sub-pixel at that scale but dominate compositing cost when hundreds
// of cards are visible. Hysteresis (ENTER < EXIT) so pinch jitter at the
// boundary can't flap the whole-tree restyle the toggle triggers.
const LOD_FAR_ENTER = 0.4
const LOD_FAR_EXIT = 0.45
const RELATION_OUTLINE_SCREEN_PX = 2

export function CanvasViewport() {
  useEffect(() => {
    // The canvas is a lazy route, so login never starts board persistence or
    // circuit listeners. StrictMode/HMR can tear this boundary down safely.
    const disposeRuntime = startAppRuntime()
    return disposeRuntime
  }, [])
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)

  useCanvasEvents(viewportRef)

  const {
    addWidgetPos,
    paletteOpen,
    importOpen,
    quickAddOpen,
    shortcutsOpen,
    workspaceTint,
  } = useWidgetStore(
    useShallow((state) => ({
      addWidgetPos: state.addWidgetAt,
      paletteOpen: state.paletteOpen,
      importOpen: state.importOpen,
      quickAddOpen: state.quickAddOpen,
      shortcutsOpen: state.shortcutsOpen,
      workspaceTint: state.workspaces[state.activeWorkspaceId]?.tint ?? '#84cc16',
    })),
  )
  const aiDebugOpen = useAiDebugStore((state) => AI_DEBUG_ENABLED && state.isOpen)

  useEffect(() => {
    const world = worldRef.current
    if (!world) return
    let appliedPanX = Number.NaN
    let appliedPanY = Number.NaN
    let appliedZoom = Number.NaN
    const apply = ({ pan, zoom }: CanvasState) => {
      if (pan.x === appliedPanX && pan.y === appliedPanY && zoom === appliedZoom) return
      world.style.transform = `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`
      appliedPanX = pan.x
      appliedPanY = pan.y
      if (zoom === appliedZoom) return
      appliedZoom = zoom
      // Relation paths use non-scaling SVG strokes. Counter-scale widget-like
      // CSS borders so their visible thickness remains exactly aligned at
      // every zoom level rather than matching only at 100%.
      world.style.setProperty('--gp-world-outline-width', `${RELATION_OUTLINE_SCREEN_PX / Math.max(zoom, 0.05)}px`)
      const far = document.body.getAttribute('data-canvas-lod') === 'far'
      if (!far && zoom < LOD_FAR_ENTER) {
        document.body.setAttribute('data-canvas-lod', 'far')
      } else if (far && zoom > LOD_FAR_EXIT) {
        document.body.removeAttribute('data-canvas-lod')
      }
    }
    apply(useCanvasStore.getState())
    const unsubscribe = useCanvasStore.subscribe(apply)
    return () => {
      unsubscribe()
      document.body.removeAttribute('data-canvas-lod')
    }
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const updateSize = () => {
      const rect = viewport.getBoundingClientRect()
      useCanvasStore.getState().setViewportSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  // Global keyboard layer: undo/redo, selection ops, nudge, frame, zoom.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      // AI diagnostics own a lightweight global shortcut here so their heavy
      // panel and local-model runtime can stay unloaded until first use.
      if (
        AI_DEBUG_ENABLED &&
        e.key.toLowerCase() === 'i' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        useAiDebugStore.getState().toggleOpen()
        return
      }
      // A modal, menu, or dropdown is open — its own listener owns Escape
      // and every other key; the canvas shortcut layer stays silent.
      if (isOverlayOpen()) return
      // Focus mode owns the keyboard too (its capture listener eats Escape).
      if (useFocusStore.getState().focusedWidgetId) return
      const state = useWidgetStore.getState()
      const mod = e.metaKey || e.ctrlKey

      if (e.altKey && state.selectedIds.size === 0 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        if (e.key === 'ArrowLeft') useCanvasStore.getState().goBack()
        else useCanvasStore.getState().goForward()
        return
      }

      if (mod && !e.altKey) {
        const key = e.key.toLowerCase()
        if (key === 'z') {
          e.preventDefault()
          if (e.shiftKey) state.redo()
          else state.undo()
        } else if (key === 'g' && !e.shiftKey) {
          e.preventDefault()
          const ids = [...state.selectedIds]
          if (ids.length >= 2) {
            state.createGroup(ids)
            state.clearSelection()
          }
        } else if (key === 'd') {
          e.preventDefault()
          if (state.selectedIds.size > 0) state.duplicateWidgets([...state.selectedIds])
        } else if (key === 'a') {
          e.preventDefault()
          state.selectWidgets(
            Object.values(state.widgets)
              .filter((w) => w.canvasId === state.activeCanvasId)
              .map((w) => w.id),
          )
        } else if (key === 'c') {
          e.preventDefault()
          const ids = [...state.selectedIds]
          if (ids.length > 0) {
            clipboardWidgets = ids
              .map((id) => state.widgets[id])
              .filter((w): w is Widget => Boolean(w))
            useToastStore.getState().addToast(
              clipboardWidgets.length === 1
                ? 'Copied 1 widget'
                : `Copied ${clipboardWidgets.length} widgets`,
            )
          }
        } else if (key === 'k') {
          e.preventDefault()
          state.setPaletteOpen(true)
        } else if (key === 'v' && clipboardWidgets.length > 0) {
          e.preventDefault()
          if (clipboardWidgets.length > 0) {
            state.pasteWidgets(clipboardWidgets)
          }
        }
        return
      }
      if (e.altKey && !e.key.startsWith('Arrow')) return

      switch (e.key) {
        case 'F2': {
          if (state.selectedIds.size === 1) {
            const [id] = [...state.selectedIds]
            if (id) {
              e.preventDefault()
              state.startRenaming(id)
            }
          }
          return
        }
        case 'Escape':
          if (state.dependencyLinkSource) {
            e.preventDefault()
            state.clearDependencyLink()
            return
          }
          if (state.selectedIds.size > 0) {
            e.preventDefault()
            state.clearSelection()
          }
          return
        case 'x':
        case 'X':
          if (e.shiftKey) return
          if (state.dependencyLinkSource) {
            e.preventDefault()
            state.clearDependencyLink()
          } else if (state.selectedIds.size === 1) {
            const [sourceId] = state.selectedIds
            if (sourceId) {
              e.preventDefault()
              state.startDependencyLink(sourceId)
            }
          }
          return
        case 'Delete':
        case 'Backspace':
          if (state.selectedIds.size > 0) {
            e.preventDefault()
            requestWidgetDeletion(state.selectedIds)
          }
          return
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (state.selectedIds.size === 0) return
          e.preventDefault()
          const step = e.altKey ? 1 : e.shiftKey ? GRID_SIZE * 4 : GRID_SIZE
          state.nudgeSelection(
            e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
            e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0,
          )
          return
        }
        case 'f':
        case 'F':
          if (e.shiftKey) return
          e.preventDefault()
          frameCanvas('board')
          return
        case '?':
          e.preventDefault()
          state.setShortcutsOpen(!state.shortcutsOpen)
          return
        case 'n':
        case 'N':
          if (e.shiftKey) return
          e.preventDefault()
          state.setQuickAddOpen(true)
          return
        case 'w':
        case 'W':
          if (e.shiftKey) return
          e.preventDefault()
          useCircuitStore.getState().toggleCircuitMode()
          return
        case '+':
        case '=':
          e.preventDefault()
          zoomFromKeyboard(1.25)
          return
        case '-':
        case '_':
          e.preventDefault()
          zoomFromKeyboard(1 / 1.25)
          return
        case '0': {
          e.preventDefault()
          const canvas = useCanvasStore.getState()
          const selected = [...state.selectedIds].map((id) => state.widgets[id]).filter((widget): widget is Widget => Boolean(widget))
          const rect = boundsForWidgets(selected)
          const focal = rect
            ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
            : screenToWorld({ x: canvas.viewportSize.width / 2, y: canvas.viewportSize.height / 2 }, { x: canvas.pan.x, y: canvas.pan.y, zoom: canvas.zoom })
          canvas.animateView({ x: canvas.viewportSize.width / 2 - focal.x, y: canvas.viewportSize.height / 2 - focal.y }, 1, 220)
          return
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // The canvas is a universal capture target: dropping or pasting text runs
  // through the same deterministic thought interpreter, URLs become link
  // cards, images become media cards, and documents enter the import flow.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const worldAt = (clientX: number, clientY: number) => {
      const rect = viewport.getBoundingClientRect()
      const { pan, zoom } = useCanvasStore.getState()
      return screenToWorld({ x: clientX - rect.left, y: clientY - rect.top }, { x: pan.x, y: pan.y, zoom })
    }

    const createFromText = async (text: string, position: { x: number; y: number }) => {
      const value = text.trim()
      if (!value) return
      const state = useWidgetStore.getState()
      try {
        const url = new URL(value)
        if (/\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|\?)/i.test(url.pathname)) {
          const id = state.createWidget('Image', position, 'media')
          state.updateWidgetData(id, { url: value, caption: '' })
        } else {
          const id = state.createWidget(url.hostname.replace(/^www\./, ''), position, 'links')
          state.updateWidgetData(id, { items: [{ id: crypto.randomUUID(), label: value, url: value }] })
        }
      } catch {
        const { interpretThought } = await import('../../utils/thoughtInterpreter')
        state.commitThoughtPlan(interpretThought(value), position)
      }
    }

    const readImage = async (file: File, position: { x: number; y: number }) => {
      let bitmap: ImageBitmap
      try { bitmap = await createImageBitmap(file) } catch {
        useToastStore.getState().addToast(`Could not read ${file.name}`)
        return
      }
      const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84))
      if (!blob) return
      const state = useWidgetStore.getState()
      const id = state.createWidget(file.name.replace(/\.[^.]+$/, '') || 'Image', position, 'media')
      await writeMediaBlob(id, blob)
      state.updateWidgetData(id, { url: '', caption: '', altText: '', localBlobKey: id })
    }

    const handleFiles = (files: File[], position: { x: number; y: number }) => {
      const images = files.filter((file) => file.type.startsWith('image/'))
      const documents = files.filter((file) => !file.type.startsWith('image/'))
      images.forEach((file, index) => void readImage(file, { x: position.x + index * GRID_SIZE, y: position.y + index * GRID_SIZE }))
      if (documents.length > 0) {
        stagePendingImport(documents)
        useWidgetStore.getState().setImportOpen(true)
      }
    }

    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types.some((type) => type === 'Files' || type === 'text/plain' || type === 'text/uri-list')) {
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      }
    }
    const onDrop = (event: DragEvent) => {
      event.preventDefault()
      const position = worldAt(event.clientX, event.clientY)
      const files = [...(event.dataTransfer?.files ?? [])]
      if (files.length > 0) handleFiles(files, position)
      else void createFromText(event.dataTransfer?.getData('text/uri-list') || event.dataTransfer?.getData('text/plain') || '', position)
    }
    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target) || isOverlayOpen() || clipboardWidgets.length > 0) return
      const files = [...(event.clipboardData?.files ?? [])]
      const canvas = useCanvasStore.getState()
      const position = screenToWorld(
        { x: canvas.viewportSize.width / 2, y: canvas.viewportSize.height / 2 },
        { x: canvas.pan.x, y: canvas.pan.y, zoom: canvas.zoom },
      )
      if (files.length > 0) {
        event.preventDefault()
        handleFiles(files, position)
        return
      }
      const text = event.clipboardData?.getData('text/plain') ?? ''
      if (text.trim()) {
        event.preventDefault()
        void createFromText(text, position)
      }
    }

    viewport.addEventListener('dragover', onDragOver)
    viewport.addEventListener('drop', onDrop)
    window.addEventListener('paste', onPaste)
    return () => {
      viewport.removeEventListener('dragover', onDragOver)
      viewport.removeEventListener('drop', onDrop)
      window.removeEventListener('paste', onPaste)
    }
  }, [])

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isOverlayOpen()) return
    if (e.target instanceof Element && e.target.closest('article, svg, [data-widget-id], [data-group-id]')) return
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const { pan, zoom } = useCanvasStore.getState()
    const world = screenToWorld(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      { x: pan.x, y: pan.y, zoom },
    )
    useWidgetStore.getState().openAddWidget(world)
  }

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Clear selection when clicking on empty canvas (not a widget, group, or UI)
    if (e.shiftKey || e.button !== 0) return
    if (
      e.target instanceof Element &&
      e.target.closest(
        'article, svg, [data-widget-id], [data-group-id], [data-canvas-ui], button, input, textarea, select, [contenteditable="true"], [role="dialog"]',
      )
    ) {
      return
    }
    // Empty canvas means the user is navigating, not composing. Explicitly
    // release the active editor so keystrokes cannot keep changing a hidden
    // text field after they click away.
    const focused = document.activeElement
    if (
      focused instanceof HTMLElement &&
      (focused.matches('input, textarea, select, [contenteditable="true"]') || focused.isContentEditable)
    ) {
      focused.blur()
    }
    useWidgetStore.getState().clearSelection()
  }

  return (
    <div
      ref={viewportRef}
      data-canvas-viewport
      tabIndex={0}
      className="gp-canvas-shell relative h-dvh w-screen touch-none select-none overflow-clip"
      style={{ backgroundColor: `color-mix(in srgb, var(--gp-canvas-tint-base) 97%, ${workspaceTint})` }}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handleCanvasPointerDown}
    >
      <CanvasAmbient />
      <div
        ref={worldRef}
        data-world-layer
        className="absolute left-0 top-0 z-10 origin-top-left will-change-transform"
      >
        <AutomationRuntime />
        <TimerTitleRuntime />
        <GridLayer />
        <RelationLines />
        <DependencyLines />
        <GroupLayer />
        <WidgetLayer />
        {/* Wires render above cards: they anchor to card-edge ports and their
            delivery pulses must stay visible while crossing the board. */}
        <WireLayer />
        <GhostTreeShaper />
        <QuickAddPreviewLayer />
      </div>
      <CanvasToolbar />
      <TargetingBanner />
      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      )}
      <ShaperHUD />
      <CanvasContextMenu viewportRef={viewportRef} />
      <WidgetContextMenu />
      <PerformanceMonitor />
      {AiDebugPanel && aiDebugOpen && (
        <Suspense fallback={null}>
          <AiDebugPanel />
        </Suspense>
      )}
      <ZoomControls />
      <CanvasNavigator />
      <CanvasTreeDrawer />
      <SelectionActionBar />
      {shortcutsOpen && (
        <Suspense fallback={null}>
          <ShortcutsOverlay />
        </Suspense>
      )}
      <ToastContainer />
      <WidgetDeletionDialog />
      <CloudConflictDialog />
      <DeployUpdateBanner />
      <GuestBackupNudge />
      <EmptyCanvasState />
      {importOpen && (
        <Suspense fallback={null}>
          <ImportDocumentModal />
        </Suspense>
      )}
      {quickAddOpen && (
        <Suspense fallback={null}>
          <QuickAddSheet />
        </Suspense>
      )}

      {addWidgetPos && (
        <Suspense fallback={null}>
          <AddWidgetModal
            worldPos={addWidgetPos}
            onClose={() => useWidgetStore.getState().closeAddWidget()}
          />
        </Suspense>
      )}

    </div>
  )
}
