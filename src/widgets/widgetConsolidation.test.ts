import { describe, expect, it } from 'vitest'
import type { AtlasWidgetData, TimekeeperData } from '../types/spatial'
import { resolveWidgetMention } from '../utils/thoughtInterpreter'
import { ATLAS_TYPES, atlasTypeForPhrase } from './atlasCatalog'
import { isWidgetTypePublic, WIDGET_REGISTRY } from './registry'

describe('consolidated widget modes',()=>{
  it('offers one Tracker while preserving legacy atlas types for old boards',()=>{
    expect(isWidgetTypePublic('tracker')).toBe(true)
    expect(ATLAS_TYPES.every(type=>!isWidgetTypePublic(type))).toBe(true)
    expect((WIDGET_REGISTRY.tracker.defaultData() as AtlasWidgetData).trackerMode).toBe('price_book')
    expect(atlasTypeForPhrase('help me water my houseplants')).toBe('plant_care')
    expect(resolveWidgetMention('plant care')).toBe('tracker')
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
})
