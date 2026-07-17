import { describe, expect, it } from 'vitest'
import { isWidgetTypePublic, WIDGET_REGISTRY } from './registry'

describe('beta widget availability', () => {
  it.each([
    ['sketchpad', 'Drawing'],
    ['script_block', 'capability-restricted'],
    ['secret_reference', 'protected credential'],
  ] as const)('%s is preserved for old boards but not publicly creatable', (type, reason) => {
    expect(isWidgetTypePublic(type)).toBe(false)
    const definition = WIDGET_REGISTRY[type]
    expect(definition.unavailableReason).toContain(reason)
  })
})
