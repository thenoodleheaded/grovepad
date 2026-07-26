import { describe, expect, it } from 'vitest'
import type { ChecklistData } from '../types/spatial'
import { taskSkinIsSpatial, type TaskSkin } from '../components/widgets/modules/taskSkinModel'
import { commandsFor } from './fields'
import { widgetDefinition } from './registry'

describe('Tasks widget skins', () => {
  const definition = widgetDefinition('checklist')
  const values = definition.skins?.map((skin) => skin.value) ?? []

  it('offers all thirteen Tasks arrangements through the persisted mode field', () => {
    // `skinField` stays unset, which means `mode` — the field ChecklistData has
    // always persisted. Moving it to `skin` would strand every saved card.
    expect(definition.skinField).toBeUndefined()
    expect(values).toEqual([
      'list',
      'inbox',
      'shopping',
      'assignments',
      'day',
      'week',
      'board',
      'timeline',
      'matrix',
      'recurring',
      'sprint',
      'dependencies',
      'routine',
    ])
  })

  it('gives every skin its own icon rather than one glyph per presentation family', () => {
    const icons = new Set(definition.skins?.map((skin) => skin.icon))
    expect(icons.size).toBe(values.length)
  })

  it('keeps the four specialist editors inside the renderer', () => {
    expect(definition.rendererOwnedSkinDetails).toEqual([
      'recurring',
      'sprint',
      'dependencies',
      'routine',
    ])
  })

  it('holds the registry sizing rule and the renderer in agreement about which skins are canvases', () => {
    const fixed = definition.sizing?.fixed
    expect(typeof fixed).toBe('function')
    for (const value of values) {
      const spatial = taskSkinIsSpatial(value as TaskSkin)
      expect([value, (fixed as (data: unknown) => boolean)({ mode: value })])
        .toEqual([value, !spatial])
    }
  })

  it('preserves the worn skin and every skin"s settings when a circuit writes', () => {
    const data: ChecklistData = {
      items: [{ id: 'one', label: 'Existing', done: false }],
      mode: 'board',
      skinStates: { sprint: { name: 'Sprint 14' } },
    }

    const added = commandsFor('checklist')
      .find((descriptor) => descriptor.key === 'add_item')
      ?.run(data, 'From circuit') as ChecklistData
    expect(added.mode).toBe('board')
    expect(added.skinStates?.sprint?.name).toBe('Sprint 14')
    expect(added.items.map((item) => item.label)).toEqual(['Existing', 'From circuit'])
    expect(added.items.at(-1)).toMatchObject({ done: false, status: 'todo' })

    const checked = commandsFor('checklist')
      .find((descriptor) => descriptor.key === 'check_all')
      ?.run(data) as ChecklistData
    expect(checked.mode).toBe('board')
    // A board reads `status`, the ports read `done` — a wire must not leave the
    // two disagreeing.
    expect(checked.items.every((item) => item.done && item.status === 'done')).toBe(true)
  })
})
