import type { ReactNode } from 'react'
import { Hand, MousePointer2, Redo2, Undo2 } from 'lucide-react'
import { useAdaptiveInputStore } from '../../store/useAdaptiveInputStore'
import { useCircuitStore } from '../../store/useCircuitStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { modeDockShowsHistory } from '../../utils/adaptiveChrome'

// Circuit mode is deliberately absent. It keeps exactly one toggle, in the
// top-right toolbar, which is already visible on a phone. The dock holds the
// two tools a finger cannot reach any other way: Navigate (Space-drag on a
// keyboard) and Select (Shift and marquee-drag).
const MODES = [
  { mode: 'navigate' as const, label: 'Navigate canvas', shortcut: 'H', icon: Hand },
  { mode: 'select' as const, label: 'Select widgets', shortcut: 'V', icon: MousePointer2 },
]

function DockButton({
  label,
  shortcut,
  pressed,
  disabled = false,
  className = '',
  onClick,
  children,
}: {
  label: string
  shortcut: string
  pressed?: boolean
  disabled?: boolean
  className?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-keyshortcuts={shortcut}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`${className} gp-touch-target flex h-9 w-9 items-center justify-center rounded-xl transition-[background-color,color,scale] active:scale-[0.94] disabled:pointer-events-none disabled:opacity-35 ${
        pressed
          ? 'bg-emerald-400/14 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(163,230,53,.24)]'
          : 'text-neutral-400 hover:bg-neutral-700/60 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * The thumb-reach tool dock for touch and Pencil. Visibility is owned by CSS
 * (`.gp-canvas-mode-dock` in 01-tokens-base.css: phone, tablet, or any touch
 * or Pencil session), so it never flashes in before hydration on a desktop.
 * Undo and Redo join it where ZoomControls has dropped its own pair.
 */
export function CanvasModeDock() {
  const interactionMode = useAdaptiveInputStore((state) => state.interactionMode)
  const viewportClass = useAdaptiveInputStore((state) => state.capabilities.viewportClass)
  const canUndo = useWidgetStore((state) => state.canUndo)
  const canRedo = useWidgetStore((state) => state.canRedo)
  const showHistory = modeDockShowsHistory(viewportClass)

  return (
    <div
      data-canvas-ui
      className="gp-canvas-ui-scale gp-canvas-mode-dock gp-toolbar gp-panel fixed left-1/2 z-30 -translate-x-1/2 items-center gap-1 rounded-2xl p-1 shadow-xl"
      role="toolbar"
      aria-label="Canvas tools"
    >
      {MODES.map(({ mode, label, shortcut, icon: Icon }) => (
        <DockButton
          key={mode}
          label={label}
          shortcut={shortcut}
          pressed={interactionMode === mode}
          onClick={() => {
            // Picking a tool leaves Circuit mode, exactly as H and V do.
            useCircuitStore.getState().setCircuitMode(false)
            useAdaptiveInputStore.getState().setInteractionMode(mode)
          }}
        >
          <Icon size={16} aria-hidden />
        </DockButton>
      ))}
      {showHistory && (
        <>
          <span className="mx-0.5 h-5 w-px bg-neutral-700/70" aria-hidden />
          <DockButton
            label="Undo"
            shortcut="Meta+Z"
            disabled={!canUndo}
            onClick={() => useWidgetStore.getState().undo()}
          >
            <Undo2 size={16} aria-hidden />
          </DockButton>
          <DockButton
            label="Redo"
            shortcut="Shift+Meta+Z"
            className="gp-mode-dock-redo"
            disabled={!canRedo}
            onClick={() => useWidgetStore.getState().redo()}
          >
            <Redo2 size={16} aria-hidden />
          </DockButton>
        </>
      )}
    </div>
  )
}
