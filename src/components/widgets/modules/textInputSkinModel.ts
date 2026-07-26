/**
 * Text Input skin data and the pure helpers its renderer and resting face share.
 *
 * `TextInputData.value` is the one canonical string — it is what a wire reads,
 * what `has_value` answers about, and what every skin writes. A skin only
 * changes how that string is asked for: a search field, a web address, an
 * address book entry, a row of tags, a command line. Anything a skin needs on
 * top of the string (a command's draft and history) lives in its own pocket of
 * `skinStates`, so switching presentation never changes what the card emits.
 */

export type TextInputSkinMode =
  | 'single_line'
  | 'multiline'
  | 'search'
  | 'url'
  | 'email'
  | 'tags'
  | 'command'

const SKIN_MODES = new Set<TextInputSkinMode>([
  'single_line',
  'multiline',
  'search',
  'url',
  'email',
  'tags',
  'command',
])

/**
 * The skin this card wears. Cards saved before Text Input had skins only
 * recorded the old Wrap/Single boolean, so that boolean picks the equivalent
 * skin — a wrapped card keeps its paragraph area instead of snapping to one
 * line the first time it is opened.
 */
export function textInputSkinMode(raw: unknown, multiline = false): TextInputSkinMode {
  if (typeof raw === 'string' && SKIN_MODES.has(raw as TextInputSkinMode)) {
    return raw as TextInputSkinMode
  }
  return multiline ? 'multiline' : 'single_line'
}

/** Only one skin is a paragraph; the rest are a single line of value. */
export function isMultilineSkin(skin: TextInputSkinMode): boolean {
  return skin === 'multiline'
}

/** The prompt each skin asks with, unless the card carries its own. */
const SKIN_PLACEHOLDERS: Record<TextInputSkinMode, string> = {
  single_line: 'Type a value…',
  multiline: 'Write the passage this card should carry…',
  search: 'Search for…',
  url: 'example.com/page',
  email: 'name@example.com',
  tags: 'Add a tag',
  command: 'deploy --preview',
}

export function textInputPlaceholder(skin: TextInputSkinMode, own: unknown): string {
  const custom = typeof own === 'string' ? own.trim() : ''
  // The stock placeholder belongs to the old single-line card, so it must not
  // follow a value onto a skin that asks for something else entirely.
  if (custom && custom !== SKIN_PLACEHOLDERS.single_line) return custom
  return SKIN_PLACEHOLDERS[skin]
}

/* -------------------------------------------------------------- web address */

export interface TextInputLink {
  /** Only ever an `http(s)` address — nothing else may reach an `href`. */
  href: string | null
  /** The part worth reading back: `grovepad.app/boards`. */
  display: string
  /** Where the address actually points, which is the part worth confirming. */
  host: string
  scheme: string
  valid: boolean
}

const EMPTY_LINK: TextInputLink = { href: null, display: '', host: '', scheme: '', valid: false }

/**
 * A typed address is untrusted text. It becomes a link only once it parses AND
 * turns out to be `http(s)`, so a `javascript:` or `data:` string typed into
 * the field can never be handed to the browser as somewhere to go.
 */
export function textInputLink(raw: string): TextInputLink {
  const value = raw.trim()
  if (!value) return EMPTY_LINK

  const parsed = parseAddress(value)
  if (!parsed) return { ...EMPTY_LINK, display: value }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      href: null,
      display: value,
      host: '',
      scheme: parsed.protocol.replace(':', ''),
      valid: false,
    }
  }

  const path = `${parsed.pathname}${parsed.search}`.replace(/\/$/, '')
  return {
    href: parsed.href,
    display: `${parsed.host}${path}`,
    host: parsed.host,
    scheme: parsed.protocol.replace(':', ''),
    valid: Boolean(parsed.host),
  }
}

function parseAddress(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    // A bare `grovepad.app/boards` is what people actually type, so it is
    // read as https — but only when it really looks like a host.
    if (!/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(value)) return null
    try {
      return new URL(`https://${value}`)
    } catch {
      return null
    }
  }
}

/* -------------------------------------------------------------------- email */

export interface TextInputEmail {
  user: string
  domain: string
  valid: boolean
}

/**
 * Shape only — this card never sends anything, so the question it answers is
 * "could this be posted to somebody" and not "does this mailbox exist".
 */
export function textInputEmail(raw: string): TextInputEmail {
  const value = raw.trim()
  const match = value.match(/^([^\s@]+)@([^\s@]+\.[^\s@]{2,})$/)
  if (!match) return { user: value, domain: '', valid: false }
  return { user: match[1] ?? '', domain: match[2] ?? '', valid: true }
}

/* --------------------------------------------------------------------- tags */

const TAG_LIMIT = 24
const TAG_LENGTH = 32

/**
 * Tags are a reading of the same canonical string, never a second copy of it:
 * the card still emits `alpha, beta` down a wire, and the chips are that text
 * split on its commas. Nothing to migrate, nothing to keep in sync.
 */
export function textInputTags(raw: string): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const piece of raw.split(',')) {
    const tag = piece.trim().slice(0, TAG_LENGTH)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    if (tags.length >= TAG_LIMIT) break
  }
  return tags
}

export function joinTextInputTags(tags: readonly string[]): string {
  return tags.join(', ')
}

/** Adding always goes through the same normalization the chips are read with. */
export function withTextInputTag(raw: string, addition: string): string {
  return joinTextInputTags(textInputTags(`${raw}, ${addition}`))
}

export function withoutTextInputTag(raw: string, removal: string): string {
  const key = removal.trim().toLowerCase()
  return joinTextInputTags(
    textInputTags(raw).filter((tag) => tag.toLowerCase() !== key),
  )
}

/* ------------------------------------------------------------------ command */

export const COMMAND_HISTORY_LIMIT = 12

/** Bounded, de-duplicated, and validated — persisted state is untrusted. */
export function textInputHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const entries: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const entry = item.trim().slice(0, 240)
    if (!entry || seen.has(entry)) continue
    seen.add(entry)
    entries.push(entry)
    if (entries.length >= COMMAND_HISTORY_LIMIT) break
  }
  return entries
}

/** Most recent first, never longer than the limit, never the same line twice. */
export function withCommandRun(history: readonly string[], entry: string): string[] {
  const line = entry.trim()
  if (!line) return [...history]
  return textInputHistory([line, ...history])
}

export function textInputDraft(raw: unknown): string {
  return typeof raw === 'string' ? raw : ''
}

/* ------------------------------------------------------------- resting face */

/**
 * What a folded card of this skin should say when it holds nothing yet. The
 * empty prompt is the skin's own language, so a resting Command card reads
 * "No command run" rather than the generic "Empty".
 */
const EMPTY_WORDS: Record<TextInputSkinMode, string> = {
  single_line: 'Empty',
  multiline: 'Empty',
  search: 'No query',
  url: 'No address',
  email: 'No address',
  tags: 'No tags',
  command: 'No command run',
}

export function textInputEmptyWord(skin: TextInputSkinMode): string {
  return EMPTY_WORDS[skin]
}
