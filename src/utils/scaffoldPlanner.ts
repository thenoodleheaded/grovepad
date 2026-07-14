import type { ModuleType } from '../types/spatial'
import { widgetDefinition } from '../widgets/registry'
import type { ProposedNode, ProposedRelation, ThoughtPlan } from './thoughtInterpreter'
import { detectDate } from './thoughtInterpreter'
import { resolveArchetypeById, shortlistArchetypes } from './scenarioResolver'

/**
 * Heuristic scaffold — the deterministic half of the Quick Add handshake.
 *
 * When a thought is too vague for confident widget prediction and no curated
 * scenario trigger fires, this builds a *guaranteed* starter tree in
 * microseconds: the closest catalogue archetype supplies the widget mix, the
 * source text supplies topic, dates, amounts, and clauses. The local model
 * may later rename branches and add a few connected nodes, but the scaffold
 * is always complete and committable on its own — including on devices with
 * no model at all.
 */

export interface ThoughtScaffold {
  plan: ThoughtPlan
  archetypeId: string
  archetypeLabel: string
  topic: string
}

const SCAFFOLD_CONFIDENCE = 0.62
/** Below this shortlist score the archetype is a coin toss — use the
 *  generic sense-making scaffold instead of a wrong-looking specific one. */
const MIN_ARCHETYPE_SCORE = 0.14

const FILLER = /^(?:ok(?:ay)?|so|um+|uh+|well|please|pls|plz|hey|hi|help(?: me)?(?: with)?|i (?:want|need|wanna|gotta|should(?: probably)?|have) to)\s+/i

/** A short human title for the root card — the thought, tidied. */
function rootTitle(source: string): string {
  let text = source.trim().replace(/\s+/g, ' ')
  for (let i = 0; i < 4; i++) text = text.replace(FILLER, '')
  text = text.replace(/[.!?…]+$/, '').trim()
  if (!text) text = source.trim()
  const capped = text.replace(/^\p{Ll}/u, (ch) => ch.toUpperCase())
  return capped.length > 56 ? `${capped.slice(0, 53).trimEnd()}…` : capped
}

/** Urgency rank for branch ordering — deadline-carrying and actionable
 *  widgets surface first so the tree reads as a priority derivation. */
function priorityRank(node: ProposedNode): number {
  if (detectDate(node.sourceText) || node.widgetType === 'countdown' || node.widgetType === 'date_picker') return 0
  if (['checklist', 'assignment', 'kanban', 'priority_matrix', 'daily_agenda', 'weekly_planner', 'process'].includes(node.widgetType)) return 1
  if (['budget', 'goal_tracker', 'study_goal', 'timeline', 'habit', 'pomodoro'].includes(node.widgetType)) return 2
  return 3
}

function checklistNode(id: string, title: string, source: string, labels: readonly string[]): ProposedNode {
  return {
    temporaryId: id,
    widgetType: 'checklist',
    title,
    data: { items: labels.map((label) => ({ id: crypto.randomUUID(), label: label.slice(0, 80), done: false })) },
    sourceText: source,
    confidence: SCAFFOLD_CONFIDENCE,
    depth: 1,
    metadata: { badges: [], sourceText: source, interpretationConfidence: SCAFFOLD_CONFIDENCE },
  }
}

/** The archetype-free fallback: sort-it-out trio that fits any thought. */
const GENERIC_BRANCHES: ReadonlyArray<{ type: ModuleType; title: string }> = [
  { type: 'checklist', title: 'First steps' },
  { type: 'priority_matrix', title: 'What matters most' },
  { type: 'notes', title: 'Everything on your mind' },
]

export interface ScaffoldOptions {
  /** Clauses already split by the interpreter — avoids re-parsing. */
  clauses?: readonly string[]
}

/**
 * Builds the scaffold. Never throws; returns null only for empty input.
 * The plan uses stable `s-*` ids so it can serve as a model skeleton.
 */
export function buildScaffold(sourceText: string, options: ScaffoldOptions = {}): ThoughtScaffold | null {
  const source = sourceText.trim()
  if (!source) return null

  const [top] = shortlistArchetypes(source, 1)
  const useArchetype = top && top.score >= MIN_ARCHETYPE_SCORE
  const resolution = useArchetype
    ? resolveArchetypeById(top.id, undefined, { sourceText: source, routeConfidence: Math.max(0.5, top.score) })
    : null
  const hub = resolution
    ? resolution.directions.find((direction) => direction.id === resolution.recommendedId) ?? resolution.directions[0]
    : undefined

  const root: ProposedNode = {
    temporaryId: 's-0',
    widgetType: 'sticky_note',
    title: rootTitle(source),
    data: { ...(widgetDefinition('sticky_note').defaultData() as unknown as Record<string, unknown>), text: source } as ProposedNode['data'],
    sourceText: source,
    confidence: SCAFFOLD_CONFIDENCE,
    depth: 0,
    metadata: { badges: [], sourceText: source, interpretationConfidence: SCAFFOLD_CONFIDENCE },
  }

  let branches: ProposedNode[]
  if (hub && hub.plan.nodes.length > 0) {
    branches = hub.plan.nodes.slice(0, 5).map((node, index) => ({
      ...node,
      temporaryId: `s-${index + 1}`,
      depth: 1,
      confidence: SCAFFOLD_CONFIDENCE,
    }))
  } else {
    branches = GENERIC_BRANCHES.map((branch, index) => ({
      temporaryId: `s-${index + 1}`,
      widgetType: branch.type,
      title: branch.title,
      data: widgetDefinition(branch.type).defaultData(),
      sourceText: source,
      confidence: SCAFFOLD_CONFIDENCE,
      depth: 1,
      metadata: { badges: [], sourceText: source, interpretationConfidence: SCAFFOLD_CONFIDENCE },
    }))
  }

  // Multi-clause thoughts get their concrete pieces as a checklist branch so
  // nothing the user actually typed is lost in the template.
  const clauses = (options.clauses ?? []).map((clause) => clause.trim()).filter((clause) => clause.length > 2)
  if (clauses.length >= 2 && !branches.some((node) => node.widgetType === 'checklist')) {
    branches.push(checklistNode(`s-${branches.length + 1}`, 'Pieces of this', source, clauses.slice(0, 8)))
  } else if (clauses.length >= 2) {
    const existing = branches.find((node) => node.widgetType === 'checklist')!
    existing.data = { items: clauses.slice(0, 8).map((label) => ({ id: crypto.randomUUID(), label: label.slice(0, 80), done: false })) }
  }

  branches.sort((a, b) => priorityRank(a) - priorityRank(b))
  branches.forEach((node, index) => { node.temporaryId = `s-${index + 1}` })

  const nodes = [root, ...branches]
  const relations: ProposedRelation[] = branches.map((node) => ({
    fromTemporaryId: root.temporaryId,
    toTemporaryId: node.temporaryId,
    type: 'parent' as const,
  }))

  return {
    plan: {
      sourceText: source,
      confidence: SCAFFOLD_CONFIDENCE,
      nodes,
      relations,
      groups: [],
      warnings: [],
    },
    archetypeId: useArchetype ? top!.id : 'generic',
    archetypeLabel: resolution?.archetypeLabel ?? 'Starter structure',
    topic: resolution?.topic ?? rootTitle(source),
  }
}
