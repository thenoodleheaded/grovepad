import type { BulletItem } from '../../../types/spatial'

export type BulletSkin =
  | 'dots'
  | 'numbered'
  | 'compact_chips'
  | 'two_column'
  | 'nested_outline'
  | 'rolling_log'

export interface BulletOutlineState {
  levels: Record<string, number>
  collapsedIds: string[]
}

export interface BulletLogState {
  order: 'newest' | 'oldest'
  timestamps: Record<string, string>
}

export interface VisibleOutlineItem {
  item: BulletItem
  index: number
  level: number
  hasChildren: boolean
  collapsed: boolean
}

const BULLET_SKINS = new Set<BulletSkin>([
  'dots',
  'numbered',
  'compact_chips',
  'two_column',
  'nested_outline',
  'rolling_log',
])

export function bulletSkin(raw: unknown): BulletSkin {
  return typeof raw === 'string' && BULLET_SKINS.has(raw as BulletSkin)
    ? raw as BulletSkin
    : 'dots'
}

function safeRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
}

export function bulletOutlineState(
  raw: unknown,
  items: readonly BulletItem[],
): BulletOutlineState {
  const state = safeRecord(raw)
  const rawLevels = safeRecord(state.levels)
  const itemIds = new Set(items.map((item) => item.id))
  const levels: Record<string, number> = {}
  let previousLevel = 0

  items.forEach((item, index) => {
    const requested = typeof rawLevels[item.id] === 'number' && Number.isFinite(rawLevels[item.id])
      ? Math.round(rawLevels[item.id] as number)
      : 0
    const level = index === 0
      ? 0
      : Math.min(3, Math.max(0, Math.min(requested, previousLevel + 1)))
    if (level > 0) levels[item.id] = level
    previousLevel = level
  })

  return {
    levels,
    collapsedIds: Array.isArray(state.collapsedIds)
      ? [...new Set(state.collapsedIds.filter(
          (id): id is string => typeof id === 'string' && itemIds.has(id),
        ))]
      : [],
  }
}

export function visibleOutlineItems(
  items: readonly BulletItem[],
  state: BulletOutlineState,
): VisibleOutlineItem[] {
  const collapsed = new Set(state.collapsedIds)
  const result: VisibleOutlineItem[] = []
  let hiddenBelowLevel: number | null = null

  items.forEach((item, index) => {
    const level = state.levels[item.id] ?? 0
    if (hiddenBelowLevel !== null) {
      if (level > hiddenBelowLevel) return
      hiddenBelowLevel = null
    }
    const next = items[index + 1]
    const hasChildren = Boolean(next && (state.levels[next.id] ?? 0) > level)
    const isCollapsed = hasChildren && collapsed.has(item.id)
    result.push({ item, index, level, hasChildren, collapsed: isCollapsed })
    if (isCollapsed) hiddenBelowLevel = level
  })

  return result
}

export function bulletLogState(
  raw: unknown,
  items: readonly BulletItem[],
): BulletLogState {
  const state = safeRecord(raw)
  const rawTimestamps = safeRecord(state.timestamps)
  const itemIds = new Set(items.map((item) => item.id))
  const timestamps: Record<string, string> = {}
  for (const [id, value] of Object.entries(rawTimestamps)) {
    if (
      itemIds.has(id) &&
      typeof value === 'string' &&
      Number.isFinite(Date.parse(value))
    ) {
      timestamps[id] = value
    }
  }
  return {
    order: state.order === 'oldest' ? 'oldest' : 'newest',
    timestamps,
  }
}

export function orderedLogItems(
  items: readonly BulletItem[],
  state: BulletLogState,
): BulletItem[] {
  return items
    .map((item, index) => ({
      item,
      index,
      timestamp: state.timestamps[item.id]
        ? Date.parse(state.timestamps[item.id]!)
        : Number.NEGATIVE_INFINITY,
    }))
    .sort((left, right) => {
      if (left.timestamp === right.timestamp) {
        return state.order === 'newest'
          ? right.index - left.index
          : left.index - right.index
      }
      return state.order === 'newest'
        ? right.timestamp - left.timestamp
        : left.timestamp - right.timestamp
    })
    .map(({ item }) => item)
}
