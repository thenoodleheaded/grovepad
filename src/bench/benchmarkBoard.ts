import type {
  CanvasMeta,
  ModuleType,
  Relation,
  Widget,
  WidgetGroup,
} from '../types/spatial'
import type { Connection } from '../types/circuit'
import {
  COLLAPSED_SIZE,
  GRID_SIZE,
  GROUP_COLORS,
  ICONIFIED_SIZE,
  snapToGrid,
} from '../types/spatial'
import { isWidgetTypePublic, WIDGET_REGISTRY, widgetDefinition } from '../widgets/registry'
import { fieldsFor } from '../widgets/fields'
import { createBenchRandom, randomInt, randomPick, weightedIndex } from './benchRandom'

// ---------------------------------------------------------------------------
// Benchmark board generator (canvas engine contract, "Benchmark" row).
//
// Deterministic: same seed → byte-identical board. Realistic mix + heavy
// tail: mostly notes/checklists like real boards, plus a deliberate share of
// the heaviest renderers (tables, charts, budgets) and several hundred edges.
// Pure data — nothing here touches a store or the DOM, so the generator runs
// identically in vitest, the browser bench, and the CLI runner.
// ---------------------------------------------------------------------------

export interface BenchmarkBoardConfig {
  seed: number
  widgetCount: number
  relationCount: number
  wireCount: number
  groupCount: number
  workspaceId: string
  parentCanvasId: string | null
}

export const DEFAULT_BENCHMARK_CONFIG: Omit<BenchmarkBoardConfig, 'workspaceId' | 'parentCanvasId'> = {
  seed: 20260720,
  widgetCount: 2000,
  relationCount: 320,
  wireCount: 130,
  groupCount: 40,
}

export interface BenchmarkBoard {
  canvas: CanvasMeta
  widgets: Record<string, Widget>
  groups: Record<string, WidgetGroup>
  relations: Record<string, Relation>
  connections: Record<string, Connection>
  /** World-space bounding box of every widget — the tour drives inside it. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

/** Realistic mix + heavy tail. Types missing from the registry are dropped
 * and their weight renormalizes, so registry evolution can't break the bench
 * — but the mix drifting is a benchmark change and should be deliberate. */
const TYPE_WEIGHTS: ReadonlyArray<readonly [ModuleType, number]> = [
  ['notes', 30],
  ['checklist', 18],
  ['table', 11],
  ['bar_chart', 8],
  ['budget', 7],
  ['goal_tracker', 6],
  ['flashcards', 4],
  ['date_picker', 4],
  ['decision', 3],
  ['timer', 3],
  ['tracker', 3],
  ['calculator', 3],
]

const CLUSTER_CELL = { width: GRID_SIZE * 13, height: GRID_SIZE * 11 } // fits every default size
const CLUSTER_COLUMNS = 5
const CLUSTER_GAP = GRID_SIZE * 20

const LOREM =
  'Deep work session notes: capture the idea while it is hot, wire it to the ' +
  'roadmap, and let the budget widget tally the damage. Long paragraphs make ' +
  'the renderer earn its keep during the benchmark tour.'

function benchTypes(): Array<{ type: ModuleType; weight: number }> {
  return TYPE_WEIGHTS.filter(
    ([type]) => type in WIDGET_REGISTRY && isWidgetTypePublic(type),
  ).map(([type, weight]) => ({ type, weight }))
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const FIXED_ISO = '2026-07-20T00:00:00.000Z'
const FIXED_EPOCH = 1_784_500_000_000

/** Registry defaultData() calls crypto.randomUUID() and new Date(), which
 * would break the same-seed → same-board guarantee. Rewrite every volatile
 * field deterministically: `id` strings from a shared counter, ISO strings
 * and timestamp-named numbers to fixed values. */
function canonicalizeVolatile(value: unknown, counter: { n: number }): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalizeVolatile(entry, counter))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'id' && typeof entry === 'string') out[key] = `bench-id-${counter.n++}`
      else if (typeof entry === 'string' && ISO_DATE.test(entry)) out[key] = FIXED_ISO
      else if (typeof entry === 'number' && entry > 1.5e12) out[key] = FIXED_EPOCH // epoch-ms territory
      else out[key] = canonicalizeVolatile(entry, counter)
    }
    return out
  }
  return value
}

/** Duck-typed content fill: makes cards content-heavy without coupling the
 * bench to every module's data shape. Unknown shapes keep their defaults. */
function populateData(data: Record<string, unknown>, random: () => number, index: number): void {
  if (typeof data.text === 'string') {
    data.text = `#${index} ${LOREM.slice(0, 80 + Math.floor(random() * (LOREM.length - 80)))}`
  }
  if (Array.isArray(data.items)) {
    const count = 3 + Math.floor(random() * 6)
    for (let i = 0; i < count; i++) {
      data.items.push({ id: `bench-item-${index}-${i}`, text: `Task ${i + 1} of card ${index}`, done: random() < 0.4 })
    }
  }
  if (Array.isArray(data.rows)) {
    const count = 2 + Math.floor(random() * 4)
    for (let i = 0; i < count; i++) {
      data.rows.push(Array.isArray(data.rows[0]) ? [`R${i}`, 'owner', 'open'] : { id: `bench-row-${index}-${i}`, label: `Line ${i + 1}`, amount: Math.floor(random() * 900) })
    }
  }
  if (Array.isArray(data.points)) {
    for (let i = 0; i < 8; i++) data.points.push({ label: `P${i}`, value: Math.floor(random() * 100) })
  }
}

export function generateBenchmarkBoard(config: BenchmarkBoardConfig): BenchmarkBoard {
  const random = createBenchRandom(config.seed)
  const types = benchTypes()
  const weights = types.map((entry) => entry.weight)

  const canvas: CanvasMeta = {
    id: `bench-canvas-${config.seed}`,
    name: 'Benchmark board',
    workspaceId: config.workspaceId,
    parentCanvasId: config.parentCanvasId,
  }

  const widgets: Record<string, Widget> = {}
  const widgetIds: string[] = []
  const clusterMembers: string[][] = []
  const idCounter = { n: 0 }

  const clusterSize = () => randomInt(random, 16, 30)
  let clusterIndex = 0
  let produced = 0
  while (produced < config.widgetCount) {
    const members: string[] = []
    const clusterX = (clusterIndex % CLUSTER_COLUMNS) * (CLUSTER_CELL.width * 6 + CLUSTER_GAP)
    const clusterY = Math.floor(clusterIndex / CLUSTER_COLUMNS) * (CLUSTER_CELL.height * 6 + CLUSTER_GAP)
    const size = Math.min(clusterSize(), config.widgetCount - produced)
    for (let slot = 0; slot < size; slot++) {
      const { type } = types[weightedIndex(random, weights)]!
      const def = widgetDefinition(type)
      const id = `bench-w-${String(produced).padStart(4, '0')}`
      const col = slot % 6
      const row = Math.floor(slot / 6)
      const jitterX = randomInt(random, 0, 2) * GRID_SIZE
      const jitterY = randomInt(random, 0, 1) * GRID_SIZE
      const data = def.defaultData() as unknown as Record<string, unknown>
      populateData(data, random, produced)
      const canonical = canonicalizeVolatile(data, idCounter) as Record<string, unknown>

      const roll = random()
      const collapsed = roll < 0.04
      const iconified = !collapsed && roll < 0.06
      const fullSize = {
        width: snapToGrid(def.defaultSize.width),
        height: snapToGrid(def.defaultSize.height),
      }

      const widget: Widget = {
        id,
        type,
        title: `${def.label} ${produced}`,
        canvasId: canvas.id,
        position: {
          x: snapToGrid(clusterX + col * CLUSTER_CELL.width + jitterX),
          y: snapToGrid(clusterY + row * CLUSTER_CELL.height + jitterY),
        },
        size: collapsed ? { ...COLLAPSED_SIZE } : iconified ? { ...ICONIFIED_SIZE } : fullSize,
        data: canonical as unknown as Widget['data'],
        metadata: { badges: [], zIndex: produced },
      }
      if (collapsed) {
        widget.collapsed = true
        widget.expandedSize = fullSize
      } else if (iconified) {
        widget.iconified = true
        widget.expandedSize = fullSize
      }
      widgets[id] = widget
      widgetIds.push(id)
      members.push(id)
      produced++
    }
    clusterMembers.push(members)
    clusterIndex++
  }

  // Groups: contiguous runs inside one cluster so plates hug real neighbors.
  const groups: Record<string, WidgetGroup> = {}
  for (let g = 0; g < config.groupCount; g++) {
    const cluster = randomPick(random, clusterMembers)
    if (cluster.length < 4) continue
    const start = randomInt(random, 0, cluster.length - 4)
    const span = randomInt(random, 3, Math.min(6, cluster.length - start))
    const id = `bench-g-${g}`
    groups[id] = {
      id,
      label: `Group ${g}`,
      widgetIds: cluster.slice(start, start + span),
      color: randomPick(random, GROUP_COLORS),
    }
  }

  // Relations: mostly intra-cluster parent links, a tail of cross-cluster
  // blockers so long edges exist at far zoom.
  const relations: Record<string, Relation> = {}
  for (let r = 0; r < config.relationCount; r++) {
    const crossCluster = random() < 0.15
    let fromId: string
    let toId: string
    if (crossCluster) {
      fromId = randomPick(random, widgetIds)
      toId = randomPick(random, widgetIds)
    } else {
      const cluster = randomPick(random, clusterMembers)
      fromId = randomPick(random, cluster)
      toId = randomPick(random, cluster)
    }
    if (fromId === toId) continue
    const id = `bench-r-${r}`
    relations[id] = {
      id,
      fromId,
      toId,
      type: crossCluster ? 'blocker' : 'parent',
      isResolved: false,
    }
  }

  // Wires: value connections built from the real field registry — source
  // field readable, target field settable — so the circuit engine sees only
  // connections it could have made itself.
  const connections: Record<string, Connection> = {}
  let wireAttempts = 0
  let wireCount = 0
  while (wireCount < config.wireCount && wireAttempts < config.wireCount * 20) {
    wireAttempts++
    const cluster = randomPick(random, clusterMembers)
    const fromId = randomPick(random, cluster)
    const toId = randomPick(random, cluster)
    if (fromId === toId) continue
    const fromFields = fieldsFor(widgets[fromId]!.type)
    const toFields = fieldsFor(widgets[toId]!.type).filter((field) => field.set)
    if (fromFields.length === 0 || toFields.length === 0) continue
    const id = `bench-c-${wireCount}`
    connections[id] = {
      id,
      fromId,
      fromField: randomPick(random, fromFields).key,
      toId,
      toField: randomPick(random, toFields).key,
      kind: 'value',
      enabled: true,
    }
    wireCount++
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const widget of Object.values(widgets)) {
    minX = Math.min(minX, widget.position.x)
    minY = Math.min(minY, widget.position.y)
    maxX = Math.max(maxX, widget.position.x + widget.size.width)
    maxY = Math.max(maxY, widget.position.y + widget.size.height)
  }

  return { canvas, widgets, groups, relations, connections, bounds: { minX, minY, maxX, maxY } }
}
