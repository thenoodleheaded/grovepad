import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWidgetStore } from '../store/useWidgetStore'
import { boundsForWidgets } from '../utils/widgetBounds'
import type { WorldRect } from '../utils/canvasView'

/** Slack around the widget hull so curve bow-out and floating name pills stay
 * inside the box (pills float ~60px above a card; curves bow less than that). */
const PADDING = 512
/** Bounds snap outward to this grid, so ordinary moves inside the hull leave
 * the rect byte-identical and React writes nothing to the SVG. */
const CHUNK = 512

function snapDown(value: number): number {
  return Math.floor(value / CHUNK) * CHUNK
}

function snapUp(value: number): number {
  return Math.ceil(value / CHUNK) * CHUNK
}

/**
 * World rect for the world-space SVG edge layers to anchor their box and
 * viewBox to.
 *
 * Deliberately derived from board content, NOT from the camera. These layers
 * already live inside the world element, so the camera transform alone moves
 * them; making the box follow the viewport instead meant every pan frame
 * rewrote `left/top/width/height` + `viewBox` — layout properties, so each
 * frame forced a reflow and full repaint of an SVG sized `viewport / zoom`.
 * At far zoom-out that box is many times the viewport, and repainting it every
 * frame starved the compositor (widgets and chrome visibly dropping out).
 *
 * Because the box carries `overflow: visible` and its viewBox matches its
 * border box 1:1, the mapping is the identity for any rect — so the rect only
 * has to *contain* the content, never track the view.
 */
export function useWorldContentRect(): WorldRect {
  const { widgets, activeCanvasId } = useWidgetStore(
    useShallow((state) => ({
      widgets: state.widgets,
      activeCanvasId: state.activeCanvasId,
    })),
  )

  return useMemo(() => {
    const onCanvas = Object.values(widgets).filter((w) => w.canvasId === activeCanvasId)
    const hull = boundsForWidgets(onCanvas)
    if (!hull) return { x: 0, y: 0, width: CHUNK, height: CHUNK }
    const x = snapDown(hull.x - PADDING)
    const y = snapDown(hull.y - PADDING)
    return {
      x,
      y,
      width: snapUp(hull.x + hull.width + PADDING) - x,
      height: snapUp(hull.y + hull.height + PADDING) - y,
    }
  }, [widgets, activeCanvasId])
}
