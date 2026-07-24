import { useEffect, useRef, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useThemeStore } from '../../store/useThemeStore'
import { useCanvasWidgetIds } from '../../hooks/useCanvasWidgets'
import { widgetDefinition } from '../../widgets/registry'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useAuraTuningStore } from '../../store/useAuraTuningStore'
import { advanceAnchor, resolveAccent } from './auraTuning'
import { widgetAccent } from '../../utils/widgetSkins'
import type { Widget } from '../../types/spatial'

const CANVAS_RESOLUTION = 128

/** A light source, anchored in world space independently of the widget that spawned it. */
interface AuraBlob {
  opacity: number
  widget: Widget
  /** Where the light is currently painted, in world coordinates. */
  anchorX: number
  anchorY: number
  /** Where the widget actually is — the anchor only chases this once it settles. */
  targetX: number
  targetY: number
  /** Timestamp the target last changed, used to detect that a drag has ended. */
  targetChangedAt: number
}

/**
 * Normalizes any CSS colour an accent may use into `r,g,b` channels by round-tripping
 * it through the 2D context, which reports `fillStyle` back in a canonical form.
 */
function accentChannels(ctx: CanvasRenderingContext2D, color: string, cache: Map<string, string>) {
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
  const blobsRef = useRef(new Map<string, AuraBlob>())
  const theme = useThemeStore((state) => state.theme)
  const auraEnabled = useSettingsStore((state) => state.canvasAura)
  const tuningDoc = useAuraTuningStore((state) => state.doc)

  // Camera-independent: which widgets could emit at all. The choice of which ones
  // actually do is screen-space, so it is made per frame inside `draw` instead —
  // folding the camera in here would rebuild this memo (and restart the effect)
  // on every pan frame.
  const canvasWidgets = useMemo(() => {
    const next: Array<typeof widgets[string]> = []
    for (const widgetId of canvasWidgetIds) {
      const widget = widgets[widgetId]
      if (widget?.canvasId === activeCanvasId) next.push(widget)
    }
    return next
  }, [activeCanvasId, canvasWidgetIds, widgets])

  useEffect(() => {
    if (!auraEnabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId = 0
    const accentCache = new Map<string, string>()
    let lastPanX = NaN
    let lastPanY = NaN
    let lastZoom = NaN
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const tuning = tuningDoc.aura[theme]
    const minRadius = CANVAS_RESOLUTION * tuning.minRadius
    const maxRadius = CANVAS_RESOLUTION * tuning.maxRadius

    const scheduleDraw = () => {
      if (rafId || document.hidden) return
      rafId = requestAnimationFrame(draw)
    }

    const draw = () => {
      rafId = 0
      if (document.hidden) return

      // Fetch precise camera state
      const state = useCanvasStore.getState()
      const { pan, zoom, viewportSize } = state

      // Before the viewport is measured there is nothing to project into, and the
      // resulting non-finite coordinates would throw out of `createRadialGradient`.
      // Bail without clearing so the last good frame survives until a real size lands.
      if (!(viewportSize.width > 0) || !(viewportSize.height > 0) || !(zoom > 0)) return

      const currentBlobs = blobsRef.current
      const now = performance.now()
      let needsRedraw = false

      // Pick this frame's emitters in screen space: a widget only lights the board
      // when its own glow actually reaches the viewport, and the widgets that read
      // largest on screen right now are the ones that dominate.
      const onScreen: Array<{ widget: Widget; screenArea: number }> = []
      for (const widget of canvasWidgets) {
        const w = widget.size.width * zoom
        const h = widget.size.height * zoom
        const left = widget.position.x * zoom + pan.x
        const top = widget.position.y * zoom + pan.y
        const margin = Math.max(w, h) * tuning.reach * (1 + tuning.scatter)
        if (left + w + margin < 0 || left - margin > viewportSize.width) continue
        if (top + h + margin < 0 || top - margin > viewportSize.height) continue
        onScreen.push({ widget, screenArea: w * h })
      }
      onScreen.sort((a, b) =>
        (b.screenArea - a.screenArea) || a.widget.id.localeCompare(b.widget.id),
      )
      const visibleWidgets = onScreen.slice(0, tuning.maxEmitters).map((entry) => entry.widget)

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
        const centreX = widget.position.x + widget.size.width / 2
        const centreY = widget.position.y + widget.size.height / 2
        let blob = currentBlobs.get(widget.id)
        if (!blob) {
          // A brand-new light starts already anchored, so it fades up in place
          // instead of sliding in from wherever the previous frame left it.
          blob = {
            opacity: 0,
            widget,
            anchorX: centreX,
            anchorY: centreY,
            targetX: centreX,
            targetY: centreY,
            targetChangedAt: now,
          }
          currentBlobs.set(widget.id, blob)
          needsRedraw = true
        } else {
          // Keep the widget reference updated in case its position/size changed
          blob.widget = widget
          if (centreX !== blob.targetX || centreY !== blob.targetY) {
            blob.targetX = centreX
            blob.targetY = centreY
            // Every frame of a drag pushes this forward, so the settle window can
            // only elapse once the widget has actually come to rest.
            blob.targetChangedAt = now
          }
          if (blob.opacity < 1) {
            blob.opacity += fadeStep
            if (blob.opacity > 1) blob.opacity = 1
            needsRedraw = true
          }
        }
      }

      // 3. Once a widget has held still, glide its light over to the new spot.
      // While it is still moving the anchor stays put, so dragging a card does not
      // drag a smear of colour across the board with it.
      for (const blob of currentBlobs.values()) {
        if (advanceAnchor(blob, now, tuning.settleMs, tuning.glide, reducedMotion.matches)) {
          needsRedraw = true
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

      // Light mode paints through `multiply`, where additive light would be wrong.
      // Dark mode adds, so two neighbouring accents mix like real light instead of
      // the later blob flatly overpainting the earlier one.
      ctx.globalCompositeOperation = tuning.blend
      // A light touch of blur only fuses gradient banding; the falloff below is what
      // actually keeps each blob soft, so the blur must not smear colours across the board.
      ctx.filter = tuning.blur > 0 ? `blur(${tuning.blur}px)` : 'none'

      for (const blob of currentBlobs.values()) {
        const widget = blob.widget

        // The light emits from the anchor, which trails the widget's own centre
        // whenever it is on the move.
        const cx = blob.anchorX
        const cy = blob.anchorY

        // Project to screen space
        const screenX = cx * zoom + pan.x
        const screenY = cy * zoom + pan.y

        // Normalize to [0, 1] relative to viewport
        const normX = screenX / viewportSize.width
        const normY = screenY / viewportSize.height

        // Convert to local 128x128 resolution canvas coordinates
        const px = normX * CANVAS_RESOLUTION
        const py = normY * CANVAS_RESOLUTION

        // Radius scales with zoom so the light sources naturally change size, but is
        // clamped: an unbounded blob would cover the whole canvas and every accent
        // would average into a single flat wash. `scatter` extends the faint tail
        // past `reach` without brightening the pool itself.
        const radiusBase = Math.max(widget.size.width, widget.size.height)
        const screenRadius = radiusBase * zoom * tuning.reach * (1 + tuning.scatter)
        const normRadius = (screenRadius / viewportSize.width) * CANVAS_RESOLUTION
        const r = Math.min(Math.max(normRadius, minRadius), maxRadius)

        // The colour the card itself wears, skin included — a Tracker's type accent
        // is one green for every skin, so reading the registry directly would light
        // a Pomodoro, a Countdown and a price book identically.
        const definition = widgetDefinition(widget.type)
        const wornAccent = widgetAccent(widget, definition)
        // A tuning override replaces the type's colour, but a hand-picked per-widget
        // accent still wins — it is the most specific choice anyone made.
        const accent =
          widget.metadata.accent ?? resolveAccent(tuningDoc, theme, widget.type, wornAccent)
        const channels = accentChannels(ctx, accent, accentCache)

        // Radial falloff keeps each widget's colour anchored over that widget rather
        // than tinting the entire board. The centre is deliberately dimmer than the
        // ring at `midStop`, so the light reads as a pool around the widget instead
        // of a hotspot sitting directly under it.
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, r)
        gradient.addColorStop(0, `rgba(${channels},${tuning.coreAlpha})`)
        gradient.addColorStop(tuning.midStop, `rgba(${channels},${tuning.midAlpha})`)
        gradient.addColorStop(1, `rgba(${channels},0)`)

        ctx.globalAlpha = tuning.alpha * blob.opacity

        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()
      }

      if (needsRedraw && !reducedMotion.matches) scheduleDraw()
    }

    const unsubscribeCamera = useCanvasStore.subscribe(scheduleDraw)
    const handleVisibility = () => scheduleDraw()
    document.addEventListener('visibilitychange', handleVisibility)
    reducedMotion.addEventListener('change', scheduleDraw)
    scheduleDraw()

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      unsubscribeCamera()
      document.removeEventListener('visibilitychange', handleVisibility)
      reducedMotion.removeEventListener('change', scheduleDraw)
    }
  }, [auraEnabled, canvasWidgets, theme, tuningDoc])

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
