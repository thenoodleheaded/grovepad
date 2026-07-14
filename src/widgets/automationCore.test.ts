import { describe, expect, it } from 'vitest'
import { resolveWidgetMention } from '../utils/thoughtInterpreter'
import { AUTOMATION_CORE_CATALOG, AUTOMATION_CORE_TYPES } from './automationCoreCatalog'
import { commandsFor, fieldsFor } from './fields'
import { WIDGET_REGISTRY } from './registry'

describe('core automation widgets',()=>{
  it('ships the complete irreducible automation catalog',()=>{
    expect(AUTOMATION_CORE_TYPES).toHaveLength(49)
    expect(new Set(AUTOMATION_CORE_TYPES).size).toBe(49)
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
})
