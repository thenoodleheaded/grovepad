import { describe, expect, it } from 'vitest'
import type { ChecklistItem } from '../../../types/spatial'
import {
  assignmentOrder,
  boardColumns,
  dayOrder,
  dependencyReadings,
  dueReading,
  itemWithStatus,
  nextOccurrence,
  ownerInitials,
  routineReading,
  shoppingGroups,
  sprintPoints,
  taskDependencyState,
  taskRecurringState,
  taskRoutineState,
  taskShoppingState,
  taskSkin,
  taskSkinIsSpatial,
  taskSprintState,
  taskStatus,
  timelineReading,
  weekColumns,
} from './taskSkinModel'

const items: ChecklistItem[] = [
  { id: 'one', label: 'Draft', done: false, status: 'doing', due: '2026-07-28', day: 2, time: '14:00' },
  { id: 'two', label: 'Fix', done: true, status: 'todo', due: '2026-07-22', day: 2, time: '09:00' },
  { id: 'three', label: 'Ship', done: false, status: 'todo', day: 9, time: 'noon' },
]

describe('Tasks skin model', () => {
  it('sanitizes skin names and knows which skins need a resize handle', () => {
    expect(taskSkin('shopping')).toBe('shopping')
    expect(taskSkin('nonsense')).toBe('list')
    expect(taskSkin(undefined)).toBe('list')
    expect(taskSkinIsSpatial('board')).toBe(true)
    expect(taskSkinIsSpatial('sprint')).toBe(true)
    expect(taskSkinIsSpatial('list')).toBe(false)
    expect(taskSkinIsSpatial('routine')).toBe(false)
  })

  it('lets `done` overrule a stale status, and moves both together', () => {
    expect(taskStatus(items[1]!)).toBe('done')
    expect(taskStatus(items[0]!)).toBe('doing')
    expect(itemWithStatus(items[1]!, 'todo')).toMatchObject({ done: false, status: 'todo' })
    expect(itemWithStatus(items[0]!, 'done')).toMatchObject({ done: true, status: 'done' })
    expect(boardColumns(items).map((column) => column.items.map((item) => item.id))).toEqual([
      ['three'],
      ['one'],
      ['two'],
    ])
  })

  it('reads due dates as local calendar days', () => {
    expect(dueReading('2026-07-25', '2026-07-25')).toMatchObject({ label: 'Today', tone: 'today' })
    expect(dueReading('2026-07-26', '2026-07-25')).toMatchObject({ label: 'Tomorrow', tone: 'soon' })
    expect(dueReading('2026-07-22', '2026-07-25')).toMatchObject({ label: '3 days late', tone: 'overdue' })
    expect(dueReading('2026-08-30', '2026-07-25')).toMatchObject({ tone: 'later' })
    expect(dueReading('', '2026-07-25')).toMatchObject({ key: '', tone: 'none' })
    expect(dueReading('2026-02-31', '2026-07-25')).toMatchObject({ tone: 'none' })
  })

  it('orders deadlines first and undated work last, and a day down the clock', () => {
    expect(assignmentOrder(items).map((item) => item.id)).toEqual(['two', 'one', 'three'])
    // 'three' carries a nonsense time, which falls back to 09:00 and ties with
    // 'two'; ties keep the list's own order rather than shuffling.
    expect(dayOrder(items).map((item) => item.id)).toEqual(['two', 'three', 'one'])
  })

  it('clamps out-of-range days, spans, and quantities', () => {
    // Day 9 is not a weekday: it lands on Sunday rather than vanishing.
    expect(weekColumns(items).map((column) => column.length)).toEqual([0, 0, 2, 0, 0, 0, 1])
    expect(timelineReading([
      { id: 'a', label: 'A', done: false, start: -4, span: 0 },
      { id: 'b', label: 'B', done: false, start: 2, span: 99 },
    ])).toMatchObject({
      bars: [{ start: 0, span: 1 }, { start: 2, span: 24 }],
      totalUnits: 26,
    })
    expect(taskShoppingState({ quantities: { one: 400, two: 1, three: -2, gone: 5 } }, items))
      .toEqual({ quantities: { one: 99 } })
    expect(shoppingGroups(items).basket.map((item) => item.id)).toEqual(['two'])
  })

  it('keeps only repeat rules for tasks that still exist, and rolls month ends forward', () => {
    expect(taskRecurringState({
      rules: { one: 'weekly', two: 'yearly', gone: 'daily' },
      lastDone: { one: '2026-07-25', two: 'not-a-date' },
    }, items)).toEqual({ rules: { one: 'weekly' }, lastDone: { one: '2026-07-25' } })
    expect(nextOccurrence('2026-07-25', 'daily')).toBe('2026-07-26')
    expect(nextOccurrence('2026-07-25', 'weekly')).toBe('2026-08-01')
    expect(nextOccurrence('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(nextOccurrence('2026-07-31', 'monthly')).toBe('2026-08-31')
  })

  it('totals sprint points and reduces an owner to initials', () => {
    const state = taskSprintState({
      name: 'Sprint 14',
      owners: { one: '  Rae Lin  ', two: '   ', gone: 'Nobody' },
      estimates: { one: 5, two: 0, three: 3.4, gone: 8 },
    }, items)
    expect(state).toEqual({
      name: 'Sprint 14',
      owners: { one: 'Rae Lin' },
      estimates: { one: 5, three: 3 },
    })
    expect(sprintPoints(items, state)).toBe(8)
    expect(ownerInitials('Rae Lin')).toBe('RL')
    expect(ownerInitials('amir')).toBe('AM')
    expect(ownerInitials('  ')).toBe('—')
  })

  it('drops self-links, dead links, and any blocker chain that would close a loop', () => {
    expect(taskDependencyState({
      blockedBy: { one: 'one', two: 'gone', three: 'two' },
    }, items)).toEqual({ blockedBy: { three: 'two' } })

    const cyclic = taskDependencyState({
      blockedBy: { one: 'two', two: 'three', three: 'one' },
    }, items)
    expect(cyclic.blockedBy).toEqual({ one: 'two', two: 'three' })

    const readings = dependencyReadings(items, { blockedBy: { one: 'three', three: 'two' } })
    expect(readings.map(({ item, blocked }) => [item.id, blocked])).toEqual([
      ['one', true],
      ['two', false],
      ['three', false],
    ])
  })

  it('walks a routine to its first unfinished step', () => {
    expect(routineReading(items)).toMatchObject({ currentId: 'one', completed: 1, total: 3, finished: false })
    expect(routineReading(items.map((item) => ({ ...item, done: true }))))
      .toMatchObject({ currentId: null, finished: true })
    expect(taskRoutineState({ runs: -3, lastRunAt: 'nope' })).toEqual({ runs: 0, lastRunAt: '' })
    expect(taskRoutineState({ runs: 4.6, lastRunAt: '2026-07-24T08:00:00.000Z' }))
      .toEqual({ runs: 5, lastRunAt: '2026-07-24T08:00:00.000Z' })
  })
})
