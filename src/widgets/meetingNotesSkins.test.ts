import { describe, expect, it } from 'vitest'
import type { MeetingNotesData } from '../types/spatial'
import { restingFace } from '../utils/restingFace'
import { dataWearingSkin, dataWithSkinState, skinsFor } from '../utils/widgetSkins'
import { fieldDescriptor } from './fields'
import { PLANNING_WIDGET_DEFINITIONS } from './registry/planningWidgets'
import { WIDGET_REGISTRY } from './registry'

const expected = [
  'agenda',
  'minutes',
  'stand_up',
  'retrospective',
  'one_to_one',
  'decision_review',
  'handoff',
]

const base = (): MeetingNotesData => ({
  skin: 'agenda',
  date: '2026-07-26',
  attendees: 'Amir Hamza, Rae Ndlovu',
  notes: 'Shipping the skin roller.',
  actions: [
    { id: 'one', text: 'Pick the launch date', done: false },
    { id: 'two', text: 'Draft the changelog', done: true },
  ],
})

describe('Meeting Notes skin registry contract', () => {
  it('offers all seven purpose-built skins in catalogue order', () => {
    expect(
      skinsFor({ type: 'meeting_notes' }, WIDGET_REGISTRY.meeting_notes).map((skin) => skin.value),
    ).toEqual(expected)
  })

  it('declares every skin by hand with a distinct icon', () => {
    const skins = PLANNING_WIDGET_DEFINITIONS.meeting_notes.skins
    expect(skins.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(skins.map((skin) => skin.icon)).size).toBe(expected.length)
  })

  it('persists the worn skin without disturbing the canonical record', () => {
    const original = base()
    const next = dataWearingSkin(
      { type: 'meeting_notes', data: original },
      'retrospective',
      WIDGET_REGISTRY.meeting_notes,
    ) as MeetingNotesData

    expect(WIDGET_REGISTRY.meeting_notes.skinField).toBe('skin')
    expect(next.skin).toBe('retrospective')
    expect(next.date).toBe(original.date)
    expect(next.attendees).toBe(original.attendees)
    expect(next.notes).toBe(original.notes)
    expect(next.actions).toEqual(original.actions)
    expect(next).not.toHaveProperty('mode')
  })

  it('keeps specialist state when another skin is worn', () => {
    const withDecision = dataWithSkinState(
      base(),
      'decision_review',
      { items: { one: { review: '2026-08-01' } } },
    ) as MeetingNotesData

    const next = dataWearingSkin(
      { type: 'meeting_notes', data: withDecision },
      'handoff',
      WIDGET_REGISTRY.meeting_notes,
    ) as MeetingNotesData

    expect(next.skin).toBe('handoff')
    expect(next.skinStates?.decision_review).toEqual({
      items: { one: { review: '2026-08-01' } },
    })
  })

  it('lets the renderer own both schema-extension editors', () => {
    expect(WIDGET_REGISTRY.meeting_notes.rendererOwnedSkinDetails).toEqual([
      'decision_review',
      'handoff',
    ])
    for (const skin of skinsFor({ type: 'meeting_notes' }, WIDGET_REGISTRY.meeting_notes)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(WIDGET_REGISTRY.meeting_notes.rendererOwnedSkinDetails).toContain(skin.value)
    }
  })

  it('starts new cards on a real skin so the roller never opens on a blank', () => {
    const fresh = WIDGET_REGISTRY.meeting_notes.defaultData() as MeetingNotesData
    expect(expected).toContain(fresh.skin)
  })
})

describe('Meeting Notes circuit and resting-face contract', () => {
  it('keeps the automation surface reading the same actions under every skin', () => {
    const done = fieldDescriptor('meeting_notes', 'actions_done')
    expect(done?.get(base())).toBe(false)

    const allDone: MeetingNotesData = {
      ...base(),
      skin: 'handoff',
      actions: base().actions.map((a) => ({ ...a, done: true })),
    }
    expect(done?.get(allDone)).toBe(true)
  })

  it('rests as the work it left behind rather than a bare icon', () => {
    const data = dataWithSkinState(
      base(),
      'agenda',
      { items: { one: { minutes: '15' } } },
    ) as MeetingNotesData

    const face = restingFace({
      type: 'meeting_notes',
      title: 'Launch sync',
      size: { width: 340, height: 280 },
      data,
    }).model

    expect(face.kind).toBe('rows')
    if (face.kind !== 'rows') return
    expect(face.rows[0]).toMatchObject({
      label: 'Pick the launch date',
      done: false,
      value: '15 min',
    })
    expect(face.rows[1]).toMatchObject({ label: 'Draft the changelog', done: true })
  })

  it('folds minutes to ruled ledger lines with the owner on the right', () => {
    const data = dataWithSkinState(
      { ...base(), skin: 'minutes' },
      'minutes',
      { items: { one: { owner: 'Rae' } } },
    ) as MeetingNotesData

    const face = restingFace({
      type: 'meeting_notes',
      title: 'Launch sync',
      size: { width: 340, height: 280 },
      data,
    }).model

    expect(face.kind).toBe('lines')
    if (face.kind !== 'lines') return
    expect(face.eyebrow).toMatchObject({ label: 'Minutes' })
    expect(face.lines[0]).toMatchObject({ left: 'Pick the launch date', right: 'Rae' })
    expect(face.lines[1]).toMatchObject({ left: 'Draft the changelog', tone: 'good' })
  })

  it('folds a stand-up to its three lanes plus the asks', () => {
    const data = dataWithSkinState(
      { ...base(), skin: 'stand_up', notes: 'Ship the roller' },
      'stand_up',
      { yesterday: 'Fixed hydration', blockers: 'Waiting on design' },
    ) as MeetingNotesData

    const face = restingFace({
      type: 'meeting_notes',
      title: 'Daily',
      size: { width: 340, height: 280 },
      data,
    }).model

    expect(face).toMatchObject({
      kind: 'columns',
      columns: [
        { label: 'Yesterday', items: [{ label: 'Fixed hydration' }] },
        { label: 'Today', items: [{ label: 'Ship the roller' }] },
        { label: 'Blockers', tone: 'bad', items: [{ label: 'Waiting on design' }] },
        { label: 'Asks', items: [{ label: 'Pick the launch d…' }, {}] },
      ],
    })
  })

  it('folds a retrospective to its 2×2 quadrants, not four columns', () => {
    const data = dataWithSkinState(
      { ...base(), skin: 'retrospective' },
      'retrospective',
      { improve: 'Fewer meetings', learned: 'Ship smaller' },
    ) as MeetingNotesData

    const face = restingFace({
      type: 'meeting_notes',
      title: 'Sprint retro',
      size: { width: 340, height: 280 },
      data,
    }).model

    expect(face).toMatchObject({
      kind: 'columns',
      wrap: 2,
      columns: [
        { label: 'Went well' },
        { label: 'Did not', items: [{ label: 'Fewer meetings' }] },
        { label: 'Learned', items: [{ label: 'Ship smaller' }] },
        { label: 'Next', items: [{ done: false }, { done: true }] },
      ],
    })
  })

  it('flags decisions whose review date has arrived while folded', () => {
    const data = dataWithSkinState(
      { ...base(), skin: 'decision_review' },
      'decision_review',
      { items: { one: { review: '2020-01-01' } } },
    ) as MeetingNotesData

    const face = restingFace({
      type: 'meeting_notes',
      title: 'Decisions',
      size: { width: 340, height: 280 },
      data,
    }).model

    expect(face.kind).toBe('rows')
    if (face.kind !== 'rows') return
    expect(face.eyebrow).toMatchObject({ note: '1 to revisit', tone: 'warn' })
    expect(face.rows[0]).toMatchObject({ label: 'Pick the launch date', tone: 'warn' })
  })

  it('rests a handoff as numbered steps under its sign-off state', () => {
    const data = dataWithSkinState(
      { ...base(), skin: 'handoff' },
      'handoff',
      { acknowledgedBy: 'Rae', acknowledged: true },
    ) as MeetingNotesData

    const face = restingFace({
      type: 'meeting_notes',
      title: 'Handoff',
      size: { width: 340, height: 280 },
      data,
    }).model

    expect(face.kind).toBe('rows')
    if (face.kind !== 'rows') return
    expect(face.eyebrow).toMatchObject({ note: 'Accepted · Rae', tone: 'good' })
    expect(face.rows[0]).toMatchObject({ lead: '1', label: 'Pick the launch date' })
    expect(face.rows[1]).toMatchObject({ lead: '2' })
  })

  it('falls back to the notes when a meeting has no action items yet', () => {
    const face = restingFace({
      type: 'meeting_notes',
      title: 'Launch sync',
      size: { width: 340, height: 280 },
      data: { ...base(), actions: [] },
    }).model

    expect(face).toEqual({ kind: 'text', text: 'Shipping the skin roller.' })
  })

  it('rests as its icon only when the card is genuinely empty', () => {
    const face = restingFace({
      type: 'meeting_notes',
      title: 'Launch sync',
      size: { width: 340, height: 280 },
      data: { ...base(), actions: [], notes: '' },
    }).model

    expect(face).toEqual({ kind: 'icon' })
  })
})
