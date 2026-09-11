import { describe, expect, it } from 'vitest'
import type { AtlasWidgetData, BarChartData, ChecklistData, GoalTrackerData, TimekeeperData } from '../types/spatial'
import { MODULE_TYPES } from '../types/spatial'
import { resolveWidgetMention } from '../utils/thoughtInterpreter'
import { ATLAS_TYPES, atlasTypeForPhrase, switchAtlasMode } from './atlasCatalog'
import { isWidgetTypePublic, WIDGET_REGISTRY } from './registry'

/** Every card that was folded into another widget as one of its skins. */
const RETIRED_TYPES = [
  'quote', 'sticky_note', 'cornell', 'line_chart', 'pie_chart', 'progress',
  'study_goal', 'okr', 'timer', 'pomodoro', 'stopwatch', 'countdown',
  'world_clock', 'excalidraw', 'random_picker', 'gpa', 'vocab', 'quiz',
  'kanban', 'assignment', 'daily_agenda', 'weekly_planner', 'timeline',
  'priority_matrix',
] as const

describe('consolidated widget skins',()=>{
  it('offers each Atlas system as a widget while preserving Tracker for old boards',()=>{
    expect(isWidgetTypePublic('tracker')).toBe(false)
    expect(ATLAS_TYPES.every(isWidgetTypePublic)).toBe(true)
    expect((WIDGET_REGISTRY.tracker.defaultData() as AtlasWidgetData).trackerMode).toBe('price_book')
    expect(atlasTypeForPhrase('help me water my houseplants')).toBe('plant_care')
    expect(resolveWidgetMention('plant care')).toBe('plant_care')
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

  it('deletes every retired card rather than hiding it',()=>{
    // The old contract kept these registered but unavailable. They are gone
    // outright now: absent from the type union and from the registry, so no
    // surface can offer one and no code can look one up.
    const registered = new Set<string>(Object.keys(WIDGET_REGISTRY))
    const declared = new Set<string>(MODULE_TYPES)
    for (const type of RETIRED_TYPES) {
      expect(registered.has(type), `${type} is still registered`).toBe(false)
      expect(declared.has(type), `${type} is still a module type`).toBe(false)
    }
  })

  it('keeps one Time widget carrying every former standalone clock as a skin',()=>{
    const data=WIDGET_REGISTRY.timekeeper.defaultData() as TimekeeperData
    expect(isWidgetTypePublic('timekeeper')).toBe(true)
    expect(data.mode).toBe('countdown')
    expect(data.pomodoro.workMinutes).toBe(25)
    expect(data.stopwatch.laps).toEqual([])
    expect(data.deadline?.targetDate).toBeTruthy()
    expect(data.worldClock?.zones).toHaveLength(3)
    expect(resolveWidgetMention('pomodoro timer')).toBe('timekeeper')
  })

  it('publishes every consolidated family with the absorbed skins on it',()=>{
    const canonical=['text','bar_chart','decision','grade_calc','date_picker','sketchpad','goal_tracker','flashcards','checklist'] as const
    expect(canonical.every(isWidgetTypePublic)).toBe(true)
    expect(WIDGET_REGISTRY.text.skins?.map(skin=>skin.value)).toEqual(expect.arrayContaining(['plain','sticky','typewriter']))
    expect(WIDGET_REGISTRY.bar_chart.skins?.map(skin=>skin.value)).toEqual(expect.arrayContaining(['bar','line','donut','pie']))
    expect(WIDGET_REGISTRY.checklist.skins?.map(skin=>skin.value)).toEqual(expect.arrayContaining(['list','board','assignments','day','week','timeline','matrix']))
    expect(WIDGET_REGISTRY.flashcards.skins?.map(skin=>skin.value)).toEqual(expect.arrayContaining(['flashcards','vocabulary','quiz']))
    expect(WIDGET_REGISTRY.goal_tracker.skins?.map(skin=>skin.value)).toEqual(expect.arrayContaining(['simple','hours','okr']))
    expect(WIDGET_REGISTRY.grade_calc.skins?.map(skin=>skin.value)).toEqual(expect.arrayContaining(['weighted','gpa']))
    expect(WIDGET_REGISTRY.decision.skins?.map(skin=>skin.value)).toEqual(expect.arrayContaining(['simple','weighted']))
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

  it.each([
    ['sticky note','text'],['line chart','bar_chart'],['pie chart','bar_chart'],
    ['progress','goal_tracker'],['excalidraw','sketchpad'],
    ['random picker','decision'],['gpa','grade_calc'],
    ['study goal','goal_tracker'],['okrs','goal_tracker'],['vocabulary','flashcards'],['quiz','flashcards'],
    ['kanban','checklist'],['assignments','checklist'],['daily agenda','checklist'],
    ['week planner','checklist'],['timeline','checklist'],['priority matrix','checklist'],
  ] as const)('still understands %s and routes it to the widget that absorbed it', (mention,expected)=>{
    // A retired card's name is still a thing people say. Deleting the card must
    // not make the phrase unrecognisable — it has to land on its replacement.
    expect(resolveWidgetMention(mention)).toBe(expected)
  })
})
