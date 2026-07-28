import { describe, expect, it } from 'vitest'
import { fieldsFor } from './fields'
import { widgetDefinition } from './registry'

describe('College Canvas registry contract', () => {
  const definition = widgetDefinition('canvas_lms')

  it('offers five skins over one minimal board-safe data shape', () => {
    expect(definition.category).toBe('study')
    expect(definition.skinField).toBe('skin')
    expect(definition.defaultData()).toEqual({ skin: 'overview' })
    expect(definition.skins?.map((skin) => skin.value)).toEqual([
      'overview',
      'courses',
      'assignments',
      'grades',
      'announcements',
    ])
  })

  it('does not expose private Canvas records to board circuits', () => {
    expect(fieldsFor('canvas_lms')).toEqual([])
  })
})
