import { describe, expect, it } from 'vitest'
import type { ProsConsData } from '../types/spatial'
import {
  dataWithDebateCounter,
  dataWithProsConsWeight,
  dataWithRedTeamDetail,
  dataWithReversibility,
  dataWithoutItem,
  debatePairs,
  irreversibleCount,
  prosConsVerdict,
  redTeamExposure,
  weightedVerdict,
} from '../components/widgets/modules/prosConsSkinModel'
import { restingFace } from '../utils/restingFace'
import { dataWearingSkin, skinsFor } from '../utils/widgetSkins'
import { fieldDescriptor } from './fields'
import { PLANNING_WIDGET_DEFINITIONS } from './registry/planningWidgets'
import { WIDGET_REGISTRY } from './registry'

const expected = [
  'balance',
  'debate',
  'red_team',
  'weighted_trade_off',
  'reversible_irreversible',
]

const base = (): ProsConsData => ({
  skin: 'balance',
  topic: 'Move the launch',
  pros: [
    { id: 'p1', text: 'More runway' },
    { id: 'p2', text: 'Better polish' },
  ],
  cons: [{ id: 'c1', text: 'Misses the conference' }],
})

describe('Pros & Cons skin registry contract', () => {
  it('offers all five purpose-built skins in catalogue order', () => {
    expect(
      skinsFor({ type: 'pros_cons' }, WIDGET_REGISTRY.pros_cons).map((skin) => skin.value),
    ).toEqual(expected)
  })

  it('declares every skin by hand with a distinct icon', () => {
    const skins = PLANNING_WIDGET_DEFINITIONS.pros_cons.skins
    expect(skins.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(skins.map((skin) => skin.icon)).size).toBe(expected.length)
  })

  it('persists the worn skin without disturbing the canonical sheet', () => {
    const original = base()
    const next = dataWearingSkin(
      { type: 'pros_cons', data: original },
      'red_team',
      WIDGET_REGISTRY.pros_cons,
    ) as ProsConsData
    expect(WIDGET_REGISTRY.pros_cons.skinField).toBe('skin')
    expect(next.skin).toBe('red_team')
    expect(next.pros).toEqual(original.pros)
    expect(next.cons).toEqual(original.cons)
    expect(next.topic).toBe(original.topic)
    expect(next).not.toHaveProperty('mode')
  })

  it('keeps specialist state when another skin is worn', () => {
    const withCounter = dataWithDebateCounter(base(), 'p1', 'Runway costs salary')
    const next = dataWearingSkin(
      { type: 'pros_cons', data: withCounter },
      'weighted_trade_off',
      WIDGET_REGISTRY.pros_cons,
    ) as ProsConsData
    expect(next.skin).toBe('weighted_trade_off')
    expect(next.skinStates?.debate).toEqual({ counters: { p1: 'Runway costs salary' } })
  })

  it('lets the renderer own both schema-extension editors', () => {
    expect(WIDGET_REGISTRY.pros_cons.rendererOwnedSkinDetails).toEqual([
      'weighted_trade_off',
      'reversible_irreversible',
    ])
    for (const skin of skinsFor({ type: 'pros_cons' }, WIDGET_REGISTRY.pros_cons)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(WIDGET_REGISTRY.pros_cons.rendererOwnedSkinDetails).toContain(skin.value)
    }
  })
})

describe('Pros & Cons skin behavior', () => {
  it('ignores empty draft rows when weighing the sheet', () => {
    const verdict = prosConsVerdict({
      pros: [{ id: 'p1', text: 'Real' }, { id: 'p2', text: '   ' }],
      cons: [{ id: 'c1', text: 'Also real' }],
    })
    expect(verdict).toMatchObject({ pros: 1, cons: 1, leaning: 'even', proShare: 50 })
  })

  it('pairs each pro with the con opposite it and its own rebuttal', () => {
    const data = dataWithDebateCounter(base(), 'p1', 'Runway costs salary')
    const pairs = debatePairs(data)
    expect(pairs).toHaveLength(2)
    expect(pairs[0]).toMatchObject({ counter: 'Runway costs salary' })
    expect(pairs[0]?.con?.id).toBe('c1')
    expect(pairs[1]?.con).toBeNull()
    expect(pairs[1]?.counter).toBe('')
  })

  it('counts failure modes that no evidence answers yet', () => {
    const answered = dataWithRedTeamDetail(base(), 'c1', {
      severity: 'high',
      evidence: 'Recording ships instead',
    })
    expect(redTeamExposure(answered)).toEqual({ high: 1, unanswered: 0 })
    expect(redTeamExposure(base())).toEqual({ high: 0, unanswered: 1 })
  })

  it('weighs points by importance and clamps the dial to 1–5', () => {
    let data = dataWithProsConsWeight(base(), 'p1', 9)
    data = dataWithProsConsWeight(data, 'c1', 0)
    // p1 clamps to 5, p2 stays at the default 3, c1 clamps to 1.
    expect(weightedVerdict(data)).toMatchObject({ pros: 8, cons: 1, leaning: 'pro' })
  })

  it('treats an unmarked consequence as reversible', () => {
    expect(irreversibleCount(base())).toBe(0)
    const marked = dataWithReversibility(base(), 'c1', 'irreversible')
    expect(irreversibleCount(marked)).toBe(1)
    expect(marked.skinStates?.reversible_irreversible)
      .toEqual({ reversibility: { c1: 'irreversible' } })
  })

  it('removes a point together with every skin detail hanging off it', () => {
    let data = dataWithDebateCounter(base(), 'p1', 'Counterpoint')
    data = dataWithProsConsWeight(data, 'p1', 5)
    const next = dataWithoutItem(data, 'pro', 'p1')
    expect(next.pros.map((item) => item.id)).toEqual(['p2'])
    expect(next.skinStates?.debate?.counters).toEqual({})
    expect(next.skinStates?.weighted_trade_off?.weights).toEqual({})
  })
})

describe('Pros & Cons circuit and resting-face contract', () => {
  it('publishes the same counts no matter which skin is worn', () => {
    const weighted = dataWithProsConsWeight(
      { ...base(), skin: 'weighted_trade_off' },
      'p1',
      5,
    )
    expect(fieldDescriptor('pros_cons', 'pros_count')?.get(weighted)).toBe(2)
    expect(fieldDescriptor('pros_cons', 'cons_count')?.get(weighted)).toBe(1)
  })

  it('rests with the number the worn skin is about', () => {
    const data = dataWithReversibility(
      { ...base(), skin: 'reversible_irreversible' },
      'c1',
      'irreversible',
    )
    const face = restingFace({
      type: 'pros_cons',
      title: 'Launch',
      size: { width: 340, height: 200 },
      data,
    }).model
    expect(face.kind).toBe('rows')
    if (face.kind !== 'rows') return
    expect(face.rows[0]).toMatchObject({ label: 'More runway', value: 'undoable' })
    expect(face.rows[2]).toMatchObject({ label: 'Misses the conference', value: 'one-way' })
  })
})
