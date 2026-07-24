import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Map, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useAdaptiveInputStore } from '../../store/useAdaptiveInputStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { isMinimapExpanded } from '../../utils/adaptiveChrome'
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
  const [compactExpanded, setCompactExpanded] = useState(false)
  const { viewportClass, viewportHeight } = useAdaptiveInputStore(
    useShallow((state) => ({
      viewportClass: state.capabilities.viewportClass,
      viewportHeight: state.capabilities.height,
    })),
  )
  const compactViewport = viewportClass === 'phone' || viewportHeight < 560
  const expanded = isMinimapExpanded(
    viewportClass,
    collapsed,
    compactExpanded,
    viewportHeight < 560,
  )
  const { widgets, activeCanvasId } = useWidgetStore(
    useShallow((state) => ({ widgets: state.widgets, activeCanvasId: state.activeCanvasId })),
  )
  const viewportRectRef = useRef<SVGRectElement>(null)
  const active = useMemo(
    () => Object.values(widgets).filter((widget) => widget.canvasId === activeCanvasId),
    [widgets, activeCanvasId],
  )
  const board = useMemo(() => boundsForWidgets(active), [active])

  useEffect(() => {
    if (compactViewport) setCompactExpanded(false)
  }, [compactViewport])

  const openMap = () => {
    if (compactViewport) {
      setCompactExpanded(true)
      return
    }
    setCollapsed(false)
    localStorage.setItem('grovepad:minimap', 'open')
  }

  const closeMap = () => {
    if (compactViewport) {
      setCompactExpanded(false)
      return
    }
    setCollapsed(true)
    localStorage.setItem('grovepad:minimap', 'collapsed')
  }

  const extent = board ?? { x: -600, y: -360, width: 1200, height: 720 }
  const scale = Math.min(
    (MAP_WIDTH - MAP_PAD * 2) / Math.max(1, extent.width),
    (MAP_HEIGHT - MAP_PAD * 2) / Math.max(1, extent.height),
  )
  const mapX = (x: number) => MAP_PAD + (x - extent.x) * scale
  const mapY = (y: number) => MAP_PAD + (y - extent.y) * scale

  useEffect(() => {
    const apply = () => {
      const viewport = viewportRectRef.current
      if (!viewport) return
      const { pan, zoom, viewportSize } = useCanvasStore.getState()
      const x = -pan.x / zoom
      const y = -pan.y / zoom
      viewport.setAttribute('x', String(MAP_PAD + (x - extent.x) * scale))
      viewport.setAttribute('y', String(MAP_PAD + (y - extent.y) * scale))
      viewport.setAttribute('width', String(Math.max(3, viewportSize.width / zoom * scale)))
      viewport.setAttribute('height', String(Math.max(3, viewportSize.height / zoom * scale)))
    }
    apply()
    const unsubscribeCanvas = useCanvasStore.subscribe(() => apply())
    return () => {
      unsubscribeCanvas()
    }
  }, [extent.x, extent.y, scale])

  const glideFromMap = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (clientX: number, clientY: number) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const worldX = extent.x + ((clientX - rect.left - MAP_PAD) / scale)
      const worldY = extent.y + ((clientY - rect.top - MAP_PAD) / scale)
      const { viewportSize, zoom } = useCanvasStore.getState()
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

  return (
    <div data-canvas-ui className="gp-canvas-ui-scale gp-minimap-shell gp-safe-canvas-bottom-left fixed z-30 flex items-end gap-2">
      {!expanded ? (
        <button
          type="button"
          aria-label="Open minimap"
          onClick={openMap}
          className="gp-touch-target gp-panel flex h-9 w-9 items-center justify-center rounded-xl border gp-hairline text-neutral-400 shadow-xl hover:text-white"
        ><Map size={14} /></button>
      ) : (
        <>
          <div className="gp-panel overflow-hidden rounded-2xl border gp-hairline shadow-2xl">
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
                ref={viewportRectRef}
                x="0"
                y="0"
                width="3"
                height="3"
                rx="2"
                fill="rgba(163,230,53,.05)"
                stroke="#a3e635"
                strokeWidth="1.2"
              />
            </svg>
          </div>
          <div className="gp-minimap-actions flex items-center">
            <button
              type="button"
              aria-label="Collapse minimap"
              title="Collapse minimap"
              onClick={closeMap}
              className="gp-touch-target flex h-9 w-9 items-center justify-center rounded-xl text-neutral-500 transition-colors hover:bg-white/5 hover:text-white"
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
