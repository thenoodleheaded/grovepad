import {
  memo,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import type { WorldRect } from '../../utils/canvasView'
import type { EdgeDetail } from './canvasEdgePolicy'

export type CanvasEdgeVariant = 'relation' | 'dependency' | 'wire'

export interface EdgePathStyle {
  stroke: string
  width: number
  opacity?: number
  dash?: string
  className?: string
  markerStart?: string
  markerEnd?: string
  pathLength?: number
}

interface EdgeHitArea {
  width: number
  cursor: CSSProperties['cursor']
  onPointerDown?: (event: PointerEvent<SVGPathElement>) => void
  onContextMenu?: (event: MouseEvent<SVGPathElement>) => void
}

interface CanvasEdgeProps {
  d: string
  variant: CanvasEdgeVariant
  detail?: EdgeDetail
  connected?: boolean
  resolved?: boolean
  warning?: boolean
  groupClassName?: string
  style?: CSSProperties
  highlight?: EdgePathStyle
  track?: EdgePathStyle
  halo?: EdgePathStyle
  main: EdgePathStyle
  flow?: EdgePathStyle
  hitArea?: EdgeHitArea
  children?: ReactNode
}

function EdgePath({
  d,
  layer,
  className,
}: {
  d: string
  layer: EdgePathStyle
  className: string
}) {
  return (
    <path
      className={`${className} gp-route-motion ${layer.className ?? ''}`}
      d={d}
      fill="none"
      stroke={layer.stroke}
      strokeWidth={layer.width}
      strokeOpacity={layer.opacity}
      strokeDasharray={layer.dash}
      strokeLinecap="round"
      markerStart={layer.markerStart}
      markerEnd={layer.markerEnd}
      pathLength={layer.pathLength}
      vectorEffect="non-scaling-stroke"
    />
  )
}

/** Shared SVG paint stack. Geometry and semantics stay with each caller. */
export const CanvasEdge = memo(function CanvasEdge({
  d,
  variant,
  detail = 'rich',
  connected = false,
  resolved = false,
  warning = false,
  groupClassName = '',
  style,
  highlight,
  track,
  halo,
  main,
  flow,
  hitArea,
  children,
}: CanvasEdgeProps) {
  return (
    <g
      className={`gp-canvas-edge gp-canvas-edge-${variant} ${groupClassName}`}
      data-edge-variant={variant}
      data-connected={connected || undefined}
      data-resolved={resolved || undefined}
      data-warning={warning || undefined}
      style={style}
    >
      {highlight && detail !== 'minimal' && (
        <EdgePath d={d} layer={highlight} className="gp-canvas-edge-highlight" />
      )}
      {track && detail !== 'minimal' && (
        <EdgePath d={d} layer={track} className="gp-canvas-edge-track" />
      )}
      {halo && (detail === 'rich' || connected) && (
        <EdgePath d={d} layer={halo} className="gp-canvas-edge-halo" />
      )}
      <EdgePath d={d} layer={main} className="gp-canvas-edge-main" />
      {flow && detail === 'rich' && (
        <EdgePath d={d} layer={flow} className="gp-canvas-edge-flow" />
      )}
      {children}
      {hitArea && detail !== 'minimal' && (
        <path
          className="gp-canvas-edge-hit gp-route-motion"
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={hitArea.width}
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'stroke', cursor: hitArea.cursor }}
          onPointerDown={hitArea.onPointerDown}
          onContextMenu={hitArea.onContextMenu}
        />
      )}
    </g>
  )
})

export function CanvasEdgeLayer({
  visibleRect,
  detail,
  className = '',
  dataCircuitLayer = false,
  defs,
  children,
}: {
  visibleRect: WorldRect
  detail: EdgeDetail
  className?: string
  dataCircuitLayer?: boolean
  defs?: ReactNode
  children: ReactNode
}) {
  return (
    <svg
      className={`absolute gp-canvas-edge-layer ${className}`}
      data-circuit-layer={dataCircuitLayer || undefined}
      style={{
        left: visibleRect.x,
        top: visibleRect.y,
        width: visibleRect.width,
        height: visibleRect.height,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
      viewBox={`${visibleRect.x} ${visibleRect.y} ${visibleRect.width} ${visibleRect.height}`}
      shapeRendering={detail === 'minimal' ? 'optimizeSpeed' : 'geometricPrecision'}
    >
      {defs && <defs>{defs}</defs>}
      {children}
    </svg>
  )
}
