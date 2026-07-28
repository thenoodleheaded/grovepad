import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient, supabaseConfigured } from '../lib/supabase'

export type ExternalCalendarProvider = 'google' | 'microsoft'

export interface ExternalCalendar {
  provider: ExternalCalendarProvider
  id: string
  name: string
  color: string
  primary: boolean
}

export interface ExternalCalendarEvent {
  provider: ExternalCalendarProvider
  id: string
  calendarId: string
  calendarName: string
  title: string
  start: string
  end: string
  allDay: boolean
  url?: string
  color: string
}

export interface ExternalCalendarFeed {
  calendars: ExternalCalendar[]
  events: ExternalCalendarEvent[]
}

const PROVIDER_TOKEN_KEYS: Record<ExternalCalendarProvider, string> = {
  google: 'grovepad:calendar:google-token:v1',
  microsoft: 'grovepad:calendar:microsoft-token:v1',
}
const PENDING_PROVIDER_KEY = 'grovepad:calendar:pending-provider:v1'
const MAX_CALENDARS = 6
const MAX_EVENTS_PER_CALENDAR = 40

const PROVIDER_SCOPES: Record<ExternalCalendarProvider, string> = {
  google: 'https://www.googleapis.com/auth/calendar.readonly',
  microsoft: 'email offline_access Calendars.Read',
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
}

function text(raw: unknown, fallback = ''): string {
  return typeof raw === 'string' ? raw.slice(0, 300) : fallback
}

function providerFromAuthName(raw: unknown): ExternalCalendarProvider | null {
  if (raw === 'google') return 'google'
  if (raw === 'azure') return 'microsoft'
  return null
}

function authProvider(provider: ExternalCalendarProvider): 'google' | 'azure' {
  return provider === 'google' ? 'google' : 'azure'
}

function safeColor(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw)
    ? raw
    : fallback
}

function safeHttpUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/** Provider access tokens stay device-local and never enter board persistence. */
export function rememberExternalCalendarToken(session: Session | null): void {
  if (!session?.provider_token) return
  const local = storage()
  if (!local) return
  const pending = local.getItem(PENDING_PROVIDER_KEY)
  const provider = pending === 'google' || pending === 'microsoft'
    ? pending
    : providerFromAuthName(session.user.app_metadata.provider)
  if (!provider) return
  local.setItem(PROVIDER_TOKEN_KEYS[provider], session.provider_token)
  local.removeItem(PENDING_PROVIDER_KEY)
}

export function connectedExternalCalendarProviders(): ExternalCalendarProvider[] {
  const local = storage()
  if (!local) return []
  return (['google', 'microsoft'] as const).filter(
    (provider) => Boolean(local.getItem(PROVIDER_TOKEN_KEYS[provider])),
  )
}

export function disconnectExternalCalendar(provider: ExternalCalendarProvider): void {
  storage()?.removeItem(PROVIDER_TOKEN_KEYS[provider])
}

function providerToken(provider: ExternalCalendarProvider): string | null {
  return storage()?.getItem(PROVIDER_TOKEN_KEYS[provider]) ?? null
}

function calendarRedirectUrl(provider: ExternalCalendarProvider): string {
  const url = new URL(window.location.origin)
  url.searchParams.set('calendar-connect', provider)
  return url.toString()
}

/**
 * Start a read-only OAuth grant. Existing accounts link the identity instead
 * of silently changing Grovepad users; an already-linked provider re-consents
 * so Supabase emits a fresh provider token.
 */
export async function connectExternalCalendar(
  provider: ExternalCalendarProvider,
  session: Session | null,
  leaveGuestMode?: () => void,
): Promise<void> {
  if (!supabaseConfigured) {
    throw new Error('Cloud sign-in must be configured before a calendar can connect.')
  }
  const client = await getSupabaseClient()
  if (!client) throw new Error('Calendar connection is unavailable.')

  leaveGuestMode?.()
  const activeSession = session ?? (await client.auth.getSession()).data.session
  const providerName = authProvider(provider)
  const options = {
    redirectTo: calendarRedirectUrl(provider),
    scopes: PROVIDER_SCOPES[provider],
    queryParams: { prompt: 'consent' },
  }
  storage()?.setItem(PENDING_PROVIDER_KEY, provider)

  const alreadyLinked = activeSession?.user.identities?.some(
    (identity) => identity.provider === providerName,
  ) ?? false
  const { error } = activeSession && !alreadyLinked
    ? await client.auth.linkIdentity({ provider: providerName, options })
    : await client.auth.signInWithOAuth({ provider: providerName, options })
  if (error) {
    storage()?.removeItem(PENDING_PROVIDER_KEY)
    throw error
  }
}

function googleCalendarList(raw: unknown): ExternalCalendar[] {
  const items = record(raw).items
  if (!Array.isArray(items)) return []
  return items.slice(0, 250).flatMap((item) => {
    const value = record(item)
    const id = text(value.id)
    const name = text(value.summary)
    if (!id || !name) return []
    return [{
      provider: 'google' as const,
      id,
      name,
      color: safeColor(value.backgroundColor, '#4285f4'),
      primary: value.primary === true,
    }]
  })
}

function microsoftCalendarList(raw: unknown): ExternalCalendar[] {
  const items = record(raw).value
  if (!Array.isArray(items)) return []
  return items.slice(0, 250).flatMap((item) => {
    const value = record(item)
    const id = text(value.id)
    const name = text(value.name)
    if (!id || !name) return []
    return [{
      provider: 'microsoft' as const,
      id,
      name,
      color: '#0078d4',
      primary: value.isDefaultCalendar === true,
    }]
  })
}

export function externalCalendarsFromResponse(
  provider: ExternalCalendarProvider,
  raw: unknown,
): ExternalCalendar[] {
  return provider === 'google' ? googleCalendarList(raw) : microsoftCalendarList(raw)
}

function googleEvents(
  calendar: ExternalCalendar,
  raw: unknown,
): ExternalCalendarEvent[] {
  const items = record(raw).items
  if (!Array.isArray(items)) return []
  return items.slice(0, MAX_EVENTS_PER_CALENDAR).flatMap((item) => {
    const value = record(item)
    const start = record(value.start)
    const end = record(value.end)
    const startValue = text(start.dateTime) || text(start.date)
    const endValue = text(end.dateTime) || text(end.date)
    const id = text(value.id)
    if (!id || !startValue) return []
    const url = safeHttpUrl(value.htmlLink)
    return [{
      provider: 'google' as const,
      id,
      calendarId: calendar.id,
      calendarName: calendar.name,
      title: text(value.summary, 'Busy'),
      start: startValue,
      end: endValue || startValue,
      allDay: Boolean(start.date && !start.dateTime),
      ...(url ? { url } : {}),
      color: calendar.color,
    }]
  })
}

function microsoftEvents(
  calendar: ExternalCalendar,
  raw: unknown,
): ExternalCalendarEvent[] {
  const items = record(raw).value
  if (!Array.isArray(items)) return []
  return items.slice(0, MAX_EVENTS_PER_CALENDAR).flatMap((item) => {
    const value = record(item)
    const startValue = text(record(value.start).dateTime)
    const endValue = text(record(value.end).dateTime)
    const id = text(value.id)
    if (!id || !startValue) return []
    const url = safeHttpUrl(value.webLink)
    return [{
      provider: 'microsoft' as const,
      id,
      calendarId: calendar.id,
      calendarName: calendar.name,
      title: text(value.subject, 'Busy'),
      start: startValue,
      end: endValue || startValue,
      allDay: value.isAllDay === true,
      ...(url ? { url } : {}),
      color: calendar.color,
    }]
  })
}

export function externalEventsFromResponse(
  calendar: ExternalCalendar,
  raw: unknown,
): ExternalCalendarEvent[] {
  return calendar.provider === 'google'
    ? googleEvents(calendar, raw)
    : microsoftEvents(calendar, raw)
}

async function providerJson(
  provider: ExternalCalendarProvider,
  url: URL,
  signal?: AbortSignal,
): Promise<unknown> {
  const token = providerToken(provider)
  if (!token) throw new Error(`Reconnect ${provider === 'google' ? 'Google' : 'Outlook'} Calendar.`)
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(provider === 'microsoft' ? { Prefer: 'outlook.timezone="UTC"' } : {}),
    },
    signal,
  })
  if (response.status === 401 || response.status === 403) {
    disconnectExternalCalendar(provider)
    throw new Error(`Calendar access expired. Reconnect ${provider === 'google' ? 'Google' : 'Outlook'}.`)
  }
  if (!response.ok) throw new Error(`Calendar service returned ${response.status}.`)
  return response.json() as Promise<unknown>
}

function monthBounds(year: number, month: number): { start: string; end: string } {
  return {
    start: new Date(year, month, 1, 0, 0, 0).toISOString(),
    end: new Date(year, month + 1, 1, 0, 0, 0).toISOString(),
  }
}

async function fetchCalendarEvents(
  calendar: ExternalCalendar,
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<ExternalCalendarEvent[]> {
  const url = calendar.provider === 'google'
    ? new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`)
    : new URL(`https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendar.id)}/calendarView`)
  if (calendar.provider === 'google') {
    url.searchParams.set('timeMin', start)
    url.searchParams.set('timeMax', end)
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', String(MAX_EVENTS_PER_CALENDAR))
  } else {
    url.searchParams.set('startDateTime', start)
    url.searchParams.set('endDateTime', end)
    url.searchParams.set('$orderby', 'start/dateTime')
    url.searchParams.set('$top', String(MAX_EVENTS_PER_CALENDAR))
  }
  const raw = await providerJson(calendar.provider, url, signal)
  return externalEventsFromResponse(calendar, raw)
}

export async function loadExternalCalendarMonth(
  provider: ExternalCalendarProvider,
  year: number,
  month: number,
  signal?: AbortSignal,
): Promise<ExternalCalendarFeed> {
  const listUrl = new URL(provider === 'google'
    ? 'https://www.googleapis.com/calendar/v3/users/me/calendarList'
    : 'https://graph.microsoft.com/v1.0/me/calendars')
  const calendars = externalCalendarsFromResponse(
    provider,
    await providerJson(provider, listUrl, signal),
  )
    .toSorted((left, right) => Number(right.primary) - Number(left.primary))
    .slice(0, MAX_CALENDARS)
  const { start, end } = monthBounds(year, month)
  const events = (await Promise.all(
    calendars.map((calendar) => fetchCalendarEvents(calendar, start, end, signal)),
  ))
    .flat()
    .toSorted((left, right) => left.start.localeCompare(right.start))
  return { calendars, events }
}
