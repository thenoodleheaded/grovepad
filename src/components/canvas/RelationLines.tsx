import { memo, useCallback, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { getCriticalPath, useWidgetStore } from '../../store/useWidgetStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import type { RelationType, Vector2D, Widget } from '../../types/spatial'
import { GRID_SIZE, RELATION_LABELS } from '../../types/spatial'
import { widgetIntersectsRect } from '../../utils/canvasView'
import { anchoredCurveMidpoint, anchoredCurvePath, curvedPath } from '../../utils/curve'
import { groupWorldBounds } from '../../utils/groupGeometry'
import { useQuantizedView } from '../../hooks/useQuantizedView'
import { widgetDefinition } from '../../widgets/registry'
import {
  CanvasEdge,
  CanvasEdgeLayer,
} from './CanvasEdge'
import { edgeCorridorIntersectsRect, edgeDetailFor, type EdgeDetail } from './canvasEdgePolicy'

const EDGE_OVERSCAN_SCREEN = 700
const EDGE_RENDER_LIMIT = 950
const CRITICAL_EDGE_RENDER_LIMIT = 1600
/** Off-screen-to-off-screen edges still render if their straight-line
 *  corridor sweeps through the viewport (a wide relation shouldn't pop away
 *  just because both endpoints are currently scrolled out of view). */
const CORRIDOR_MARGIN = 360

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

/** Gap left between a widget's border and any line touching it — keeps the
 *  stroke from visually merging into the glass edge. */
const LINE_STANDOFF = GRID_SIZE * 0.3
/** How far a border attachment stays clear of the card's rounded corner. */
const CORNER_INSET = 24
/** Extra breathing room left between a trimmed line end and the pill it's
 *  dodging, so the gap reads as deliberate rather than a rounding error. */
const GAP_BUFFER = LINE_STANDOFF

/** A widget's title capsule floats above its top edge (`-top-9`, h-8) — its
 *  footprint spans roughly [cardTop-36, cardTop-4]. */
const WIDGET_PILL_TOP = 36
/** A group band's name pill floats higher (`top:-60`, h-8). */
const GROUP_PILL_TOP = 60
/** Half of the shared `h-8` pill height. */
const PILL_HALF_HEIGHT = 16
/** Rough px-per-character for the pill's text-xs label — a layout estimate,
 *  not a DOM measurement (this file never reads layout to stay per-frame free). */
const PILL_CHAR_WIDTH = 6.5
/** Icon + internal gaps baked into the widget pill markup: icon(11) + ml-1.5(6) + px-3*2(24). */
const WIDGET_PILL_CHROME = 41
/** Group pill markup: color dot(6) + gap-1.5(6) + px-3*2(24). */
const GROUP_PILL_CHROME = 36
/** Matches the pill's `min-w-[64px]`. */
const PILL_MIN_HALF_WIDTH = 32
/** The floating title capsule is hidden while a card is collapsed. */

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

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

function widgetCenter(w: Widget): Vector2D {
  return { x: w.position.x + w.size.width / 2, y: w.position.y + w.size.height / 2 }
}

// ---------------------------------------------------------------------------
// Anchor geometry — a line never derives from one fixed spot. Each endpoint
// picks whichever point on its own border sits closest to the other card,
// then dodges the other card's floating name pill if it would land under it.
// ---------------------------------------------------------------------------

interface RectGeo {
  center: Vector2D
  halfW: number
  halfH: number
}

interface PillInfo {
  cx: number
  cy: number
  rx: number
  ry: number
}

interface EndpointGeo extends RectGeo {
  /** Parent edges derive from the closest point on the parent's lower border
   *  half and arrive at the closest point on the child's upper border half.
   *  Other relation types may use the full border. */
  anchorRegion: 'any' | 'upper' | 'lower'
  pill: PillInfo | null
}

/** Nearest point on a rect's border to `towards`, held back from the
 *  rounded corners by CORNER_INSET so a line never appears to clip a card's
 *  curve. */
function borderPoint(geo: RectGeo, towards: Vector2D): Vector2D {
  const { center, halfW, halfH } = geo
  const x = clamp(towards.x, center.x - halfW, center.x + halfW)
  const y = clamp(towards.y, center.y - halfH, center.y + halfH)
  let point: Vector2D
  if (x !== towards.x || y !== towards.y) {
    point = { x, y }
  } else {
    const dx = towards.x - center.x
    const dy = towards.y - center.y
    if (dx === 0 && dy === 0) {
      point = center
    } else {
      const tx = dx === 0 ? Infinity : halfW / Math.abs(dx)
      const ty = dy === 0 ? Infinity : halfH / Math.abs(dy)
      const t = Math.min(tx, ty, 1)
      point = { x: center.x + dx * t, y: center.y + dy * t }
    }
  }
  return insetFromCorners(point, geo)
}

function insetFromCorners(point: Vector2D, geo: RectGeo): Vector2D {
  const { center, halfW, halfH } = geo
  const inset = Math.min(CORNER_INSET, halfW - 1, halfH - 1)
  if (inset <= 0) return point
  const onTop = point.y <= center.y - halfH + 0.5
  const onBottom = point.y >= center.y + halfH - 0.5
  if (onTop || onBottom) {
    return { x: clamp(point.x, center.x - halfW + inset, center.x + halfW - inset), y: point.y }
  }
  const onLeft = point.x <= center.x - halfW + 0.5
  const onRight = point.x >= center.x + halfW - 0.5
  if (onLeft || onRight) {
    return { x: point.x, y: clamp(point.y, center.y - halfH + inset, center.y + halfH - inset) }
  }
  return point
}

/** Nearest border point restricted to a rect's upper half (top edge plus the
 *  upper reach of both sides). A rectangle's border is convex, so when the
 *  unrestricted nearest point already falls in the upper half it's the
 *  answer; otherwise the closest point *on* the restricted arc is whichever
 *  side's mid-height endpoint sits nearer to `towards`. */
function upperHalfBorderPoint(geo: RectGeo, towards: Vector2D): Vector2D {
  const point = borderPoint(geo, towards)
  if (point.y <= geo.center.y) return point
  const left = { x: geo.center.x - geo.halfW, y: geo.center.y }
  const right = { x: geo.center.x + geo.halfW, y: geo.center.y }
  const dl = Math.hypot(towards.x - left.x, towards.y - left.y)
  const dr = Math.hypot(towards.x - right.x, towards.y - right.y)
  return dl <= dr ? left : right
}

/** Nearest border point restricted to a rect's lower half (bottom edge plus
 *  the lower reach of both sides). This is the parent derivation surface:
 *  the x/y attachment slides continuously toward the child instead of being
 *  pinned to the card's side or bottom-center. */
function lowerHalfBorderPoint(geo: RectGeo, towards: Vector2D): Vector2D {
  const point = borderPoint(geo, towards)
  if (point.y >= geo.center.y) return point
  const left = { x: geo.center.x - geo.halfW, y: geo.center.y }
  const right = { x: geo.center.x + geo.halfW, y: geo.center.y }
  const dl = Math.hypot(towards.x - left.x, towards.y - left.y)
  const dr = Math.hypot(towards.x - right.x, towards.y - right.y)
  return dl <= dr ? left : right
}

/** Pushes a point clear of the pill's rounded-capsule (stadium) silhouette,
 *  always exiting toward the far side, away from the card the pill floats
 *  above — never toward it, which would poke the "gap" straight through the
 *  card's own border. This is the "artificial pill shaped gap": a line due
 *  to land under a name pill stops just outside its curved edge instead of
 *  continuing underneath it. */
function pushOutsidePill(point: Vector2D, pill: PillInfo): Vector2D {
  const rx = pill.rx + GAP_BUFFER
  const ry = pill.ry + GAP_BUFFER
  const dx = point.x - pill.cx
  if (Math.abs(dx) > rx) return point
  // Vertical half-extent of the capsule at this x: full ry across the
  // straight midsection, tapering per the rounded end-cap's circle equation
  // once dx passes into it.
  const straightHalf = Math.max(rx - ry, 0)
  const capIntrusion = Math.max(Math.abs(dx) - straightHalf, 0)
  const verticalReach =
    capIntrusion > 0 ? Math.sqrt(Math.max(ry * ry - capIntrusion * capIntrusion, 0)) : ry
  const farEdge = pill.cy - verticalReach
  const nearEdge = pill.cy + verticalReach
  if (point.y < farEdge || point.y > nearEdge) return point
  return { x: point.x, y: farEdge }
}

function anchorPoint(geo: EndpointGeo, towards: Vector2D): Vector2D {
  const padded: RectGeo = {
    center: geo.center,
    halfW: geo.halfW + LINE_STANDOFF,
    halfH: geo.halfH + LINE_STANDOFF,
  }
  const raw = geo.anchorRegion === 'upper'
    ? upperHalfBorderPoint(padded, towards)
    : geo.anchorRegion === 'lower'
      ? lowerHalfBorderPoint(padded, towards)
      : borderPoint(padded, towards)
  return geo.pill ? pushOutsidePill(raw, geo.pill) : raw
}

/** Each side picks the point on its own border closest to the other
 *  widget's center, independently. Deliberately not iterative: chasing the
 *  other side's already-resolved point (rather than its center) creates an
 *  order-dependent fixed point whenever both borders comfortably contain
 *  the same coordinate — e.g. two widgets sitting side by side at nearly
 *  the same height can converge on either one's center y depending which
 *  side resolves first, even though every point on that flat stretch is an
 *  equally short connection. Resolving both sides directly off the real
 *  centers has no such ambiguity. */
function pickAnchors(from: EndpointGeo, to: EndpointGeo): { start: Vector2D; end: Vector2D } {
  return {
    start: anchorPoint(from, to.center),
    end: anchorPoint(to, from.center),
  }
}

/** Hierarchy-preserving anchors for parent links. Attachment may slide along
 * the bottom/top rail as cards move, but never jumps onto a side edge. This
 * keeps parenthood readable throughout a live drag. The child endpoint also
 * clears the complete floating pill silhouette, including group-name pills. */
function pickParentAnchors(from: EndpointGeo, to: EndpointGeo): { start: Vector2D; end: Vector2D } {
  const fromInset = Math.min(CORNER_INSET, Math.max(0, from.halfW - 1))
  const toInset = Math.min(CORNER_INSET, Math.max(0, to.halfW - 1))
  const start = {
    x: clamp(to.center.x, from.center.x - from.halfW + fromInset, from.center.x + from.halfW - fromInset),
    y: from.center.y + from.halfH + LINE_STANDOFF,
  }
  const end = {
    x: clamp(from.center.x, to.center.x - to.halfW + toInset, to.center.x + to.halfW - toInset),
    y: to.center.y - to.halfH - LINE_STANDOFF,
  }
  if (to.pill && Math.abs(end.x - to.pill.cx) <= to.pill.rx + LINE_STANDOFF) {
    end.y = Math.min(end.y, to.pill.cy - to.pill.ry - LINE_STANDOFF)
  }
  return { start, end }
}

// ---------------------------------------------------------------------------
// Merged edge descriptor (after group routing is applied)
// ---------------------------------------------------------------------------

interface MergedEdge {
  key: string
  d: string
  mid: Vector2D
  type: RelationType
  isResolved: boolean
  highlighted: boolean
  /** Accent applied while either endpoint widget is hovered. */
  hoverAccent: string | null
  /** Only set if this edge represents exactly one relation (for context menu). */
  singleRelationId: string | null
}

// ---------------------------------------------------------------------------
// Edge component
// ---------------------------------------------------------------------------

interface RelationEdgeProps {
  edge: MergedEdge
  detail: EdgeDetail
  onOpenMenu: (relationId: string, x: number, y: number) => void
}

const RelationEdge = memo(function RelationEdge({ edge, detail, onOpenMenu }: RelationEdgeProps) {
  const { d, mid } = edge
  const { x: midX, y: midY } = mid
  const style = EDGE_STYLES[edge.type]
  const resolvable = edge.type === 'blocker' || edge.type === 'conflict'
  const muted = resolvable && edge.isResolved
  const stroke = muted ? MUTED_STROKE : style.stroke
  const conflictMarker =
    edge.type === 'conflict'
      ? muted ? 'url(#rel-arrow-muted)' : 'url(#rel-arrow-conflict)'
      : undefined
  const endMarker = conflictMarker

  return (
    <CanvasEdge
      d={d}
      variant="relation"
      detail={detail}
      connected={Boolean(edge.hoverAccent)}
      resolved={muted}
      style={edge.hoverAccent ? ({ '--gp-edge-accent': edge.hoverAccent } as CSSProperties) : undefined}
      highlight={edge.highlighted ? { stroke: '#34d399', width: 6, opacity: 0.35 } : undefined}
      halo={{ stroke, width: 7 }}
      main={{
        stroke,
        width: style.width,
        dash: style.dash,
        markerStart: conflictMarker,
        markerEnd: endMarker,
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
      {edge.type === 'blocker' && detail !== 'minimal' && (
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
  prev.edge.hoverAccent === next.edge.hoverAccent &&
  prev.edge.singleRelationId === next.edge.singleRelationId &&
  prev.detail === next.detail &&
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
  const truncate = (s: string, n = 14) => s.length > n ? s.slice(0, n) + '…' : s
  const left = Math.max(8, Math.min(x, Math.max(8, window.innerWidth - 216)))
  const top = Math.max(8, Math.min(y, Math.max(8, window.innerHeight - 252)))

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div className="gp-menu gp-pop gp-panel fixed z-50 max-h-[calc(100dvh-16px)] w-52 origin-top-left overflow-y-auto rounded-2xl p-1.5 shadow-2xl"
        style={{ left, top }}>
        <p className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
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
          <span className="text-neutral-500">{truncate(fromTitle)}</span>
          <span className="mx-1 text-emerald-400">→</span>
          <span className="text-neutral-300">parent of {truncate(toTitle)}</span>
        </button>
        <button type="button"
          onClick={() => addParent(relation.toId, relation.fromId)}
          className="block w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-700/30">
          <span className="text-neutral-500">{truncate(toTitle)}</span>
          <span className="mx-1 text-emerald-400">→</span>
          <span className="text-neutral-300">parent of {truncate(fromTitle)}</span>
        </button>
        <div className="my-1 border-t border-neutral-800" />
        <button type="button"
          onClick={() => { useWidgetStore.getState().deleteRelation(relationId); onClose() }}
          className="block w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10">
          Delete Link
        </button>
      </div>
    </>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Link drag preview line (world coordinates, no conversion needed)
// ---------------------------------------------------------------------------

function LinkDragLine({ sourceCenter, cursorWorld }: { sourceCenter: Vector2D; cursorWorld: Vector2D }) {
  const d = curvedPath(sourceCenter, cursorWorld)
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
const RelationLinkPreview = memo(function RelationLinkPreview({
  groupGeo,
}: {
  groupGeo: Record<string, RectGeo>
}) {
  const { linkDrag, source, sourceGroupId } = useWidgetStore(
    useShallow((state) => {
      const drag = state.linkDrag
      return {
        linkDrag: drag,
        source: drag ? state.widgets[drag.sourceId] : undefined,
        sourceGroupId: drag ? state.widgetGroupIndex[drag.sourceId] : undefined,
      }
    }),
  )
  if (!linkDrag || !source) return null

  return (
    <LinkDragLine
      sourceCenter={
        (sourceGroupId && groupGeo[sourceGroupId]?.center) || widgetCenter(source)
      }
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
  // Chunk-quantized camera: edges rebuild only on chunk crossings, not per pan pixel.
  const view = useQuantizedView(EDGE_OVERSCAN_SCREEN)
  const visibleRect = view.rect

  const [menu, setMenu] = useState<{ relationId: string; x: number; y: number } | null>(null)
  useOverlayLifecycle(menu !== null)

  const criticalIds = useMemo(() => {
    if (!criticalPathVisible) return null
    return new Set(getCriticalPath(widgets, relations).relationIds)
  }, [criticalPathVisible, widgets, relations])
  const hoveredAccent = hoveredWidgetId && widgets[hoveredWidgetId]
    ? widgetDefinition(widgets[hoveredWidgetId]!.type).accent
    : null

  // Group bounding boxes for routing — padded to the band's outer extent so
  // edges attach at the visible band, not at inner member bounds.
  const groupGeo = useMemo(() => {
    const out: Record<string, RectGeo> = {}
    for (const groupId in groups) {
      const group = groups[groupId]!
      let anchor: Widget | undefined
      for (const widgetId of group.widgetIds) {
        anchor = widgets[widgetId]
        if (anchor) break
      }
      if (!anchor || anchor.canvasId !== activeCanvasId) continue
      const b = groupWorldBounds(group, widgets)
      if (!b) continue
      out[groupId] = {
        center: { x: b.x + b.width / 2, y: b.y + b.height / 2 },
        halfW: b.width / 2,
        halfH: b.height / 2,
      }
    }
    return out
  }, [activeCanvasId, groups, widgets])

  // Build merged edges: group multiple relations to the same group into one line
  const edges = useMemo((): MergedEdge[] => {
    const edgeMap = new Map<string, {
      fromGeo: EndpointGeo
      toGeo: EndpointGeo
      type: RelationType
      isResolved: boolean
      highlighted: boolean
      hoverAccent: string | null
      singleRelationId: string | null
      priority: number
    }>()
    const edgeBudget = criticalPathVisible ? CRITICAL_EDGE_RENDER_LIMIT : EDGE_RENDER_LIMIT
    let activeRelationCount = 0
    for (const relId in relations) {
      const relation = relations[relId]!
      // Dependencies have their own directional layer. Keeping them out of
      // this budget and edge map prevents a blocker from inheriting generic
      // nearest-border anchors or being merged into an ordinary relation.
      if (relation.type === 'blocker') continue
      const from = widgets[relation.fromId]
      const to = widgets[relation.toId]
      if (from?.canvasId !== activeCanvasId || to?.canvasId !== activeCanvasId) continue
      activeRelationCount++
      // Only the threshold matters. Huge boards avoid a redundant full scan
      // before the real edge-building pass.
      if (activeRelationCount > edgeBudget) break
    }
    // Small and ordinary boards keep every valid edge mounted. Spatial
    // culling is only worth its pop-in tradeoff once the edge budget is under
    // real pressure; this also keeps links stable while cards are moved.
    const cullByViewport = activeRelationCount > edgeBudget

    const endpointCache = new Map<string, EndpointGeo | null>()
    const endpointGeo = (widgetId: string, anchorRegion: EndpointGeo['anchorRegion']): EndpointGeo | null => {
      const groupId = widgetGroupIndex[widgetId]
      const cacheKey = `${groupId ? `group:${groupId}` : `widget:${widgetId}`}:${anchorRegion}`
      if (endpointCache.has(cacheKey)) return endpointCache.get(cacheKey) ?? null

      let result: EndpointGeo | null
      if (groupId) {
        const geo = groupGeo[groupId]
        const group = groups[groupId]
        if (!geo || !group) {
          endpointCache.set(cacheKey, null)
          return null
        }
        result = {
          ...geo,
          anchorRegion,
          pill: {
            cx: geo.center.x,
            cy: geo.center.y - geo.halfH - GROUP_PILL_TOP + PILL_HALF_HEIGHT,
            rx: estimatePillHalfWidth(group.label, GROUP_PILL_CHROME, geo.halfW * 2),
            ry: PILL_HALF_HEIGHT,
          },
        }
      } else {
        const w = widgets[widgetId]
        if (!w) {
          endpointCache.set(cacheKey, null)
          return null
        }
        const center = widgetCenter(w)
        const pillHidden = w.collapsed === true || w.iconified === true
        result = {
          center,
          halfW: w.size.width / 2,
          halfH: w.size.height / 2,
          anchorRegion,
          pill: pillHidden ? null : {
            cx: center.x,
            cy: w.position.y - WIDGET_PILL_TOP + PILL_HALF_HEIGHT,
            rx: estimatePillHalfWidth(w.title, WIDGET_PILL_CHROME, w.size.width),
            ry: PILL_HALF_HEIGHT,
          },
        }
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
      const highlighted = criticalIds?.has(relId) ?? false
      const relationHovered = hoveredWidgetId === rel.fromId || hoveredWidgetId === rel.toId
      const important = highlighted || rel.type === 'conflict'
      if (
        cullByViewport &&
        !important &&
        !widgetIntersectsRect(fromWidget, visibleRect) &&
        !widgetIntersectsRect(toWidget, visibleRect) &&
        !edgeCorridorIntersectsRect(
          widgetCenter(fromWidget),
          widgetCenter(toWidget),
          visibleRect,
          CORRIDOR_MARGIN,
        )
      ) {
        continue
      }

      const fromGroupId = widgetGroupIndex[rel.fromId]
      const toGroupId = widgetGroupIndex[rel.toId]
      // Skip intra-group relations (both ends in same group)
      if (fromGroupId && fromGroupId === toGroupId) continue

      const edgeKey = `${fromGroupId ?? rel.fromId}::${toGroupId ?? rel.toId}`
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
        if (relationHovered) existing.hoverAccent = hoveredAccent
        continue
      }
      if (edgeMap.size >= edgeBudget && !important) continue

      const fromGeo = endpointGeo(rel.fromId, rel.type === 'parent' ? 'lower' : 'any')
      const toGeo = endpointGeo(rel.toId, rel.type === 'parent' ? 'upper' : 'any')
      if (!fromGeo || !toGeo) continue

      edgeMap.set(edgeKey, {
        fromGeo, toGeo,
        type: rel.type,
        isResolved: rel.isResolved,
        highlighted,
        hoverAccent: relationHovered ? hoveredAccent : null,
        singleRelationId: relId,
        priority,
      })
    }

    return Array.from(edgeMap.entries(), ([key, edge]) => {
      if (edge.type === 'parent') {
        // Parent links still choose the nearest legal point on the parent's
        // lower boundary and child's upper boundary, including group hulls
        // and floating name pills. Unlike the old escape route, one vertical
        // cubic joins those adaptive anchors without stubs or reverse bends.
        const { start, end } = pickParentAnchors(edge.fromGeo, edge.toGeo)
        return {
          key,
          d: curvedPath(start, end, 'vertical'),
          mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
          type: edge.type,
          isResolved: edge.isResolved,
          highlighted: edge.highlighted,
          hoverAccent: edge.hoverAccent,
          singleRelationId: edge.singleRelationId,
        }
      }
      const { start, end } = pickAnchors(edge.fromGeo, edge.toGeo)
      return {
        key,
        d: anchoredCurvePath(start, edge.fromGeo.center, end, edge.toGeo.center),
        mid: anchoredCurveMidpoint(start, edge.fromGeo.center, end, edge.toGeo.center),
        type: edge.type,
        isResolved: edge.isResolved,
        highlighted: edge.highlighted,
        hoverAccent: edge.hoverAccent,
        singleRelationId: edge.singleRelationId,
      }
    })
  }, [
    activeCanvasId,
    criticalIds,
    criticalPathVisible,
    groupGeo,
    groups,
    hoveredAccent,
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
  const edgeDetail = edgeDetailFor(view.zoom, edges.length)

  return (
    <>
      <CanvasEdgeLayer
        visibleRect={visibleRect}
        detail={edgeDetail}
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
          <RelationEdge key={edge.key} edge={edge} detail={edgeDetail} onOpenMenu={openMenu} />
        ))}

        <RelationLinkPreview groupGeo={groupGeo} />
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
