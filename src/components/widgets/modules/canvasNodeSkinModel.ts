import type { CanvasMeta, Widget, WidgetBadge } from '../../../types/spatial'

export type CanvasNodeSkin =
  | 'portal'
  | 'cover'
  | 'live_thumbnail'
  | 'dashboard_door'
  | 'folder_index'

export interface CanvasCoverState {
  eyebrow: string
  subtitle: string
}

export interface CanvasPreviewItem {
  id: string
  x: number
  y: number
  width: number
  height: number
  completed: boolean
}

export interface CanvasNodeSummary {
  widgetCount: number
  completedCount: number
  completionPercent: number
  attentionCount: number
  favoriteCount: number
  childCanvases: CanvasMeta[]
  typeCounts: Array<{ type: string; count: number }>
}

const CANVAS_NODE_SKINS = new Set<CanvasNodeSkin>([
  'portal',
  'cover',
  'live_thumbnail',
  'dashboard_door',
  'folder_index',
])

export function canvasNodeSkin(raw: unknown): CanvasNodeSkin {
  return typeof raw === 'string' && CANVAS_NODE_SKINS.has(raw as CanvasNodeSkin)
    ? raw as CanvasNodeSkin
    : 'portal'
}

export function canvasCoverState(raw: unknown): CanvasCoverState {
  const state = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  return {
    eyebrow: typeof state.eyebrow === 'string'
      ? state.eyebrow.slice(0, 40)
      : 'Open canvas',
    subtitle: typeof state.subtitle === 'string'
      ? state.subtitle.slice(0, 160)
      : '',
  }
}

function badgeNeedsAttention(badge: WidgetBadge): boolean {
  return (
    (badge.type === 'status_dot' && badge.color === 'red') ||
    (badge.type === 'priority_flag' && badge.level === 'critical')
  )
}

export function summarizeCanvasNode(
  canvasId: string,
  canvases: Record<string, CanvasMeta>,
  widgets: Record<string, Widget>,
): CanvasNodeSummary {
  const members = Object.values(widgets).filter((widget) => widget.canvasId === canvasId)
  const completedCount = members.filter((widget) => widget.metadata.completed).length
  const typeFrequencies = new Map<string, number>()
  let attentionCount = 0
  let favoriteCount = 0

  for (const widget of members) {
    typeFrequencies.set(widget.type, (typeFrequencies.get(widget.type) ?? 0) + 1)
    if (widget.metadata.favorite) favoriteCount += 1
    if (widget.metadata.badges.some(badgeNeedsAttention)) attentionCount += 1
  }

  return {
    widgetCount: members.length,
    completedCount,
    completionPercent: members.length === 0
      ? 0
      : Math.round((completedCount / members.length) * 100),
    attentionCount,
    favoriteCount,
    childCanvases: Object.values(canvases)
      .filter((canvas) => canvas.parentCanvasId === canvasId)
      .sort((left, right) => left.name.localeCompare(right.name)),
    typeCounts: [...typeFrequencies.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type)),
  }
}

export function canvasPreviewItems(
  canvasId: string,
  widgets: Record<string, Widget>,
  limit = 24,
): CanvasPreviewItem[] {
  const members = Object.values(widgets)
    .filter((widget) => widget.canvasId === canvasId)
    .slice(0, Math.max(0, limit))
  if (members.length === 0) return []

  const left = Math.min(...members.map((widget) => widget.position.x))
  const top = Math.min(...members.map((widget) => widget.position.y))
  const right = Math.max(...members.map((widget) => widget.position.x + widget.size.width))
  const bottom = Math.max(...members.map((widget) => widget.position.y + widget.size.height))
  const spanX = Math.max(1, right - left)
  const spanY = Math.max(1, bottom - top)
  const scale = Math.min(88 / spanX, 76 / spanY)
  const drawnWidth = spanX * scale
  const drawnHeight = spanY * scale
  const offsetX = (100 - drawnWidth) / 2
  const offsetY = (88 - drawnHeight) / 2 + 6

  return members.map((widget) => ({
    id: widget.id,
    x: offsetX + (widget.position.x - left) * scale,
    y: offsetY + (widget.position.y - top) * scale,
    width: Math.max(3.5, widget.size.width * scale),
    height: Math.max(4, widget.size.height * scale),
    completed: Boolean(widget.metadata.completed),
  }))
}
