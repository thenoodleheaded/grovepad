import { describe, expect, it } from 'vitest'
import { widgetDefinition } from './registry'

describe('Table skin registry', () => {
  it('keeps every Table skin available in its reviewed order', () => {
    expect(widgetDefinition('table').skins?.map((skin) => skin.value)).toEqual([
      'grid',
      'compact_ledger',
      'cards',
      'database',
      'kanban',
      'gallery',
      'form_view',
      'pivot',
    ])
  })

  it('routes specialist settings to the purpose-built renderer', () => {
    expect(widgetDefinition('table').rendererOwnedSkinDetails).toEqual([
      'database',
      'kanban',
      'gallery',
      'form_view',
      'pivot',
    ])
  })

  it('creates a roomy, legacy-safe Grid table', () => {
    const definition = widgetDefinition('table')
    expect(definition.defaultData()).toMatchObject({
      rows: [
        ['Item', 'Owner', 'Status'],
        ['', '', ''],
        ['', '', ''],
      ],
    })
    expect(definition.skinField).toBe('skin')
    expect(definition.defaultSize.height).toBe(200)
  })
})
