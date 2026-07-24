import { describe, expect, it } from 'vitest'
import type { AtlasWidgetData, BarChartData, ChecklistData, GoalTrackerData, TimekeeperData } from '../types/spatial'
import { resolveWidgetMention } from '../utils/thoughtInterpreter'
import { consolidateWidgetData } from '../utils/consolidatedWidgetData'
import { ATLAS_TYPES, atlasTypeForPhrase, switchAtlasMode } from './atlasCatalog'
import { CONSOLIDATED_WIDGET_MODES, CONSOLIDATED_WIDGET_REPLACEMENTS, isWidgetTypePublic, WIDGET_REGISTRY } from './registry'

describe('consolidated widget modes',()=>{
  it('offers one Tracker while preserving legacy atlas types for old boards',()=>{
    expect(isWidgetTypePublic('tracker')).toBe(true)
    expect(ATLAS_TYPES.every(type=>!isWidgetTypePublic(type))).toBe(true)
    expect((WIDGET_REGISTRY.tracker.defaultData() as AtlasWidgetData).trackerMode).toBe('price_book')
    expect(atlasTypeForPhrase('help me water my houseplants')).toBe('plant_care')
    expect(resolveWidgetMention('plant care')).toBe('tracker')
  })

  it('restores edited Tracker state after visiting another mode',()=>{
    const priceBook={...(WIDGET_REGISTRY.tracker.defaultData() as AtlasWidgetData),primary:42,text:'My saved price'}
    const hydration=switchAtlasMode(priceBook,'hydration')
    expect(hydration.trackerMode).toBe('hydration')
    const restored=switchAtlasMode({...hydration,primary:1200},'price_book')
    expect(restored.primary).toBe(42)
    expect(restored.text).toBe('My saved price')
    expect(restored.modeStates?.hydration?.primary).toBe(1200)
  })

  it('offers one Timer with independent state for each specialized mode',()=>{
    const data=WIDGET_REGISTRY.timekeeper.defaultData() as TimekeeperData
    expect(isWidgetTypePublic('timekeeper')).toBe(true)
    expect(['timer','pomodoro','stopwatch'].every(type=>!isWidgetTypePublic(type as 'timer'|'pomodoro'|'stopwatch'))).toBe(true)
    expect(data.mode).toBe('countdown')
    expect(data.pomodoro.workMinutes).toBe(25)
    expect(data.stopwatch.laps).toEqual([])
    expect(resolveWidgetMention('pomodoro timer')).toBe('timekeeper')
  })

  it('publishes every consolidated family and hides all former standalone cards',()=>{
    const canonical=['notes','bar_chart','decision','grade_calc','date_picker','sketchpad','goal_tracker','flashcards','checklist'] as const
    expect(canonical.every(isWidgetTypePublic)).toBe(true)
    expect(Object.keys(CONSOLIDATED_WIDGET_REPLACEMENTS).every(type=>!isWidgetTypePublic(type as keyof typeof WIDGET_REGISTRY))).toBe(true)
    expect(WIDGET_REGISTRY.notes.skins?.map(skin=>skin.value)).toEqual(['plain','sticky','quote'])
    expect(WIDGET_REGISTRY.bar_chart.skins?.map(skin=>skin.value)).toEqual(['bar','line','donut','pie'])
    expect(WIDGET_REGISTRY.checklist.skins).toHaveLength(7)
  })

  it('starts shared-view families with one canonical data source',()=>{
    const chart=WIDGET_REGISTRY.bar_chart.defaultData() as BarChartData
    const tasks=WIDGET_REGISTRY.checklist.defaultData() as ChecklistData
    const goal=WIDGET_REGISTRY.goal_tracker.defaultData() as GoalTrackerData
    expect(chart.mode).toBe('bar')
    expect(chart.bars.every(item=>Boolean(item.color))).toBe(true)
    expect(tasks.mode).toBe('list')
    expect(tasks.items[0]).toMatchObject({status:'todo',day:0,start:0,span:1})
    expect(goal).toMatchObject({mode:'milestones',simple:{percent:40},hours:{targetHours:10}})
  })

  it('converts generated legacy data into the matching canonical mode',()=>{
    for(const [legacyType,replacementType] of Object.entries(CONSOLIDATED_WIDGET_REPLACEMENTS) as Array<[keyof typeof WIDGET_REGISTRY,keyof typeof WIDGET_REGISTRY]>) {
      const converted=consolidateWidgetData(legacyType,WIDGET_REGISTRY[legacyType].defaultData())
      expect(converted.type).toBe(replacementType)
      expect((converted.data as {mode?:string}).mode).toBe(CONSOLIDATED_WIDGET_MODES[legacyType])
    }
  })

  it.each([
    ['sticky note','notes'],['quote','notes'],['line chart','bar_chart'],['pie chart','bar_chart'],
    ['random picker','decision'],['gpa tracker','grade_calc'],['date & time','date_picker'],
    ['excalidraw','sketchpad'],['progress','goal_tracker'],['study goal','goal_tracker'],
    ['okrs','goal_tracker'],['vocabulary','flashcards'],['quiz','flashcards'],['kanban','checklist'],
    ['assignments','checklist'],['daily agenda','checklist'],['week planner','checklist'],
    ['timeline','checklist'],['priority matrix','checklist'],
  ] as const)('routes %s to its consolidated widget', (mention,expected)=>{
    expect(resolveWidgetMention(mention)).toBe(expected)
  })
})
