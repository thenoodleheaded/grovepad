import {
  memo,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import type { WorldRect } from '../../utils/canvasView'

type CanvasEdgeVariant = 'relation' | 'dependency' | 'wire'

interface EdgePathStyle {
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
      {highlight && (
        <EdgePath d={d} layer={highlight} className="gp-canvas-edge-highlight" />
      )}
      {track && (
        <EdgePath d={d} layer={track} className="gp-canvas-edge-track" />
      )}
      {halo && (
        <EdgePath d={d} layer={halo} className="gp-canvas-edge-halo" />
      )}
      <EdgePath d={d} layer={main} className="gp-canvas-edge-main" />
      {flow && (
        <EdgePath d={d} layer={flow} className="gp-canvas-edge-flow" />
      )}
      {children}
      {hitArea && (
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
  contentRect,
  className = '',
  dataCircuitLayer = false,
  ariaHidden = false,
  defs,
  children,
}: {
  /** A world rect that merely has to *contain* the edges — never the visible
   * viewport. The layer already sits inside the camera-transformed world
   * element, so tying this to the view made every pan frame rewrite
   * layout properties and repaint the whole (viewport / zoom)-sized box. */
  contentRect: WorldRect
  className?: string
  dataCircuitLayer?: boolean
  /** Purely decorative routing (relations, dependencies) sets this so screen
   * readers skip the unlabeled path nodes; the relationship itself is conveyed
   * through widget content and the canvas tree outline. */
  ariaHidden?: boolean
  defs?: ReactNode
  children: ReactNode
}) {
  return (
    <svg
      className={`absolute gp-canvas-edge-layer ${className}`}
      data-circuit-layer={dataCircuitLayer || undefined}
      aria-hidden={ariaHidden || undefined}
      style={{
        left: contentRect.x,
        top: contentRect.y,
        width: contentRect.width,
        height: contentRect.height,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
      viewBox={`${contentRect.x} ${contentRect.y} ${contentRect.width} ${contentRect.height}`}
      shapeRendering="geometricPrecision"
    >
      {defs && <defs>{defs}</defs>}
      {children}
    </svg>
  )
}
