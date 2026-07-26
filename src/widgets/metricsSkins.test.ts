import { describe, expect, it } from 'vitest'
import type { MetricsData } from '../types/spatial'
import { fieldDescriptor } from './fields'
import { widgetDefinition } from './registry'

describe('Metrics skin registry', () => {
  it('keeps every Metrics skin available in its reviewed order', () => {
    expect(widgetDefinition('metrics').skins?.map((skin) => skin.value)).toEqual([
      'kpi_tiles',
      'big_number',
      'scoreboard',
      'traffic_lights',
      'delta',
      'target',
      'executive_strip',
    ])
  })

  it('routes specialist settings to the purpose-built renderer', () => {
    expect(widgetDefinition('metrics').rendererOwnedSkinDetails).toEqual([
      'delta',
      'target',
      'executive_strip',
    ])
  })

  it('creates a roomy, legacy-safe KPI collection', () => {
    const definition = widgetDefinition('metrics')
    expect(definition.defaultData()).toMatchObject({
      tiles: [
        { label: 'Users', value: '128', trend: 'up' },
        { label: 'Revenue', value: '3.2', unit: 'k', trend: 'flat' },
      ],
    })
    expect(definition.skinField).toBe('skin')
    expect(definition.defaultSize).toEqual({ width: 400, height: 280 })
  })

  it('preserves the worn skin and specialist state when a circuit writes value one', () => {
    const data: MetricsData = {
      skin: 'target',
      skinStates: { target: { targets: { one: 200 } } },
      tiles: [{ id: 'one', label: 'Users', value: '128', unit: '', trend: 'up' }],
    }
    const valueField = fieldDescriptor('metrics', 'value_1')
    expect(valueField?.set?.(data, 144)).toEqual({
      ...data,
      tiles: [{ ...data.tiles[0], value: '144' }],
    })
  })
})
