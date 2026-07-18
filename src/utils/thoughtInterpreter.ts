import type { ModuleData, ModuleType, RelationType, WidgetMetadata } from '../types/spatial'
import { WIDGET_REGISTRY, widgetDefinition } from '../widgets/registry'
import { ATLAS_CATALOG, ATLAS_TYPES, ATLAS_TYPE_SET, atlasTypeForPhrase, defaultAtlasData } from '../widgets/atlasCatalog'
import { AUTOMATION_CORE_CATALOG, AUTOMATION_CORE_TYPES } from '../widgets/automationCoreCatalog'
import { localDayKey } from './localDate'
import { buildVocabulary, fuzzyPhraseMatch, normalizeLanguage, tokenCoverage, type NormalizedLanguage } from './languageNormalization'

export interface InterpretationWarning {
  code: 'ambiguous' | 'fallback' | 'date' | 'relationship'
  message: string
}

export interface ProposedNode {
  temporaryId: string
  /** Existing canvas widget to relink instead of creating a duplicate. */
  existingWidgetId?: string
  widgetType: ModuleType
  title: string
  data: ModuleData
  sourceText: string
  confidence: number
  depth: number
  metadata: WidgetMetadata
}

export interface ProposedRelation {
  fromTemporaryId: string
  toTemporaryId: string
  type: RelationType
  label?: string
}

/** A real widget group (band + name pill) to create on commit — distinct
 *  from a parent relation, which only draws a line. */
export interface ProposedGroup {
  temporaryId: string
  memberTemporaryIds: string[]
  label?: string
}

export interface ThoughtPlan {
  sourceText: string
  confidence: number
  nodes: ProposedNode[]
  relations: ProposedRelation[]
  groups: ProposedGroup[]
  warnings: InterpretationWarning[]
}

export interface InterpretationContext {
  selectedWidgetTitle?: string
  selectedWidgetType?: ModuleType
  canvasName?: string
}

interface ExtractedMeaning {
  clauses: string[]
  people: string[]
  dates: string[]
  urls: string[]
  amounts: string[]
  modality: 'certain' | 'suggested' | 'possible'
  negated: boolean
}

export interface ThoughtPrediction {
  id: string
  label: string
  explanation: string
  confidence: number
  plan: ThoughtPlan
  primaryTypes: ModuleType[]
  kind: 'single' | 'combined' | 'fallback'
}

/** A tiny local model may select a curated scenario, but never authors its
 * widget graph. Slots are hints only and are revalidated before hydration. */
interface ScenarioRoute {
  archetypeId: string
  confidence: number
  topic?: string
  date?: string
  amount?: string
}

export interface ThoughtInterpretation {
  sourceText: string
  meaning: ExtractedMeaning
  predictions: ThoughtPrediction[]
  recommendedId: string | null
  confidenceMargin: number
  shouldAutoCommit: boolean
  scenarioRoute?: ScenarioRoute
}

type ParsedLine = { text: string; depth: number; checked?: boolean }

const ACTION_WORDS = /\b(ask|build|buy|call|check|create|email|finish|fix|make|plan|prepare|remember|review|send|ship|submit|test|update|write)\b/i
const CHECKBOX = /^\s*[-*+]\s*\[([ xX])\]\s+/
const OUTLINE = /^(\s*)(?:(?:[-*+]\s+)|(?:\d+[.)]\s+))?(.+)$/
const URL = /https?:\/\/[^\s<>)]+/gi
const MONEY = /(?:[$€£¥]\s?\d[\d,.]*|\d[\d,.]*\s?(?:usd|eur|gbp|dollars?|euros?|pounds?))/gi
const MENTION = /@([\p{L}\d_.-]+)/gu

/** Natural phrases that are stronger than a coincidental label mention. */
const INTENT_PATTERNS: Partial<Record<ModuleType, RegExp>> = {
  canvas_node: /\b(sub-?canvas|nested canvas|new board)\b/i,
  notes: /\b(note|jot|write this down)\b/i,
  bullets: /\b(bullet(?: point)?s?|unordered list)\b/i,
  checklist: /\b(checklist|to-?do|task list|steps? to complete)\b/i,
  table: /\b(table|rows? and columns?|tabular)\b/i,
  sketchpad: /\b(sketch|draw|doodle|whiteboard)\b/i,
  budget: /\b(budget|cost breakdown|expenses?)\b/i,
  progress: /\b(progress|completion|percent complete)\b/i,
  ai_generator: /\b(ai generator|generate with ai|ai prompt)\b/i,
  timeline: /\b(timeline|roadmap|phases?|milestones?|plan(?:ning)? (?:a |the )?(?:launch|release|rollout))\b/i,
  dialog: /\b(dialog(?:ue)?|conversation|script lines?)\b/i,
  game_tuner: /\b(game (?:mechanics? )?tuner|grip|drift|game feel)\b/i,
  audio_player: /\b(audio player|synth(?:esizer)?|signal chain|bpm)\b/i,
  kanban: /\b(kanban|to do doing done|workflow board)\b/i,
  countdown: /\b(countdown|days? until)\b/i,
  habit: /\b(habit(?: tracker)?|streak|daily habit)\b/i,
  links: /\b(link list|bookmarks?|urls?)\b/i,
  code: /\b(code snippet|source code|function|class)\b/i,
  quote: /\b(quote|quotation|said by)\b/i,
  poll: /\b(poll|vote|survey choice)\b/i,
  contact: /\b(contact card|phone number|email address)\b/i,
  media: /\b(media|image|video|photo)\b/i,
  metrics: /\b(metrics?|kpis?|measurements?|dashboard stats?)\b/i,
  divider: /\b(divider|section break|separator)\b/i,
  sticky_note: /\b(sticky(?: note)?|post-?it)\b/i,
  calendar: /\b(monthly calendar|calendar month)\b/i,
  timer: /\b(timer|time for \d+)\b/i,
  timekeeper: /\b(timer|countdown timer|pomodoro|focus session|work break timer|stopwatch|lap time)\b/i,
  tracker: new RegExp(`\\b(?:tracker|${ATLAS_TYPES.flatMap(type=>[ATLAS_CATALOG[type].label,type.replaceAll('_',' '),...ATLAS_CATALOG[type].aliases]).map(escapeRegex).join('|')})\\b`,'i'),
  rating: /\b(rating|stars?|score out of)\b/i,
  color_palette: /\b(colou?r palette|swatches?|hex colou?rs?)\b/i,
  mood_tracker: /\b(mood(?: tracker)?|feeling today)\b/i,
  calculator: /\b(calculator|calculate|arithmetic)\b/i,
  bar_chart: /\b(bar (?:chart|graph)|compare values)\b/i,
  counter: /\b(counter|tally|count up)\b/i,
  pros_cons: /\b(pros?\s*(?:and|&|\/)?\s*cons?|advantages?\s+(?:and|vs)\s+disadvantages?)\b/i,
  weekly_planner: /\b(week(?:ly)? plan(?:ner)?|plan my week)\b/i,
  goal_tracker: /\b(goal tracker|milestone goal|track (?:a )?goal)\b/i,
  stopwatch: /\b(stopwatch|lap time)\b/i,
  reading_list: /\b(reading list|books? (?:to read|i want|i need|to finish)|articles? (?:to read|i want)|get through (?:these )?books?)\b/i,
  flashcards: /\b(flashcards?|study cards?)\b/i,
  meeting_notes: /\b(meeting notes?|minutes|agenda and actions?)\b/i,
  priority_matrix: /\b(priority matrix|eisenhower|urgent (?:and|vs) important)\b/i,
  decision: /\b(decision picker|choose between|which option)\b/i,
  world_clock: /\b(world clock|time zones?)\b/i,
  pomodoro: /\b(pomodoro|focus session|work break timer)\b/i,
  vocab: /\b(vocab(?:ulary)?|word definitions?|glossary)\b/i,
  grade_calc: /\b(grade calculator|weighted grades?|final grade)\b/i,
  gpa: /\b(gpa|grade point average)\b/i,
  assignment: /\b(assignments?|homework|due task)\b/i,
  cornell: /\b(cornell notes?|cues and summary)\b/i,
  formula_sheet: /\b(formula sheet|equations? reference)\b/i,
  citation: /\b(citations?|references?|bibliography|sources?)\b/i,
  study_goal: /\b(study goal|study target|revision goal)\b/i,
  quiz: /\b(quiz|multiple choice|test question)\b/i,
  text_input: /\b(text input|text value|input field)\b/i,
  number_input: /\b(number input|numeric value|slider value)\b/i,
  toggle: /\b(toggle|on\/?off|boolean switch)\b/i,
  branch_gate: /\b(branch gate|conditional branch|if true|if false)\b/i,
  formula: /\b(formula widget|combine (?:two )?numbers?|live calculation)\b/i,
  status: /\b(status widget|workflow state|not started|in progress)\b/i,
  date_picker: /\b(date (?:and|&) time|date picker|target date)\b/i,
  outline: /\b(outline|nested list|hierarchy of ideas)\b/i,
  form: /\b(form builder|questionnaire|fill(?:able)? form)\b/i,
  daily_agenda: /\b(daily agenda|today'?s schedule|day plan)\b/i,
  process: /\b(process|sop|standard operating procedure|procedure steps?)\b/i,
  risk_register: /\b(risk register|risk assessment|mitigation)\b/i,
  decision_matrix: /\b(decision matrix|weighted criteria|score options?|weigh .+ (?:across|against|using)|evaluate .+ (?:across|against|using)|compare .+ (?:criteria|reliability|cost and))\b/i,
  swot: /\b(swot|strengths? weaknesses? opportunities? threats?)\b/i,
  timesheet: /\b(timesheet|billable hours?|time entries?)\b/i,
  inventory: /\b(inventory|stock levels?|quantities in stock)\b/i,
  logbook: /\b(logbook|activity log|journal entries?)\b/i,
  line_chart: /\b(line chart|trend line|values? over time)\b/i,
  pie_chart: /\b(pie chart|donut chart|share breakdown)\b/i,
  unit_converter: /\b(unit converter|convert .+ (?:to|into) .+)\b/i,
  clock_pulse: /\b(schedule pulse|automation schedule|daily trigger|weekly trigger)\b/i,
  comparator: /\b(compare (?:two )?numbers?|threshold check|greater than|less than)\b/i,
  aggregator: /\b(average|aggregate|combine (?:these )?numbers?|minimum|maximum)\b/i,
  range_mapper: /\b(range mapper|status bands?|number.*status)\b/i,
  latch: /\b(snapshot|baseline|remember (?:this )?value|hold (?:this )?value)\b/i,
  random_picker: /\b(random picker|pick for me|choose randomly|whose turn|what should i)\b/i,
  sequencer: /\b(sequencer|step machine|advance steps?|morning routine)\b/i,
  template: /\b(text composer|template (?:with|from) values|compose (?:a )?message)\b/i,
  recorder: /\b(record (?:a )?(?:trend|history|value)|track this over time|automatic chart)\b/i,
  notifier: /\b(notifier|remind me|notification|nudge me)\b/i,
  subscriptions: /\b(subscriptions?|recurring charges?|monthly bills?)\b/i,
  debt_payoff: /\b(debt payoff|pay off debt|credit card payoff)\b/i,
  expense_split: /\b(split (?:the )?(?:airbnb|bill|expenses?|cost)|who owes whom|shared expenses?)\b/i,
  invoices: /\b(invoices?|client receivables?|overdue invoice)\b/i,
  meal_planner: /\b(meal plan(?:ner)?|meal prep|what(?:'s| is) for dinner)\b/i,
  recipe: /\b(recipe|scale ingredients?|servings)\b/i,
  home_maintenance: /\b(home maintenance|replace (?:the )?filter|house chores?)\b/i,
  chore_rotation: /\b(chore rotation|whose turn|rotate chores?)\b/i,
  renewals_vault: /\b(renew passport|renewals?|expiry dates?|expiring)\b/i,
  medications: /\b(medications?|meds|pills|refill)\b/i,
  workout_plan: /\b(workout plan|sets? reps?|gym program|training volume)\b/i,
  job_applications: /\b(job applications?|application pipeline|follow up (?:on )?(?:jobs?|applications?))\b/i,
  okr: /\b(okrs?|objectives? and key results?)\b/i,
  decision_journal: /\b(decision journal|review my decisions?)\b/i,
  weekly_review: /\b(weekly review|weekly reflection|retro(?:spective)?)\b/i,
  snippet_library: /\b(snippet library|canned replies?|reusable snippets?)\b/i,
  keep_in_touch: /\b(keep in touch|call my friends?|contact cadence)\b/i,
  gifts_occasions: /\b(gifts?|birthdays?|anniversaries?)\b/i,
  trip_itinerary: /\b(trip itinerary|travel itinerary|trip plans?)\b/i,
  guest_list: /\b(guest list|rsvps?|invite(?:d|es)?)\b/i,
  ...Object.fromEntries(ATLAS_TYPES.map((type) => {
    const phrases = [ATLAS_CATALOG[type].label, type.replaceAll('_', ' '), ...ATLAS_CATALOG[type].aliases]
    return [type, new RegExp(`\\b(?:${phrases.map(escapeRegex).join('|')})\\b`, 'i')]
  })) as Partial<Record<ModuleType, RegExp>>,
  ...Object.fromEntries(AUTOMATION_CORE_TYPES.map((type) => {
    const phrases=[AUTOMATION_CORE_CATALOG[type].label,type.replaceAll('_',' '),...AUTOMATION_CORE_CATALOG[type].aliases]
    return [type,new RegExp(`\\b(?:${phrases.map(escapeRegex).join('|')})\\b`,'i')]
  })) as Partial<Record<ModuleType,RegExp>>,
}

const SEMANTIC_EXAMPLES: Partial<Record<ModuleType, string>> = {
  assignment: 'someone needs to handle this follow up delegate owner responsible due review submit deliver',
  checklist: 'things I need to get done several actionable tasks tick each one off',
  decision: 'which one should I choose alternatives either this or that make a choice',
  decision_matrix: 'weigh several providers compare options using cost quality speed reliability weighted evaluation',
  pros_cons: 'tradeoffs benefits drawbacks good and bad sides reasons for and against',
  timeline: 'plan a launch release rollout sequence phases milestones over time',
  reading_list: 'books articles papers I want to read finish or get through',
  metrics: 'watch performance conversion retention revenue measure results after release',
  budget: 'keep track of spending prices costs expenses money allocation',
  process: 'how we do this repeatable sequence instructions procedure workflow steps',
  risk_register: 'what could go wrong likelihood impact prevention contingency mitigation',
  meeting_notes: 'what everyone discussed decisions made follow ups from the call',
  daily_agenda: 'what I am doing today appointments schedule throughout the day',
  goal_tracker: 'outcome I am working toward milestones progress target achievement',
  inventory: 'what we have left quantities stock reorder low supply',
  contact: 'person details how to reach them phone email company',
  logbook: 'record what happened chronological events incidents observations',
  form: 'collect answers details questions fields people fill out',
}

const WIDGET_LANGUAGE_VOCABULARY = buildVocabulary(
  'add create make turn use widget generate track show record organize compare calculate',
  Object.values(WIDGET_REGISTRY).flatMap((definition) => [
    definition.type, definition.label, definition.description,
    INTENT_PATTERNS[definition.type]?.source ?? '', SEMANTIC_EXAMPLES[definition.type] ?? '',
  ]),
)

function uid(): string { return crypto.randomUUID() }

function isConsolidatedLegacyType(type:ModuleType):boolean {
  return ATLAS_TYPE_SET.has(type)||type==='timer'||type==='pomodoro'||type==='stopwatch'
}

function cleanTitle(text: string): string {
  return text
    .replace(CHECKBOX, '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '')
    .replace(/\s+!urgent\b/gi, '')
    .replace(/\s+@([\p{L}\d_.-]+)/gu, '')
    .trim()
}

function parseLines(source: string): ParsedLine[] {
  const raw = source.split(/\r?\n/).filter((line) => line.trim())
  return raw.map((line) => {
    const match = line.match(OUTLINE)
    const indentation = (match?.[1] ?? '').replace(/\t/g, '  ').length
    const checkbox = line.match(CHECKBOX)
    return {
      text: cleanTitle(match?.[2] ?? line),
      depth: Math.floor(indentation / 2),
      ...(checkbox ? { checked: checkbox[1]!.toLowerCase() === 'x' } : {}),
    }
  })
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(year, month, day)
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function detectDate(text: string, now = new Date()): string | null {
  const lower = text.toLowerCase()
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (/\btoday\b/.test(lower)) return isoDate(base.getFullYear(), base.getMonth(), base.getDate())
  if (/\btomorrow\b/.test(lower)) {
    base.setDate(base.getDate() + 1)
    return isoDate(base.getFullYear(), base.getMonth(), base.getDate())
  }
  const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const weekday = weekdayNames.findIndex((name) => new RegExp(`\\b(?:next\\s+)?${name}\\b`).test(lower))
  if (weekday >= 0) {
    let delta = (weekday - base.getDay() + 7) % 7
    if (delta === 0 || lower.includes(`next ${weekdayNames[weekday]}`)) delta += 7
    base.setDate(base.getDate() + delta)
    return isoDate(base.getFullYear(), base.getMonth(), base.getDate())
  }
  const numeric = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/)
  if (numeric) return isoDate(Number(numeric[1]), Number(numeric[2]) - 1, Number(numeric[3]))
  const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december']
  const named = lower.match(new RegExp(`\\b(${monthNames.join('|')})\\s+(\\d{1,2})(?:,?\\s+(20\\d{2}))?\\b`))
  if (named) {
    let year = named[3] ? Number(named[3]) : base.getFullYear()
    const month = monthNames.indexOf(named[1]!)
    const day = Number(named[2])
    let result = isoDate(year, month, day)
    if (!named[3] && result && result < isoDate(base.getFullYear(), base.getMonth(), base.getDate())!) result = isoDate(++year, month, day)
    return result
  }
  return null
}

function scoreIntents(source: string, lines: ParsedLine[], normalized: NormalizedLanguage) {
  const lower = normalized.correctedText.toLowerCase()
  const canonicalText = [...normalized.tokens].join(' ')
  const listLike = lines.length > 1
  const checkboxCount = lines.filter((line) => line.checked !== undefined).length
  const actionCount = lines.filter((line) => ACTION_WORDS.test(line.text)).length
  const scores: Partial<Record<ModuleType, number>> = {
    notes: 0.48,
    checklist: checkboxCount ? 0.72 + Math.min(.18, checkboxCount * .04) : (listLike ? .24 : 0) + (actionCount ? .36 : 0),
    decision: (source.includes('?') ? .4 : 0) + (/\b(or|choose|decide|which)\b/i.test(source) ? .4 : 0) - (listLike ? .18 : 0),
    pros_cons: /\b(pros?\s*(?:and|&|\/)?\s*cons?|advantages?\s+(?:and|vs)\s+disadvantages?|compare)\b/i.test(source) ? .9 : 0,
    budget: (source.match(MONEY) ?? []).length || /\bbudget\b/.test(lower) ? .88 : 0,
    metrics: /\b(track|metric|kpi|measure|percentage|percent)\b/.test(lower) ? .78 : 0,
    timeline: /\b(timeline|deadline|milestone|phase|before|after)\b/.test(lower) && lines.length > 1 ? .74 : 0,
    assignment: (ACTION_WORDS.test(source) ? .34 : 0) + ((source.match(MENTION) ?? []).length ? .32 : 0) + (detectDate(source) ? .3 : 0),
    links: (source.match(URL) ?? []).length ? .9 : 0,
    code: /```[\s\S]*```/.test(source) ? .96 : 0,
    bullets: listLike ? .58 : 0,
  }
  // Every registry entry is supported automatically. An explicit command such
  // as "make a Risk Register" wins; natural aliases remain slightly softer.
  for (const definition of Object.values(WIDGET_REGISTRY)) {
    if (isConsolidatedLegacyType(definition.type)) continue
    const label = definition.label.toLowerCase()
    const typeWords = definition.type.replaceAll('_', ' ')
    const explicit = lower.startsWith(`${label}:`) || lower.startsWith(`${typeWords}:`) ||
      new RegExp(`\\b(?:add|create|make|new|turn (?:this )?into|use)\\s+(?:an?\\s+)?(?:${escapeRegex(label)}|${escapeRegex(typeWords)})(?=\\s*(?:widget\\b|$|:))`, 'i').test(normalized.correctedText) ||
      new RegExp(`\\b(?:add|create|make|new|turn|use)\\s+(?:an?\\s+)?${escapeRegex(typeWords)}\\b`, 'i').test(canonicalText)
    const commandLike = ['add', 'create', 'make', 'new', 'turn', 'use'].some((action) => normalized.tokens.has(action))
    const fuzzyExplicit = commandLike && (fuzzyPhraseMatch(source, label) || fuzzyPhraseMatch(source, typeWords))
    const naturalPattern = INTENT_PATTERNS[definition.type]
    const natural = naturalPattern ? (naturalPattern.test(normalized.correctedText) || naturalPattern.test(canonicalText)) : false
    if (explicit) scores[definition.type] = Math.max(scores[definition.type] ?? 0, .98)
    else if (fuzzyExplicit) scores[definition.type] = Math.max(scores[definition.type] ?? 0, Math.min(.99, .95 + label.split(/\s+/).length * .01))
    else if (natural) scores[definition.type] = Math.max(scores[definition.type] ?? 0, .9)
  }
  return Object.entries(scores).sort((a, b) => b[1] - a[1]) as [ModuleType, number][]
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Resolves a short noun phrase ("sketchpad", "pomodoro timer", "flash cards")
 * to a registered widget type, using the same label/type-word/alias matching
 * the interpreter scores with. Returns null rather than guessing — callers
 * that need a fallback choose their own.
 */
export function resolveWidgetMention(phrase: string): ModuleType | null {
  const cleaned = phrase.trim().toLowerCase().replace(/\s+widgets?$/, '').trim()
  if (cleaned.length < 3) return null
  if (atlasTypeForPhrase(cleaned)) return 'tracker'
  if (/^(?:timer|countdown timer|pomodoro(?: timer)?|focus timer|stopwatch)$/.test(cleaned)) return 'timekeeper'
  for (const definition of Object.values(WIDGET_REGISTRY)) {
    if (isConsolidatedLegacyType(definition.type)) continue
    const label = definition.label.toLowerCase()
    const typeWords = definition.type.replaceAll('_', ' ')
    if (cleaned === label || cleaned === typeWords || cleaned === `${label}s` || cleaned === `${typeWords}s`) {
      return definition.type
    }
  }
  for (const definition of Object.values(WIDGET_REGISTRY)) {
    if (isConsolidatedLegacyType(definition.type)) continue
    if (INTENT_PATTERNS[definition.type]?.test(cleaned)) return definition.type
  }
  return null
}

function dataFor(type: ModuleType, source: string, lines: ParsedLine[]): ModuleData {
  const titleLines = lines.map((line) => line.text)
  const defaults = widgetDefinition(type).defaultData()
  const defaultRecord = defaults as unknown as Record<string, unknown>
  const numbers = [...source.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]))
  const percent = source.match(/(\d+(?:\.\d+)?)\s*%/)
  switch (type) {
    case 'tracker': return defaultAtlasData(atlasTypeForPhrase(source)??'price_book')
    case 'timekeeper': {
      const current=defaults as import('../types/widgetDataExpansion').TimekeeperData
      const mode=/pomodoro|focus session|work break/i.test(source)?'pomodoro':/stopwatch|lap time/i.test(source)?'stopwatch':'countdown'
      return {...current,mode}
    }
    case 'checklist': return { items: lines.map((line) => ({ id: uid(), label: line.text, done: line.checked ?? false })) }
    case 'bullets': return { items: titleLines.map((text) => ({ id: uid(), text })) }
    case 'links': return { items: (source.match(URL) ?? []).map((url) => ({ id: uid(), label: url.replace(/^https?:\/\//, '').split('/')[0]!, url })) }
    case 'code': {
      const fenced = source.match(/```([^\n]*)\n?([\s\S]*?)```/)
      return { language: fenced?.[1]?.trim() || 'text', code: fenced?.[2]?.trim() ?? source }
    }
    case 'assignment': return { items: [{ id: uid(), title: cleanTitle(source).replace(/\b(?:by|on)\s+(?:today|tomorrow|next\s+)?\w+(?:\s+\d{1,2}(?:,?\s+20\d{2})?)?/i, '').trim(), due: detectDate(source) ?? '', status: 'todo' }] }
    case 'decision': {
      const parts = source.replace(/\?+$/, '').split(/\s+or\s+/i).map(cleanTitle)
      return { question: source.trim(), options: parts.length > 1 ? parts : titleLines, pickedIndex: null }
    }
    case 'pros_cons': return { topic: cleanTitle(lines[0]?.text ?? source), pros: [{ id: uid(), text: '' }], cons: [{ id: uid(), text: '' }] }
    case 'budget': return { currency: source.includes('€') ? 'EUR' : source.includes('£') ? 'GBP' : 'USD', items: (source.match(MONEY) ?? []).map((amount, index) => ({ id: uid(), label: titleLines[index] ?? `Item ${index + 1}`, amount: Number(amount.replace(/[^\d.-]/g, '')) || 0 })) }
    case 'metrics': return { tiles: titleLines.map((label) => ({ id: uid(), label, value: '', unit: '', trend: 'flat' as const })) }
    case 'timeline': return { totalUnits: Math.max(4, lines.length * 2), phases: lines.map((line, index) => ({ id: uid(), label: line.text, start: index * 2, span: 2 })) }
    case 'notes': return { text: source }
    case 'sticky_note': return { ...defaultRecord, text: source } as ModuleData
    case 'quote': return { ...defaultRecord, text: cleanTitle(source.replace(/^quote\s*:?/i, '')) } as ModuleData
    case 'progress': return { ...defaultRecord, label: cleanTitle(lines[0]?.text ?? source), percent: Math.min(100, Math.max(0, Number(percent?.[1] ?? numbers[0] ?? 0))) } as ModuleData
    case 'ai_generator': return { ...defaultRecord, prompt: source } as ModuleData
    case 'text_input': return { ...defaultRecord, label: cleanTitle(lines[0]?.text ?? 'Input'), value: lines.slice(1).map((line) => line.text).join('\n') } as ModuleData
    case 'number_input': return { ...defaultRecord, label: cleanTitle(lines[0]?.text ?? 'Value'), value: numbers[0] ?? 0 } as ModuleData
    case 'date_picker': return { ...defaultRecord, label: cleanTitle(lines[0]?.text ?? 'Target date'), date: detectDate(source) ?? (defaults as { date: string }).date } as ModuleData
    case 'outline': return { items: lines.map((line) => ({ id: uid(), text: line.text, depth: line.depth, collapsed: false })) }
    case 'process': return { steps: lines.map((line, index) => ({ id: uid(), label: line.text, status: index === 0 ? 'active' as const : 'todo' as const })) } as ModuleData
    case 'reading_list': return { items: titleLines.map((title) => ({ id: uid(), title, status: 'queued' as const })) } as ModuleData
    case 'flashcards': return { cards: lines.map((line) => { const [front, ...back] = line.text.split(/\s*[:—-]\s*/); return { id: uid(), front: front || line.text, back: back.join(' ') || '', flipped: false } }), current: 0 }
    case 'vocab': return { terms: lines.map((line) => { const [term, ...definition] = line.text.split(/\s*[:—-]\s*/); return { id: uid(), term: term || line.text, definition: definition.join(' '), known: false } }) }
    case 'poll': return { question: lines[0]?.text ?? source, options: lines.slice(1).map((line) => ({ id: uid(), label: line.text, votes: 0 })) }
    case 'form': return { title: lines[0]?.text ?? 'Quick form', fields: lines.slice(1).map((line) => ({ id: uid(), label: line.text, type: 'text' as const, value: '', required: false })) }
    case 'bar_chart': return { ...defaultRecord, bars: lines.slice(1).map((line, index) => ({ id: uid(), label: line.text.replace(/[:=]\s*-?\d+(?:\.\d+)?\s*$/, ''), value: numbers[index] ?? 0 })) } as ModuleData
    case 'line_chart': return { ...defaultRecord, points: lines.slice(1).map((line, index) => ({ id: uid(), label: line.text.replace(/[:=]\s*-?\d+(?:\.\d+)?\s*$/, ''), value: numbers[index] ?? 0 })) } as ModuleData
    case 'pie_chart': return { ...defaultRecord, segments: lines.slice(1).map((line, index) => ({ id: uid(), label: line.text.replace(/[:=]\s*-?\d+(?:\.\d+)?\s*$/, ''), value: numbers[index] ?? 0, color: ['#38bdf8', '#a3e635', '#f472b6', '#fbbf24'][index % 4]! })) } as ModuleData
    case 'counter': return { ...defaultRecord, label: cleanTitle(lines[0]?.text ?? source), count: numbers[0] ?? 0 } as ModuleData
    case 'rating': return { ...defaultRecord, label: cleanTitle(lines[0]?.text ?? source), value: Math.min(5, Math.max(0, numbers[0] ?? 0)) } as ModuleData
    case 'calculator': return { ...defaultRecord, expression: source.replace(/^.*?calculator\s*:?/i, '').trim() || '0' } as ModuleData
    case 'contact': {
      const email = source.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] ?? ''
      const phone = source.match(/\+?[\d][\d\s().-]{6,}/)?.[0]?.trim() ?? ''
      return { ...defaultRecord, name: cleanTitle(lines[0]?.text ?? source), email, phone } as ModuleData
    }
    case 'dialog': return { lines: lines.map((line) => { const [character, ...cue] = line.text.split(':'); return { id: uid(), character: cue.length ? character!.trim() : '', cue: cue.length ? cue.join(':').trim() : line.text } }) }
    case 'table': return { rows: lines.map((line) => line.text.split(/\s*[|,\t]\s*/).filter(Boolean)) }
    case 'daily_agenda': return { date: detectDate(source) ?? localDayKey(), items: lines.map((line) => { const time = line.text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)?.[0] ?? ''; return { id: uid(), time, title: line.text.replace(time, '').trim(), done: line.checked ?? false } }) }
    case 'logbook': return { entries: lines.map((line) => ({ id: uid(), timestamp: new Date().toISOString(), text: line.text, level: /warn|risk|issue/i.test(line.text) ? 'warning' as const : 'note' as const })) }
    case 'inventory': return { items: lines.map((line, index) => ({ id: uid(), name: line.text.replace(/[:=]\s*\d+.*$/, ''), quantity: numbers[index] ?? 1, minimum: 0, unit: 'pcs' })) }
    default: return defaults
  }
}

function inferRelations(nodes: ProposedNode[]): ProposedRelation[] {
  const relations: ProposedRelation[] = []
  const stack: ProposedNode[] = []
  nodes.forEach((node) => {
    while (stack.length > node.depth) stack.pop()
    if (node.depth > 0 && stack[node.depth - 1]) relations.push({ fromTemporaryId: stack[node.depth - 1]!.temporaryId, toTemporaryId: node.temporaryId, type: 'parent' })
    stack[node.depth] = node
    stack.length = node.depth + 1
  })
  for (const node of nodes) {
    const dependency = node.sourceText.match(/(.+?)\s+(depends on|after|blocks|before)\s+(.+)/i)
    if (!dependency) continue
    const left = nodes.find((candidate) => candidate.sourceText.toLowerCase().includes(dependency[1]!.trim().toLowerCase()))
    const right = nodes.find((candidate) => candidate !== left && candidate.sourceText.toLowerCase().includes(dependency[3]!.trim().toLowerCase()))
    if (!left || !right) continue
    const blocks = /blocks|before/i.test(dependency[2]!)
    relations.push({ fromTemporaryId: blocks ? left.temporaryId : right.temporaryId, toTemporaryId: blocks ? right.temporaryId : left.temporaryId, type: 'blocker', label: dependency[2] })
  }
  return relations
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(.99, value))
}

function metadataFor(text: string, confidence: number): WidgetMetadata {
  const badges: WidgetMetadata['badges'] = []
  const people = [...text.matchAll(MENTION)].map((match) => match[1]!).filter(Boolean)
  if (people.length) badges.push({
    type: 'assignee_avatars',
    initials: people.map((person) => person.split(/[._-]/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()),
  })
  const dueDate = detectDate(text)
  if (dueDate) badges.push({ type: 'deadline_countdown', dueDate })
  if (/!urgent\b/i.test(text)) badges.push({ type: 'priority_flag', level: 'critical' })
  return { badges, sourceText: text, interpretationConfidence: confidence }
}

function tokenize(text: string): string[] {
  return [...normalizeLanguage(text).tokens]
}

/** Tiny deterministic feature embedding used when exact phrases do not match. */
function semanticSimilarity(source: NormalizedLanguage, type: ModuleType): number {
  const definition = widgetDefinition(type)
  const patternWords = INTENT_PATTERNS[type]?.source.replace(/[^a-z| ]/gi, ' ') ?? ''
  const intent = normalizeLanguage(`${definition.label} ${definition.description} ${patternWords} ${SEMANTIC_EXAMPLES[type] ?? ''}`).tokens
  const input = source.tokens
  if (!input.size || !intent.size) return 0
  const coverage = tokenCoverage(input, intent)
  let overlap = 0
  input.forEach((word) => { if (intent.has(word)) overlap++ })
  return Math.max(overlap / Math.sqrt(input.size * intent.size), coverage * .72)
}

const LEARNING_KEY = 'grovepad:thought-preferences:v1'
type LearnedPreferences = { typeCounts: Partial<Record<ModuleType, number>>; tokenTypes: Record<string, Partial<Record<ModuleType, number>>> }

function readPreferences(): LearnedPreferences {
  if (typeof localStorage === 'undefined') return { typeCounts: {}, tokenTypes: {} }
  try {
    const parsed = JSON.parse(localStorage.getItem(LEARNING_KEY) ?? '') as LearnedPreferences
    return parsed?.typeCounts && parsed?.tokenTypes ? parsed : { typeCounts: {}, tokenTypes: {} }
  } catch { return { typeCounts: {}, tokenTypes: {} } }
}

function learnedBoost(source: string, type: ModuleType): number {
  const preferences = readPreferences()
  const global = Math.min(.035, (preferences.typeCounts[type] ?? 0) * .003)
  const tokenVotes = tokenize(source).reduce((sum, token) => sum + (preferences.tokenTypes[token]?.[type] ?? 0), 0)
  return global + Math.min(.1, tokenVotes * .012)
}

export function recordInterpretationChoice(source: string, prediction: ThoughtPrediction): void {
  if (typeof localStorage === 'undefined') return
  const chosen = prediction.primaryTypes[0]
  if (!chosen) return
  const preferences = readPreferences()
  preferences.typeCounts[chosen] = (preferences.typeCounts[chosen] ?? 0) + 1
  tokenize(source).slice(0, 16).forEach((token) => {
    const counts = preferences.tokenTypes[token] ?? {}
    counts[chosen] = (counts[chosen] ?? 0) + 1
    preferences.tokenTypes[token] = counts
  })
  try { localStorage.setItem(LEARNING_KEY, JSON.stringify(preferences)) } catch { /* storage may be unavailable */ }
}

function splitClauses(source: string): string[] {
  const lines = source.split(/\r?\n/).filter((line) => line.trim())
  if (lines.some((line) => /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line))) return [source]
  const action = ACTION_WORDS.source.replace(/^\\b|\\b.*$/g, '')
  return source
    .split(/(?<=[.!?;])\s+|\s*;\s*|,\s+(?=(?:and\s+|then\s+)?(?:ask|build|buy|call|check|create|email|finish|fix|make|plan|prepare|remember|review|send|ship|submit|test|track|update|write)\b)|\s+(?:and then|then)\s+/i)
    .map((clause) => clause.trim().replace(/^(?:and|then)\s+/i, ''))
    .filter((clause) => clause.length > 2 && clause !== action)
    .slice(0, 8)
}

function extractMeaning(source: string): ExtractedMeaning {
  const dates = [detectDate(source)].filter((date): date is string => Boolean(date))
  return {
    clauses: splitClauses(source),
    people: [...source.matchAll(MENTION)].map((match) => match[1]!).filter(Boolean),
    dates,
    urls: source.match(URL) ?? [],
    amounts: source.match(MONEY) ?? [],
    modality: /\b(might|maybe|perhaps|possibly|could)\b/i.test(source) ? 'possible' : /\b(should|probably|consider|suggest)\b/i.test(source) ? 'suggested' : 'certain',
    negated: /\b(?:do not|don't|dont|never|not)\b/i.test(source),
  }
}

function rankedIntents(source: string, context: InterpretationContext): Array<[ModuleType, number]> {
  const lines = parseLines(source)
  const normalized = normalizeLanguage(source, WIDGET_LANGUAGE_VOCABULARY)
  const base = new Map(scoreIntents(source, lines, normalized))
  for (const type of Object.keys(WIDGET_REGISTRY) as ModuleType[]) {
    const semantic = semanticSimilarity(normalized, type)
    let score = Math.max(base.get(type) ?? 0, semantic >= .34 ? .5 + semantic * .42 : 0)
    score += learnedBoost(source, type)
    if (context.selectedWidgetType === type) score += .025
    if (context.selectedWidgetTitle && tokenize(source).some((token) => tokenize(context.selectedWidgetTitle!).includes(token))) score += .025
    if (/\b(?:do not|don't|dont|never)\b/i.test(source) && ['assignment', 'checklist', 'daily_agenda'].includes(type)) score -= .18
    base.set(type, clampConfidence(score))
  }
  return [...base.entries()].sort((a, b) => b[1] - a[1])
}

function makeWarnings(source: string, confidence: number, margin = 1): InterpretationWarning[] {
  const warnings: InterpretationWarning[] = []
  if (confidence < .6) warnings.push({ code: 'fallback', message: 'Meaning is uncertain; preserving the thought as Notes is safest.' })
  else if (confidence < .85 || margin < .18) warnings.push({ code: 'ambiguous', message: 'Several interpretations are plausible. Choose the one that matches your intent.' })
  if (/\b(?:by|on|due|deadline)\b/i.test(source) && !detectDate(source)) warnings.push({ code: 'date', message: 'A date phrase was detected but could not be resolved safely.' })
  return warnings
}

function singlePlan(source: string, type: ModuleType, confidence: number, margin = 1): ThoughtPlan {
  const lines = parseLines(source)
  const isOutline = lines.length > 1 && lines.some((line) => line.depth > 0) && type === 'outline'
  const nodes: ProposedNode[] = isOutline
    ? lines.map((line, index) => ({
        temporaryId: `node-${index + 1}`,
        widgetType: line.checked !== undefined || ACTION_WORDS.test(line.text) ? 'checklist' : 'notes',
        title: line.text.slice(0, 80),
        data: line.checked !== undefined || ACTION_WORDS.test(line.text) ? dataFor('checklist', line.text, [line]) : { text: line.text },
        sourceText: line.text,
        confidence,
        depth: line.depth,
        metadata: metadataFor(line.text, confidence),
      }))
    : [{
        temporaryId: 'node-1',
        widgetType: type,
        title: cleanTitle(lines[0]?.text ?? source).slice(0, 80) || 'Thought',
        data: dataFor(type, source, lines),
        sourceText: source,
        confidence,
        depth: 0,
        metadata: metadataFor(source, confidence),
      }]
  return { sourceText: source, confidence, nodes, relations: inferRelations(nodes), groups: [], warnings: makeWarnings(source, confidence, margin) }
}

function combinedPlan(source: string, clauses: string[], context: InterpretationContext): ThoughtPlan | null {
  if (clauses.length < 2) return null
  const nodes: ProposedNode[] = []
  clauses.forEach((clause, index) => {
    const [type, score] = rankedIntents(clause, context)[0] ?? ['notes', .48]
    const resolvedType = score >= .56 ? type : 'notes'
    nodes.push({
      temporaryId: `clause-${index + 1}`,
      widgetType: resolvedType,
      title: cleanTitle(clause).slice(0, 80) || `Thought ${index + 1}`,
      data: dataFor(resolvedType, clause, parseLines(clause)),
      sourceText: clause,
      confidence: score,
      depth: 0,
      metadata: metadataFor(clause, score),
    })
  })
  const usefulTypes = new Set(nodes.map((node) => node.widgetType))
  if (usefulTypes.size === 1 && usefulTypes.has('notes')) return null
  const confidence = nodes.reduce((sum, node) => sum + node.confidence, 0) / nodes.length
  const relations = inferRelations(nodes)
  if (relations.length === 0 && nodes.length > 1) {
    if (/\b(?:then|before|after|followed by|once)\b/i.test(source)) {
      for (let index = 1; index < nodes.length; index++) relations.push({
        fromTemporaryId: nodes[index - 1]!.temporaryId,
        toTemporaryId: nodes[index]!.temporaryId,
        type: 'blocker',
        label: 'then',
      })
    } else {
      nodes.slice(1).forEach((node) => relations.push({
        fromTemporaryId: nodes[0]!.temporaryId,
        toTemporaryId: node.temporaryId,
        type: 'parent',
      }))
    }
  }
  return { sourceText: source, confidence, nodes, relations, groups: [], warnings: makeWarnings(source, confidence) }
}

function predictionLabel(types: ModuleType[], combined = false): string {
  if (combined) return `Split into ${types.length} connected thoughts`
  return widgetDefinition(types[0] ?? 'notes').label
}

function explainPrediction(plan: ThoughtPlan, meaning: ExtractedMeaning, context: InterpretationContext): string {
  const facts: string[] = []
  if (plan.nodes.length > 1) facts.push(`Detected ${plan.nodes.length} distinct clauses or branches`)
  if (meaning.people.length) facts.push(`found ${meaning.people.map((person) => `@${person}`).join(', ')}`)
  if (meaning.dates.length) facts.push(`resolved ${meaning.dates.join(', ')}`)
  if (meaning.amounts.length) facts.push(`found ${meaning.amounts.length} amount${meaning.amounts.length === 1 ? '' : 's'}`)
  if (meaning.urls.length) facts.push(`found ${meaning.urls.length} link${meaning.urls.length === 1 ? '' : 's'}`)
  if (context.selectedWidgetTitle) facts.push(`uses “${context.selectedWidgetTitle}” as canvas context`)
  return facts.length ? facts.join(' · ') : `The language most closely matches ${widgetDefinition(plan.nodes[0]?.widgetType ?? 'notes').label}`
}

export function interpretThoughtCandidates(sourceText: string, context: InterpretationContext = {}): ThoughtInterpretation {
  const source = sourceText.trim()
  const meaning = extractMeaning(source)
  if (!source) return { sourceText, meaning, predictions: [], recommendedId: null, confidenceMargin: 0, shouldAutoCommit: false }
  const ranked = rankedIntents(source, context)
  const predictions: ThoughtPrediction[] = []
  const combined = combinedPlan(source, meaning.clauses, context)
  if (combined) {
    const types = combined.nodes.map((node) => node.widgetType)
    const diversityBonus = new Set(types).size > 1 ? (types.length >= 3 ? .11 : .06) : .02
    predictions.push({ id: 'combined', label: predictionLabel(types, true), explanation: explainPrediction(combined, meaning, context), confidence: clampConfidence(combined.confidence + diversityBonus), plan: combined, primaryTypes: types, kind: 'combined' })
  }
  ranked.slice(0, 4).forEach(([type, score]) => {
    if (predictions.some((prediction) => prediction.kind === 'single' && prediction.primaryTypes[0] === type)) return
    const plan = singlePlan(source, score >= .56 ? type : 'notes', score)
    predictions.push({ id: `single-${type}`, label: predictionLabel([type]), explanation: explainPrediction(plan, meaning, context), confidence: score, plan, primaryTypes: [type], kind: 'single' })
  })
  if (!predictions.some((prediction) => prediction.primaryTypes.length === 1 && prediction.primaryTypes[0] === 'notes')) {
    const notesPlan = singlePlan(source, 'notes', .5)
    predictions.push({ id: 'fallback-notes', label: 'Keep as Notes', explanation: 'Preserves the original wording without assuming extra structure', confidence: .5, plan: notesPlan, primaryTypes: ['notes'], kind: 'fallback' })
  }
  predictions.sort((a, b) => b.confidence - a.confidence)
  const limited = predictions.slice(0, 4)
  const top = limited[0]
  const margin = top ? top.confidence - (limited[1]?.confidence ?? 0) : 0
  limited.forEach((prediction) => { prediction.plan.warnings = makeWarnings(source, prediction.confidence, margin) })
  return {
    sourceText: source,
    meaning,
    predictions: limited,
    recommendedId: top?.id ?? null,
    confidenceMargin: margin,
    shouldAutoCommit: Boolean(top && top.confidence >= .86 && margin >= .18),
  }
}

/**
 * Whether a prediction has earned a spot in the Quick Add UI. Low-confidence
 * Notes fallbacks are the interpreter admitting defeat — the sheet routes
 * those thoughts to the scaffold + local-model composer instead of showing
 * them. An explicit, confident notes request (≥ 0.7) still presents.
 */
export function isPresentablePrediction(prediction: ThoughtPrediction): boolean {
  if (prediction.kind === 'fallback') return false
  const notesOnly = prediction.plan.nodes.every((node) => node.widgetType === 'notes')
  if (notesOnly && prediction.confidence < 0.7) return false
  return prediction.confidence >= 0.56
}

/** Backwards-compatible recommended plan for non-interactive callers. */
export function interpretThought(sourceText: string, context: InterpretationContext = {}): ThoughtPlan {
  const result = interpretThoughtCandidates(sourceText, context)
  return result.predictions[0]?.plan ?? { sourceText, confidence: 0, nodes: [], relations: [], groups: [], warnings: [] }
}
