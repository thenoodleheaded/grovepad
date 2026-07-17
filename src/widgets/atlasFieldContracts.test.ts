import { describe, expect, it } from 'vitest'
import { ATLAS_TYPES } from './atlasCatalog'
import { fieldsFor } from './fields'
import { WIDGET_REGISTRY } from './registry'

describe('Atlas writable field contracts', () => {
  it.each(ATLAS_TYPES)('%s reads the same storage slot its writable field updates', (type) => {
    const data = WIDGET_REGISTRY[type].defaultData()
    for (const field of fieldsFor(type).filter((candidate) => candidate.set)) {
      const value = field.valueType === 'number' ? 7 : field.valueType === 'boolean' ? true : 'round-trip'
      const updated = field.set!(data, value)
      expect(field.get(updated), `${type}.${field.key}`).toBe(value)
    }
  })

  it('round-trips Commission Queue slot cap through target', () => {
    const data = WIDGET_REGISTRY.commission_queue.defaultData()
    const field = fieldsFor('commission_queue').find((candidate) => candidate.key === 'slot_cap')!
    expect(field.get(field.set!(data, 12))).toBe(12)
  })
})
