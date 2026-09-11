import type { ModuleType } from '../types/spatial'
import { MODULE_LABELS, MODULE_TYPES } from '../types/modules'

/**
 * The Quick Add command line — a deterministic verb grammar layered onto the
 * capture bar. The first word decides everything: when it matches a known
 * verb the line is a command over the current selection; when it matches
 * nothing the line falls through untouched to the thought interpreter.
 *
 * This module is pure parsing. It never touches a store: the sheet hands in a
 * `CommandContext` snapshot and receives tokens (for inline highlighting),
 * typed arguments, a human summary, and — when the command cannot run — the
 * one-line reason why. Execution lives in `commandExecutor.ts`.
 *
 * Candidate vocabulary: docs/quick-add-command-lexicon.md. Round one ships
 * only commands whose store action already exists.
 */

export type CommandTokenRole =
  | 'verb'
  | 'noun' // a widget type
  | 'value' // a skin, direction, or other fixed choice
  | 'count'
  | 'title'
  | 'filler'
  | 'unknown'

export interface CommandToken {
  text: string
  role: CommandTokenRole
}

export type CommandFamily =
  | 'create'
  | 'structure'
  | 'appearance'
  | 'state'
  | 'lifecycle'
  | 'layout'
  | 'view'
  | 'panel'

export interface SkinChoice {
  value: string
  label: string
}

export interface CommandContext {
  selectionCount: number
  /** Skins wearable by the selection — present only when every selected card shares one type. */
  skinOptions: readonly SkinChoice[]
}

export interface CommandArgs {
  /** Widgets to create, in order, already expanded by counts. */
  widgetTypes?: ModuleType[]
  /** Free text — a title, a new name, a search query. */
  text?: string
  /** A fixed choice: align mode, nudge direction, distribute axis, zoom step. */
  choice?: string
  /** A number: zoom percent, nudge cells. */
  amount?: number
  /** The chosen skin value. */
  skin?: string
}

export interface CommandSpec {
  id: string
  /** First entry is the canonical verb shown in hints. */
  verbs: readonly string[]
  usage: string
  description: string
  family: CommandFamily
  /** Minimum selected cards; 0 when the command ignores selection. */
  needsSelection: number
}

export interface ParsedCommand {
  spec: CommandSpec
  tokens: CommandToken[]
  args: CommandArgs
  /** "Glue 3 cards into one cluster" — shown on the run button row. */
  summary: string
  /** Why the command cannot run right now; null when ready. */
  issue: string | null
}

export interface CommandSuggestion {
  spec: CommandSpec
  /** The canonical verb, ready to complete into the input. */
  completion: string
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Words the grammar skips entirely, so natural phrasing parses like terse phrasing. */
const FILLER = new Set([
  'a', 'an', 'the', 'and', 'this', 'these', 'them', 'it', 'my',
  'to', 'into', 'of', 'with', 'together', 'please', 'card', 'cards', 'widget', 'widgets',
  'tab', 'tabs',
])

/** Hand aliases from everyday words onto module types. */
const WIDGET_ALIASES: Record<string, ModuleType> = {
  note: 'text', notes: 'text', todo: 'checklist', todos: 'checklist', task: 'checklist', tasks: 'checklist',
  list: 'bullets', timer: 'timekeeper', clock: 'timekeeper', time: 'timekeeper',
  sheet: 'table', spreadsheet: 'table', draw: 'sketchpad', drawing: 'sketchpad', sketch: 'sketchpad',
  link: 'links', bookmark: 'links', bookmarks: 'links', pic: 'media', photo: 'media', image: 'media',
  money: 'budget', chart: 'bar_chart', graph: 'bar_chart', map: 'location', place: 'location',
  deck: 'flashcards', person: 'contact', vote: 'poll', date: 'date_picker', deadline: 'date_picker',
  goal: 'goal_tracker', formula: 'formula', calculator: 'calculator', canvas: 'canvas_node',
}

interface WidgetNoun {
  phrase: string
  words: string[]
  type: ModuleType
}

function buildWidgetNouns(): WidgetNoun[] {
  const nouns: WidgetNoun[] = []
  const push = (phrase: string, type: ModuleType) => {
    const clean = phrase.trim().toLowerCase()
    if (!clean) return
    nouns.push({ phrase: clean, words: clean.split(/\s+/), type })
  }
  for (const type of MODULE_TYPES) {
    push(MODULE_LABELS[type], type)
    push(type.replace(/_/g, ' '), type)
  }
  for (const [alias, type] of Object.entries(WIDGET_ALIASES)) push(alias, type)
  // Longest phrases first so "reading list" beats "list".
  return nouns.sort((a, b) => b.words.length - a.words.length)
}

const WIDGET_NOUNS = buildWidgetNouns()

// ---------------------------------------------------------------------------
// Command registry — round one, every entry backed by an existing store action
// ---------------------------------------------------------------------------

const spec = (
  id: string,
  verbs: readonly string[],
  usage: string,
  description: string,
  family: CommandFamily,
  needsSelection = 0,
): CommandSpec => ({ id, verbs, usage, description, family, needsSelection })

export const COMMAND_SPECS: readonly CommandSpec[] = [
  // Create
  spec('add', ['add', 'create', 'new', 'make'], 'add <widget> [x3] ["title"]', 'Create widgets at the view centre', 'create'),
  spec('duplicate', ['duplicate', 'dupe', 'clone'], 'duplicate', 'Copy the selected cards in place', 'create', 1),
  // Structure
  spec('glue', ['glue', 'weld', 'stick'], 'glue', 'Weld the selected cards into one cluster', 'structure', 2),
  spec('unglue', ['unglue', 'unweld', 'unstick', 'dissolve'], 'unglue', 'Break the selected cards out of their cluster', 'structure', 1),
  // Appearance
  spec('skin', ['skin', 'reskin', 'wear'], 'skin <name>', 'Change the skin the selected cards wear', 'appearance', 1),
  spec('rename', ['rename', 'retitle', 'title'], 'rename <new name>', 'Retitle the selected card', 'appearance', 1),
  spec('open', ['open', 'expand', 'unfold'], 'open', 'Open the selected cards fully', 'appearance', 1),
  spec('iconify', ['icon', 'iconify', 'fold', 'collapse', 'minimize'], 'icon', 'Fold the selected cards down to icons', 'appearance', 1),
  // State
  spec('pin', ['pin'], 'pin', 'Hold the selected cards open', 'state', 1),
  spec('unpin', ['unpin'], 'unpin', 'Release the pinned cards', 'state', 1),
  spec('lock', ['lock'], 'lock', 'Lock the selected cards in place', 'state', 1),
  spec('unlock', ['unlock'], 'unlock', 'Unlock the selected cards', 'state', 1),
  spec('favorite', ['favorite', 'favourite', 'fav', 'star'], 'favorite', 'Star the selected cards', 'state', 1),
  spec('unfavorite', ['unfavorite', 'unfavourite', 'unfav', 'unstar'], 'unfavorite', 'Unstar the selected cards', 'state', 1),
  spec('done', ['done', 'complete', 'finish'], 'done', 'Mark the selected cards completed', 'state', 1),
  spec('undone', ['undone', 'reopen', 'incomplete'], 'undone', 'Clear the completed mark', 'state', 1),
  // Lifecycle
  spec('delete', ['delete', 'remove', 'del', 'trash'], 'delete', 'Delete the selected cards (undo restores them)', 'lifecycle', 1),
  spec('cut', ['cut'], 'cut', 'Cut the selected cards to the clipboard', 'lifecycle', 1),
  spec('undo', ['undo'], 'undo', 'Undo the last board change', 'lifecycle'),
  spec('redo', ['redo'], 'redo', 'Redo the undone change', 'lifecycle'),
  spec('select-all', ['select'], 'select all | none', 'Select every card, or clear the selection', 'lifecycle'),
  spec('deselect', ['deselect', 'unselect'], 'deselect', 'Clear the selection', 'lifecycle'),
  // Layout
  spec('align', ['align'], 'align left|right|top|bottom|center|middle', 'Line the selected cards up', 'layout', 2),
  spec('distribute', ['distribute', 'spread', 'space'], 'distribute horizontally|vertically', 'Even out the gaps between cards', 'layout', 3),
  spec('untangle', ['untangle'], 'untangle', 'Resolve overlaps in the selection, or everywhere', 'layout'),
  spec('tidy', ['tidy', 'cleanup'], 'tidy', 'Untangle the whole canvas', 'layout'),
  spec('snap', ['snap'], 'snap', 'Snap the selected cards to the grid', 'layout', 1),
  spec('nudge', ['nudge', 'shift'], 'nudge left|right|up|down [cells]', 'Step the selection across the grid', 'layout', 1),
  // View
  spec('frame', ['frame', 'focus'], 'frame', 'Bring the selection (or board) into view', 'view'),
  spec('fit', ['fit'], 'fit', 'Fit the whole board on screen', 'view'),
  spec('zoom', ['zoom'], 'zoom 150 | in | out', 'Zoom the canvas', 'view'),
  spec('back', ['back'], 'back', 'Return to the previous view', 'view'),
  spec('forward', ['forward'], 'forward', 'Go to the next view', 'view'),
  spec('home', ['home', 'origin'], 'home', 'Return to the canvas origin', 'view'),
  // Navigation — every verb backed by an existing navigation action.
  spec('go', ['go', 'goto', 'jump', 'visit'], 'go <canvas or card>', 'Jump to a canvas or card by name', 'view'),
  spec('switch', ['switch'], 'switch <workspace>', 'Switch to another workspace', 'view'),
  spec('next-tab', ['next'], 'next tab', 'Go to the next canvas tab', 'view'),
  spec('previous-tab', ['previous', 'prev'], 'previous tab', 'Go to the previous canvas tab', 'view'),
  spec('close-tab', ['close'], 'close tab', 'Close the current canvas tab', 'view'),
  spec('open-tab', ['tab'], 'tab <canvas>', 'Open a canvas in a new tab', 'view'),
  // Panels & canvas
  spec('circuit', ['circuit', 'wires'], 'circuit', 'Toggle Circuit mode', 'panel'),
  spec('library', ['library', 'widgets'], 'library', 'Open the widget library', 'panel'),
  spec('recipes', ['recipes', 'recipe'], 'recipes', 'Open the recipe catalogue', 'panel'),
  spec('settings', ['settings', 'preferences'], 'settings', 'Open settings', 'panel'),
  spec('help', ['help', 'shortcuts', 'controls'], 'help', 'Open the controls reference', 'panel'),
  spec('tree', ['tree'], 'tree', 'Open the canvas tree', 'panel'),
  spec('find', ['find', 'search'], 'find', 'Open search', 'panel'),
  spec('import', ['import'], 'import', 'Open the import sheet', 'panel'),
  spec('canvas', ['canvas'], 'canvas <name>', 'Create a child canvas', 'create'),
  spec('rename-canvas', ['rename-canvas'], 'rename-canvas <name>', 'Rename this canvas', 'appearance'),
]

const VERB_INDEX = new Map<string, CommandSpec>()
for (const entry of COMMAND_SPECS) {
  for (const verb of entry.verbs) VERB_INDEX.set(verb, entry)
}

const ALIGN_CHOICES: Record<string, string> = {
  left: 'left', right: 'right', top: 'top', bottom: 'bottom',
  center: 'center-h', centre: 'center-h', middle: 'center-v',
}

const DISTRIBUTE_CHOICES: Record<string, string> = {
  horizontally: 'horizontal', horizontal: 'horizontal', h: 'horizontal',
  vertically: 'vertical', vertical: 'vertical', v: 'vertical',
}

const NUDGE_CHOICES = new Set(['left', 'right', 'up', 'down'])

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface Word {
  text: string
  lower: string
}

function splitWords(source: string): Word[] {
  return source
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => ({ text, lower: text.toLowerCase().replace(/[.,!?]+$/, '') }))
}

function cardNoun(count: number): string {
  return count === 1 ? '1 card' : `${count} cards`
}

function selectionIssue(entry: CommandSpec, ctx: CommandContext): string | null {
  if (ctx.selectionCount >= entry.needsSelection) return null
  if (entry.needsSelection === 1) return 'Select a card first'
  return `Select at least ${entry.needsSelection} cards first`
}

/** Parse a count word: "x3", "3", "3x". Returns null when it isn't one. */
function parseCount(word: string): number | null {
  const match = /^x?(\d{1,2})x?$/.exec(word)
  if (!match) return null
  const value = Number(match[1])
  return value >= 1 && value <= 20 ? value : null
}

interface ArgOutcome {
  args: CommandArgs
  tokens: CommandToken[]
  summary: string
  issue: string | null
}

function parseAddArgs(words: Word[], ctx: CommandContext): ArgOutcome {
  const tokens: CommandToken[] = []
  const widgetTypes: ModuleType[] = []
  const titleWords: string[] = []
  let pendingCount = 1
  let sawQuote = false

  let index = 0
  while (index < words.length) {
    const word = words[index]!
    const count = parseCount(word.lower)
    if (count !== null && titleWords.length === 0) {
      // A count binds to its neighbouring noun: "3 notes" or "note x3".
      if (widgetTypes.length > 0 && pendingCount === 1) {
        const last = widgetTypes[widgetTypes.length - 1]!
        for (let extra = 1; extra < count; extra += 1) widgetTypes.push(last)
      } else {
        pendingCount = count
      }
      tokens.push({ text: word.text, role: 'count' })
      index += 1
      continue
    }
    if (word.text.startsWith('"') || sawQuote) {
      sawQuote = true
      titleWords.push(word.text.replace(/^"|"$/g, ''))
      tokens.push({ text: word.text, role: 'title' })
      if (word.text.endsWith('"') && word.text.length > 1) sawQuote = false
      index += 1
      continue
    }
    if (FILLER.has(word.lower) && titleWords.length === 0) {
      tokens.push({ text: word.text, role: 'filler' })
      index += 1
      continue
    }
    // Longest widget phrase starting here.
    const noun = titleWords.length === 0
      ? WIDGET_NOUNS.find((candidate) =>
          candidate.words.every((part, offset) => words[index + offset]?.lower === part))
      : undefined
    if (noun) {
      for (let repeat = 0; repeat < pendingCount; repeat += 1) widgetTypes.push(noun.type)
      pendingCount = 1
      for (let offset = 0; offset < noun.words.length; offset += 1) {
        tokens.push({ text: words[index + offset]!.text, role: 'noun' })
      }
      index += noun.words.length
      continue
    }
    // Anything else runs into the title.
    titleWords.push(word.text)
    tokens.push({ text: word.text, role: 'title' })
    index += 1
  }

  const title = titleWords.join(' ').trim()
  const args: CommandArgs = { widgetTypes, ...(title ? { text: title } : {}) }
  if (widgetTypes.length === 0) {
    return {
      args,
      tokens,
      summary: 'Add a widget',
      issue: 'Name a widget — try “add note” or “add timer x3”',
    }
  }
  const distinct = [...new Set(widgetTypes)]
  const listing = distinct.length <= 3
    ? distinct.map((type) => MODULE_LABELS[type]).join(', ')
    : `${distinct.length} kinds of card`
  const summary = widgetTypes.length === 1
    ? `Add ${MODULE_LABELS[widgetTypes[0]!]}${title ? ` “${title}”` : ''}`
    : `Add ${widgetTypes.length} cards — ${listing}`
  void ctx
  return { args, tokens, summary, issue: null }
}

function parseSkinArgs(words: Word[], ctx: CommandContext): ArgOutcome {
  const rest = words.map((word) => word.lower).join(' ')
  const tokens: CommandToken[] = []
  if (ctx.selectionCount === 0) {
    words.forEach((word) => tokens.push({ text: word.text, role: 'unknown' }))
    return { args: {}, tokens, summary: 'Change skin', issue: 'Select a card first' }
  }
  if (ctx.skinOptions.length === 0) {
    words.forEach((word) => tokens.push({ text: word.text, role: 'unknown' }))
    return {
      args: {}, tokens, summary: 'Change skin',
      issue: ctx.selectionCount > 1
        ? 'Select cards of one kind to change their skin'
        : 'This card has only one look',
    }
  }
  if (!rest) {
    return {
      args: {}, tokens, summary: 'Change skin',
      issue: `Which skin? ${ctx.skinOptions.slice(0, 4).map((option) => option.label).join(' · ')}`,
    }
  }
  const match = ctx.skinOptions.find((option) =>
    option.label.toLowerCase() === rest || option.value.toLowerCase() === rest)
    ?? ctx.skinOptions.find((option) =>
      option.label.toLowerCase().startsWith(rest) || option.value.toLowerCase().startsWith(rest))
  words.forEach((word) => tokens.push({ text: word.text, role: match ? 'value' : 'unknown' }))
  if (!match) {
    return {
      args: {}, tokens, summary: 'Change skin',
      issue: `No “${rest}” here — try ${ctx.skinOptions.slice(0, 4).map((option) => option.label).join(' · ')}`,
    }
  }
  return {
    args: { skin: match.value },
    tokens,
    summary: `Wear ${match.label} on ${cardNoun(ctx.selectionCount)}`,
    issue: null,
  }
}

function parseChoiceArgs(
  entry: CommandSpec,
  words: Word[],
  ctx: CommandContext,
): ArgOutcome {
  const tokens: CommandToken[] = []
  const first = words[0]

  if (entry.id === 'align') {
    const mode = first ? ALIGN_CHOICES[first.lower] : undefined
    words.forEach((word, index) =>
      tokens.push({ text: word.text, role: index === 0 && mode ? 'value' : 'unknown' }))
    if (!mode) {
      return {
        args: {}, tokens, summary: 'Align the selection',
        issue: 'Which edge? left · right · top · bottom · center · middle',
      }
    }
    return { args: { choice: mode }, tokens, summary: `Align ${cardNoun(ctx.selectionCount)} ${first!.lower}`, issue: null }
  }

  if (entry.id === 'distribute') {
    const axis = first ? DISTRIBUTE_CHOICES[first.lower] : 'horizontal'
    words.forEach((word, index) =>
      tokens.push({ text: word.text, role: index === 0 && axis ? 'value' : 'unknown' }))
    if (!axis) {
      return {
        args: {}, tokens, summary: 'Distribute the selection',
        issue: 'Which way? horizontally · vertically',
      }
    }
    return {
      args: { choice: axis }, tokens,
      summary: `Space ${cardNoun(ctx.selectionCount)} evenly`, issue: null,
    }
  }

  if (entry.id === 'nudge') {
    const direction = first && NUDGE_CHOICES.has(first.lower) ? first.lower : undefined
    const amountWord = words[1]
    const amount = amountWord ? parseCount(amountWord.lower) ?? 1 : 1
    words.forEach((word, index) => {
      const role = index === 0 && direction ? 'value' : index === 1 && amountWord ? 'count' : 'unknown'
      tokens.push({ text: word.text, role })
    })
    if (!direction) {
      return {
        args: {}, tokens, summary: 'Nudge the selection',
        issue: 'Which way? left · right · up · down',
      }
    }
    return {
      args: { choice: direction, amount }, tokens,
      summary: `Nudge ${cardNoun(ctx.selectionCount)} ${direction}${amount > 1 ? ` ${amount} cells` : ''}`,
      issue: null,
    }
  }

  if (entry.id === 'zoom') {
    if (!first) {
      return { args: {}, tokens, summary: 'Zoom', issue: 'How far? try “zoom 150”, “zoom in”, “zoom out”' }
    }
    if (first.lower === 'in' || first.lower === 'out') {
      tokens.push({ text: first.text, role: 'value' })
      words.slice(1).forEach((word) => tokens.push({ text: word.text, role: 'unknown' }))
      return { args: { choice: first.lower }, tokens, summary: `Zoom ${first.lower}`, issue: null }
    }
    const numeric = Number(first.lower.replace(/%$/, ''))
    const valid = Number.isFinite(numeric) && numeric >= 10 && numeric <= 400
    tokens.push({ text: first.text, role: valid ? 'count' : 'unknown' })
    words.slice(1).forEach((word) => tokens.push({ text: word.text, role: 'unknown' }))
    if (!valid) {
      return { args: {}, tokens, summary: 'Zoom', issue: 'Zoom takes 10–400, or “in” / “out”' }
    }
    return { args: { amount: numeric }, tokens, summary: `Zoom to ${numeric}%`, issue: null }
  }

  if (entry.id === 'select-all') {
    const mode = first?.lower === 'all' ? 'all' : first?.lower === 'none' ? 'none' : undefined
    words.forEach((word, index) =>
      tokens.push({ text: word.text, role: index === 0 && mode ? 'value' : 'unknown' }))
    if (!mode) {
      return { args: {}, tokens, summary: 'Select', issue: 'Try “select all” or “select none”' }
    }
    return {
      args: { choice: mode }, tokens,
      summary: mode === 'all' ? 'Select every card' : 'Clear the selection',
      issue: null,
    }
  }

  words.forEach((word) => tokens.push({ text: word.text, role: 'unknown' }))
  return { args: {}, tokens, summary: entry.description, issue: null }
}

function parseTextArgs(entry: CommandSpec, words: Word[], ctx: CommandContext): ArgOutcome {
  const tokens: CommandToken[] = words.map((word) => ({ text: word.text, role: 'title' as const }))
  const value = words.map((word) => word.text).join(' ').replace(/^"|"$/g, '').trim()
  if (entry.id === 'rename') {
    if (ctx.selectionCount > 1) {
      return { args: {}, tokens, summary: 'Rename', issue: 'Rename works on one card at a time' }
    }
    if (!value) return { args: {}, tokens, summary: 'Rename', issue: 'Rename to what?' }
    return { args: { text: value }, tokens, summary: `Rename to “${value}”`, issue: null }
  }
  if (entry.id === 'canvas') {
    if (!value) return { args: {}, tokens, summary: 'New canvas', issue: 'Name the canvas — “canvas Research”' }
    return { args: { text: value }, tokens, summary: `Create canvas “${value}”`, issue: null }
  }
  if (entry.id === 'rename-canvas') {
    if (!value) return { args: {}, tokens, summary: 'Rename canvas', issue: 'Rename this canvas to what?' }
    return { args: { text: value }, tokens, summary: `Rename canvas to “${value}”`, issue: null }
  }
  if (entry.id === 'go') {
    if (!value) return { args: {}, tokens, summary: 'Go to…', issue: 'Go where? Name a canvas or card' }
    return { args: { text: value }, tokens, summary: `Go to “${value}”`, issue: null }
  }
  if (entry.id === 'switch') {
    if (!value) return { args: {}, tokens, summary: 'Switch workspace', issue: 'Which workspace? — “switch Personal”' }
    return { args: { text: value }, tokens, summary: `Switch to “${value}”`, issue: null }
  }
  if (entry.id === 'open-tab') {
    if (!value) return { args: {}, tokens, summary: 'Open a tab', issue: 'Which canvas? — “tab Research”' }
    return { args: { text: value }, tokens, summary: `Open “${value}” in a new tab`, issue: null }
  }
  if (entry.id === 'find') {
    return {
      args: { ...(value ? { text: value } : {}) },
      tokens,
      summary: value ? `Search for “${value}”` : 'Open search',
      issue: null,
    }
  }
  return { args: { ...(value ? { text: value } : {}) }, tokens, summary: entry.description, issue: null }
}

/** Plain-verb summaries for commands that take no arguments. */
function bareSummary(entry: CommandSpec, ctx: CommandContext): string {
  const cards = cardNoun(ctx.selectionCount)
  switch (entry.id) {
    case 'delete': return `Delete ${cards}`
    case 'duplicate': return `Duplicate ${cards}`
    case 'cut': return `Cut ${cards}`
    case 'glue': return `Glue ${cards} into one cluster`
    case 'unglue': return `Unglue ${cards}`
    case 'pin': return `Pin ${cards}`
    case 'unpin': return `Unpin ${cards}`
    case 'lock': return `Lock ${cards}`
    case 'unlock': return `Unlock ${cards}`
    case 'favorite': return `Star ${cards}`
    case 'unfavorite': return `Unstar ${cards}`
    case 'done': return `Mark ${cards} done`
    case 'undone': return `Reopen ${cards}`
    case 'open': return `Open ${cards}`
    case 'iconify': return `Fold ${cards} to icons`
    case 'snap': return `Snap ${cards} to the grid`
    case 'untangle': return ctx.selectionCount > 0 ? `Untangle ${cards}` : 'Untangle the canvas'
    case 'frame': return ctx.selectionCount > 0 ? 'Frame the selection' : 'Frame the board'
    case 'next-tab': return 'Next canvas tab'
    case 'previous-tab': return 'Previous canvas tab'
    case 'close-tab': return 'Close this canvas tab'
    default: return entry.description
  }
}

const TEXT_ARG_IDS = new Set(['rename', 'canvas', 'rename-canvas', 'go', 'switch', 'open-tab', 'find'])
const CHOICE_ARG_IDS = new Set(['align', 'distribute', 'nudge', 'zoom', 'select-all'])

/**
 * Parse one line. Returns null when the first word is not a verb — the line
 * belongs to the thought interpreter, exactly as before.
 */
export function parseCommandLine(source: string, ctx: CommandContext): ParsedCommand | null {
  if (source.includes('\n')) return null
  const words = splitWords(source)
  const first = words[0]
  if (!first) return null
  const entry = VERB_INDEX.get(first.lower)
  if (!entry) return null

  const rest = words.slice(1)
  const verbToken: CommandToken = { text: first.text, role: 'verb' }

  let outcome: ArgOutcome
  if (entry.id === 'add') outcome = parseAddArgs(rest, ctx)
  else if (entry.id === 'skin') outcome = parseSkinArgs(rest, ctx)
  else if (CHOICE_ARG_IDS.has(entry.id)) outcome = parseChoiceArgs(entry, rest, ctx)
  else if (TEXT_ARG_IDS.has(entry.id)) outcome = parseTextArgs(entry, rest, ctx)
  else {
    outcome = {
      args: {},
      tokens: rest.map((word) => ({ text: word.text, role: FILLER.has(word.lower) ? 'filler' as const : 'unknown' as const })),
      summary: bareSummary(entry, ctx),
      issue: null,
    }
  }

  const issue = outcome.issue ?? selectionIssue(entry, ctx)
  return {
    spec: entry,
    tokens: [verbToken, ...outcome.tokens],
    args: outcome.args,
    summary: outcome.summary,
    issue,
  }
}

/**
 * Verb suggestions for the hint row: exact and prefix matches on the first
 * word only. A full thought ("plan my week") produces none and the capture
 * path stays undisturbed.
 */
export function suggestCommands(source: string, limit = 4): CommandSuggestion[] {
  if (source.includes('\n')) return []
  const words = splitWords(source)
  const first = words[0]
  if (!first || words.length > 1) return []
  const needle = first.lower
  if (needle.length === 0) return []
  const scored: Array<{ entry: CommandSpec; score: number }> = []
  for (const entry of COMMAND_SPECS) {
    let best = 0
    for (const verb of entry.verbs) {
      if (verb === needle) best = Math.max(best, 3)
      else if (verb.startsWith(needle)) best = Math.max(best, 2)
    }
    if (best > 0) scored.push({ entry, score: best })
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => ({ spec: entry, completion: `${entry.verbs[0]!} ` }))
}

/** Example commands for the empty bar — the quiet teaching row. */
export const COMMAND_EXAMPLES = ['add note x3', 'glue', 'align left', 'skin', 'zoom 150'] as const
