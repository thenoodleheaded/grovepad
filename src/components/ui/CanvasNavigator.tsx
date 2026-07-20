import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Map, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useAdaptiveInputStore } from '../../store/useAdaptiveInputStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { isMinimapExpanded } from '../../utils/adaptiveChrome'
import { boundsForWidgets } from '../../utils/widgetBounds'
import {
  isCameraMotionActive,
  subscribeCameraMotion,
} from '../../runtime/cameraMotionRuntime'

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
  const [phoneExpanded, setPhoneExpanded] = useState(false)
  const viewportClass = useAdaptiveInputStore((state) => state.capabilities.viewportClass)
  const expanded = isMinimapExpanded(viewportClass, collapsed, phoneExpanded)
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
    if (viewportClass === 'phone') setPhoneExpanded(false)
  }, [viewportClass])

  const openMap = () => {
    if (viewportClass === 'phone') {
      setPhoneExpanded(true)
      return
    }
    setCollapsed(false)
    localStorage.setItem('grovepad:minimap', 'open')
  }

  const closeMap = () => {
    if (viewportClass === 'phone') {
      setPhoneExpanded(false)
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
    const apply = (force = false) => {
      if (!force && isCameraMotionActive()) return
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
    apply(true)
    const unsubscribeCanvas = useCanvasStore.subscribe(() => apply())
    const unsubscribeMotion = subscribeCameraMotion((active) => {
      if (!active) apply(true)
    })
    return () => {
      unsubscribeCanvas()
      unsubscribeMotion()
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
    <div data-canvas-ui className="gp-safe-canvas-bottom-left gp-panel fixed z-30 overflow-hidden rounded-2xl border gp-hairline shadow-2xl">
        {!expanded ? (
          <button
            type="button"
            aria-label="Open minimap"
            onClick={openMap}
            className="gp-touch-target flex h-9 w-9 items-center justify-center text-neutral-400 hover:text-white"
          ><Map size={14} /></button>
        ) : (
          <>
            <div className="flex h-7 items-center justify-between border-b gp-hairline px-2 text-[9px] font-semibold uppercase tracking-widest text-neutral-500">
              Board map
              <button type="button" aria-label="Collapse minimap" onClick={closeMap} className="gp-touch-target -mr-2 flex items-center justify-center hover:text-white"><X size={12} /></button>
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
          </>
        )}
    </div>
  )
}
