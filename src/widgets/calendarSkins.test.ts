import { describe, expect, it } from 'vitest'
import { widgetDefinition } from './registry'

describe('Calendar widget skins', () => {
  it('offers all seven Calendar experiences through the skin field', () => {
    const definition = widgetDefinition('calendar')
    expect(definition.skinField).toBe('skin')
    expect(definition.skins?.map((skin) => skin.value)).toEqual([
      'month',
      'week',
      'agenda',
      'year_heatmap',
      'availability',
      'shift_rota',
      'birthday_and_anniversary',
    ])
  })

  it('keeps specialist rota and occasion controls inside the renderer', () => {
    expect(widgetDefinition('calendar').rendererOwnedSkinDetails).toEqual([
      'shift_rota',
      'birthday_and_anniversary',
    ])
  })

  it('starts new calendars in the polished month view', () => {
    expect(widgetDefinition('calendar').defaultData()).toMatchObject({
      skin: 'month',
      markedDates: [],
    })
  })
})
