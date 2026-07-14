import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Map, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { boundsForWidgets } from '../../utils/widgetBounds'

const MAP_WIDTH = 184
const MAP_HEIGHT = 116
const MAP_PAD = 9

function colorFor(type: string): string {
  const colors = ['#a78bfa', '#22d3ee', '#84cc16', '#f59e0b', '#f472b6', '#60a5fa']
  let hash = 0
  for (let i = 0; i < type.length; i++) hash = (hash * 31 + type.charCodeAt(i)) | 0
  return colors[Math.abs(hash) % colors.length]!
}

export function CanvasNavigator() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('grovepad:minimap') === 'collapsed')
  const { widgets, activeCanvasId } = useWidgetStore(
    useShallow((state) => ({ widgets: state.widgets, activeCanvasId: state.activeCanvasId })),
  )
  const { pan, zoom, viewportSize } = useCanvasStore(
    useShallow((state) => ({ pan: state.pan, zoom: state.zoom, viewportSize: state.viewportSize })),
  )
  const active = useMemo(
    () => Object.values(widgets).filter((widget) => widget.canvasId === activeCanvasId),
    [widgets, activeCanvasId],
  )
  const board = useMemo(() => boundsForWidgets(active), [active])

  const viewportWorld = {
    x: -pan.x / zoom,
    y: -pan.y / zoom,
    width: viewportSize.width / zoom,
    height: viewportSize.height / zoom,
  }
  const extent = board
    ? {
        x: Math.min(board.x, viewportWorld.x),
        y: Math.min(board.y, viewportWorld.y),
        width: Math.max(board.x + board.width, viewportWorld.x + viewportWorld.width) - Math.min(board.x, viewportWorld.x),
        height: Math.max(board.y + board.height, viewportWorld.y + viewportWorld.height) - Math.min(board.y, viewportWorld.y),
      }
    : viewportWorld
  const scale = Math.min(
    (MAP_WIDTH - MAP_PAD * 2) / Math.max(1, extent.width),
    (MAP_HEIGHT - MAP_PAD * 2) / Math.max(1, extent.height),
  )
  const mapX = (x: number) => MAP_PAD + (x - extent.x) * scale
  const mapY = (y: number) => MAP_PAD + (y - extent.y) * scale

  const glideFromMap = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (clientX: number, clientY: number) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const worldX = extent.x + ((clientX - rect.left - MAP_PAD) / scale)
      const worldY = extent.y + ((clientY - rect.top - MAP_PAD) / scale)
      useCanvasStore.getState().animateView(
        { x: viewportSize.width / 2 - worldX * zoom, y: viewportSize.height / 2 - worldY * zoom },
        zoom,
        160,
      )
    }
    move(event.clientX, event.clientY)
    const onMove = (next: globalThis.PointerEvent) => move(next.clientX, next.clientY)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  const offscreen = active.filter((widget) => {
    const cx = widget.position.x + widget.size.width / 2
    const cy = widget.position.y + widget.size.height / 2
    return cx < viewportWorld.x || cx > viewportWorld.x + viewportWorld.width || cy < viewportWorld.y || cy > viewportWorld.y + viewportWorld.height
  })
  const directions = [
    { key: 'left', icon: ChevronLeft, items: offscreen.filter((w) => w.position.x + w.size.width < viewportWorld.x), className: 'left-3 top-1/2 -translate-y-1/2' },
    { key: 'right', icon: ChevronRight, items: offscreen.filter((w) => w.position.x > viewportWorld.x + viewportWorld.width), className: 'right-3 top-1/2 -translate-y-1/2' },
    { key: 'up', icon: ChevronUp, items: offscreen.filter((w) => w.position.y + w.size.height < viewportWorld.y), className: 'left-1/2 top-16 -translate-x-1/2' },
    { key: 'down', icon: ChevronDown, items: offscreen.filter((w) => w.position.y > viewportWorld.y + viewportWorld.height), className: 'bottom-16 left-1/2 -translate-x-1/2' },
  ]

  return (
    <>
      {directions.map(({ key, icon: Icon, items, className }) => {
        if (items.length === 0) return null
        return (
          <button
            key={key}
            data-canvas-ui
            type="button"
            aria-label={`${items.length} off-screen ${key}`}
            onClick={() => {
              const rect = boundsForWidgets(items)
              if (rect) useCanvasStore.getState().fitRect(rect, 180)
            }}
            className={`gp-panel fixed z-30 flex h-8 min-w-8 items-center justify-center gap-1 rounded-full border border-violet-400/25 px-2 text-[10px] text-violet-200 shadow-[0_0_24px_rgba(139,92,246,.2)] transition-transform hover:scale-110 ${className}`}
          >
            <Icon size={13} aria-hidden />{items.length}
          </button>
        )
      })}
      <div data-canvas-ui className="gp-panel fixed bottom-16 left-4 z-30 overflow-hidden rounded-2xl border gp-hairline shadow-2xl">
        {collapsed ? (
          <button
            type="button"
            aria-label="Open minimap"
            onClick={() => { setCollapsed(false); localStorage.setItem('grovepad:minimap', 'open') }}
            className="flex h-9 w-9 items-center justify-center text-neutral-400 hover:text-white"
          ><Map size={14} /></button>
        ) : (
          <>
            <div className="flex h-7 items-center justify-between border-b gp-hairline px-2 text-[9px] font-semibold uppercase tracking-widest text-neutral-500">
              Board map
              <button type="button" aria-label="Collapse minimap" onClick={() => { setCollapsed(true); localStorage.setItem('grovepad:minimap', 'collapsed') }} className="hover:text-white"><X size={10} /></button>
            </div>
            <svg
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              role="img"
              aria-label="Canvas minimap. Click or drag to navigate."
              onPointerDown={glideFromMap}
              className="cursor-crosshair bg-neutral-950/70"
            >
              {active.map((widget) => (
                <rect
                  key={widget.id}
                  x={mapX(widget.position.x)}
                  y={mapY(widget.position.y)}
                  width={Math.max(2, widget.size.width * scale)}
                  height={Math.max(2, widget.size.height * scale)}
                  rx="1.5"
                  fill={colorFor(widget.type)}
                  opacity=".65"
                />
              ))}
              <rect
                x={mapX(viewportWorld.x)}
                y={mapY(viewportWorld.y)}
                width={Math.max(3, viewportWorld.width * scale)}
                height={Math.max(3, viewportWorld.height * scale)}
                rx="2"
                fill="rgba(163,230,53,.05)"
                stroke="#a3e635"
                strokeWidth="1.2"
              />
            </svg>
          </>
        )}
      </div>
    </>
  )
}
