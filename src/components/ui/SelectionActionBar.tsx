import type { ReactNode } from 'react'
import { Cable, Copy, Link2, Maximize2, Trash2, Wind, X } from 'lucide-react'
import { useWidgetStore } from '../../store/useWidgetStore'
import { requestWidgetDeletion } from '../../store/useWidgetDeletionDialogStore'
import { frameCanvas } from '../../utils/cameraFraming'
import { usesStrictRelations } from '../../utils/relationPolicy'

function ActionButton({
  label,
  danger = false,
  disabled = false,
  showLabel = false,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  disabled?: boolean
  showLabel?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`gp-touch-target flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-medium transition-[background-color,color,transform,scale] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 ${
        showLabel ? 'w-9 px-0 md:w-auto md:px-2.5' : 'w-9'
      } ${
        danger
          ? 'text-red-300 hover:bg-red-500/12 hover:text-red-200'
          : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
      }`}
    >
      {children}
      {showLabel && <span className="hidden md:inline">{label}</span>}
    </button>
  )
}

export function SelectionActionBar() {
  const selectedSet = useWidgetStore((state) => state.selectedIds)
  const strictRelations = useWidgetStore((state) =>
    usesStrictRelations(state.canvases[state.activeCanvasId]),
  )
  const selectedIds = [...selectedSet]

  if (selectedIds.length === 0) return null

  const selectedLabel = `${selectedIds.length} selected`
  const singleSelectedId = selectedIds.length === 1 ? selectedIds[0] : null

  return (
    <div
      data-canvas-ui
      className="gp-canvas-ui-scale gp-safe-canvas-bottom-center gp-selection-bar gp-toolbar gp-pop gp-panel absolute left-1/2 z-20 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 select-none items-center gap-0.5 overflow-x-auto overscroll-x-contain rounded-t-2xl rounded-b-none p-1 shadow-2xl sm:gap-1"
      style={{ transformOrigin: '50% 100%' }}
    >
      <div className="min-w-16 px-1.5 text-center text-[11px] font-semibold text-neutral-200 sm:min-w-20 sm:px-2 sm:text-xs">
        {selectedLabel}
      </div>
      <div className="h-5 w-px bg-neutral-700/70" aria-hidden />
      <ActionButton
        label="Frame"
        showLabel={false}
        onClick={() => frameCanvas('selection', 120)}
      >
        <Maximize2 size={13} aria-hidden />
      </ActionButton>
      <ActionButton
        label="Duplicate"
        showLabel={false}
        onClick={() => useWidgetStore.getState().duplicateWidgets(selectedIds)}
      >
        <Copy size={13} aria-hidden />
      </ActionButton>
      {selectedIds.length >= 2 && (
        <ActionButton
          label="Untangle"
          showLabel
          onClick={() => useWidgetStore.getState().untangleWidgets(selectedIds)}
        >
          <Wind size={13} aria-hidden />
        </ActionButton>
      )}
      <ActionButton
        label={strictRelations ? 'Link as child' : 'Connect'}
        disabled={!singleSelectedId}
        onClick={() => {
          if (singleSelectedId) useWidgetStore.getState().startChildLink(singleSelectedId)
        }}
      >
        <Link2 size={13} aria-hidden />
      </ActionButton>
      <ActionButton
        label="Add dependency"
        disabled={!singleSelectedId}
        onClick={() => {
          if (singleSelectedId) useWidgetStore.getState().startDependencyLink(singleSelectedId)
        }}
      >
        <Cable size={13} aria-hidden />
      </ActionButton>
      <ActionButton
        label="Delete"
        danger
        showLabel={false}
        onClick={() => requestWidgetDeletion(selectedIds)}
      >
        <Trash2 size={13} aria-hidden />
      </ActionButton>
      <button
        type="button"
        title="Clear selection"
        aria-label="Clear selection"
        onClick={() => useWidgetStore.getState().clearSelection()}
        className="gp-touch-target ml-0.5 flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-white"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}
