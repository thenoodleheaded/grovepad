import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import type { GhostShapeDirection, GhostTreeConfig, GhostTreeNode } from '../../types/spatial'
import { GRID_SIZE } from '../../types/spatial'
import { widgetDefinition } from '../../widgets/registry'
import {
  GHOST_ICON_SIZE,
  ghostAccentDash,
  ghostNodeContourPath,
  ghostNodeGrid,
} from '../../utils/ghostTreePresentation'
import { AddWidgetModal } from '../ui/AddWidgetModal'

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
  const [pickerTarget, setPickerTarget] = useState<string[] | null>(null)
  // Lives in the store (not local state) so the canvas's shift-drag marquee
  // gesture — outside the React tree — can add ghost nodes to it too.
  const selectedNodeIds = useWidgetStore((state) => state.ghostSelectedNodeIds)
  const suppressPickerRef = useRef(false)

  useEffect(() => () => {
    if (exitTimer.current) clearTimeout(exitTimer.current)
  }, [])

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
  const pickerNodes = pickerTarget
    ? config.nodes.filter((node) => pickerTarget.includes(node.id))
    : []
  const pickerAnchor = pickerNodes[0]

  const begin = (node: GhostTreeNode) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    // Shift-click is a selection toggle, not a shaping drag.
    if (event.shiftKey) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    suppressPickerRef.current = false
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
      suppressPickerRef.current = true
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
          const parentGrid = ghostNodeGrid(parent.widgetTypes.length)
          const nodeGrid = ghostNodeGrid(node.widgetTypes.length)
          const parentX = parent.x + parentGrid.width / 2
          const parentY = parent.y + parentGrid.height
          const nodeX = node.x + nodeGrid.width / 2
          const colors = node.widgetTypes.length > 0
            ? node.widgetTypes.map((type) => widgetDefinition(type).accent)
            : ['#a855f7']
          const path = `M ${parentX} ${parentY} C ${parentX} ${parentY + 24}, ${nodeX} ${node.y - 24}, ${nodeX} ${node.y}`
          return (
            <g key={node.id}>
              {colors.map((color, index) => {
                const dash = ghostAccentDash(index, colors.length)
                return (
                  <path
                    key={`${node.id}:${index}`}
                    className={`gp-ghost-rope ${closing ? 'gp-ghost-rope--closing' : ''}`}
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    style={{ strokeDasharray: dash.dasharray, strokeDashoffset: dash.dashoffset }}
                  />
                )
              })}
            </g>
          )
        })}
      </svg>

      {renderedNodes.map((node) => {
        const closing = !liveIds.has(node.id) && exitingNodes.some((candidate) => candidate.id === node.id)
        const grid = ghostNodeGrid(node.widgetTypes.length)
        const colors = node.widgetTypes.length > 0
          ? node.widgetTypes.map((type) => widgetDefinition(type).accent)
          : ['#a855f7']
        return (
          <button
            key={node.id}
            type="button"
            title={node.widgetTypes.length > 0
              ? 'Edit widgets · shift-click to multi-select · drag up/down for children · left/right for siblings'
              : 'Choose widgets · shift-click to multi-select · drag up/down for children · left/right for siblings'}
            aria-label={node.widgetTypes.length > 0
              ? `Edit this tree bundle of ${node.widgetTypes.length} widgets`
              : 'Choose widgets for this tree point'}
            aria-pressed={selectedNodeIds.has(node.id)}
            onPointerDown={closing ? undefined : begin(node)}
            onClick={(event) => {
              if (closing || suppressPickerRef.current) {
                suppressPickerRef.current = false
                return
              }
              if (event.shiftKey) {
                useWidgetStore.getState().toggleGhostNodeSelected(node.id)
                return
              }
              if (selectedNodeIds.size > 1) {
                setPickerTarget([...selectedNodeIds])
                return
              }
              useWidgetStore.getState().clearGhostNodeSelection()
              setPickerTarget([node.id])
            }}
            className={`gp-ghost-cell ${closing ? 'gp-ghost-cell--closing pointer-events-none' : ''} ${selectedNodeIds.has(node.id) ? 'gp-ghost-cell--selected' : ''} absolute rounded-lg bg-black/25 shadow-[0_0_18px_rgb(0_0_0_/_0.28)] outline-none hover:bg-white/[0.055]`}
            style={{
              left: node.x,
              top: node.y,
              width: grid.width,
              height: grid.height,
              touchAction: 'none',
            }}
          >
            <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
              {colors.map((color, index) => {
                const dash = ghostAccentDash(index, colors.length)
                return (
                  <path
                    key={`${node.id}:outline:${index}`}
                    className="gp-ghost-outline"
                    d={ghostNodeContourPath(grid)}
                    fill="none"
                    stroke={color}
                    strokeWidth="2.35"
                    style={{ strokeDasharray: dash.dasharray, strokeDashoffset: dash.dashoffset }}
                  />
                )
              })}
            </svg>
            {node.widgetTypes.length === 0 ? (
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-violet-300 drop-shadow-[0_0_7px_rgba(168,85,247,.72)]"
              >
                <path d="M 12 5 V 19 M 5 12 H 19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              node.widgetTypes.map((type, index) => {
                const definition = widgetDefinition(type)
                const Icon = definition.icon
                const placement = grid.placements[index]!
                return (
                  <span
                    key={`${node.id}:icon:${type}`}
                    className="pointer-events-none absolute flex items-center justify-center rounded-[7px] bg-black/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,.055)]"
                    style={{
                      left: placement.x,
                      top: placement.y,
                      width: GHOST_ICON_SIZE,
                      height: GHOST_ICON_SIZE,
                      color: definition.accent,
                      background: `color-mix(in oklab, ${definition.accent}, transparent 86%)`,
                    }}
                    title={definition.label}
                  >
                    <Icon size={16} strokeWidth={1.9} aria-hidden />
                  </span>
                )
              })
            )}
          </button>
        )
      })}

      {pickerTarget && pickerAnchor && (
        <AddWidgetModal
          key={pickerTarget.join(',')}
          worldPos={{ x: pickerAnchor.x, y: pickerAnchor.y }}
          onClose={() => {
            setPickerTarget(null)
            useWidgetStore.getState().clearGhostNodeSelection()
          }}
          selection={{
            // A bulk edit spans nodes that may already differ, so it starts
            // blank and adds the chosen widgets rather than replacing.
            initialTypes: pickerTarget.length === 1 ? pickerAnchor.widgetTypes : [],
            onConfirm: (widgetTypes) => {
              if (pickerTarget.length === 1) {
                useWidgetStore.getState().setGhostNodeWidgetTypes(pickerTarget[0]!, widgetTypes)
              } else {
                useWidgetStore.getState().addWidgetTypesToGhostNodes(pickerTarget, widgetTypes)
              }
              setPickerTarget(null)
              useWidgetStore.getState().clearGhostNodeSelection()
            },
          }}
        />
      )}
    </div>
  )
}
