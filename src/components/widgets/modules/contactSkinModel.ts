/**
 * Contact Card wears seven shapes over one stored person.
 *
 * `name`, `role`, `email`, `phone` and the rest of the canonical fields belong
 * to the card, not to a skin: a number typed on the Business face is the same
 * number the Emergency face dials, and switching skins never asks for it again.
 * Only the three skins that genuinely track something extra — a contact
 * cadence, a list of housemates, an on-call slot — keep it in their own
 * isolated `skinStates` entry, which is dropped when empty and never merges
 * with another skin's settings.
 *
 * Everything here is pure. Anything that depends on today takes `now`, so the
 * birthday countdown and the overdue reading are testable without a clock.
 */

export type ContactSkin =
  | 'personal'
  | 'business'
  | 'emergency'
  | 'vendor'
  | 'relationship'
  | 'household'
  | 'care_contact'

const CONTACT_SKINS = new Set<ContactSkin>([
  'personal',
  'business',
  'emergency',
  'vendor',
  'relationship',
  'household',
  'care_contact',
])

export function contactSkin(raw: unknown): ContactSkin {
  return typeof raw === 'string' && CONTACT_SKINS.has(raw as ContactSkin)
    ? (raw as ContactSkin)
    : 'personal'
}

/** The route to try first. Every skin that lists routes marks this one. */
export type ContactChannel = 'phone' | 'text' | 'email'

const CONTACT_CHANNELS = new Set<ContactChannel>(['phone', 'text', 'email'])

export function contactChannel(raw: unknown): ContactChannel | null {
  return typeof raw === 'string' && CONTACT_CHANNELS.has(raw as ContactChannel)
    ? (raw as ContactChannel)
    : null
}

function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {}
}

/** A stored string, or nothing. Never `undefined`, so inputs stay controlled. */
function text(raw: unknown): string {
  return typeof raw === 'string' ? raw : ''
}

// ── Canonical fields ────────────────────────────────────────────────────────

/**
 * Every canonical field, read defensively. A card saved before these fields
 * existed opens with them empty rather than crashing an input on `undefined`.
 */
export interface ContactFields {
  name: string
  role: string
  email: string
  phone: string
  organization: string
  address: string
  website: string
  note: string
  birthday: string
  reference: string
  preferred: ContactChannel | null
}

export function contactFields(raw: unknown): ContactFields {
  const data = record(raw)
  return {
    name: text(data.name),
    role: text(data.role),
    email: text(data.email),
    phone: text(data.phone),
    organization: text(data.organization),
    address: text(data.address),
    website: text(data.website),
    note: text(data.note),
    birthday: text(data.birthday),
    reference: text(data.reference),
    preferred: contactChannel(data.preferred),
  }
}

/** Up to two letters for the avatar. An unnamed contact gets a placeholder. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((part) => [...part][0]!.toUpperCase())
    .join('')
}

/** The headline a card shows when the name field is still empty. */
export function displayName(name: string): string {
  return name.trim() === '' ? 'New contact' : name.trim()
}

// ── Reach routes ────────────────────────────────────────────────────────────

/**
 * Dialable digits, or nothing. Anything that is not a digit, a leading `+`, or
 * a dialling separator is dropped, so a pasted "call me: 555 0134" still dials
 * and no other scheme can be smuggled into an href.
 */
export function telDigits(phone: string): string | null {
  const trimmed = phone.trim()
  const plus = trimmed.startsWith('+') ? '+' : ''
  const digits = trimmed.replace(/[^\d,;*#]/g, '')
  // Below three digits it is a fragment being typed, not a number.
  return digits.replace(/\D/g, '').length >= 3 ? `${plus}${digits}` : null
}

export function telHref(phone: string): string | null {
  const digits = telDigits(phone)
  return digits === null ? null : `tel:${digits}`
}

export function smsHref(phone: string): string | null {
  const digits = telDigits(phone)
  return digits === null ? null : `sms:${digits}`
}

export function mailHref(email: string): string | null {
  const trimmed = email.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)
    ? `mailto:${encodeURI(trimmed)}`
    : null
}

/**
 * An http(s) address, or nothing. A bare host gains `https://`; any other
 * scheme — `javascript:` above all — is refused rather than linked.
 */
export function siteHref(website: string): string | null {
  const trimmed = website.trim()
  if (trimmed === '' || /\s/.test(trimmed)) return null
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  return url.hostname === '' ? null : url.href
}

/** The host alone — a link chip should read "grovepad.app", not the full URL. */
export function siteLabel(website: string): string {
  const href = siteHref(website)
  if (href === null) return website.trim()
  return new URL(href).hostname.replace(/^www\./, '')
}

export type ReachKind = ContactChannel | 'site'

export interface ReachRoute {
  kind: ReachKind
  href: string
  label: string
  /** True when this is the route the contact asked to be reached on. */
  preferred: boolean
}

/** Every way this contact can actually be reached, in first-try order. */
export function reachRoutes(fields: ContactFields): ReachRoute[] {
  const routes: ReachRoute[] = []
  const tel = telHref(fields.phone)
  if (tel) {
    routes.push({ kind: 'phone', href: tel, label: 'Call', preferred: fields.preferred === 'phone' })
  }
  const sms = smsHref(fields.phone)
  if (sms) {
    routes.push({ kind: 'text', href: sms, label: 'Text', preferred: fields.preferred === 'text' })
  }
  const mail = mailHref(fields.email)
  if (mail) {
    routes.push({ kind: 'email', href: mail, label: 'Email', preferred: fields.preferred === 'email' })
  }
  const site = siteHref(fields.website)
  if (site) {
    routes.push({ kind: 'site', href: site, label: siteLabel(fields.website), preferred: false })
  }
  // A marked preference leads; otherwise the natural order stands.
  return [...routes.filter((route) => route.preferred), ...routes.filter((route) => !route.preferred)]
}

// ── Calendar days ───────────────────────────────────────────────────────────

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** A stored `yyyy-mm-dd`, or nothing. Rejects impossible days such as 02-31. */
export function isoDateParts(raw: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE.exec(raw.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(year, month - 1, day)
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    return null
  }
  return { year, month, day }
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Whole calendar days from one local date to another. Counting calendar days
 * rather than elapsed milliseconds keeps a daylight-saving night from turning
 * "yesterday" into 0.96 of a day.
 */
export function daysBetween(fromISO: string, toISO: string): number | null {
  const from = isoDateParts(fromISO)
  const to = isoDateParts(toISO)
  if (!from || !to) return null
  const a = new Date(from.year, from.month - 1, from.day)
  const b = new Date(to.year, to.month - 1, to.day)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/** Today as `yyyy-mm-dd` in the reader's own timezone. */
export function dayKey(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// ── Personal: the birthday ──────────────────────────────────────────────────

export interface BirthdayReading {
  /** "4 March", localized. */
  label: string
  /** The age reached on the next birthday, or null when the year is not usable. */
  turning: number | null
  daysUntil: number
  today: boolean
}

/**
 * The next birthday and how far off it is. A 29 February birthday lands on
 * 1 March in a common year, which is the same compromise a paper diary makes.
 */
export function birthdayReading(raw: string, now: Date): BirthdayReading | null {
  const parts = isoDateParts(raw)
  if (!parts) return null
  const today = startOfDay(now)
  let next = new Date(today.getFullYear(), parts.month - 1, parts.day)
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, parts.month - 1, parts.day)
  }
  const daysUntil = Math.round((next.getTime() - today.getTime()) / 86_400_000)
  const turning = next.getFullYear() - parts.year
  return {
    label: new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' }).format(
      new Date(parts.year, parts.month - 1, parts.day),
    ),
    // A year in the future, or one no person has lived through, is a typo —
    // the date still shows, the age simply stays unclaimed.
    turning: turning > 0 && turning <= 130 ? turning : null,
    daysUntil,
    today: daysUntil === 0,
  }
}

// ── Relationship: the cadence ───────────────────────────────────────────────

export const DEFAULT_CADENCE_DAYS = 14
export const CADENCE_LIMIT = 365

export interface RelationshipState {
  /** The last time contact happened, as `yyyy-mm-dd`. */
  lastContact: string | null
  cadenceDays: number
}

export function relationshipState(raw: unknown): RelationshipState {
  const state = record(raw)
  const lastContact = typeof state.lastContact === 'string'
    && isoDateParts(state.lastContact) !== null
    ? state.lastContact
    : null
  const cadence = Number(state.cadenceDays)
  return {
    lastContact,
    // A cadence of zero would make every reading infinitely overdue.
    cadenceDays: Number.isFinite(cadence)
      ? Math.min(CADENCE_LIMIT, Math.max(1, Math.round(cadence)))
      : DEFAULT_CADENCE_DAYS,
  }
}

export type CadenceStatus = 'unlogged' | 'fresh' | 'due' | 'overdue'

export interface CadenceReading {
  status: CadenceStatus
  /** Days since the last logged contact, or null when nothing is logged. */
  daysSince: number | null
  /** Days left before the next one is due; negative once it has passed. */
  daysUntil: number
  /** 0-1 for the track fill. Overdue fills it, it never overflows. */
  progress: number
}

export function cadenceReading(state: RelationshipState, now: Date): CadenceReading {
  if (state.lastContact === null) {
    return { status: 'unlogged', daysSince: null, daysUntil: state.cadenceDays, progress: 0 }
  }
  // A last-contact date in the future reads as today rather than as a
  // negative age; the user has simply picked tomorrow by accident.
  const elapsed = Math.max(0, daysBetween(state.lastContact, dayKey(now)) ?? 0)
  const daysUntil = state.cadenceDays - elapsed
  return {
    status: daysUntil > 0 ? 'fresh' : daysUntil === 0 ? 'due' : 'overdue',
    daysSince: elapsed,
    daysUntil,
    progress: Math.min(1, elapsed / state.cadenceDays),
  }
}

export function cadenceLabel(reading: CadenceReading): string {
  if (reading.status === 'unlogged') return 'Not logged yet'
  if (reading.daysSince === 0) return 'Spoke today'
  const days = reading.daysSince === 1 ? '1 day' : `${reading.daysSince} days`
  return `${days} ago`
}

export function cadenceDueLabel(reading: CadenceReading): string {
  if (reading.status === 'unlogged') return 'Log the first contact'
  if (reading.status === 'due') return 'Due today'
  if (reading.status === 'overdue') {
    const over = -reading.daysUntil
    return over === 1 ? 'Overdue by 1 day' : `Overdue by ${over} days`
  }
  return reading.daysUntil === 1 ? 'Due tomorrow' : `Due in ${reading.daysUntil} days`
}

// ── Household: the people under one roof ────────────────────────────────────

export interface HouseholdMember {
  id: string
  name: string
  relation: string
}

export interface HouseholdState {
  members: HouseholdMember[]
}

/** A roster longer than this is an address book, not a household card. */
export const HOUSEHOLD_LIMIT = 24

export function householdState(raw: unknown): HouseholdState {
  const list = record(raw).members
  if (!Array.isArray(list)) return { members: [] }
  const seen = new Set<string>()
  const members: HouseholdMember[] = []
  for (const entry of list) {
    const item = record(entry)
    const id = typeof item.id === 'string' && item.id !== '' ? item.id : null
    // A duplicate id would make React reuse one row for two people.
    if (!id || seen.has(id)) continue
    seen.add(id)
    members.push({ id, name: text(item.name), relation: text(item.relation) })
    if (members.length === HOUSEHOLD_LIMIT) break
  }
  return { members }
}

// ── Care Contact: the on-call slot ──────────────────────────────────────────

export const CARE_ESCALATION_LIMIT = 9

export interface CareState {
  /** Free text — "Weekdays 9–5", "Nights and weekends". */
  availability: string
  /** Position in the call order, 1 first. */
  escalation: number
}

export function careState(raw: unknown): CareState {
  const state = record(raw)
  const order = Number(state.escalation)
  return {
    availability: text(state.availability),
    escalation: Number.isFinite(order)
      ? Math.min(CARE_ESCALATION_LIMIT, Math.max(1, Math.round(order)))
      : 1,
  }
}

export function escalationLabel(order: number): string {
  if (order === 1) return 'Call first'
  if (order === 2) return 'Second call'
  if (order === 3) return 'Third call'
  return `Call ${order}${ordinalSuffix(order)}`
}

function ordinalSuffix(value: number): string {
  const tens = value % 100
  if (tens >= 11 && tens <= 13) return 'th'
  const ones = value % 10
  return ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th'
}
