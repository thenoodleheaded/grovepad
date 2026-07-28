export type CalendarSkin =
  | 'month'
  | 'week'
  | 'agenda'
  | 'year_heatmap'
  | 'availability'
  | 'shift_rota'
  | 'birthday_and_anniversary'
  | 'connected_calendars'

export type AvailabilitySlot = 'morning' | 'afternoon' | 'evening'
export type ShiftKind = 'off' | 'morning' | 'evening' | 'night'
export type OccasionKind = 'birthday' | 'anniversary'

export interface CalendarCell {
  day: number
  inMonth: boolean
  iso: string
}

export interface AvailabilityState {
  anchorDate: string
  busy: Record<string, AvailabilitySlot[]>
}

export interface ShiftRotaState {
  anchorDate: string
  assignee: string
  role: string
  shifts: Record<string, ShiftKind>
}

export interface CalendarOccasion {
  id: string
  name: string
  date: string
  kind: OccasionKind
}

export interface OccasionState {
  occasions: CalendarOccasion[]
}

const CALENDAR_SKINS = new Set<CalendarSkin>([
  'month',
  'week',
  'agenda',
  'year_heatmap',
  'availability',
  'shift_rota',
  'birthday_and_anniversary',
  'connected_calendars',
])
const AVAILABILITY_SLOTS = new Set<AvailabilitySlot>(['morning', 'afternoon', 'evening'])
const SHIFT_KINDS = new Set<ShiftKind>(['off', 'morning', 'evening', 'night'])

export function calendarSkin(raw: unknown): CalendarSkin {
  return typeof raw === 'string' && CALENDAR_SKINS.has(raw as CalendarSkin)
    ? raw as CalendarSkin
    : 'month'
}

export function dayKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function dateFromDayKey(raw: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day, 12)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
  ) ? date : null
}

export function addCalendarDays(iso: string, amount: number): string {
  const date = dateFromDayKey(iso)
  if (!date) return iso
  date.setDate(date.getDate() + amount)
  return dayKey(date)
}

export function startOfCalendarWeek(iso: string): string {
  const date = dateFromDayKey(iso)
  if (!date) return iso
  const mondayOffset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - mondayOffset)
  return dayKey(date)
}

export function weekDayKeys(anchorDate: string): string[] {
  const monday = startOfCalendarWeek(anchorDate)
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(monday, index))
}

/** A stable six-row, Monday-first month grid. */
export function calendarMonthGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1, 12)
  const mondayLead = (first.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - mondayLead, 12)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return {
      day: date.getDate(),
      inMonth: date.getMonth() === month && date.getFullYear() === year,
      iso: dayKey(date),
    }
  })
}

export function anchorForMonth(year: number, month: number, todayIso: string): string {
  const today = dateFromDayKey(todayIso)
  return today && today.getFullYear() === year && today.getMonth() === month
    ? todayIso
    : dayKey(new Date(year, month, 1, 12))
}

function safeRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
}

function validAnchor(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && dateFromDayKey(raw) ? raw : fallback
}

export function availabilityState(
  raw: unknown,
  fallbackAnchor: string,
): AvailabilityState {
  const state = safeRecord(raw)
  const requestedBusy = safeRecord(state.busy)
  const busy: Record<string, AvailabilitySlot[]> = {}
  for (const [iso, slots] of Object.entries(requestedBusy)) {
    if (!dateFromDayKey(iso) || !Array.isArray(slots)) continue
    const valid = [...new Set(slots.filter(
      (slot): slot is AvailabilitySlot =>
        typeof slot === 'string' && AVAILABILITY_SLOTS.has(slot as AvailabilitySlot),
    ))]
    if (valid.length > 0) busy[iso] = valid
  }
  return {
    anchorDate: validAnchor(state.anchorDate, fallbackAnchor),
    busy,
  }
}

export function shiftRotaState(
  raw: unknown,
  fallbackAnchor: string,
): ShiftRotaState {
  const state = safeRecord(raw)
  const requestedShifts = safeRecord(state.shifts)
  const shifts: Record<string, ShiftKind> = {}
  for (const [iso, shift] of Object.entries(requestedShifts)) {
    if (
      dateFromDayKey(iso) &&
      typeof shift === 'string' &&
      SHIFT_KINDS.has(shift as ShiftKind)
    ) {
      shifts[iso] = shift as ShiftKind
    }
  }
  return {
    anchorDate: validAnchor(state.anchorDate, fallbackAnchor),
    assignee: typeof state.assignee === 'string' ? state.assignee.slice(0, 60) : '',
    role: typeof state.role === 'string' ? state.role.slice(0, 60) : '',
    shifts,
  }
}

export function occasionState(raw: unknown): OccasionState {
  const state = safeRecord(raw)
  if (!Array.isArray(state.occasions)) return { occasions: [] }
  const seen = new Set<string>()
  const occasions: CalendarOccasion[] = []
  for (const rawOccasion of state.occasions) {
    const occasion = safeRecord(rawOccasion)
    const kind = occasion.kind === 'anniversary' ? 'anniversary' : 'birthday'
    if (
      typeof occasion.id !== 'string' ||
      seen.has(occasion.id) ||
      typeof occasion.name !== 'string' ||
      typeof occasion.date !== 'string' ||
      !/^\d{2}-\d{2}$/.test(occasion.date) ||
      !dateFromDayKey(`2000-${occasion.date}`)
    ) continue
    seen.add(occasion.id)
    occasions.push({
      id: occasion.id,
      name: occasion.name.slice(0, 80),
      date: occasion.date,
      kind,
    })
  }
  return { occasions }
}

export function nextShift(shift: ShiftKind | undefined): ShiftKind {
  if (!shift || shift === 'off') return 'morning'
  if (shift === 'morning') return 'evening'
  if (shift === 'evening') return 'night'
  return 'off'
}
