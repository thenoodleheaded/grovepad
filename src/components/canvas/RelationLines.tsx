import { memo, useCallback, useMemo, useState, type CSSProperties } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { getCriticalPath, strictCarrierIds, useWidgetStore } from '../../store/useWidgetStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import type { RelationType, Vector2D } from '../../types/spatial'
import { RELATION_LABELS } from '../../types/spatial'
import { routeEdge, routeEdgeToPoint, type EdgeNode } from '../../utils/edgeRoute'
import { useWorldContentRect } from '../../hooks/useWorldContentRect'
import { useWidgetRestStore } from '../../store/useWidgetRestStore'
import { isWidgetResting, widgetWithEffectiveSize } from '../../utils/widgetRest'
import { clusterFrameEnvelope, clusterTitleRowRect } from '../../utils/glueGeometry'
import { widgetDefinition } from '../../widgets/registry'
import { treeRevealDelay } from '../../store/treeReveal'
import { truncate } from '../../utils/text'
import { ContextMenuSurface } from '../ui/ContextMenuSurface'
import { widgetCenter } from '../../utils/widgetBounds'
import {
  CanvasEdge,
  CanvasEdgeLayer,
} from './CanvasEdge'

interface EdgeStyle {
  stroke: string
  width: number
  dash?: string
}

const EDGE_STYLES: Record<RelationType, EdgeStyle> = {
  parent: { stroke: 'var(--gp-relation-outline)', width: 2 },
  'co-parent': { stroke: '#7dd3fc', width: 1.6 },
  cousin: { stroke: '#737373', width: 1.4, dash: '5 5' },
  blocker: { stroke: '#dc2626', width: 1.8, dash: '6 4' },
  conflict: { stroke: '#f97316', width: 1.8 },
}

// Relation type priority for merging (higher = more important)
const TYPE_PRIORITY: Record<RelationType, number> = {
  blocker: 5, conflict: 4, parent: 3, 'co-parent': 2, cousin: 1,
}

const MUTED_STROKE = '#525252'

/** A widget's title capsule floats above its top edge (`-top-9`, h-8) — its
 *  footprint spans roughly [cardTop-36, cardTop-4]. It is left-aligned with
 *  the card (icon cell first), never centred. */
const WIDGET_PILL_TOP = 36
/** Half of the shared `h-8` pill height. */
const PILL_HALF_HEIGHT = 16
/** Rough px-per-character for the pill's text-xs label — a layout estimate,
 *  not a DOM measurement (this file never reads layout to stay per-frame free). */
const PILL_CHAR_WIDTH = 6.5
/** Icon + internal gaps baked into the widget pill markup: icon(11) + ml-1.5(6) + px-3*2(24). */
const WIDGET_PILL_CHROME = 41
/** Matches the pill's `min-w-[64px]`. */
const PILL_MIN_HALF_WIDTH = 32
/** The floating title capsule is hidden while a card is an icon. */

/**
 * Estimated half-width of a floating name pill, clamped to the pill's real
 * CSS bounds (`min-w-[64px]` .. `max-w-[80%]` of the card). Text width is a
 * rough per-character estimate — good enough to test overlap, not to lay
 * out pixel-perfect.
 */
function estimatePillHalfWidth(label: string, chrome: number, boxWidth: number): number {
  const estimated = (chrome + label.length * PILL_CHAR_WIDTH) / 2
  return Math.min(Math.max(estimated, PILL_MIN_HALF_WIDTH), boxWidth * 0.4)
}

// ---------------------------------------------------------------------------
// Endpoint geometry. Where a line actually lands is decided by one owner,
// `edgeRoute.ts`: this layer only says what each end IS (its box on screen and
// the floating name capsule that has to stay clear) and, for a strict hold,
// which half of the border the line may use.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Merged edge descriptor
// ---------------------------------------------------------------------------

interface MergedEdge {
  key: string
  d: string
  mid: Vector2D
  type: RelationType
  isResolved: boolean
  highlighted: boolean
  /** A parent edge inside a strict hold — its parent node carries the child
   * when it moves, and the line paints heavier to show the coupling. */
  strict: boolean
  /** Accent applied while either endpoint widget is hovered. */
  hoverAccent: string | null
  /** Only set if this edge represents exactly one relation (for context menu). */
  singleRelationId: string | null
  revealDelay: number | null
}

// ---------------------------------------------------------------------------
// Edge component
// ---------------------------------------------------------------------------

interface RelationEdgeProps {
  edge: MergedEdge
  onOpenMenu: (relationId: string, x: number, y: number) => void
}

const RelationEdge = memo(function RelationEdge({ edge, onOpenMenu }: RelationEdgeProps) {
  const { d, mid } = edge
  const { x: midX, y: midY } = mid
  const style = EDGE_STYLES[edge.type]
  // A strict parent edge is load-bearing — the parent moves the child — so it
  // draws heavier than a soft line, which is only a drawn meaning.
  const strictEdge = edge.type === 'parent' && edge.strict
  const mainWidth = strictEdge ? style.width + 1 : style.width
  const resolvable = edge.type === 'blocker' || edge.type === 'conflict'
  const muted = resolvable && edge.isResolved
  const stroke = muted ? MUTED_STROKE : style.stroke
  const conflictMarker =
    edge.type === 'conflict'
      ? muted ? 'url(#rel-arrow-muted)' : 'url(#rel-arrow-conflict)'
      : undefined
  const endMarker = conflictMarker
  const revealing = edge.revealDelay !== null

  return (
    <CanvasEdge
      d={d}
      variant="relation"
      connected={Boolean(edge.hoverAccent)}
      resolved={muted}
      groupClassName={[revealing ? 'gp-tree-relation-reveal' : '', strictEdge ? 'gp-edge-strict' : ''].filter(Boolean).join(' ')}
      style={{
        ...(edge.hoverAccent ? { '--gp-edge-accent': edge.hoverAccent } : {}),
        '--gp-tree-reveal-delay': `${edge.revealDelay ?? 0}ms`,
      } as CSSProperties}
      highlight={edge.highlighted ? { stroke: '#34d399', width: 6, opacity: 0.35 } : undefined}
      halo={{ stroke, width: 7, pathLength: revealing ? 1 : undefined }}
      main={{
        stroke,
        width: mainWidth,
        dash: style.dash,
        markerStart: conflictMarker,
        markerEnd: endMarker,
        pathLength: revealing ? 1 : undefined,
      }}
      flow={{ stroke: edge.hoverAccent ?? '#4ade80', width: 2, dash: '2 6' }}
      hitArea={{
        width: 14,
        cursor: edge.singleRelationId ? 'context-menu' : 'default',
        onContextMenu: (event) => {
          if (!edge.singleRelationId) return
          event.preventDefault()
          event.stopPropagation()
          onOpenMenu(edge.singleRelationId, event.clientX, event.clientY)
        },
      }}
    >
      {edge.type === 'blocker' && (
        <g className="gp-route-chip-motion" transform={`translate(${midX}, ${midY})`}>
          <circle r={7} fill="#171717" stroke={stroke} strokeWidth={1.5} />
          <text x={0} y={0} textAnchor="middle" dominantBaseline="central"
            fontSize={9} fontWeight={700} fill={stroke}>
            {edge.isResolved ? '✓' : '!'}
          </text>
        </g>
      )}
    </CanvasEdge>
  )
}, (prev, next) =>
  prev.edge.d === next.edge.d &&
  prev.edge.mid.x === next.edge.mid.x &&
  prev.edge.mid.y === next.edge.mid.y &&
  prev.edge.type === next.edge.type &&
  prev.edge.isResolved === next.edge.isResolved &&
  prev.edge.highlighted === next.edge.highlighted &&
  prev.edge.strict === next.edge.strict &&
  prev.edge.hoverAccent === next.edge.hoverAccent &&
  prev.edge.singleRelationId === next.edge.singleRelationId &&
  prev.onOpenMenu === next.onOpenMenu,
)

// ---------------------------------------------------------------------------
// Context menu for a single relation
// ---------------------------------------------------------------------------

function LineContextMenu({
  relationId, x, y, onClose,
}: { relationId: string; x: number; y: number; onClose: () => void }) {
  const relation = useWidgetStore((state) => state.relations[relationId])
  const fromTitle = useWidgetStore((state) => state.widgets[relation?.fromId ?? '']?.title ?? '…')
  const toTitle = useWidgetStore((state) => state.widgets[relation?.toId ?? '']?.title ?? '…')
  if (!relation) return null
  const resolvable = relation.type === 'blocker' || relation.type === 'conflict'
  const addParent = (parentId: string, childId: string) => {
    useWidgetStore.getState().addRelation(parentId, childId, 'parent')
    onClose()
  }
  return (
    <ContextMenuSurface x={x} y={y} estimatedWidth={208} estimatedHeight={244} onClose={onClose}>
        <p className="px-3 py-1.5  text-[10px] uppercase tracking-widest text-neutral-500">
          {RELATION_LABELS[relation.type]} link
        </p>
        {resolvable && (
          <button type="button"
            onClick={() => { useWidgetStore.getState().toggleResolveRelation(relationId); onClose() }}
            className="block w-full px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800">
            {relation.isResolved ? 'Mark Unresolved' : 'Mark Resolved'}
          </button>
        )}
        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Change type</p>
        <div className="grid grid-cols-2 gap-1 px-2 pb-1">
          {(['parent', 'co-parent', 'cousin', 'blocker', 'conflict'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => { useWidgetStore.getState().updateRelation(relationId, { type }); onClose() }}
              className={`rounded-lg px-2 py-1 text-left text-[10px] ${relation.type === type ? 'bg-violet-400/15 text-violet-200' : 'text-neutral-400 hover:bg-neutral-800'}`}
            >{RELATION_LABELS[type]}</button>
          ))}
        </div>
        <button type="button" onClick={() => { useWidgetStore.getState().updateRelation(relationId, { fromId: relation.toId, toId: relation.fromId }); onClose() }} className="block w-full px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800">Reverse direction</button>
        <div className="my-1 border-t border-neutral-800" />
        <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          Add child link
        </p>
        <button type="button"
          onClick={() => addParent(relation.fromId, relation.toId)}
          className="block w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-700/30">
          <span className="text-neutral-500">{truncate(fromTitle, 14)}</span>
          <span className="mx-1 text-emerald-400">→</span>
          <span className="text-neutral-300">parent of {truncate(toTitle, 14)}</span>
        </button>
        <button type="button"
          onClick={() => addParent(relation.toId, relation.fromId)}
          className="block w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-700/30">
          <span className="text-neutral-500">{truncate(toTitle, 14)}</span>
          <span className="mx-1 text-emerald-400">→</span>
          <span className="text-neutral-300">parent of {truncate(fromTitle, 14)}</span>
        </button>
        <div className="my-1 border-t border-neutral-800" />
        <button type="button"
          onClick={() => { useWidgetStore.getState().deleteRelation(relationId); onClose() }}
          className="block w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10">
          Delete Link
        </button>
    </ContextMenuSurface>
  )
}

// ---------------------------------------------------------------------------
// Link drag preview line (world coordinates, no conversion needed)
// ---------------------------------------------------------------------------

function LinkDragLine({ source, cursorWorld }: { source: EdgeNode; cursorWorld: Vector2D }) {
  // Leaves the card's border exactly where the committed line will, so the
  // preview never starts under the card it is dragged from.
  const d = routeEdgeToPoint(source, cursorWorld)
  return (
    <g>
      <path
        d={d} fill="none"
        stroke="#818cf8" strokeWidth={6} strokeLinecap="round" opacity={0.18}
      />
      <path
        className="gp-link-dash"
        d={d} fill="none"
        stroke="#818cf8" strokeWidth={2} strokeDasharray="7 5" strokeLinecap="round" opacity={0.9}
      />
      <circle cx={cursorWorld.x} cy={cursorWorld.y} r={4} fill="#818cf8" opacity={0.5} />
    </g>
  )
}

/**
 * Keep cursor-rate link preview updates isolated from the persisted relation
 * scene. Previously every pointer move reconciled the complete edge list even
 * though none of those edges had changed.
 */
const RelationLinkPreview = memo(function RelationLinkPreview() {
  const { linkDrag, source } = useWidgetStore(
    useShallow((state) => {
      const drag = state.linkDrag
      return {
        linkDrag: drag,
        source: drag ? state.widgets[drag.sourceId] : undefined,
      }
    }),
  )
  if (!linkDrag || !source) return null

  return (
    <LinkDragLine
      source={{
        center: widgetCenter(source),
        halfW: source.size.width / 2,
        halfH: source.size.height / 2,
      }}
      cursorWorld={linkDrag.cursorWorld}
    />
  )
})

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RelationLines() {
  const {
    relations,
    widgets,
    activeCanvasId,
    criticalPathVisible,
    hoveredWidgetId,
    glues,
    widgetGlueIndex,
  } = useWidgetStore(
    useShallow((state) => ({
      relations: state.relations,
      widgets: state.widgets,
      activeCanvasId: state.activeCanvasId,
      criticalPathVisible: state.criticalPathVisible,
      hoveredWidgetId: state.hoveredWidgetId,
      glues: state.glues,
      widgetGlueIndex: state.widgetGlueIndex,
    })),
  )
  const contentRect = useWorldContentRect()
  const expandedWidgetId = useWidgetRestStore((state) => state.expandedWidgetId)
  const expandedOffset = useWidgetRestStore((state) => state.expandedOffset)

  const [menu, setMenu] = useState<{ relationId: string; x: number; y: number } | null>(null)
  useOverlayLifecycle(menu !== null)

  const criticalIds = useMemo(() => {
    if (!criticalPathVisible) return null
    return new Set(getCriticalPath(widgets, relations).relationIds)
  }, [criticalPathVisible, widgets, relations])
  const hoveredAccent = hoveredWidgetId && widgets[hoveredWidgetId]
    ? widgetDefinition(widgets[hoveredWidgetId]!.type).accent
    : null

  // Build merged edges: multiple relations between the same pair become one line
  const edges = useMemo((): MergedEdge[] => {
    const edgeMap = new Map<string, {
      fromGeo: EdgeNode
      toGeo: EdgeNode
      type: RelationType
      isResolved: boolean
      highlighted: boolean
      strict: boolean
      hoverAccent: string | null
      singleRelationId: string | null
      priority: number
      revealDelay: number | null
    }>()

    // Every edge whose parent side carries a strict hold — directly or
    // inherited — wears the strict paint, so a whole held subtree reads as
    // one load-bearing structure.
    const strictCarriers = strictCarrierIds(widgets, relations)

    const endpointCache = new Map<string, EdgeNode | null>()
    /** The node a widget links AS. A glued cluster is one node on the board, so
     * every member shares the cluster's id — one line reaches the group instead
     * of a separate line per welded card. */
    const linkNodeId = (widgetId: string): string => {
      const glueId = widgetGlueIndex[widgetId]
      return glueId && (glues[glueId]?.widgetIds.length ?? 0) >= 2 ? `glue:${glueId}` : widgetId
    }
    const endpointGeo = (widgetId: string): EdgeNode | null => {
      const glueId = widgetGlueIndex[widgetId]
      const cluster = glueId ? glues[glueId] : undefined
      if (cluster && cluster.widgetIds.length >= 2) {
        const cacheKey = `glue:${glueId}`
        if (endpointCache.has(cacheKey)) return endpointCache.get(cacheKey) ?? null
        // Anchor to the cluster's frame — boundary lines included — so the
        // line keeps its gap from the GROUP rather than from whichever welded
        // card sits nearest. The title/button row is dodged as a pill exactly
        // where it is painted, so a line never cuts through the group's name
        // while the empty canvas beside that row stays freely reachable.
        const env = clusterFrameEnvelope(cluster.widgetIds, widgets)
        const row = clusterTitleRowRect(cluster.widgetIds, widgets, cluster.name)
        const result: EdgeNode | null = env
          ? {
              center: { x: env.x + env.width / 2, y: env.y + env.height / 2 },
              halfW: env.width / 2,
              halfH: env.height / 2,
              pill: row
                ? {
                    cx: row.x + row.width / 2,
                    cy: row.y + row.height / 2,
                    rx: row.width / 2,
                    ry: row.height / 2,
                  }
                : null,
            }
          : null
        endpointCache.set(cacheKey, result)
        return result
      }

      const cacheKey = `widget:${widgetId}`
      if (endpointCache.has(cacheKey)) return endpointCache.get(cacheKey) ?? null

      const stored = widgets[widgetId]
      if (!stored) {
        endpointCache.set(cacheKey, null)
        return null
      }
      // Lines anchor to the on-screen footprint; a resting tile also hides
      // its floating title capsule, so there is no pill to dodge.
      const restCtx = { expandedWidgetId, expandedOffset }
      const restingHere = isWidgetResting(stored, restCtx)
      const w = widgetWithEffectiveSize(stored, restCtx)
      const center = widgetCenter(w)
      const pillHidden = w.iconified === true || restingHere
      const result: EdgeNode | null = {
        center,
        halfW: w.size.width / 2,
        halfH: w.size.height / 2,
        // Left-aligned like the real capsule (icon cell at the card's left
        // edge), not centred — a line landing at a wide card's top-centre
        // has nothing to dodge there.
        pill: pillHidden ? null : (() => {
          const rx = estimatePillHalfWidth(w.title, WIDGET_PILL_CHROME, w.size.width)
          return {
            cx: w.position.x + rx,
            cy: w.position.y - WIDGET_PILL_TOP + PILL_HALF_HEIGHT,
            rx,
            ry: PILL_HALF_HEIGHT,
          }
        })(),
      }
      endpointCache.set(cacheKey, result)
      return result
    }

    for (const relId in relations) {
      const rel = relations[relId]!
      if (rel.type === 'blocker') continue
      const fromWidget = widgets[rel.fromId]
      const toWidget = widgets[rel.toId]
      if (!fromWidget || !toWidget) continue
      if (fromWidget.canvasId !== activeCanvasId || toWidget.canvasId !== activeCanvasId) continue
      const fromNode = linkNodeId(rel.fromId)
      const toNode = linkNodeId(rel.toId)
      // Both ends inside the same cluster: the group is one node, so the
      // relation has nowhere to travel and would draw a dot on itself.
      if (fromNode === toNode) continue
      const highlighted = criticalIds?.has(relId) ?? false
      const strictEdge = rel.type === 'parent' && strictCarriers.has(rel.fromId)
      const relationHovered = hoveredWidgetId === rel.fromId || hoveredWidgetId === rel.toId

      // Keyed by NODE, not widget: two relations reaching different members of
      // the same cluster are one line to the group, merged here rather than
      // stacked as identical curves.
      const edgeKey = `${fromNode}::${toNode}`
      const priority = TYPE_PRIORITY[rel.type]

      const existing = edgeMap.get(edgeKey)
      if (existing) {
        // A merged visual no longer maps to exactly one persisted relation,
        // regardless of which type wins the priority comparison.
        existing.singleRelationId = null
        // Merge: keep higher-priority relation type
        if (priority > existing.priority) {
          existing.type = rel.type
          existing.isResolved = rel.isResolved
          existing.priority = priority
        }
        if (highlighted) existing.highlighted = true
        if (strictEdge) existing.strict = true
        if (relationHovered) existing.hoverAccent = hoveredAccent
        const revealDelay = treeRevealDelay('relation', relId)
        if (revealDelay !== null) {
          existing.revealDelay = existing.revealDelay === null
            ? revealDelay
            : Math.min(existing.revealDelay, revealDelay)
        }
        continue
      }

      const fromGeo = endpointGeo(rel.fromId)
      const toGeo = endpointGeo(rel.toId)
      if (!fromGeo || !toGeo) continue

      edgeMap.set(edgeKey, {
        fromGeo, toGeo,
        type: rel.type,
        isResolved: rel.isResolved,
        highlighted,
        strict: strictEdge,
        hoverAccent: relationHovered ? hoveredAccent : null,
        singleRelationId: relId,
        priority,
        revealDelay: treeRevealDelay('relation', relId),
      })
    }

    return Array.from(edgeMap.entries(), ([key, edge]) => {
      // A strict hold reads top-down: the line leaves the holding parent's
      // bottom half and enters the child's upper half, at the closest points
      // those halves allow. A soft link is free to use whichever borders face
      // each other.
      const route = routeEdge(
        edge.fromGeo,
        edge.toGeo,
        edge.strict ? { from: 'lower', to: 'upper' } : undefined,
      )
      return {
        key,
        d: route.d,
        mid: route.mid,
        type: edge.type,
        isResolved: edge.isResolved,
        highlighted: edge.highlighted,
        strict: edge.strict,
        hoverAccent: edge.hoverAccent,
        singleRelationId: edge.singleRelationId,
        revealDelay: edge.revealDelay,
      }
    })
  }, [
    activeCanvasId,
    criticalIds,
    expandedOffset,
    expandedWidgetId,
    glues,
    hoveredAccent,
    hoveredWidgetId,
    relations,
    widgetGlueIndex,
    widgets,
  ])

  const openMenu = useCallback(
    (relationId: string, x: number, y: number) => setMenu({ relationId, x, y }),
    [],
  )
  const closeMenu = useCallback(() => setMenu(null), [])

  return (
    <>
      <CanvasEdgeLayer
        contentRect={contentRect}
        ariaHidden
        defs={
          <>
          <marker id="rel-arrow-conflict" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f97316" />
          </marker>
          <marker id="rel-arrow-muted" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={MUTED_STROKE} />
          </marker>
          </>
        }
      >

        {edges.map((edge) => (
          <RelationEdge key={edge.key} edge={edge} onOpenMenu={openMenu} />
        ))}

        <RelationLinkPreview />
      </CanvasEdgeLayer>

      {menu && (
        <LineContextMenu
          relationId={menu.relationId}
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
        />
      )}
    </>
  )
}
