/**
 * Cheap, deterministic language normalization shared by direct widget and
 * vague-scenario interpretation. It deliberately corrects only unambiguous
 * near-misses; uncertain words are preserved so typo tolerance cannot silently
 * rewrite a user's subject into a different intent.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'before', 'but', 'by', 'do', 'for', 'from',
  'had', 'has', 'have', 'i', 'if', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'our', 'really',
  'should', 'some', 'that', 'the', 'their', 'them', 'this', 'to', 'very', 'want', 'we', 'with', 'would',
])

const CANONICAL: Record<string, string> = {
  learnt: 'learn', learned: 'learn', learning: 'learn', studying: 'learn', studied: 'learn', study: 'learn',
  practicing: 'practice', practising: 'practice', practiced: 'practice', practised: 'practice',
  improve: 'improve', improving: 'improve', better: 'improve', master: 'learn', mastering: 'learn',
  organise: 'organize', organising: 'organize', organized: 'organize', tidying: 'organize', tidy: 'organize',
  schedule: 'plan', scheduling: 'plan', planning: 'plan', planned: 'plan', arrange: 'plan', arranging: 'plan',
  vacation: 'trip', holiday: 'trip', travelling: 'travel', traveling: 'travel', journey: 'travel',
  employment: 'job', occupation: 'job', workplace: 'work', profession: 'career', vocation: 'career',
  cash: 'money', finances: 'money', financial: 'money', saving: 'save', savings: 'save', expenses: 'spend',
  workout: 'train', workouts: 'train', exercise: 'train', exercising: 'train', fitness: 'health',
  physician: 'doctor', therapist: 'provider', counsellor: 'provider', counselor: 'provider',
  house: 'home', apartment: 'home', flat: 'home', relocating: 'move', relocation: 'move',
  kid: 'child', kids: 'child', children: 'child', mum: 'parent', mom: 'parent', dad: 'parent',
  spouse: 'partner', fiance: 'partner', fiancée: 'partner', puppy: 'pet', kitten: 'pet',
  startup: 'business', company: 'business', customers: 'customer', users: 'customer', clients: 'client',
  launch: 'release', shipping: 'release', shipped: 'release', publish: 'release',
  cooking: 'cook', groceries: 'grocery', recipes: 'recipe', meals: 'meal',
  drawing: 'draw', sketching: 'draw', writing: 'write', composing: 'write', photographs: 'photo',
  todos: 'checklist', todo: 'checklist', tasks: 'checklist', tasklist: 'checklist',
  notes: 'note', jot: 'note', roadmap: 'timeline', milestones: 'timeline',
}

const PHRASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:wanna|would like to|want to)\b/gi, 'want'],
  [/\b(?:gonna|going to)\b/gi, 'plan to'],
  [/\b(?:get|become) better at\b/gi, 'improve'],
  [/\bbrush up (?:on|my)\b/gi, 'improve'],
  [/\bpick up\b/gi, 'learn'],
  [/\bget into\b/gi, 'learn'],
  [/\bfigure out\b/gi, 'learn'],
  [/\bsort (?:out|through)\b/gi, 'organize'],
  [/\bclean up\b/gi, 'organize'],
  [/\bmake sense of\b/gi, 'organize'],
  [/\bkeep tabs on\b/gi, 'track'],
  [/\bstay on top of\b/gi, 'manage'],
  [/\bset aside money\b/gi, 'save money'],
  [/\bget rid of\b/gi, 'remove'],
]

function fold(value: string): string {
  return value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function rawWords(text: string): string[] {
  return fold(text).match(/[a-z\d]+(?:'[a-z]+)?/g) ?? []
}

function stem(word: string): string {
  if (word.length > 6 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.length > 6 && word.endsWith('ing')) return word.slice(0, -3).replace(/(.)\1$/, '$1')
  if (word.length > 5 && word.endsWith('ed')) return word.slice(0, -2).replace(/(.)\1$/, '$1')
  if (word.length > 5 && word.endsWith('es') && !/(?:ses|xes|zes)$/.test(word)) return word.slice(0, -2)
  if (word.length > 4 && word.endsWith('s') && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1)
  return word
}

export function canonicalToken(word: string): string {
  const folded = fold(word).replace(/[^a-z\d]/g, '')
  return CANONICAL[folded] ?? CANONICAL[stem(folded)] ?? stem(folded)
}

/** Damerau-Levenshtein with adjacent transposition support. */
function editDistance(aValue: string, bValue: string): number {
  const a = fold(aValue)
  const b = fold(bValue)
  const rows = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) rows[i]![0] = i
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      rows[i]![j] = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i]![j] = Math.min(rows[i]![j]!, rows[i - 2]![j - 2]! + 1)
      }
    }
  }
  return rows[a.length]![b.length]!
}

export function buildVocabulary(...sources: Array<string | readonly string[]>): string[] {
  const words = [...Object.keys(CANONICAL), ...sources.flatMap((source) => typeof source === 'string' ? rawWords(source) : source.flatMap(rawWords))]
  return [...new Set(words.filter((word) => word.length >= 4 && !STOP_WORDS.has(word)))]
}

function typoLimit(word: string): number {
  if (word.length < 4) return 0
  if (word.length <= 5) return 1
  return 2
}

function nearestUnambiguous(word: string, vocabulary: readonly string[]): string {
  if (word.length < 4 || vocabulary.includes(word)) return word
  const limit = typoLimit(word)
  let best = word
  let bestDistance = limit + 1
  let tied = false
  for (const candidate of vocabulary) {
    if (Math.abs(candidate.length - word.length) > limit) continue
    if (candidate[0] !== word[0]) continue
    const distance = editDistance(word, candidate)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
      tied = false
    } else if (distance === bestDistance && candidate !== best) {
      tied = true
    }
  }
  return bestDistance <= limit && !tied ? best : word
}

export interface NormalizedLanguage {
  correctedText: string
  tokens: Set<string>
  corrections: ReadonlyArray<{ from: string; to: string }>
}

export function normalizeLanguage(text: string, vocabulary: readonly string[] = []): NormalizedLanguage {
  let expanded = fold(text).replace(/[’‘]/g, "'")
  for (const [pattern, replacement] of PHRASES) expanded = expanded.replace(pattern, replacement)
  const corrections: Array<{ from: string; to: string }> = []
  const correctedText = expanded.replace(/[a-z\d]+(?:'[a-z]+)?/g, (word) => {
    const corrected = nearestUnambiguous(word, vocabulary)
    if (corrected !== word) corrections.push({ from: word, to: corrected })
    return corrected
  })
  const tokens = new Set(rawWords(correctedText)
    .map(canonicalToken)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token)))
  return { correctedText, tokens, corrections }
}

export function tokenCoverage(input: ReadonlySet<string>, target: ReadonlySet<string>): number {
  if (!input.size || !target.size) return 0
  let matches = 0
  input.forEach((token) => { if (target.has(token)) matches++ })
  return matches / input.size
}

/** Phrase recognition for explicit labels. Unlike global typo correction this
 * can safely resolve ties using the other words in a multi-word label. */
export function fuzzyPhraseMatch(text: string, phrase: string): boolean {
  const input = rawWords(text)
  const expected = rawWords(phrase)
  if (!expected.length) return false
  return expected.every((word) => input.some((candidate) => {
    if (candidate === word) return true
    const limit = typoLimit(word)
    return limit > 0 && candidate[0] === word[0] && Math.abs(candidate.length - word.length) <= limit && editDistance(candidate, word) <= limit
  }))
}
