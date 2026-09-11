import type { ModuleType, Relation, Widget, WidgetBadge, WidgetGlue } from '../types/spatial'
import type {
  ChecklistData,
  ChecklistItem,
  KanbanData,
  LinksData,
  TextData,
} from '../types/widgetDataCore'
import { computeDataHeight } from '../store/widgetSizing'
import { widgetDefinition } from '../widgets/registry'
import { GLUE_GAP, GLUE_TITLE_HEADROOM } from './glueGeometry'
import { layoutParentGraph, type PlanNodeSize } from './planLayout'

/**
 * Trello board JSON → Grovepad cards, with no model in the loop.
 *
 * A Trello board is already the shape of a kanban widget, so the board itself
 * is a plain mapping: lists become columns, cards become column cards, and the
 * real list names survive.
 *
 * The rest is the part a kanban cannot express. A `KanbanCard` holds a label
 * and nothing else, so any Trello card carrying real detail — a description, a
 * checklist, attachments, a due date, labels, members — is also promoted to
 * its own welded cluster beside the board and linked back to it with a parent
 * relation. Inside that cluster each kind of detail lands on the native
 * surface built for it: description in a note, checklist items in a checklist,
 * attachments in a links card, and due date / labels / members as the floating
 * badges every widget already renders. Plain title-only cards stay as column
 * cards, so a board of fifty bare cards does not explode into fifty widgets.
 *
 * Everything here is untrusted file content. Nothing is read without a type
 * guard, every collection is bounded, and every drop is counted so the caller
 * can tell the user exactly what did not survive the crossing instead of
 * quietly presenting a smaller board as a complete one.
 */

// --- Bounds ----------------------------------------------------------------
// A pathological export must not spawn an unusable board or a hung tab. Each
// cap has a matching counter in the report; nothing is trimmed silently.

const MAX_COLUMNS = 40
const MAX_CARDS_PER_COLUMN = 200
/** Widgets spawned beside the board, across the whole import. */
const MAX_SIDE_WIDGETS = 120
const MAX_CHECK_ITEMS = 200
const MAX_ATTACHMENTS = 40
const MAX_LABELS = 12
const MAX_MEMBERS = 8
const MAX_TITLE_CHARS = 120
const MAX_TEXT_CHARS = 20000

const IMPORT_ORIGIN = { x: 120, y: 200 }

/** Column that receives cards whose list is missing or archived. */
const UNFILED_COLUMN_LABEL = 'Unfiled'

/**
 * Trello names its label colours; the badge renderer needs a real CSS colour
 * because it derives a translucent fill from the string. These are Trello's
 * own swatches, so an imported board keeps the colours the user chose.
 */
const TRELLO_LABEL_COLORS: Record<string, string> = {
  green: '#61bd4f',
  yellow: '#f2d600',
  orange: '#ff9f1a',
  red: '#eb5a46',
  purple: '#c377e0',
  blue: '#0079bf',
  sky: '#00c2e0',
  lime: '#51e898',
  pink: '#ff78cb',
  black: '#344563',
}
const DEFAULT_LABEL_COLOR = '#b3bac5'

// --- Untrusted-input readers -----------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown, limit: number): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Trello orders siblings by a float `pos`. Absent or broken values sort last
    while keeping their original relative order. */
function sortByPos<T>(items: readonly T[], posOf: (item: T) => unknown): T[] {
  return items
    .map((item, index) => {
      const raw = posOf(item)
      const pos = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number.MAX_SAFE_INTEGER
      return { item, index, pos }
    })
    .sort((a, b) => (a.pos === b.pos ? a.index - b.index : a.pos - b.pos))
    .map((entry) => entry.item)
}

/** Initials for an avatar badge, from whatever the export actually carries. */
function initialsFor(member: Record<string, unknown>): string {
  const explicit = readString(member.initials, 4)
  if (explicit) return explicit.toUpperCase()
  const name = readString(member.fullName, MAX_TITLE_CHARS) || readString(member.username, 40)
  if (!name) return ''
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
}

// --- Public contract -------------------------------------------------------

export interface TrelloImportReport {
  boardName: string
  /** Columns and cards that reached the kanban widget. */
  columns: number
  cards: number
  /** Cards promoted beside the board because they carried more than a title. */
  promotedCards: number
  /** Promotions that needed more than one widget, and so were welded. */
  clusters: number
  notes: number
  checklists: number
  linkCards: number
  /** Detail that survived, on the surface built for it. */
  carriedDueDates: number
  carriedLabels: number
  carriedMembers: number
  carriedAttachments: number
  /** Archived (`closed`) source objects, skipped by design. */
  archivedLists: number
  archivedCards: number
  /** Cards whose list was missing or archived; kept in an "Unfiled" column. */
  unfiledCards: number
  /** Grovepad has no per-card comment thread, so these genuinely do not cross. */
  droppedComments: number
  /** Content cut by the bounds above. */
  truncatedColumns: number
  truncatedCards: number
  truncatedSideWidgets: number
  truncatedCheckItems: number
}

export interface TrelloImportResult {
  widgets: Record<string, Widget>
  relations: Relation[]
  glues: WidgetGlue[]
  report: TrelloImportReport
}

/**
 * Whether a parsed JSON value looks like a Trello board export. Trello is the
 * only export that pairs a board name with both a `lists` and a `cards` array
 * at the top level, so this needs no filename hint and cannot collide with the
 * other formats the importer accepts.
 */
export function isTrelloExport(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    typeof value.name === 'string' &&
    Array.isArray(value.lists) &&
    Array.isArray(value.cards)
  )
}

interface StagedWidget {
  key: string
  type: ModuleType
  title: string
  data: TextData | ChecklistData | LinksData
  badges: WidgetBadge[]
}

/** A welded cluster: its members in vertical order, and the name for its frame. */
interface StagedCluster {
  name: string
  memberKeys: string[]
}

interface OpenCard {
  id: string
  name: string
  desc: string
  listId: string
  due: string
  labels: Array<{ label: string; color: string }>
  initials: string[]
  attachments: Array<{ label: string; url: string }>
}

/**
 * Map a parsed Trello export onto cards for `canvasId`. Returns null when the
 * value is not a Trello board — callers should sniff with `isTrelloExport`
 * first and treat null as "this file is something else".
 */
export function mapTrelloBoard(raw: unknown, canvasId: string): TrelloImportResult | null {
  if (!isTrelloExport(raw) || !isRecord(raw)) return null

  const report: TrelloImportReport = {
    boardName: readString(raw.name, MAX_TITLE_CHARS) || 'Trello board',
    columns: 0,
    cards: 0,
    promotedCards: 0,
    clusters: 0,
    notes: 0,
    checklists: 0,
    linkCards: 0,
    carriedDueDates: 0,
    carriedLabels: 0,
    carriedMembers: 0,
    carriedAttachments: 0,
    archivedLists: 0,
    archivedCards: 0,
    unfiledCards: 0,
    droppedComments: 0,
    truncatedColumns: 0,
    truncatedCards: 0,
    truncatedSideWidgets: 0,
    truncatedCheckItems: 0,
  }

  // --- Members, so a card's ids can become initials ------------------------
  const initialsById = new Map<string, string>()
  for (const entry of readArray(raw.members)) {
    if (!isRecord(entry)) continue
    const id = typeof entry.id === 'string' ? entry.id : ''
    const initials = initialsFor(entry)
    if (id && initials) initialsById.set(id, initials)
  }

  // --- Lists -> columns ----------------------------------------------------
  const openLists: Array<{ id: string; label: string }> = []
  for (const entry of sortByPos(readArray(raw.lists), (l) => (isRecord(l) ? l.pos : undefined))) {
    if (!isRecord(entry)) continue
    if (entry.closed === true) {
      report.archivedLists += 1
      continue
    }
    const id = typeof entry.id === 'string' ? entry.id : ''
    if (!id) continue
    if (openLists.length >= MAX_COLUMNS) {
      report.truncatedColumns += 1
      continue
    }
    openLists.push({ id, label: readString(entry.name, MAX_TITLE_CHARS) || 'List' })
  }
  const openListIds = new Set(openLists.map((list) => list.id))

  // --- Cards ---------------------------------------------------------------
  const cardsByList = new Map<string, OpenCard[]>()
  const unfiled: OpenCard[] = []
  const openCardById = new Map<string, OpenCard>()

  for (const entry of sortByPos(readArray(raw.cards), (c) => (isRecord(c) ? c.pos : undefined))) {
    if (!isRecord(entry)) continue
    if (entry.closed === true) {
      report.archivedCards += 1
      continue
    }
    const id = typeof entry.id === 'string' ? entry.id : ''
    if (!id) continue

    const labels = readArray(entry.labels)
      .filter(isRecord)
      .map((label) => ({
        label: readString(label.name, MAX_TITLE_CHARS),
        color:
          TRELLO_LABEL_COLORS[readString(label.color, 20).toLowerCase()] ?? DEFAULT_LABEL_COLOR,
      }))
      .filter((label) => label.label !== '')
      .slice(0, MAX_LABELS)

    const initials = readArray(entry.idMembers)
      .map((memberId) => (typeof memberId === 'string' ? initialsById.get(memberId) : undefined))
      .filter((value): value is string => value !== undefined)
      .slice(0, MAX_MEMBERS)

    // Only http(s) ever reaches an href anywhere in this app; any other scheme
    // is a link we cannot vouch for and must not hand back as clickable.
    const attachments = readArray(entry.attachments)
      .filter(isRecord)
      .map((attachment) => ({
        label: readString(attachment.name, MAX_TITLE_CHARS) || 'Attachment',
        url: readString(attachment.url, 2000),
      }))
      .filter((attachment) => /^https?:\/\//i.test(attachment.url))
      .slice(0, MAX_ATTACHMENTS)

    const card: OpenCard = {
      id,
      name: readString(entry.name, MAX_TITLE_CHARS) || 'Card',
      desc: readString(entry.desc, MAX_TEXT_CHARS),
      listId: typeof entry.idList === 'string' ? entry.idList : '',
      due: readString(entry.due, 64),
      labels,
      initials,
      attachments,
    }
    openCardById.set(id, card)

    if (!openListIds.has(card.listId)) {
      unfiled.push(card)
      report.unfiledCards += 1
      continue
    }
    const existing = cardsByList.get(card.listId)
    if (existing) existing.push(card)
    else cardsByList.set(card.listId, [card])
  }

  // --- Checklists, gathered onto the card that owns them -------------------
  const checklistsByCard = new Map<string, Array<{ name: string; items: ChecklistItem[] }>>()
  for (const entry of sortByPos(readArray(raw.checklists), (c) => (isRecord(c) ? c.pos : undefined))) {
    if (!isRecord(entry)) continue
    const cardId = typeof entry.idCard === 'string' ? entry.idCard : ''
    // A checklist on an archived card is dropped with its card, and already
    // counted as an archived card.
    if (!openCardById.has(cardId)) continue

    const rawItems = sortByPos(readArray(entry.checkItems), (i) => (isRecord(i) ? i.pos : undefined))
    const keptItems = rawItems.slice(0, MAX_CHECK_ITEMS)
    report.truncatedCheckItems += rawItems.length - keptItems.length
    const items: ChecklistItem[] = []
    for (const rawItem of keptItems) {
      if (!isRecord(rawItem)) continue
      const label = readString(rawItem.name, MAX_TITLE_CHARS)
      if (!label) continue
      items.push({ id: crypto.randomUUID(), label, done: rawItem.state === 'complete' })
    }
    if (items.length === 0) continue

    const name = readString(entry.name, MAX_TITLE_CHARS)
    const existing = checklistsByCard.get(cardId)
    if (existing) existing.push({ name, items })
    else checklistsByCard.set(cardId, [{ name, items }])
  }

  // --- The kanban spine ----------------------------------------------------
  const columns: KanbanData['columns'] = []
  const takeCards = (source: readonly OpenCard[]) => {
    const kept = source.slice(0, MAX_CARDS_PER_COLUMN)
    report.truncatedCards += source.length - kept.length
    report.cards += kept.length
    return kept.map((card) => ({ id: crypto.randomUUID(), label: card.name }))
  }
  for (const list of openLists) {
    columns.push({
      id: crypto.randomUUID(),
      label: list.label,
      cards: takeCards(cardsByList.get(list.id) ?? []),
    })
  }
  if (unfiled.length > 0) {
    columns.push({
      id: crypto.randomUUID(),
      label: UNFILED_COLUMN_LABEL,
      cards: takeCards(unfiled),
    })
  }
  report.columns = columns.length

  const staged: StagedWidget[] = []
  const clusters: StagedCluster[] = []
  const boardKey = 'board'
  // The standalone Kanban card was retired; its board IS the Checklist's Board
  // skin now. Lists collapse onto the three lanes that skin owns, so the first
  // list reads as to-do and the last as done — the same mapping old saved kanban
  // boards get when they migrate on load.
  const lastColumn = columns.length - 1
  staged.push({
    key: boardKey,
    type: 'checklist',
    title: report.boardName,
    data: {
      mode: 'board',
      items: columns.flatMap((column, columnIndex) => {
        // `done` is derived FROM the lane, never decided beside it: a board with
        // a single list makes index 0 both the first and the last column, and the
        // two halves would otherwise disagree and file every card under Done.
        const status: 'todo' | 'doing' | 'done' =
          columnIndex === 0 ? 'todo' : columnIndex === lastColumn ? 'done' : 'doing'
        return column.cards.map((card) => ({
          id: card.id,
          label: card.label,
          done: status === 'done',
          status,
        }))
      }),
    },
    badges: [],
  })

  let sideWidgets = 0
  const claimRoom = (count: number): boolean => {
    if (sideWidgets + count <= MAX_SIDE_WIDGETS) {
      sideWidgets += count
      return true
    }
    report.truncatedSideWidgets += 1
    return false
  }

  const boardDesc = readString(raw.desc, MAX_TEXT_CHARS)
  if (boardDesc && claimRoom(1)) {
    staged.push({
      key: 'board-desc',
      type: 'text',
      title: `About ${report.boardName}`.slice(0, MAX_TITLE_CHARS),
      data: { text: boardDesc },
      badges: [],
    })
    report.notes += 1
  }

  // --- Promote every card that carries more than a title -------------------
  // Once the side-widget cap is reached the promotion stops there — which cards
  // are promoted must not depend on how many members the ones after them need —
  // but the loop runs on so every card it drops is counted, not just the first.
  let capped = false
  for (const card of openCardById.values()) {
    const cardChecklists = checklistsByCard.get(card.id) ?? []
    const badges: WidgetBadge[] = []
    if (card.due) badges.push({ type: 'deadline_countdown', dueDate: card.due })
    if (card.labels.length > 0) badges.push({ type: 'tag_pill', tags: card.labels })
    if (card.initials.length > 0) {
      badges.push({ type: 'assignee_avatars', initials: card.initials })
    }

    const hasContent = card.desc !== '' || cardChecklists.length > 0 || card.attachments.length > 0
    if (!hasContent && badges.length === 0) continue

    // One widget per kind of detail the card carries. The first member leads:
    // it wears the badges and receives the relation from the board, because it
    // is what a reader looks at first.
    const members: StagedWidget[] = []

    // A card with only a deadline still deserves a readable face, so the note
    // falls back to naming the card rather than resting blank.
    if (card.desc !== '' || cardChecklists.length === 0) {
      members.push({
        key: `card:${card.id}:note`,
        type: 'text',
        title: card.name,
        data: { text: card.desc || card.name },
        badges: [],
      })
    }
    cardChecklists.forEach((checklist, index) => {
      const generic = checklist.name === '' || checklist.name.toLowerCase() === 'checklist'
      members.push({
        key: `card:${card.id}:checklist:${index}`,
        type: 'checklist',
        title: (generic ? card.name : `${card.name} · ${checklist.name}`).slice(0, MAX_TITLE_CHARS),
        data: { items: checklist.items },
        badges: [],
      })
    })
    if (card.attachments.length > 0) {
      members.push({
        key: `card:${card.id}:links`,
        type: 'links',
        title: `${card.name} · Attachments`.slice(0, MAX_TITLE_CHARS),
        data: { items: card.attachments.map((a) => ({ id: crypto.randomUUID(), ...a })) },
        badges: [],
      })
    }
    if (members.length === 0) continue
    if (capped) {
      report.truncatedSideWidgets += 1
      continue
    }
    if (!claimRoom(members.length)) {
      // claimRoom has already counted this card as trimmed.
      capped = true
      continue
    }

    members[0]!.badges = badges
    staged.push(...members)
    if (members.length >= 2) {
      clusters.push({ name: card.name, memberKeys: members.map((member) => member.key) })
      report.clusters += 1
    }

    report.promotedCards += 1
    report.notes += members.filter((member) => member.type === 'text').length
    report.checklists += members.filter((member) => member.type === 'checklist').length
    report.linkCards += members.filter((member) => member.type === 'links').length
    if (card.due) report.carriedDueDates += 1
    report.carriedLabels += card.labels.length
    report.carriedMembers += card.initials.length
    report.carriedAttachments += card.attachments.length
  }

  // Comments live in the action log, not on the card, and Grovepad has no
  // per-card comment thread to receive them.
  for (const entry of readArray(raw.actions)) {
    if (isRecord(entry) && entry.type === 'commentCard') report.droppedComments += 1
  }

  // --- Placement -----------------------------------------------------------
  // The board is the root and everything promoted hangs beneath it, so the
  // shared tidy-tree owner does the arranging. A cluster is laid out as ONE
  // node sized to its welded stack; its members are then dealt down that
  // column a seam apart. No second layout algorithm lives here.
  const sizeByKey = new Map<string, PlanNodeSize>()
  for (const item of staged) sizeByKey.set(item.key, sizeFor(item))

  const clusterByLeadKey = new Map<string, StagedCluster>()
  const memberToLead = new Map<string, string>()
  for (const cluster of clusters) {
    const [leadKey] = cluster.memberKeys
    if (leadKey === undefined) continue
    clusterByLeadKey.set(leadKey, cluster)
    for (const key of cluster.memberKeys) memberToLead.set(key, leadKey)
  }

  const nodeIds: string[] = []
  const nodeSizes: Record<string, PlanNodeSize> = {}
  for (const item of staged) {
    const leadKey = memberToLead.get(item.key)
    // Welded followers are placed by their cluster, not by the tree.
    if (leadKey !== undefined && leadKey !== item.key) continue
    nodeIds.push(item.key)
    const cluster = clusterByLeadKey.get(item.key)
    const own = sizeByKey.get(item.key) ?? { ...widgetDefinition(item.type).defaultSize }
    nodeSizes[item.key] = cluster ? clusterSize(cluster, sizeByKey) : own
  }

  const parentRelations = nodeIds
    .filter((key) => key !== boardKey)
    .map((key) => ({ from: boardKey, to: key }))

  const positions = layoutParentGraph({ nodeIds, parentRelations }, nodeSizes)

  const idByKey: Record<string, string> = {}
  for (const item of staged) idByKey[item.key] = crypto.randomUUID()

  const widgets: Record<string, Widget> = {}
  const place = (item: StagedWidget, x: number, y: number) => {
    const id = idByKey[item.key]!
    widgets[id] = {
      id,
      type: item.type,
      title: item.title,
      canvasId,
      position: { x: x + IMPORT_ORIGIN.x, y: y + IMPORT_ORIGIN.y },
      size: sizeByKey.get(item.key) ?? { ...widgetDefinition(item.type).defaultSize },
      metadata: { badges: item.badges },
      data: item.data,
    }
  }

  const stagedByKey = new Map(staged.map((item) => [item.key, item]))
  for (const nodeId of nodeIds) {
    const position = positions[nodeId] ?? { x: 0, y: 0 }
    const cluster = clusterByLeadKey.get(nodeId)
    const lead = stagedByKey.get(nodeId)
    if (!lead) continue
    if (!cluster) {
      place(lead, position.x, position.y)
      continue
    }
    // The frame's title strip sits above the first member, so the stack starts
    // below that headroom instead of under the row above it.
    let y = position.y + GLUE_TITLE_HEADROOM
    for (const key of cluster.memberKeys) {
      const member = stagedByKey.get(key)
      if (!member) continue
      place(member, position.x, y)
      y += (sizeByKey.get(key)?.height ?? 0) + GLUE_GAP
    }
  }

  const relations: Relation[] = []
  for (const relation of parentRelations) {
    const fromId = idByKey[relation.from]
    const toId = idByKey[relation.to]
    if (!fromId || !toId) continue
    relations.push({
      id: crypto.randomUUID(),
      fromId,
      toId,
      type: 'parent',
      isResolved: false,
    })
  }

  const glues: WidgetGlue[] = clusters.map((cluster) => ({
    id: crypto.randomUUID(),
    widgetIds: cluster.memberKeys
      .map((key) => idByKey[key])
      .filter((id): id is string => id !== undefined),
    name: cluster.name,
  }))

  return { widgets, relations, glues, report }
}

/** Registry default width, grown to whatever the mapped content needs — the
    same rule `buildWidget` applies, so an imported card does not resize the
    moment its renderer measures itself. */
function sizeFor(item: StagedWidget): PlanNodeSize {
  const base = widgetDefinition(item.type).defaultSize
  return {
    width: base.width,
    height: Math.max(base.height, computeDataHeight(item.type, item.data)),
  }
}

/** A welded stack occupies its widest member and the sum of its heights, plus
    one seam between each pair and the frame's title headroom on top. */
function clusterSize(cluster: StagedCluster, sizeByKey: Map<string, PlanNodeSize>): PlanNodeSize {
  let width = 0
  let height = GLUE_TITLE_HEADROOM
  cluster.memberKeys.forEach((key, index) => {
    const size = sizeByKey.get(key)
    if (!size) return
    width = Math.max(width, size.width)
    height += size.height + (index === cluster.memberKeys.length - 1 ? 0 : GLUE_GAP)
  })
  return { width, height }
}

/** One-line summary of what crossed over and what did not. */
export function describeTrelloImport(report: TrelloImportReport): string {
  const made: string[] = [
    `${report.cards} card${report.cards === 1 ? '' : 's'} in ${report.columns} column${report.columns === 1 ? '' : 's'}`,
  ]
  if (report.promotedCards > 0) {
    made.push(
      `${report.promotedCards} detailed card${report.promotedCards === 1 ? '' : 's'} opened out beside it`,
    )
  }

  const kept: string[] = []
  if (report.carriedDueDates > 0) kept.push(`${report.carriedDueDates} due dates`)
  if (report.carriedLabels > 0) kept.push(`${report.carriedLabels} labels`)
  if (report.carriedMembers > 0) kept.push(`${report.carriedMembers} members`)
  if (report.carriedAttachments > 0) kept.push(`${report.carriedAttachments} attachments`)

  const lost: string[] = []
  const archived = report.archivedLists + report.archivedCards
  if (archived > 0) lost.push(`${archived} archived`)
  if (report.droppedComments > 0) lost.push(`${report.droppedComments} comments`)
  const truncated =
    report.truncatedColumns +
    report.truncatedCards +
    report.truncatedSideWidgets +
    report.truncatedCheckItems
  if (truncated > 0) lost.push(`${truncated} trimmed for size`)

  let summary = `Imported ${made.join(', ')}.`
  if (kept.length > 0) summary += ` Kept ${kept.join(', ')}.`
  if (lost.length > 0) summary += ` Not carried over: ${lost.join(', ')}.`
  return summary
}
