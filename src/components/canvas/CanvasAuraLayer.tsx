import { useEffect, useRef } from 'react'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useThemeStore } from '../../store/useThemeStore'
import { useWidgetRestStore } from '../../store/useWidgetRestStore'
import { useCanvasWidgetIds } from '../../hooks/useCanvasWidgets'
import { widgetDefinition } from '../../widgets/registry'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useAuraTuningStore } from '../../store/useAuraTuningStore'
import {
  auraBufferSize,
  auraScreenPool,
  resolveAccent,
} from './auraTuning'
import { widgetAccent } from '../../utils/widgetSkins'
import { widgetWithEffectiveSize } from '../../utils/widgetRest'
import type { Widget } from '../../types/spatial'

interface AuraBlob {
  opacity: number
  /** The widget with its current visible footprint substituted in. */
  widget: Widget
}

/**
 * Normalizes any CSS colour an accent may use into `r,g,b` channels by
 * round-tripping it through the 2D context.
 */
function accentChannels(
  ctx: CanvasRenderingContext2D,
  color: string,
  cache: Map<string, string>,
): string {
  const cached = cache.get(color)
  if (cached) return cached
  const previous = ctx.fillStyle
  ctx.fillStyle = color
  const normalized = ctx.fillStyle
  ctx.fillStyle = previous
  let channels = '255,255,255'
  if (typeof normalized === 'string') {
    if (normalized.startsWith('#') && normalized.length === 7) {
      channels = `${parseInt(normalized.slice(1, 3), 16)},${parseInt(normalized.slice(3, 5), 16)},${parseInt(normalized.slice(5, 7), 16)}`
    } else {
      const parts = normalized.match(/[\d.]+/g)
      if (parts && parts.length >= 3) channels = `${parts[0]},${parts[1]},${parts[2]}`
    }
  }
  cache.set(color, channels)
  return channels
}

/**
 * Ambient screen-space lighting for visible widgets.
 *
 * The buffer keeps the viewport's aspect ratio, each pool uses the widget's
 * actual resting/expanded footprint, and the halo depth is mostly screen-space
 * stable. The light therefore stays attached during drag and keeps the same
 * softness through zoom instead of stretching a square texture over the board.
 */
export function CanvasAuraLayer() {
  const activeCanvasId = useWidgetStore((state) => state.activeCanvasId)
  const widgetGlueIndex = useWidgetStore((state) => state.widgetGlueIndex)
  const canvasWidgetIds = useCanvasWidgetIds(activeCanvasId)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const blobsRef = useRef(new Map<string, AuraBlob>())
  const theme = useThemeStore((state) => state.theme)
  const auraEnabled = useSettingsStore((state) => state.canvasAura)
  const tuningDoc = useAuraTuningStore((state) => state.doc)

  useEffect(() => {
    if (!auraEnabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId = 0
    const accentCache = new Map<string, string>()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const tuning = tuningDoc.aura[theme]

    const scheduleDraw = () => {
      if (rafId || document.hidden) return
      rafId = requestAnimationFrame(draw)
    }

    const draw = () => {
      rafId = 0
      if (document.hidden) return

      const camera = useCanvasStore.getState()
      const { pan, zoom, viewportSize } = camera
      if (!(viewportSize.width > 0) || !(viewportSize.height > 0) || !(zoom > 0)) return

      const buffer = auraBufferSize(viewportSize.width, viewportSize.height)
      if (!(buffer.width > 0) || !(buffer.height > 0)) return
      if (canvas.width !== buffer.width || canvas.height !== buffer.height) {
        canvas.width = buffer.width
        canvas.height = buffer.height
      }

      const widgetState = useWidgetStore.getState()
      const restState = useWidgetRestStore.getState()
      const restContext = {
        expandedWidgetId: restState.expandedWidgetId,
        expandedOffset: restState.expandedOffset,
      }
      const onScreen: Array<{ widget: Widget; screenArea: number; glued: boolean }> = []

      for (const widgetId of canvasWidgetIds) {
        const stored = widgetState.widgets[widgetId]
        if (!stored || stored.canvasId !== activeCanvasId) continue
        const widget = widgetWithEffectiveSize(stored, restContext)
        const screenWidth = widget.size.width * zoom
        const screenHeight = widget.size.height * zoom
        const left = widget.position.x * zoom + pan.x
        const top = widget.position.y * zoom + pan.y
        const pool = auraScreenPool(
          widget.size.width,
          widget.size.height,
          zoom,
          viewportSize.width,
          viewportSize.height,
          tuning,
        )
        if (left + screenWidth + pool.halo < 0 || left - pool.halo > viewportSize.width) continue
        if (top + screenHeight + pool.halo < 0 || top - pool.halo > viewportSize.height) continue
        onScreen.push({
          widget,
          screenArea: screenWidth * screenHeight,
          glued: Boolean(widgetGlueIndex[widget.id]),
        })
      }

      onScreen.sort((a, b) =>
        (Number(b.glued) - Number(a.glued)) ||
        (b.screenArea - a.screenArea) ||
        a.widget.id.localeCompare(b.widget.id),
      )
      const visibleWidgets = onScreen
        .slice(0, tuning.maxEmitters)
        .map((entry) => entry.widget)
      const visibleIds = new Set(visibleWidgets.map((widget) => widget.id))
      const currentBlobs = blobsRef.current
      const fadeStep = reducedMotion.matches ? 1 : 0.1
      let needsAnimation = false

      for (const [id, blob] of currentBlobs) {
        if (visibleIds.has(id)) continue
        blob.opacity -= fadeStep
        if (blob.opacity <= 0) currentBlobs.delete(id)
        else needsAnimation = true
      }

      for (const widget of visibleWidgets) {
        const blob = currentBlobs.get(widget.id)
        if (!blob) {
          currentBlobs.set(widget.id, {
            opacity: reducedMotion.matches ? 1 : fadeStep,
            widget,
          })
          needsAnimation = !reducedMotion.matches
          continue
        }
        blob.widget = widget
        if (blob.opacity < 1) {
          blob.opacity = Math.min(1, blob.opacity + fadeStep)
          needsAnimation = blob.opacity < 1 || needsAnimation
        }
      }

      ctx.clearRect(0, 0, buffer.width, buffer.height)
      ctx.globalCompositeOperation = tuning.blend
      ctx.filter = tuning.blur > 0 ? `blur(${tuning.blur}px)` : 'none'

      const bufferScaleX = buffer.width / viewportSize.width
      const bufferScaleY = buffer.height / viewportSize.height

      for (const blob of currentBlobs.values()) {
        const widget = blob.widget
        const screenX = (widget.position.x + widget.size.width / 2) * zoom + pan.x
        const screenY = (widget.position.y + widget.size.height / 2) * zoom + pan.y
        const pool = auraScreenPool(
          widget.size.width,
          widget.size.height,
          zoom,
          viewportSize.width,
          viewportSize.height,
          tuning,
        )
        const px = screenX * bufferScaleX
        const py = screenY * bufferScaleY
        const radiusX = pool.radiusX * bufferScaleX
        const radiusY = pool.radiusY * bufferScaleY
        if (!(radiusX > 0) || !(radiusY > 0)) continue

        const definition = widgetDefinition(widget.type)
        const wornAccent = widgetAccent(widget, definition)
        const accent =
          widget.metadata.accent ?? resolveAccent(tuningDoc, theme, widget.type, wornAccent)
        const channels = accentChannels(ctx, accent, accentCache)

        ctx.save()
        ctx.translate(px, py)
        ctx.scale(radiusX, radiusY)
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
        gradient.addColorStop(0, `rgba(${channels},${tuning.coreAlpha})`)
        gradient.addColorStop(0.28, `rgba(${channels},${tuning.coreAlpha * 0.72})`)
        gradient.addColorStop(0.62, `rgba(${channels},${tuning.coreAlpha * 0.28})`)
        gradient.addColorStop(0.84, `rgba(${channels},${tuning.coreAlpha * 0.08})`)
        gradient.addColorStop(1, `rgba(${channels},0)`)
        ctx.globalAlpha = tuning.alpha * blob.opacity
        ctx.beginPath()
        ctx.arc(0, 0, 1, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()
        ctx.restore()
      }

      if (needsAnimation && !reducedMotion.matches) scheduleDraw()
    }

    const unsubscribeCamera = useCanvasStore.subscribe(scheduleDraw)
    const unsubscribeWidgets = useWidgetStore.subscribe(scheduleDraw)
    const unsubscribeRest = useWidgetRestStore.subscribe(scheduleDraw)
    const handleVisibility = () => scheduleDraw()
    document.addEventListener('visibilitychange', handleVisibility)
    reducedMotion.addEventListener('change', scheduleDraw)
    scheduleDraw()

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      unsubscribeCamera()
      unsubscribeWidgets()
      unsubscribeRest()
      document.removeEventListener('visibilitychange', handleVisibility)
      reducedMotion.removeEventListener('change', scheduleDraw)
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
      }}
      aria-hidden
    />
  )
}
