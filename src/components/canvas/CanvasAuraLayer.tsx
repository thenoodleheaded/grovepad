import { useEffect, useRef, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useCanvasStore } from '../../store/useCanvasStore'
import { widgetIntersectsRect } from '../../utils/canvasView'
import { useQuantizedView } from '../../hooks/useQuantizedView'
import { useCanvasWidgetIds } from '../../hooks/useCanvasWidgets'
import { widgetDefinition } from '../../widgets/registry'

const OVERSCAN_SCREEN = 420
const AURA_MAX_WIDGETS = 8
const CANVAS_RESOLUTION = 128

/**
 * Renders a highly efficient, hardware-accelerated ambient background glow
 * based on the most prominent widgets currently visible on screen.
 * It uses a tiny offscreen `<canvas>` that natively stretches over the viewport,
 * avoiding expensive CSS blurs or DOM thrashing during panning.
 */
export function CanvasAuraLayer() {
  const { widgets, activeCanvasId } = useWidgetStore(
    useShallow((state) => ({
      widgets: state.widgets,
      activeCanvasId: state.activeCanvasId,
    })),
  )
  const view = useQuantizedView(OVERSCAN_SCREEN)
  const canvasWidgetIds = useCanvasWidgetIds(activeCanvasId)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const visibleWidgets = useMemo(() => {
    const next: Array<typeof widgets[string]> = []
    for (const widgetId of canvasWidgetIds) {
      const widget = widgets[widgetId]
      if (!widget || widget.canvasId !== activeCanvasId) continue
      if (widgetIntersectsRect(widget, view.rect)) {
        next.push(widget)
      }
    }
    // Sort by area (largest first) so the most prominent widgets dictate the aura
    next.sort((a, b) => (b.size.width * b.size.height) - (a.size.width * a.size.height))
    return next.slice(0, AURA_MAX_WIDGETS)
  }, [activeCanvasId, canvasWidgetIds, view.rect, widgets])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId = 0
    let lastPanX = NaN
    let lastPanY = NaN
    let lastZoom = NaN

    const draw = () => {
      // Re-queue the loop
      rafId = requestAnimationFrame(draw)

      // Fetch precise camera state
      const state = useCanvasStore.getState()
      const { pan, zoom, viewportSize } = state
      
      // Only draw if camera moved (or if first render in this effect)
      if (pan.x === lastPanX && pan.y === lastPanY && zoom === lastZoom) {
        return
      }

      lastPanX = pan.x
      lastPanY = pan.y
      lastZoom = zoom

      ctx.clearRect(0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION)
      
      ctx.globalCompositeOperation = 'screen'
      ctx.globalAlpha = 0.08
      
      // Massive blur diffuses the solid circles, perfectly solving the gradient dark square artifact
      ctx.filter = 'blur(16px)'
      
      for (const widget of visibleWidgets) {
        // Find center of widget in world space
        const cx = widget.position.x + widget.size.width / 2
        const cy = widget.position.y + widget.size.height / 2
        
        // Project to screen space
        const screenX = cx * zoom + pan.x
        const screenY = cy * zoom + pan.y
        
        // Normalize to [0, 1] relative to viewport
        const normX = screenX / viewportSize.width
        const normY = screenY / viewportSize.height
        
        // Convert to local 128x128 resolution canvas coordinates
        const px = normX * CANVAS_RESOLUTION
        const py = normY * CANVAS_RESOLUTION
        
        // Radius scales with zoom so the light sources naturally change size
        const radiusBase = Math.max(widget.size.width, widget.size.height)
        const screenRadius = radiusBase * zoom
        const normRadius = (screenRadius / viewportSize.width) * CANVAS_RESOLUTION
        const r = Math.max(normRadius * 1.5, CANVAS_RESOLUTION / 4)
        
        const accent = widget.metadata.accent ?? widgetDefinition(widget.type)?.accent ?? '#ffffff'
        
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fillStyle = accent
        ctx.fill()
      }
    }
    
    rafId = requestAnimationFrame(draw)
    
    return () => cancelAnimationFrame(rafId)
  }, [visibleWidgets])

  if (visibleWidgets.length === 0) return null

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_RESOLUTION}
      height={CANVAS_RESOLUTION}
      className="absolute inset-0 pointer-events-none z-0"
      style={{
        width: '100%',
        height: '100%',
      }}
      aria-hidden
    />
  )
}
