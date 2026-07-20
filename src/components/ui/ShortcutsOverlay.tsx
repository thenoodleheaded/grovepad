import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Keyboard, X } from 'lucide-react'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useCanvasStore } from '../../store/useCanvasStore'
import { frameCanvas } from '../../utils/cameraFraming'

const ACTIONABLE = new Set(['Frame board', 'Zoom in / out', 'Reset zoom to 100%', 'Quick add — one card per line', 'Undo', 'Redo', 'Duplicate selection', 'Command palette — searches every canvas'])

function runShortcut(label: string) {
  const widgets = useWidgetStore.getState()
  const canvas = useCanvasStore.getState()
  if (label === 'Frame board') frameCanvas('board', 150)
  else if (label === 'Zoom in / out') canvas.zoomToAnimated(canvas.zoom * 1.25, { x: canvas.viewportSize.width / 2, y: canvas.viewportSize.height / 2 })
  else if (label === 'Reset zoom to 100%') canvas.zoomToAnimated(1, { x: canvas.viewportSize.width / 2, y: canvas.viewportSize.height / 2 })
  else if (label === 'Quick add — one card per line') widgets.setQuickAddOpen(true)
  else if (label === 'Undo') widgets.undo()
  else if (label === 'Redo') widgets.redo()
  else if (label === 'Duplicate selection') widgets.duplicateWidgets([...widgets.selectedIds])
  else if (label === 'Command palette — searches every canvas') widgets.setPaletteOpen(true)
  widgets.setShortcutsOpen(false)
}

interface ShortcutRow {
  keys: string[]
  label: string
}

interface ShortcutSection {
  title: string
  rows: ShortcutRow[]
}

const SECTIONS: ShortcutSection[] = [
  {
    title: 'Touch & trackpad',
    rows: [
      { keys: ['1 finger'], label: 'Pan in Navigate mode' },
      { keys: ['2 fingers'], label: 'Pan from any tool' },
      { keys: ['Pinch'], label: 'Zoom around your fingers' },
      { keys: ['Tap'], label: 'Select a card or clear selection' },
      { keys: ['Select + Drag'], label: 'Move a selected card' },
      { keys: ['Focus + Pencil'], label: 'Pressure-sensitive Sketchpad ink' },
    ],
  },
  {
    title: 'Canvas',
    rows: [
      { keys: ['Scroll'], label: 'Pan the canvas' },
      { keys: ['⌘ Scroll', 'Pinch'], label: 'Zoom at cursor' },
      { keys: ['Space + Drag', 'Middle Drag'], label: 'Pan (grab)' },
      { keys: ['H'], label: 'Navigate tool' },
      { keys: ['V'], label: 'Select tool' },
      { keys: ['F'], label: 'Frame board' },
      { keys: ['+', '−'], label: 'Zoom in / out' },
      { keys: ['0'], label: 'Reset zoom to 100%' },
    ],
  },
  {
    title: 'Create & edit',
    rows: [
      { keys: ['Double-click empty canvas'], label: 'Shape a tree at cursor' },
      { keys: ['N'], label: 'Quick add — one card per line' },
      { keys: ['Right-click'], label: 'Canvas / widget menu' },
      { keys: ['⌘ Drag card'], label: 'Draw a relation link' },
      { keys: ['⌘Z'], label: 'Undo' },
      { keys: ['⇧⌘Z'], label: 'Redo' },
      { keys: ['⌘D'], label: 'Duplicate selection' },
      { keys: ['⌘C'], label: 'Copy selection' },
      { keys: ['⌘V'], label: 'Paste copied widgets' },
      { keys: ['F2'], label: 'Rename selected widget' },
    ],
  },
  {
    title: 'Selection',
    rows: [
      { keys: ['Click'], label: 'Select widget' },
      { keys: ['⇧ Click'], label: 'Toggle in selection' },
      { keys: ['⇧ Drag'], label: 'Marquee select' },
      { keys: ['⌘A'], label: 'Select all' },
      { keys: ['⌘G'], label: 'Group selection' },
      { keys: ['Esc'], label: 'Clear selection' },
      { keys: ['⌫'], label: 'Delete selection' },
      { keys: ['Arrows', '⇧ Arrows'], label: 'Nudge (fine / coarse)' },
    ],
  },
  {
    title: 'Find & navigate',
    rows: [
      { keys: ['⌘K'], label: 'Command palette — searches every canvas' },
      { keys: ['Double-click canvas card'], label: 'Enter a canvas' },
      { keys: ['Breadcrumb click'], label: 'Jump back up the canvas path' },
      { keys: ['?'], label: 'This shortcut list' },
    ],
  },
]

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-neutral-700/80 bg-neutral-800/80 px-1.5 py-0.5  text-[10px] text-neutral-300 whitespace-nowrap">
      {children}
    </kbd>
  )
}

/** Full keyboard/gesture reference, toggled with `?` or from the toolbar. */
export function ShortcutsOverlay() {
  const open = useWidgetStore((state) => state.shortcutsOpen)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useOverlayLifecycle(open)
  useFocusTrap(open, panelRef, closeRef)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        useWidgetStore.getState().setShortcutsOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [open])

  if (!open) return null

  const close = () => useWidgetStore.getState().setShortcutsOpen(false)

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Controls and keyboard shortcuts"
      className="gp-shortcuts-overlay fixed inset-0 z-[220] flex items-center justify-center p-6"
    >
      <div
        role="presentation"
        className="gp-scrim gp-fade absolute inset-0 bg-black/60"
        onClick={close}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="gp-shortcuts-panel gp-dialog gp-pop gp-panel relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Keyboard size={15} className="text-emerald-400" aria-hidden />
            <h2 className="text-sm font-semibold text-neutral-200">Controls & shortcuts</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close shortcuts"
            onClick={close}
            className="gp-touch-target flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            <X size={13} />
          </button>
        </div>

        <div className="gp-shortcuts-content grid max-h-[70vh] grid-cols-1 gap-x-8 gap-y-5 overflow-y-auto p-5 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="pb-2  text-[10px] uppercase tracking-wider text-neutral-600">
                {section.title}
              </h3>
              <ul className="space-y-1.5">
                {section.rows.map((row) => (
                  <li key={row.label}>
                  <button type="button" disabled={!ACTIONABLE.has(row.label)} onClick={() => runShortcut(row.label)} className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-0.5 text-left enabled:hover:bg-neutral-800 enabled:hover:text-white disabled:cursor-default">
                    <span className="text-xs text-neutral-400">{row.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {row.keys.map((key) => (
                        <Key key={key}>{key}</Key>
                      ))}
                    </span>
                  </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
