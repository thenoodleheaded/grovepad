import type { Size, Widget } from '../types/spatial'
import { restingFace, type RestingFaceModel } from './restingFace'
import { widgetDefinition } from '../widgets/registry'
import { widgetAccent } from './widgetSkins'

const PREVIEW_CACHE_LIMIT = 512
const MAX_TITLE_CHARS = 28
const MAX_SUMMARY_CHARS = 44
const previewCache = new Map<string, string>()

function compact(value: string, limit: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > limit ? `${clean.slice(0, limit - 1).trimEnd()}…` : clean
}

function modelSummary(model: RestingFaceModel): string {
  switch (model.kind) {
    case 'metric':
      return `${model.primary} ${model.secondary}`
    case 'boolean':
      return `${model.label} ${model.active ? 'on' : 'off'}`
    case 'text':
      return model.text
    case 'note':
      return model.lines.slice(0, 2).map((line) => line.text).filter(Boolean).join(' · ')
    case 'rows':
      return model.rows.slice(0, 2).map((row) => row.label).join(' · ')
    case 'stars':
      return `${model.value}/5`
    case 'chart':
      return model.stats.slice(0, 2).map((stat) => `${stat.label} ${stat.value}`).join(' · ')
    case 'palette':
      return 'Palette'
    case 'clock':
      return 'Timer'
    case 'image':
      return 'Image'
    // Skin grammars: far zoom cannot draw a board or a month, so each one
    // states the same reading in words instead of dropping to a bare glyph.
    case 'columns':
      return model.columns
        .slice(0, 3)
        .map((column) => `${column.label} ${column.note ?? column.items.length}`)
        .join(' · ')
    case 'grid':
      return model.cells
        .filter((cell) => cell.current)
        .slice(0, 1)
        .map((cell) => cell.text)
        .join('') || model.eyebrow?.label || 'Grid'
    case 'bars':
      return model.bars.slice(0, 2).map((bar) => `${bar.label} ${bar.value}`).join(' · ')
    case 'gauge':
      return `${model.primary} ${model.secondary}`
    case 'chips':
      return model.chips.slice(0, 3).map((chip) => chip.text).join(' · ')
    case 'lines':
      return (model.total ?? model.lines.at(-1))
        ? `${(model.total ?? model.lines.at(-1))!.left} ${(model.total ?? model.lines.at(-1))!.right ?? ''}`.trim()
        : ''
    case 'chain':
      return model.nodes.slice(0, 3).map((node) => node.label).join(' → ')
    case 'timeline':
      return model.lanes.slice(0, 2).map((lane) => lane.label).join(' · ')
    case 'split':
      return `${model.left.primary} ${model.divider ?? '·'} ${model.right.primary}`
    case 'paper':
      return model.eyebrow?.label ?? 'Drawing'
    case 'icon':
      return ''
  }
}

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function remember(key: string, value: string): string {
  if (previewCache.has(key)) previewCache.delete(key)
  previewCache.set(key, value)
  if (previewCache.size > PREVIEW_CACHE_LIMIT) {
    const oldest = previewCache.keys().next().value as string | undefined
    if (oldest) previewCache.delete(oldest)
  }
  return value
}

/**
 * A compact vector image, not a DOM screenshot. It is cheap to create, shares
 * browser image decoding, and deliberately contains only readable far-zoom
 * identity rather than hundreds of invisible controls.
 */
export function lightweightWidgetPreviewImage(widget: Widget, size: Size): string {
  const def = widgetDefinition(widget.type)
  const accent = widgetAccent(widget, def)
  const face = restingFace(widget)
  const title = compact(widget.title || def.label, MAX_TITLE_CHARS)
  const summary = compact(modelSummary(face.model), MAX_SUMMARY_CHARS)
  const aspect = Math.max(0.45, Math.min(3.5, size.width / Math.max(1, size.height)))
  const width = Math.max(48, Math.min(96, Math.round(64 * Math.sqrt(aspect))))
  const height = Math.max(32, Math.min(72, Math.round(width / aspect)))
  const glyph = compact(def.label, 1).toUpperCase()
  const key = `${widget.type}|${accent}|${width}x${height}|${title}|${summary}`
  const cached = previewCache.get(key)
  if (cached) {
    previewCache.delete(key)
    previewCache.set(key, cached)
    return cached
  }

  const titleY = Math.max(17, Math.round(height * 0.42))
  const summaryY = Math.min(height - 8, titleY + 13)
  const radius = Math.max(6, Math.round(Math.min(width, height) * 0.16))
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" rx="${radius}" fill="#090b0a"/>` +
    `<rect x=".75" y=".75" width="${width - 1.5}" height="${height - 1.5}" rx="${Math.max(5, radius - 1)}" fill="none" stroke="${xml(accent)}" stroke-opacity=".42" stroke-width="1.5"/>` +
    `<circle cx="12" cy="12" r="7" fill="${xml(accent)}" fill-opacity=".18"/>` +
    `<text x="12" y="15" text-anchor="middle" font-family="Clash Display,sans-serif" font-size="8" font-weight="700" fill="${xml(accent)}">${xml(glyph)}</text>` +
    `<text x="23" y="${titleY}" font-family="Clash Display,sans-serif" font-size="8" font-weight="650" fill="#f2f5f3">${xml(title)}</text>` +
    (summary
      ? `<text x="8" y="${summaryY}" font-family="Clash Display,sans-serif" font-size="6.5" fill="#89918d">${xml(summary)}</text>`
      : '') +
    `<rect x="8" y="${height - 4}" width="${Math.max(12, width * 0.32)}" height="1.5" rx=".75" fill="${xml(accent)}" fill-opacity=".72"/>` +
    `</svg>`

  return remember(key, `data:image/svg+xml,${encodeURIComponent(svg)}`)
}

export function widgetPreviewCacheSize(): number {
  return previewCache.size
}
