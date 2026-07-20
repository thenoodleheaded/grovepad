import type { CSSProperties } from 'react'

const FINE_SIZE = 40
const COARSE_SIZE = 200
const GRID_PLANE_SIZE = 1_000_000
const GRID_PLANE_ORIGIN = -GRID_PLANE_SIZE / 2

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

export function GridLayer() {
  return (
    <>
      <div
        aria-hidden
        style={{
          ...SHARED_STYLE,
          left: GRID_PLANE_ORIGIN,
          top: GRID_PLANE_ORIGIN,
          width: GRID_PLANE_SIZE,
          height: GRID_PLANE_SIZE,
          backgroundImage: gradientBg('var(--gp-grid-coarse)'),
          backgroundSize: `${COARSE_SIZE}px ${COARSE_SIZE}px`,
          opacity: 'var(--gp-grid-intensity)',
        }}
      />
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
          opacity: 'var(--gp-grid-intensity)',
        }}
      />
    </>
  )
}
