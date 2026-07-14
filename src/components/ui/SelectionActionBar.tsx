import type { ReactNode } from 'react'
import { Copy, Layers, Maximize2, Trash2, Unlink, X } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import type { Widget } from '../../types/spatial'
import { boundsForWidgets } from '../../utils/widgetBounds'

function ActionButton({
  label,
  danger = false,
  disabled = false,
  showLabel = true,
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
      className={`flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-medium transition-[background-color,color,transform] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 ${
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
  const widgetGroupIndex = useWidgetStore((state) => state.widgetGroupIndex)
  const selectedIds = [...selectedSet]
  const groupIds = [
    ...new Set(
      selectedIds
        .map((id) => widgetGroupIndex[id])
        .filter((groupId): groupId is string => Boolean(groupId)),
    ),
  ]
  const groupedSelectedIds = selectedIds.filter((id) => widgetGroupIndex[id])

  if (selectedIds.length === 0) return null

  const selectedLabel = `${selectedIds.length} selected`
  const canGroup = selectedIds.length >= 2
  const canDetach = groupedSelectedIds.length > 0
  const canTighten = groupIds.length > 0

  return (
    <div
      data-canvas-ui
      className="gp-selection-bar gp-toolbar gp-pop gp-panel absolute bottom-16 left-1/2 z-20 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 select-none items-center gap-0.5 rounded-2xl p-1.5 shadow-2xl sm:bottom-4 sm:gap-1"
      style={{ transformOrigin: '50% 100%' }}
    >
      <div className="min-w-16 px-1.5 text-center text-[11px] font-semibold text-neutral-200 sm:min-w-20 sm:px-2 sm:text-xs">
        {selectedLabel}
      </div>
      <div className="h-5 w-px bg-neutral-700/70" aria-hidden />
      <ActionButton
        label="Frame"
        showLabel={false}
        onClick={() => {
          const widgets = useWidgetStore.getState().widgets
          const rect = boundsForWidgets(
            selectedIds.map((id) => widgets[id]).filter((widget): widget is Widget => Boolean(widget)),
          )
          if (rect) useCanvasStore.getState().fitRect(rect)
        }}
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
      <ActionButton
        label="Group"
        disabled={!canGroup}
        onClick={() => {
          const { createGroup, clearSelection } = useWidgetStore.getState()
          createGroup(selectedIds)
          clearSelection()
        }}
      >
        <Layers size={13} aria-hidden />
      </ActionButton>
      <ActionButton
        label="Tighten"
        disabled={!canTighten}
        onClick={() => {
          const { compactGroup } = useWidgetStore.getState()
          for (const groupId of groupIds) compactGroup(groupId)
        }}
      >
        <Layers size={13} aria-hidden />
      </ActionButton>
      <ActionButton
        label="Detach"
        disabled={!canDetach}
        onClick={() => {
          const state = useWidgetStore.getState()
          for (const widgetId of groupedSelectedIds) {
            const groupId = state.widgetGroupIndex[widgetId]
            if (groupId) state.removeFromGroup(groupId, widgetId)
          }
        }}
      >
        <Unlink size={13} aria-hidden />
      </ActionButton>
      <ActionButton
        label="Delete"
        danger
        showLabel={false}
        onClick={() => useWidgetStore.getState().deleteWidgets(selectedIds)}
      >
        <Trash2 size={13} aria-hidden />
      </ActionButton>
      <button
        type="button"
        title="Clear selection"
        aria-label="Clear selection"
        onClick={() => useWidgetStore.getState().clearSelection()}
        className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-white"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}
