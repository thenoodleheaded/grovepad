import { describe, expect, it } from 'vitest'
import type { ModuleData, ModuleType } from '../types/spatial'
import { commandsFor } from './fields'
import { WIDGET_REGISTRY, widgetDefinition } from './registry'

// A wire command rewrites the target's data wholesale — the circuit slice does
// `widgets[id] = { ...widget, data }`, not a merge. So any key a command forgets
// to carry forward is gone: the worn skin, every skin's saved settings, and any
// other field the card persists. The one deliberate exception is poll::reset,
// which clears skinStates because ballots, duels and room phase are the same
// result told another way.
const CLEARS_SKIN_STATES = new Set(['poll::reset'])

describe('wire commands preserve the data they are handed', () => {
  it('never drops a key the target card already persisted', () => {
    const losses: string[] = []

    for (const type of Object.keys(WIDGET_REGISTRY) as ModuleType[]) {
      const commands = commandsFor(type)
      if (commands.length === 0) continue
      const definition = widgetDefinition(type)
      const skinField = definition.skinField ?? 'skin'
      const seeded = {
        ...(definition.defaultData?.() ?? {}),
        [skinField]: definition.skins?.[0]?.value ?? 'probe',
        skinStates: { probe: { kept: true } },
      } as unknown as ModuleData

      for (const command of commands) {
        const result = command.run(
          seeded,
          command.acceptsPayload ? 'from wire' : undefined,
        ) as Record<string, unknown>
        const dropped = Object.keys(seeded as Record<string, unknown>)
          .filter((key) => !(key in result))
          .filter((key) => !(CLEARS_SKIN_STATES.has(`${type}::${command.key}`) && key === 'skinStates'))
        if (dropped.length > 0) losses.push(`${type}::${command.key} dropped ${dropped.join(',')}`)
      }
    }

    expect(losses).toEqual([])
  })
})
