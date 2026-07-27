import type {
  LogbookData,
  LogbookSkinMode,
  LogEntry,
  LogLevel,
  ModuleData,
} from '../../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'

export const LOGBOOK_SKINS: readonly LogbookSkinMode[] = [
  'daily_log',
  'incident_log',
  'lab_notebook',
  'change_log',
  'maintenance_log',
  'audit_trail',
  'travel_log',
]

export type LogbookOrder = 'newest' | 'oldest'
export type IncidentStatus = 'open' | 'monitoring' | 'resolved'
export type ChangeKind = 'added' | 'changed' | 'fixed' | 'removed'

export interface LogbookEntryDetails {
  status?: IncidentStatus
  impact?: string
  response?: string
  resolution?: string
  hypothesis?: string
  method?: string
  observation?: string
  conclusion?: string
  version?: string
  author?: string
  changeKind?: ChangeKind
  asset?: string
  parts?: string
  nextService?: string
  actor?: string
  source?: string
  place?: string
  distance?: string
  context?: string
}

export interface LogbookDayGroup {
  day: string
  entries: LogEntry[]
}

const LOG_LEVELS = new Set<LogLevel>(['note', 'info', 'warning'])
const INCIDENT_STATUSES = new Set<IncidentStatus>(['open', 'monitoring', 'resolved'])
const CHANGE_KINDS = new Set<ChangeKind>(['added', 'changed', 'fixed', 'removed'])
const DETAIL_KEYS = [
  'impact',
  'response',
  'resolution',
  'hypothesis',
  'method',
  'observation',
  'conclusion',
  'version',
  'author',
  'asset',
  'parts',
  'nextService',
  'actor',
  'source',
  'place',
  'distance',
  'context',
] as const

const MAX_ENTRIES = 240
const MAX_TEXT = 2_000
const MAX_DETAIL = 500

function cleanText(raw: unknown, limit: number): string {
  return typeof raw === 'string' ? raw.slice(0, limit) : ''
}

function validTimestamp(raw: unknown): string {
  if (typeof raw !== 'string') return new Date(0).toISOString()
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString()
}

export function logbookSkinMode(raw: unknown): LogbookSkinMode {
  return typeof raw === 'string' && LOGBOOK_SKINS.includes(raw as LogbookSkinMode)
    ? raw as LogbookSkinMode
    : 'daily_log'
}

export function logbookEntries(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(-MAX_ENTRIES).flatMap((item, index) => {
    if (!item || typeof item !== 'object') return []
    const entry = item as Partial<LogEntry>
    return [{
      id: typeof entry.id === 'string' && entry.id ? entry.id : `log-${index}`,
      timestamp: validTimestamp(entry.timestamp),
      text: cleanText(entry.text, MAX_TEXT),
      level: LOG_LEVELS.has(entry.level as LogLevel) ? entry.level as LogLevel : 'note',
    }]
  })
}

export function orderedLogbookEntries(
  entries: readonly LogEntry[],
  order: LogbookOrder = 'newest',
): LogEntry[] {
  return [...entries].sort((a, b) => (
    order === 'oldest'
      ? a.timestamp.localeCompare(b.timestamp)
      : b.timestamp.localeCompare(a.timestamp)
  ))
}

export function logbookDayGroups(
  entries: readonly LogEntry[],
  order: LogbookOrder = 'newest',
): LogbookDayGroup[] {
  const groups = new Map<string, LogEntry[]>()
  for (const entry of orderedLogbookEntries(entries, order)) {
    const day = entry.timestamp.slice(0, 10)
    const group = groups.get(day)
    if (group) group.push(entry)
    else groups.set(day, [entry])
  }
  return [...groups].map(([day, groupedEntries]) => ({ day, entries: groupedEntries }))
}

export function logbookOrder(
  data: Pick<LogbookData, 'skinStates'>,
  skin: LogbookSkinMode,
): LogbookOrder {
  return skinStateFor(data, skin).order === 'oldest' ? 'oldest' : 'newest'
}

function detailsFromState(state: WidgetSkinState): Record<string, LogbookEntryDetails> {
  if (!state.entries || typeof state.entries !== 'object' || Array.isArray(state.entries)) return {}
  const result: Record<string, LogbookEntryDetails> = {}
  for (const [id, raw] of Object.entries(state.entries as Record<string, unknown>).slice(0, MAX_ENTRIES)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const source = raw as Record<string, unknown>
    const detail: LogbookEntryDetails = {}
    for (const key of DETAIL_KEYS) {
      const value = cleanText(source[key], MAX_DETAIL)
      if (value) detail[key] = value
    }
    if (INCIDENT_STATUSES.has(source.status as IncidentStatus)) {
      detail.status = source.status as IncidentStatus
    }
    if (CHANGE_KINDS.has(source.changeKind as ChangeKind)) {
      detail.changeKind = source.changeKind as ChangeKind
    }
    if (Object.keys(detail).length > 0) result[id] = detail
  }
  return result
}

export function logbookEntryDetails(
  data: Pick<LogbookData, 'skinStates'>,
  skin: LogbookSkinMode,
): Record<string, LogbookEntryDetails> {
  return detailsFromState(skinStateFor(data, skin))
}

export function defaultLogbookDetails(
  skin: LogbookSkinMode,
  index: number,
): LogbookEntryDetails {
  if (skin === 'incident_log') return { status: 'open' }
  if (skin === 'change_log') return { version: `v${index + 1}`, author: 'You', changeKind: 'changed' }
  if (skin === 'audit_trail') return { actor: 'You', source: 'Manual' }
  return {}
}

export function dataWithLogbookEntryDetails(
  data: LogbookData,
  skin: LogbookSkinMode,
  entryId: string,
  patch: Partial<LogbookEntryDetails>,
): LogbookData {
  const state = skinStateFor(data, skin)
  const details = detailsFromState(state)
  const current = details[entryId] ?? {}
  const nextDetail = { ...current, ...patch }
  for (const key of Object.keys(nextDetail) as Array<keyof LogbookEntryDetails>) {
    if (nextDetail[key] === '') delete nextDetail[key]
  }
  const nextDetails = { ...details }
  if (Object.keys(nextDetail).length > 0) nextDetails[entryId] = nextDetail
  else delete nextDetails[entryId]
  return dataWithSkinState(
    { ...data, skin } as ModuleData,
    skin,
    { ...state, entries: nextDetails },
  ) as LogbookData
}

export function dataWithLogbookOrder(
  data: LogbookData,
  skin: LogbookSkinMode,
  order: LogbookOrder,
): LogbookData {
  const state = skinStateFor(data, skin)
  return dataWithSkinState(
    { ...data, skin } as ModuleData,
    skin,
    { ...state, order },
  ) as LogbookData
}

export function appendLogbookEntry(
  data: LogbookData,
  text: string,
  level: LogLevel = 'note',
  timestamp = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): LogbookData {
  const entry: LogEntry = {
    id,
    timestamp: validTimestamp(timestamp),
    text: cleanText(text, MAX_TEXT),
    level: LOG_LEVELS.has(level) ? level : 'note',
  }
  return {
    ...data,
    entries: [...logbookEntries(data.entries), entry].slice(-MAX_ENTRIES),
  }
}

export function removeLogbookEntry(data: LogbookData, entryId: string): LogbookData {
  const nextStates = Object.fromEntries(
    Object.entries(data.skinStates ?? {}).flatMap(([skin, rawState]) => {
      if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) return []
      const state = rawState as Record<string, unknown>
      const entries = detailsFromState(state)
      delete entries[entryId]
      return [[skin, { ...state, entries }]]
    }),
  )
  return {
    ...data,
    entries: data.entries.filter((entry) => entry.id !== entryId),
    ...(Object.keys(nextStates).length > 0 ? { skinStates: nextStates } : {}),
  }
}

export function latestLogbookEntry(entries: readonly LogEntry[]): LogEntry | null {
  return orderedLogbookEntries(entries, 'newest')[0] ?? null
}

export function logbookWarningCount(entries: readonly LogEntry[]): number {
  return entries.filter((entry) => entry.level === 'warning').length
}
