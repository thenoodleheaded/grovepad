import { ZONE_CHOICES, validTimeZone, zoneLabel } from './timeSkinModel'

/**
 * World Clock wears six shapes over one stored list of time zones.
 *
 * Every reading here is derived, never persisted: the zone list is the only
 * canonical field, so switching skins can never invalidate a saved city. The
 * few things a skin needs to remember — a working window, the hour under
 * inspection, which city is home — live in that skin's isolated `skinStates`
 * entry and are validated on the way in.
 */

export type WorldClockSkin =
  | 'city_grid'
  | 'analog_wall'
  | 'overlap_band'
  | 'meeting_planner'
  | 'travel_clock'
  | 'sunlight'

const WORLD_CLOCK_SKINS = new Set<WorldClockSkin>([
  'city_grid',
  'analog_wall',
  'overlap_band',
  'meeting_planner',
  'travel_clock',
  'sunlight',
])

export function worldClockSkin(raw: unknown): WorldClockSkin {
  return typeof raw === 'string' && WORLD_CLOCK_SKINS.has(raw as WorldClockSkin)
    ? raw as WorldClockSkin
    : 'city_grid'
}

function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
}

function boundedHour(raw: unknown, fallback: number): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(23, Math.max(0, Math.round(value)))
}

// ── Zone arithmetic ────────────────────────────────────────────────────────

/**
 * Minutes a zone sits ahead of UTC at `now`.
 *
 * `Intl` can format an instant into a zone but will not hand back an offset,
 * so we format the instant as if it were UTC wall-clock text, read it back as
 * a UTC timestamp, and difference the two. This survives DST because the
 * offset is sampled at the instant we care about rather than assumed.
 */
export function zoneOffsetMinutes(tz: string, now: Date): number {
  if (!validTimeZone(tz)) return 0
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now)
  const read = (type: string): number => Number(
    parts.find((part) => part.type === type)?.value ?? '0',
  )
  // `hour: '2-digit'` with hour12:false yields 24 at midnight in some engines.
  const hour = read('hour') % 24
  const asUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    hour,
    read('minute'),
    read('second'),
  )
  // Drop sub-second noise so equal zones compare equal.
  return Math.round((asUtc - Math.floor(now.getTime() / 1000) * 1000) / 60_000)
}

/** Hours-since-midnight in `tz`, fractional so hands and arcs move smoothly. */
export function zoneHourFraction(tz: string, now: Date): number {
  const offset = zoneOffsetMinutes(tz, now)
  const minutesOfDay = ((now.getTime() / 60_000 + offset) % 1440 + 1440) % 1440
  return minutesOfDay / 60
}

export interface ZoneClockFace {
  tz: string
  label: string
  /** Degrees clockwise from 12 o'clock. */
  hourAngle: number
  minuteAngle: number
  /** True while the zone sits inside its own night. */
  night: boolean
  hourFraction: number
}

export function zoneClockFace(tz: string, now: Date): ZoneClockFace {
  const hourFraction = zoneHourFraction(tz, now)
  const minutes = (hourFraction % 1) * 60
  return {
    tz,
    label: zoneLabel(tz),
    hourAngle: (hourFraction % 12) * 30,
    minuteAngle: minutes * 6,
    night: hourFraction < 6 || hourFraction >= 20,
    hourFraction,
  }
}

// ── Working window, shared by Overlap Band and Meeting Planner ──────────────

export interface WorkingWindow {
  start: number
  end: number
}

export const DEFAULT_WORKING_WINDOW: WorkingWindow = { start: 9, end: 17 }

export function workingWindow(raw: unknown): WorkingWindow {
  const state = record(raw)
  const start = boundedHour(state.start, DEFAULT_WORKING_WINDOW.start)
  const end = boundedHour(state.end, DEFAULT_WORKING_WINDOW.end)
  // An inverted or empty window would render as a zero-width band and make
  // every hour read as "outside hours"; clamp to at least one hour instead.
  return end > start ? { start, end } : { start, end: Math.min(23, start + 1) }
}

export interface ZoneBand {
  tz: string
  label: string
  /** Local hour that corresponds to hour 0 of the reference zone's day. */
  shift: number
  /** 24 flags, indexed by the reference zone's hour. */
  working: boolean[]
  /** Local hour shown for each reference hour. */
  localHours: number[]
}

/**
 * One row per city, aligned to the first city's day so the columns of a band
 * chart can be compared vertically.
 */
export function zoneBands(
  zones: readonly string[],
  now: Date,
  window: WorkingWindow,
): ZoneBand[] {
  const reference = zones[0]
  if (!reference) return []
  const referenceOffset = zoneOffsetMinutes(reference, now)
  return zones.map((tz) => {
    const shift = Math.round((zoneOffsetMinutes(tz, now) - referenceOffset) / 60)
    const localHours: number[] = []
    const working: boolean[] = []
    for (let hour = 0; hour < 24; hour += 1) {
      const local = ((hour + shift) % 24 + 24) % 24
      localHours.push(local)
      working.push(local >= window.start && local < window.end)
    }
    return { tz, label: zoneLabel(tz), shift, working, localHours }
  })
}

/** Reference-zone hours where every city is inside its working window. */
export function overlapHours(bands: readonly ZoneBand[]): number[] {
  if (bands.length === 0) return []
  const hours: number[] = []
  for (let hour = 0; hour < 24; hour += 1) {
    if (bands.every((band) => band.working[hour])) hours.push(hour)
  }
  return hours
}

export interface MeetingRow {
  tz: string
  label: string
  localHour: number
  dayDelta: -1 | 0 | 1
  /** Inside working hours. */
  comfortable: boolean
  /** Awake but outside working hours. */
  tolerable: boolean
}

export function meetingRows(
  zones: readonly string[],
  now: Date,
  hour: number,
  window: WorkingWindow,
): MeetingRow[] {
  const reference = zones[0]
  if (!reference) return []
  const referenceOffset = zoneOffsetMinutes(reference, now)
  return zones.map((tz) => {
    const shift = Math.round((zoneOffsetMinutes(tz, now) - referenceOffset) / 60)
    const raw = hour + shift
    const localHour = ((raw % 24) + 24) % 24
    const dayDelta = raw < 0 ? -1 : raw > 23 ? 1 : 0
    const comfortable = localHour >= window.start && localHour < window.end
    return {
      tz,
      label: zoneLabel(tz),
      localHour,
      dayDelta: dayDelta as -1 | 0 | 1,
      comfortable,
      tolerable: !comfortable && localHour >= 7 && localHour < 22,
    }
  })
}

export function meetingPlannerState(raw: unknown, now: Date, reference?: string): {
  hour: number
  window: WorkingWindow
} {
  const state = record(raw)
  const fallback = reference
    ? Math.floor(zoneHourFraction(reference, now))
    : 9
  return {
    hour: boundedHour(state.hour, fallback),
    window: workingWindow(state.window),
  }
}

export function overlapBandState(raw: unknown): { window: WorkingWindow } {
  return { window: workingWindow(record(raw).window) }
}

// ── Travel Clock ───────────────────────────────────────────────────────────

export interface TravelPairing {
  home: string
  away: string
  /** Whole hours the destination sits ahead of home. */
  shift: number
}

export function travelClockState(
  raw: unknown,
  zones: readonly string[],
  now: Date,
): TravelPairing {
  const state = record(raw)
  const known = (value: unknown): string | null =>
    typeof value === 'string' && zones.includes(value) ? value : null
  const home = known(state.home) ?? zones[0] ?? ''
  const away = known(state.away)
    ?? zones.find((zone) => zone !== home)
    ?? home
  if (!home) return { home: '', away: '', shift: 0 }
  const shift = Math.round(
    (zoneOffsetMinutes(away, now) - zoneOffsetMinutes(home, now)) / 60,
  )
  return { home, away, shift }
}

// ── Sunlight ───────────────────────────────────────────────────────────────

export interface SunReading {
  tz: string
  label: string
  hourFraction: number
  sunrise: number
  sunset: number
  daylight: boolean
  /** 0-1 across the lit part of the day; 0 outside it. */
  progress: number
}

/**
 * Sunrise and sunset without a latitude.
 *
 * The stored data is a zone name, not a coordinate, so a true solar
 * calculation is not available here. A civil 06:00/18:00 day is the honest
 * approximation: it is right at the equinox everywhere, and the band is
 * presented as "daytime hours" rather than as an almanac. Sun Window is the
 * widget that owns real solar times.
 */
export const CIVIL_SUNRISE = 6
export const CIVIL_SUNSET = 18

export function sunReading(tz: string, now: Date): SunReading {
  const hourFraction = zoneHourFraction(tz, now)
  const daylight = hourFraction >= CIVIL_SUNRISE && hourFraction < CIVIL_SUNSET
  return {
    tz,
    label: zoneLabel(tz),
    hourFraction,
    sunrise: CIVIL_SUNRISE,
    sunset: CIVIL_SUNSET,
    daylight,
    progress: daylight
      ? (hourFraction - CIVIL_SUNRISE) / (CIVIL_SUNSET - CIVIL_SUNRISE)
      : 0,
  }
}

/** Cities not already on the card, filtered by a search box. */
export function zoneSuggestions(
  zones: readonly string[],
  query: string,
): ReadonlyArray<{ tz: string; label: string }> {
  const needle = query.trim().toLowerCase()
  return ZONE_CHOICES.filter((zone) =>
    !zones.includes(zone.tz)
    && (needle === '' || `${zone.label} ${zone.tz}`.toLowerCase().includes(needle)),
  )
}

/** Two-digit clock text for a whole local hour. */
export function hourLabel(hour: number): string {
  return `${String(((hour % 24) + 24) % 24).padStart(2, '0')}:00`
}
