import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasWidgetIds } from '../../hooks/useCanvasWidgets'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { canvasAmbientPalette } from '../../utils/canvasAmbient'
import { viewportToWorldRect, type WorldRect } from '../../utils/canvasView'
import { widgetDefinition } from '../../widgets/registry'

const PALETTE_SAMPLE_DELAY_MS = 240
const CAMERA_IDLE_DELAY_MS = 180

function paletteKey(palette: readonly string[]): string {
  return palette.join('\u0000')
}

function layerStyle(palette: readonly string[]): CSSProperties {
  const accents = Array.from({ length: 5 }, (_, index) => palette[index] ?? 'transparent')
  return {
    '--gp-canvas-accent-1': accents[0],
    '--gp-canvas-accent-2': accents[1],
    '--gp-canvas-accent-3': accents[2],
    '--gp-canvas-accent-4': accents[3],
    '--gp-canvas-accent-5': accents[4],
  } as CSSProperties
}

interface AmbientLayers {
  active: 0 | 1
  palettes: [readonly string[], readonly string[]]
}

function cameraRect(): WorldRect {
  const { pan, zoom, viewportSize } = useCanvasStore.getState()
  return viewportToWorldRect(pan, zoom, viewportSize)
}

function sameRect(a: WorldRect, b: WorldRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

/** Camera movement stays completely outside React. One viewport snapshot is
 * published only after wheel, pan, pinch, or animated framing has settled. */
function useIdleCanvasRect(): WorldRect {
  const [rect, setRect] = useState(cameraRect)

  useEffect(() => {
    let latest = useCanvasStore.getState()
    let lastChangedAt = 0
    let timeoutId = 0

    const publishWhenIdle = () => {
      const remaining = CAMERA_IDLE_DELAY_MS - (Date.now() - lastChangedAt)
      if (remaining > 0) {
        timeoutId = window.setTimeout(publishWhenIdle, remaining)
        return
      }
      timeoutId = 0
      const next = viewportToWorldRect(latest.pan, latest.zoom, latest.viewportSize)
      setRect((current) => sameRect(current, next) ? current : next)
    }

    const unsubscribe = useCanvasStore.subscribe((state) => {
      if (
        state.pan === latest.pan &&
        state.zoom === latest.zoom &&
        state.viewportSize === latest.viewportSize
      ) {
        return
      }
      latest = state
      lastChangedAt = Date.now()
      if (timeoutId === 0) {
        timeoutId = window.setTimeout(publishWhenIdle, CAMERA_IDLE_DELAY_MS)
      }
    })

    return () => {
      unsubscribe()
      if (timeoutId !== 0) window.clearTimeout(timeoutId)
    }
  }, [])

  return rect
}

/** Viewport-fixed palette blooms. The world layer pans independently above it. */
export function CanvasAmbient() {
  const { activeCanvasId, workspaceTint } = useWidgetStore(
    useShallow((state) => ({
      activeCanvasId: state.activeCanvasId,
      workspaceTint: state.workspaces[state.activeWorkspaceId]?.tint ?? '#84cc16',
    })),
  )
  const widgetIds = useCanvasWidgetIds(activeCanvasId)
  const visibleRect = useIdleCanvasRect()

  const readPalette = useCallback(() => {
    const widgets = useWidgetStore.getState().widgets
    const visibleSources = []
    for (const widgetId of widgetIds) {
      const widget = widgets[widgetId]
      if (!widget || widget.canvasId !== activeCanvasId) continue
      visibleSources.push({
        position: widget.position,
        size: widget.size,
        accent: widget.metadata.accent ?? widgetDefinition(widget.type).accent,
      })
    }
    return canvasAmbientPalette(visibleSources, visibleRect, workspaceTint)
  }, [activeCanvasId, visibleRect, widgetIds, workspaceTint])

  const [palette, setPalette] = useState(readPalette)
  const updatePalette = useCallback(() => {
    const next = readPalette()
    setPalette((current) => paletteKey(current) === paletteKey(next) ? current : next)
  }, [readPalette])

  // The idle camera rect, canvas topology, and workspace tint update this once.
  // Ordinary widget traffic is coalesced below and ignored when unchanged.
  useEffect(updatePalette, [updatePalette])

  useEffect(() => {
    let timeoutId = 0
    let previousWidgets = useWidgetStore.getState().widgets
    const sampleWhenIdle = () => {
      if (document.body.hasAttribute('data-widget-dragging')) {
        timeoutId = window.setTimeout(sampleWhenIdle, PALETTE_SAMPLE_DELAY_MS)
        return
      }
      timeoutId = 0
      updatePalette()
    }

    const unsubscribe = useWidgetStore.subscribe((state) => {
      if (state.widgets === previousWidgets) return
      previousWidgets = state.widgets
      if (timeoutId !== 0) return
      timeoutId = window.setTimeout(sampleWhenIdle, PALETTE_SAMPLE_DELAY_MS)
    })

    return () => {
      unsubscribe()
      if (timeoutId !== 0) window.clearTimeout(timeoutId)
    }
  }, [updatePalette])

  const signature = paletteKey(palette)
  const [layers, setLayers] = useState<AmbientLayers>(() => ({
    active: 0,
    palettes: [palette, palette],
  }))

  useEffect(() => {
    setLayers((current) => {
      if (paletteKey(current.palettes[current.active]) === signature) return current
      const nextActive = current.active === 0 ? 1 : 0
      const palettes: AmbientLayers['palettes'] = [...current.palettes]
      palettes[nextActive] = palette
      return { active: nextActive, palettes }
    })
  }, [palette, signature])

  const styles = useMemo(
    () => [layerStyle(layers.palettes[0]), layerStyle(layers.palettes[1])],
    [layers.palettes],
  )

  return (
    <div
      aria-hidden="true"
      data-canvas-ambient
      data-accent-count={palette.length}
      className="gp-canvas-ambient"
    >
      {[0, 1].map((index) => (
        <div
          key={index}
          data-canvas-ambient-layer
          data-active={layers.active === index || undefined}
          data-accent-count={layers.palettes[index]!.length}
          className="gp-canvas-ambient-layer"
          style={styles[index]}
        />
      ))}
    </div>
  )
}
