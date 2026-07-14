import { useEffect, useState, type RefObject } from 'react'
import { Image, Layers, Network, SquarePlus } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { screenToWorld } from '../../types/spatial'
import { clampPopover } from '../../utils/popoverPosition'

interface CanvasContextMenuProps {
  viewportRef: RefObject<HTMLDivElement | null>
}

interface MenuState {
  x: number
  y: number
  worldX: number
  worldY: number
  selectedCount: number
}

export function CanvasContextMenu({ viewportRef }: CanvasContextMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)

  useOverlayLifecycle(menu !== null)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const onContextMenu = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('article, svg')) return
      if (useWidgetStore.getState().ghostConfig) return
      event.preventDefault()
      useWidgetStore.getState().closeContextMenu()
      const rect = el.getBoundingClientRect()
      const { pan, zoom } = useCanvasStore.getState()
      const world = screenToWorld(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        { x: pan.x, y: pan.y, zoom },
      )
      setMenu({
        x: event.clientX,
        y: event.clientY,
        worldX: world.x,
        worldY: world.y,
        selectedCount: useWidgetStore.getState().selectedIds.size,
      })
    }

    el.addEventListener('contextmenu', onContextMenu)
    return () => el.removeEventListener('contextmenu', onContextMenu)
  }, [viewportRef])

  if (!menu) return null
  const position = clampPopover(menu.x, menu.y, 208, menu.selectedCount >= 2 ? 158 : 124)

  return (
    <>
      <div
        data-canvas-ui
        className="fixed inset-0 z-40"
        onPointerDown={() => setMenu(null)}
        onContextMenu={(event) => { event.preventDefault(); setMenu(null) }}
      />
      <div
        data-canvas-ui
        className="gp-menu gp-pop gp-panel fixed z-50 w-52 origin-top-left rounded-2xl p-1.5 shadow-2xl"
        style={{ left: position.x, top: position.y }}
      >
        {menu.selectedCount >= 2 && (
          <>
            <button
              type="button"
              onClick={() => {
                const { selectedIds, createGroup, clearSelection } = useWidgetStore.getState()
                createGroup([...selectedIds])
                clearSelection()
                setMenu(null)
              }}
              className="gp-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-700/60"
            >
              <Layers size={12} className="text-indigo-400" aria-hidden />
              Group {menu.selectedCount} selected
            </button>
            <div className="my-1 border-t border-neutral-800" />
          </>
        )}
        <button
          type="button"
          onClick={() => {
            useWidgetStore.getState().startGhostShaper(menu.worldX, menu.worldY)
            setMenu(null)
          }}
          className="gp-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-700/60"
        >
          <Network size={12} className="text-emerald-400" aria-hidden />
          Shape tree manually…
        </button>
        <button
          type="button"
          onClick={() => {
            useWidgetStore.getState().openAddWidget({ x: menu.worldX, y: menu.worldY })
            setMenu(null)
          }}
          className="gp-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-700/60"
        >
          <SquarePlus size={12} className="text-neutral-500" aria-hidden />
          Browse widgets here…
        </button>
        <button
          type="button"
          onClick={() => {
            void import('../../utils/exportCanvasImage').then(({ exportCanvasImage }) => exportCanvasImage(true))
            setMenu(null)
          }}
          className="gp-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-700/60"
        >
          <Image size={12} className="text-violet-400" aria-hidden />
          Copy canvas as image
        </button>
      </div>
    </>
  )
}
