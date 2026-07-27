import { describe, expect, it } from 'vitest'
import type { MeetingNotesData } from '../../../types/spatial'
import {
  agendaTotalMinutes,
  dataWithMeetingItemDetails,
  dataWithMeetingPanels,
  decisionsDueForReview,
  meetingAttendees,
  meetingItemDetails,
  meetingNotesSkinMode,
  meetingPanels,
  openActionCount,
  removeMeetingAction,
  MEETING_NOTES_SKINS,
} from './meetingNotesSkinModel'

const base = (): MeetingNotesData => ({
  skin: 'agenda',
  date: '2026-07-26',
  attendees: 'Amir Hamza, Rae Ndlovu; Jun Park',
  notes: 'Shipping the skin roller.',
  actions: [
    { id: 'one', text: 'Pick the launch date', done: false },
    { id: 'two', text: 'Draft the changelog', done: true },
  ],
})

describe('meeting notes skin resolution', () => {
  it('falls back to Agenda for missing or unknown skins', () => {
    expect(meetingNotesSkinMode(undefined)).toBe('agenda')
    expect(meetingNotesSkinMode('not_a_skin')).toBe('agenda')
    expect(meetingNotesSkinMode('handoff')).toBe('handoff')
  })

  it('offers exactly the seven catalogued shapes', () => {
    expect(MEETING_NOTES_SKINS).toEqual([
      'agenda',
      'minutes',
      'stand_up',
      'retrospective',
      'one_to_one',
      'decision_review',
      'handoff',
    ])
  })
})

describe('attendees', () => {
  it('reads one typed line back as separate people', () => {
    expect(meetingAttendees(base().attendees)).toEqual(['Amir Hamza', 'Rae Ndlovu', 'Jun Park'])
  })

  it('drops empty fragments rather than showing blank chips', () => {
    expect(meetingAttendees('Amir,, ,Rae')).toEqual(['Amir', 'Rae'])
    expect(meetingAttendees(undefined)).toEqual([])
  })
})

describe('per-skin extras', () => {
  it('keeps one skin\'s item extras invisible to another', () => {
    const withTimebox = dataWithMeetingItemDetails(base(), 'agenda', 'one', { minutes: '15' })
    expect(meetingItemDetails(withTimebox, 'agenda').one?.minutes).toBe('15')
    expect(meetingItemDetails(withTimebox, 'minutes').one).toBeUndefined()
  })

  it('keeps panels and items side by side in the same skin state', () => {
    let data = dataWithMeetingPanels(base(), 'stand_up', { blockers: 'Waiting on review' })
    data = dataWithMeetingItemDetails(data, 'stand_up', 'one', { owner: 'Rae' })
    expect(meetingPanels(data, 'stand_up').blockers).toBe('Waiting on review')
    expect(meetingItemDetails(data, 'stand_up').one?.owner).toBe('Rae')
  })

  it('clears an emptied field instead of persisting a blank string', () => {
    const set = dataWithMeetingItemDetails(base(), 'agenda', 'one', { minutes: '15' })
    const cleared = dataWithMeetingItemDetails(set, 'agenda', 'one', { minutes: '' })
    expect(meetingItemDetails(cleared, 'agenda').one).toBeUndefined()
    expect(cleared.skinStates?.agenda).toBeUndefined()
  })

  it('drops the acknowledgement flag when it is turned back off', () => {
    const signed = dataWithMeetingPanels(base(), 'handoff', { acknowledged: true, acknowledgedBy: 'Jun' })
    expect(meetingPanels(signed, 'handoff').acknowledged).toBe(true)
    const undone = dataWithMeetingPanels(signed, 'handoff', { acknowledged: false })
    expect(meetingPanels(undone, 'handoff').acknowledged).toBeUndefined()
    expect(meetingPanels(undone, 'handoff').acknowledgedBy).toBe('Jun')
  })

  it('ignores malformed persisted state rather than throwing on hydrate', () => {
    const hostile = {
      ...base(),
      skinStates: { agenda: { items: ['not', 'a', 'map'] } },
    } as unknown as MeetingNotesData
    expect(meetingItemDetails(hostile, 'agenda')).toEqual({})
    expect(meetingPanels(hostile, 'agenda')).toEqual({})
  })
})

describe('removing an action', () => {
  it('takes that action\'s extras out of every skin, not just the worn one', () => {
    let data = dataWithMeetingItemDetails(base(), 'agenda', 'one', { minutes: '15' })
    data = dataWithMeetingItemDetails(data, 'decision_review', 'one', { review: '2026-08-01' })
    data = dataWithMeetingItemDetails(data, 'decision_review', 'two', { owner: 'Rae' })

    const next = removeMeetingAction(data, 'one')
    expect(next.actions.map((a) => a.id)).toEqual(['two'])
    expect(meetingItemDetails(next, 'agenda').one).toBeUndefined()
    expect(meetingItemDetails(next, 'decision_review').one).toBeUndefined()
    // A surviving action keeps everything it had.
    expect(meetingItemDetails(next, 'decision_review').two?.owner).toBe('Rae')
  })

  it('leaves the shared notes and attendees untouched', () => {
    const next = removeMeetingAction(base(), 'one')
    expect(next.notes).toBe('Shipping the skin roller.')
    expect(next.attendees).toBe(base().attendees)
  })
})

describe('derived readings', () => {
  it('totals only positive whole timeboxes', () => {
    let data = dataWithMeetingItemDetails(base(), 'agenda', 'one', { minutes: '15' })
    data = dataWithMeetingItemDetails(data, 'agenda', 'two', { minutes: '-5' })
    expect(agendaTotalMinutes(data)).toBe(15)
  })

  it('is zero when no topic has been timeboxed', () => {
    expect(agendaTotalMinutes(base())).toBe(0)
  })

  it('counts decisions whose review date has arrived', () => {
    let data = dataWithMeetingItemDetails(base(), 'decision_review', 'one', { review: '2026-07-20' })
    data = dataWithMeetingItemDetails(data, 'decision_review', 'two', { review: '2026-09-01' })
    expect(decisionsDueForReview(data, '2026-07-26')).toBe(1)
  })

  it('counts open actions', () => {
    expect(openActionCount(base())).toBe(1)
  })
})
