import { describe, expect, it } from 'vitest'
import { resolveWidgetMention } from '../utils/thoughtInterpreter'
import { AUTOMATION_CORE_CATALOG, AUTOMATION_CORE_TYPES } from './automationCoreCatalog'
import { commandsFor, fieldsFor } from './fields'
import { isWidgetTypePublic, WIDGET_REGISTRY } from './registry'
import { PUBLIC_AUTOMATION_CORE_TYPES } from './registry/automationCore'

describe('core automation widgets',()=>{
  it('ships the complete irreducible automation catalog',()=>{
    expect(AUTOMATION_CORE_TYPES).toHaveLength(48)
    expect(new Set(AUTOMATION_CORE_TYPES).size).toBe(48)
  })
  it.each(AUTOMATION_CORE_TYPES)('%s is registered, persistent, command-capable and wireable',type=>{
    const definition=WIDGET_REGISTRY[type],data=definition.defaultData()
    expect(definition.label).toBe(AUTOMATION_CORE_CATALOG[type].label)
    expect(JSON.parse(JSON.stringify(data))).toEqual(data)
    expect(fieldsFor(type).some(field=>field.set)).toBe(true)
    expect(fieldsFor(type).some(field=>!field.set)).toBe(true)
    expect(commandsFor(type).length).toBeGreaterThanOrEqual(4)
    commandsFor(type).forEach(command=>expect(()=>command.run(data)).not.toThrow())
  })
  it.each([['for each','loop'],['incoming webhook','webhook_receiver'],['spawn widget','widget_creator'],['fifo','queue'],['javascript','script_block'],['audit log','run_ledger']] as const)('discovers %s as %s locally',(phrase,type)=>expect(resolveWidgetMention(phrase)).toBe(type))
  it('publishes only automation cards with dedicated, verified semantics',()=>{
    expect(isWidgetTypePublic('queue')).toBe(true)
    expect(isWidgetTypePublic('state_machine')).toBe(true)
    expect(isWidgetTypePublic('http_request')).toBe(true)
    expect(isWidgetTypePublic('script_block')).toBe(false)
    expect(isWidgetTypePublic('secret_reference')).toBe(false)
    expect(isWidgetTypePublic('run_ledger')).toBe(false)
    expect([...PUBLIC_AUTOMATION_CORE_TYPES].every(isWidgetTypePublic)).toBe(true)
  })
})
