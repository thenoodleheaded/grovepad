import { describe, expect, it } from 'vitest'
import { formulaReading } from '../components/widgets/modules/formulaSkinModel'
import type { FormulaData } from '../types/widgetDataWorkflow'
import { restingFace } from '../utils/restingFace'
import { dataWearingSkin, dataWithSkinState, skinsFor } from '../utils/widgetSkins'
import { fieldDescriptor } from './fields'
import { MEDIA_INPUT_WIDGET_DEFINITIONS } from './registry/mediaInputWidgets'
import { WIDGET_REGISTRY } from './registry'

const expected = [
  'two_input',
  'percent_change',
  'ratio',
  'growth',
  'expression',
  'weighted_score',
  'conditional',
]

const card = (data: Partial<FormulaData>): FormulaData => ({
  label: 'Runway',
  a: 200,
  b: 250,
  operator: 'add',
  ...data,
})

describe('Formula skin registry contract', () => {
  it('offers every catalogued question, in catalogue order', () => {
    expect(
      skinsFor({ type: 'formula' }, WIDGET_REGISTRY.formula).map((skin) => skin.value),
    ).toEqual(expected)
  })

  it('names every Formula skin by hand, each with its own icon', () => {
    const declared = MEDIA_INPUT_WIDGET_DEFINITIONS.formula.skins!
    expect(declared.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(declared.map((skin) => skin.icon)).size).toBe(expected.length)
  })

  /**
   * `a` and `b` are what a wire writes into this card. Persisting the chosen
   * skin anywhere near them — or letting the catalogue merge move the field to
   * `mode`, which `FormulaData` does not have — would let changing appearance
   * change an operand.
   */
  it('persists the chosen skin in `skin` and never disturbs the operands', () => {
    expect(WIDGET_REGISTRY.formula.skinField).toBe('skin')

    const next = dataWearingSkin(
      { type: 'formula', data: card({}) },
      'ratio',
      WIDGET_REGISTRY.formula,
    ) as FormulaData

    expect(next.skin).toBe('ratio')
    expect(next.a).toBe(200)
    expect(next.b).toBe(250)
    expect(next.operator).toBe('add')
    expect(next).not.toHaveProperty('mode')
  })

  it('keeps one skin’s specialist state when another is worn', () => {
    const withExpression = dataWithSkinState(
      card({ skin: 'expression' }),
      'expression',
      { expression: 'a * b' },
    ) as FormulaData
    const alsoConditional = dataWithSkinState(
      withExpression as never,
      'conditional',
      { comparator: 'lt', whenTrue: 5, whenFalse: 0 },
    ) as FormulaData
    const worn = dataWearingSkin(
      { type: 'formula', data: alsoConditional },
      'conditional',
      WIDGET_REGISTRY.formula,
    ) as FormulaData

    expect(worn.skin).toBe('conditional')
    expect(worn.skinStates?.expression).toEqual({ expression: 'a * b' })
    expect(worn.skinStates?.conditional).toMatchObject({ comparator: 'lt' })
  })

  /**
   * The contract that makes these skins honest: the number a circuit reads is
   * the number the card shows. If `result` ever answered the two-input sum
   * while a Percent Change card displayed a percentage, every gate downstream
   * would be acting on a figure nobody on the board can see.
   */
  it('publishes the answer the worn skin actually shows', () => {
    const result = fieldDescriptor('formula', 'result')
    expect(result).toBeDefined()

    const cases: FormulaData[] = [
      card({}),
      card({ skin: 'percent_change' }),
      card({ skin: 'ratio' }),
      card({ skin: 'growth', a: 1000, b: 10 }),
      card({ skin: 'expression', skinStates: { expression: { expression: 'a - b' } } }),
      card({ skin: 'weighted_score', skinStates: { weighted_score: { weightA: 3, weightB: 1 } } }),
      card({ skin: 'conditional', skinStates: { conditional: { comparator: 'lt', whenTrue: 9, whenFalse: 2 } } }),
    ]

    for (const data of cases) {
      expect(result!.get(data), `${data.skin ?? 'two_input'} result`)
        .toBe(formulaReading(data).value)
    }

    // Spot-checks, so a refactor of the shared reading cannot make the loop
    // above agree on the wrong number.
    expect(result!.get(card({}))).toBe(450)
    expect(result!.get(card({ skin: 'percent_change' }))).toBe(25)
    expect(result!.get(card({ skin: 'conditional' }))).toBe(0)
  })

  it('survives a wire write with its skin and specialist state intact', () => {
    const worn = card({
      skin: 'expression',
      skinStates: { expression: { expression: 'a * b' } },
    })

    const write = fieldDescriptor('formula', 'a')?.set
    expect(write, 'A must stay writable for wires').toBeDefined()
    const written = write!(worn, 10) as FormulaData

    expect(written.a).toBe(10)
    expect(written.skin).toBe('expression')
    expect(written.skinStates?.expression).toEqual({ expression: 'a * b' })
    // The published answer moves with the write, in the skin's own terms.
    expect(fieldDescriptor('formula', 'result')!.get(written)).toBe(2500)
  })

  it('lets the renderer own every skin that keeps specialist data', () => {
    expect(WIDGET_REGISTRY.formula.rendererOwnedSkinDetails).toEqual([
      'expression',
      'weighted_score',
      'conditional',
    ])
    for (const skin of skinsFor({ type: 'formula' }, WIDGET_REGISTRY.formula)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(
        WIDGET_REGISTRY.formula.rendererOwnedSkinDetails,
        `${skin.value} needs a renderer-owned detail editor`,
      ).toContain(skin.value)
    }
  })

  // The folded tile is the card drawn small, so it must report the same answer
  // in the same words — never the two-input sum of a percent card.
  it('rests as the answer the worn skin publishes', () => {
    const face = (data: Partial<FormulaData>) => restingFace({
      type: 'formula',
      title: 'Runway',
      size: { width: 320, height: 200 },
      data: card(data),
    }).model

    // Two-input folds to the sum as it is written, over its answer.
    expect(face({})).toMatchObject({
      kind: 'lines',
      eyebrow: { label: 'Result' },
      total: { right: '450' },
    })
    // Percent change is a movement, so it folds to where it went from and to.
    expect(face({ skin: 'percent_change' })).toMatchObject({
      kind: 'split',
      eyebrow: { label: 'Percent change', note: '+25%' },
    })
    // Growth is a projection: the folded card keeps the periods themselves.
    const growth = face({ skin: 'growth', a: 1000, b: 10 })
    expect(growth).toMatchObject({ kind: 'bars', eyebrow: { label: 'Growth', note: '10%' } })
    if (growth.kind !== 'bars') throw new Error('expected a growth projection')
    expect(growth.bars[0]).toMatchObject({ label: 'Period 1', value: '1.1k' })
  })
})
