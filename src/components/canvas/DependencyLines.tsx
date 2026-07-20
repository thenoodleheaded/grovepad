import { memo, useCallback, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useQuantizedView } from '../../hooks/useQuantizedView'
import { getCriticalPath, useWidgetStore } from '../../store/useWidgetStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import type { RelationType, Vector2D, Widget } from '../../types/spatial'
import { RELATION_LABELS } from '../../types/spatial'
import { widgetIntersectsRect } from '../../utils/canvasView'
import { anchoredCurveMidpoint, anchoredCurvePath } from '../../utils/curve'
import { dependencyAnchors } from '../../utils/dependencyGeometry'
import { groupWorldBounds } from '../../utils/groupGeometry'
import {
  CanvasEdge,
  CanvasEdgeLayer,
} from './CanvasEdge'
import { edgeCorridorIntersectsRect, edgeDetailFor, type EdgeDetail } from './canvasEdgePolicy'

const EDGE_OVERSCAN_SCREEN = 700
const EDGE_RENDER_LIMIT = 950
const CRITICAL_EDGE_RENDER_LIMIT = 1600
const CORRIDOR_MARGIN = 360
const DEPENDENCY_STROKE = '#f59e0b'
const RESOLVED_STROKE = '#64748b'

interface EndpointGeometry {
  center: Vector2D
  halfW: number
  halfH: number
}

interface DependencyEdgeDescriptor {
  id: string
  d: string
  mid: Vector2D
  start: Vector2D
  end: Vector2D
  isResolved: boolean
  highlighted: boolean
  connected: boolean
  showStatusChip: boolean
}

function widgetCenter(widget: Widget): Vector2D {
  return {
    x: widget.position.x + widget.size.width / 2,
    y: widget.position.y + widget.size.height / 2,
  }
}

const DependencyEdge = memo(function DependencyEdge({
  edge,
  detail,
  onOpenMenu,
}: {
  edge: DependencyEdgeDescriptor
  detail: EdgeDetail
  onOpenMenu: (relationId: string, x: number, y: number) => void
}) {
  const stroke = edge.isResolved ? RESOLVED_STROKE : DEPENDENCY_STROKE
  const marker = edge.isResolved ? 'url(#dependency-arrow-resolved)' : 'url(#dependency-arrow)'

  return (
    <CanvasEdge
      d={edge.d}
      variant="dependency"
      detail={detail}
      connected={edge.connected}
      resolved={edge.isResolved}
      style={{ '--gp-edge-accent': DEPENDENCY_STROKE } as CSSProperties}
      highlight={edge.highlighted ? { stroke: '#34d399', width: 7, opacity: 0.38 } : undefined}
      track={{ stroke, width: 6 }}
      halo={{ stroke, width: 8 }}
      main={{
        stroke,
        width: edge.isResolved ? 1.5 : 2.2,
        dash: edge.isResolved ? '4 6' : undefined,
        markerEnd: marker,
      }}
      flow={{
        stroke: DEPENDENCY_STROKE,
        width: 2.2,
        dash: '2 6',
        markerEnd: marker,
      }}
      hitArea={{
        width: 16,
        cursor: 'context-menu',
        onContextMenu: (event) => {
          event.preventDefault()
          event.stopPropagation()
          onOpenMenu(edge.id, event.clientX, event.clientY)
        },
      }}
    >
      {detail !== 'minimal' && (
        <>
          <circle
            className="gp-dependency-port"
            cx={edge.start.x}
            cy={edge.start.y}
            r={4}
            fill="#171717"
            stroke={stroke}
            strokeWidth={1.6}
            vectorEffect="non-scaling-stroke"
          />
          {edge.showStatusChip && (
            <g className="gp-route-chip-motion" transform={`translate(${edge.mid.x}, ${edge.mid.y})`}>
              <circle r={8} fill="#111827" stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={9}
                fontWeight={800}
                fill={stroke}
              >
                {edge.isResolved ? '✓' : '!'}
              </text>
            </g>
          )}
        </>
      )}
    </CanvasEdge>
  )
})

function DependencyContextMenu({
  relationId,
  x,
  y,
  onClose,
}: {
  relationId: string
  x: number
  y: number
  onClose: () => void
}) {
  const relation = useWidgetStore((state) => state.relations[relationId])
  const prerequisiteTitle = useWidgetStore((state) => state.widgets[relation?.fromId ?? '']?.title ?? '…')
  const dependentTitle = useWidgetStore((state) => state.widgets[relation?.toId ?? '']?.title ?? '…')
  if (!relation || relation.type !== 'blocker') return null

  const left = Math.max(8, Math.min(x, Math.max(8, window.innerWidth - 224)))
  const top = Math.max(8, Math.min(y, Math.max(8, window.innerHeight - 286)))
  const truncate = (value: string, length = 18) => value.length > length ? `${value.slice(0, length)}…` : value

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40"
        onPointerDown={onClose}
        onContextMenu={(event) => { event.preventDefault(); onClose() }}
      />
      <div
        className="gp-menu gp-pop gp-panel fixed z-50 max-h-[calc(100dvh-16px)] w-52 origin-top-left overflow-y-auto rounded-2xl p-1.5 shadow-2xl"
        style={{ left, top }}
      >
        <p className="px-3 py-1.5  text-[10px] uppercase tracking-widest text-amber-400">
          Dependency
        </p>
        <p className="px-3 pb-2 text-[10px] leading-4 text-neutral-500">
          {truncate(prerequisiteTitle)} must finish before {truncate(dependentTitle)}
        </p>
        <button
          type="button"
          onClick={() => { useWidgetStore.getState().toggleResolveRelation(relationId); onClose() }}
          className="block w-full px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800"
        >
          {relation.isResolved ? 'Mark active' : 'Mark satisfied'}
        </button>
        <button
          type="button"
          onClick={() => {
            useWidgetStore.getState().updateRelation(relationId, { fromId: relation.toId, toId: relation.fromId })
            onClose()
          }}
          className="block w-full px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800"
        >
          Reverse dependency
        </button>
        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          Convert to relation
        </p>
        <div className="grid grid-cols-2 gap-1 px-2 pb-1">
          {(['parent', 'co-parent', 'cousin', 'conflict'] as const).map((type: Exclude<RelationType, 'blocker'>) => (
            <button
              key={type}
              type="button"
              onClick={() => { useWidgetStore.getState().updateRelation(relationId, { type }); onClose() }}
              className="rounded-lg px-2 py-1 text-left text-[10px] text-neutral-400 hover:bg-neutral-800"
            >
              {RELATION_LABELS[type]}
            </button>
          ))}
        </div>
        <div className="my-1 border-t border-neutral-800" />
        <button
          type="button"
          onClick={() => { useWidgetStore.getState().deleteRelation(relationId); onClose() }}
          className="block w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10"
        >
          Delete dependency
        </button>
      </div>
    </>,
    document.body,
  )
}

export function DependencyLines() {
  const {
    relations,
    widgets,
    activeCanvasId,
    widgetGroupIndex,
    groups,
    criticalPathVisible,
    hoveredWidgetId,
  } = useWidgetStore(
    useShallow((state) => ({
      relations: state.relations,
      widgets: state.widgets,
      activeCanvasId: state.activeCanvasId,
      widgetGroupIndex: state.widgetGroupIndex,
      groups: state.groups,
      criticalPathVisible: state.criticalPathVisible,
      hoveredWidgetId: state.hoveredWidgetId,
    })),
  )
  const view = useQuantizedView(EDGE_OVERSCAN_SCREEN)
  const visibleRect = view.rect
  const [menu, setMenu] = useState<{ relationId: string; x: number; y: number } | null>(null)
  useOverlayLifecycle(menu !== null)

  const criticalIds = useMemo(() => {
    if (!criticalPathVisible) return null
    return new Set(getCriticalPath(widgets, relations).relationIds)
  }, [criticalPathVisible, relations, widgets])

  const groupGeometry = useMemo(() => {
    const geometry: Record<string, EndpointGeometry> = {}
    for (const groupId in groups) {
      const group = groups[groupId]!
      const anchor = group.widgetIds.map((widgetId) => widgets[widgetId]).find(Boolean)
      if (!anchor || anchor.canvasId !== activeCanvasId) continue
      const bounds = groupWorldBounds(group, widgets)
      if (!bounds) continue
      geometry[groupId] = {
        center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
        halfW: bounds.width / 2,
        halfH: bounds.height / 2,
      }
    }
    return geometry
  }, [activeCanvasId, groups, widgets])

  const edges = useMemo(() => {
    const dependencyIds: string[] = []
    for (const relationId in relations) {
      const relation = relations[relationId]!
      if (relation.type !== 'blocker') continue
      const from = widgets[relation.fromId]
      const to = widgets[relation.toId]
      if (from?.canvasId === activeCanvasId && to?.canvasId === activeCanvasId) dependencyIds.push(relationId)
    }

    const edgeBudget = criticalPathVisible ? CRITICAL_EDGE_RENDER_LIMIT : EDGE_RENDER_LIMIT
    const cullByViewport = dependencyIds.length > edgeBudget
    const result: DependencyEdgeDescriptor[] = []

    const endpoint = (widgetId: string): EndpointGeometry | null => {
      const groupId = widgetGroupIndex[widgetId]
      if (groupId) return groupGeometry[groupId] ?? null
      const widget = widgets[widgetId]
      if (!widget) return null
      return {
        center: widgetCenter(widget),
        halfW: widget.size.width / 2,
        halfH: widget.size.height / 2,
      }
    }

    for (const relationId of dependencyIds) {
      const relation = relations[relationId]!
      const fromWidget = widgets[relation.fromId]!
      const toWidget = widgets[relation.toId]!
      const highlighted = criticalIds?.has(relationId) ?? false
      const connected = hoveredWidgetId === relation.fromId || hoveredWidgetId === relation.toId
      if (
        cullByViewport &&
        !highlighted &&
        !connected &&
        !widgetIntersectsRect(fromWidget, visibleRect) &&
        !widgetIntersectsRect(toWidget, visibleRect) &&
        !edgeCorridorIntersectsRect(
          widgetCenter(fromWidget),
          widgetCenter(toWidget),
          visibleRect,
          CORRIDOR_MARGIN,
        )
      ) continue

      const fromGroupId = widgetGroupIndex[relation.fromId]
      const toGroupId = widgetGroupIndex[relation.toId]
      if (fromGroupId && fromGroupId === toGroupId) continue

      const fromGeometry = endpoint(relation.fromId)
      const toGeometry = endpoint(relation.toId)
      if (!fromGeometry || !toGeometry) continue
      if (result.length >= edgeBudget && !highlighted && !connected) continue

      const { start, end } = dependencyAnchors(fromGeometry, toGeometry)
      result.push({
        id: relationId,
        d: anchoredCurvePath(start, fromGeometry.center, end, toGeometry.center),
        mid: anchoredCurveMidpoint(start, fromGeometry.center, end, toGeometry.center),
        start,
        end,
        isResolved: relation.isResolved,
        highlighted,
        connected,
        showStatusChip: Math.hypot(end.x - start.x, end.y - start.y) >= 72,
      })
    }
    return result
  }, [
    activeCanvasId,
    criticalIds,
    criticalPathVisible,
    groupGeometry,
    hoveredWidgetId,
    relations,
    visibleRect,
    widgetGroupIndex,
    widgets,
  ])

  const openMenu = useCallback(
    (relationId: string, x: number, y: number) => setMenu({ relationId, x, y }),
    [],
  )
  const closeMenu = useCallback(() => setMenu(null), [])
  const detail = edgeDetailFor(edges.length)

  return (
    <>
      <CanvasEdgeLayer
        visibleRect={visibleRect}
        detail={detail}
        defs={
          <>
          <marker id="dependency-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={DEPENDENCY_STROKE} />
          </marker>
          <marker id="dependency-arrow-resolved" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={RESOLVED_STROKE} />
          </marker>
          </>
        }
      >
        {edges.map((edge) => (
          <DependencyEdge key={edge.id} edge={edge} detail={detail} onOpenMenu={openMenu} />
        ))}
      </CanvasEdgeLayer>
      {menu && (
        <DependencyContextMenu relationId={menu.relationId} x={menu.x} y={menu.y} onClose={closeMenu} />
      )}
    </>
  )
}
