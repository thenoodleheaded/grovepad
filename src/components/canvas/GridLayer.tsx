import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useCanvasStore, type CanvasState } from '../../store/useCanvasStore'
import { viewportToWorldRect, type WorldRect } from '../../utils/canvasView'

const FINE_SIZE = 40
const COARSE_SIZE = 200
const GRID_OVERSCAN_SCREEN = 640

const FINE_ZOOM_THRESHOLD = 20 / FINE_SIZE

function gradientBg(color: string): string {
  return (
    `linear-gradient(to right, ${color} 1px, transparent 1px), ` +
    `linear-gradient(to bottom, ${color} 1px, transparent 1px)`
  )
}

function dotBg(color: string): string {
  return `radial-gradient(circle at 1px 1px, ${color} 1.15px, transparent 1.25px)`
}

const SHARED_STYLE: CSSProperties = {
  position: 'absolute',
  pointerEvents: 'none',
  contain: 'layout paint style',
}

function applyRect(el: HTMLDivElement, rect: WorldRect): void {
  el.style.left = `${rect.x}px`
  el.style.top = `${rect.y}px`
  el.style.width = `${rect.width}px`
  el.style.height = `${rect.height}px`
  el.style.backgroundPosition = `${-rect.x}px ${-rect.y}px`
}

/**
 * Visible world rect snapped outward to the coarse grid period (which the
 * fine period divides). Snapping keeps grid alignment intact while making the
 * rect change only when the camera crosses a period boundary — so in-chunk
 * panning skips all style writes and repaints.
 */
function worldGridRect(state: CanvasState): WorldRect {
  const raw = viewportToWorldRect(state.pan, state.zoom, state.viewportSize, GRID_OVERSCAN_SCREEN)
  const x = Math.floor(raw.x / COARSE_SIZE) * COARSE_SIZE
  const y = Math.floor(raw.y / COARSE_SIZE) * COARSE_SIZE
  const right = Math.ceil((raw.x + raw.width) / COARSE_SIZE) * COARSE_SIZE
  const bottom = Math.ceil((raw.y + raw.height) / COARSE_SIZE) * COARSE_SIZE
  return { x, y, width: right - x, height: bottom - y }
}

function sameRect(a: WorldRect | null, b: WorldRect): boolean {
  return (
    a !== null &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  )
}

export function GridLayer() {
  const coarseRef = useRef<HTMLDivElement>(null)
  const fineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const coarse = coarseRef.current
    const fine = fineRef.current
    if (!coarse || !fine) return

    let latest = useCanvasStore.getState()
    let rafId = 0
    let appliedRect: WorldRect | null = null
    let appliedFineVisible: boolean | null = null

    const apply = () => {
      const rect = worldGridRect(latest)
      if (!sameRect(appliedRect, rect)) {
        appliedRect = rect
        applyRect(coarse, rect)
        applyRect(fine, rect)
      }
      const fineVisible = latest.zoom >= FINE_ZOOM_THRESHOLD
      if (fineVisible !== appliedFineVisible) {
        appliedFineVisible = fineVisible
        fine.style.opacity = fineVisible ? '1' : '0'
      }
    }

    apply()
    const unsubscribe = useCanvasStore.subscribe((state) => {
      if (
        state.pan === latest.pan &&
        state.zoom === latest.zoom &&
        state.viewportSize === latest.viewportSize
      ) {
        return
      }
      latest = state
      if (rafId !== 0) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        apply()
      })
    })

    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId)
      unsubscribe()
    }
  }, [])

  return (
    <>
      <div
        ref={coarseRef}
        aria-hidden
        style={{
          ...SHARED_STYLE,
          backgroundImage: gradientBg('var(--gp-grid-coarse)'),
          backgroundSize: `${COARSE_SIZE}px ${COARSE_SIZE}px`,
        }}
      />
      <div
        ref={fineRef}
        aria-hidden
        style={{
          ...SHARED_STYLE,
          backgroundImage: dotBg('var(--gp-grid-fine)'),
          backgroundSize: `${FINE_SIZE}px ${FINE_SIZE}px`,
          transition: 'opacity var(--gp-duration-snap) var(--gp-ease-snap)',
        }}
      />
    </>
  )
}
