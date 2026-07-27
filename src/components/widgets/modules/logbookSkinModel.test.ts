import { describe, expect, it } from 'vitest'
import type { LogbookData } from '../../../types/spatial'
import {
  appendLogbookEntry,
  dataWithLogbookEntryDetails,
  dataWithLogbookOrder,
  logbookDayGroups,
  logbookEntries,
  logbookEntryDetails,
  logbookOrder,
  logbookSkinMode,
  orderedLogbookEntries,
  removeLogbookEntry,
} from './logbookSkinModel'

const base: LogbookData = {
  skin: 'daily_log',
  entries: [
    { id: 'one', timestamp: '2026-07-24T08:00:00.000Z', text: 'Started', level: 'note' },
    { id: 'two', timestamp: '2026-07-25T09:00:00.000Z', text: 'Observed', level: 'info' },
    { id: 'three', timestamp: '2026-07-25T10:00:00.000Z', text: 'Issue', level: 'warning' },
  ],
}

describe('Logbook skin model', () => {
  it('falls back to Daily Log for stale skin values', () => {
    expect(logbookSkinMode(undefined)).toBe('daily_log')
    expect(logbookSkinMode('unknown')).toBe('daily_log')
    expect(logbookSkinMode('audit_trail')).toBe('audit_trail')
  })

  it('normalizes untrusted entries and bounds their content', () => {
    const entries = logbookEntries([
      null,
      { id: 'safe', timestamp: 'bad date', text: 42, level: 'critical' },
      { id: '', timestamp: '2026-07-25T10:00:00Z', text: 'x'.repeat(2_200), level: 'info' },
    ])
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      id: 'safe',
      timestamp: '1970-01-01T00:00:00.000Z',
      text: '',
      level: 'note',
    })
    expect(entries[1]!.id).toBe('log-2')
    expect(entries[1]!.text).toHaveLength(2_000)
  })

  it('sorts without mutating canonical entry order', () => {
    const original = base.entries.map((entry) => entry.id)
    expect(orderedLogbookEntries(base.entries, 'newest').map((entry) => entry.id))
      .toEqual(['three', 'two', 'one'])
    expect(orderedLogbookEntries(base.entries, 'oldest').map((entry) => entry.id))
      .toEqual(original)
    expect(base.entries.map((entry) => entry.id)).toEqual(original)
  })

  it('groups chronology by day in the selected order', () => {
    const groups = logbookDayGroups(base.entries, 'newest')
    expect(groups.map((group) => group.day)).toEqual(['2026-07-25', '2026-07-24'])
    expect(groups[0]!.entries.map((entry) => entry.id)).toEqual(['three', 'two'])
  })

  it('isolates specialist details and display order by skin', () => {
    const incident = dataWithLogbookEntryDetails(
      base,
      'incident_log',
      'three',
      { status: 'resolved', impact: 'One delayed job' },
    )
    const lab = dataWithLogbookEntryDetails(
      incident,
      'lab_notebook',
      'three',
      { hypothesis: 'The retry will recover' },
    )
    const ordered = dataWithLogbookOrder(lab, 'incident_log', 'oldest')

    expect(logbookEntryDetails(ordered, 'incident_log').three).toEqual({
      status: 'resolved',
      impact: 'One delayed job',
    })
    expect(logbookEntryDetails(ordered, 'lab_notebook').three).toEqual({
      hypothesis: 'The retry will recover',
    })
    expect(logbookOrder(ordered, 'incident_log')).toBe('oldest')
    expect(logbookOrder(ordered, 'lab_notebook')).toBe('newest')
    expect(ordered.entries).toEqual(base.entries)
  })

  it('appends without dropping the worn skin or specialist state', () => {
    const withState = dataWithLogbookEntryDetails(
      { ...base, skin: 'change_log' },
      'change_log',
      'one',
      { version: 'v1.0' },
    )
    const appended = appendLogbookEntry(
      withState,
      'Released',
      'info',
      '2026-07-26T08:00:00Z',
      'four',
    )
    expect(appended.skin).toBe('change_log')
    expect(appended.entries.at(-1)).toMatchObject({
      id: 'four',
      text: 'Released',
      level: 'info',
    })
    expect(logbookEntryDetails(appended, 'change_log').one?.version).toBe('v1.0')
  })

  it('prunes orphaned specialist details when an entry is removed', () => {
    const incident = dataWithLogbookEntryDetails(base, 'incident_log', 'two', {
      status: 'monitoring',
    })
    const travel = dataWithLogbookEntryDetails(incident, 'travel_log', 'two', {
      place: 'Samarkand',
    })
    const removed = removeLogbookEntry(travel, 'two')

    expect(removed.entries.map((entry) => entry.id)).toEqual(['one', 'three'])
    expect(logbookEntryDetails(removed, 'incident_log')).not.toHaveProperty('two')
    expect(logbookEntryDetails(removed, 'travel_log')).not.toHaveProperty('two')
  })
})
