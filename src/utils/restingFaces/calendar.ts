import {
  availabilityState,
  calendarMonthGrid,
  calendarSkin,
  dateFromDayKey,
  dayKey,
  occasionState,
  shiftRotaState,
  weekDayKeys,
  type ShiftKind,
} from '../../components/widgets/modules/calendarSkinModel'
import {
  compact,
  finite,
  record,
  REST_ROW_LIMIT,
  type RestCell,
  type RestingFaceModel,
  type RestTone,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// Calendar resting faces.
//
// A calendar's information IS its shape: a month is a month, a heat map is a
// year of squares, a rota is one week of shifts. Folding one to a list of
// dates would throw away the only thing it was drawn for, so each skin keeps
// its own lattice — bounded to a fixed cell count, drawn as static spans.
// ---------------------------------------------------------------------------

const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const
const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const
const SHIFT_HOURS: Record<ShiftKind, string> = {
  off: '—',
  morning: '07–15',
  evening: '15–23',
  night: '23–07',
}
const SHIFT_TONE: Record<ShiftKind, RestTone> = {
  off: 'muted',
  morning: 'accent',
  evening: 'warn',
  night: 'bad',
}

const OCCASION_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

function shortDate(iso: string): string {
  const date = dateFromDayKey(iso)
  return date ? OCCASION_FORMAT.format(date) : iso
}

/** An occasion recurs, so it is stored as MM-DD with no year of its own. */
function occasionDate(monthDay: string): string {
  const date = dateFromDayKey(`2000-${monthDay}`)
  return date ? OCCASION_FORMAT.format(date) : monthDay
}

export function calendarRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const skin = calendarSkin(data.skin)
  const markedDates = Array.isArray(data.markedDates)
    ? data.markedDates.filter((iso): iso is string => typeof iso === 'string')
    : []
  const marked = new Set(markedDates)
  const today = new Date()
  const todayIso = dayKey(today)
  const year = finite(data.year) ?? today.getFullYear()
  const month = finite(data.month) ?? today.getMonth()
  const states = record(data.skinStates) ?? {}

  if (skin === 'year_heatmap') {
    // Twelve months down one column of initials, each month a lit/unlit run of
    // days — the same reading the open heat map gives, at a twelfth the cells.
    const cells: RestCell[] = []
    for (let index = 0; index < 12; index++) {
      const days = calendarMonthGrid(year, index).filter((cell) => cell.inMonth)
      const active = days.filter((cell) => marked.has(cell.iso)).length
      cells.push({
        key: `month-${index}`,
        text: MONTH_INITIALS[index]!,
        fill: active === 0 ? undefined : Math.min(1, active / 8),
        current: index === today.getMonth() && year === today.getFullYear(),
        ...(active === 0 ? { tone: 'muted' as const } : {}),
      })
    }
    const yearMarked = markedDates.filter((iso) => iso.startsWith(`${year}-`)).length
    return {
      kind: 'grid',
      dense: true,
      cols: 12,
      cells,
      eyebrow: { label: String(year), note: `${yearMarked} active days` },
    }
  }

  if (skin === 'availability') {
    const state = availabilityState(states.availability, todayIso)
    const days = weekDayKeys(state.anchorDate)
    // Three rows — morning, afternoon, evening — against seven days, filled
    // where the slot is taken. That grid IS the availability answer.
    const slots = ['morning', 'afternoon', 'evening'] as const
    const cells: RestCell[] = []
    for (const slot of slots) {
      for (const iso of days) {
        const busy = (state.busy[iso] ?? []).includes(slot)
        cells.push({
          key: `${slot}-${iso}`,
          text: '',
          fill: busy ? 1 : undefined,
          tone: busy ? 'bad' : 'muted',
        })
      }
    }
    const busyCount = Object.values(state.busy).reduce((total, list) => total + list.length, 0)
    return {
      kind: 'grid',
      dense: true,
      cols: 7,
      header: [...DAY_INITIALS],
      cells,
      eyebrow: { label: 'Availability', note: `${busyCount} busy` },
    }
  }

  if (skin === 'shift_rota') {
    const state = shiftRotaState(states.shift_rota, todayIso)
    const days = weekDayKeys(state.anchorDate)
    const working = days.filter((iso) => (state.shifts[iso] ?? 'off') !== 'off').length
    return {
      kind: 'columns',
      eyebrow: {
        label: compact(state.assignee || 'Shift rota', 18),
        note: `${working}/7 on`,
      },
      columns: days.map((iso, index) => {
        const shift = state.shifts[iso] ?? 'off'
        return {
          key: iso,
          label: DAY_INITIALS[index]!,
          tone: SHIFT_TONE[shift],
          items: [{
            key: `${iso}-shift`,
            label: shift === 'off' ? 'Off' : SHIFT_HOURS[shift],
          }],
          overflow: 0,
        }
      }),
    }
  }

  if (skin === 'birthday_and_anniversary') {
    const state = occasionState(states.birthday_and_anniversary)
    const sorted = [...state.occasions].sort((left, right) => left.date.localeCompare(right.date))
    if (sorted.length === 0) return { kind: 'icon' }
    const visible = sorted.slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: { label: 'Occasions', note: String(sorted.length) },
      rows: visible.map((occasion) => ({
        key: occasion.id,
        label: compact(occasion.name || 'Untitled', 22),
        value: occasionDate(occasion.date),
        tone: occasion.kind === 'anniversary' ? 'accent' : undefined,
      })),
      overflow: Math.max(0, sorted.length - visible.length),
    }
  }

  if (skin === 'agenda') {
    // What is actually coming up, in date order — an agenda has no grid.
    const upcoming = markedDates.filter((iso) => iso >= todayIso).toSorted()
    // Nothing ahead means the agenda is a record rather than a plan, so it
    // shows the most recent days instead of an empty tile.
    const source = upcoming.length > 0 ? upcoming : markedDates.toSorted().slice(-REST_ROW_LIMIT)
    const shown = source.slice(0, REST_ROW_LIMIT)
    if (shown.length === 0) return { kind: 'icon' }
    return {
      kind: 'rows',
      eyebrow: { label: 'Agenda', note: `${markedDates.length} marked` },
      rows: shown.map((iso) => ({
        key: iso,
        lead: shortDate(iso),
        label: iso === todayIso ? 'Today' : 'Marked',
        tone: iso === todayIso ? 'accent' : 'muted',
      })),
      overflow: Math.max(0, source.length - shown.length),
    }
  }

  if (skin === 'week') {
    const days = weekDayKeys(todayIso)
    return {
      kind: 'grid',
      dense: true,
      cols: 7,
      header: [...DAY_INITIALS],
      cells: days.map((iso) => {
        const date = dateFromDayKey(iso)
        return {
          key: iso,
          text: String(date?.getDate() ?? ''),
          current: iso === todayIso,
          fill: marked.has(iso) ? 0.6 : undefined,
          ...(marked.has(iso) || iso === todayIso ? {} : { tone: 'muted' as const }),
        }
      }),
      eyebrow: { label: 'This week', note: `${days.filter((iso) => marked.has(iso)).length} marked` },
    }
  }

  // External events are intentionally device-local and never enter the board
  // model, so the shared/folded face names the private sources without caching
  // connection status or revealing event titles.
  if (skin === 'connected_calendars') {
    return {
      kind: 'rows',
      eyebrow: { label: 'Connected calendars', note: 'Private' },
      rows: [
        { key: 'google', label: 'Google Calendar', value: 'Open to view', tone: 'muted' },
        { key: 'microsoft', label: 'Outlook Calendar', value: 'Open to view', tone: 'muted' },
      ],
      overflow: 0,
    }
  }

  // month — the calendar's own lattice, weeks down and days across.
  const grid = calendarMonthGrid(year, month)
  return {
    kind: 'grid',
    dense: true,
    cols: 7,
    header: [...DAY_INITIALS],
    cells: grid.map((cell) => ({
      key: cell.iso,
      text: cell.inMonth ? String(cell.day) : '',
      current: cell.iso === todayIso,
      fill: cell.inMonth && marked.has(cell.iso) ? 0.65 : undefined,
      ...(cell.inMonth && (marked.has(cell.iso) || cell.iso === todayIso)
        ? {}
        : { tone: 'muted' as const }),
    })),
    eyebrow: {
      label: new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(year, month, 1)),
      note: String(year),
    },
  }
}
