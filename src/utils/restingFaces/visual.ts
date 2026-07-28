import type { SketchpadStroke } from '../../types/spatial'
import {
  canvasCoverState,
  canvasNodeSkin,
} from '../../components/widgets/modules/canvasNodeSkinModel'
import {
  annotationState,
  drawingMode,
  storyboardState,
} from '../../components/widgets/modules/drawingSkinModel'
import {
  externalPlayerName,
  mediaExtension,
  mediaFileName,
  mediaGalleryItems,
  mediaHost,
  mediaKind,
  mediaSkinMode,
  moodboardItems,
  safeMediaUrl,
} from '../../components/widgets/modules/mediaSkinModel'
import {
  compact,
  record,
  REST_CHIP_LIMIT,
  REST_STROKE_LIMIT,
  type RestingFaceModel,
  type RestRow,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// The visual families: Media, Sketchpad, Canvas node.
//
// Two rules run through all three. A card whose content is a picture rests as
// that picture — no glass, no summary, the photograph itself. A card whose
// content is a drawing rests as its own paper with a bounded ink preview: the
// ruling identifies the surface (squared, dotted, whiteboard, storyboard) and
// a handful of simplified strokes identify the drawing, at a fixed cost no
// matter how many thousands of points were captured.
// ---------------------------------------------------------------------------

/** Points per preserved stroke. Enough to keep a gesture's shape, few enough
 * that the whole preview is a couple of dozen path commands. */
const STROKE_SAMPLES = 8

/* -------------------------------------------------------------------- Media */

export function mediaRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const skin = mediaSkinMode(data.skin)
  const url = safeMediaUrl(data.url)
  const hasLocal = typeof data.localBlobKey === 'string' && data.localBlobKey !== ''
  const states = record(data.skinStates) ?? {}
  const caption = typeof data.caption === 'string' ? data.caption.trim() : ''

  if (skin === 'gallery' || skin === 'moodboard') {
    const items = skin === 'gallery'
      ? mediaGalleryItems((record(states.gallery) ?? {}).items)
      : moodboardItems((record(states.moodboard) ?? {}).items)
    // A cover exists: the card IS that picture, exactly as it opens.
    if (url || hasLocal) return { kind: 'image' }
    if (items.length === 0) return { kind: 'icon' }
    const visible = items.slice(0, REST_CHIP_LIMIT)
    return {
      kind: 'chips',
      chips: visible.map((item, index) => ({
        key: item.id || `item-${index}`,
        text: compact(item.caption || mediaFileName(item.url) || `Item ${index + 1}`, 14),
        filled: true,
      })),
      overflow: Math.max(0, items.length - visible.length),
    }
  }

  // Anything that IS a picture rests as the picture — `before_after`
  // included, because its base image is what the open card shows under the
  // handle. The skin alone is not enough: a PDF filed under the Image skin is
  // still a PDF, and rendering it into an <img> would show a broken tile.
  if (hasLocal || mediaKind(url) === 'image') return { kind: 'image' }
  if (!url) return { kind: 'icon' }

  const rows: RestRow[] = [{
    key: 'file',
    label: compact(caption || mediaFileName(url) || url, 26),
  }]
  const host = mediaHost(url)
  if (host) rows.push({ key: 'host', label: 'From', value: compact(host, 18), tone: 'muted' })
  const player = externalPlayerName(url)
  if (player) rows.push({ key: 'player', label: 'Plays on', value: compact(player, 16), tone: 'muted' })

  return {
    kind: 'rows',
    eyebrow: {
      label: skin === 'document_preview'
        ? compact(mediaExtension(url).toUpperCase() || 'Document', 12)
        : skin === 'audio' ? 'Audio' : skin === 'video' ? 'Video' : 'Media',
    },
    rows,
    overflow: 0,
  }
}

/* ---------------------------------------------------------------- Sketchpad */

function sketchStrokes(raw: unknown): SketchpadStroke[] {
  if (!Array.isArray(raw)) return []
  const strokes: SketchpadStroke[] = []
  for (const entry of raw) {
    const value = record(entry)
    if (!value || !Array.isArray(value.points) || value.points.length === 0) continue
    strokes.push(value as unknown as SketchpadStroke)
    if (strokes.length >= REST_STROKE_LIMIT) break
  }
  return strokes
}

/**
 * One stroke reduced to an SVG path in a 0–100 box. Points are already
 * normalized 0–1 by the drawing model, and evenly sampling a fixed number of
 * them keeps the gesture's shape while making the cost of a ten-thousand-point
 * stroke identical to the cost of a ten-point one.
 */
function strokePath(stroke: SketchpadStroke): string | null {
  const points = stroke.points
  if (points.length === 0) return null
  const step = Math.max(1, Math.floor(points.length / STROKE_SAMPLES))
  const sampled: string[] = []
  for (let index = 0; index < points.length; index += step) {
    const point = points[index]!
    sampled.push(`${(point.x * 100).toFixed(1)} ${(point.y * 100).toFixed(1)}`)
  }
  // The end of the gesture always survives sampling; without it a stroke that
  // does not divide evenly stops short of where the pen actually lifted.
  const last = points.at(-1)!
  const tail = `${(last.x * 100).toFixed(1)} ${(last.y * 100).toFixed(1)}`
  if (sampled.at(-1) !== tail) sampled.push(tail)
  if (sampled.length === 1) return `M ${sampled[0]} l 0.4 0`
  return `M ${sampled[0]} L ${sampled.slice(1).join(' L ')}`
}

export function sketchpadRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const mode = drawingMode(data.mode)
  const states = record(data.skinStates) ?? {}

  if (mode === 'storyboard') {
    const state = storyboardState(states.storyboard)
    const active = state.frames.find((frame) => frame.id === state.activeId) ?? state.frames[0]
    const drawn = state.frames.filter((frame) => frame.strokes.length > 0).length
    return {
      kind: 'paper',
      pattern: 'frames',
      frames: state.frames.length,
      strokes: sketchStrokes(active?.strokes).map(strokePath).filter((path): path is string => path !== null),
      eyebrow: {
        label: compact(active?.caption?.trim() || 'Storyboard', 18),
        note: `${drawn}/${state.frames.length}`,
      },
    }
  }

  const strokes = sketchStrokes(data.strokes)
  const paths = strokes.map(strokePath).filter((path): path is string => path !== null)

  if (mode === 'annotation') {
    const state = annotationState(states.annotation)
    return {
      kind: 'paper',
      pattern: 'plain',
      strokes: paths,
      eyebrow: {
        label: 'Annotation',
        note: compact(state.fileName || mediaFileName(state.sourceUrl) || 'No reference', 18),
      },
    }
  }

  if (mode === 'diagram') {
    const diagram = record(data.diagram) ?? {}
    const elements = Array.isArray(diagram.elements) ? diagram.elements.length : 0
    return {
      kind: 'paper',
      pattern: 'plain',
      strokes: [],
      eyebrow: { label: 'Diagram', note: `${elements} ${elements === 1 ? 'shape' : 'shapes'}` },
    }
  }

  // The paper's own ruling is the identity: squared stays squared, dotted
  // stays dotted, and a whiteboard stays a light board with dark ink.
  return {
    kind: 'paper',
    pattern: mode === 'graph_paper'
      ? 'grid'
      : mode === 'dot_grid' ? 'dots' : mode === 'whiteboard' ? 'board' : 'plain',
    strokes: paths,
    ...(paths.length === 0
      ? { eyebrow: { label: mode === 'whiteboard' ? 'Whiteboard' : 'Nothing drawn yet', tone: 'muted' as const } }
      : {}),
  }
}

/* -------------------------------------------------------------- Canvas node */

export function canvasNodeRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const skin = canvasNodeSkin(data.skin)
  const states = record(data.skinStates) ?? {}

  if (skin === 'cover') {
    const state = canvasCoverState(states.cover)
    return {
      kind: 'rows',
      eyebrow: { label: compact(state.eyebrow || 'Open canvas', 20) },
      rows: [{ key: 'subtitle', label: compact(state.subtitle || 'Open canvas', 34) }],
      overflow: 0,
    }
  }

  // A canvas card cannot count what is inside another canvas from here — the
  // face is a pure function of this one widget, and reading the board's whole
  // widget map per tile is exactly the per-frame cost resting faces exist to
  // avoid. The open card does that counting; the tile says where the door goes.
  if (skin === 'portal') return { kind: 'text', text: 'Open canvas' }
  // The remaining shapes leave the eyebrow blank on purpose: the catalogue
  // dress fills it with the skin's own name, which is the only thing telling a
  // folded Live Thumbnail from a folded Dashboard Door.
  return { kind: 'rows', rows: [{ key: 'open', label: 'Open canvas' }], overflow: 0 }
}
