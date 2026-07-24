import { lazy, Suspense, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../../store/useCanvasStore'
import { cameraEngine } from '../../engine/camera/cameraEngine'
import { attachCanvasGestures } from '../../engine/camera/gestureEngine'
import { useAiDebugStore } from '../../store/useAiDebugStore'
import { useScaleDebugStore } from '../../store/useScaleDebugStore'
import { usePerfDebugStore } from '../../store/usePerfDebugStore'
import { useAuraTuningStore } from '../../store/useAuraTuningStore'
import { useUiTuningStore } from '../../store/useUiTuningStore'
import { useThemeStore } from '../../store/useThemeStore'
import { applyCanvasColors } from './auraTuning'
import { isOverlayOpen } from '../../store/useOverlayStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useWidgetRestStore } from '../../store/useWidgetRestStore'
import { useToastStore } from '../../store/useToastStore'
import { GRID_SIZE, screenToWorld } from '../../types/spatial'
import type { Widget } from '../../types/spatial'
import { isStrictCanvasSurface } from '../../utils/canvasEventTarget'
import { canvasPressMoved } from '../../utils/canvasGesturePolicy'
import { boundsForWidgets } from '../../utils/widgetBounds'
import { stagePendingImport } from '../../utils/pendingImport'
import { writeMediaBlob } from '../../utils/boardDatabase'
import { readGrovepadPackage } from '../../utils/grovepadPackage'
import { importBoardFileOntoCanvas } from '../../utils/boardCanvasImport'
import { startAppRuntime } from '../../runtime/appRuntime'
import { GhostTreeShaper } from './GhostTreeShaper'
import { QuickAddPreviewLayer } from './QuickAddPreviewLayer'
import { McpPreviewLayer } from './McpPreviewLayer'
import { useMcpConnectorStore } from '../../store/useMcpConnectorStore'
import { CanvasAuraLayer } from './CanvasAuraLayer'
import { GridLayer } from './GridLayer'
import { RelationLines } from './RelationLines'
import { DependencyLines } from './DependencyLines'
import { WireLayer } from './WireLayer'
import { AutomationRuntime } from './AutomationRuntime'
import { useCircuitStore } from '../../store/useCircuitStore'
import { GlueSeamLayer } from '../widgets/GlueSeamLayer'
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
import { GuestBackupNudge } from '../ui/GuestBackupNudge'
import { DeployUpdateBanner } from '../ui/DeployUpdateBanner'
import { CanvasTreeDrawer } from '../ui/CanvasTreeDrawer'
import { TimerTitleRuntime } from './TimerTitleRuntime'
import { WidgetDeletionDialog } from '../ui/WidgetDeletionDialog'
import { requestWidgetDeletion } from '../../store/useWidgetDeletionDialogStore'
import { frameCanvas } from '../../utils/cameraFraming'
import { SettingsPanel } from '../ui/SettingsPanel'
import { useAdaptiveInputStore } from '../../store/useAdaptiveInputStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { canEditCollaborativeCanvas, useCollaborationStore } from '../../store/useCollaborationStore'

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
const CollaborationChrome = lazy(() =>
  import('../collaboration/CollaborationOverlays').then((module) => ({ default: module.CollaborationChrome })),
)
const CollaborationWorldOverlay = lazy(() =>
  import('../collaboration/CollaborationOverlays').then((module) => ({ default: module.CollaborationWorldOverlay })),
)
const RemoteCursorLayer = lazy(() =>
  import('../collaboration/CollaborationOverlays').then((module) => ({ default: module.RemoteCursorLayer })),
)
const AI_DEBUG_ENABLED = import.meta.env.DEV
const AiDebugPanel = AI_DEBUG_ENABLED
  ? lazy(() =>
      import('./AiDebugPanel').then((module) => ({ default: module.AiDebugPanel })),
    )
  : null
const SCALE_DEBUG_ENABLED = import.meta.env.DEV
const ScaleDebugPanel = SCALE_DEBUG_ENABLED
  ? lazy(() =>
      import('./ScaleDebugPanel').then((module) => ({ default: module.ScaleDebugPanel })),
    )
  : null
const AURA_TUNING_ENABLED = import.meta.env.DEV
const AuraTuningPanel = AURA_TUNING_ENABLED
  ? lazy(() =>
      import('./AuraTuningPanel').then((module) => ({ default: module.AuraTuningPanel })),
    )
  : null
const PERF_DEBUG_ENABLED = import.meta.env.DEV
const PerfDebugPanel = PERF_DEBUG_ENABLED
  ? lazy(() =>
      import('./PerfDebugPanel').then((module) => ({ default: module.PerfDebugPanel })),
    )
  : null
// The owner-facing appearance tuner (G). Available in the shipped app, not just
// dev, and lazily loaded so it costs nothing until first opened.
const UiTuningPanel = lazy(() =>
  import('../ui/UiTuningPanel').then((module) => ({ default: module.UiTuningPanel })),
)

if (import.meta.env.DEV) {
  Object.assign(window, { __grovepad: { useWidgetStore, useCanvasStore, useAiDebugStore, useCircuitStore, useScaleDebugStore, usePerfDebugStore, useWidgetRestStore, useAuraTuningStore, useMcpConnectorStore } })
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

export function CanvasViewport() {
  const collaborationRole = useCollaborationStore((state) => state.role)
  const followingCollaborator = useCollaborationStore((state) => state.followingClientId !== null)
  const activeCanvas = useWidgetStore((state) => state.canvases[state.activeCanvasId])
  const canvasShared = activeCanvas?.shared === true
  const canvasGridIntensity = activeCanvas?.gridIntensity ?? 100
  const canvasLinksVisible = activeCanvas?.linksVisible ?? true
  useEffect(() => {
    // The canvas is a lazy route, so login never starts board persistence or
    // circuit listeners. StrictMode/HMR can tear this boundary down safely.
    const disposeRuntime = startAppRuntime()
    return disposeRuntime
  }, [])
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const canvasBackgroundPressRef = useRef<{
    pointerId: number
    start: { x: number; y: number }
    moved: boolean
  } | null>(null)

  // Camera core wiring: the engine writes this element's transform
  // imperatively — React never re-renders for camera motion.
  useEffect(() => {
    cameraEngine.registerWorld(worldRef.current)
    const viewport = viewportRef.current
    const detachGestures = viewport ? attachCanvasGestures(viewport) : undefined
    return () => {
      detachGestures?.()
      cameraEngine.registerWorld(null)
    }
  }, [])

  const {
    addWidgetPos,
    paletteOpen,
    importOpen,
    quickAddOpen,
    workspaceTint,
  } = useWidgetStore(
    useShallow((state) => ({
      addWidgetPos: state.addWidgetAt,
      paletteOpen: state.paletteOpen,
      importOpen: state.importOpen,
      quickAddOpen: state.quickAddOpen,
      workspaceTint: state.workspaces[state.activeWorkspaceId]?.tint ?? '#84cc16',
    })),
  )
  const aiDebugOpen = useAiDebugStore((state) => AI_DEBUG_ENABLED && state.isOpen)
  const scaleDebugOpen = useScaleDebugStore((state) => SCALE_DEBUG_ENABLED && state.isOpen)
  const perfDebugOpen = usePerfDebugStore((state) => PERF_DEBUG_ENABLED && state.isOpen)
  const auraTuningOpen = useAuraTuningStore((state) => AURA_TUNING_ENABLED && state.isOpen)
  const uiTuningOpen = useUiTuningStore((state) => state.isOpen)
  const auraCanvasColors = useAuraTuningStore((state) => state.doc.canvas)
  const auraTuningTheme = useThemeStore((state) => state.theme)
  // Tuned canvas colours are pushed onto the document as inline custom properties
  // and lifted again on teardown, so the stylesheet stays the production source.
  useEffect(() => {
    if (!AURA_TUNING_ENABLED) return
    return applyCanvasColors(auraTuningTheme, auraCanvasColors[auraTuningTheme])
  }, [auraTuningTheme, auraCanvasColors])
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
      // Same shortcut pattern for the whole-card scaling tracer: stays
      // unloaded and non-recording until the first toggle.
      if (
        SCALE_DEBUG_ENABLED &&
        e.key.toLowerCase() === 's' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        useScaleDebugStore.getState().toggleOpen()
        return
      }
      // Same shortcut pattern for the whole-board CPU/GPU/RAM readout.
      if (
        PERF_DEBUG_ENABLED &&
        e.key.toLowerCase() === 'p' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        usePerfDebugStore.getState().toggleOpen()
        return
      }
      // G opens the owner-facing appearance tuner (blur, shadows, motion…).
      // Bare key, no modifiers. The advanced ambient-glow tuner is reached
      // from a button inside this panel.
      if (
        e.key.toLowerCase() === 'g' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        useUiTuningStore.getState().toggleOpen()
        return
      }
      // A modal, menu, or dropdown is open — its own listener owns Escape
      // and every other key; the canvas shortcut layer stays silent.
      if (isOverlayOpen()) return
      const state = useWidgetStore.getState()
      const mod = e.metaKey || e.ctrlKey
      const cameraLockedByFollow = useCollaborationStore.getState().followingClientId !== null
      const liveCollaborationRole = useCollaborationStore.getState().role
      const boardReadOnly = liveCollaborationRole !== null && !canEditCollaborativeCanvas(liveCollaborationRole)

      if (e.altKey && state.selectedIds.size === 0 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        if (cameraLockedByFollow) return
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
        } else if (key === 'd') {
          e.preventDefault()
          if (boardReadOnly) return
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
          if (boardReadOnly) return
          if (clipboardWidgets.length > 0) {
            state.pasteWidgets(clipboardWidgets)
          }
        }
        return
      }
      if (e.altKey && !e.key.startsWith('Arrow')) return

      switch (e.key) {
        case 'F2': {
          if (boardReadOnly) return
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
          if (useCircuitStore.getState().wireDrag) {
            e.preventDefault()
            useCircuitStore.getState().endWireDrag()
            return
          }
          if (state.dependencyLinkSource) {
            e.preventDefault()
            state.clearDependencyLink()
            return
          }
          if (useWidgetRestStore.getState().expandedWidgetId) {
            e.preventDefault()
            useWidgetRestStore.getState().collapseWidget()
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
          if (boardReadOnly) return
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
          if (boardReadOnly) return
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
          if (boardReadOnly) return
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
          if (cameraLockedByFollow) return
          frameCanvas('board')
          return
        case '?':
          e.preventDefault()
          useSettingsStore.getState().setOpen(true, 'controls')
          return
        case 'n':
        case 'N':
          if (e.shiftKey) return
          e.preventDefault()
          if (boardReadOnly) return
          state.setQuickAddOpen(true)
          return
        case 'h':
        case 'H':
          if (e.shiftKey) return
          e.preventDefault()
          useCircuitStore.getState().setCircuitMode(false)
          useAdaptiveInputStore.getState().setInteractionMode('navigate')
          return
        case 'v':
        case 'V':
          if (e.shiftKey) return
          e.preventDefault()
          useCircuitStore.getState().setCircuitMode(false)
          useAdaptiveInputStore.getState().setInteractionMode('select')
          return
        case 'w':
        case 'W':
          if (e.shiftKey) return
          e.preventDefault()
          if (boardReadOnly) return
          {
            const next = !useCircuitStore.getState().circuitMode
            useCircuitStore.getState().setCircuitMode(next)
            useAdaptiveInputStore.getState().setInteractionMode(next ? 'connect' : 'navigate')
          }
          return
        case '+':
        case '=':
          e.preventDefault()
          if (cameraLockedByFollow) return
          zoomFromKeyboard(1.25)
          return
        case '-':
        case '_':
          e.preventDefault()
          if (cameraLockedByFollow) return
          zoomFromKeyboard(1 / 1.25)
          return
        case '0': {
          e.preventDefault()
          if (cameraLockedByFollow) return
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

    const importGrovepadFile = async (file: File, position: { x: number; y: number }) => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const { board, media } = await readGrovepadPackage(bytes)
        await importBoardFileOntoCanvas({ board, media, filename: file.name, position })
      } catch {
        useToastStore.getState().addToast(`Could not import ${file.name}`)
      }
    }

    const handleFiles = (files: File[], position: { x: number; y: number }) => {
      const packages = files.filter((file) => file.name.toLowerCase().endsWith('.grovepad'))
      const images = files.filter((file) => file.type.startsWith('image/'))
      const jsonFiles = files.filter((file) => file.name.toLowerCase().endsWith('.json'))
      const documents = files.filter(
        (file) => !file.type.startsWith('image/')
          && !file.name.toLowerCase().endsWith('.grovepad')
          && !file.name.toLowerCase().endsWith('.json'),
      )
      packages.forEach((file, index) => void importGrovepadFile(file, {
        x: position.x + index * GRID_SIZE,
        y: position.y + index * GRID_SIZE,
      }))
      images.forEach((file, index) => void readImage(file, { x: position.x + index * GRID_SIZE, y: position.y + index * GRID_SIZE }))
      if (jsonFiles.length > 0) {
        useToastStore.getState().addToast('JSON files are no longer supported; use a .grovepad package')
      }
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
      const role = useCollaborationStore.getState().role
      if (role !== null && !canEditCollaborativeCanvas(role)) return
      const position = worldAt(event.clientX, event.clientY)
      const files = [...(event.dataTransfer?.files ?? [])]
      if (files.length > 0) handleFiles(files, position)
      else void createFromText(event.dataTransfer?.getData('text/uri-list') || event.dataTransfer?.getData('text/plain') || '', position)
    }
    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target) || isOverlayOpen() || clipboardWidgets.length > 0) return
      const role = useCollaborationStore.getState().role
      if (role !== null && !canEditCollaborativeCanvas(role)) return
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

    const handleKeys = (e: KeyboardEvent) => {
      const focused = document.activeElement
      const isEditing =
        focused &&
        (focused.tagName === 'INPUT' ||
          focused.tagName === 'TEXTAREA' ||
          focused.tagName === 'SELECT' ||
          (focused instanceof HTMLElement && focused.isContentEditable))

      if (isEditing) {
        document.body.setAttribute('data-keys-modifier', 'false')
        return
      }

      const isModifier = e.shiftKey || e.metaKey || e.ctrlKey || e.altKey
      document.body.setAttribute('data-keys-modifier', isModifier ? 'true' : 'false')
    }

    const handleBlur = () => {
      document.body.setAttribute('data-keys-modifier', 'false')
    }

    viewport.addEventListener('dragover', onDragOver)
    viewport.addEventListener('drop', onDrop)
    window.addEventListener('paste', onPaste)
    window.addEventListener('keydown', handleKeys)
    window.addEventListener('keyup', handleKeys)
    window.addEventListener('blur', handleBlur)
    return () => {
      viewport.removeEventListener('dragover', onDragOver)
      viewport.removeEventListener('drop', onDrop)
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('keydown', handleKeys)
      window.removeEventListener('keyup', handleKeys)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isOverlayOpen()) return
    const role = useCollaborationStore.getState().role
    if (role !== null && !canEditCollaborativeCanvas(role)) return
    if (!isStrictCanvasSurface(e.target, e.currentTarget)) return
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const { pan, zoom } = useCanvasStore.getState()
    const world = screenToWorld(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      { x: pan.x, y: pan.y, zoom },
    )
    useWidgetStore.getState().startGhostShaper(world.x, world.y)
  }

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // A second pointer means pinch/navigation, never a background click.
    if (
      canvasBackgroundPressRef.current &&
      canvasBackgroundPressRef.current.pointerId !== e.pointerId
    ) {
      canvasBackgroundPressRef.current = null
      return
    }
    if (e.shiftKey || e.button !== 0) {
      canvasBackgroundPressRef.current = null
      return
    }
    if (
      e.target instanceof Element &&
      e.target.closest(
        'article, svg, [data-widget-id], [data-canvas-ui], button, input, textarea, select, [contenteditable="true"], [role="dialog"]',
      )
    ) {
      canvasBackgroundPressRef.current = null
      return
    }
    canvasBackgroundPressRef.current = {
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      moved: false,
    }
  }

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const press = canvasBackgroundPressRef.current
    if (!press || press.pointerId !== e.pointerId || press.moved) return
    press.moved = canvasPressMoved(press.start, { x: e.clientX, y: e.clientY })
  }

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const press = canvasBackgroundPressRef.current
    if (!press || press.pointerId !== e.pointerId) return
    canvasBackgroundPressRef.current = null
    if (press.moved) return

    // Only a completed, stationary background click dismisses the active
    // editor. A camera pan that began on the same surface preserves it.
    const focused = document.activeElement
    if (
      focused instanceof HTMLElement &&
      (focused.matches('input, textarea, select, [contenteditable="true"]') || focused.isContentEditable)
    ) {
      focused.blur()
    }
    // Any in-progress edit above has already committed via its own change
    // handlers; returning the expanded card to rest is purely visual.
    useWidgetRestStore.getState().collapseWidget()
    useWidgetStore.getState().clearSelection()
  }

  const handleCanvasPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (canvasBackgroundPressRef.current?.pointerId === e.pointerId) {
      canvasBackgroundPressRef.current = null
    }
  }

  return (
    <div
      ref={viewportRef}
      data-canvas-viewport
      data-collaboration-readonly={collaborationRole !== null && !canEditCollaborativeCanvas(collaborationRole)}
      data-collaboration-following={followingCollaborator}
      tabIndex={0}
      role="application"
      aria-roledescription="Canvas board"
      aria-label="Board canvas. Press question mark for keyboard shortcuts, or open the canvas tree to browse widgets."
      className="gp-canvas-shell relative h-dvh w-screen touch-none select-none overflow-clip"
      style={{ backgroundColor: `color-mix(in srgb, var(--gp-canvas-tint-base) 97%, ${workspaceTint})` }}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onPointerCancel={handleCanvasPointerCancel}
    >
      <CanvasAuraLayer />
      <div
        ref={worldRef}
        data-world-layer
        className="absolute left-0 top-0 z-10 origin-top-left will-change-transform"
      >
        <AutomationRuntime />
        <TimerTitleRuntime />
        <GridLayer canvasIntensity={canvasGridIntensity} />
        {canvasLinksVisible && <RelationLines />}
        {canvasLinksVisible && <DependencyLines />}
        <GlueSeamLayer />
        <WidgetLayer />
        {/* Wires render above cards: they anchor to card-edge ports and their
            delivery pulses must stay visible while crossing the board. */}
        {canvasLinksVisible && <WireLayer />}
        <GhostTreeShaper />
        <QuickAddPreviewLayer />
        <McpPreviewLayer />
        {canvasShared && <Suspense fallback={null}><CollaborationWorldOverlay /></Suspense>}
      </div>
      {canvasShared && <Suspense fallback={null}><RemoteCursorLayer /></Suspense>}
      {canvasShared && <Suspense fallback={null}><CollaborationChrome /></Suspense>}
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
      {AiDebugPanel && aiDebugOpen && (
        <Suspense fallback={null}>
          <AiDebugPanel />
        </Suspense>
      )}
      {ScaleDebugPanel && scaleDebugOpen && (
        <Suspense fallback={null}>
          <ScaleDebugPanel />
        </Suspense>
      )}
      {PerfDebugPanel && perfDebugOpen && (
        <Suspense fallback={null}>
          <PerfDebugPanel />
        </Suspense>
      )}
      {AuraTuningPanel && auraTuningOpen && (
        <Suspense fallback={null}>
          <AuraTuningPanel />
        </Suspense>
      )}
      {uiTuningOpen && (
        <Suspense fallback={null}>
          <UiTuningPanel />
        </Suspense>
      )}
      <ZoomControls />
      <CanvasNavigator />
      <CanvasTreeDrawer />
      <SelectionActionBar />
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

      <SettingsPanel />
    </div>
  )
}
