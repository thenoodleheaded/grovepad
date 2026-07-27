import { describe, expect, it } from 'vitest'
import { RELATION_LABELS } from '../../types/relations'
import { commandsFor, fieldDescriptor } from '../../widgets/fields'
import { isWidgetTypePublic, widgetDefinition } from '../../widgets/registry'
import { skinsFor } from '../widgetSkins'
import { RECIPE_SHELVES, RECIPES } from './recipeData'

// ---------------------------------------------------------------------------
// The catalogue is generated from a document, so nothing here is hand-checked.
// This is the seam that keeps it honest: every recipe is re-validated against
// the live registry, field descriptors, and command descriptors. A widget that
// is retired, a skin that is renamed, or a port that is dropped fails here
// rather than silently building a broken board.
// ---------------------------------------------------------------------------

/** Collects failures across all recipes so one run reports every drift at once. */
function auditRecipes(check: (recipe: (typeof RECIPES)[number]) => string[]): string[] {
  return RECIPES.flatMap((recipe) => check(recipe).map((issue) => `${recipe.id}: ${issue}`))
}

describe('recipe catalogue', () => {
  it('carries the whole document minus its single-card templates', () => {
    expect(RECIPES).toHaveLength(284)
    expect(RECIPE_SHELVES).toHaveLength(19)
  })

  it('builds a board rather than a lone card', () => {
    expect(auditRecipes((r) => (r.slots.length >= 2 ? [] : ['single-card template']))).toEqual([])
  })

  it('has unique ids and unique slot letters', () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length)
    expect(auditRecipes((recipe) => {
      const letters = recipe.slots.map((s) => s.slot)
      return new Set(letters).size === letters.length ? [] : ['duplicate slot letter']
    })).toEqual([])
  })

  it('files every recipe under a declared shelf', () => {
    const shelves = new Set(RECIPE_SHELVES.map((s) => s.id))
    expect(auditRecipes((r) => (shelves.has(r.shelf) ? [] : [`unknown shelf ${r.shelf}`]))).toEqual([])
  })

  it('only places widget types the app still offers', () => {
    expect(auditRecipes((recipe) => recipe.slots
      .filter((slot) => !isWidgetTypePublic(slot.type))
      .map((slot) => `slot ${slot.slot} uses non-public type ${slot.type}`))).toEqual([])
  })

  it('only asks for skins those widgets actually wear', () => {
    expect(auditRecipes((recipe) => recipe.slots.flatMap((slot) => {
      if (!slot.skin) return []
      const skins = skinsFor({ type: slot.type }, widgetDefinition(slot.type))
      return skins.some((skin) => skin.value === slot.skin)
        ? []
        : [`slot ${slot.slot} (${slot.type}) has no skin ${slot.skin}`]
    }))).toEqual([])
  })

  it('draws relations between declared slots using real relation kinds', () => {
    expect(auditRecipes((recipe) => {
      const letters = new Set(recipe.slots.map((s) => s.slot))
      return (recipe.relations ?? []).flatMap((relation) => {
        const issues: string[] = []
        if (!letters.has(relation.from)) issues.push(`relation from unknown slot ${relation.from}`)
        if (!letters.has(relation.to)) issues.push(`relation to unknown slot ${relation.to}`)
        if (!(relation.kind in RELATION_LABELS)) issues.push(`unknown relation kind ${relation.kind}`)
        if (relation.from === relation.to) issues.push(`relation loops on ${relation.from}`)
        return issues
      })
    })).toEqual([])
  })

  it('wires only ports the registry exposes, in the right direction', () => {
    expect(auditRecipes((recipe) => {
      const types = new Map(recipe.slots.map((s) => [s.slot, s.type]))
      return (recipe.wires ?? []).flatMap((wire) => {
        const source = types.get(wire.from)
        const target = types.get(wire.to)
        if (!source) return [`wire from unknown slot ${wire.from}`]
        if (!target) return [`wire to unknown slot ${wire.to}`]

        const issues: string[] = []
        if (wire.from === wire.to) issues.push(`wire loops on ${wire.from}`)
        // Every declared field is readable; only fields carrying `set` accept a value.
        if (!fieldDescriptor(source, wire.fromPort)) {
          issues.push(`${source} has no field ${wire.fromPort} to read`)
        }
        if (wire.kind === 'value') {
          const descriptor = fieldDescriptor(target, wire.toPort)
          if (!descriptor) issues.push(`${target} has no field ${wire.toPort}`)
          else if (!descriptor.set) issues.push(`${target}.${wire.toPort} is read-only`)
        } else if (!commandsFor(target).some((command) => command.key === wire.toPort)) {
          issues.push(`${target} has no command ${wire.toPort}`)
        }
        return issues
      })
    })).toEqual([])
  })

  it('never wires two values into one field, which the store would silently evict', () => {
    expect(auditRecipes((recipe) => {
      const taken = new Set<string>()
      return (recipe.wires ?? []).filter((wire) => wire.kind === 'value').flatMap((wire) => {
        const key = `${wire.to}.${wire.toPort}`
        if (taken.has(key)) return [`two value wires into ${key}`]
        taken.add(key)
        return []
      })
    })).toEqual([])
  })

  it('gives trigger wires an edge and keeps transforms off them', () => {
    expect(auditRecipes((recipe) => (recipe.wires ?? []).flatMap((wire) => {
      if (wire.kind === 'trigger') {
        return wire.edge ? [] : ['trigger wire without an edge']
      }
      return wire.edge ? ['value wire carries a trigger edge'] : []
    }))).toEqual([])
  })
})
