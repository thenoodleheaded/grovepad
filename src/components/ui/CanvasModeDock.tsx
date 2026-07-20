import { CircuitBoard, Hand, MousePointer2 } from 'lucide-react'
import { useAdaptiveInputStore } from '../../store/useAdaptiveInputStore'
import { useCircuitStore } from '../../store/useCircuitStore'

const MODES = [
  { mode: 'navigate' as const, label: 'Navigate canvas', shortcut: 'H', icon: Hand },
  { mode: 'select' as const, label: 'Select widgets', shortcut: 'V', icon: MousePointer2 },
  { mode: 'connect' as const, label: 'Connect widgets', shortcut: 'W', icon: CircuitBoard },
]

/** Touch/Pencil equivalent of Space-drag and Shift-drag. Desktop keeps those
 * accelerators; hybrid devices reveal this dock whenever direct input is used. */
export function CanvasModeDock() {
  const interactionMode = useAdaptiveInputStore((state) => state.interactionMode)

  return (
    <div
      data-canvas-ui
      className="gp-canvas-mode-dock gp-toolbar gp-panel fixed left-1/2 z-30 -translate-x-1/2 items-center gap-1 rounded-2xl p-1 shadow-xl"
      role="toolbar"
      aria-label="Canvas interaction mode"
    >
      {MODES.map(({ mode, label, shortcut, icon: Icon }) => {
        const active = interactionMode === mode
        return (
          <button
            key={mode}
            type="button"
            aria-label={label}
            aria-pressed={active}
            aria-keyshortcuts={shortcut}
            title={`${label} (${shortcut})`}
            onClick={() => {
              useAdaptiveInputStore.getState().setInteractionMode(mode)
              useCircuitStore.getState().setCircuitMode(mode === 'connect')
            }}
            className={`gp-touch-target flex h-9 w-9 items-center justify-center rounded-xl transition-[background-color,color,scale] active:scale-[0.94] ${
              active
                ? 'bg-emerald-400/14 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(163,230,53,.24)]'
                : 'text-neutral-400 hover:bg-neutral-700/60 hover:text-white'
            }`}
          >
            <Icon size={16} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
