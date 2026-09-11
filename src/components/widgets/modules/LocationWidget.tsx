import {
  Check, ChevronDown, ChevronUp, Compass, Copy, Crosshair, ExternalLink,
  LocateFixed, Map as MapGlyph, MapPin, Minus, Moon, Plus, Radar, Route, Sun,
  Sunrise, Sunset, Trash2,
} from 'lucide-react'
import {
  useCallback, useEffect, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useSharedClock } from '../../../hooks/useSharedClock'
import { useTransientValue } from '../../../hooks/useTransientValue'
import type { LocationData } from '../../../types/widgetDataExpansion'
import type { ModuleData } from '../../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'
import {
  bearingDegrees,
  canAddStop,
  capturedAgo,
  compassPoint,
  coordinateNotation,
  distanceMeters,
  fenceVerdict,
  formatCoordinates,
  formatDistance,
  GEOFENCE_MAX_M,
  GEOFENCE_MIN_M,
  GEOFENCE_PRESETS,
  geofenceRadius,
  locationPoint,
  MAP_DEFAULT_ZOOM,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  MAP_OPENING_VIEW,
  MAP_OPENING_ZOOM,
  mapScaleBar,
  mapTiles,
  mapUrl,
  mapZoom,
  NOTATION_LABELS,
  panned,
  projectPoint,
  placeName,
  routeReading,
  routeStops,
  sunReading,
  zonedReading,
  zoomFraming,
  type CoordinateNotation,
  type GeoPoint,
  type LocationSkinMode,
  type RouteStop,
} from './locationSkinModel'

interface LocationWidgetProps {
  data: LocationData
  onChange: (data: LocationData) => void
  skin?: LocationSkinMode
}

/** A reading from this device, held only while the card is mounted. */
interface DeviceFix extends GeoPoint {
  accuracy: number | null
  at: number
}

type Patch = (next: Partial<LocationData>) => void

/**
 * The viewport size assumed before the box has been measured — and the only
 * size it ever has on the server, where there is no layout to observe.
 */
const FALLBACK_BOX = { width: 320, height: 180 }

/* ------------------------------------------------------------------ device */

/**
 * The browser's own position, as local UI state. A refused permission, a
 * device with no sensor, and a timeout are all ordinary outcomes here: none
 * of them may disturb the stored place, so nothing from this hook is written
 * to the board unless the person presses a button that says it will be.
 */
function useDeviceLocation() {
  const [fix, setFix] = useState<DeviceFix | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [following, setFollowing] = useState(false)
  const watchRef = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation?.clearWatch(watchRef.current)
      watchRef.current = null
    }
    setFollowing(false)
  }, [])

  // The watch is this component's own listener, so unmounting disposes it.
  useEffect(() => stop, [stop])

  const unavailable = useCallback(() => {
    setPending(false)
    setError('Location is unavailable in this browser.')
    return false
  }, [])

  const locate = useCallback((onFix?: (fix: DeviceFix) => void) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return unavailable()
    setError('')
    setPending(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPending(false)
        const next: DeviceFix = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          at: Date.now(),
        }
        setFix(next)
        onFix?.(next)
      },
      (failure) => {
        setPending(false)
        setError(failure.message || 'Location permission was not granted.')
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    )
    return true
  }, [unavailable])

  const follow = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return unavailable()
    setError('')
    setFollowing(true)
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => setFix({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        at: Date.now(),
      }),
      (failure) => {
        setError(failure.message || 'Location permission was not granted.')
        stop()
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    )
    return true
  }, [stop, unavailable])

  return { fix, error, pending, following, locate, follow, stop }
}

/* ------------------------------------------------------------------ shared */

/** The place's own name. Every skin carries it; only the placement changes. */
function PlaceName({
  value,
  onChange,
  size = 'regular',
}: {
  value: string
  onChange: (value: string) => void
  size?: 'regular' | 'small'
}) {
  return (
    <div className="gp-loc-name gp-bare-field" data-size={size}>
      <input
        value={value}
        aria-label="Place name"
        placeholder="Name this place"
        data-floor-overflow="scroll"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

/** One coordinate, typed by hand — the manual half of "capture or enter". */
function CoordinateInput({
  label,
  short,
  value,
  limit,
  onChange,
}: {
  label: string
  /** Printed instead of `label` where a row has no width for the full name;
   *  `label` still names the field for screen readers. */
  short?: string
  value: number | null
  limit: number
  onChange: (value: number | null) => void
}) {
  return (
    <label className="gp-loc-coord gp-bare-field">
      <span className="gp-loc-coord-label">{short ?? label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        min={-limit}
        max={limit}
        aria-label={label}
        placeholder="—"
        value={value === null ? '' : value}
        onChange={(event) => {
          const raw = event.target.value
          if (raw === '') return onChange(null)
          const parsed = Number(raw)
          if (!Number.isFinite(parsed)) return
          onChange(Math.min(limit, Math.max(-limit, parsed)))
        }}
      />
    </label>
  )
}

function CoordinatePair({ data, patch }: { data: LocationData; patch: Patch }) {
  return (
    <div className="gp-loc-coords">
      <CoordinateInput
        label="Latitude"
        limit={90}
        value={data.latitude}
        onChange={(latitude) => patch({ latitude })}
      />
      <CoordinateInput
        label="Longitude"
        limit={180}
        value={data.longitude}
        onChange={(longitude) => patch({ longitude })}
      />
    </div>
  )
}

function MapLink({
  point,
  compact = false,
  zoom,
}: {
  point: GeoPoint
  compact?: boolean
  /** The framing to open at, for a skin that remembers one. */
  zoom?: number
}) {
  return (
    <a
      className="gp-loc-btn"
      href={mapUrl(point, zoom)}
      target="_blank"
      rel="noreferrer"
      title="Open this point on OpenStreetMap"
    >
      <ExternalLink size={12} aria-hidden />
      {compact ? <span className="gp-loc-sr">Open map</span> : 'Map'}
    </a>
  )
}

/**
 * The one button that writes a device reading into the stored place. It is
 * always explicit: nothing this card does moves the pin without a press.
 */
function CaptureButton({
  onCapture,
  pending,
  label = 'Use my location',
}: {
  onCapture: () => void
  pending: boolean
  label?: string
}) {
  return (
    <button type="button" className="gp-loc-btn gp-loc-btn--primary" onClick={onCapture} data-pending={pending || undefined}>
      <LocateFixed size={12} aria-hidden />
      {pending ? 'Locating…' : label}
    </button>
  )
}

function Notice({ message }: { message: string }) {
  if (!message) return null
  return <p role="alert" className="gp-loc-notice">{message}</p>
}

/** Accuracy and freshness — the two things that decide whether to trust a pin. */
function Provenance({ data, now }: { data: LocationData; now: number }) {
  const accuracy = typeof data.accuracyMeters === 'number' && Number.isFinite(data.accuracyMeters)
    ? `±${Math.round(data.accuracyMeters)} m`
    : null
  return (
    <p className="gp-loc-provenance">
      <span>{capturedAgo(data.capturedAt, now)}</span>
      {accuracy && <span className="gp-loc-dot" aria-hidden />}
      {accuracy && <span>{accuracy}</span>}
    </p>
  )
}

function EmptyPrompt({
  message,
  onCapture,
  pending,
}: {
  message: string
  onCapture: () => void
  pending: boolean
}) {
  return (
    <div className="gp-loc-empty">
      <MapPin size={18} aria-hidden />
      <p>{message}</p>
      <CaptureButton onCapture={onCapture} pending={pending} />
    </div>
  )
}

/* ------------------------------------------------------------------- skins */

function PinSkin({ data, patch, capture, device }: SkinProps) {
  const point = locationPoint(data)
  const now = useSharedClock(60_000)

  return (
    <div className="gp-loc gp-loc--pin">
      <header className="gp-loc-head">
        <span className="gp-loc-glyph" aria-hidden><MapPin size={14} /></span>
        <PlaceName value={data.label} onChange={(label) => patch({ label })} />
      </header>

      <div className="gp-loc-address gp-bare-field">
        <input
          value={data.address}
          aria-label="Address or note"
          placeholder="Address, floor, landmark…"
          onChange={(event) => patch({ address: event.target.value })}
        />
      </div>

      <CoordinatePair data={data} patch={patch} />
      <Provenance data={data} now={now} />

      <footer className="gp-loc-actions">
        <CaptureButton onCapture={capture} pending={device.pending} />
        {point && <MapLink point={point} />}
        {point && (
          <button
            type="button"
            className="gp-loc-btn"
            title="Clear the captured coordinates"
            onClick={() => patch({ latitude: null, longitude: null, accuracyMeters: null, capturedAt: null })}
          >
            <Trash2 size={12} aria-hidden />
            <span className="gp-loc-sr">Clear</span>
          </button>
        )}
      </footer>

      <Notice message={device.error} />
    </div>
  )
}

function CoordinatesSkin({ data, patch, capture, device, state, setState }: SkinProps) {
  const point = locationPoint(data)
  const notation = coordinateNotation(state.notation)
  const [copied, showCopied] = useTransientValue(false)
  const now = useSharedClock(60_000)

  const copy = () => {
    if (!point) return
    void navigator.clipboard?.writeText(formatCoordinates(point, notation))
    showCopied(true, 1600)
  }

  return (
    <div className="gp-loc gp-loc--coordinates">
      <header className="gp-loc-head">
        <span className="gp-loc-glyph" aria-hidden><Crosshair size={14} /></span>
        <PlaceName size="small" value={data.label} onChange={(label) => patch({ label })} />
      </header>

      <div className="gp-loc-notations" role="group" aria-label="Coordinate notation">
        {(Object.keys(NOTATION_LABELS) as CoordinateNotation[]).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={notation === option}
            onClick={() => setState({ ...state, notation: option })}
          >
            {NOTATION_LABELS[option]}
          </button>
        ))}
      </div>

      {point ? (
        <output className="gp-loc-readout" data-notation={notation}>
          {notation === 'decimal' ? (
            <>
              <span><em>LAT</em>{point.latitude.toFixed(6)}</span>
              <span><em>LON</em>{point.longitude.toFixed(6)}</span>
            </>
          ) : (
            <span className="gp-loc-readout-line">{formatCoordinates(point, notation)}</span>
          )}
        </output>
      ) : (
        <div className="gp-loc-readout" data-empty>
          <span className="gp-loc-readout-line">No coordinates yet</span>
        </div>
      )}

      <CoordinatePair data={data} patch={patch} />
      <Provenance data={data} now={now} />

      <footer className="gp-loc-actions">
        <button
          type="button"
          className="gp-loc-btn gp-loc-btn--primary"
          onClick={copy}
          disabled={!point}
        >
          {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <CaptureButton onCapture={capture} pending={device.pending} label="Capture" />
        {point && <MapLink point={point} />}
      </footer>

      <Notice message={device.error} />
    </div>
  )
}

/** The horizon arc: where the sun is in this place's own day. */
function DayArc({
  sunrise,
  sunset,
  progress,
  daylight,
}: {
  sunrise: string | null
  sunset: string | null
  progress: number | null
  daylight: boolean
}) {
  const angle = Math.PI * Math.min(1, Math.max(0, progress ?? 0))
  const x = 100 - 84 * Math.cos(angle)
  const y = daylight ? 80 - 60 * Math.sin(angle) : 80 + 26 * Math.sin(angle)

  return (
    <div className="gp-loc-arc gp-flat-visual-own">
      <svg viewBox="0 0 200 112" role="presentation" aria-hidden focusable="false">
        <defs>
          <linearGradient id="gp-loc-arc-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.42" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path d="M16 80 A 84 60 0 0 1 184 80" fill="none" stroke="url(#gp-loc-arc-sky)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="6" y1="80" x2="194" y2="80" className="gp-loc-arc-horizon" strokeWidth="1" strokeLinecap="round" />
        {progress !== null && (
          <g className="gp-loc-arc-body" data-night={!daylight || undefined}>
            <circle cx={x} cy={y} r="11" className="gp-loc-arc-halo" />
            <circle cx={x} cy={y} r="5.5" className="gp-loc-arc-core" />
          </g>
        )}
      </svg>
      <div className="gp-loc-arc-ends">
        <span><Sunrise size={10} aria-hidden />{sunrise ?? '—'}</span>
        <span>{sunset ?? '—'}<Sunset size={10} aria-hidden /></span>
      </div>
    </div>
  )
}

function LocalTimeSkin({ data, patch, capture, device }: SkinProps) {
  const now = useSharedClock(1000, true, true)
  const reading = zonedReading(data.timezone, now)
  const point = locationPoint(data)
  const sun = point ? sunReading(point, data.timezone, now) : null
  const daylight = sun ? sun.kind === 'day' || sun.kind === 'polar_day' : true

  const minutesNow = Number(reading.time.slice(0, 2)) * 60 + Number(reading.time.slice(3, 5))
  const progress = sun && sun.sunriseMinutes !== null && sun.sunsetMinutes !== null
    ? arcProgress(minutesNow, sun.sunriseMinutes, sun.sunsetMinutes, daylight)
    : null

  return (
    <div className="gp-loc gp-loc--time" data-night={!daylight || undefined}>
      <header className="gp-loc-head">
        <span className="gp-loc-glyph" aria-hidden>{daylight ? <Sun size={14} /> : <Moon size={14} />}</span>
        <PlaceName size="small" value={data.label} onChange={(label) => patch({ label })} />
      </header>

      <output className="gp-loc-clock">
        <strong>{reading.time}</strong>
        <span className="gp-loc-clock-seconds">{reading.seconds}</span>
      </output>
      <p className="gp-loc-clock-sub">
        <span>{reading.date}</span>
        <span className="gp-loc-dot" aria-hidden />
        <span>{reading.offsetLabel}</span>
      </p>

      {point ? (
        <DayArc
          sunrise={sun?.sunrise ?? null}
          sunset={sun?.sunset ?? null}
          progress={progress}
          daylight={daylight}
        />
      ) : (
        <p className="gp-loc-hint">Capture coordinates to see sunrise and sunset here.</p>
      )}

      <div className="gp-loc-zone gp-bare-field">
        <span className="gp-loc-coord-label">Timezone</span>
        <input
          value={data.timezone}
          aria-label="Timezone"
          placeholder="Region/City"
          data-invalid={!reading.valid || undefined}
          onChange={(event) => patch({ timezone: event.target.value })}
        />
      </div>

      <footer className="gp-loc-actions">
        <CaptureButton onCapture={capture} pending={device.pending} label="Use my place" />
        {point && <MapLink point={point} />}
      </footer>

      <Notice message={device.error} />
    </div>
  )
}

/** 0–1 across the daylight arc, or across the night below the horizon. */
function arcProgress(
  minutesNow: number,
  sunrise: number,
  sunset: number,
  daylight: boolean,
): number {
  const span = (from: number, to: number) => ((to - from) + 1440) % 1440 || 1440
  if (daylight) {
    return Math.min(1, Math.max(0, span(sunrise, minutesNow) / span(sunrise, sunset)))
  }
  return Math.min(1, Math.max(0, span(sunset, minutesNow) / span(sunset, sunrise)))
}

function CompassSkin({ data, patch, capture, device }: SkinProps) {
  const point = locationPoint(data)
  const here = device.fix
  const bearing = point && here ? bearingDegrees(here, point) : null
  const meters = point && here ? distanceMeters(here, point) : null
  const distance = meters === null ? null : formatDistance(meters)

  if (!point) {
    return (
      <div className="gp-loc gp-loc--compass">
        <EmptyPrompt
          message="Point this card at a place first — then it will tell you how far away you are and which way to walk."
          onCapture={capture}
          pending={device.pending}
        />
        <Notice message={device.error} />
      </div>
    )
  }

  return (
    <div className="gp-loc gp-loc--compass">
      <header className="gp-loc-head">
        <span className="gp-loc-glyph" aria-hidden><Compass size={14} /></span>
        <PlaceName size="small" value={data.label} onChange={(label) => patch({ label })} />
      </header>

      <div className="gp-loc-dial gp-flat-visual-own" data-live={bearing !== null || undefined}>
        <svg viewBox="0 0 120 120" role="img" aria-label={
          bearing === null
            ? 'Compass waiting for your position'
            : `${placeName(data.label, data.address)} lies ${compassPoint(bearing)}, ${Math.round(bearing)} degrees`
        }>
          <circle cx="60" cy="60" r="52" className="gp-loc-dial-face" />
          <circle cx="60" cy="60" r="52" className="gp-loc-dial-rim" />
          {Array.from({ length: 24 }, (_, index) => {
            const angle = (index * 15 * Math.PI) / 180
            const major = index % 6 === 0
            const outer = 50
            const inner = major ? 41 : 46
            return (
              <line
                key={index}
                x1={60 + outer * Math.sin(angle)}
                y1={60 - outer * Math.cos(angle)}
                x2={60 + inner * Math.sin(angle)}
                y2={60 - inner * Math.cos(angle)}
                className={major ? 'gp-loc-tick gp-loc-tick--major' : 'gp-loc-tick'}
              />
            )
          })}
          <text x="60" y="26" className="gp-loc-dial-cardinal">N</text>
          {bearing !== null && (
            <g className="gp-loc-needle" style={{ transform: `rotate(${bearing}deg)` }}>
              <path d="M60 20 L67 64 L60 58 L53 64 Z" className="gp-loc-needle-head" />
              <path d="M60 100 L53 64 L60 58 L67 64 Z" className="gp-loc-needle-tail" />
            </g>
          )}
          <circle cx="60" cy="60" r="3.2" className="gp-loc-dial-pivot" />
        </svg>
      </div>

      <output className="gp-loc-hero">
        {distance ? (
          <>
            <strong>{distance.value}</strong>
            <span className="gp-loc-hero-unit">{distance.unit}</span>
          </>
        ) : (
          <strong className="gp-loc-hero--waiting">Waiting for you</strong>
        )}
      </output>
      <p className="gp-loc-clock-sub" data-wrap={bearing === null || undefined}>
        {bearing === null ? (
          <span>Share your position to get the bearing</span>
        ) : (
          <>
            <span>{compassPoint(bearing)} · {Math.round(bearing)}°</span>
            <span className="gp-loc-dot" aria-hidden />
            <span>as the crow flies</span>
          </>
        )}
      </p>

      <footer className="gp-loc-actions">
        <button
          type="button"
          className="gp-loc-btn gp-loc-btn--primary"
          aria-pressed={device.following}
          onClick={() => (device.following ? device.stop() : device.follow())}
        >
          <Compass size={12} aria-hidden />
          {device.following ? 'Following you' : 'Follow me'}
        </button>
        <button type="button" className="gp-loc-btn" onClick={() => device.locate()} data-pending={device.pending || undefined}>
          <Crosshair size={12} aria-hidden />
          {device.pending ? 'Locating…' : 'Locate once'}
        </button>
        <MapLink point={point} compact />
      </footer>

      <Notice message={device.error} />
    </div>
  )
}

function GeofenceSkin({ data, patch, capture, device, state, setState }: SkinProps) {
  const point = locationPoint(data)
  const radius = geofenceRadius(state)
  const here = device.fix
  const verdict = point && here ? fenceVerdict(point, here, radius) : null
  const fenceLabel = formatDistance(radius)
  const edge = formatDistance(verdict?.edgeMeters ?? 0)

  // The ring is drawn at a fixed size; your dot is placed by how far through
  // the fence you are, and pinned just outside the rim once you are beyond it.
  const ratio = verdict ? Math.min(1.28, verdict.distanceMeters / radius) : null
  const angle = point && here ? (bearingDegrees(point, here) * Math.PI) / 180 : 0
  const dotX = 60 + (ratio ?? 0) * 42 * Math.sin(angle)
  const dotY = 60 - (ratio ?? 0) * 42 * Math.cos(angle)

  if (!point) {
    return (
      <div className="gp-loc gp-loc--fence">
        <EmptyPrompt
          message="A fence needs a centre. Capture or type the coordinates this fence should sit around."
          onCapture={capture}
          pending={device.pending}
        />
        <CoordinatePair data={data} patch={patch} />
        <Notice message={device.error} />
      </div>
    )
  }

  return (
    <div className="gp-loc gp-loc--fence" data-inside={verdict?.inside || undefined}>
      <header className="gp-loc-head">
        <span className="gp-loc-glyph" aria-hidden><Radar size={14} /></span>
        <PlaceName size="small" value={data.label} onChange={(label) => patch({ label })} />
        <span className="gp-loc-chip">{fenceLabel.value} {fenceLabel.unit}</span>
      </header>

      <div className="gp-loc-ring gp-flat-visual-own">
        <svg viewBox="0 0 120 120" role="presentation" aria-hidden focusable="false">
          <circle cx="60" cy="60" r="42" className="gp-loc-ring-fence" />
          <circle cx="60" cy="60" r="28" className="gp-loc-ring-inner" />
          <circle cx="60" cy="60" r="14" className="gp-loc-ring-inner" />
          <circle cx="60" cy="60" r="3" className="gp-loc-ring-centre" />
          {ratio !== null && (
            <g className="gp-loc-ring-you" data-outside={!verdict?.inside || undefined}>
              <circle cx={dotX} cy={dotY} r="9" className="gp-loc-ring-you-halo" />
              <circle cx={dotX} cy={dotY} r="4" className="gp-loc-ring-you-core" />
            </g>
          )}
        </svg>
      </div>

      {verdict ? (
        <output className="gp-loc-verdict" data-inside={verdict.inside || undefined}>
          <strong>{verdict.inside ? 'Inside' : 'Outside'}</strong>
          <span>
            {edge.value} {edge.unit}
            {verdict.inside ? ' from the edge' : ' beyond the fence'}
          </span>
        </output>
      ) : (
        <p className="gp-loc-hint">Check your position to see which side of this fence you are on.</p>
      )}

      <div className="gp-loc-radius">
        <label className="gp-loc-radius-slider gp-bare-field">
          <span className="gp-loc-coord-label">Fence radius</span>
          <input
            type="range"
            min={GEOFENCE_MIN_M}
            max={GEOFENCE_MAX_M}
            step={25}
            value={radius}
            aria-label="Fence radius in metres"
            aria-valuetext={`${fenceLabel.value} ${fenceLabel.unit}`}
            onChange={(event) => setState({ ...state, radiusMeters: Number(event.target.value) })}
          />
        </label>
        <div className="gp-loc-presets" role="group" aria-label="Fence radius presets">
          {GEOFENCE_PRESETS.map((preset) => (
            <button
              key={preset.meters}
              type="button"
              aria-pressed={radius === preset.meters}
              onClick={() => setState({ ...state, radiusMeters: preset.meters })}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <footer className="gp-loc-actions">
        <button
          type="button"
          className="gp-loc-btn gp-loc-btn--primary"
          onClick={() => device.locate()}
          data-pending={device.pending || undefined}
        >
          <Crosshair size={12} aria-hidden />
          {device.pending ? 'Checking…' : 'Check where I am'}
        </button>
        <MapLink point={point} compact />
      </footer>

      <Notice message={device.error} />
    </div>
  )
}

function RouteSkin({ data, patch, capture, device, state, setState }: SkinProps) {
  const origin = locationPoint(data)
  const stops = routeStops(state)
  const reading = routeReading(origin, stops)
  const total = formatDistance(reading.totalMeters)

  /**
   * 'Add my position' finishes long after it was pressed, and the list stays
   * editable meanwhile. Composing the new list onto the click-time state
   * would drop every stop typed during the wait, so the write always starts
   * from the state the card holds now.
   */
  const stateRef = useRef(state)
  stateRef.current = state

  const writeStops = (next: RouteStop[]) => setState({ ...stateRef.current, stops: next })
  const editStop = (id: string, patchStop: Partial<RouteStop>) => {
    writeStops(stops.map((stop) => (stop.id === id ? { ...stop, ...patchStop } : stop)))
  }
  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= stops.length) return
    const next = [...stops]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved!)
    writeStops(next)
  }
  const addStop = (stop: Partial<RouteStop> = {}) => {
    const current = routeStops(stateRef.current)
    if (!canAddStop(current)) return
    writeStops([...current, {
      id: crypto.randomUUID(),
      label: '',
      latitude: null,
      longitude: null,
      ...stop,
    }])
  }

  return (
    <div className="gp-loc gp-loc--route">
      <header className="gp-loc-route-head">
        <span className="gp-loc-glyph" aria-hidden><Route size={14} /></span>
        <output className="gp-loc-hero gp-loc-hero--inline">
          <strong>{total.value}</strong>
          <span className="gp-loc-hero-unit">{total.unit}</span>
        </output>
        <p className="gp-loc-route-sub">
          {stops.length === 0
            ? 'No stops yet'
            : `${stops.length} stop${stops.length === 1 ? '' : 's'} as the crow flies`}
          {reading.unlocated > 0 && ` · ${reading.unlocated} unlocated`}
        </p>
      </header>

      <ol className="gp-loc-stops">
        {/* The card's own pin is the first stop, edited exactly like the
            others — a route whose start could only be captured, never typed,
            would be unfixable on a device with no location sensor. */}
        <li className="gp-loc-stop gp-loc-stop--origin">
          <span className="gp-loc-stop-rail" aria-hidden><MapPin size={11} /></span>
          <div className="gp-loc-stop-body">
            <div className="gp-loc-stop-row">
              <PlaceName size="small" value={data.label} onChange={(label) => patch({ label })} />
              <span className="gp-loc-stop-meta">Start</span>
            </div>
            <div className="gp-loc-stop-coords">
              <CoordinateInput
                label="Start latitude"
                short="Lat"
                limit={90}
                value={data.latitude}
                onChange={(latitude) => patch({ latitude })}
              />
              <CoordinateInput
                label="Start longitude"
                short="Lon"
                limit={180}
                value={data.longitude}
                onChange={(longitude) => patch({ longitude })}
              />
              <div className="gp-loc-stop-tools">
                <button
                  type="button"
                  aria-label="Use my location as the start"
                  title="Use my location as the start"
                  data-pending={device.pending || undefined}
                  onClick={capture}
                >
                  <LocateFixed size={12} aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </li>

        {stops.map((stop, index) => {
          const leg = reading.legs[index]
          const distance = leg?.meters === null || leg?.meters === undefined
            ? null
            : formatDistance(leg.meters)
          return (
            <li key={stop.id} className="gp-loc-stop">
              <span className="gp-loc-stop-rail" aria-hidden><span className="gp-loc-stop-node" /></span>
              <div className="gp-loc-stop-body">
                <div className="gp-loc-stop-row">
                  <div className="gp-loc-stop-name gp-bare-field">
                    <input
                      value={stop.label}
                      aria-label={`Stop ${index + 1} name`}
                      placeholder={`Stop ${index + 1}`}
                      onChange={(event) => editStop(stop.id, { label: event.target.value })}
                    />
                  </div>
                  <span className="gp-loc-stop-leg">
                    {distance ? `${distance.value} ${distance.unit}` : '—'}
                  </span>
                </div>
                <div className="gp-loc-stop-coords">
                  <CoordinateInput
                    label={`Stop ${index + 1} latitude`}
                    short="Lat"
                    limit={90}
                    value={stop.latitude}
                    onChange={(latitude) => editStop(stop.id, { latitude })}
                  />
                  <CoordinateInput
                    label={`Stop ${index + 1} longitude`}
                    short="Lon"
                    limit={180}
                    value={stop.longitude}
                    onChange={(longitude) => editStop(stop.id, { longitude })}
                  />
                  <div className="gp-loc-stop-tools">
                    <button type="button" aria-label={`Move stop ${index + 1} earlier`} disabled={index === 0} onClick={() => move(index, -1)}>
                      <ChevronUp size={12} aria-hidden />
                    </button>
                    <button type="button" aria-label={`Move stop ${index + 1} later`} disabled={index === stops.length - 1} onClick={() => move(index, 1)}>
                      <ChevronDown size={12} aria-hidden />
                    </button>
                    <button type="button" aria-label={`Remove stop ${index + 1}`} onClick={() => writeStops(stops.filter((row) => row.id !== stop.id))}>
                      <Trash2 size={12} aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      <footer className="gp-loc-actions">
        <button type="button" className="gp-loc-btn gp-loc-btn--primary" onClick={() => addStop()} disabled={!canAddStop(stops)}>
          <Plus size={12} aria-hidden />
          Add stop
        </button>
        <button
          type="button"
          className="gp-loc-btn"
          disabled={!canAddStop(stops)}
          data-pending={device.pending || undefined}
          onClick={() => device.locate((fix) => addStop({
            label: 'Where I am',
            latitude: fix.latitude,
            longitude: fix.longitude,
          }))}
        >
          <LocateFixed size={12} aria-hidden />
          {device.pending ? 'Locating…' : 'Add my position'}
        </button>
      </footer>

      <Notice message={device.error} />
    </div>
  )
}

/**
 * The place as a spot on a map.
 *
 * Every other skin makes you meet the place as a coordinate pair: capture it,
 * or type it. This one never shows a number. You drag the map until the
 * crosshair sits on the doorway you mean and press save, and from then on the
 * card remembers the place the way you would describe it — its name, its
 * address, and the framing you left it at, so it reopens looking like the
 * picture you recognized it by.
 *
 * The pin still moves nothing until a press: dragging changes only this
 * component's own view. Latitude and longitude stay canonical underneath, so a
 * wire reading this card cannot tell it is wearing a map.
 */
function MapSkin({ data, patch, write, capture, device, state, setState }: SkinProps) {
  const saved = locationPoint(data)
  // A card that has never held a place opens on the world rather than on a
  // street-level view of the Atlantic.
  const zoom = typeof state.zoom === 'number'
    ? mapZoom(state)
    : saved ? MAP_DEFAULT_ZOOM : MAP_OPENING_ZOOM

  const [box, setBox] = useState(FALLBACK_BOX)
  /** Where the view has been dragged to. Null means "sitting on the pin". */
  const [drift, setDrift] = useState<GeoPoint | null>(null)
  const [dragging, setDragging] = useState(false)
  const [tilesFailed, setTilesFailed] = useState(false)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ id: number; x: number; y: number; from: GeoPoint; scale: number } | null>(null)
  const everLoaded = useRef(false)
  const now = useSharedClock(60_000)

  const centre = drift ?? saved ?? MAP_OPENING_VIEW
  const tiles = tilesFailed ? [] : mapTiles(centre, zoom, box.width, box.height)
  const pin = saved ? projectPoint(saved, centre, zoom, box.width, box.height) : null
  const scale = mapScaleBar(centre.latitude, zoom, Math.min(104, Math.max(48, box.width - 32)))
  const framed = drift !== null || !saved

  // The tile grid is cut to the box's own layout size, so it has to be
  // measured rather than assumed. On the server there is nothing to measure
  // and the fallback size renders a plausible view.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry?.contentRect
      if (!rect) return
      setBox({ width: Math.round(rect.width), height: Math.round(rect.height) })
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const setZoom = (next: number) => {
    setState({ ...state, zoom: Math.min(MAP_MAX_ZOOM, Math.max(MAP_MIN_ZOOM, next)) })
  }

  /**
   * The one press that writes. What it saves is whatever the crosshair is
   * over, and it makes no accuracy claim: a spot chosen by eye is exact to
   * the eye, which is not a number of metres.
   */
  const saveSpot = () => {
    // The framing goes down with the spot. Without it a card saved from a
    // country-level view would snap to a street the instant it got
    // coordinates, throwing away the picture the place was recognized by.
    write({
      latitude: Number(centre.latitude.toFixed(6)),
      longitude: Number(centre.longitude.toFixed(6)),
      accuracyMeters: null,
      capturedAt: Date.now(),
    }, { ...state, zoom })
    setDrift(null)
  }

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const frame = frameRef.current
    if (!frame) return
    // The canvas draws cards under a zoom transform, so a pointer travels more
    // screen pixels than layout pixels. Comparing the painted box with the
    // measured one recovers that factor without reaching into the canvas store.
    const rect = frame.getBoundingClientRect()
    const factor = box.width > 0 && rect.width > 0 ? rect.width / box.width : 1
    frame.setPointerCapture(event.pointerId)
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      from: centre,
      scale: factor,
    }
    setDragging(true)
  }

  const continueDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    setDrift(panned(
      drag.from,
      zoom,
      (event.clientX - drag.x) / drag.scale,
      (event.clientY - drag.y) / drag.scale,
    ))
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id !== event.pointerId) return
    frameRef.current?.releasePointerCapture(event.pointerId)
    dragRef.current = null
    setDragging(false)
  }

  // Arrow keys pan the same map the pointer does, so the skin is operable
  // without one.
  const nudge = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 96 : 32
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    setDrift(panned(centre, zoom, move[0], move[1]))
  }

  return (
    <div className="gp-loc gp-loc--map">
      <header className="gp-loc-head">
        <span className="gp-loc-glyph" aria-hidden><MapGlyph size={14} /></span>
        <PlaceName size="small" value={data.label} onChange={(label) => patch({ label })} />
        <span className="gp-loc-chip">{zoomFraming(zoom)}</span>
      </header>

      <div
        ref={frameRef}
        className="gp-loc-map gp-flat-visual-own"
        data-widget-interactive="true"
        data-dragging={dragging || undefined}
        role="group"
        tabIndex={0}
        aria-label={saved
          ? `Map around ${placeName(data.label, data.address)}, framed at ${zoomFraming(zoom).toLowerCase()} level. Arrow keys pan.`
          : 'Map with no place saved yet. Arrow keys pan; save the spot under the crosshair.'}
        onPointerDown={beginDrag}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={nudge}
      >
        <div className="gp-loc-map-tiles" aria-hidden>
          {tiles.map((tile) => (
            <img
              key={tile.key}
              src={tile.url}
              alt=""
              draggable={false}
              style={{ left: `${tile.left}px`, top: `${tile.top}px` }}
              onLoad={() => { everLoaded.current = true }}
              onError={() => { if (!everLoaded.current) setTilesFailed(true) }}
            />
          ))}
        </div>

        {pin?.onScreen && (
          <span
            className="gp-loc-map-pin"
            style={{ left: `${pin.left}px`, top: `${pin.top}px` }}
            aria-hidden
          >
            <MapPin size={20} />
          </span>
        )}

        {framed && (
          <span className="gp-loc-map-cross" aria-hidden>
            <Crosshair size={22} />
          </span>
        )}

        <div className="gp-loc-map-zoom">
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom >= MAP_MAX_ZOOM}
            onClick={() => setZoom(zoom + 1)}
          >
            <Plus size={12} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom <= MAP_MIN_ZOOM}
            onClick={() => setZoom(zoom - 1)}
          >
            <Minus size={12} aria-hidden />
          </button>
        </div>

        <div className="gp-loc-map-foot">
          <span className="gp-loc-map-scale" style={{ width: `${scale.widthPx}px` }}>{scale.label}</span>
          {tilesFailed ? (
            <button
              type="button"
              className="gp-loc-map-credit"
              onClick={() => { everLoaded.current = false; setTilesFailed(false) }}
            >
              Map offline — retry
            </button>
          ) : (
            <a
              className="gp-loc-map-credit"
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              © OpenStreetMap
            </a>
          )}
        </div>
      </div>

      <div className="gp-loc-address gp-bare-field">
        <input
          value={data.address}
          aria-label="Address or note"
          placeholder="Address, floor, landmark…"
          onChange={(event) => patch({ address: event.target.value })}
        />
      </div>

      {saved && !framed
        ? <Provenance data={data} now={now} />
        : (
          <p className="gp-loc-hint">
            {saved
              ? 'Drag until the crosshair is on the spot, then save it here.'
              : 'Find the place on the map, or start from where you are.'}
          </p>
        )}

      <footer className="gp-loc-actions">
        {framed && (
          <button type="button" className="gp-loc-btn gp-loc-btn--primary" onClick={saveSpot}>
            <MapPin size={12} aria-hidden />
            {saved ? 'Move pin here' : 'Save this spot'}
          </button>
        )}
        {drift !== null && saved && (
          <button type="button" className="gp-loc-btn" onClick={() => setDrift(null)}>
            <Crosshair size={12} aria-hidden />
            Back to pin
          </button>
        )}
        <button
          type="button"
          className={saved || framed ? 'gp-loc-btn' : 'gp-loc-btn gp-loc-btn--primary'}
          data-pending={device.pending || undefined}
          onClick={() => {
            setDrift(null)
            if (typeof state.zoom !== 'number') setState({ ...state, zoom })
            capture()
          }}
        >
          <LocateFixed size={12} aria-hidden />
          {device.pending ? 'Locating…' : 'Use my location'}
        </button>
        {saved && <MapLink point={saved} zoom={zoom} compact />}
      </footer>

      <Notice message={device.error} />
    </div>
  )
}

/* -------------------------------------------------------------------- root */

interface SkinProps {
  data: LocationData
  patch: Patch
  /**
   * One write carrying both canonical fields and this skin's own state.
   * `patch` and `setState` each rebuild the card from the same `data`, so
   * calling them in turn would have the second silently discard the first.
   */
  write: (next: Partial<LocationData>, nextState?: WidgetSkinState) => void
  /** Writes a fresh device reading into the canonical place. */
  capture: () => void
  device: ReturnType<typeof useDeviceLocation>
  state: WidgetSkinState
  setState: (next: WidgetSkinState) => void
}

/**
 * One place, seven ways to use it. Whichever skin is worn, the card holds the
 * same coordinates, address, and timezone — a wire reading this widget cannot
 * tell which skin it is wearing. What changes is the question the card
 * answers: where is it, what are its exact numbers, what time is it there,
 * which way is it from here, am I inside it, how far is the trip, and — for a
 * place easier to point at than to spell — whereabouts on the map is it.
 */
export function LocationWidget({ data, onChange, skin = 'pin' }: LocationWidgetProps) {
  const device = useDeviceLocation()
  const state = skinStateFor(data, skin)
  /**
   * A fix can take until the sensor's timeout to arrive, and the card stays
   * editable the whole time. Rebuilding it from the `data` of the render that
   * started the request would quietly undo everything typed while waiting, so
   * the arriving fix is written onto whatever the card holds NOW.
   */
  const dataRef = useRef(data)
  dataRef.current = data

  const write = (next: Partial<LocationData>, nextState?: WidgetSkinState) => {
    const merged = { ...dataRef.current, ...next, skin } as ModuleData
    onChange((nextState ? dataWithSkinState(merged, skin, nextState) : merged) as LocationData)
  }
  const patch: Patch = (next) => write(next)
  const setState = (next: WidgetSkinState) => write({}, next)

  const capture = () => {
    device.locate((fix) => onChange({
      ...dataRef.current,
      skin,
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracyMeters: fix.accuracy,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || dataRef.current.timezone,
      capturedAt: fix.at,
    }))
  }

  const props: SkinProps = { data, patch, write, capture, device, state, setState }

  if (skin === 'coordinates') return <CoordinatesSkin {...props} />
  if (skin === 'local_time') return <LocalTimeSkin {...props} />
  if (skin === 'compass') return <CompassSkin {...props} />
  if (skin === 'geofence') return <GeofenceSkin {...props} />
  if (skin === 'route') return <RouteSkin {...props} />
  if (skin === 'map') return <MapSkin {...props} />
  return <PinSkin {...props} />
}
