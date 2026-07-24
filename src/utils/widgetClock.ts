import type { ModuleType, Widget } from '../types/spatial'

// ---------------------------------------------------------------------------
// Clock reading for the timer family (Timer, Pomodoro, Stopwatch, and the
// Timekeeper that hosts all three).
//
// One pure function answers everything the dial needs: how full the ring is,
// whether it is ticking, what to print in the middle, and which tone the marks
// take. The card, the resting face and the icon all read from here, so a
// running timer can never look like three different times in three places.
// ---------------------------------------------------------------------------

export type ClockTone = 'work' | 'break' | 'neutral'

export interface WidgetClock {
  /** Fraction of the dial that stays lit, 0–1. */
  fraction: number
  running: boolean
  tone: ClockTone
  /** Centre readout, already formatted. */
  readout: string
  /** Small line under the readout — phase, or what the number means. */
  caption: string
  /** True when a countdown is nearly out, for the urgent treatment. */
  urgent: boolean
}

const CLOCK_TYPES = new Set<ModuleType>(['timer', 'pomodoro', 'stopwatch', 'timekeeper'])

export function isClockWidget(type: ModuleType): boolean {
  return CLOCK_TYPES.has(type)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatStopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  const m = Math.floor(total / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const cs = Math.floor((total % 1000) / 10)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function timerClock(data: Record<string, unknown>, now: number): WidgetClock {
  const endAt = finite(data.endAt)
  const running = endAt !== null
  const remaining = running
    ? Math.max(0, Math.round((endAt - now) / 1000))
    : finite(data.remainingSeconds) ?? 0
  const duration = Math.max(1, finite(data.durationSeconds) ?? remaining ?? 1)
  return {
    fraction: clamp01(remaining / duration),
    running,
    tone: 'neutral',
    readout: formatClock(remaining),
    caption: running ? 'Left' : remaining > 0 ? 'Ready' : 'Done',
    urgent: remaining <= 10 && remaining > 0,
  }
}

function pomodoroClock(data: Record<string, unknown>, now: number): WidgetClock {
  const endAt = finite(data.endAt)
  const running = endAt !== null
  const remaining = running
    ? Math.max(0, Math.round((endAt - now) / 1000))
    : finite(data.remainingSeconds) ?? 0
  const isWork = data.phase !== 'break'
  const minutes = isWork ? finite(data.workMinutes) : finite(data.breakMinutes)
  const phaseLength = Math.max(1, (minutes ?? 25) * 60)
  // Completed sessions are the widget's own pips; the dial stays a pure phase
  // reading so the ring can never disagree with the printed time.
  return {
    fraction: clamp01(remaining / phaseLength),
    running,
    tone: isWork ? 'work' : 'break',
    readout: formatClock(remaining),
    caption: isWork ? 'Focus' : 'Break',
    urgent: isWork && remaining <= 10 && remaining > 0,
  }
}

function stopwatchClock(data: Record<string, unknown>, now: number): WidgetClock {
  const startedAt = finite(data.startedAt)
  const running = startedAt !== null
  const elapsedMs = (finite(data.elapsedMs) ?? 0) + (running ? now - startedAt : 0)
  // A stopwatch has no target, so the ring sweeps once per minute — the same
  // reading a mechanical seconds hand gives, and it makes running obvious.
  return {
    fraction: clamp01((elapsedMs % 60000) / 60000),
    running,
    tone: 'neutral',
    readout: formatStopwatch(elapsedMs),
    caption: running ? 'Running' : elapsedMs > 0 ? 'Paused' : 'Ready',
    urgent: false,
  }
}

/** The clock actually in play, once a Timekeeper's mode is resolved. */
function activeClockData(widget: Pick<Widget, 'type' | 'data'>): {
  data: Record<string, unknown>
  kind: 'timer' | 'pomodoro' | 'stopwatch'
} | null {
  const data = record(widget.data)
  if (widget.type === 'timer') return { data, kind: 'timer' }
  if (widget.type === 'pomodoro') return { data, kind: 'pomodoro' }
  if (widget.type === 'stopwatch') return { data, kind: 'stopwatch' }
  if (widget.type === 'timekeeper') {
    if (data.mode === 'countdown') return { data: record(data.countdown), kind: 'timer' }
    if (data.mode === 'pomodoro') return { data: record(data.pomodoro), kind: 'pomodoro' }
    if (data.mode === 'stopwatch') return { data: record(data.stopwatch), kind: 'stopwatch' }
  }
  return null
}

/** Whether this widget's clock is ticking — answerable without a `now`, so
 * callers can decide whether to subscribe to the shared clock at all. */
export function widgetClockRunning(widget: Pick<Widget, 'type' | 'data'>): boolean {
  const active = activeClockData(widget)
  if (!active) return false
  return active.kind === 'stopwatch'
    ? finite(active.data.startedAt) !== null
    : finite(active.data.endAt) !== null
}

/** Centisecond readouts need a fast beat; whole-second dials do not. */
export function widgetClockIntervalMs(widget: Pick<Widget, 'type' | 'data'>): number {
  return activeClockData(widget)?.kind === 'stopwatch' ? 50 : 250
}

/**
 * The dial reading for one widget, or null when the type has no clock.
 * `now` comes from the caller's shared clock so every dial on the board ticks
 * on the same beat instead of each widget owning a timer.
 */
export function widgetClock(
  widget: Pick<Widget, 'type' | 'data'>,
  now: number,
): WidgetClock | null {
  const active = activeClockData(widget)
  if (!active) return null
  if (active.kind === 'timer') return timerClock(active.data, now)
  if (active.kind === 'pomodoro') return pomodoroClock(active.data, now)
  return stopwatchClock(active.data, now)
}
