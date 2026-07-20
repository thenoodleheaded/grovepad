import type { ModuleType, Widget, WidgetBadge } from '../types/spatial'
import { widgetDefinition } from './registry'

/**
 * Hot flags used by the passive widget surface. They deliberately collapse
 * frequently-read booleans into one primitive number; rich/rare metadata
 * remains on the canonical widget and is only read when an editor activates.
 */
export const PrimitiveWidgetFlag = {
  Collapsed: 1 << 0,
  Iconified: 1 << 1,
  Locked: 1 << 2,
  Favorite: 1 << 3,
  Completed: 1 << 4,
  Hydrating: 1 << 5,
} as const

export type PrimitiveWidgetFlag = (typeof PrimitiveWidgetFlag)[keyof typeof PrimitiveWidgetFlag]

export type PrimitivePreviewKind =
  | 'text'
  | 'list'
  | 'table'
  | 'metric'
  | 'bars'
  | 'palette'
  | 'media'
  | 'generic'

export interface PrimitivePreviewRow {
  readonly label: string
  readonly value?: string
  readonly done?: boolean
  readonly color?: string
  readonly ratio?: number
}

/** Pure, renderer-independent visual data. No callbacks, elements, refs, or
 * runtime state are allowed here, so hundreds of these remain cheap to cache. */
export interface PrimitiveWidgetVisual {
  readonly kind: PrimitivePreviewKind
  readonly primary?: string
  readonly secondary?: string
  readonly rows: readonly PrimitivePreviewRow[]
  readonly progress?: number
  readonly colors?: readonly string[]
  readonly mediaUrl?: string
}

/**
 * Scalar projection consumed by the passive widget layer. `data` and nested
 * metadata never cross this boundary. The rich Widget object remains the v2
 * persistence compatibility representation until the migration is complete.
 */
export interface PrimitiveWidget {
  readonly id: string
  readonly type: ModuleType
  readonly canvasId: string
  readonly title: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly expandedWidth: number
  readonly expandedHeight: number
  readonly flags: number
  readonly zIndex: number
  readonly accent: string
  readonly badges: readonly WidgetBadge[]
  readonly visual: PrimitiveWidgetVisual
}

const projectionCache = new WeakMap<Widget, PrimitiveWidget>()
const MAX_ROWS = 10
const MAX_TEXT = 900

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value.slice(0, MAX_TEXT)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return undefined
}

function labelFor(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (character) => character.toUpperCase())
}

function itemLabel(value: unknown): string | undefined {
  if (!isRecord(value)) return text(value)
  for (const key of ['label', 'text', 'title', 'name', 'question', 'topic', 'date']) {
    const candidate = text(value[key])
    if (candidate) return candidate
  }
  return undefined
}

function itemValue(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  for (const key of ['value', 'amount', 'count', 'status', 'unit', 'role', 'due', 'time']) {
    const candidate = text(value[key])
    if (candidate !== undefined) return candidate
  }
  return undefined
}

function listRows(value: unknown): PrimitivePreviewRow[] {
  if (!Array.isArray(value)) return []
  const rows: PrimitivePreviewRow[] = []
  for (const item of value) {
    if (rows.length >= MAX_ROWS) break
    const label = itemLabel(item)
    if (!label) continue
    rows.push({
      label,
      value: itemValue(item),
      done: isRecord(item) && (item.done === true || item.completed === true),
      color: isRecord(item) && typeof item.color === 'string' ? item.color : undefined,
      ratio:
        isRecord(item) && typeof item.value === 'number' && Number.isFinite(item.value)
          ? Math.max(0, item.value)
          : undefined,
    })
  }
  return rows
}

function genericRows(data: Record<string, unknown>): PrimitivePreviewRow[] {
  const rows: PrimitivePreviewRow[] = []
  for (const [key, value] of Object.entries(data)) {
    if (rows.length >= MAX_ROWS || key === 'mode' || key === 'id') continue
    const primitive = text(value)
    if (primitive !== undefined) {
      rows.push({ label: labelFor(key), value: primitive })
      continue
    }
    if (Array.isArray(value)) {
      const items = listRows(value)
      if (items.length > 0) rows.push(...items.slice(0, MAX_ROWS - rows.length))
    }
  }
  return rows
}

function previewFor(type: ModuleType, data: unknown): PrimitiveWidgetVisual {
  if (!isRecord(data)) return { kind: 'generic', rows: [] }

  if (type === 'notes' || type === 'sticky_note' || type === 'quote') {
    return {
      kind: 'text',
      primary: text(data.text),
      secondary: text(data.attribution),
      rows: [],
    }
  }

  if (type === 'code') {
    return {
      kind: 'text',
      primary: text(data.code),
      secondary: text(data.language),
      rows: [],
    }
  }

  if (type === 'table' && Array.isArray(data.rows)) {
    return {
      kind: 'table',
      rows: data.rows.slice(0, MAX_ROWS).map((row, index) => ({
        label: Array.isArray(row) ? row.map((cell) => text(cell) ?? '').join(' · ') : '',
        done: index === 0,
      })),
    }
  }

  const firstList = ['items', 'cards', 'actions', 'options', 'phases', 'tiles', 'milestones']
    .map((key) => data[key])
    .find(Array.isArray)
  if (firstList) {
    return {
      kind: type === 'metrics' ? 'metric' : type === 'bar_chart' ? 'bars' : 'list',
      primary: text(data.label) ?? text(data.title) ?? text(data.question) ?? text(data.topic),
      secondary: text(data.currency) ?? text(data.unit),
      rows: listRows(firstList),
    }
  }

  if (type === 'bar_chart' && Array.isArray(data.bars)) {
    return {
      kind: 'bars',
      primary: text(data.title),
      secondary: text(data.unit),
      rows: listRows(data.bars),
    }
  }

  if (type === 'color_palette' && Array.isArray(data.colors)) {
    return {
      kind: 'palette',
      rows: [],
      colors: data.colors.filter((color): color is string => typeof color === 'string').slice(0, 12),
    }
  }

  if (type === 'media') {
    return {
      kind: 'media',
      primary: text(data.caption) ?? text(data.altText),
      rows: [],
      mediaUrl: typeof data.url === 'string' && !data.url.startsWith('data:') ? data.url : undefined,
    }
  }

  const percent = typeof data.percent === 'number'
    ? data.percent
    : typeof data.progress === 'number'
      ? data.progress
      : undefined
  if (percent !== undefined) {
    return {
      kind: 'metric',
      primary: text(data.label) ?? text(data.goal),
      secondary: `${Math.round(percent)}%`,
      rows: genericRows(data),
      progress: Math.max(0, Math.min(1, percent / 100)),
    }
  }

  return {
    kind: 'generic',
    primary: text(data.label) ?? text(data.title) ?? text(data.question) ?? text(data.topic),
    rows: genericRows(data),
  }
}

export function hasPrimitiveFlag(widget: PrimitiveWidget, flag: PrimitiveWidgetFlag): boolean {
  return (widget.flags & flag) !== 0
}

/** One immutable primitive object per canonical Widget object. Zustand keeps
 * unchanged Widget objects by reference, so ordinary edits only regenerate
 * the projection for the widget that actually changed. */
export function primitiveWidget(widget: Widget): PrimitiveWidget {
  const cached = projectionCache.get(widget)
  if (cached) return cached

  let flags = 0
  if (widget.collapsed) flags |= PrimitiveWidgetFlag.Collapsed
  if (widget.iconified) flags |= PrimitiveWidgetFlag.Iconified
  if (widget.metadata.locked) flags |= PrimitiveWidgetFlag.Locked
  if (widget.metadata.favorite) flags |= PrimitiveWidgetFlag.Favorite
  if (widget.metadata.completed) flags |= PrimitiveWidgetFlag.Completed
  if (widget.isHydrating) flags |= PrimitiveWidgetFlag.Hydrating

  const definition = widgetDefinition(widget.type)
  const projected: PrimitiveWidget = Object.freeze({
    id: widget.id,
    type: widget.type,
    canvasId: widget.canvasId,
    title: widget.title,
    x: widget.position.x,
    y: widget.position.y,
    width: widget.size.width,
    height: widget.size.height,
    expandedWidth: widget.expandedSize?.width ?? widget.size.width,
    expandedHeight: widget.expandedSize?.height ?? widget.size.height,
    flags,
    zIndex: widget.metadata.zIndex ?? 0,
    accent: widget.metadata.accent ?? definition.accent,
    badges: widget.metadata.badges,
    visual: previewFor(widget.type, widget.data),
  })
  projectionCache.set(widget, projected)
  return projected
}
