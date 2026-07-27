import type {
  ModuleData,
  ProsConsData,
  ProsConsItem,
  ProsConsSkinMode,
} from '../../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'

/**
 * Pros & Cons skins.
 *
 * The topic and the two item lists are canonical: every skin reads and writes
 * the same arguments. What a skin adds — a rebuttal, a severity, a weight, a
 * reversibility verdict — lives in that skin's own state, keyed by item id, so
 * rolling to another skin never edits or discards the sheet underneath.
 */

export const PROS_CONS_SKINS: readonly ProsConsSkinMode[] = [
  'balance',
  'debate',
  'red_team',
  'weighted_trade_off',
  'reversible_irreversible',
]

export type ProsConsSide = 'pro' | 'con'
export type RedTeamSeverity = 'low' | 'medium' | 'high'
export type Reversibility = 'reversible' | 'irreversible'

/** Weights are a 1–5 importance dial; 3 is "as important as anything else". */
export const MIN_WEIGHT = 1
export const MAX_WEIGHT = 5
export const DEFAULT_WEIGHT = 3

const SEVERITIES = new Set<RedTeamSeverity>(['low', 'medium', 'high'])
const REVERSIBILITIES = new Set<Reversibility>(['reversible', 'irreversible'])

const MAX_ITEMS = 120
const MAX_TEXT = 1_000

export interface RedTeamDetail {
  severity: RedTeamSeverity
  evidence: string
}

export interface ProsConsTally {
  pros: number
  cons: number
  /** −1 (all against) … 0 (even) … 1 (all for). */
  tilt: number
}

export interface ProsConsVerdict extends ProsConsTally {
  leaning: ProsConsSide | 'even'
  /** Percentage of the balance bar the pro side fills, 0–100. */
  proShare: number
}

export interface DebatePair {
  pro: ProsConsItem
  con: ProsConsItem | null
  counter: string
}

function cleanText(raw: unknown, limit = MAX_TEXT): string {
  return typeof raw === 'string' ? raw.slice(0, limit) : ''
}

function record(state: WidgetSkinState, key: string): Record<string, unknown> {
  const value = state[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function prosConsSkinMode(raw: unknown): ProsConsSkinMode {
  return typeof raw === 'string' && PROS_CONS_SKINS.includes(raw as ProsConsSkinMode)
    ? raw as ProsConsSkinMode
    : 'balance'
}

export function prosConsItems(raw: unknown): ProsConsItem[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_ITEMS).flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Partial<ProsConsItem>
    return [{
      id: typeof item.id === 'string' && item.id ? item.id : `point-${index}`,
      text: cleanText(item.text),
    }]
  })
}

/** Only points with words count — an empty draft row must not tip the scale. */
export function statedItems(items: readonly ProsConsItem[]): ProsConsItem[] {
  return items.filter((item) => item.text.trim().length > 0)
}

export function prosConsTally(data: Pick<ProsConsData, 'pros' | 'cons'>): ProsConsTally {
  const pros = statedItems(prosConsItems(data.pros)).length
  const cons = statedItems(prosConsItems(data.cons)).length
  const total = pros + cons
  return { pros, cons, tilt: total === 0 ? 0 : (pros - cons) / total }
}

function verdictFrom(pros: number, cons: number): ProsConsVerdict {
  const total = pros + cons
  const tilt = total === 0 ? 0 : (pros - cons) / total
  return {
    pros,
    cons,
    tilt,
    leaning: pros === cons ? 'even' : pros > cons ? 'pro' : 'con',
    proShare: total === 0 ? 50 : Math.round((pros / total) * 100),
  }
}

export function prosConsVerdict(data: Pick<ProsConsData, 'pros' | 'cons'>): ProsConsVerdict {
  const { pros, cons } = prosConsTally(data)
  return verdictFrom(pros, cons)
}

/* Debate ------------------------------------------------------------------ */

export function debateCounters(
  data: Pick<ProsConsData, 'skinStates'>,
): Record<string, string> {
  const counters = record(skinStateFor(data, 'debate'), 'counters')
  const result: Record<string, string> = {}
  for (const [id, raw] of Object.entries(counters).slice(0, MAX_ITEMS)) {
    const text = cleanText(raw)
    if (text) result[id] = text
  }
  return result
}

/**
 * Each pro sits opposite the con at the same position — the sheet already
 * pairs them by order — and, when the debate skin has one, an explicit
 * rebuttal typed against that pro.
 */
export function debatePairs(
  data: Pick<ProsConsData, 'pros' | 'cons' | 'skinStates'>,
): DebatePair[] {
  const pros = prosConsItems(data.pros)
  const cons = prosConsItems(data.cons)
  const counters = debateCounters(data)
  return pros.map((pro, index) => ({
    pro,
    con: cons[index] ?? null,
    counter: counters[pro.id] ?? '',
  }))
}

/** Cons with no pro across from them still deserve a turn to speak. */
export function unpairedCons(
  data: Pick<ProsConsData, 'pros' | 'cons'>,
): ProsConsItem[] {
  return prosConsItems(data.cons).slice(prosConsItems(data.pros).length)
}

export function dataWithDebateCounter(
  data: ProsConsData,
  proId: string,
  counter: string,
): ProsConsData {
  const state = skinStateFor(data, 'debate')
  const counters = { ...record(state, 'counters') }
  const text = cleanText(counter)
  if (text) counters[proId] = text
  else delete counters[proId]
  return dataWithSkinState(
    data as unknown as ModuleData,
    'debate',
    Object.keys(counters).length > 0 ? { ...state, counters } : stateWithout(state, 'counters'),
  ) as unknown as ProsConsData
}

/* Red team ---------------------------------------------------------------- */

export function redTeamDetails(
  data: Pick<ProsConsData, 'skinStates'>,
): Record<string, RedTeamDetail> {
  const entries = record(skinStateFor(data, 'red_team'), 'attacks')
  const result: Record<string, RedTeamDetail> = {}
  for (const [id, raw] of Object.entries(entries).slice(0, MAX_ITEMS)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const source = raw as Record<string, unknown>
    const severity = SEVERITIES.has(source.severity as RedTeamSeverity)
      ? source.severity as RedTeamSeverity
      : 'medium'
    const evidence = cleanText(source.evidence)
    if (severity !== 'medium' || evidence) result[id] = { severity, evidence }
  }
  return result
}

export function redTeamDetail(
  details: Record<string, RedTeamDetail>,
  id: string,
): RedTeamDetail {
  return details[id] ?? { severity: 'medium', evidence: '' }
}

export function dataWithRedTeamDetail(
  data: ProsConsData,
  conId: string,
  patch: Partial<RedTeamDetail>,
): ProsConsData {
  const state = skinStateFor(data, 'red_team')
  const attacks = { ...record(state, 'attacks') }
  const current = redTeamDetail(redTeamDetails(data), conId)
  const next: RedTeamDetail = {
    severity: patch.severity ?? current.severity,
    evidence: cleanText(patch.evidence ?? current.evidence),
  }
  if (next.severity === 'medium' && !next.evidence) delete attacks[conId]
  else attacks[conId] = next
  return dataWithSkinState(
    data as unknown as ModuleData,
    'red_team',
    Object.keys(attacks).length > 0 ? { ...state, attacks } : stateWithout(state, 'attacks'),
  ) as unknown as ProsConsData
}

/** How much unanswered risk the sheet is carrying, worst objections first. */
export function redTeamExposure(
  data: Pick<ProsConsData, 'cons' | 'skinStates'>,
): { high: number; unanswered: number } {
  const details = redTeamDetails(data)
  const cons = statedItems(prosConsItems(data.cons))
  let high = 0
  let unanswered = 0
  for (const con of cons) {
    const detail = redTeamDetail(details, con.id)
    if (detail.severity === 'high') high += 1
    if (!detail.evidence.trim()) unanswered += 1
  }
  return { high, unanswered }
}

/* Weighted trade-off ------------------------------------------------------ */

function clampWeight(raw: unknown): number {
  const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : DEFAULT_WEIGHT
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, value))
}

export function prosConsWeights(
  data: Pick<ProsConsData, 'skinStates'>,
): Record<string, number> {
  const weights = record(skinStateFor(data, 'weighted_trade_off'), 'weights')
  const result: Record<string, number> = {}
  for (const [id, raw] of Object.entries(weights).slice(0, MAX_ITEMS)) {
    const weight = clampWeight(raw)
    if (weight !== DEFAULT_WEIGHT) result[id] = weight
  }
  return result
}

export function weightFor(weights: Record<string, number>, id: string): number {
  return weights[id] ?? DEFAULT_WEIGHT
}

export function dataWithProsConsWeight(
  data: ProsConsData,
  itemId: string,
  weight: number,
): ProsConsData {
  const state = skinStateFor(data, 'weighted_trade_off')
  const weights = { ...record(state, 'weights') }
  const next = clampWeight(weight)
  if (next === DEFAULT_WEIGHT) delete weights[itemId]
  else weights[itemId] = next
  return dataWithSkinState(
    data as unknown as ModuleData,
    'weighted_trade_off',
    Object.keys(weights).length > 0 ? { ...state, weights } : stateWithout(state, 'weights'),
  ) as unknown as ProsConsData
}

/** The same verdict shape as the plain tally, but each point counts its weight. */
export function weightedVerdict(
  data: Pick<ProsConsData, 'pros' | 'cons' | 'skinStates'>,
): ProsConsVerdict {
  const weights = prosConsWeights(data)
  const sum = (items: readonly ProsConsItem[]): number =>
    statedItems(items).reduce((total, item) => total + weightFor(weights, item.id), 0)
  return verdictFrom(sum(prosConsItems(data.pros)), sum(prosConsItems(data.cons)))
}

/* Reversible / irreversible ----------------------------------------------- */

export function reversibilityMap(
  data: Pick<ProsConsData, 'skinStates'>,
): Record<string, Reversibility> {
  const entries = record(skinStateFor(data, 'reversible_irreversible'), 'reversibility')
  const result: Record<string, Reversibility> = {}
  for (const [id, raw] of Object.entries(entries).slice(0, MAX_ITEMS)) {
    if (REVERSIBILITIES.has(raw as Reversibility)) result[id] = raw as Reversibility
  }
  return result
}

/**
 * Unmarked points default to reversible: a consequence is only irreversible
 * once somebody says so, and that claim is the one worth reviewing.
 */
export function reversibilityFor(
  map: Record<string, Reversibility>,
  id: string,
): Reversibility {
  return map[id] ?? 'reversible'
}

export function dataWithReversibility(
  data: ProsConsData,
  itemId: string,
  value: Reversibility,
): ProsConsData {
  const state = skinStateFor(data, 'reversible_irreversible')
  const entries = { ...record(state, 'reversibility') }
  if (value === 'reversible') delete entries[itemId]
  else entries[itemId] = value
  return dataWithSkinState(
    data as unknown as ModuleData,
    'reversible_irreversible',
    Object.keys(entries).length > 0
      ? { ...state, reversibility: entries }
      : stateWithout(state, 'reversibility'),
  ) as unknown as ProsConsData
}

export function irreversibleCount(
  data: Pick<ProsConsData, 'pros' | 'cons' | 'skinStates'>,
): number {
  const map = reversibilityMap(data)
  return [...statedItems(prosConsItems(data.pros)), ...statedItems(prosConsItems(data.cons))]
    .filter((item) => reversibilityFor(map, item.id) === 'irreversible').length
}

/* Shared item editing ----------------------------------------------------- */

function stateWithout(state: WidgetSkinState, key: string): WidgetSkinState {
  const { [key]: _dropped, ...rest } = state
  return rest
}

export function dataWithItemText(
  data: ProsConsData,
  side: ProsConsSide,
  itemId: string,
  text: string,
): ProsConsData {
  const key = side === 'pro' ? 'pros' : 'cons'
  return {
    ...data,
    [key]: prosConsItems(data[key]).map((item) => (
      item.id === itemId ? { ...item, text: cleanText(text) } : item
    )),
  }
}

export function dataWithAddedItem(
  data: ProsConsData,
  side: ProsConsSide,
  id: string = crypto.randomUUID(),
): ProsConsData {
  const key = side === 'pro' ? 'pros' : 'cons'
  const items = prosConsItems(data[key])
  if (items.length >= MAX_ITEMS) return data
  return { ...data, [key]: [...items, { id, text: '' }] }
}

/** Removing a point takes its rebuttal, weight, and verdicts with it. */
export function dataWithoutItem(
  data: ProsConsData,
  side: ProsConsSide,
  itemId: string,
): ProsConsData {
  const key = side === 'pro' ? 'pros' : 'cons'
  const nextStates = Object.fromEntries(
    Object.entries(data.skinStates ?? {}).flatMap(([skin, rawState]) => {
      if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) return []
      const state = rawState as Record<string, unknown>
      const cleaned = Object.fromEntries(
        Object.entries(state).map(([stateKey, value]) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return [stateKey, value]
          }
          const { [itemId]: _dropped, ...rest } = value as Record<string, unknown>
          return [stateKey, rest]
        }),
      )
      return [[skin, cleaned]]
    }),
  )
  return {
    ...data,
    [key]: prosConsItems(data[key]).filter((item) => item.id !== itemId),
    ...(Object.keys(nextStates).length > 0 ? { skinStates: nextStates } : {}),
  }
}
