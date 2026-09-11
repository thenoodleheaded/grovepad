// Generator entry — builds the Skin Gallery workspace.
//
//   npx vitest run --config scripts/skins/vitest.config.ts
//
// The gallery is one workspace holding one canvas per widget type in the
// registry. Each canvas carries two cards for every skin that type offers:
// one pinned open at full size, one left to fall back to its resting face.
// Every card is filled from `skinGallerySamples.ts`, so nothing renders as an
// empty shell.
//
// Output is `demo-boards/skin-gallery.json` — a board fragment (workspace,
// canvases, widgets) meant to be MERGED into an existing board rather than
// replacing it. It is deliberately not a `.grovepad` package: importing a
// package drops it onto the current canvas as a single card, which is not a
// separate workspace.
//
// Layout is computed in the same footprint space the board itself packs by:
// a pinned card occupies its stored size, a resting card occupies its resting
// tile, and every card reserves the floating title strip above it.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { it } from 'vitest'
import type { ModuleData, ModuleType, Size, Widget } from '../../src/types/spatial'
import { DOMAIN_PACKS } from '../../src/types/spatial'
import { GRID_SIZE } from '../../src/types/canvas'
import { WIDGET_REGISTRY, widgetDefinition } from '../../src/widgets/registry'
import { ATLAS_TYPES } from '../../src/widgets/atlasCatalog'
import { AUTOMATION_CORE_SET } from '../../src/widgets/automationCoreCatalog'
import { dataWearingSkin, skinsFor } from '../../src/utils/widgetSkins'
import { computeDataHeight, computeDataWidth } from '../../src/store/widgetSizing'
import { restingTileSize, WIDGET_TITLE_ROW } from '../../src/utils/widgetRest'
import {
  atlasSample,
  automationSample,
  BESPOKE_SAMPLES,
  resetSampleIds,
  SKIN_OVERRIDES,
  TODAY,
} from './skinGallerySamples'

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../demo-boards')

const WORKSPACE_ID = 'skinlab-workspace'
const INDEX_CANVAS_ID = 'skinlab-canvas-index'
/** Pair columns per canvas — two, because every slot is deliberately roomy. */
const PAIRS_PER_ROW = 2
// Several renderers paint past the box `computeDataHeight` predicts for them
// (an invoices card with three rows overruns its 240px card by ~450px). The
// gallery cannot re-measure every one of them, so it simply reserves far more
// room than any card needs: an empty gap costs nothing on an infinite canvas,
// a collision costs the whole point of the gallery.
/** Gap between the open card and its resting twin. */
const PAIR_GAP = 400
const COLUMN_GAP = 440
const ROW_GAP = 600
const ORIGIN = { x: 160, y: 200 }

const ATLAS_SET = new Set<string>(ATLAS_TYPES)

interface Card {
  widget: Widget
  footprint: Size
}

/** Deterministic widget ids, so regenerating produces the same board. */
let widgetSeq = 0
function mintId(canvasId: string): string {
  widgetSeq += 1
  return `${canvasId}-w${widgetSeq.toString(36).padStart(4, '0')}`
}

/** The stored data for one type wearing one skin, filled with real values. */
function sampleData(type: ModuleType, skin: string | null): ModuleData {
  const def = widgetDefinition(type)
  let data = def.defaultData()
  if (skin) data = dataWearingSkin({ type, data }, skin, def)

  let patch: Record<string, unknown>
  if (AUTOMATION_CORE_SET.has(type)) patch = automationSample(type)
  // A Tracker wears an Atlas preset as its skin, so it gets that preset's
  // content; the dedicated Atlas cards get their own type's content.
  else if (type === 'tracker') patch = atlasSample(skin ?? '')
  else if (ATLAS_SET.has(type)) patch = atlasSample(type)
  else patch = BESPOKE_SAMPLES[type]?.() ?? {}

  const override = skin ? SKIN_OVERRIDES[`${type}:${skin}`] : undefined
  return { ...(data as object), ...patch, ...(override ?? {}) } as ModuleData
}

/** The size a card opens at, from the content the sample just put in it. */
function openSize(type: ModuleType, data: ModuleData): Size {
  const def = widgetDefinition(type)
  const maxWidth = def.sizing?.maxWidth ?? Number.POSITIVE_INFINITY
  const maxHeight = def.sizing?.maxHeight ?? Number.POSITIVE_INFINITY
  return {
    width: Math.min(maxWidth, Math.max(def.defaultSize.width, computeDataWidth(type, data))),
    height: Math.min(maxHeight, Math.max(def.defaultSize.height, computeDataHeight(type, data))),
  }
}

function makeCard(
  canvasId: string,
  type: ModuleType,
  title: string,
  data: ModuleData,
  pinned: boolean,
  accent?: string,
): Card {
  const size = openSize(type, data)
  const widget: Widget = {
    id: mintId(canvasId),
    type,
    title,
    canvasId,
    position: { x: 0, y: 0 },
    size,
    data,
    metadata: {
      badges: [],
      ...(accent ? { accent } : {}),
      ...(pinned ? { pinned: true, pinnedFrom: { kind: 'rest' as const } } : {}),
    },
  }
  return { widget, footprint: pinned ? size : restingTileSize(widget) }
}

/**
 * Place pairs on a grid. Each pair is [open, resting]; a row is as tall as its
 * tallest pair and a column as wide as its widest, which is the cheapest
 * arrangement that can never overlap whatever the renderers measure.
 */
function layoutPairs(pairs: Array<[Card, Card]>): void {
  const rows = Math.max(1, Math.ceil(pairs.length / PAIRS_PER_ROW))
  const columnWidth = new Array<number>(PAIRS_PER_ROW).fill(0)
  const leftWidth = new Array<number>(PAIRS_PER_ROW).fill(0)
  const rowHeight = new Array<number>(rows).fill(0)

  pairs.forEach(([open, rest], index) => {
    const column = index % PAIRS_PER_ROW
    const rowIndex = Math.floor(index / PAIRS_PER_ROW)
    leftWidth[column] = Math.max(leftWidth[column]!, open.footprint.width)
    columnWidth[column] = Math.max(
      columnWidth[column]!,
      open.footprint.width + PAIR_GAP + rest.footprint.width,
    )
    rowHeight[rowIndex] = Math.max(
      rowHeight[rowIndex]!,
      open.footprint.height + WIDGET_TITLE_ROW,
      rest.footprint.height + WIDGET_TITLE_ROW,
    )
  })

  const columnX: number[] = []
  let x = ORIGIN.x
  for (const width of columnWidth) {
    columnX.push(x)
    x += width + COLUMN_GAP
  }
  const rowY: number[] = []
  let y = ORIGIN.y
  for (const height of rowHeight) {
    rowY.push(y)
    y += height + ROW_GAP
  }

  pairs.forEach(([open, rest], index) => {
    const column = index % PAIRS_PER_ROW
    const rowIndex = Math.floor(index / PAIRS_PER_ROW)
    open.widget.position = { x: columnX[column]!, y: rowY[rowIndex]! }
    rest.widget.position = { x: columnX[column]! + leftWidth[column]! + PAIR_GAP, y: rowY[rowIndex]! }
  })
}

/**
 * A plain grid of single cards — what the index of canvas doors needs. The
 * doors are plain canvas cards that never overrun their own box, so this grid
 * spends none of the slack `layoutPairs` needs and packs them one cell apart.
 */
function layoutGrid(cards: Card[], columns: number, gap = GRID_SIZE): void {
  const rows = Math.max(1, Math.ceil(cards.length / columns))
  const columnWidth = new Array<number>(columns).fill(0)
  const rowHeight = new Array<number>(rows).fill(0)
  cards.forEach((card, index) => {
    const column = index % columns
    const rowIndex = Math.floor(index / columns)
    columnWidth[column] = Math.max(columnWidth[column]!, card.footprint.width)
    rowHeight[rowIndex] = Math.max(rowHeight[rowIndex]!, card.footprint.height + WIDGET_TITLE_ROW)
  })
  const columnX: number[] = []
  let x = ORIGIN.x
  for (const width of columnWidth) {
    columnX.push(x)
    x += width + gap
  }
  const rowY: number[] = []
  let y = ORIGIN.y
  for (const height of rowHeight) {
    rowY.push(y)
    y += height + gap
  }
  cards.forEach((card, index) => {
    card.widget.position = { x: columnX[index % columns]!, y: rowY[Math.floor(index / columns)]! }
  })
}

function canvasIdFor(type: string): string {
  return `skinlab-canvas-${type.replaceAll('_', '-')}`
}

/** Fail the build if two cards on one canvas would collide at rest. */
function assertNoOverlap(widgets: Record<string, Widget>): void {
  const byCanvas = new Map<string, Widget[]>()
  for (const widget of Object.values(widgets)) {
    const list = byCanvas.get(widget.canvasId)
    if (list) list.push(widget)
    else byCanvas.set(widget.canvasId, [widget])
  }
  for (const [canvasId, list] of byCanvas) {
    const rects = list.map((widget) => {
      const tile = widget.metadata.pinned === true ? widget.size : restingTileSize(widget)
      return {
        title: widget.title,
        x: widget.position.x,
        y: widget.position.y - WIDGET_TITLE_ROW,
        right: widget.position.x + tile.width,
        bottom: widget.position.y + tile.height,
      }
    })
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!
        const b = rects[j]!
        if (a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom) {
          throw new Error(`[${canvasId}] "${a.title}" overlaps "${b.title}"`)
        }
      }
    }
  }
}

it('writes the Skin Gallery workspace', () => {
  resetSampleIds()
  widgetSeq = 0

  const types = Object.keys(WIDGET_REGISTRY) as ModuleType[]
  const canvases: Record<string, unknown> = {
    [INDEX_CANVAS_ID]: {
      id: INDEX_CANVAS_ID,
      name: 'Skin Gallery',
      workspaceId: WORKSPACE_ID,
      parentCanvasId: null,
    },
  }
  const widgets: Record<string, Widget> = {}
  const indexDoors: Card[] = []
  let skinCount = 0

  for (const type of types) {
    const def = widgetDefinition(type)
    const canvasId = canvasIdFor(type)
    canvases[canvasId] = {
      id: canvasId,
      name: def.label,
      workspaceId: WORKSPACE_ID,
      parentCanvasId: INDEX_CANVAS_ID,
    }

    const skins = skinsFor({ type }, def)
    const entries: Array<{ value: string | null; label: string }> =
      skins.length > 0
        ? skins.map((skin) => ({ value: skin.value, label: skin.label }))
        : [{ value: null, label: 'Default' }]
    skinCount += entries.length

    const pairs: Array<[Card, Card]> = []
    for (const entry of entries) {
      const open = makeCard(canvasId, type, `${entry.label} — open`, sampleData(type, entry.value), true, def.accent)
      const rest = makeCard(canvasId, type, `${entry.label} — resting`, sampleData(type, entry.value), false, def.accent)
      pairs.push([open, rest])
    }
    layoutPairs(pairs)
    for (const [open, rest] of pairs) {
      widgets[open.widget.id] = open.widget
      widgets[rest.widget.id] = rest.widget
    }

    // The index canvas gets a Canvas card pointing at this type's canvas, so
    // the gallery is navigable by clicking rather than by the tree drawer.
    // Only one card each here: the pairs that show a skin twice live on the
    // type's own canvas, and the Canvas card has its own canvas like any
    // other type.
    const doorData = { canvasId, skin: 'portal' } as unknown as ModuleData
    const door = makeCard(INDEX_CANVAS_ID, 'canvas_node', def.label, doorData, true, def.accent)
    indexDoors.push(door)
  }

  layoutGrid(indexDoors, 6)
  for (const door of indexDoors) widgets[door.widget.id] = door.widget

  assertNoOverlap(widgets)

  const fragment = {
    workspace: {
      id: WORKSPACE_ID,
      name: 'Skin Gallery',
      rootCanvasId: INDEX_CANVAS_ID,
      createdAt: TODAY,
    },
    canvases,
    widgets,
    activePacks: [...DOMAIN_PACKS],
    stats: {
      types: types.length,
      skins: skinCount,
      canvases: Object.keys(canvases).length,
      widgets: Object.keys(widgets).length,
    },
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const file = resolve(OUT_DIR, 'skin-gallery.json')
  writeFileSync(file, JSON.stringify(fragment))
  console.log(
    `\n  ${file}\n  ${fragment.stats.canvases} canvases · ${fragment.stats.skins} skins · ${fragment.stats.widgets} cards\n`,
  )
})
