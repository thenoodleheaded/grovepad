import type { LocationData } from '../../types/spatial'
import {
  bearingDegrees,
  compassPoint,
  coordinateNotation,
  fenceVerdict,
  formatCoordinates,
  formatDistance,
  geofenceRadius,
  locationPoint,
  locationSkinMode,
  placeName,
  routeReading,
  routeStops,
  zonedReading,
} from '../../components/widgets/modules/locationSkinModel'
import {
  toggleSegmentLabels,
  toggleSkinMode,
  toggleStateLabel,
  toggleTriState,
} from '../../components/widgets/modules/toggleSkinModel'
import {
  compact,
  finite,
  record,
  REST_NODE_LIMIT,
  type RestingFaceModel,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// The structural families: Location, Toggle.
//
// Each is one small piece of state wearing several very different shapes. A
// place is coordinates, so the folded card keeps whichever reading of them
// the skin is for; a toggle is one boolean, so the folded card keeps the
// control that boolean is worn as.
// ---------------------------------------------------------------------------

/* ----------------------------------------------------------------- Location */

export function locationRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const place = data as unknown as LocationData
  const point = locationPoint({
    latitude: finite(data.latitude),
    longitude: finite(data.longitude),
  })
  const skin = locationSkinMode(data.skin)
  const states = record(data.skinStates) ?? {}
  const name = placeName(
    typeof data.label === 'string' ? data.label : '',
    typeof data.address === 'string' ? data.address : '',
  )
  // Without coordinates there is nothing to report yet, whatever the skin.
  if (!point) return { kind: 'icon' }
  const timezone = typeof place.timezone === 'string' ? place.timezone : ''

  if (skin === 'local_time') {
    const reading = zonedReading(timezone, Date.now())
    return {
      kind: 'metric',
      primary: reading.time,
      secondary: compact(name, 20),
      eyebrow: { label: 'Local time', note: compact(reading.valid ? reading.offsetLabel : timezone, 18) },
    }
  }

  if (skin === 'coordinates') {
    const notation = coordinateNotation((record(states.coordinates) ?? {}).notation)
    return {
      kind: 'rows',
      eyebrow: { label: 'Coordinates', note: notation.toUpperCase() },
      rows: [
        { key: 'place', label: compact(name, 24) },
        { key: 'point', label: formatCoordinates(point, notation), tone: 'accent' },
      ],
      overflow: 0,
    }
  }

  if (skin === 'compass') {
    const state = record(states.compass) ?? {}
    const target = locationPoint({
      latitude: finite(state.targetLatitude),
      longitude: finite(state.targetLongitude),
    })
    if (!target) {
      return {
        kind: 'rows',
        eyebrow: { label: 'Compass', note: 'No bearing set' },
        rows: [{ key: 'place', label: compact(name, 24) }],
        overflow: 0,
      }
    }
    const bearing = bearingDegrees(point, target)
    const distance = formatDistance(
      Math.round(Math.hypot(target.latitude - point.latitude, target.longitude - point.longitude) * 111_320),
    )
    return {
      kind: 'split',
      divider: '·',
      eyebrow: { label: 'Compass', note: compact(name, 16) },
      left: { primary: compassPoint(bearing), secondary: `${Math.round(bearing)}°`, tone: 'accent' },
      right: { primary: distance.value, secondary: distance.unit },
    }
  }

  if (skin === 'geofence') {
    const state = record(states.geofence) ?? {}
    const radius = geofenceRadius(state)
    const reading = locationPoint({
      latitude: finite(state.readingLatitude),
      longitude: finite(state.readingLongitude),
    })
    const verdict = reading ? fenceVerdict(point, reading, radius) : null
    const distance = formatDistance(radius)
    return {
      kind: 'gauge',
      // Nothing has been read yet: an empty ring is the honest picture.
      progress: verdict ? Math.min(1, verdict.distanceMeters / Math.max(1, radius)) : 0,
      primary: `${distance.value}${distance.unit}`,
      secondary: 'Radius',
      caption: verdict ? (verdict.inside ? 'Inside' : 'Outside') : 'No reading',
      tone: verdict ? (verdict.inside ? 'good' : 'bad') : 'muted',
      eyebrow: { label: 'Geofence', note: compact(name, 16) },
    }
  }

  if (skin === 'route') {
    const stops = routeStops(record(states.route) ?? {})
    const reading = routeReading(point, stops)
    if (reading.legs.length === 0) {
      return {
        kind: 'rows',
        eyebrow: { label: 'Route', note: 'No stops yet' },
        rows: [{ key: 'origin', label: compact(name, 24) }],
        overflow: 0,
      }
    }
    const visible = reading.legs.slice(0, REST_NODE_LIMIT - 1)
    const total = formatDistance(reading.totalMeters)
    return {
      kind: 'chain',
      shape: 'linear',
      eyebrow: { label: 'Route', note: `${total.value}${total.unit}` },
      nodes: [
        { key: 'origin', label: compact(name, 8), caption: 'Start' },
        // A stop nobody has located yet still belongs on the route; it simply
        // has no leg length to report.
        ...visible.map((leg, index) => {
          const hop = leg.meters === null ? null : formatDistance(leg.meters)
          return {
            key: leg.id || `leg-${index}`,
            label: compact(leg.label || `Stop ${index + 1}`, 8),
            caption: hop ? `${hop.value}${hop.unit}` : '—',
          }
        }),
      ],
      overflow: Math.max(0, reading.legs.length - visible.length),
    }
  }

  // pin — where it is, in the plainest terms.
  return {
    kind: 'rows',
    rows: [{
      key: 'place',
      label: compact(name, 24),
      value: `${point.latitude.toFixed(3)}, ${point.longitude.toFixed(3)}`,
    }],
    overflow: 0,
  }
}

/* ------------------------------------------------------------------- Toggle */

export function toggleRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const enabled = data.value === true
  const skin = toggleSkinMode(data.skin)
  const states = record(data.skinStates) ?? {}
  const state = record(states[skin]) ?? {}
  const activeLabel = enabled ? data.trueLabel : data.falseLabel
  // A card that names its own outcomes keeps those names, whatever skin it
  // wears — they were written for this card, not for the presentation.
  if (typeof activeLabel === 'string' && activeLabel.trim()) {
    return { kind: 'boolean', label: compact(activeLabel, 24), active: enabled }
  }

  if (skin === 'segment') {
    // Both choices stay on screen with the taken one filled: a segmented
    // control that shows only its winner is just a label.
    const labels = toggleSegmentLabels(state)
    return {
      kind: 'chips',
      chips: [
        { key: 'off', text: compact(labels.off, 14), filled: !enabled, tone: enabled ? 'muted' : 'accent' },
        { key: 'on', text: compact(labels.on, 14), filled: enabled, tone: enabled ? 'accent' : 'muted' },
      ],
      overflow: 0,
    }
  }

  if (skin === 'tri_state') {
    const position = toggleTriState(state.state, enabled)
    return {
      kind: 'chips',
      chips: (['off', 'unset', 'on'] as const).map((slot) => ({
        key: slot,
        text: slot === 'off' ? 'Off' : slot === 'unset' ? 'Unset' : 'On',
        filled: slot === position,
        tone: slot === position ? 'accent' : 'muted',
      })),
      overflow: 0,
    }
  }

  return {
    kind: 'boolean',
    label: compact(toggleStateLabel(skin, enabled, state), 24),
    active: enabled,
    shape: skin === 'checkbox' ? 'checkbox' : skin === 'power' ? 'power' : 'switch',
    // Availability borrows the product's status hues rather than the card's
    // accent: on a card whose accent is already green, "Busy" would read green.
    ...(skin === 'availability' ? { tone: enabled ? 'good' as const : 'warn' as const } : {}),
  }
}
