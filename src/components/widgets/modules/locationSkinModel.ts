/**
 * Location skin data and the pure geography its renderer, resting face, and
 * tests share.
 *
 * `latitude`, `longitude`, `address`, `label`, and `timezone` stay canonical —
 * they are what a wire reads and what the `clear` command empties. Every skin
 * reads exactly those fields; a skin's own extras (a geofence radius, a route's
 * stops, a preferred coordinate notation) live in their own pocket of
 * `skinStates`, so changing how the card looks can never change what it emits.
 *
 * Everything here is pure: no `Date.now()`, no browser geolocation, no DOM. The
 * renderer owns the clock and the permission prompt; this file owns the maths.
 */

export type LocationSkinMode =
  | 'pin'
  | 'coordinates'
  | 'local_time'
  | 'compass'
  | 'geofence'
  | 'route'
  | 'map'

const SKIN_MODES = new Set<LocationSkinMode>([
  'pin',
  'coordinates',
  'local_time',
  'compass',
  'geofence',
  'route',
  'map',
])

export function locationSkinMode(raw: unknown): LocationSkinMode {
  return typeof raw === 'string' && SKIN_MODES.has(raw as LocationSkinMode)
    ? raw as LocationSkinMode
    : 'pin'
}

/* --------------------------------------------------------------- geometry */

export interface GeoPoint {
  latitude: number
  longitude: number
}

interface PartialPoint {
  latitude: number | null
  longitude: number | null
}

/** A usable point, or null. Half a coordinate pair is not a place. */
export function locationPoint(data: PartialPoint | null | undefined): GeoPoint | null {
  if (!data) return null
  const { latitude, longitude } = data
  if (typeof latitude !== 'number' || !Number.isFinite(latitude)) return null
  if (typeof longitude !== 'number' || !Number.isFinite(longitude)) return null
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return { latitude, longitude }
}

const EARTH_RADIUS_M = 6_371_008.8
const toRadians = (degrees: number) => (degrees * Math.PI) / 180
const toDegrees = (radians: number) => (radians * 180) / Math.PI

/**
 * Great-circle distance in metres — the honest "as the crow flies" number.
 * Never a driving distance: this card has no route service and must not
 * pretend otherwise.
 */
export function distanceMeters(from: GeoPoint, to: GeoPoint): number {
  const lat1 = toRadians(from.latitude)
  const lat2 = toRadians(to.latitude)
  const deltaLat = lat2 - lat1
  const deltaLon = toRadians(to.longitude - from.longitude)
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Initial bearing in degrees clockwise from true north, 0–360. */
export function bearingDegrees(from: GeoPoint, to: GeoPoint): number {
  const lat1 = toRadians(from.latitude)
  const lat2 = toRadians(to.latitude)
  const deltaLon = toRadians(to.longitude - from.longitude)
  const y = Math.sin(deltaLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon)
  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const

/** The 16-point name for a bearing — "NNE" reads faster than "27°". */
export function compassPoint(bearing: number): string {
  const normalized = ((bearing % 360) + 360) % 360
  return COMPASS_POINTS[Math.round(normalized / 22.5) % 16]!
}

export interface DistanceReading {
  value: string
  unit: 'm' | 'km'
}

/**
 * Distance shown at the precision it is actually known to. Metres below a
 * kilometre, then kilometres — one decimal while the number is small enough
 * for it to mean anything, whole kilometres after that.
 */
export function formatDistance(meters: number): DistanceReading {
  if (!Number.isFinite(meters) || meters < 0) return { value: '—', unit: 'm' }
  if (meters < 1000) return { value: String(Math.round(meters)), unit: 'm' }
  const km = meters / 1000
  if (km < 100) return { value: km.toFixed(1), unit: 'km' }
  return { value: String(Math.round(km)), unit: 'km' }
}

/* ------------------------------------------------------------- notations */

export type CoordinateNotation = 'decimal' | 'dms' | 'geo'

const NOTATIONS: readonly CoordinateNotation[] = ['decimal', 'dms', 'geo']

export function coordinateNotation(raw: unknown): CoordinateNotation {
  return typeof raw === 'string' && NOTATIONS.includes(raw as CoordinateNotation)
    ? raw as CoordinateNotation
    : 'decimal'
}

export function nextNotation(current: CoordinateNotation): CoordinateNotation {
  return NOTATIONS[(NOTATIONS.indexOf(current) + 1) % NOTATIONS.length]!
}

export const NOTATION_LABELS: Record<CoordinateNotation, string> = {
  decimal: 'Decimal',
  dms: 'D° M′ S″',
  geo: 'Geo URI',
}

function degreesMinutesSeconds(value: number, positive: string, negative: string): string {
  const hemisphere = value >= 0 ? positive : negative
  const absolute = Math.abs(value)
  const degrees = Math.floor(absolute)
  const minutesFloat = (absolute - degrees) * 60
  const minutes = Math.floor(minutesFloat)
  const seconds = (minutesFloat - minutes) * 60
  return `${degrees}° ${String(minutes).padStart(2, '0')}′ ${seconds.toFixed(1).padStart(4, '0')}″ ${hemisphere}`
}

/** The same point written the way the reader asked for it. */
export function formatCoordinates(point: GeoPoint, notation: CoordinateNotation): string {
  if (notation === 'dms') {
    return `${degreesMinutesSeconds(point.latitude, 'N', 'S')}  ${degreesMinutesSeconds(point.longitude, 'E', 'W')}`
  }
  if (notation === 'geo') {
    return `geo:${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`
  }
  return `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`
}

/**
 * The one map address this widget ever produces, matching the `mapUrl` field.
 * A skin that remembers a framing passes it, so the map opens looking like
 * the card did; every other skin gets the street-level default.
 */
export function mapUrl(point: GeoPoint, zoom = 15): string {
  return `https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=${zoom}/${point.latitude}/${point.longitude}`
}

/* ------------------------------------------------------------------ time */

export interface ZonedReading {
  /** False when the stored timezone is not one this device recognizes. */
  valid: boolean
  /** Hours and minutes at the place, zero-padded. */
  time: string
  seconds: string
  /** "Fri 25 Jul" at the place — it is often not the reader's date. */
  date: string
  /** Minutes the place is ahead of (positive) or behind the reader. */
  offsetMinutes: number
  /** Plain words for that difference: "3h ahead", "same time as you". */
  offsetLabel: string
  /** 0–1 through the local day, for the day arc. */
  dayFraction: number
}

interface ZoneClock {
  minutesOfDay: number
  seconds: number
  /** Minutes the zone is ahead of UTC. */
  offsetMinutes: number
  year: number
  month: number
  day: number
}

const ZONE_FORMAT_CACHE = new Map<string, Intl.DateTimeFormat | null>()

function zoneFormatter(timezone: string): Intl.DateTimeFormat | null {
  const cached = ZONE_FORMAT_CACHE.get(timezone)
  if (cached !== undefined) return cached
  let formatter: Intl.DateTimeFormat | null = null
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    // An unrecognized zone is data, not a crash: the card falls back to the
    // reader's own clock and says so.
    formatter = null
  }
  ZONE_FORMAT_CACHE.set(timezone, formatter)
  return formatter
}

function zoneClock(timezone: string, at: number): ZoneClock | null {
  const formatter = zoneFormatter(timezone)
  if (!formatter) return null
  const parts = new Map<string, string>(
    formatter.formatToParts(new Date(at)).map((part) => [part.type as string, part.value]),
  )
  const number = (type: string) => Number(parts.get(type))
  const year = number('year')
  const month = number('month')
  const day = number('day')
  const hour = number('hour')
  const minute = number('minute')
  const second = number('second')
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  return {
    minutesOfDay: hour * 60 + minute,
    seconds: second,
    // Rounded to the minute: zone offsets are whole minutes, and the
    // millisecond remainder is only the sub-second part of `at`.
    offsetMinutes: Math.round((asUtc - Math.floor(at / 1000) * 1000) / 60_000),
    year,
    month,
    day,
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function offsetWords(minutes: number): string {
  if (minutes === 0) return 'Same time as you'
  const ahead = minutes > 0
  const absolute = Math.abs(minutes)
  const hours = Math.floor(absolute / 60)
  const rest = absolute % 60
  const span = hours === 0 ? `${rest}m` : rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
  return `${span} ${ahead ? 'ahead of' : 'behind'} you`
}

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * What the clock says at this place right now, and how far that is from the
 * reader's own clock. `at` is passed in so the whole reading stays pure.
 */
export function zonedReading(timezone: string, at: number): ZonedReading {
  const place = zoneClock(timezone, at)
  const here = zoneClock(readerTimezone(), at)
  if (!place) {
    const local = new Date(at)
    return {
      valid: false,
      time: `${pad(local.getHours())}:${pad(local.getMinutes())}`,
      seconds: pad(local.getSeconds()),
      date: `${WEEKDAYS[local.getDay()]} ${local.getDate()} ${MONTHS[local.getMonth()]}`,
      offsetMinutes: 0,
      offsetLabel: 'Unknown timezone',
      dayFraction: (local.getHours() * 60 + local.getMinutes()) / 1440,
    }
  }
  const offsetMinutes = place.offsetMinutes - (here?.offsetMinutes ?? place.offsetMinutes)
  // Day-of-week from the place's own calendar date, never the reader's.
  const weekday = new Date(Date.UTC(place.year, place.month - 1, place.day)).getUTCDay()
  return {
    valid: true,
    time: `${pad(Math.floor(place.minutesOfDay / 60))}:${pad(place.minutesOfDay % 60)}`,
    seconds: pad(place.seconds),
    date: `${WEEKDAYS[weekday]} ${place.day} ${MONTHS[place.month - 1]}`,
    offsetMinutes,
    offsetLabel: offsetWords(offsetMinutes),
    dayFraction: place.minutesOfDay / 1440,
  }
}

function readerTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/* ------------------------------------------------------------------- sun */

export interface SunReading {
  /** 'day' and 'night' carry real times; the polar kinds have none. */
  kind: 'day' | 'night' | 'polar_day' | 'polar_night'
  /** Minutes past local midnight at the place, when the kind has them. */
  sunriseMinutes: number | null
  sunsetMinutes: number | null
  sunrise: string | null
  sunset: string | null
}

/**
 * Sunrise and sunset at this place, from the standard low-precision solar
 * position equations (NOAA). Accurate to about a minute, which is far more
 * than a card that says "it is dark there" needs, and it means day and night
 * are computed from the place's real latitude rather than an assumed 6-to-6.
 */
export function sunReading(point: GeoPoint, timezone: string, at: number): SunReading {
  const clock = zoneClock(timezone, at)
  const offsetMinutes = clock?.offsetMinutes ?? -new Date(at).getTimezoneOffset()
  const utc = new Date(at)
  const dayOfYear = Math.floor(
    (Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()) - Date.UTC(utc.getUTCFullYear(), 0, 0))
    / 86_400_000,
  )

  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1)
  const equationOfTime = 229.18 * (
    0.000075
    + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma)
  )
  const declination = 0.006918
    - 0.399912 * Math.cos(gamma)
    + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma)
    + 0.001480 * Math.sin(3 * gamma)

  const latitude = toRadians(point.latitude)
  const zenith = toRadians(90.833)
  const cosHourAngle = (Math.cos(zenith) / (Math.cos(latitude) * Math.cos(declination)))
    - Math.tan(latitude) * Math.tan(declination)

  const nightKind: SunReading = {
    kind: 'polar_night',
    sunriseMinutes: null,
    sunsetMinutes: null,
    sunrise: null,
    sunset: null,
  }
  if (cosHourAngle > 1) return nightKind
  if (cosHourAngle < -1) return { ...nightKind, kind: 'polar_day' }

  const hourAngle = toDegrees(Math.acos(cosHourAngle))
  const noonUtc = 720 - 4 * point.longitude - equationOfTime
  const wrap = (minutes: number) => ((minutes % 1440) + 1440) % 1440
  const sunriseMinutes = wrap(noonUtc - 4 * hourAngle + offsetMinutes)
  const sunsetMinutes = wrap(noonUtc + 4 * hourAngle + offsetMinutes)

  const nowMinutes = clock
    ? clock.minutesOfDay
    : utc.getUTCHours() * 60 + utc.getUTCMinutes() + offsetMinutes
  const daylight = sunriseMinutes <= sunsetMinutes
    ? nowMinutes >= sunriseMinutes && nowMinutes < sunsetMinutes
    // Daylight crossing local midnight, which happens near the date line.
    : nowMinutes >= sunriseMinutes || nowMinutes < sunsetMinutes

  // Rounded to the minute before splitting, so 05:59.7 reads 06:00 rather
  // than the 05:00 a separate floor-and-round would have produced.
  const clockText = (minutes: number) => {
    const whole = Math.round(minutes) % 1440
    return `${pad(Math.floor(whole / 60))}:${pad(whole % 60)}`
  }
  return {
    kind: daylight ? 'day' : 'night',
    sunriseMinutes,
    sunsetMinutes,
    sunrise: clockText(sunriseMinutes),
    sunset: clockText(sunsetMinutes),
  }
}

/* -------------------------------------------------------------- geofence */

export const GEOFENCE_MIN_M = 25
export const GEOFENCE_MAX_M = 50_000
export const GEOFENCE_DEFAULT_M = 250

/** Fence presets that cover the honest range of a phone's accuracy upward. */
export const GEOFENCE_PRESETS = [
  { meters: 100, label: '100 m' },
  { meters: 500, label: '500 m' },
  { meters: 2000, label: '2 km' },
  { meters: 10_000, label: '10 km' },
] as const

export function geofenceRadius(state: Record<string, unknown>): number {
  const raw = state.radiusMeters
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return GEOFENCE_DEFAULT_M
  return Math.min(GEOFENCE_MAX_M, Math.max(GEOFENCE_MIN_M, Math.round(raw)))
}

export interface FenceVerdict {
  inside: boolean
  /** Metres from the fence line — positive outside, positive inside too; the
   *  `inside` flag says which side of it the reading is on. */
  edgeMeters: number
  distanceMeters: number
}

export function fenceVerdict(center: GeoPoint, reading: GeoPoint, radius: number): FenceVerdict {
  const meters = distanceMeters(center, reading)
  return {
    inside: meters <= radius,
    edgeMeters: Math.abs(radius - meters),
    distanceMeters: meters,
  }
}

/* ----------------------------------------------------------------- route */

export interface RouteStop {
  id: string
  label: string
  latitude: number | null
  longitude: number | null
}

const MAX_STOPS = 12

function stopId(raw: unknown, index: number): string {
  return typeof raw === 'string' && raw ? raw : `stop-${index}`
}

function stopCoordinate(raw: unknown, limit: number): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  return Math.min(limit, Math.max(-limit, raw))
}

/**
 * Stops as stored, made safe to render. Persisted board data is untrusted —
 * a stop with no coordinates is kept (it is a place someone has named but not
 * yet located) and simply contributes no leg.
 */
export function routeStops(state: Record<string, unknown>): RouteStop[] {
  const raw = state.stops
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_STOPS).map((entry, index) => {
    const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    return {
      id: stopId(row.id, index),
      label: typeof row.label === 'string' ? row.label.slice(0, 60) : '',
      latitude: stopCoordinate(row.latitude, 90),
      longitude: stopCoordinate(row.longitude, 180),
    }
  })
}

export function canAddStop(stops: readonly RouteStop[]): boolean {
  return stops.length < MAX_STOPS
}

export interface RouteLeg {
  id: string
  /** The stop this leg arrives at. */
  label: string
  /** Null while either end of the leg has no coordinates yet. */
  meters: number | null
  bearing: number | null
}

export interface RouteReading {
  legs: RouteLeg[]
  /** Sum of the legs that are actually locatable. */
  totalMeters: number
  /** Stops still missing coordinates, so the total can be honest about itself. */
  unlocated: number
}

/**
 * Leg-by-leg distances from the card's own pin through every stop in order.
 * Great-circle again: this is the shape of the journey, not its driving time.
 */
export function routeReading(origin: GeoPoint | null, stops: readonly RouteStop[]): RouteReading {
  const legs: RouteLeg[] = []
  let previous = origin
  let totalMeters = 0
  let unlocated = 0

  for (const stop of stops) {
    const point = locationPoint(stop)
    if (!point) unlocated += 1
    const from = previous
    const meters = from && point ? distanceMeters(from, point) : null
    if (meters !== null) totalMeters += meters
    legs.push({
      id: stop.id,
      label: stop.label,
      meters,
      bearing: from && point ? bearingDegrees(from, point) : null,
    })
    if (point) previous = point
  }

  return { legs, totalMeters, unlocated }
}

/* ------------------------------------------------------------------- map */

/**
 * The Map skin's geography: enough Web Mercator to draw a place on a slippy
 * map and to move the pin by dragging that map instead of typing numbers.
 *
 * Every function here is pure and pixel-agnostic — it is handed a viewport
 * size and hands back positions inside it. The renderer owns the drag, the
 * image loading, and the canvas scale; this file owns the projection.
 */

export const MAP_TILE_PX = 256
export const MAP_MIN_ZOOM = 2
export const MAP_MAX_ZOOM = 19
export const MAP_DEFAULT_ZOOM = 15

/** Mercator cannot reach the poles; this is where the projection is cut. */
const MERCATOR_LIMIT = 85.05112878

/** A wide view of the inhabited world, for a card that holds no place yet. */
export const MAP_OPENING_VIEW: GeoPoint = { latitude: 25, longitude: 10 }
export const MAP_OPENING_ZOOM = 3

export function clampZoom(raw: number): number {
  if (!Number.isFinite(raw)) return MAP_DEFAULT_ZOOM
  return Math.min(MAP_MAX_ZOOM, Math.max(MAP_MIN_ZOOM, Math.round(raw)))
}

/** The framing this card was left at. Persisted board data is untrusted. */
export function mapZoom(state: Record<string, unknown>): number {
  const raw = state.zoom
  return typeof raw === 'number' ? clampZoom(raw) : MAP_DEFAULT_ZOOM
}

const ZOOM_WORDS: readonly (readonly [number, string])[] = [
  [17, 'Building'],
  [15, 'Street'],
  [13, 'Neighbourhood'],
  [10, 'City'],
  [7, 'Region'],
  [0, 'Country'],
]

/**
 * What a zoom level means in words. The whole point of this skin is that the
 * card remembers a framing rather than a number, so the framing needs a name
 * a person would use.
 */
export function zoomFraming(zoom: number): string {
  const clamped = clampZoom(zoom)
  return ZOOM_WORDS.find(([from]) => clamped >= from)![1]
}

/* -------------------------------------------------------- the projection */

/** Fractional tile column for a longitude, 0 at the antimeridian. */
export function tileX(longitude: number, zoom: number): number {
  return ((longitude + 180) / 360) * 2 ** zoom
}

/** Fractional tile row for a latitude, 0 at the top of the projection. */
export function tileY(latitude: number, zoom: number): number {
  const clamped = Math.min(MERCATOR_LIMIT, Math.max(-MERCATOR_LIMIT, latitude))
  const radians = toRadians(clamped)
  const mercator = Math.log(Math.tan(radians) + 1 / Math.cos(radians))
  return ((1 - mercator / Math.PI) / 2) * 2 ** zoom
}

export function tileLongitude(x: number, zoom: number): number {
  return (x / 2 ** zoom) * 360 - 180
}

export function tileLatitude(y: number, zoom: number): number {
  const n = Math.PI * (1 - (2 * y) / 2 ** zoom)
  return toDegrees(Math.atan(Math.sinh(n)))
}

/** Longitude folded back into −180…180, so panning east forever still maps. */
export function wrapLongitude(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180
}

/**
 * One raster tile from OpenStreetMap. The column wraps around the world so a
 * view straddling the antimeridian still asks for tiles that exist.
 */
export function tileUrl(x: number, y: number, zoom: number): string {
  const span = 2 ** zoom
  const column = ((Math.floor(x) % span) + span) % span
  return `https://tile.openstreetmap.org/${zoom}/${column}/${Math.floor(y)}.png`
}

export interface MapTile {
  key: string
  url: string
  /** Pixel offset of the tile's top-left corner inside the viewport. */
  left: number
  top: number
}

/**
 * A hard ceiling on how many tiles one card may ask for. A card cannot get
 * big enough to need this; a mismeasured viewport could, and asking a public
 * tile server for hundreds of images because of a layout bug is not on.
 */
const MAX_TILES = 48

/** Every tile needed to cover a viewport of this size centred on this point. */
export function mapTiles(
  centre: GeoPoint,
  zoom: number,
  width: number,
  height: number,
): MapTile[] {
  if (!(width > 0) || !(height > 0)) return []
  const span = 2 ** zoom
  // Tile-space coordinate of the viewport's top-left corner.
  const originX = tileX(centre.longitude, zoom) - width / 2 / MAP_TILE_PX
  const originY = tileY(centre.latitude, zoom) - height / 2 / MAP_TILE_PX
  const tiles: MapTile[] = []

  for (let y = Math.floor(originY); (y - originY) * MAP_TILE_PX < height; y += 1) {
    // Above the north edge or below the south edge there is no map to fetch.
    if (y < 0 || y >= span) continue
    for (let x = Math.floor(originX); (x - originX) * MAP_TILE_PX < width; x += 1) {
      if (tiles.length >= MAX_TILES) return tiles
      tiles.push({
        key: `${zoom}/${x}/${y}`,
        url: tileUrl(x, y, zoom),
        left: Math.round((x - originX) * MAP_TILE_PX),
        top: Math.round((y - originY) * MAP_TILE_PX),
      })
    }
  }
  return tiles
}

export interface ViewportPoint {
  left: number
  top: number
  onScreen: boolean
}

/** Where a point falls inside a viewport centred somewhere else. */
export function projectPoint(
  point: GeoPoint,
  centre: GeoPoint,
  zoom: number,
  width: number,
  height: number,
): ViewportPoint {
  const span = 2 ** zoom
  let dx = tileX(point.longitude, zoom) - tileX(centre.longitude, zoom)
  // Cross the antimeridian the short way round, so a pin a degree away never
  // flies the width of the world to get drawn.
  if (dx > span / 2) dx -= span
  if (dx < -span / 2) dx += span
  const dy = tileY(point.latitude, zoom) - tileY(centre.latitude, zoom)
  const left = width / 2 + dx * MAP_TILE_PX
  const top = height / 2 + dy * MAP_TILE_PX
  return {
    left,
    top,
    onScreen: left >= 0 && left <= width && top >= 0 && top <= height,
  }
}

/**
 * The new centre after dragging the map by a pixel delta. Dragging content to
 * the right walks the centre west, which is why the deltas subtract.
 */
export function panned(centre: GeoPoint, zoom: number, dxPx: number, dyPx: number): GeoPoint {
  const span = 2 ** zoom
  const x = tileX(centre.longitude, zoom) - dxPx / MAP_TILE_PX
  // North and south stop at the edge of the projection rather than wrapping:
  // dragging past the pole and arriving at the other one is nobody's intent.
  const y = Math.min(span, Math.max(0, tileY(centre.latitude, zoom) - dyPx / MAP_TILE_PX))
  return {
    latitude: tileLatitude(y, zoom),
    longitude: wrapLongitude(tileLongitude(x, zoom)),
  }
}

/** Ground distance one screen pixel covers, which is what a scale bar is. */
export function metersPerPixel(latitude: number, zoom: number): number {
  const clamped = Math.min(MERCATOR_LIMIT, Math.max(-MERCATOR_LIMIT, latitude))
  return (156_543.03392 * Math.cos(toRadians(clamped))) / 2 ** zoom
}

const SCALE_STEPS = [
  10, 20, 50, 100, 200, 500,
  1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000,
] as const

export interface ScaleBar {
  widthPx: number
  label: string
}

/** The longest round distance that still fits in `maxPx`, and how wide it is. */
export function mapScaleBar(latitude: number, zoom: number, maxPx: number): ScaleBar {
  const perPixel = metersPerPixel(latitude, zoom)
  let chosen: number = SCALE_STEPS[0]
  for (const step of SCALE_STEPS) {
    if (step / perPixel > maxPx) break
    chosen = step
  }
  const reading = formatDistance(chosen)
  return {
    widthPx: Math.round(chosen / perPixel),
    label: `${reading.value} ${reading.unit}`,
  }
}

/* ------------------------------------------------------------------ misc */

/** How fresh a capture is, in the plainest words available. */
export function capturedAgo(capturedAt: number | null, at: number): string {
  if (!capturedAt || !Number.isFinite(capturedAt)) return 'Never captured'
  const seconds = Math.max(0, Math.round((at - capturedAt) / 1000))
  if (seconds < 45) return 'Just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'Yesterday' : `${days} days ago`
}

/** The card's own words for the place, for the resting tile and headers. */
export function placeName(label: string, address: string): string {
  const trimmed = label.trim()
  if (trimmed) return trimmed
  const fallback = address.trim()
  return fallback || 'Untitled place'
}
