import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import type { GhostShapeDirection, GhostTreeConfig, GhostTreeNode } from '../../types/spatial'
import { GHOST_CELL_HEIGHT, GHOST_CELL_WIDTH, GRID_SIZE } from '../../types/spatial'

const DIRECTION_LOCK_PX = 4
const NODE_STEP_WORLD = GRID_SIZE * 2
const EXIT_MS = 240

interface DragState {
  pointerId: number
  nodeId: string
  startX: number
  startY: number
  direction: GhostShapeDirection | null
  lastSignature: string
}

export function GhostTreeShaper() {
  const config = useWidgetStore((state) => state.ghostConfig)
  return config ? <ActiveGhostTree config={config} /> : null
}

/** Absolute-from-grab-point shaping: output depends only on travel distance,
 * never pointer event frequency, mouse acceleration, or polling rate. */
function ActiveGhostTree({ config }: { config: GhostTreeConfig }) {
  const dragRef = useRef<DragState | null>(null)
  const previousNodes = useRef(config.nodes)
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [exitingNodes, setExitingNodes] = useState<GhostTreeNode[]>([])

  useLayoutEffect(() => {
    const live = new Set(config.nodes.map((node) => node.id))
    const removed = previousNodes.current.filter((node) => !live.has(node.id))
    previousNodes.current = config.nodes
    if (removed.length === 0) return
    setExitingNodes((current) => {
      const merged = new Map(current.filter((node) => !live.has(node.id)).map((node) => [node.id, node]))
      for (const node of removed) merged.set(node.id, node)
      return [...merged.values()]
    })
    if (exitTimer.current) clearTimeout(exitTimer.current)
    exitTimer.current = setTimeout(() => setExitingNodes([]), EXIT_MS)
  }, [config.nodes])

  const liveIds = new Set(config.nodes.map((node) => node.id))
  const renderedNodes = [...exitingNodes.filter((node) => !liveIds.has(node.id)), ...config.nodes]
  const nodeById = new Map(renderedNodes.map((node) => [node.id, node]))

  const begin = (node: GhostTreeNode) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    useCanvasStore.getState().setIsPanning(false)
    useWidgetStore.getState().beginGhostGesture()
    dragRef.current = {
      pointerId: event.pointerId,
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      direction: null,
      lastSignature: '',
    }
  }

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      event.preventDefault()
      const zoom = Math.max(useCanvasStore.getState().zoom, 0.05)
      const screenDX = event.clientX - drag.startX
      const screenDY = event.clientY - drag.startY
      const maxTravel = Math.max(Math.abs(screenDX), Math.abs(screenDY))
      if (maxTravel < DIRECTION_LOCK_PX) {
        if (drag.lastSignature !== 'zero') {
          useWidgetStore.getState().shapeGhostTree(drag.nodeId, drag.direction ?? 'down', 0)
          drag.lastSignature = 'zero'
        }
        return
      }
      const direction: GhostShapeDirection = Math.abs(screenDX) > Math.abs(screenDY)
        ? (screenDX < 0 ? 'left' : 'right')
        : (screenDY < 0 ? 'up' : 'down')
      const worldTravel = (direction === 'left' || direction === 'right' ? Math.abs(screenDX) : Math.abs(screenDY)) / zoom
      const steps = Math.floor(worldTravel / NODE_STEP_WORLD)
      const signature = `${direction}:${steps}`
      if (signature === drag.lastSignature) return
      drag.direction = direction
      drag.lastSignature = signature
      useWidgetStore.getState().shapeGhostTree(drag.nodeId, direction, steps)
    }
    const end = (event: PointerEvent) => {
      if (dragRef.current?.pointerId !== event.pointerId) return
      dragRef.current = null
      useWidgetStore.getState().endGhostGesture()
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  return (
    <div data-ghost-tree className="absolute left-0 top-0">
      <svg aria-hidden className="absolute overflow-visible" style={{ pointerEvents: 'none' }}>
        {renderedNodes.filter((node) => node.parentId).map((node) => {
          const parent = node.parentId ? nodeById.get(node.parentId) : undefined
          if (!parent) return null
          const closing = !liveIds.has(node.id) && exitingNodes.some((candidate) => candidate.id === node.id)
          const parentX = parent.x + GHOST_CELL_WIDTH / 2
          const parentY = parent.y + GHOST_CELL_HEIGHT
          const nodeX = node.x + GHOST_CELL_WIDTH / 2
          return (
            <path
              key={node.id}
              className={`gp-ghost-rope ${closing ? 'gp-ghost-rope--closing' : ''}`}
              d={`M ${parentX} ${parentY} C ${parentX} ${parentY + 24}, ${nodeX} ${node.y - 24}, ${nodeX} ${node.y}`}
              fill="none"
              stroke="rgb(192 132 252)"
              strokeWidth={2}
            />
          )
        })}
      </svg>

      {renderedNodes.map((node) => {
        const closing = !liveIds.has(node.id) && exitingNodes.some((candidate) => candidate.id === node.id)
        return (
          <div
            key={node.id}
            role="slider"
            title="Drag up/down for children · left/right for siblings"
            aria-label="Tree point — drag vertically for children or horizontally for siblings"
            onPointerDown={closing ? undefined : begin(node)}
            className={`gp-ghost-cell ${closing ? 'gp-ghost-cell--closing pointer-events-none' : ''} absolute grid place-items-center rounded-lg bg-violet-400/[0.08] shadow-[0_0_0_1px_rgb(192_132_252_/_0.08),0_0_18px_rgb(168_85_247_/_0.22)] hover:bg-violet-400/15`}
            style={{ left: node.x, top: node.y, width: GHOST_CELL_WIDTH, height: GHOST_CELL_HEIGHT }}
          >
            <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
              <rect className="gp-ghost-outline" x="1" y="1" width={GHOST_CELL_WIDTH - 2} height={GHOST_CELL_HEIGHT - 2} rx="7" fill="none" stroke="rgb(196 181 253)" strokeWidth="2" />
            </svg>
            <span className="h-2.5 w-2.5 rounded-full border border-violet-200/70 bg-violet-300/20 shadow-[0_0_12px_rgb(216_180_254_/_0.65)]" aria-hidden />
          </div>
        )
      })}
    </div>
  )
}
