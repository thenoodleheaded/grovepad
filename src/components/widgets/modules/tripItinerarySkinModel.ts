import type {
  ModuleData,
  TripDay,
  TripItineraryData,
  TripItinerarySkinMode,
  TripLeg,
} from '../../../types/spatial'
import { localDayKey } from '../../../utils/localDate'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'

export const TRIP_ITINERARY_SKINS: readonly TripItinerarySkinMode[] = [
  'days',
  'timeline',
  'bookings',
  'offline',
  'map',
  'group',
  'travel_day',
]

/** The abstract stop palette the Map skin paints its route with. */
export const TRIP_STOP_KINDS = ['sight', 'food', 'stay', 'transit'] as const
export type TripStopKind = (typeof TRIP_STOP_KINDS)[number]

export interface TripLegDetails {
  /** Map: which named area of the destination this stop belongs to. */
  zone?: string
  /** Map: what kind of stop this is on the schematic route. */
  kind?: TripStopKind
  /** Group: who joins this leg (free text, comma separated). */
  who?: string
  /** Group: the one person responsible for making this leg happen. */
  owner?: string
  /** Travel Day: gate, platform, terminal, or transfer instruction. */
  transfer?: string
  /** Travel Day: minutes of slack to allow before the stated time. */
  bufferMinutes?: number
  /** Travel Day: the document this leg cannot happen without. */
  document?: string
  /** Travel Day: the leg's time expressed at the destination clock. */
  localTime?: string
}

export interface TripChronoLeg {
  day: TripDay
  leg: TripLeg
  dayIndex: number
}

const STOP_KINDS = new Set<TripStopKind>(TRIP_STOP_KINDS)
const TEXT_DETAIL_KEYS = [
  'zone',
  'who',
  'owner',
  'transfer',
  'document',
] as const

const MAX_DAYS = 90
const MAX_LEGS_PER_DAY = 40
const MAX_TEXT = 300
const MAX_DETAIL = 200
const MAX_BUFFER_MINUTES = 24 * 60

function cleanText(raw: unknown, limit: number): string {
  return typeof raw === 'string' ? raw.slice(0, limit) : ''
}

function cleanDate(raw: unknown): string {
  return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''
}

function cleanTime(raw: unknown): string {
  return typeof raw === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : ''
}

export function tripItinerarySkinMode(raw: unknown): TripItinerarySkinMode {
  return typeof raw === 'string' && TRIP_ITINERARY_SKINS.includes(raw as TripItinerarySkinMode)
    ? raw as TripItinerarySkinMode
    : 'days'
}

function tripLeg(raw: unknown, fallbackId: string): TripLeg | null {
  if (!raw || typeof raw !== 'object') return null
  const leg = raw as Partial<TripLeg>
  return {
    id: typeof leg.id === 'string' && leg.id ? leg.id : fallbackId,
    time: cleanTime(leg.time),
    what: cleanText(leg.what, MAX_TEXT),
    where: cleanText(leg.where, MAX_TEXT),
    confirmation: cleanText(leg.confirmation, MAX_TEXT),
    booked: leg.booked === true,
  }
}

export function tripDays(raw: unknown): TripDay[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_DAYS).flatMap((item, dayIndex) => {
    if (!item || typeof item !== 'object') return []
    const day = item as Partial<TripDay>
    const legs = Array.isArray(day.legs)
      ? day.legs.slice(0, MAX_LEGS_PER_DAY).flatMap((rawLeg, legIndex) => {
        const leg = tripLeg(rawLeg, `leg-${dayIndex}-${legIndex}`)
        return leg ? [leg] : []
      })
      : []
    return [{
      id: typeof day.id === 'string' && day.id ? day.id : `day-${dayIndex}`,
      date: cleanDate(day.date),
      legs,
    }]
  })
}

/** Days sorted forward in time — an itinerary always reads toward departure.
 * Undated days sink to the end in their stored order. */
export function orderedTripDays(days: readonly TripDay[]): TripDay[] {
  return [...days].sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date.localeCompare(b.date)
  })
}

/** Every leg of the trip in strict chronological order, day then time. */
export function chronologicalTripLegs(days: readonly TripDay[]): TripChronoLeg[] {
  return orderedTripDays(days).flatMap((day, dayIndex) => (
    [...day.legs]
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((leg) => ({ day, leg, dayIndex }))
  ))
}

export function tripLegCount(days: readonly TripDay[]): number {
  return days.reduce((sum, day) => sum + day.legs.length, 0)
}

export function unbookedTripLegs(days: readonly TripDay[]): TripChronoLeg[] {
  return chronologicalTripLegs(days).filter(({ leg }) => !leg.booked)
}

/** 1-based day number within the trip, or null when either date is unusable. */
export function tripDayNumber(startDate: string, date: string): number | null {
  if (!cleanDate(startDate) || !cleanDate(date)) return null
  const start = new Date(`${startDate}T12:00:00`)
  const day = new Date(`${date}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(day.getTime())) return null
  return Math.round((day.getTime() - start.getTime()) / 86_400_000) + 1
}

export type TripPhaseTone = 'ahead' | 'underway' | 'past'

export interface TripPhaseReading {
  tone: TripPhaseTone
  label: string
}

/**
 * Where today falls in the trip — a readout, never stored state. Both the open
 * card and the resting tile read this one derivation, so they can never
 * disagree about whether the trip has started.
 */
export function tripPhase(
  startDate: string,
  days: readonly TripDay[],
  today = localDayKey(),
): TripPhaseReading | null {
  const start = cleanDate(startDate)
  if (!start) return null
  const dated = orderedTripDays(days).filter((day) => day.date)
  const last = dated.at(-1)?.date ?? start
  const end = last.localeCompare(start) > 0 ? last : start
  if (today.localeCompare(start) < 0) {
    const untilStart = tripDayNumber(today, start)
    if (untilStart === null) return null
    const daysOut = untilStart - 1
    return { tone: 'ahead', label: daysOut === 1 ? 'In 1 day' : `In ${daysOut} days` }
  }
  if (today.localeCompare(end) > 0) return { tone: 'past', label: 'Wrapped' }
  const dayNumber = tripDayNumber(start, today)
  const span = tripDayNumber(start, end)
  if (dayNumber === null || span === null) return null
  return { tone: 'underway', label: `Day ${dayNumber} of ${span}` }
}

function detailsFromState(state: WidgetSkinState): Record<string, TripLegDetails> {
  if (!state.legs || typeof state.legs !== 'object' || Array.isArray(state.legs)) return {}
  const result: Record<string, TripLegDetails> = {}
  const entries = Object.entries(state.legs as Record<string, unknown>)
  for (const [id, raw] of entries.slice(0, MAX_DAYS * MAX_LEGS_PER_DAY)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const source = raw as Record<string, unknown>
    const detail: TripLegDetails = {}
    for (const key of TEXT_DETAIL_KEYS) {
      const value = cleanText(source[key], MAX_DETAIL)
      if (value) detail[key] = value
    }
    if (STOP_KINDS.has(source.kind as TripStopKind)) detail.kind = source.kind as TripStopKind
    const buffer = typeof source.bufferMinutes === 'number' && Number.isFinite(source.bufferMinutes)
      ? Math.min(Math.max(Math.round(source.bufferMinutes), 0), MAX_BUFFER_MINUTES)
      : null
    if (buffer !== null && buffer > 0) detail.bufferMinutes = buffer
    const localTime = cleanTime(source.localTime)
    if (localTime) detail.localTime = localTime
    if (Object.keys(detail).length > 0) result[id] = detail
  }
  return result
}

export function tripLegDetails(
  data: Pick<TripItineraryData, 'skinStates'>,
  skin: TripItinerarySkinMode,
): Record<string, TripLegDetails> {
  return detailsFromState(skinStateFor(data, skin))
}

export function dataWithTripLegDetails(
  data: TripItineraryData,
  skin: TripItinerarySkinMode,
  legId: string,
  patch: Partial<TripLegDetails>,
): TripItineraryData {
  const state = skinStateFor(data, skin)
  const details = detailsFromState(state)
  const current = details[legId] ?? {}
  const nextDetail = { ...current, ...patch }
  for (const key of Object.keys(nextDetail) as Array<keyof TripLegDetails>) {
    const value = nextDetail[key]
    if (value === '' || value === undefined || value === 0) delete nextDetail[key]
  }
  const nextDetails = { ...details }
  if (Object.keys(nextDetail).length > 0) nextDetails[legId] = nextDetail
  else delete nextDetails[legId]
  return dataWithSkinState(
    { ...data, skin } as ModuleData,
    skin,
    { ...state, legs: nextDetails },
  ) as TripItineraryData
}

function nextDayDate(days: readonly TripDay[], startDate: string): string {
  const lastDated = orderedTripDays(days).filter((day) => day.date).at(-1)?.date
  const base = lastDated ?? cleanDate(startDate)
  if (!base) return ''
  const parsed = new Date(`${base}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return ''
  parsed.setDate(parsed.getDate() + (lastDated ? 1 : 0))
  return localDayKey(parsed.getTime())
}

export function addTripDay(
  data: TripItineraryData,
  id: string = crypto.randomUUID(),
): TripItineraryData {
  const days = tripDays(data.days)
  if (days.length >= MAX_DAYS) return data
  return {
    ...data,
    days: [...days, { id, date: nextDayDate(days, data.startDate), legs: [] }],
  }
}

export function addTripLeg(
  data: TripItineraryData,
  dayId: string,
  id: string = crypto.randomUUID(),
): TripItineraryData {
  return {
    ...data,
    days: tripDays(data.days).map((day) => {
      if (day.id !== dayId || day.legs.length >= MAX_LEGS_PER_DAY) return day
      const lastTime = day.legs.at(-1)?.time ?? ''
      return {
        ...day,
        legs: [...day.legs, {
          id,
          time: lastTime,
          what: '',
          where: '',
          confirmation: '',
          booked: false,
        }],
      }
    }),
  }
}

/** Drop legs' specialist pockets from every skin, not only the worn one. */
function statesWithoutLegs(
  data: TripItineraryData,
  legIds: readonly string[],
): Pick<TripItineraryData, 'skinStates'> {
  const states = Object.fromEntries(
    Object.entries(data.skinStates ?? {}).flatMap(([skin, rawState]) => {
      if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) return []
      const state = rawState as Record<string, unknown>
      const legs = detailsFromState(state)
      for (const legId of legIds) delete legs[legId]
      return [[skin, { ...state, legs }]]
    }),
  )
  return Object.keys(states).length > 0 ? { skinStates: states } : {}
}

export function removeTripLeg(
  data: TripItineraryData,
  dayId: string,
  legId: string,
): TripItineraryData {
  return {
    ...data,
    days: tripDays(data.days).map((day) => (
      day.id === dayId
        ? { ...day, legs: day.legs.filter((leg) => leg.id !== legId) }
        : day
    )),
    ...statesWithoutLegs(data, [legId]),
  }
}

export function removeTripDay(data: TripItineraryData, dayId: string): TripItineraryData {
  const days = tripDays(data.days)
  const removed = days.find((day) => day.id === dayId)
  return {
    ...data,
    days: days.filter((day) => day.id !== dayId),
    ...statesWithoutLegs(data, (removed?.legs ?? []).map((leg) => leg.id)),
  }
}

/**
 * The Travel Day skin's whole point: when do we actually have to leave.
 * `time` minus the buffer, clamped at midnight so a huge buffer never wraps
 * into yesterday.
 */
export function bufferedLeaveBy(time: string, bufferMinutes: number): string | null {
  if (!cleanTime(time) || !Number.isFinite(bufferMinutes) || bufferMinutes <= 0) return null
  const [hours, minutes] = time.split(':').map(Number) as [number, number]
  const total = Math.max(0, hours * 60 + minutes - Math.round(bufferMinutes))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export interface TripZoneGroup {
  zone: string
  legs: TripChronoLeg[]
}

/**
 * The Map skin's clusters: chronological stops bucketed by the area the user
 * filed them under. Unzoned stops gather in one trailing cluster so the route
 * never hides a stop for lacking a label.
 */
export function tripZoneGroups(
  days: readonly TripDay[],
  details: Record<string, TripLegDetails>,
): TripZoneGroup[] {
  const groups = new Map<string, TripChronoLeg[]>()
  for (const stop of chronologicalTripLegs(days)) {
    const zone = details[stop.leg.id]?.zone?.trim() || ''
    const group = groups.get(zone)
    if (group) group.push(stop)
    else groups.set(zone, [stop])
  }
  return [...groups]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : 0))
    .map(([zone, legs]) => ({ zone: zone || 'Unplaced', legs }))
}

/** Everyone the Group skin has ever been told about, for its filter chips. */
export function tripPeople(details: Record<string, TripLegDetails>): string[] {
  const people = new Set<string>()
  for (const detail of Object.values(details)) {
    for (const name of [detail.owner ?? '', ...(detail.who ?? '').split(',')]) {
      const trimmed = name.trim()
      if (trimmed) people.add(trimmed)
    }
  }
  return [...people].sort((a, b) => a.localeCompare(b))
}

export function legInvolvesPerson(detail: TripLegDetails | undefined, person: string): boolean {
  if (!detail) return false
  const names = [detail.owner ?? '', ...(detail.who ?? '').split(',')]
  return names.some((name) => name.trim().localeCompare(person, undefined, { sensitivity: 'accent' }) === 0)
}
