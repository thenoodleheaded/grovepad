import { describe, expect, it } from 'vitest'
import type { BudgetData } from '../types/spatial'
import { GRID_SIZE } from '../types/spatial'
import { restingFace } from '../utils/restingFace'
import { REST_BAR_LIMIT, REST_ROW_LIMIT } from '../utils/restingFaceModel'
import { dataWearingSkin } from '../utils/widgetSkins'
import { fieldDescriptor } from './fields'
import { widgetDefinition } from './registry'
import { WIDGET_SKIN_BLUEPRINTS } from './skinBlueprints.generated'

describe('Budget skin registry', () => {
  it('keeps all eight purpose-built views in their intended order', () => {
    expect(widgetDefinition('budget').skins?.map((skin) => skin.value)).toEqual([
      'category_plan',
      'envelope',
      'zero_based',
      '50_30_20',
      'cashflow',
      'sinking_funds',
      'shared_budget',
      'project_budget',
    ])
  })

  it('routes advanced settings to the purpose-built renderer', () => {
    expect(widgetDefinition('budget').rendererOwnedSkinDetails).toEqual([
      'cashflow',
      'sinking_funds',
      'shared_budget',
      'project_budget',
    ])
  })

  it('keeps the reviewed catalogue wording and presentation contracts', () => {
    const installed = new Map(
      widgetDefinition('budget').skins?.map((skin) => [skin.value, skin]),
    )
    for (const blueprint of WIDGET_SKIN_BLUEPRINTS.budget) {
      expect(installed.get(blueprint.value)).toMatchObject(blueprint)
    }
  })

  it('creates a roomy, legacy-safe budget and preserves all values while switching skins', () => {
    const definition = widgetDefinition('budget')
    const data = definition.defaultData() as BudgetData
    expect(definition.skinField).toBe('skin')
    expect(definition.defaultSize).toEqual({ width: 400, height: 320 })
    expect(fieldDescriptor('budget', 'total')?.get(data)).toBe(27)

    const withState: BudgetData = {
      ...data,
      skinStates: { shared_budget: { household: 'Home' } },
    }
    expect(dataWearingSkin(
      { type: 'budget', data: withState },
      'shared_budget',
      definition,
    )).toEqual({
      ...withState,
      skin: 'shared_budget',
    })
  })
})

describe('a folded budget shows the number its lens is about', () => {
  const base = (skin: BudgetData['skin'], skinStates?: BudgetData['skinStates']): BudgetData => ({
    currency: '$',
    skin,
    items: [
      { id: 'rent', label: 'Rent', amount: 1200 },
      { id: 'food', label: 'Food', amount: 400 },
      { id: 'fun', label: 'Fun', amount: 100 },
    ],
    ...(skinStates ? { skinStates } : {}),
  })

  const face = (data: BudgetData) =>
    restingFace({ type: 'budget', title: 'Budget', size: { width: 400, height: 320 }, data })

  it('folds Category Plan to spend bars under the plan-remaining verdict', () => {
    const model = face(base('category_plan', {
      category_plan: { actual: { rent: 1200, food: 600 } },
    })).model
    expect(model).toMatchObject({
      kind: 'bars',
      eyebrow: { label: 'Over plan', note: '−$100', tone: 'bad' },
    })
    if (model.kind !== 'bars') return
    // Largest line first, over-spent line marked bad.
    expect(model.bars[0]).toMatchObject({ label: 'Rent', value: '$1.2k', fraction: 1 })
    expect(model.bars[1]).toMatchObject({ label: 'Food', tone: 'bad' })
  })

  it('folds Envelope to what is left in each envelope', () => {
    const model = face(base('envelope', { envelope: { spent: { rent: 300 } } })).model
    expect(model.kind).toBe('bars')
    if (model.kind !== 'bars') return
    expect(model.bars[0]).toMatchObject({ label: 'Rent', value: '$900', fraction: 0.25 })
  })

  it('folds Zero-based to the dollars still unassigned', () => {
    const model = face(base('zero_based', { zero_based: { income: 2000 } })).model
    expect(model).toMatchObject({
      kind: 'gauge',
      primary: '$300',
      secondary: 'Left to assign',
      progress: 0.85,
      tone: 'accent',
    })
  })

  it('folds 50/30/20 to the three rule buckets against their guides', () => {
    const model = face(base('50_30_20', {
      '50_30_20': { buckets: { rent: 'needs', food: 'needs', fun: 'wants' } },
    })).model
    expect(model.kind).toBe('bars')
    if (model.kind !== 'bars') return
    expect(model.bars.map((bar) => bar.label)).toEqual(['Needs 50%', 'Wants 30%', 'Savings 20%'])
    // 1600 of 1700 in needs is above the 50% guide.
    expect(model.bars[0]).toMatchObject({ value: '$1.6k', tone: 'warn' })
  })

  it('folds Cashflow to money in against money out under the net verdict', () => {
    const model = face(base('cashflow', {
      cashflow: { kinds: { rent: 'income' }, dates: {} },
    })).model
    expect(model).toMatchObject({
      kind: 'split',
      eyebrow: { label: 'Net cashflow', note: '$700', tone: 'good' },
      left: { primary: '$1.2k', secondary: 'Money in' },
      right: { primary: '$500', secondary: 'Money out' },
    })
  })

  it('folds Sinking Funds to how funded each goal is', () => {
    const model = face(base('sinking_funds', {
      sinking_funds: { saved: { rent: 1200, food: 100 }, due: {} },
    })).model
    expect(model.kind).toBe('bars')
    if (model.kind !== 'bars') return
    expect(model.bars[0]).toMatchObject({ label: 'Rent', value: '100%', tone: 'good' })
    expect(model.bars[1]).toMatchObject({ label: 'Food', value: '25%' })
  })

  it('folds Shared Budget to who pays for what under the household name', () => {
    const model = face(base('shared_budget', {
      shared_budget: { household: 'Flat 4B', payers: { rent: 'Sam' } },
    })).model
    expect(model).toMatchObject({ kind: 'rows', eyebrow: { label: 'Flat 4B' } })
    if (model.kind !== 'rows') return
    expect(model.rows[0]).toMatchObject({ label: 'Rent', lead: 'Sam', value: '$1.2k' })
    expect(model.rows[1]).toMatchObject({ lead: 'Shared' })
  })

  it('folds Project Budget to the four cost statuses under the project name', () => {
    const model = face(base('project_budget', {
      project_budget: { project: 'Site launch', statuses: { rent: 'paid' } },
    })).model
    expect(model).toMatchObject({ kind: 'bars', eyebrow: { label: 'Site launch' } })
    if (model.kind !== 'bars') return
    expect(model.bars.map((bar) => bar.label)).toEqual(['Forecast', 'Committed', 'Invoiced', 'Paid'])
    expect(model.bars[3]).toMatchObject({ value: '$1.2k', tone: 'good' })
  })

  it('rests an empty budget as a bare icon and stays bounded when full', () => {
    expect(face({ currency: '$', items: [] }).model.kind).toBe('icon')

    const many: BudgetData = {
      currency: '$',
      skin: 'shared_budget',
      items: Array.from({ length: 40 }, (_, index) => ({
        id: `line-${index}`,
        label: `Line ${index}`,
        amount: index + 1,
      })),
    }
    const rows = face(many).model
    if (rows.kind !== 'rows') throw new Error('expected rows')
    expect(rows.rows.length).toBeLessThanOrEqual(REST_ROW_LIMIT)
    expect(rows.overflow).toBe(40 - rows.rows.length)

    const bars = face({ ...many, skin: 'envelope' }).model
    if (bars.kind !== 'bars') throw new Error('expected bars')
    expect(bars.bars.length).toBeLessThanOrEqual(REST_BAR_LIMIT)
  })

  it('measures every skin onto the grid lattice', () => {
    const skins = widgetDefinition('budget').skins?.map((skin) => skin.value) ?? []
    expect(skins.length).toBe(8)
    for (const skin of skins) {
      const { size } = face(base(skin as BudgetData['skin']))
      expect(size.width % GRID_SIZE, `${skin} width off-lattice`).toBe(0)
      expect(size.height % GRID_SIZE, `${skin} height off-lattice`).toBe(0)
    }
  })
})
