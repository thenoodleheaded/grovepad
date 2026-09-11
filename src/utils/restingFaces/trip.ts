import type { TripItineraryData, TripItinerarySkinMode } from '../../types/spatial'
import {
  bufferedLeaveBy,
  chronologicalTripLegs,
  tripDayNumber,
  tripDays,
  tripItinerarySkinMode,
  tripLegDetails,
  tripPeople,
  tripPhase,
  tripZoneGroups,
  unbookedTripLegs,
  type TripChronoLeg,
} from '../../components/widgets/modules/tripItinerarySkinModel'
import {
  compact,
  REST_ROW_LIMIT,
  type RestEyebrow,
  type RestingFaceModel,
  type RestRow,
  type RestTone,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// Trip Itinerary resting faces.
//
// One itinerary, seven readings. A folded trip card keeps showing real legs —
// the next few stops of the journey itself — and the worn skin decides what
// stands beside each one: a booking's code or its gap, the area a stop lives
// in, who owns the leg, when to actually leave. Every reading comes through
// tripItinerarySkinModel, the same model the open card reads, so the tile can
// never contradict the card, the unbooked-count port, or undo.
// ---------------------------------------------------------------------------

const EYEBROWS: Record<TripItinerarySkinMode, string> = {
  days: 'Itinerary',
  timeline: 'Timeline',
  bookings: 'Bookings',
  offline: 'Offline',
  map: 'Route',
  group: 'Group',
  travel_day: 'Travel Day',
}

const PHASE_TONES: Record<'ahead' | 'underway' | 'past', RestTone> = {
  ahead: 'accent',
  underway: 'good',
  past: 'muted',
}

function stopLabel(stop: TripChronoLeg): string {
  return compact(stop.leg.what || stop.leg.where || 'Unnamed leg', 24)
}

/**
 * The resting face for a Trip Itinerary card: the next few real legs, each
 * carrying the reading its worn skin is for.
 */
export function tripItineraryRestingFace(data: Record<string, unknown>): RestingFaceModel {
  const trip = data as unknown as TripItineraryData
  const days = tripDays(trip.days)
  const stops = chronologicalTripLegs(days)
  if (stops.length === 0) return { kind: 'icon' }

  const skin = tripItinerarySkinMode(trip.skin)
  const details = tripLegDetails(trip, skin)
  const phase = tripPhase(trip.startDate, days)
  const unbooked = unbookedTripLegs(days)

  const eyebrow = (note?: string, tone?: RestTone): RestEyebrow => ({
    label: EYEBROWS[skin],
    ...(note === undefined ? {} : { note }),
    ...(tone === undefined ? {} : { tone }),
  })
  const phaseEyebrow = (): RestEyebrow => (
    phase ? eyebrow(phase.label, PHASE_TONES[phase.tone]) : eyebrow()
  )
  const row = (stop: TripChronoLeg, extra: Partial<RestRow> = {}): RestRow => ({
    key: stop.leg.id,
    label: stopLabel(stop),
    ...extra,
  })
  const face = (
    head: RestEyebrow,
    visible: readonly TripChronoLeg[],
    total: number,
    build: (stop: TripChronoLeg) => RestRow,
  ): RestingFaceModel => ({
    kind: 'rows',
    eyebrow: head,
    rows: visible.map(build),
    overflow: Math.max(0, total - visible.length),
  })

  if (skin === 'bookings') {
    // Gaps first — the whole point of the desk — then confirmed legs.
    const orderedStops = [...unbooked, ...stops.filter(({ leg }) => leg.booked)]
    const head = unbooked.length > 0
      ? eyebrow(`${unbooked.length} unbooked`, 'bad')
      : eyebrow('All booked', 'good')
    return face(head, orderedStops.slice(0, REST_ROW_LIMIT), orderedStops.length, (stop) => (
      stop.leg.booked
        ? row(stop, { value: compact(stop.leg.confirmation || 'Booked', 12), tone: 'good' })
        : row(stop, { value: 'Unbooked', tone: 'bad' })
    ))
  }

  if (skin === 'offline') {
    return face(phaseEyebrow(), stops.slice(0, REST_ROW_LIMIT), stops.length, (stop) => row(stop, {
      ...(stop.leg.time ? { lead: stop.leg.time } : {}),
      ...(stop.leg.confirmation ? { value: compact(stop.leg.confirmation, 12) } : {}),
    }))
  }

  if (skin === 'map') {
    const zones = tripZoneGroups(days, details)
    const named = zones.filter((zone) => zone.zone !== 'Unplaced')
    return face(
      named.length > 0
        ? eyebrow(`${named.length} ${named.length === 1 ? 'area' : 'areas'}`)
        : eyebrow(),
      stops.slice(0, REST_ROW_LIMIT),
      stops.length,
      (stop) => {
        const zone = details[stop.leg.id]?.zone
        return row(stop, {
          ...(zone ? { value: compact(zone, 14), tone: 'accent' as const } : {}),
        })
      },
    )
  }

  if (skin === 'group') {
    const people = tripPeople(details)
    return face(
      people.length > 0
        ? eyebrow(`${people.length} ${people.length === 1 ? 'person' : 'people'}`)
        : eyebrow(),
      stops.slice(0, REST_ROW_LIMIT),
      stops.length,
      (stop) => {
        const detail = details[stop.leg.id]
        const owner = detail?.owner || detail?.who?.split(',')[0]?.trim()
        return row(stop, {
          ...(owner ? { value: compact(owner, 12), tone: 'accent' as const } : {}),
        })
      },
    )
  }

  if (skin === 'travel_day') {
    return face(phaseEyebrow(), stops.slice(0, REST_ROW_LIMIT), stops.length, (stop) => {
      const detail = details[stop.leg.id]
      const leaveBy = bufferedLeaveBy(stop.leg.time, detail?.bufferMinutes ?? 0)
      const value = leaveBy ? `leave ${leaveBy}` : detail?.transfer
      return row(stop, {
        ...(stop.leg.time ? { lead: stop.leg.time } : {}),
        ...(value ? { value: compact(value, 14) } : {}),
        ...(leaveBy ? { tone: 'warn' as const } : {}),
      })
    })
  }

  // Days and Timeline: the journey itself, next legs in order, booked ticks on.
  const head = skin === 'timeline' || unbooked.length === 0
    ? phaseEyebrow()
    : eyebrow(`${unbooked.length} unbooked`, 'warn')
  return face(head, stops.slice(0, REST_ROW_LIMIT), stops.length, (stop) => {
    const dayNumber = tripDayNumber(trip.startDate, stop.day.date)
    return row(stop, {
      ...(stop.leg.time
        ? { lead: skin === 'timeline' && dayNumber !== null && dayNumber > 0 ? `D${dayNumber} ${stop.leg.time}` : stop.leg.time }
        : {}),
      ...(stop.leg.where ? { value: compact(stop.leg.where, 14) } : {}),
      done: stop.leg.booked,
    })
  })
}
