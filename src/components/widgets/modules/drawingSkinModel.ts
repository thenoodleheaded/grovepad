import type {
  DrawingMode,
  SketchpadPoint,
  SketchpadStroke,
} from '../../../types/spatial'

export interface StoryboardFrame {
  id: string
  caption: string
  shot: string
  strokes: readonly SketchpadStroke[]
}

export interface StoryboardState {
  activeId: string
  frames: StoryboardFrame[]
}

export interface AnnotationState {
  sourceUrl: string
  localBlobKey: string
  mimeType: string
  fileName: string
  opacity: number
}

const DRAWING_MODES = new Set<DrawingMode>([
  'ink',
  'whiteboard',
  'graph_paper',
  'dot_grid',
  'storyboard',
  'annotation',
  'diagram',
])

const DEFAULT_FRAMES: StoryboardFrame[] = Array.from({ length: 4 }, (_, index) => ({
  id: `frame-${index + 1}`,
  caption: index === 0 ? 'Opening beat' : '',
  shot: index === 0 ? 'Wide' : '',
  strokes: [],
}))

function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
}

function text(raw: unknown, limit = 160): string {
  return typeof raw === 'string' ? raw.slice(0, limit) : ''
}

function finite(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

function point(raw: unknown): SketchpadPoint | null {
  const value = record(raw)
  const x = finite(value.x)
  const y = finite(value.y)
  const pressure = finite(value.pressure)
  if (x === null || y === null || pressure === null) return null
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
    pressure: Math.min(1, Math.max(0, pressure)),
  }
}

function stroke(raw: unknown, fallbackId: string): SketchpadStroke | null {
  const value = record(raw)
  if (!Array.isArray(value.points)) return null
  const points = value.points.map(point).filter((item): item is SketchpadPoint => item !== null)
  if (points.length === 0) return null
  return {
    id: text(value.id, 100) || fallbackId,
    color: /^#[0-9a-f]{6}$/i.test(text(value.color, 20)) ? text(value.color, 20) : '#172033',
    size: Math.min(24, Math.max(1, finite(value.size) ?? 4)),
    points: points.slice(0, 20_000),
  }
}

export function drawingMode(raw: unknown): DrawingMode {
  return typeof raw === 'string' && DRAWING_MODES.has(raw as DrawingMode)
    ? raw as DrawingMode
    : 'ink'
}

export function storyboardState(raw: unknown): StoryboardState {
  const value = record(raw)
  const requested = Array.isArray(value.frames) ? value.frames.slice(0, 8) : []
  const ids = new Set<string>()
  const frames = requested.flatMap((candidate, index): StoryboardFrame[] => {
    const frame = record(candidate)
    const id = text(frame.id, 100) || `frame-${index + 1}`
    if (ids.has(id)) return []
    ids.add(id)
    const strokes = Array.isArray(frame.strokes)
      ? frame.strokes.map((item, strokeIndex) => stroke(item, `${id}-stroke-${strokeIndex + 1}`)).filter((item): item is SketchpadStroke => item !== null)
      : []
    return [{
      id,
      caption: text(frame.caption),
      shot: text(frame.shot, 60),
      strokes,
    }]
  })
  const safeFrames = frames.length > 0 ? frames : DEFAULT_FRAMES.map((frame) => ({ ...frame }))
  const requestedActive = text(value.activeId, 100)
  return {
    activeId: safeFrames.some((frame) => frame.id === requestedActive)
      ? requestedActive
      : safeFrames[0]!.id,
    frames: safeFrames,
  }
}

export function annotationState(raw: unknown): AnnotationState {
  const value = record(raw)
  return {
    sourceUrl: text(value.sourceUrl, 4_000),
    localBlobKey: text(value.localBlobKey, 300),
    mimeType: text(value.mimeType, 100),
    fileName: text(value.fileName, 240),
    opacity: Math.min(1, Math.max(0.15, finite(value.opacity) ?? 0.78)),
  }
}

export function safeDrawingReferenceUrl(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'data:'
      ? value
      : ''
  } catch {
    return ''
  }
}

export function drawingDisplayColor(color: string, mode: DrawingMode): string {
  if (mode === 'ink' || mode === 'diagram') return color
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
  if (!match) return color
  const [red, green, blue] = match.slice(1).map((channel) => Number.parseInt(channel!, 16))
  const luminance = (red! * 0.2126 + green! * 0.7152 + blue! * 0.0722) / 255
  return luminance > 0.86 ? '#172033' : color
}

export function drawingContentCount(
  mode: DrawingMode,
  strokes: readonly SketchpadStroke[],
  diagramElements: readonly unknown[],
  specialistState: unknown,
): number {
  if (mode === 'diagram') return diagramElements.length
  if (mode === 'storyboard') {
    return storyboardState(specialistState).frames.reduce(
      (total, frame) => total + frame.strokes.length,
      0,
    )
  }
  return strokes.length
}
