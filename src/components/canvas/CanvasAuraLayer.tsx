import { useEffect, useRef, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useThemeStore } from '../../store/useThemeStore'
import { useCanvasWidgetIds } from '../../hooks/useCanvasWidgets'
import { widgetDefinition } from '../../widgets/registry'
import { useSettingsStore } from '../../store/useSettingsStore'
import { isCameraMotionActive, subscribeCameraMotion } from '../../runtime/cameraMotionRuntime'

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
  const canvasWidgetIds = useCanvasWidgetIds(activeCanvasId)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const blobsRef = useRef(new Map<string, { opacity: number; widget: typeof widgets[string] }>())
  const theme = useThemeStore((state) => state.theme)
  const auraEnabled = useSettingsStore((state) => state.canvasAura && state.visualQuality !== 'economy')
  const auraIntensity = useSettingsStore((state) => state.auraIntensity)
  const visualQuality = useSettingsStore((state) => state.visualQuality)

  const visibleWidgets = useMemo(() => {
    const next: Array<typeof widgets[string]> = []
    for (const widgetId of canvasWidgetIds) {
      const widget = widgets[widgetId]
      if (widget?.canvasId === activeCanvasId) next.push(widget)
    }
    // Sort by area (largest first) so the most prominent widgets dictate the aura
    next.sort((a, b) => (b.size.width * b.size.height) - (a.size.width * a.size.height))
    return next.slice(0, visualQuality === 'full' ? AURA_MAX_WIDGETS : 6)
  }, [activeCanvasId, canvasWidgetIds, visualQuality, widgets])

  useEffect(() => {
    if (!auraEnabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId = 0
    let lastPanX = NaN
    let lastPanY = NaN
    let lastZoom = NaN
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const rootStyles = getComputedStyle(document.documentElement)
    const lightAlpha = parseFloat(rootStyles.getPropertyValue('--gp-light-aura-alpha').trim() || '0.55')
    const darkAlpha = parseFloat(rootStyles.getPropertyValue('--gp-dark-aura-alpha').trim() || '0.04')
    const baseAlpha = (theme === 'light' ? lightAlpha : darkAlpha) * (auraIntensity / 100)

    const scheduleDraw = () => {
      if (rafId || document.hidden || isCameraMotionActive()) return
      rafId = requestAnimationFrame(draw)
    }

    const draw = () => {
      rafId = 0
      if (document.hidden || isCameraMotionActive()) return

      // Fetch precise camera state
      const state = useCanvasStore.getState()
      const { pan, zoom, viewportSize } = state

      const currentBlobs = blobsRef.current
      let needsRedraw = false

      // Fast lookup for currently visible widgets
      const visibleIds = new Set(visibleWidgets.map(w => w.id))

      const fadeStep = reducedMotion.matches ? 1 : 0.08

      // 1. Fade out blobs that are no longer in the top visible set
      for (const [id, blob] of currentBlobs.entries()) {
        if (!visibleIds.has(id)) {
          blob.opacity -= fadeStep
          needsRedraw = true
          if (blob.opacity <= 0) {
            currentBlobs.delete(id)
          }
        }
      }

      // 2. Add or fade in newly visible widgets
      for (const widget of visibleWidgets) {
        let blob = currentBlobs.get(widget.id)
        if (!blob) {
          blob = { opacity: 0, widget }
          currentBlobs.set(widget.id, blob)
          needsRedraw = true
        } else {
          // Keep the widget reference updated in case its position/size changed
          blob.widget = widget
          if (blob.opacity < 1) {
            blob.opacity += fadeStep
            if (blob.opacity > 1) blob.opacity = 1
            needsRedraw = true
          }
        }
      }

      const cameraMoved = pan.x !== lastPanX || pan.y !== lastPanY || zoom !== lastZoom
      // Only draw if the camera moved or a blob is actively fading in/out.
      if (!cameraMoved && !needsRedraw) {
        return
      }

      lastPanX = pan.x
      lastPanY = pan.y
      lastZoom = zoom

      ctx.clearRect(0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION)

      ctx.globalCompositeOperation = 'source-over'
      // Massive blur diffuses the solid circles, perfectly solving the gradient dark square artifact
      ctx.filter = 'blur(16px)'

      for (const blob of currentBlobs.values()) {
        const widget = blob.widget

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
        const r = Math.max(normRadius * 2.2, CANVAS_RESOLUTION / 3)

        const accent = widget.metadata.accent ?? widgetDefinition(widget.type)?.accent ?? '#ffffff'

        ctx.globalAlpha = baseAlpha * blob.opacity

        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fillStyle = accent
        ctx.fill()
      }

      if (needsRedraw && !reducedMotion.matches) scheduleDraw()
    }

    const unsubscribeCamera = useCanvasStore.subscribe(scheduleDraw)
    const unsubscribeMotion = subscribeCameraMotion((active) => {
      if (!active) scheduleDraw()
    })
    const handleVisibility = () => scheduleDraw()
    document.addEventListener('visibilitychange', handleVisibility)
    reducedMotion.addEventListener('change', scheduleDraw)
    scheduleDraw()

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      unsubscribeCamera()
      unsubscribeMotion()
      document.removeEventListener('visibilitychange', handleVisibility)
      reducedMotion.removeEventListener('change', scheduleDraw)
    }
  }, [auraEnabled, auraIntensity, visibleWidgets, theme])

  // Do not unmount when visibleWidgets is empty, otherwise we can't play the fade-out animation
  // when the last widget leaves the screen.

  if (!auraEnabled) return null

  return (
    <canvas
      ref={canvasRef}
      data-canvas-aura-layer
      width={CANVAS_RESOLUTION}
      height={CANVAS_RESOLUTION}
      className="absolute inset-0 pointer-events-none z-0"
      style={{
        width: '100%',
        height: '100%',
        mixBlendMode: theme === 'light' ? 'multiply' : 'normal',
      }}
      aria-hidden
    />
  )
}
