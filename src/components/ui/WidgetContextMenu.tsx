import type { ReactNode } from 'react'
import {
  Copy,
  Droplets,
  FolderOpen,
  LockKeyhole,
  UnlockKeyhole,
  Magnet,
  MonitorSmartphone,
  PenLine,
  Scissors,
  Trash2,
  Waypoints,
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { useToastStore } from '../../store/useToastStore'
import { resolveStrictHold, useWidgetStore } from '../../store/useWidgetStore'
import { useNativeWidgetStore } from '../../store/useNativeWidgetStore'
import { requestWidgetDeletion } from '../../store/useWidgetDeletionDialogStore'
import { clampPopover } from '../../utils/popoverPosition'
import { menuNavigationIndex } from '../../utils/menuNavigation'
import { truncate } from '../../utils/text'
import { isNativeWidgetHost } from '../../runtime/nativeNoteWidgetSync'
import { presentNativeMenu, usesNativeMenu } from '../../utils/nativeMenu'

/**
 * One row of the context menu, described rather than drawn.
 *
 * Both surfaces read this same list — the glass menu on desktop and the system
 * action sheet on iOS — so an action can never exist on one and not the other.
 * `icon` and `separatorBefore` are the web menu's business; iOS has neither.
 */
interface MenuAction {
  id: string
  label: string
  icon: ReactNode
  danger?: boolean
  separatorBefore?: boolean
  run: () => void
}

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
  const isGlued = useWidgetStore((state) =>
    contextMenu ? Boolean(state.widgetGlueIndex[contextMenu.widgetId]) : false,
  )
  // Holding a family strictly only means something for a node that HAS a
  // family: a leaf with no parent-linked children would offer a switch that
  // changes nothing.
  const hasFamily = useWidgetStore((state) =>
    contextMenu
      ? Object.values(state.relations).some(
          (relation) => relation.type === 'parent' && relation.fromId === contextMenu.widgetId,
        )
      : false,
  )
  // Hard parenting is the default, so what this row shows is the RESOLVED
  // answer: the node's own flag, else the nearest released ancestor's, else
  // hard. Two reads of the same resolution — the state to show, and the
  // ancestor to name when the node did not decide for itself.
  const strictHold = useWidgetStore((state) =>
    contextMenu
      ? resolveStrictHold(contextMenu.widgetId, state.widgets, state.relations).strict
      : true,
  )
  const releasedByTitle = useWidgetStore((state) => {
    if (!contextMenu) return null
    const { inheritedFrom } = resolveStrictHold(contextMenu.widgetId, state.widgets, state.relations)
    return inheritedFrom ? state.widgets[inheritedFrom]?.title ?? null : null
  })
  const { nativeWidgetId, nativeWidgetSyncStatus } = useNativeWidgetStore(useShallow((state) => ({
    nativeWidgetId: state.selectedWidgetId,
    nativeWidgetSyncStatus: state.syncStatus,
  })))

  const nativeMenu = usesNativeMenu()

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

  // Every value the actions read is derived above, so the list is built from
  // one place and both surfaces render the same menu.
  const isSelected = contextMenu && widget ? selectedIds.includes(widget.id) : false
  // Memoized because the action list is: a fresh array every render would
  // rebuild every row's closure on every store change.
  const actionIds = useMemo(
    () => (widget ? (isSelected ? selectedIds : [widget.id]) : []),
    [widget, isSelected, selectedIds],
  )
  const close = () => useWidgetStore.getState().closeContextMenu()
  const run = (action: () => void) => {
    action()
    close()
  }

  const actions = useMemo<MenuAction[]>(() => {
    if (!contextMenu || !widget) return []
    const list: MenuAction[] = []
    const many = actionIds.length > 1

    if (widget.type === 'canvas_node') {
      list.push({
        id: 'open-canvas',
        label: 'Open canvas',
        icon: <FolderOpen size={13} aria-hidden />,
        run: () => {
          const canvasId = (widget.data as { canvasId: string }).canvasId
          useWidgetStore.getState().navigateToCanvas(canvasId)
        },
      })
    }

    if (widget.type === 'text' && isNativeWidgetHost() && nativeWidgetSyncStatus !== 'unsupported') {
      list.push({
        id: 'home-screen-widget',
        label: nativeWidgetId === widget.id
          ? 'Remove from home-screen widget'
          : 'Use in home-screen widget',
        icon: <MonitorSmartphone size={13} aria-hidden />,
        run: () => {
          const nextId = nativeWidgetId === widget.id ? null : widget.id
          useNativeWidgetStore.getState().setSelectedWidgetId(nextId)
          useToastStore.getState().addToast(
            nextId
              ? 'Selected for Grovepad Note in your device widget gallery'
              : 'Removed from the home-screen widget',
          )
        },
      })
    }

    list.push(
      {
        id: 'duplicate',
        label: many ? `Duplicate ${actionIds.length}` : 'Duplicate',
        icon: <Copy size={13} aria-hidden />,
        run: () => useWidgetStore.getState().duplicateWidgets(actionIds),
      },
      {
        id: 'copy',
        label: many ? `Copy ${actionIds.length}` : 'Copy',
        icon: <Copy size={13} aria-hidden />,
        run: () => useWidgetStore.getState().copyWidgets(actionIds),
      },
      {
        id: 'cut',
        label: many ? `Cut ${actionIds.length}` : 'Cut',
        icon: <Scissors size={13} aria-hidden />,
        run: () => useWidgetStore.getState().cutWidgets(actionIds),
      },
      {
        id: 'rename',
        // The key hint is desktop-only: a phone has no F2, and the system sheet
        // would read it as part of the action's name.
        label: nativeMenu ? 'Rename' : 'Rename (F2)',
        icon: <PenLine size={13} aria-hidden />,
        run: () => useWidgetStore.getState().startRenaming(widget.id),
      },
      {
        id: 'lock',
        label: many
          ? widget.metadata.locked ? `Unlock ${actionIds.length}` : `Lock ${actionIds.length}`
          : widget.metadata.locked ? 'Unlock widget' : 'Lock widget',
        icon: widget.metadata.locked
          ? <UnlockKeyhole size={13} aria-hidden />
          : <LockKeyhole size={13} aria-hidden />,
        // The clicked card decides the direction, so a mixed selection resolves
        // to one predictable state instead of flipping each card.
        run: () => useWidgetStore.getState().lockWidgets(actionIds, !widget.metadata.locked),
      },
    )

    if (isGlued) {
      list.push({
        id: 'unglue',
        label: 'Unglue',
        icon: <Droplets size={13} aria-hidden />,
        run: () => useWidgetStore.getState().unglueWidget(widget.id),
      })
    }

    if (hasFamily) {
      // Hard by default, and every node owns the hold on its own branch: the row
      // always switches. An answer a node inherited names where it was decided
      // instead of refusing to move.
      list.push({
        id: 'strict-hold',
        separatorBefore: true,
        label: strictHold
          ? 'Release strict hold'
          : releasedByTitle !== null
            ? `Hold family strictly (released by ${truncate(releasedByTitle, 12)})`
            : 'Hold family strictly',
        icon: strictHold ? <Waypoints size={13} aria-hidden /> : <Magnet size={13} aria-hidden />,
        run: () =>
          useWidgetStore.getState().updateWidgetsMetadata([widget.id], { strictHold: !strictHold }),
      })
    }

    list.push({
      id: 'delete',
      separatorBefore: true,
      label: many ? `Delete ${actionIds.length}` : 'Delete',
      icon: <Trash2 size={13} aria-hidden />,
      danger: true,
      run: () => requestWidgetDeletion(actionIds),
    })

    return list
  }, [
    contextMenu, widget, actionIds, isGlued, hasFamily, strictHold, releasedByTitle,
    nativeWidgetId, nativeWidgetSyncStatus, nativeMenu,
  ])

  // Read by the presentation effect, which must not re-fire when a label
  // changes underneath an open sheet.
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  // iOS hands the whole menu to UIKit. Presented once per opening: the sheet is
  // already on screen, and re-presenting on a store change would stack a second
  // one on top of it.
  const presentedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!nativeMenu) return
    if (!contextMenu) {
      presentedFor.current = null
      return
    }
    if (presentedFor.current === contextMenu.widgetId) return
    presentedFor.current = contextMenu.widgetId

    const items = actionsRef.current
    const title = widget?.title ?? ''
    void presentNativeMenu(
      title,
      items.map(({ label, danger }) => ({ label, danger })),
      // A zero-size rect at the press point. iPhone ignores it; iPad anchors its
      // popover there, and raises outright without one.
      { x: contextMenu.x, y: contextMenu.y, width: 0, height: 0 },
    ).then((index) => {
      // Close first either way: the sheet has already gone, and leaving the
      // store open would strand the menu state after a dismissal.
      useWidgetStore.getState().closeContextMenu()
      if (index !== null) items[index]?.run()
    })
  }, [nativeMenu, contextMenu, widget])

  if (!contextMenu || !widget) return null
  // The system sheet is the menu on iOS; drawing the glass one underneath it
  // would put two menus on screen for the same press.
  if (nativeMenu) return null

  // Height is what keeps the menu on screen near the bottom edge, so the
  // estimate counts the tallest the menu gets: every conditional row present,
  // including the strict-hold switch.
  const { x: left, y: top } = clampPopover(contextMenu.x, contextMenu.y, 220, 550)

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
        className="gp-popup-menu gp-menu gp-pop gp-panel fixed z-[211] w-52 origin-top-left overflow-hidden rounded-2xl p-1.5 shadow-2xl"
        style={{ left, top }}
      >
        <p className="truncate px-3 py-1.5 text-xs font-bold text-neutral-100">
          {widget.title}
        </p>
        <div className="border-t border-neutral-800" />
        {actions.map((action) => (
          <Fragment key={action.id}>
            {action.separatorBefore ? <div className="my-1 border-t border-neutral-800" /> : null}
            <MenuButton label={action.label} danger={action.danger} onClick={() => run(action.run)}>
              {action.icon}
            </MenuButton>
          </Fragment>
        ))}
      </div>
    </>,
    document.body,
  )
}
