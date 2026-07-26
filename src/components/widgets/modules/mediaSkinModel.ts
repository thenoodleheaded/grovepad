/**
 * Media skin data and the small pure helpers its renderers share.
 *
 * `MediaData.url`, `caption`, and `altText` stay the canonical fields every
 * skin reads and writes. Anything only one skin needs — a comparison's second
 * image, a gallery's item list, a moodboard's placements — lives in that
 * skin's own pocket of `skinStates`, so switching views never destroys work
 * done in another one.
 */

export type MediaSkinMode =
  | 'image'
  | 'video'
  | 'audio'
  | 'document_preview'
  | 'before_after'
  | 'gallery'
  | 'moodboard'

export type MediaFit = 'cover' | 'contain'

export interface MediaGalleryItem {
  id: string
  url: string
  caption: string
}

export interface MoodboardItem extends MediaGalleryItem {
  /** Normalised 0–1 placement of the tile's centre inside the board. */
  x: number
  y: number
  /** Tile width as a fraction of the board's width. */
  scale: number
}

const SKIN_MODES = new Set<MediaSkinMode>([
  'image',
  'video',
  'audio',
  'document_preview',
  'before_after',
  'gallery',
  'moodboard',
])

export function mediaSkinMode(raw: unknown): MediaSkinMode {
  return typeof raw === 'string' && SKIN_MODES.has(raw as MediaSkinMode)
    ? raw as MediaSkinMode
    : 'image'
}

export function mediaFit(raw: unknown): MediaFit {
  return raw === 'contain' ? 'contain' : 'cover'
}

export function clampPercent(raw: unknown, fallback = 50): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(100, Math.max(0, Math.round(value)))
}

function clampUnit(raw: unknown, fallback: number): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}

/**
 * Only addresses a browser will fetch as media, and never a scheme that can
 * execute (`javascript:`, `vbscript:`) or read the user's disk (`file:`).
 * Persisted board data is untrusted input: it may have arrived from an import,
 * a shared canvas, or the MCP connector.
 */
export function safeMediaUrl(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const value = raw.trim()
  if (!value) return ''
  if (/^(https?:|blob:)/i.test(value)) return value
  if (/^data:(image|video|audio)\//i.test(value)) return value
  return ''
}

/** A link the user may follow. Data and blob URLs are never navigations. */
export function safeLinkUrl(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const value = raw.trim()
  return /^https?:\/\//i.test(value) ? value : ''
}

function pathOf(url: string): string {
  try {
    return new URL(url, 'https://placeholder.invalid').pathname
  } catch {
    return url.split(/[?#]/)[0] ?? ''
  }
}

export function mediaFileName(url: string): string {
  const segment = pathOf(url).split('/').filter(Boolean).pop() ?? ''
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export function mediaExtension(url: string): string {
  const name = mediaFileName(url)
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toUpperCase().slice(0, 5)
}

export function mediaHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

const VIDEO_EXTENSIONS = new Set(['MP4', 'WEBM', 'OGV', 'MOV', 'M4V'])
const AUDIO_EXTENSIONS = new Set(['MP3', 'WAV', 'OGG', 'M4A', 'AAC', 'FLAC', 'OPUS'])
const IMAGE_EXTENSIONS = new Set(['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'AVIF', 'SVG', 'BMP'])

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'unknown'

export function mediaKind(url: string): MediaKind {
  if (/^data:image\//i.test(url) || /^blob:/i.test(url)) return 'image'
  if (/^data:video\//i.test(url)) return 'video'
  if (/^data:audio\//i.test(url)) return 'audio'
  const extension = mediaExtension(url)
  if (!extension) return 'unknown'
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  return 'document'
}

/** Hosts that only play inside their own embed — we link out instead. */
export function externalPlayerName(url: string): string {
  const host = mediaHost(url)
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return 'YouTube'
  if (/(^|\.)vimeo\.com$/.test(host)) return 'Vimeo'
  if (/(^|\.)soundcloud\.com$/.test(host)) return 'SoundCloud'
  if (/(^|\.)spotify\.com$/.test(host)) return 'Spotify'
  return ''
}

export function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  if (minutes < 60) return `${minutes}:${String(rest).padStart(2, '0')}`
  const hours = Math.floor(minutes / 60)
  return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

function readItem(raw: unknown): MediaGalleryItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<MediaGalleryItem>
  if (typeof item.id !== 'string' || !item.id) return null
  return {
    id: item.id,
    url: typeof item.url === 'string' ? item.url : '',
    caption: typeof item.caption === 'string' ? item.caption.slice(0, 240) : '',
  }
}

/** Bounded so a corrupt or hostile board cannot mount thousands of images. */
export const MEDIA_ITEM_LIMIT = 40

export function mediaGalleryItems(raw: unknown): MediaGalleryItem[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MEDIA_ITEM_LIMIT).flatMap((entry) => {
    const item = readItem(entry)
    return item ? [item] : []
  })
}

export function moodboardItems(raw: unknown): MoodboardItem[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MEDIA_ITEM_LIMIT).flatMap((entry, index) => {
    const item = readItem(entry)
    if (!item) return []
    const source = entry as Partial<MoodboardItem>
    return [{
      ...item,
      x: clampUnit(source.x, 0.2 + (index % 3) * 0.3),
      y: clampUnit(source.y, 0.25 + Math.floor(index / 3) * 0.25),
      scale: Math.min(0.9, Math.max(0.16, clampUnit(source.scale, 0.34) || 0.34)),
    }]
  })
}

/**
 * A moodboard tile is placed by its centre, so a raw 0–1 clamp would let half
 * a photograph hang off the board and read as broken rather than arranged.
 * The horizontal bound is the tile's own half-width; the vertical one is a
 * fixed margin, since a tile's height depends on the picture inside it.
 */
export function clampMoodboardPlacement(
  x: number,
  y: number,
  scale = 0.34,
): { x: number; y: number } {
  const halfWidth = Math.min(0.45, Math.max(0.08, scale / 2))
  return {
    x: Math.min(1 - halfWidth, Math.max(halfWidth, clampUnit(x, 0.5))),
    y: Math.min(0.86, Math.max(0.14, clampUnit(y, 0.5))),
  }
}
