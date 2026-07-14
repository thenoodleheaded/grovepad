import type { ModuleType } from '../types/spatial'
import { widgetDefinition } from '../widgets/registry'
import { LOCAL_MODEL_PLAN_MAX_NODES } from '../services/local-ai/planProtocol'
import {
  resolveWidgetMention,
  type ProposedGroup,
  type ProposedNode,
  type ProposedRelation,
  type ThoughtPlan,
} from './thoughtInterpreter'

/**
 * Deterministic structural planner — the layer that executes quantified,
 * structural requests ("3 main topics, 5 subtopics each, attach a sketchpad
 * in a group to every subtopic") without any model involvement.
 *
 * Counts and repetition are arithmetic, not language understanding: a
 * request that states its own topology should be built by a loop, perfectly,
 * on every device tier — including with AI fully disabled. A model, when
 * present, may later improve *titles* on the resulting skeleton; it never
 * authors or edits this structure.
 */

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

interface StructuralLevel {
  count: number
  /** Singular noun for titles: "Topic", "Step"… */
  noun: string
}

interface StructuralAttachment {
  /** Explicit widget type, or the first of the study rotation when vague. */
  type: ModuleType
  /** Wrap the attachment and its host node in a real widget group. */
  grouped: boolean
  /** Index into `levels` whose nodes receive the attachment (default: deepest). */
  levelIndex: number
  /** Vague "appropriate study widgets" — rotate through the subject set
   *  per host instead of cloning one type. */
  rotate?: boolean
}

export interface StructuralSpec {
  topic: string
  levels: StructuralLevel[]
  attachments: StructuralAttachment[]
}

/** Numbers users actually type in structural requests. */
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
}

/** Nouns that read as levels of a hierarchy — a deliberate whitelist so
 *  "buy 3 apples" never becomes a tree. */
const LEVEL_NOUNS = new Set([
  'topic', 'subtopic', 'section', 'subsection', 'chapter', 'subchapter',
  'phase', 'step', 'stage', 'item', 'lesson', 'module', 'unit', 'part',
  'area', 'category', 'subcategory', 'branch', 'point', 'question', 'theme',
])

/** Context words that justify a single-level structural read. */
const TREE_CONTEXT = /\b(tree|outline|structure|course|breakdown|hierarchy|map|curriculum|syllabus)\b/i

const COUNT_PHRASE = new RegExp(
  String.raw`\b(\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})\s+(?:main\s+|top[- ]level\s+)?([a-z][a-z-]{2,20}?)(s)?\b(\s+(?:each|per|in each|apiece|for each)\b)?`,
  'gi',
)

function parseCount(raw: string): number | null {
  const numeric = Number(raw)
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 99) return numeric
  return NUMBER_WORDS[raw.toLowerCase()] ?? null
}

function singularNoun(noun: string): string {
  return noun.replace(/^\p{L}/u, (ch) => ch.toUpperCase())
}

interface RawLevelMatch {
  count: number
  noun: string
  perParent: boolean
  index: number
}

function findLevels(source: string): RawLevelMatch[] {
  const matches: RawLevelMatch[] = []
  for (const match of source.matchAll(COUNT_PHRASE)) {
    const count = parseCount(match[1]!)
    const noun = match[2]!.toLowerCase()
    if (count === null || !LEVEL_NOUNS.has(noun)) continue
    matches.push({
      count,
      noun,
      perParent: Boolean(match[4]) || noun.startsWith('sub'),
      index: match.index!,
    })
  }
  return matches
}

// --- Attachments -------------------------------------------------------------

/** Study-appropriate widget rotations by subject category. Explicit and
 *  reviewable on purpose — this is taste, not pattern matching. */
const STUDY_WIDGETS: Record<string, ModuleType[]> = {
  math: ['formula_sheet', 'flashcards', 'quiz'],
  science: ['formula_sheet', 'flashcards', 'quiz'],
  language: ['vocab', 'flashcards', 'quiz'],
  humanities: ['cornell', 'flashcards', 'quiz'],
  coding: ['code', 'checklist', 'quiz'],
  default: ['flashcards', 'quiz', 'cornell'],
}

const SUBJECT_CATEGORIES: ReadonlyArray<[RegExp, string]> = [
  [/\b(calc(?:ulus)?|algebra|geometry|trig(?:onometry)?|statistics|probability|math)\b/i, 'math'],
  [/\b(physics|chemistry|biology|astronomy|science)\b/i, 'science'],
  [/\b(spanish|french|german|japanese|chinese|korean|italian|language|vocabulary)\b/i, 'language'],
  [/\b(history|literature|philosophy|law|psychology|economics)\b/i, 'humanities'],
  [/\b(programming|coding|javascript|typescript|python|rust|algorithms?)\b/i, 'coding'],
]

function studyWidgetsForSubject(subject: string): ModuleType[] {
  for (const [pattern, category] of SUBJECT_CATEGORIES) {
    if (pattern.test(subject)) return STUDY_WIDGETS[category]!
  }
  return STUDY_WIDGETS.default!
}

const VAGUE_STUDY_ATTACH = /\b(?:appropriate|suitable|useful|relevant)\s+widgets?\b|\bwidgets?\s+(?:for\s+(?:me|us)\s+)?to\s+(?:study|learn|practi[cs]e|revise)\b/i
const ATTACH_CLAUSE = /\b(?:attach|add|include)\s+(?:a|an|the)?\s*([a-z][\w\s]{2,28}?)(?=\s+(?:in a group|to (?:each|every)|for (?:each|every)|per\b|widgets?\b)|\s*[,.;]|$)/gi
const GROUP_DIRECTIVE = /\bin\s+(?:a\s+)?groups?\b|\bgroup(?:ed)?\s+(?:it\s+)?with\b/i

function attachmentLevelIndex(clause: string, levels: StructuralLevel[]): number {
  const deepest = levels.length - 1
  const target = clause.match(/\b(?:each|every)\s+([a-z-]{3,20}?)s?\b/i)?.[1]?.toLowerCase()
  if (!target) return deepest
  const index = levels.findIndex((level) => level.noun.toLowerCase() === target)
  return index >= 0 ? index : deepest
}

/** The text one attach directive owns: from its verb up to the next attach
 *  verb or sentence boundary — so "in a group" scopes only its own widget. */
function directiveClause(source: string, start: number): string {
  const rest = source.slice(start)
  let end = rest.length
  const dot = rest.indexOf('.')
  if (dot !== -1) end = Math.min(end, dot)
  const nextDirective = rest.slice(4).search(/\b(?:attach|add|include)\b/i)
  if (nextDirective !== -1) end = Math.min(end, nextDirective + 4)
  return rest.slice(0, end)
}

function findAttachments(source: string, topic: string, levels: StructuralLevel[]): StructuralAttachment[] {
  const attachments: StructuralAttachment[] = []
  const claimed = new Set<ModuleType>()

  for (const match of source.matchAll(ATTACH_CLAUSE)) {
    const mention = match[1]!
    const type = resolveWidgetMention(mention)
    if (!type || claimed.has(type)) continue
    const clause = directiveClause(source, match.index!)
    claimed.add(type)
    attachments.push({
      type,
      grouped: GROUP_DIRECTIVE.test(clause),
      levelIndex: attachmentLevelIndex(clause, levels),
    })
  }

  const vagueMatch = source.match(VAGUE_STUDY_ATTACH)
  if (vagueMatch) {
    const rotation = studyWidgetsForSubject(`${topic} ${source}`)
    if (!rotation.some((type) => claimed.has(type))) {
      const clause = directiveClause(source, vagueMatch.index!)
      attachments.unshift({
        type: rotation[0]!,
        grouped: GROUP_DIRECTIVE.test(clause),
        levelIndex: attachmentLevelIndex(clause, levels),
        rotate: true,
      })
    }
  }

  return attachments
}

// --- Topic --------------------------------------------------------------------

function extractTopic(source: string, firstCountIndex: number): string {
  const head = source.slice(0, firstCountIndex)
  const cleaned = head
    .replace(/^\s*(?:please\s+)?(?:make|create|build|give|generate|draft|set\s*up|sketch)\s*(?:me|us)?\s*/i, '')
    .replace(/\b(?:a|an|the)\b\s*/gi, ' ')
    .replace(/\s*(?:topic|course)?\s*(?:tree|outline|structure|breakdown|hierarchy|map)\b.*$/i, '')
    .replace(/[,:;.\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return 'Structure'
  return cleaned.replace(/^\p{L}/u, (ch) => ch.toUpperCase()).slice(0, 48)
}

/**
 * Recognizes an explicitly quantified structure. Conservative by design:
 * counts must be attached to whitelisted level nouns, a second level must be
 * unambiguously per-parent ("each"/"per"/sub-prefix), and a single level
 * needs tree-ish context. Anything uncertain returns null — this layer must
 * never hijack ordinary thoughts.
 */
export function detectStructuralRequest(source: string): StructuralSpec | null {
  const text = source.trim()
  if (text.length < 8 || text.length > 400) return null

  const raw = findLevels(text)
  if (raw.length === 0 || raw.length > 3) return null
  if (raw.length === 1 && !TREE_CONTEXT.test(text)) return null
  // Deeper levels must be explicitly per-parent; two absolute counts
  // ("3 sections, 5 chapters") are ambiguous and rejected, not guessed.
  if (raw.slice(1).some((level) => !level.perParent)) return null

  const levels: StructuralLevel[] = raw.map((level) => ({
    count: level.count,
    noun: singularNoun(level.noun),
  }))
  const topic = extractTopic(text, raw[0]!.index)
  return { topic, levels, attachments: findAttachments(text, topic, levels) }
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

function makeNode(
  temporaryId: string,
  widgetType: ModuleType,
  title: string,
  source: string,
  depth: number,
): ProposedNode {
  return {
    temporaryId,
    widgetType,
    title: title.slice(0, 80),
    data: widgetDefinition(widgetType).defaultData(),
    sourceText: source,
    confidence: 0.95,
    depth,
    metadata: { badges: [], sourceText: source, interpretationConfidence: 0.95 },
  }
}

/** Total nodes a spec would expand to, including the root and attachments. */
function expandedNodeCount(levels: StructuralLevel[], attachments: StructuralAttachment[]): number {
  const perLevel: number[] = []
  let running = 1
  for (const level of levels) {
    running *= level.count
    perLevel.push(running)
  }
  let total = 1 + perLevel.reduce((sum, count) => sum + count, 0)
  for (const attachment of attachments) total += perLevel[attachment.levelIndex] ?? 0
  return total
}

/**
 * Builds the full plan from a detected spec. Pure and total: the result is
 * always valid, always connected, and always within the node budget — if the
 * literal request would exceed it, the deepest level is scaled down and a
 * visible warning explains exactly what changed. Never silently truncates.
 */
function buildStructuralPlan(spec: StructuralSpec, source: string): ThoughtPlan {
  const warnings: ThoughtPlan['warnings'] = []
  const levels = spec.levels.map((level) => ({ ...level }))

  // Budget guard — shrink the deepest level first, then work upward.
  for (let levelIndex = levels.length - 1; levelIndex >= 0; levelIndex--) {
    const original = levels[levelIndex]!.count
    while (levels[levelIndex]!.count > 1 && expandedNodeCount(levels, spec.attachments) > LOCAL_MODEL_PLAN_MAX_NODES) {
      levels[levelIndex]!.count--
    }
    if (levels[levelIndex]!.count !== original) {
      warnings.push({
        code: 'fallback',
        message: `Reduced to ${levels[levelIndex]!.count} ${levels[levelIndex]!.noun.toLowerCase()}s per branch to stay under the ${LOCAL_MODEL_PLAN_MAX_NODES}-widget limit — ask again to add more.`,
      })
    }
    if (expandedNodeCount(levels, spec.attachments) <= LOCAL_MODEL_PLAN_MAX_NODES) break
  }

  const nodes: ProposedNode[] = []
  const relations: ProposedRelation[] = []
  const groups: ProposedGroup[] = []

  const rootId = 's-root'
  nodes.push(makeNode(rootId, 'notes', spec.topic, source, 0))

  const studyRotation = studyWidgetsForSubject(`${spec.topic} ${source}`)
  let rotationCursor = 0

  interface LevelEntry { id: string; title: string; ordinal: string }
  let parents: LevelEntry[] = [{ id: rootId, title: spec.topic, ordinal: '' }]

  levels.forEach((level, levelIndex) => {
    const next: LevelEntry[] = []
    parents.forEach((parent) => {
      for (let position = 0; position < level.count; position++) {
        const ordinal = parent.ordinal ? `${parent.ordinal}.${position + 1}` : `${position + 1}`
        const id = `s-${ordinal.replaceAll('.', '-')}`
        const title = `${level.noun} ${ordinal}`
        nodes.push(makeNode(id, 'notes', title, source, levelIndex + 1))
        relations.push({ fromTemporaryId: parent.id, toTemporaryId: id, type: 'parent' })
        next.push({ id, title, ordinal })
      }
    })
    parents = next

    // A host with several grouped attachments gets ONE group holding all of
    // them — overlapping two-member groups would steal members from each
    // other at commit time.
    const groupMembersByHost = new Map<string, { title: string; members: string[] }>()
    for (const attachment of spec.attachments) {
      if (attachment.levelIndex !== levelIndex) continue
      for (const host of next) {
        // The vague "study widgets" attachment rotates through the
        // subject's set so a branch gets varied drills, not N clones.
        const type = attachment.rotate
          ? studyRotation[rotationCursor++ % studyRotation.length]!
          : attachment.type
        const attachmentId = `${host.id}-${type}`
        if (nodes.some((node) => node.temporaryId === attachmentId)) continue
        nodes.push(makeNode(attachmentId, type, `${widgetDefinition(type).label} ${host.ordinal}`, source, levelIndex + 2))
        relations.push({ fromTemporaryId: host.id, toTemporaryId: attachmentId, type: 'parent' })
        if (attachment.grouped) {
          const entry = groupMembersByHost.get(host.id) ?? { title: host.title, members: [host.id] }
          entry.members.push(attachmentId)
          groupMembersByHost.set(host.id, entry)
        }
      }
    }
    for (const [hostId, entry] of groupMembersByHost) {
      groups.push({
        temporaryId: `g-${hostId}`,
        memberTemporaryIds: entry.members,
        label: entry.title,
      })
    }
  })

  return {
    sourceText: source,
    confidence: 0.95,
    nodes,
    relations,
    groups,
    warnings,
  }
}

/** One-call convenience used by the interpretation pipeline. */
export function planStructuralRequest(source: string): ThoughtPlan | null {
  const spec = detectStructuralRequest(source)
  if (!spec) return null
  return buildStructuralPlan(spec, source)
}
