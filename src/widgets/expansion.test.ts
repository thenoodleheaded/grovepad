import { describe, expect, it } from 'vitest'
import type { DebtPayoffData, ExpenseSplitData, ModuleType } from '../types/spatial'
import { commandsFor, fieldsFor } from './fields'
import { appendSample, projectDebtPayoff, settleExpenses } from './expansionMath'
import { WIDGET_REGISTRY } from './registry'

const EXPANSION_TYPES: ModuleType[] = [
  'clock_pulse','comparator','aggregator','range_mapper','latch','random_picker','sequencer','template','recorder','notifier',
  'subscriptions','debt_payoff','expense_split','invoices','meal_planner','recipe','home_maintenance','chore_rotation','renewals_vault','medications','workout_plan','job_applications','okr','decision_journal','weekly_review','snippet_library','keep_in_touch','gifts_occasions','trip_itinerary','guest_list',
]

describe('widget expansion contracts', () => {
  it.each(EXPANSION_TYPES)('%s is registered, offline-ready, and field-readable', (type) => {
    const definition = WIDGET_REGISTRY[type]
    const data = definition.defaultData()
    expect(definition.type).toBe(type)
    expect(['automation','life']).toContain(definition.category)
    expect(fieldsFor(type).length).toBeGreaterThanOrEqual(2)
    for (const field of fieldsFor(type)) {
      expect(() => field.get(data)).not.toThrow()
      if (field.set) expect(() => field.set!(data, field.get(data))).not.toThrow()
    }
  })

  it('exposes every planned automation command', () => {
    expect(commandsFor('latch').map((item) => item.key)).toContain('capture')
    expect(commandsFor('sequencer').map((item) => item.key)).toContain('advance')
    expect(commandsFor('random_picker').map((item) => item.key)).toContain('roll')
    expect(commandsFor('recorder').map((item) => item.key)).toContain('record')
    expect(commandsFor('chore_rotation').map((item) => item.key)).toContain('rotate')
    expect(commandsFor('weekly_review').map((item) => item.key)).toContain('new_period')
  })

  it('projects debt payoff with avalanche math', () => {
    const data: DebtPayoffData = { debts:[{id:'d',name:'Card',balance:1000,apr:12,minPayment:50}],extraPayment:50,strategy:'avalanche' }
    const result = projectDebtPayoff(data, new Date('2026-01-01T00:00:00Z'))
    expect(result.viable).toBe(true)
    expect(result.months).toBeGreaterThan(9)
    expect(result.months).toBeLessThan(13)
    expect(result.interest).toBeGreaterThan(0)
  })

  it('produces a minimal balanced expense settlement', () => {
    const data: ExpenseSplitData = { people:['You','Sam','Ali'],you:'You',expenses:[{id:'e',desc:'Stay',amount:300,paidBy:'You',splitAmong:['You','Sam','Ali']}] }
    expect(settleExpenses(data)).toEqual([
      {from:'Sam',to:'You',amount:100},
      {from:'Ali',to:'You',amount:100},
    ])
  })

  it('caps recorder series at 400 samples', () => {
    let samples = [] as ReturnType<typeof appendSample>
    for (let index=0; index<430; index++) samples=appendSample(samples,index,index)
    expect(samples).toHaveLength(400)
    expect(samples[0]?.v).toBe(30)
  })
})
