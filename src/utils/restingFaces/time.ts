import {
  chessClockState,
  chessRemaining,
  deadlineReading,
  intervalState,
  multiStageState,
  timekeeperMode,
  zoneLabel,
  zoneReading,
} from '../../components/widgets/modules/timeSkinModel'
import { formatStopwatch } from '../widgetClock'
import {
  clampFraction,
  compact,
  finite,
  formatRestDuration,
  record,
  REST_CHIP_LIMIT,
  REST_ROW_LIMIT,
  type RestChip,
  type RestingFaceModel,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// Timekeeper resting faces.
//
// Eleven modes, one card. The three dial modes keep the card-outline bezel
// they are known by; the rest fold to the shape they actually wear — a chess
// clock to its two sides, an interval trainer to its rounds, a lap timer to
// its splits, a world clock to its cities.
//
// Only the readout is live. Everything around it is static context measured
// once, so a folded timer costs one shared-clock subscription and nothing more.
// ---------------------------------------------------------------------------

const LAP_LIMIT = 3

function formatChessSide(ms: number): string {
  return formatRestDuration(ms / 1000)
}

export function timekeeperRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const mode = timekeeperMode(data.mode)
  const states = record(data.skinStates) ?? {}

  if (mode === 'deadline') {
    const deadline = record(data.deadline) ?? {}
    const target = typeof deadline.targetDate === 'string' ? deadline.targetDate : ''
    const reading = deadlineReading(target)
    if (!reading.valid) {
      return { kind: 'gauge', progress: 0, primary: '—', secondary: 'No date set' }
    }
    // A horizon reads as how much of the run-up is spent, capped at a season so
    // a date years out still shows movement rather than a permanently empty ring.
    const spent = clampFraction(1 - Math.min(reading.days, 90) / 90)
    return {
      kind: 'gauge',
      progress: reading.overdue ? 1 : spent,
      primary: reading.overdue ? `+${Math.abs(reading.days)}` : String(reading.days),
      secondary: reading.overdue ? 'Days overdue' : reading.days === 1 ? 'Day left' : 'Days left',
      caption: compact(reading.targetLabel, 22),
      tone: reading.overdue ? 'bad' : reading.days <= 3 ? 'warn' : 'accent',
    }
  }

  if (mode === 'world_clock') {
    const worldClock = record(data.worldClock) ?? {}
    const zones = (Array.isArray(worldClock.zones) ? worldClock.zones : [])
      .filter((zone): zone is string => typeof zone === 'string')
      .slice(0, REST_ROW_LIMIT)
    if (zones.length === 0) return { kind: 'icon' }
    const now = new Date()
    return {
      kind: 'rows',
      eyebrow: { label: 'World clock', note: `${zones.length} ${zones.length === 1 ? 'city' : 'cities'}` },
      rows: zones.map((zone, index) => {
        const reading = zoneReading(zone, now)
        return {
          key: `${zone}-${index}`,
          label: compact(zoneLabel(zone), 20),
          value: reading.valid ? reading.time : '--:--',
          // A city already on tomorrow (or still on yesterday) is the whole
          // point of a world clock, so it is the one row that changes colour.
          tone: reading.dayDelta === 0 ? undefined : 'warn',
        }
      }),
      overflow: 0,
    }
  }

  if (mode === 'chess_clock') {
    const state = chessClockState(states.chess_clock)
    const [left, right] = chessRemaining(state, Date.now())
    return {
      kind: 'split',
      divider: 'vs',
      eyebrow: {
        label: 'Chess clock',
        note: state.active === null ? 'Paused' : 'Running',
      },
      left: {
        primary: formatChessSide(left),
        secondary: compact(state.playerOne, 12),
        tone: state.active === 0 ? 'accent' : left <= 30_000 ? 'bad' : undefined,
      },
      right: {
        primary: formatChessSide(right),
        secondary: compact(state.playerTwo, 12),
        tone: state.active === 1 ? 'accent' : right <= 30_000 ? 'bad' : undefined,
      },
    }
  }

  if (mode === 'intervals' || mode === 'tabata') {
    const state = intervalState(states[mode], mode)
    // One pip per round, the round you are on filled — the same reading the
    // open trainer gives at a glance.
    const chips: RestChip[] = Array.from(
      { length: Math.min(REST_CHIP_LIMIT, state.rounds) },
      (_, index) => ({
        key: `round-${index}`,
        text: String(index + 1),
        filled: index < state.currentRound,
        tone: index === state.currentRound - 1
          ? (state.phase === 'work' ? 'bad' : 'good')
          : 'muted',
      }),
    )
    return {
      kind: 'clock',
      shape: 'intervals',
      eyebrow: {
        label: mode === 'tabata' ? 'Tabata' : 'Intervals',
        note: `${state.phase === 'work' ? 'Work' : 'Rest'} ${state.currentRound}/${state.rounds}`,
        tone: state.phase === 'work' ? 'bad' : 'good',
      },
      chips,
      rows: [{
        key: 'plan',
        label: `${formatRestDuration(state.workSeconds)} on`,
        value: `${formatRestDuration(state.restSeconds)} off`,
        tone: 'muted',
      }],
    }
  }

  if (mode === 'multi_stage_timer') {
    const state = multiStageState(states.multi_stage_timer)
    const chips: RestChip[] = state.stages.slice(0, REST_CHIP_LIMIT).map((stage, index) => ({
      key: stage.id,
      text: compact(stage.label, 10),
      filled: index === state.activeIndex,
      tone: index < state.activeIndex ? 'muted' : index === state.activeIndex ? 'accent' : 'muted',
    }))
    return {
      kind: 'clock',
      shape: 'stages',
      eyebrow: {
        label: 'Stages',
        note: `${Math.min(state.activeIndex + 1, state.stages.length)}/${state.stages.length}`,
      },
      chips,
    }
  }

  if (mode === 'lap_timer') {
    const stopwatch = record(data.stopwatch) ?? {}
    const laps = (Array.isArray(stopwatch.laps) ? stopwatch.laps : [])
      .filter((lap): lap is number => finite(lap) !== null)
    // Newest splits first, each as the gap it actually measured rather than
    // the running total — that difference is what a lap is for.
    const recent = laps.slice(-LAP_LIMIT).reverse()
    return {
      kind: 'clock',
      shape: 'laps',
      eyebrow: {
        label: 'Lap timer',
        note: `${laps.length} ${laps.length === 1 ? 'split' : 'splits'}`,
      },
      rows: recent.map((lap, reverseIndex) => {
        const index = laps.length - reverseIndex - 1
        return {
          key: `lap-${index}`,
          label: `Lap ${index + 1}`,
          value: formatStopwatch(lap - (laps[index - 1] ?? 0)),
          tone: reverseIndex === 0 ? 'accent' : 'muted',
        }
      }),
    }
  }

  if (mode === 'hourglass') {
    const countdown = record(data.countdown) ?? {}
    const duration = finite(countdown.durationSeconds) ?? 0
    return {
      kind: 'clock',
      shape: 'hourglass',
      eyebrow: {
        label: 'Quiet timer',
        note: countdown.endAt === null || countdown.endAt === undefined
          ? 'Ready'
          : 'Sand is falling',
      },
      ...(duration > 0
        ? {
          rows: [{
            key: 'set',
            label: 'Set for',
            value: formatRestDuration(duration),
            tone: 'muted' as const,
          }],
        }
        : {}),
    }
  }

  // countdown, pomodoro, stopwatch: the card's own outline carries the marks,
  // so the tile is the readout sitting inside the bezel.
  return { kind: 'clock', shape: 'dial' }
}
