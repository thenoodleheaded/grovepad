import type { ReactNode } from 'react'
import {
  Cable,
  CheckSquare,
  Copy,
  FolderOpen,
  GitMerge,
  LockKeyhole,
  UnlockKeyhole,
  Layers,
  MonitorSmartphone,
  MousePointer2,
  Trash2,
  Unlink,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { useToastStore } from '../../store/useToastStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useNativeWidgetStore } from '../../store/useNativeWidgetStore'
import { requestWidgetDeletion } from '../../store/useWidgetDeletionDialogStore'
import { clampPopover } from '../../utils/popoverPosition'
import { menuNavigationIndex } from '../../utils/menuNavigation'
import { isNativeWidgetHost } from '../../runtime/nativeNoteWidgetSync'

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
      role="menuitem"
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
  const menuRef = useRef<HTMLDivElement>(null)
  const contextMenu = useWidgetStore((state) => state.contextMenu)
  const widget = useWidgetStore((state) =>
    contextMenu ? state.widgets[contextMenu.widgetId] : undefined,
  )
  const selectedIds = useWidgetStore(useShallow((state) => [...state.selectedIds]))
  const groupId = useWidgetStore((state) =>
    contextMenu ? state.widgetGroupIndex[contextMenu.widgetId] : undefined,
  )
  const { nativeWidgetId, nativeWidgetSyncStatus } = useNativeWidgetStore(useShallow((state) => ({
    nativeWidgetId: state.selectedWidgetId,
    nativeWidgetSyncStatus: state.syncStatus,
  })))

  useOverlayLifecycle(contextMenu !== null)

  useEffect(() => {
    if (!contextMenu) return
    const invoker = document.querySelector<HTMLElement>(`[data-widget-id="${CSS.escape(contextMenu.widgetId)}"] article`)
    const itemSelector = '[role="menuitem"]:not(:disabled),[role="menuitemradio"]:not(:disabled)'
    const focusFirst = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>(itemSelector)?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        useWidgetStore.getState().closeContextMenu()
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>(itemSelector) ?? [])]
      if (items.length === 0) return
      event.preventDefault()
      const current = items.indexOf(document.activeElement as HTMLButtonElement)
      const next = menuNavigationIndex(current, items.length, event.key as 'ArrowDown' | 'ArrowUp' | 'Home' | 'End')
      items[next]?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(focusFirst)
      window.removeEventListener('keydown', onKeyDown)
      if (invoker?.isConnected) invoker.focus()
      else document.querySelector<HTMLElement>('[data-canvas-viewport]')?.focus()
    }
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
        role="presentation"
        className="fixed inset-0 z-[210]"
        onPointerDown={close}
        onContextMenu={(event) => {
          event.preventDefault()
          close()
        }}
      />
      <div
        ref={menuRef}
        data-canvas-ui
        role="menu"
        aria-label={`Actions for ${widget.title}`}
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
        {widget.type === 'notes' && isNativeWidgetHost() && nativeWidgetSyncStatus !== 'unsupported' && (
          <MenuButton
            label={nativeWidgetId === widget.id ? 'Remove from home-screen widget' : 'Use in home-screen widget'}
            onClick={() => run(() => {
              const nextId = nativeWidgetId === widget.id ? null : widget.id
              useNativeWidgetStore.getState().setSelectedWidgetId(nextId)
              useToastStore.getState().addToast(
                nextId
                  ? 'Selected for Grovepad Note in your device widget gallery'
                  : 'Removed from the home-screen widget',
              )
            })}
          >
            <MonitorSmartphone size={13} aria-hidden />
          </MenuButton>
        )}
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
          onClick={() => run(() => requestWidgetDeletion(actionIds))}
        >
          <Trash2 size={13} aria-hidden />
        </MenuButton>
      </div>
    </>,
    document.body,
  )
}
