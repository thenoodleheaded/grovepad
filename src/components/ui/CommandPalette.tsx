import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Layers, Search, SquarePlus, X, Zap } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useCanvasStore } from '../../store/useCanvasStore'
import { isOverlayOpen, useOverlayLifecycle } from '../../store/useOverlayStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import {
  MODULE_LABELS,
  MODULE_PACK_REQUIREMENTS,
  MODULE_TYPES,
  screenToWorld,
} from '../../types/spatial'
import type { ModuleType, SearchResult } from '../../types/spatial'
import { boundsForWidgets } from '../../utils/widgetBounds'
import { getCanvasPath } from '../../store/useWidgetStore'

// ---------------------------------------------------------------------------
// Static action registry
// ---------------------------------------------------------------------------

type ActionItem = {
  id: string
  title: string
  subtitle: string
  run: () => void
}

/** Create a widget at the world point under the viewport center. */
function spawnFromPalette(type: ModuleType): void {
  const canvas = useCanvasStore.getState()
  const world = screenToWorld(
    { x: canvas.viewportSize.width / 2, y: canvas.viewportSize.height / 2 },
    { x: canvas.pan.x, y: canvas.pan.y, zoom: canvas.zoom },
  )
  const store = useWidgetStore.getState()
  const id = store.createWidget(MODULE_LABELS[type], world, type)
  store.selectWidget(id, false)
  store.flashWidget(id)
  store.startRenaming(id)
  store.setPaletteOpen(false)
}

const CREATE_ACTION_PREFIX = 'action-create-'

const PALETTE_ACTIONS: ActionItem[] = [
  {
    id: 'action-undo',
    title: 'Undo',
    subtitle: 'Revert the last board change (⌘Z)',
    run: () => {
      useWidgetStore.getState().undo()
      useWidgetStore.getState().setPaletteOpen(false)
    },
  },
  {
    id: 'action-redo',
    title: 'Redo',
    subtitle: 'Reapply the last undone change (⇧⌘Z)',
    run: () => {
      useWidgetStore.getState().redo()
      useWidgetStore.getState().setPaletteOpen(false)
    },
  },
  {
    id: 'action-shortcuts',
    title: 'Keyboard Shortcuts',
    subtitle: 'Show every shortcut and gesture (?)',
    run: () => {
      useWidgetStore.getState().setPaletteOpen(false)
      useWidgetStore.getState().setShortcutsOpen(true)
    },
  },
  {
    id: 'action-fit-all',
    title: 'Fit Board to View',
    subtitle: 'Frame every widget on the current canvas (F)',
    run: () => {
      const state = useWidgetStore.getState()
      const rect = boundsForWidgets(Object.values(state.widgets).filter((widget) => widget.canvasId === state.activeCanvasId))
      if (rect) useCanvasStore.getState().fitRect(rect, 150)
      useWidgetStore.getState().setPaletteOpen(false)
    },
  },
  {
    id: 'action-untangle',
    title: 'Untangle Layout',
    subtitle: 'Spread overlapping nodes apart; groups move as a unit',
    run: () => {
      useWidgetStore.getState().untangleCanvas()
      useWidgetStore.getState().setPaletteOpen(false)
    },
  },
  {
    id: 'action-auto-scale',
    title: 'Auto-fit Widget Sizes',
    subtitle: 'Resize every widget to its content, then untangle',
    run: () => {
      useWidgetStore.getState().autoScaleCanvas()
      useWidgetStore.getState().setPaletteOpen(false)
    },
  },
  {
    id: 'action-critical-path',
    title: 'Toggle Critical Path',
    subtitle: 'Highlight the longest unresolved blocker chain',
    run: () => {
      useWidgetStore.getState().toggleCriticalPath()
      useWidgetStore.getState().setPaletteOpen(false)
    },
  },
  {
    id: 'action-domain-packs',
    title: 'Open Domain Packs',
    subtitle: 'Enable specialist widget libraries',
    run: () => {
      const canvas = useCanvasStore.getState()
      const center = {
        x: (canvas.viewportSize.width / 2 - canvas.pan.x) / canvas.zoom,
        y: (canvas.viewportSize.height / 2 - canvas.pan.y) / canvas.zoom,
      }
      useWidgetStore.getState().openAddWidget(center, 'packs')
      useWidgetStore.getState().setPaletteOpen(false)
    },
  },
  {
    id: 'action-zoom-in',
    title: 'Zoom In',
    subtitle: 'Scale the canvas viewport up by 25%',
    run: () => {
      const cs = useCanvasStore.getState()
      cs.zoomTo(cs.zoom * 1.25, { x: window.innerWidth / 2, y: window.innerHeight / 2 })
      useWidgetStore.getState().setPaletteOpen(false)
    },
  },
  {
    id: 'action-zoom-out',
    title: 'Zoom Out',
    subtitle: 'Scale the canvas viewport down by 25%',
    run: () => {
      const cs = useCanvasStore.getState()
      cs.zoomTo(cs.zoom * 0.8, { x: window.innerWidth / 2, y: window.innerHeight / 2 })
      useWidgetStore.getState().setPaletteOpen(false)
    },
  },
]

const ACTION_RUN_MAP = new Map<string, () => void>(
  PALETTE_ACTIONS.map((a) => [a.id, a.run]),
)

function actionToResult(action: ActionItem): SearchResult {
  return {
    id: action.id,
    type: 'action',
    title: action.title,
    subtitle: action.subtitle,
    position: { x: 0, y: 0 },
  }
}

// ---------------------------------------------------------------------------
// Fuzzy matching helper (local; does not subscribe to store)
// ---------------------------------------------------------------------------

function matchesQuery(query: string, text: string): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true
  const t = text.toLowerCase()
  if (t.includes(q)) return true
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

// ---------------------------------------------------------------------------
// Category tab type
// ---------------------------------------------------------------------------

type CategoryTab = 'all' | 'actions' | 'widgets'

const TABS: { id: CategoryTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'actions', label: 'Actions' },
  { id: 'widgets', label: 'Widgets' },
]

// ---------------------------------------------------------------------------
// Preview pane
// ---------------------------------------------------------------------------

function ResultPreview({ result }: { result: SearchResult | null }) {
  if (!result) {
    return (
      <div className="flex h-full items-center justify-center text-center">
        <p className="text-xs text-neutral-600">Select a result to preview</p>
      </div>
    )
  }

  const isAction = result.type === 'action'
  const isCreate = isAction && result.id.startsWith(CREATE_ACTION_PREFIX)
  const widget = !isAction ? useWidgetStore.getState().widgets[result.id] : undefined
  const widgetState = useWidgetStore.getState()
  const canvasPath = widget ? getCanvasPath(widgetState.canvases, widget.canvasId).map((canvas) => canvas.name).join(' › ') : ''
  const excerpt = widget ? JSON.stringify(widget.data).replace(/[{}"]|\[|\]/g, ' ').replace(/\s+/g, ' ').slice(0, 120) : ''

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded ${
            isCreate
              ? 'bg-sky-500/15 text-sky-400'
              : isAction
                ? 'bg-violet-500/15 text-violet-400'
                : 'bg-emerald-500/15 text-emerald-400'
          }`}
        >
          {isCreate ? <SquarePlus size={11} /> : isAction ? <Zap size={11} /> : <Layers size={11} />}
        </span>
        <div>
          <p className="text-xs font-semibold text-neutral-200">{result.title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">{result.subtitle}</p>
        </div>
      </div>

      <div className="space-y-1.5 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
        <Row
          label="Type"
          value={isCreate ? 'Create Widget' : isAction ? 'Canvas Action' : 'Widget'}
        />
        {!isAction && (
          <>
            <Row label="Canvas" value={canvasPath || 'Origin'} />
            <Row label="Content" value={excerpt || 'Empty'} />
          </>
        )}
      </div>

      {!isAction && (
        <div className="mt-auto flex items-center gap-1.5 rounded border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
          <ChevronRight size={11} className="text-emerald-500" />
          <span className="text-[11px] text-emerald-400">Press Enter to leap to this widget</span>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wider text-neutral-600">{label}</span>
      <span className={`text-[11px] text-neutral-300 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Always mounted; only renders the portal overlay when `paletteOpen` is true.
 * The global Cmd/Ctrl+K listener is registered on mount and never torn down
 * between open/close cycles.
 */
export function CommandPalette() {
  const open = useWidgetStore((state) => state.paletteOpen)
  const activePacks = useWidgetStore((state) => state.activePacks)

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryTab>('all')
  const [focusedIndex, setFocusedIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useOverlayLifecycle(open)
  useFocusTrap(open, panelRef, inputRef)

  // Global toggle shortcut — always active
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        const current = useWidgetStore.getState().paletteOpen
        if (!current && isOverlayOpen()) return
        useWidgetStore.getState().setPaletteOpen(!current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Reset + focus on open
  useEffect(() => {
    if (!open) return
    setQuery('')
    setCategory('all')
    setFocusedIndex(0)
    const raf = requestAnimationFrame(() => { inputRef.current?.focus() })
    return () => cancelAnimationFrame(raf)
  }, [open])

  // Non-reactive search: fires imperatively via getState(), not a subscription
  const results = useMemo<SearchResult[]>(() => {
    const trimmed = query.trim()

    const createResults: SearchResult[] = MODULE_TYPES.filter((type) => {
      const req = MODULE_PACK_REQUIREMENTS[type]
      return !req || activePacks.includes(req)
    })
      .map((type) => ({
        id: `${CREATE_ACTION_PREFIX}${type}`,
        type: 'action' as const,
        title: `New ${MODULE_LABELS[type]}`,
        subtitle: 'Create widget at the view center',
        position: { x: 0, y: 0 },
      }))
      .filter((r) => matchesQuery(trimmed, r.title))

    const actionResults = PALETTE_ACTIONS
      .filter((a) => matchesQuery(trimmed, a.title) || matchesQuery(trimmed, a.subtitle))
      .map(actionToResult)
      .concat(createResults)

    let widgetResults = trimmed
      ? useWidgetStore.getState().searchWidgets(trimmed)
      : []

    if (!trimmed) {
      const state = useWidgetStore.getState()
      widgetResults = Object.values(state.widgets)
        .filter((widget) => state.canvases[widget.canvasId]?.workspaceId === state.activeWorkspaceId)
        .sort((a, b) => (b.metadata.zIndex ?? 0) - (a.metadata.zIndex ?? 0))
        .slice(0, 6)
        .map((widget) => ({ id: widget.id, type: 'widget' as const, title: widget.title, subtitle: `Recent · ${MODULE_LABELS[widget.type]}`, canvasId: widget.canvasId, position: { x: widget.position.x + widget.size.width / 2, y: widget.position.y + widget.size.height / 2 } }))
    }

    if (/^[\d\s+\-*/().%]+$/.test(trimmed) && /\d/.test(trimmed)) {
      try {
        const value = Function(`"use strict"; return (${trimmed.replace(/%/g, '/100')})`)() as unknown
        if (typeof value === 'number' && Number.isFinite(value)) actionResults.unshift({ id: `math:${value}`, type: 'action', title: `= ${value}`, subtitle: 'Copy quick answer', position: { x: 0, y: 0 } })
      } catch { /* incomplete expression */ }
    }

    if (trimmed && actionResults.length === 0 && widgetResults.length === 0) {
      actionResults.push({ id: `note:${trimmed}`, type: 'action', title: `Create “${trimmed}”`, subtitle: 'New notes widget', position: { x: 0, y: 0 } })
    }

    if (category === 'actions') return trimmed ? actionResults : actionResults.slice(0, 4)
    if (category === 'widgets') return widgetResults
    return [...(trimmed ? actionResults : actionResults.slice(0, 4)), ...widgetResults]
  }, [query, category, activePacks])

  // Reset focus when results change
  useEffect(() => { setFocusedIndex(0) }, [results])

  // Scroll focused item into view
  useEffect(() => {
    const item = listRef.current?.children.item(focusedIndex) as HTMLElement | null
    item?.scrollIntoView({ block: 'nearest' })
  }, [focusedIndex])

  const focusedResult = results[focusedIndex] ?? null

  const leapToWidget = useCallback((result: SearchResult) => {
    // Cross-canvas result: enter its canvas first, then glide to it there.
    if (result.canvasId && result.canvasId !== useWidgetStore.getState().activeCanvasId) {
      useWidgetStore.getState().navigateToCanvas(result.canvasId)
    }
    const canvas = useCanvasStore.getState()
    // Glide to the widget at a zoom where detail is legible, then pulse it.
    const targetZoom = Math.max(canvas.zoom, 0.85)
    canvas.animateView(
      {
        x: canvas.viewportSize.width / 2 - result.position.x * targetZoom,
        y: canvas.viewportSize.height / 2 - result.position.y * targetZoom,
      },
      targetZoom,
      380,
    )
    const widgetState = useWidgetStore.getState()
    widgetState.selectWidget(result.id, false)
    widgetState.flashWidget(result.id)
    widgetState.setPaletteOpen(false)
  }, [])

  const execute = useCallback(
    (result: SearchResult) => {
      if (result.type === 'action') {
        if (result.id.startsWith(CREATE_ACTION_PREFIX)) {
          spawnFromPalette(result.id.slice(CREATE_ACTION_PREFIX.length) as ModuleType)
        } else if (result.id.startsWith('math:')) {
          void navigator.clipboard.writeText(result.id.slice(5))
          useWidgetStore.getState().setPaletteOpen(false)
        } else if (result.id.startsWith('note:')) {
          const canvas = useCanvasStore.getState()
          const position = screenToWorld({ x: canvas.viewportSize.width / 2, y: canvas.viewportSize.height / 2 }, { x: canvas.pan.x, y: canvas.pan.y, zoom: canvas.zoom })
          const id = useWidgetStore.getState().createWidget(result.id.slice(5), position, 'notes')
          useWidgetStore.getState().selectWidget(id, false)
          useWidgetStore.getState().setPaletteOpen(false)
        } else {
          ACTION_RUN_MAP.get(result.id)?.()
        }
      } else {
        leapToWidget(result)
      }
    },
    [leapToWidget],
  )

  const onModalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return
    switch (e.key) {
      case 'Escape':
        useWidgetStore.getState().setPaletteOpen(false)
        break
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex((i) => Math.min(i + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (focusedResult) execute(focusedResult)
        break
    }
  }

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]"
      onKeyDown={onModalKeyDown}
    >
      {/* Backdrop */}
      <div
        role="presentation"
        className="gp-scrim gp-fade absolute inset-0 bg-black/60"
        onClick={() => useWidgetStore.getState().setPaletteOpen(false)}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="gp-dialog gp-pop gp-panel relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl shadow-2xl outline-none"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
          <Search size={15} className="shrink-0 text-neutral-500" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Search widgets or actions…"
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-600"
          />
          <button
            type="button"
            aria-label="Close palette"
            onClick={() => useWidgetStore.getState().setPaletteOpen(false)}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-800 hover:text-white"
          >
            <X size={13} />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1 border-b border-neutral-800 px-3 py-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategory(tab.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                category === tab.id
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <span className="ml-auto font-mono text-[10px] text-neutral-700">
            ↑↓ navigate · Enter to select
          </span>
        </div>

        {/* Split pane body */}
        <div className="flex" style={{ height: '340px' }}>
          {/* Left: results list */}
          <div className="flex w-2/5 flex-col border-r border-neutral-800">
            {results.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-xs text-neutral-600">No results</p>
              </div>
            ) : (
              <ul ref={listRef} className="flex-1 overflow-y-auto py-1" role="listbox">
                {results.map((result, i) => (
                  <li
                    key={result.id}
                    role="option"
                    aria-selected={i === focusedIndex}
                    onClick={() => { setFocusedIndex(i); execute(result) }}
                    onMouseEnter={() => setFocusedIndex(i)}
                    className={`flex cursor-pointer items-start gap-2.5 px-3 py-2 transition-colors ${
                      i === focusedIndex
                        ? 'bg-neutral-800 text-neutral-100'
                        : 'text-neutral-400 hover:bg-neutral-800/50'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                        result.type !== 'action'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : result.id.startsWith(CREATE_ACTION_PREFIX)
                            ? 'bg-sky-500/15 text-sky-400'
                            : 'bg-violet-500/15 text-violet-400'
                      }`}
                    >
                      {result.type !== 'action' ? (
                        <Layers size={9} />
                      ) : result.id.startsWith(CREATE_ACTION_PREFIX) ? (
                        <SquarePlus size={9} />
                      ) : (
                        <Zap size={9} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium leading-tight">{result.title}</p>
                      <p className="truncate text-[10px] text-neutral-600">{result.subtitle}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Right: preview */}
          <div className="w-3/5 overflow-y-auto">
            <ResultPreview result={focusedResult} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
