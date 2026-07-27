import { describe, expect, it } from 'vitest'
import type { PollData } from '../types/spatial'
import { restingFace } from '../utils/restingFace'
import { dataWearingSkin, dataWithSkinState, skinsFor } from '../utils/widgetSkins'
import { computeDataHeight } from '../store/widgetSizing'
import { commandsFor, fieldDescriptor } from './fields'
import { DATA_TRACKING_WIDGET_DEFINITIONS } from './registry/dataTrackingWidgets'
import { WIDGET_REGISTRY } from './registry'

const expected = [
  'bars',
  'donut',
  'approval',
  'ranked_choice',
  'pairwise',
  'live_room',
  'anonymous',
]

const base = (): PollData => ({
  skin: 'bars',
  question: 'Which direction?',
  options: [
    { id: 'a', label: 'Coastal route', votes: 3 },
    { id: 'b', label: 'Mountain pass', votes: 1 },
  ],
})

describe('Poll skin registry contract', () => {
  it('offers all seven purpose-built skins in catalogue order', () => {
    expect(
      skinsFor({ type: 'poll' }, WIDGET_REGISTRY.poll).map((skin) => skin.value),
    ).toEqual(expected)
  })

  it('declares every skin by hand with a distinct icon', () => {
    const skins = DATA_TRACKING_WIDGET_DEFINITIONS.poll.skins
    expect(skins.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(skins.map((skin) => skin.icon)).size).toBe(expected.length)
  })

  it('persists the worn skin without disturbing the canonical tally', () => {
    const original = base()
    const next = dataWearingSkin(
      { type: 'poll', data: original },
      'donut',
      WIDGET_REGISTRY.poll,
    ) as PollData
    expect(WIDGET_REGISTRY.poll.skinField).toBe('skin')
    expect(next.skin).toBe('donut')
    expect(next.options).toEqual(original.options)
    expect(next).not.toHaveProperty('mode')
  })

  it('keeps a collected ballot when another skin is worn', () => {
    const withBallots = dataWithSkinState(
      base(),
      'ranked_choice',
      { ballots: [['b', 'a']] },
    ) as PollData
    const next = dataWearingSkin(
      { type: 'poll', data: withBallots },
      'pairwise',
      WIDGET_REGISTRY.poll,
    ) as PollData
    expect(next.skin).toBe('pairwise')
    expect(next.skinStates?.ranked_choice).toEqual({ ballots: [['b', 'a']] })
  })

  it('lets the renderer own every schema-extension editor', () => {
    for (const skin of skinsFor({ type: 'poll' }, WIDGET_REGISTRY.poll)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(WIDGET_REGISTRY.poll.rendererOwnedSkinDetails).toContain(skin.value)
    }
  })

  it('gives a duel plus its matrix more room than a plain bar list', () => {
    const bars = computeDataHeight('poll', base())
    const pairwise = computeDataHeight('poll', { ...base(), skin: 'pairwise' })
    expect(pairwise).toBeGreaterThan(bars)
  })
})

describe('Poll circuit and resting-face contract', () => {
  it('publishes the total, the leader, and the leading share', () => {
    const data = base()
    expect(fieldDescriptor('poll', 'votes')?.get(data)).toBe(4)
    expect(fieldDescriptor('poll', 'leader')?.get(data)).toBe('Coastal route')
    expect(fieldDescriptor('poll', 'leader_share')?.get(data)).toBe(75)
  })

  it('calls a level poll tied rather than picking a winner', () => {
    const level: PollData = {
      ...base(),
      options: base().options.map((option) => ({ ...option, votes: 2 })),
    }
    expect(fieldDescriptor('poll', 'leader')?.get(level)).toBe('Tied')
  })

  it('clears collected ballots along with the votes', () => {
    const busy = dataWithSkinState(base(), 'approval', { ballots: 6 }) as PollData
    const cleared = commandsFor('poll').find((command) => command.key === 'reset')?.run(busy) as PollData
    expect(cleared.options.every((option) => option.votes === 0)).toBe(true)
    expect(cleared.skinStates).toBeUndefined()
  })

  it('rests as its real options with their share of the vote', () => {
    const face = restingFace({
      type: 'poll',
      title: 'Route',
      size: { width: 340, height: 240 },
      data: base(),
    }).model
    expect(face.kind).toBe('rows')
    if (face.kind !== 'rows') return
    expect(face.rows[0]).toMatchObject({ label: 'Coastal route', value: '75%' })
    expect(face.rows[1]).toMatchObject({ label: 'Mountain pass', value: '25%' })
  })

  it('never leaks an unrevealed room result while folded', () => {
    const hidden: PollData = { ...base(), skin: 'live_room' }
    const face = restingFace({
      type: 'poll',
      title: 'Route',
      size: { width: 340, height: 240 },
      data: hidden,
    }).model
    if (face.kind !== 'rows') throw new Error('expected rows')
    expect(face.rows.every((row) => row.value === '•••')).toBe(true)

    const revealed = restingFace({
      type: 'poll',
      title: 'Route',
      size: { width: 340, height: 240 },
      data: dataWithSkinState(hidden, 'live_room', { revealed: true }) as PollData,
    }).model
    if (revealed.kind !== 'rows') throw new Error('expected rows')
    expect(revealed.rows[0]?.value).toBe('75%')
  })

  it('collapses to a bare icon when nothing is named and nothing is cast', () => {
    const blank: PollData = {
      skin: 'bars',
      question: '',
      options: [{ id: 'a', label: '', votes: 0 }],
    }
    expect(restingFace({
      type: 'poll',
      title: 'Poll',
      size: { width: 340, height: 240 },
      data: blank,
    }).model.kind).toBe('icon')
  })
})
