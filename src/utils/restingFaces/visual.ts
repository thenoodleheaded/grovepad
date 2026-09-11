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
  REST_INK_POINT_BUDGET,
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

/** Ceiling on points per preserved stroke. Enough to keep a gesture's shape;
 * the shared REST_INK_POINT_BUDGET divides below this when strokes are many. */
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

/** Breathing room inside the 0–100 ink box, so a stroke that touches the
 * picture's edge is not clipped by the tile's rounded corner. */
const INK_PAD = 3

interface InkFrame { minX: number; minY: number; width: number; height: number }
type InkBox = { width: number; height: number; frame: 'surface' | 'scene' }

function validStrokes(raw: unknown): SketchpadStroke[] {
  if (!Array.isArray(raw)) return []
  const strokes: SketchpadStroke[] = []
  for (const entry of raw) {
    const value = record(entry)
    if (!value || !Array.isArray(value.points) || value.points.length === 0) continue
    strokes.push(value as unknown as SketchpadStroke)
  }
  return strokes
}

/**
 * The drawn picture's bounding box across EVERY stroke. The preview keeps a
 * sample of strokes, but the box is measured over all of them, so nothing the
 * pen drew ever falls outside the tile's frame.
 */
function inkFrame(strokes: readonly SketchpadStroke[]): InkFrame | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const stroke of strokes) {
    for (const point of stroke.points) {
      const x = typeof point?.x === 'number' && Number.isFinite(point.x) ? Math.min(1, Math.max(0, point.x)) : null
      const y = typeof point?.y === 'number' && Number.isFinite(point.y) ? Math.min(1, Math.max(0, point.y)) : null
      if (x === null || y === null) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (minX === Infinity) return null
  // A single dot or a ruler-straight line still needs a box with two real
  // sides, or the remap divides by zero and the ratio explodes.
  return {
    minX,
    minY,
    width: Math.max(0.01, maxX - minX),
    height: Math.max(0.01, maxY - minY),
  }
}

/** Up to REST_STROKE_LIMIT strokes chosen evenly across the whole drawing —
 * never just the first few, so a sketch finished in its far corner still
 * shows what was finished, not only how it began. */
function pickStrokes(strokes: readonly SketchpadStroke[]): readonly SketchpadStroke[] {
  if (strokes.length <= REST_STROKE_LIMIT) return strokes
  const picked: SketchpadStroke[] = []
  const step = strokes.length / REST_STROKE_LIMIT
  for (let index = 0; index < REST_STROKE_LIMIT; index += 1) {
    picked.push(strokes[Math.floor(index * step)]!)
  }
  return picked
}

/**
 * One stroke reduced to an SVG path filling the picture's own 0–100 box.
 * Points are already normalized 0–1 by the drawing model; even sampling under
 * the shared point budget keeps the gesture's shape while making the cost of
 * a ten-thousand-point stroke identical to the cost of a ten-point one.
 */
function strokePath(stroke: SketchpadStroke, frame: InkFrame, samples: number): string | null {
  const points = stroke.points
  if (points.length === 0) return null
  const span = 100 - INK_PAD * 2
  const mapX = (x: number) =>
    (INK_PAD + ((Math.min(1, Math.max(0, x)) - frame.minX) / frame.width) * span).toFixed(1)
  const mapY = (y: number) =>
    (INK_PAD + ((Math.min(1, Math.max(0, y)) - frame.minY) / frame.height) * span).toFixed(1)
  // Ceiling, not floor: a floor step lets a long stroke overshoot its share
  // and the whole preview drift past the point budget.
  const step = Math.max(1, Math.ceil(points.length / samples))
  const sampled: string[] = []
  for (let index = 0; index < points.length; index += step) {
    const point = points[index]!
    sampled.push(`${mapX(point.x)} ${mapY(point.y)}`)
  }
  // The end of the gesture always survives sampling; without it a stroke that
  // does not divide evenly stops short of where the pen actually lifted.
  const last = points.at(-1)!
  const tail = `${mapX(last.x)} ${mapY(last.y)}`
  if (sampled.at(-1) !== tail) sampled.push(tail)
  if (sampled.length === 1) return `M ${sampled[0]} l 0.4 0`
  return `M ${sampled[0]} L ${sampled.slice(1).join(' L ')}`
}

/** The whole picture as bounded paths plus its box, for one stroke set. */
function inkPreview(raw: unknown): { paths: string[]; ink?: InkBox } {
  const strokes = validStrokes(raw)
  const frame = inkFrame(strokes)
  if (!frame) return { paths: [] }
  const picked = pickStrokes(strokes)
  const samples = Math.max(2, Math.min(STROKE_SAMPLES, Math.floor(REST_INK_POINT_BUDGET / picked.length)))
  return {
    paths: picked
      .map((stroke) => strokePath(stroke, frame, samples))
      .filter((path): path is string => path !== null),
    ink: { width: frame.width, height: frame.height, frame: 'surface' },
  }
}

/**
 * A diagram scene reduced to ghost outlines: each element is only its frame,
 * remapped into the scene's own bounding box. Scene coordinates are absolute,
 * so the box carries the `scene` frame — its sides are already the ratio.
 */
function diagramPreview(elements: readonly unknown[]): { paths: string[]; ink?: InkBox } {
  const boxes: { x: number; y: number; width: number; height: number }[] = []
  for (const entry of elements) {
    const value = record(entry)
    if (!value || value.isDeleted === true) continue
    const x = typeof value.x === 'number' && Number.isFinite(value.x) ? value.x : null
    const y = typeof value.y === 'number' && Number.isFinite(value.y) ? value.y : null
    const width = typeof value.width === 'number' && Number.isFinite(value.width) ? Math.abs(value.width) : 0
    const height = typeof value.height === 'number' && Number.isFinite(value.height) ? Math.abs(value.height) : 0
    if (x === null || y === null) continue
    boxes.push({ x, y, width, height })
  }
  if (boxes.length === 0) return { paths: [] }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const box of boxes) {
    if (box.x < minX) minX = box.x
    if (box.y < minY) minY = box.y
    if (box.x + box.width > maxX) maxX = box.x + box.width
    if (box.y + box.height > maxY) maxY = box.y + box.height
  }
  const sceneWidth = Math.max(1, maxX - minX)
  const sceneHeight = Math.max(1, maxY - minY)
  const span = 100 - INK_PAD * 2
  const picked = boxes.length <= REST_STROKE_LIMIT
    ? boxes
    : Array.from({ length: REST_STROKE_LIMIT }, (_, index) => boxes[Math.floor(index * (boxes.length / REST_STROKE_LIMIT))]!)
  const paths = picked.map((box) => {
    const left = (INK_PAD + ((box.x - minX) / sceneWidth) * span).toFixed(1)
    const top = (INK_PAD + ((box.y - minY) / sceneHeight) * span).toFixed(1)
    const right = (INK_PAD + ((box.x + box.width - minX) / sceneWidth) * span).toFixed(1)
    const bottom = (INK_PAD + ((box.y + box.height - minY) / sceneHeight) * span).toFixed(1)
    return `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`
  })
  return { paths, ink: { width: sceneWidth, height: sceneHeight, frame: 'scene' } }
}

export function sketchpadRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const mode = drawingMode(data.mode)
  const states = record(data.skinStates) ?? {}

  if (mode === 'storyboard') {
    const state = storyboardState(states.storyboard)
    const active = state.frames.find((frame) => frame.id === state.activeId) ?? state.frames[0]
    const drawn = state.frames.filter((frame) => frame.strokes.length > 0).length
    const preview = inkPreview(active?.strokes)
    return {
      kind: 'paper',
      pattern: 'frames',
      frames: state.frames.length,
      strokes: preview.paths,
      ...(preview.ink ? { ink: preview.ink } : {}),
      eyebrow: {
        label: compact(active?.caption?.trim() || 'Storyboard', 18),
        note: `${drawn}/${state.frames.length}`,
      },
    }
  }

  if (mode === 'annotation') {
    const state = annotationState(states.annotation)
    const preview = inkPreview(data.strokes)
    return {
      kind: 'paper',
      pattern: 'plain',
      strokes: preview.paths,
      ...(preview.ink ? { ink: preview.ink } : {}),
      eyebrow: {
        label: 'Annotation',
        note: compact(state.fileName || mediaFileName(state.sourceUrl) || 'No reference', 18),
      },
    }
  }

  if (mode === 'diagram') {
    const diagram = record(data.diagram) ?? {}
    const elements = Array.isArray(diagram.elements) ? diagram.elements : []
    const preview = diagramPreview(elements)
    return {
      kind: 'paper',
      pattern: 'plain',
      strokes: preview.paths,
      ...(preview.ink ? { ink: preview.ink } : {}),
      eyebrow: { label: 'Diagram', note: `${elements.length} ${elements.length === 1 ? 'shape' : 'shapes'}` },
    }
  }

  // The paper's own ruling is the identity: squared stays squared, dotted
  // stays dotted, and a whiteboard stays a light board with dark ink.
  const preview = inkPreview(data.strokes)
  return {
    kind: 'paper',
    pattern: mode === 'graph_paper'
      ? 'grid'
      : mode === 'dot_grid' ? 'dots' : mode === 'whiteboard' ? 'board' : 'plain',
    strokes: preview.paths,
    ...(preview.ink ? { ink: preview.ink } : {}),
    ...(preview.paths.length === 0
      ? { eyebrow: { label: mode === 'whiteboard' ? 'Whiteboard' : 'Nothing drawn yet', tone: 'muted' as const } }
      : {}),
  }
}

/* -------------------------------------------------------------- Canvas node */

export function canvasNodeRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const skin = canvasNodeSkin(data.skin)

  // A canvas card cannot describe what is inside another canvas from here —
  // the model is a pure function of this one widget, and the door's content
  // lives on the far side of it. So the model states only the two things this
  // widget owns (the skin worn, the cover's pocket) and the `canvas` face
  // renderer subscribes to the store for the name, the miniature, and the
  // counts — the same reads the open card makes, drawn into a bounded tile.
  if (skin === 'cover') {
    const state = canvasCoverState(record(data.skinStates)?.cover)
    return {
      kind: 'canvas',
      skin,
      ...(state.subtitle.trim() ? { subtitle: compact(state.subtitle, 90) } : {}),
    }
  }
  return { kind: 'canvas', skin }
}
