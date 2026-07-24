import type { CSSProperties } from 'react'

const FINE_SIZE = 40
const GRID_PLANE_SIZE = 1_000_000
const GRID_PLANE_ORIGIN = -GRID_PLANE_SIZE / 2

function dotBg(color: string): string {
  return `radial-gradient(circle at 1px 1px, ${color} 1.15px, transparent 1.25px)`
}

const SHARED_STYLE: CSSProperties = {
  position: 'absolute',
  pointerEvents: 'none',
  contain: 'layout paint style',
}

export function GridLayer({ canvasIntensity = 100 }: { canvasIntensity?: number }) {
  return (
    <div
      aria-hidden
      style={{
        ...SHARED_STYLE,
        left: GRID_PLANE_ORIGIN,
        top: GRID_PLANE_ORIGIN,
        width: GRID_PLANE_SIZE,
        height: GRID_PLANE_SIZE,
        backgroundImage: dotBg('var(--gp-grid-fine)'),
        backgroundSize: `${FINE_SIZE}px ${FINE_SIZE}px`,
        opacity: `calc(var(--gp-grid-intensity) * ${canvasIntensity / 100})`,
      }}
    />
  )
}
