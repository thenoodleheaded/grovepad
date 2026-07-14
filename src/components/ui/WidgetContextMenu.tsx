import type { ReactNode } from 'react'
import {
  Cable,
  CheckSquare,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  FolderOpen,
  GitMerge,
  LockKeyhole,
  UnlockKeyhole,
  Layers,
  MousePointer2,
  Shrink,
  Trash2,
  Unlink,
} from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { clampPopover } from '../../utils/popoverPosition'

function MenuButton({
  label,
  danger = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`gp-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        danger
          ? 'text-red-300 hover:bg-red-500/10'
          : 'text-neutral-300 hover:bg-neutral-800'
      }`}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

export function WidgetContextMenu() {
  const contextMenu = useWidgetStore((state) => state.contextMenu)
  const widget = useWidgetStore((state) =>
    contextMenu ? state.widgets[contextMenu.widgetId] : undefined,
  )
  const selectedIds = useWidgetStore(useShallow((state) => [...state.selectedIds]))
  const groupId = useWidgetStore((state) =>
    contextMenu ? state.widgetGroupIndex[contextMenu.widgetId] : undefined,
  )

  useOverlayLifecycle(contextMenu !== null)

  useEffect(() => {
    if (!contextMenu) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useWidgetStore.getState().closeContextMenu()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [contextMenu])

  if (!contextMenu || !widget) return null

  const isSelected = selectedIds.includes(widget.id)
  const actionIds = isSelected ? selectedIds : [widget.id]
  const { x: left, y: top } = clampPopover(contextMenu.x, contextMenu.y, 220, 350)

  const close = () => useWidgetStore.getState().closeContextMenu()
  const run = (action: () => void) => {
    action()
    close()
  }

  return createPortal(
    <>
      <div
        data-canvas-ui
        className="fixed inset-0 z-[210]"
        onPointerDown={close}
        onContextMenu={(event) => {
          event.preventDefault()
          close()
        }}
      />
      <div
        data-canvas-ui
        className="gp-menu gp-pop gp-panel fixed z-[211] w-52 origin-top-left overflow-hidden rounded-2xl p-1.5 shadow-2xl"
        style={{ left, top }}
      >
        <p className="truncate px-3 py-1.5 text-xs font-bold text-neutral-100">
          {widget.title}
        </p>
        <div className="border-t border-neutral-800" />
        {widget.type === 'canvas_node' && (
          <MenuButton
            label="Open canvas"
            onClick={() =>
              run(() => {
                const canvasId = (widget.data as { canvasId: string }).canvasId
                useWidgetStore.getState().navigateToCanvas(canvasId)
              })
            }
          >
            <FolderOpen size={13} aria-hidden />
          </MenuButton>
        )}
        <MenuButton
          label="Select only"
          onClick={() => run(() => useWidgetStore.getState().selectWidget(widget.id, false))}
        >
          <MousePointer2 size={13} aria-hidden />
        </MenuButton>
        <MenuButton
          label={isSelected ? 'Remove from selection' : 'Add to selection'}
          onClick={() => run(() => useWidgetStore.getState().selectWidget(widget.id, true))}
        >
          <CheckSquare size={13} aria-hidden />
        </MenuButton>
        <MenuButton
          label={actionIds.length > 1 ? `Duplicate ${actionIds.length}` : 'Duplicate'}
          onClick={() => run(() => useWidgetStore.getState().duplicateWidgets(actionIds))}
        >
          <Copy size={13} aria-hidden />
        </MenuButton>
        <MenuButton
          label={widget.metadata.locked ? 'Unlock widget' : 'Lock widget'}
          onClick={() => run(() => useWidgetStore.getState().toggleWidgetLocked(widget.id))}
        >
          {widget.metadata.locked ? <UnlockKeyhole size={13} aria-hidden /> : <LockKeyhole size={13} aria-hidden />}
        </MenuButton>
        <div className="flex items-center gap-1.5 px-3 py-2" aria-label="Widget accent color">
          {['#a78bfa', '#22d3ee', '#84cc16', '#f59e0b', '#f472b6', '#60a5fa'].map((accent) => (
            <button
              key={accent}
              type="button"
              aria-label={`Use ${accent} accent`}
              onClick={() => run(() => useWidgetStore.getState().setWidgetAccent(widget.id, accent))}
              className="h-4 w-4 rounded-full border border-white/20 transition-transform hover:scale-125"
              style={{ background: accent, boxShadow: widget.metadata.accent === accent ? `0 0 0 2px #0a0a0a, 0 0 0 3px ${accent}` : undefined }}
            />
          ))}
        </div>
        <MenuButton
          label={
            widget.collapsed
              ? actionIds.length > 1
                ? `Expand ${actionIds.length}`
                : 'Expand widget'
              : actionIds.length > 1
                ? `Collapse ${actionIds.length} to pills`
                : 'Collapse to pill'
          }
          onClick={() =>
            run(() => useWidgetStore.getState().setWidgetsCollapsed(actionIds, !widget.collapsed))
          }
        >
          {widget.collapsed ? (
            <ChevronsUpDown size={13} aria-hidden />
          ) : (
            <ChevronsDownUp size={13} aria-hidden />
          )}
        </MenuButton>
        <MenuButton
          label={widget.iconified ? 'Expand from icon' : 'Shrink to icon'}
          onClick={() =>
            run(() =>
              actionIds.forEach((id) =>
                useWidgetStore
                  .getState()
                  .setWidgetScaleState(id, widget.iconified ? 'full' : 'icon'),
              ),
            )
          }
        >
          {widget.iconified ? (
            <ChevronsUpDown size={13} aria-hidden />
          ) : (
            <Shrink size={13} aria-hidden />
          )}
        </MenuButton>
        <MenuButton
          label="Group selected"
          disabled={actionIds.length < 2}
          onClick={() =>
            run(() => {
              useWidgetStore.getState().createGroup(actionIds)
              useWidgetStore.getState().clearSelection()
            })
          }
        >
          <Layers size={13} aria-hidden />
        </MenuButton>
        {groupId && (
          <>
            <div className="my-1 border-t border-neutral-800" />
            <MenuButton
              label="Detach from group"
              onClick={() =>
                run(() => useWidgetStore.getState().removeFromGroup(groupId, widget.id))
              }
            >
              <Unlink size={13} aria-hidden />
            </MenuButton>
            <MenuButton
              label="Tighten group"
              onClick={() => run(() => useWidgetStore.getState().compactGroup(groupId))}
            >
              <Layers size={13} aria-hidden />
            </MenuButton>
            <MenuButton
              label="Dissolve group"
              onClick={() => run(() => useWidgetStore.getState().dissolveGroup(groupId))}
            >
              <Unlink size={13} aria-hidden />
            </MenuButton>
          </>
        )}
        {!groupId && (
          <>
            <div className="my-1 border-t border-neutral-800" />
            <MenuButton
              label="Link as child of…"
              onClick={() => run(() => useWidgetStore.getState().startChildLink(widget.id))}
            >
              <GitMerge size={13} aria-hidden />
            </MenuButton>
          </>
        )}
        {!groupId && (
          <MenuButton
            label="Make prerequisite for… (X)"
            onClick={() => run(() => useWidgetStore.getState().startDependencyLink(widget.id))}
          >
            <Cable size={13} aria-hidden />
          </MenuButton>
        )}
        <div className="my-1 border-t border-neutral-800" />
        <MenuButton
          label={actionIds.length > 1 ? `Delete ${actionIds.length}` : 'Delete'}
          danger
          onClick={() => run(() => useWidgetStore.getState().deleteWidgets(actionIds))}
        >
          <Trash2 size={13} aria-hidden />
        </MenuButton>
      </div>
    </>,
    document.body,
  )
}
