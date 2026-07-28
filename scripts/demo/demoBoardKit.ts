// Demo-board kit — the primitives the launch-video boards are written with.
//
// A demo board is authored declaratively (canvases, columns of cards, glue
// clusters, relations, wires) and compiled into a real `PersistedBoardState`,
// which `buildDemoBoards.ts` serializes into a `.grovepad` package. Every
// authored value is checked against the live registry as it is placed: an
// unknown widget type, a skin the type does not offer, a wire port that does
// not exist, or a value wire into a read-only field fails the build loudly
// rather than producing a board that hydrates half-empty.
//
// Layout is computed in RESTING-tile space, because that is the footprint the
// board itself packs by (`settleWidgetLayout`'s rect includes the resting tile
// plus the floating title strip above it). Laying out in stored-card space
// would leave the boards looking sparse on camera.

import type { Connection, WireTransform } from '../../src/types/circuit'
import type { PersistedBoardState } from '../../src/types/persistence'
import type {
  CanvasMeta,
  ModuleData,
  ModuleType,
  Relation,
  RelationType,
  Size,
  Widget,
  WidgetBadge,
  WidgetGlue,
  Workspace,
} from '../../src/types/spatial'
import { DOMAIN_PACKS } from '../../src/types/spatial'
import type { FieldCommand } from '../../src/types/fieldConnections'
import { widgetDefinition, WIDGET_REGISTRY } from '../../src/widgets/registry'
import { commandsFor, fieldDescriptor } from '../../src/widgets/fields'
import { dataWearingSkin } from '../../src/utils/widgetSkins'
import { computeDataHeight, computeDataWidth } from '../../src/store/widgetSizing'
import {
  ICONIFIED_SIZE,
  restingTileSize,
  widgetShowsTitleRow,
  WIDGET_TITLE_ROW,
} from '../../src/utils/widgetRest'
import { restingFace } from '../../src/utils/restingFace'
import { GLUE_GAP, GLUE_TITLE_HEADROOM } from '../../src/utils/glueGeometry'

/** One clear cell between two stacked cards, on top of the title strip. */
const STACK_GAP = 40
/** Two clear cells between columns — enough that wires read as separate runs. */
const COLUMN_GAP = 80
/**
 * Where a canvas starts laying out. A fresh canvas opens at pan (0,0) — the
 * device's saved views are local state and never travel in a package — so
 * world origin sits under the toolbar and the account chip. Starting here
 * means every canvas opens with its first column already in clear space.
 */
const ORIGIN = { x: 160, y: 200 }

export interface CardSpec {
  /** Slot name, local to its canvas. Relations and wires name endpoints by it. */
  key: string
  type: ModuleType
  title: string
  /** Stored skin value, applied through the app's own `dataWearingSkin`. */
  skin?: string
  /** Shallow-merged over the type's default data (after the skin is worn). */
  data?: Record<string, unknown>
  badges?: WidgetBadge[]
  accent?: string
  /** Reduce to a compact icon tile instead of a card. */
  iconified?: boolean
  /**
   * Let this card rest as a bare icon instead of being auto-pinned. Types with
   * no summary tile of their own rest as an anonymous icon square, which reads
   * as an empty box on a demo board — so the builder holds those open by
   * default. Set this when the icon is the point.
   */
  restAsIcon?: boolean
  pinned?: boolean
  favorite?: boolean
  strictHold?: boolean
  /** Overrides the content-derived card size when a board wants a wider card. */
  size?: Size
}

export interface GlueSpec {
  glue: string
  cards: CardSpec[]
  collapsed?: boolean
}

export type ColumnEntry = CardSpec | GlueSpec

function isGlue(entry: ColumnEntry): entry is GlueSpec {
  return 'glue' in entry
}

export interface WireSpec {
  from: string
  fromPort: string
  to: string
  toPort: string
  transform?: WireTransform
}

export interface TriggerSpec {
  from: string
  fromPort: string
  to: string
  command: FieldCommand
  edge?: 'rising' | 'falling' | 'change'
}

/** How a canvas arranges the groups handed to `column`. */
export interface CanvasLayout {
  /** Lanes to spread across. Defaults to four. */
  lanes?: number
  /** Give each group its own lane, in order, instead of balancing. */
  strict?: boolean
}

export interface RelationSpec {
  from: string
  to: string
  kind: RelationType
}

// ---------------------------------------------------------------------------

class DemoCanvas {
  readonly id: string
  private readonly board: DemoBoard
  private readonly slots = new Map<string, string>()
  /** Bottom edge reached so far in each lane. */
  private readonly bottoms: number[]
  /** Lane each placed widget landed in; x is resolved once the canvas is full. */
  private readonly lane = new Map<string, number>()
  private widest = 0
  private readonly strict: boolean
  private nextStrictLane = 0

  constructor(board: DemoBoard, id: string, options: CanvasLayout = {}) {
    this.board = board
    this.id = id
    this.strict = options.strict === true
    this.bottoms = new Array<number>(options.lanes ?? 4).fill(ORIGIN.y)
  }

  /** Resolve a slot name to the widget id it was placed under. */
  widgetId(slot: string): string {
    const id = this.slots.get(slot)
    if (!id) throw new Error(`[${this.id}] no card is named "${slot}"`)
    return id
  }

  /**
   * Add one group of entries — cards and glue clusters — to the canvas.
   *
   * By default each group goes into whichever lane is currently shortest, so a
   * canvas of wildly different tile heights still reads as one deliberate
   * composition instead of a few tall cards beside a scatter of small ones. A
   * `strict` canvas instead gives each group its own lane in order, which is
   * what a circuit needs: inputs, then logic, then outputs, left to right.
   */
  column(entries: ColumnEntry[]): this {
    const groups = this.strict ? [entries] : entries.map((entry) => [entry])
    for (const group of groups) {
      const lane = this.strict
        ? Math.min(this.nextStrictLane++, this.bottoms.length - 1)
        : this.shortestLane()
      let y = this.bottoms[lane]!
      for (const entry of group) {
        const cards = isGlue(entry) ? entry.cards : [entry]
        y += isGlue(entry) ? GLUE_TITLE_HEADROOM : WIDGET_TITLE_ROW
        const members: string[] = []
        for (const [index, card] of cards.entries()) {
          const widget = this.board.buildCard(card, this.id, { x: 0, y })
          if (isGlue(entry) && widget.metadata.pinned === true) {
            // A welded member hands its name to the group frame and sits on a
            // 0.3-cell seam. A pinned one takes its title strip back, which
            // would prise that seam open — so only cards with a real resting
            // tile may be glued.
            throw new Error(
              `[${this.id}] "${card.title}" rests as a bare icon, so it cannot join the "${entry.glue}" cluster`,
            )
          }
          this.place(card.key, widget, lane)
          members.push(widget.id)
          const box = this.board.footprint(widget)
          this.widest = Math.max(this.widest, box.width)
          y += box.height + (index === cards.length - 1 ? 0 : GLUE_GAP)
        }
        if (isGlue(entry)) this.board.addGlue(entry.glue, members)
        y += STACK_GAP
      }
      this.bottoms[lane] = y
    }
    return this
  }

  /** Resolve every lane index into a world x, once the canvas is complete. */
  settleLanes(): void {
    const pitch = this.widest + COLUMN_GAP
    for (const [id, lane] of this.lane) {
      this.board.moveWidget(id, ORIGIN.x + lane * pitch)
    }
  }

  private shortestLane(): number {
    let lane = 0
    for (let i = 1; i < this.bottoms.length; i++) {
      if (this.bottoms[i]! < this.bottoms[lane]!) lane = i
    }
    return lane
  }

  private place(key: string, widget: Widget, lane: number): void {
    if (this.slots.has(key)) throw new Error(`[${this.id}] duplicate card key "${key}"`)
    this.slots.set(key, widget.id)
    this.lane.set(widget.id, lane)
    this.board.addWidget(widget)
  }

  rel(from: string, to: string, kind: RelationType = 'parent'): this {
    this.board.addRelation(this.widgetId(from), this.widgetId(to), kind)
    return this
  }

  /** A parent fanning out to many children — the shape the boards call a tree. */
  tree(parent: string, children: string[], kind: RelationType = 'parent'): this {
    for (const child of children) this.rel(parent, child, kind)
    return this
  }

  wire(spec: WireSpec): this {
    this.board.addWire(this, spec)
    return this
  }

  trigger(spec: TriggerSpec): this {
    this.board.addTrigger(this, spec)
    return this
  }

  /** Record a built widget under its slot name and add it to the board. */
  private register(key: string, widget: Widget): void {
    if (this.slots.has(key)) throw new Error(`[${this.id}] duplicate card key "${key}"`)
    this.slots.set(key, widget.id)
    this.board.addWidget(widget)
  }

}

// ---------------------------------------------------------------------------

export class DemoBoard {
  private readonly workspaceId: string
  private readonly canvases: Record<string, CanvasMeta> = {}
  private readonly widgets: Record<string, Widget> = {}
  private readonly relations: Record<string, Relation> = {}
  private readonly connections: Record<string, Connection> = {}
  private readonly glues: Record<string, WidgetGlue> = {}
  private readonly workspaceName: string
  private readonly rootCanvasId: string
  private readonly surfaces: DemoCanvas[] = []
  private counter = 0

  constructor(workspaceName: string, rootCanvasName: string) {
    this.workspaceName = workspaceName
    this.workspaceId = 'demo-workspace'
    this.rootCanvasId = this.mintCanvasId(rootCanvasName)
    this.canvases[this.rootCanvasId] = {
      id: this.rootCanvasId,
      name: rootCanvasName,
      workspaceId: this.workspaceId,
      parentCanvasId: null,
    }
  }

  /** The workspace's root canvas, as a placeable surface. */
  root(layout: CanvasLayout = {}): DemoCanvas {
    const canvas = new DemoCanvas(this, this.rootCanvasId, layout)
    this.surfaces.push(canvas)
    return canvas
  }

  canvas(name: string, parent: DemoCanvas | null = null, layout: CanvasLayout = {}): DemoCanvas {
    const id = this.mintCanvasId(name)
    this.canvases[id] = {
      id,
      name,
      workspaceId: this.workspaceId,
      parentCanvasId: parent ? parent.id : this.rootCanvasId,
    }
    const canvas = new DemoCanvas(this, id, layout)
    this.surfaces.push(canvas)
    return canvas
  }

  /** Point a placed `canvas_node` card at the canvas it opens. */
  link(from: DemoCanvas, slot: string, target: DemoCanvas): this {
    const widget = this.widgets[from.widgetId(slot)]!
    if (widget.type !== 'canvas_node') {
      throw new Error(`[${from.id}] "${slot}" is a ${widget.type}, not a canvas card`)
    }
    widget.data = { ...(widget.data as object), canvasId: target.id } as ModuleData
    return this
  }

  // -- internals used by DemoCanvas -----------------------------------------

  buildCard(spec: CardSpec, canvasId: string, position: { x: number; y: number }): Widget {
    const def = WIDGET_REGISTRY[spec.type]
    if (!def) throw new Error(`unknown widget type "${spec.type}" for card "${spec.key}"`)
    if (def.availability === 'existing-only') {
      throw new Error(`"${spec.type}" is retired from new work (card "${spec.key}")`)
    }

    let data = def.defaultData()
    if (spec.skin) {
      const offered = def.skins?.some((option) => option.value === spec.skin)
      if (!offered) {
        throw new Error(`"${spec.type}" has no skin "${spec.skin}" (card "${spec.key}")`)
      }
      data = dataWearingSkin({ type: spec.type, data }, spec.skin, def)
    }
    if (spec.data) data = { ...(data as object), ...spec.data } as ModuleData

    const id = `demo-${canvasId.replace(/^demo-canvas-/, '')}-${spec.key}`
    const contentWidth = computeDataWidth(spec.type, data)
    const contentHeight = computeDataHeight(spec.type, data)
    const maxWidth = def.sizing?.maxWidth ?? Number.POSITIVE_INFINITY
    const maxHeight = def.sizing?.maxHeight ?? Number.POSITIVE_INFINITY
    const size: Size = spec.size ?? {
      width: Math.min(maxWidth, Math.max(def.defaultSize.width, contentWidth)),
      height: Math.min(maxHeight, Math.max(def.defaultSize.height, contentHeight)),
    }

    // A type with no summary tile rests as a bare icon square — on a demo
    // board that reads as an empty box, so hold those cards open unless the
    // author asked for the icon. Pinning is the board's own "keep this open"
    // state, so nothing here is a special demo-only mode.
    const facesAsIcon =
      restingFace({ type: spec.type, data, size, title: spec.title }).model.kind === 'icon'
    const pinned = spec.pinned || (!spec.iconified && !spec.restAsIcon && facesAsIcon)

    return {
      id,
      type: spec.type,
      title: spec.title,
      canvasId,
      position,
      size: spec.iconified ? ICONIFIED_SIZE : size,
      data,
      metadata: {
        badges: spec.badges ?? [],
        ...(spec.accent ? { accent: spec.accent } : {}),
        ...(pinned ? { pinned: true, pinnedFrom: { kind: 'rest' as const } } : {}),
        ...(spec.favorite ? { favorite: true } : {}),
        ...(spec.strictHold ? { strictHold: true } : {}),
      },
      ...(spec.iconified ? { iconified: true, expandedSize: size } : {}),
    }
  }

  /** The box a card actually occupies on an idle board. */
  footprint(widget: Widget): Size {
    if (widget.iconified === true || widget.metadata.pinned === true) return widget.size
    return restingTileSize(widget)
  }

  addWidget(widget: Widget): void {
    this.widgets[widget.id] = widget
  }

  /** Set a placed widget's final world x, once its canvas knows its pitch. */
  moveWidget(id: string, x: number): void {
    const widget = this.widgets[id]
    if (widget) widget.position = { ...widget.position, x }
  }

  addGlue(name: string, widgetIds: string[]): void {
    if (widgetIds.length < 2) throw new Error(`glue "${name}" needs at least two cards`)
    const id = `demo-glue-${++this.counter}`
    this.glues[id] = { id, widgetIds, name }
  }

  addRelation(fromId: string, toId: string, type: RelationType): void {
    const id = `demo-relation-${++this.counter}`
    this.relations[id] = {
      id,
      fromId,
      toId,
      type,
      isResolved: type !== 'blocker' && type !== 'conflict',
    }
  }

  addWire(canvas: DemoCanvas, spec: WireSpec): void {
    const fromId = canvas.widgetId(spec.from)
    const toId = canvas.widgetId(spec.to)
    const source = this.widgets[fromId]!
    const target = this.widgets[toId]!
    if (!fieldDescriptor(source.type, spec.fromPort)) {
      throw new Error(`[${canvas.id}] ${source.type} has no field "${spec.fromPort}"`)
    }
    const targetField = fieldDescriptor(target.type, spec.toPort)
    if (!targetField?.set) {
      throw new Error(
        `[${canvas.id}] ${target.type}."${spec.toPort}" is not a writable field`,
      )
    }
    for (const existing of Object.values(this.connections)) {
      if (existing.kind === 'value' && existing.toId === toId && existing.toField === spec.toPort) {
        throw new Error(
          `[${canvas.id}] ${target.type}."${spec.toPort}" already has an incoming value wire`,
        )
      }
    }
    const id = `demo-wire-${++this.counter}`
    this.connections[id] = {
      id,
      fromId,
      fromField: spec.fromPort,
      toId,
      toField: spec.toPort,
      kind: 'value',
      enabled: true,
      ...(spec.transform ? { transform: spec.transform } : {}),
    }
  }

  addTrigger(canvas: DemoCanvas, spec: TriggerSpec): void {
    const fromId = canvas.widgetId(spec.from)
    const toId = canvas.widgetId(spec.to)
    const source = this.widgets[fromId]!
    const target = this.widgets[toId]!
    if (!fieldDescriptor(source.type, spec.fromPort)) {
      throw new Error(`[${canvas.id}] ${source.type} has no field "${spec.fromPort}"`)
    }
    if (!commandsFor(target.type).some((command) => command.key === spec.command)) {
      throw new Error(`[${canvas.id}] ${target.type} has no command "${spec.command}"`)
    }
    const id = `demo-trigger-${++this.counter}`
    this.connections[id] = {
      id,
      fromId,
      fromField: spec.fromPort,
      toId,
      kind: 'trigger',
      command: spec.command,
      edge: spec.edge ?? 'rising',
      enabled: true,
    }
  }

  private mintCanvasId(name: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    return `demo-canvas-${slug}`
  }

  // -- output ---------------------------------------------------------------

  /** Fail the build if any two cards on one canvas would overlap at rest. */
  assertNoOverlap(): void {
    const byCanvas = new Map<string, Widget[]>()
    for (const widget of Object.values(this.widgets)) {
      const list = byCanvas.get(widget.canvasId)
      if (list) list.push(widget)
      else byCanvas.set(widget.canvasId, [widget])
    }
    const glued = new Set<string>()
    for (const glue of Object.values(this.glues)) for (const id of glue.widgetIds) glued.add(id)
    for (const [canvasId, list] of byCanvas) {
      const rects = list.map((widget) => {
        const tile = this.footprint(widget)
        // Same reservation the board's own settle uses: the resting tile plus
        // the floating title strip, which a glued member hands to its frame.
        const head = widgetShowsTitleRow(widget, { glued: glued.has(widget.id) })
          ? WIDGET_TITLE_ROW
          : 0
        return {
          title: widget.title,
          x: widget.position.x,
          y: widget.position.y - head,
          right: widget.position.x + tile.width,
          bottom: widget.position.y + tile.height,
        }
      })
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i]!
          const b = rects[j]!
          if (a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom) {
            throw new Error(`[${canvasId}] "${a.title}" overlaps "${b.title}" at rest`)
          }
        }
      }
    }
  }

  toState(): PersistedBoardState {
    for (const surface of this.surfaces) surface.settleLanes()
    this.assertNoOverlap()
    const workspace: Workspace = {
      id: this.workspaceId,
      name: this.workspaceName,
      rootCanvasId: this.rootCanvasId,
      createdAt: Date.UTC(2026, 6, 28),
    }
    return {
      workspaces: { [this.workspaceId]: workspace },
      canvases: this.canvases,
      widgets: this.widgets,
      relations: this.relations,
      connections: this.connections,
      glues: this.glues,
      // Every pack on, so pack-gated types (education, life, creative) render.
      activePacks: [...DOMAIN_PACKS],
      activeWorkspaceId: this.workspaceId,
      activeCanvasId: this.rootCanvasId,
      canvasViews: {},
    }
  }

  stats(): { canvases: number; widgets: number; relations: number; wires: number; glues: number } {
    return {
      canvases: Object.keys(this.canvases).length,
      widgets: Object.keys(this.widgets).length,
      relations: Object.keys(this.relations).length,
      wires: Object.keys(this.connections).length,
      glues: Object.keys(this.glues).length,
    }
  }
}

/** Every public widget type, so a board can assert its own coverage. */
export function publicWidgetTypes(): ModuleType[] {
  return (Object.keys(WIDGET_REGISTRY) as ModuleType[]).filter(
    (type) => widgetDefinition(type).availability !== 'existing-only',
  )
}
