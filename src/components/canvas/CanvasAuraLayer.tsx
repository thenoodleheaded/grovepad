import { useEffect, useRef } from 'react'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useThemeStore } from '../../store/useThemeStore'
import { useWidgetRestStore } from '../../store/useWidgetRestStore'
import { useCanvasWidgetIds } from '../../hooks/useCanvasWidgets'
import { widgetDefinition } from '../../widgets/registry'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useAuraTuningStore } from '../../store/useAuraTuningStore'
import { auraBufferSize, auraScreenPool, resolveAccent } from './auraTuning'
import { widgetAccent } from '../../utils/widgetSkins'
import { widgetWithEffectiveSize } from '../../utils/widgetRest'
import type { Widget } from '../../types/spatial'

// Cache parsed color channels to avoid regex/string overhead
const colorChannelCache = new Map<string, string>()

function parseColorChannels(color: string): string {
  const cached = colorChannelCache.get(color)
  if (cached) return cached

  let channels = '180,200,220'
  const trimmed = color.trim()

  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1)
    if (hex.length === 3) {
      const r = parseInt(hex[0]! + hex[0]!, 16)
      const g = parseInt(hex[1]! + hex[1]!, 16)
      const b = parseInt(hex[2]! + hex[2]!, 16)
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) channels = `${r},${g},${b}`
    } else if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) channels = `${r},${g},${b}`
    }
  } else {
    const match = trimmed.match(/\d+/g)
    if (match && match.length >= 3) {
      channels = `${match[0]},${match[1]},${match[2]}`
    }
  }

  colorChannelCache.set(color, channels)
  return channels
}

/**
 * Ambient background aura layer rewritten from scratch.
 *
 * Designed to be extremely lightweight on CPU/GPU:
 * - Uses multi-stop radial gradients for smooth aura falloff without expensive canvas blur filters.
 * - Reactive rendering that remains completely dormant (0% CPU/GPU) when the canvas is static.
 * - Viewport culling and strict emitter caps for subtle visual ambiance.
 */
export function CanvasAuraLayer() {
  const activeCanvasId = useWidgetStore((state) => state.activeCanvasId)
  const widgetGlueIndex = useWidgetStore((state) => state.widgetGlueIndex)
  const canvasWidgetIds = useCanvasWidgetIds(activeCanvasId)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const theme = useThemeStore((state) => state.theme)
  const auraEnabled = useSettingsStore((state) => state.canvasAura)
  const tuningDoc = useAuraTuningStore((state) => state.doc)

  useEffect(() => {
    if (!auraEnabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let rafId = 0

    const render = () => {
      rafId = 0
      if (document.hidden) return

      const { pan, zoom, viewportSize } = useCanvasStore.getState()
      if (viewportSize.width <= 0 || viewportSize.height <= 0 || zoom <= 0) return

      const buffer = auraBufferSize(viewportSize.width, viewportSize.height)
      if (buffer.width <= 0 || buffer.height <= 0) return

      if (canvas.width !== buffer.width || canvas.height !== buffer.height) {
        canvas.width = buffer.width
        canvas.height = buffer.height
      }

      const tuning = tuningDoc.aura[theme]
      const widgetState = useWidgetStore.getState()
      const restState = useWidgetRestStore.getState()
      const restContext = {
        expandedWidgetId: restState.expandedWidgetId,
        expandedOffset: restState.expandedOffset,
      }

      const onScreen: Array<{ widget: Widget; screenArea: number; glued: boolean }> = []
      for (const id of canvasWidgetIds) {
        const stored = widgetState.widgets[id]
        if (!stored || stored.canvasId !== activeCanvasId) continue

        const widget = widgetWithEffectiveSize(stored, restContext)
        const screenW = widget.size.width * zoom
        const screenH = widget.size.height * zoom
        const screenX = widget.position.x * zoom + pan.x
        const screenY = widget.position.y * zoom + pan.y

        const pool = auraScreenPool(
          widget.size.width,
          widget.size.height,
          zoom,
          viewportSize.width,
          viewportSize.height,
          tuning,
        )

        // Spatial viewport culling with halo padding
        if (
          screenX + screenW + pool.halo < 0 ||
          screenX - pool.halo > viewportSize.width ||
          screenY + screenH + pool.halo < 0 ||
          screenY - pool.halo > viewportSize.height
        ) {
          continue
        }

        onScreen.push({
          widget,
          screenArea: screenW * screenH,
          glued: Boolean(widgetGlueIndex[widget.id]),
        })
      }

      onScreen.sort(
        (a, b) =>
          (Number(b.glued) - Number(a.glued)) ||
          (b.screenArea - a.screenArea) ||
          a.widget.id.localeCompare(b.widget.id),
      )

      const visible = onScreen.slice(0, tuning.maxEmitters).map((e) => e.widget)

      ctx.clearRect(0, 0, buffer.width, buffer.height)
      if (visible.length === 0) return

      ctx.globalCompositeOperation = tuning.blend
      ctx.filter = tuning.blur > 0 ? `blur(${tuning.blur}px)` : 'none'

      const scaleX = buffer.width / viewportSize.width
      const scaleY = buffer.height / viewportSize.height

      for (const widget of visible) {
        const screenCenterX = (widget.position.x + widget.size.width / 2) * zoom + pan.x
        const screenCenterY = (widget.position.y + widget.size.height / 2) * zoom + pan.y

        const pool = auraScreenPool(
          widget.size.width,
          widget.size.height,
          zoom,
          viewportSize.width,
          viewportSize.height,
          tuning,
        )

        const cx = screenCenterX * scaleX
        const cy = screenCenterY * scaleY
        const rx = pool.radiusX * scaleX
        const ry = pool.radiusY * scaleY

        if (rx <= 0 || ry <= 0) continue

        const definition = widgetDefinition(widget.type)
        const wornAccent = widgetAccent(widget, definition)
        const accent =
          widget.metadata.accent ?? resolveAccent(tuningDoc, theme, widget.type, wornAccent)
        const channels = parseColorChannels(accent)

        ctx.save()
        ctx.translate(cx, cy)
        ctx.scale(rx, ry)

        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
        const baseAlpha = tuning.alpha
        const coreAlpha = tuning.coreAlpha

        // Smooth multi-stop exponential decay for natural ambient softness
        grad.addColorStop(0, `rgba(${channels},${baseAlpha * coreAlpha})`)
        grad.addColorStop(0.25, `rgba(${channels},${baseAlpha * coreAlpha * 0.6})`)
        grad.addColorStop(0.55, `rgba(${channels},${baseAlpha * coreAlpha * 0.25})`)
        grad.addColorStop(0.80, `rgba(${channels},${baseAlpha * coreAlpha * 0.08})`)
        grad.addColorStop(1, `rgba(${channels},0)`)

        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(0, 0, 1, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }

    const scheduleRender = () => {
      if (rafId || document.hidden) return
      rafId = requestAnimationFrame(render)
    }

    const unsubCamera = useCanvasStore.subscribe(scheduleRender)
    const unsubWidgets = useWidgetStore.subscribe(scheduleRender)
    const unsubRest = useWidgetRestStore.subscribe(scheduleRender)

    const handleVisibility = () => {
      if (!document.hidden) scheduleRender()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    scheduleRender()

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      unsubCamera()
      unsubWidgets()
      unsubRest()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [
    activeCanvasId,
    auraEnabled,
    canvasWidgetIds,
    theme,
    tuningDoc,
    widgetGlueIndex,
  ])

  if (!auraEnabled) return null

  return (
    <canvas
      ref={canvasRef}
      data-canvas-aura-layer
      className="pointer-events-none absolute inset-0 z-0"
      style={{
        width: '100%',
        height: '100%',
        mixBlendMode: theme === 'light' ? 'multiply' : 'normal',
        opacity: theme === 'light' ? 0.6 : 0.85,
      }}
      aria-hidden
    />
  )
}
