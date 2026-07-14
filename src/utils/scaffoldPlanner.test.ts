import { describe, expect, it } from 'vitest'
import { buildScaffold } from './scaffoldPlanner'

describe('buildScaffold', () => {
  it('returns null only for empty input', () => {
    expect(buildScaffold('')).toBeNull()
    expect(buildScaffold('   ')).toBeNull()
  })

  it('always produces a committable connected tree, even for bare pleas', () => {
    for (const source of ['help', 'too much stuff', 'make this make sense', 'i have a million ideas', 'what do i do first']) {
      const scaffold = buildScaffold(source)
      expect(scaffold, source).not.toBeNull()
      const plan = scaffold!.plan
      expect(plan.nodes.length).toBeGreaterThanOrEqual(3)
      // Root + every branch connected by a parent relation.
      const root = plan.nodes[0]!
      expect(root.depth).toBe(0)
      for (const node of plan.nodes.slice(1)) {
        expect(plan.relations.some((relation) =>
          relation.type === 'parent' && relation.fromTemporaryId === root.temporaryId && relation.toTemporaryId === node.temporaryId,
        ), `${source} → ${node.title}`).toBe(true)
      }
    }
  })

  it('uses stable s-* ids suitable for a model skeleton', () => {
    const scaffold = buildScaffold('i want to make a game')!
    expect(scaffold.plan.nodes.every((node, index) => node.temporaryId === `s-${index}`)).toBe(true)
  })

  it('picks a matching archetype for recognizable goals', () => {
    const scaffold = buildScaffold('i want to make a game')!
    expect(scaffold.archetypeId).toBe('game-dev')
    const trip = buildScaffold('help me plan my first solo trip')!
    expect(trip.archetypeId).not.toBe('generic')
  })

  it('falls back to the generic sort-it-out trio for unmatchable text', () => {
    const scaffold = buildScaffold('zzz qqq xxyy')!
    expect(scaffold.archetypeId).toBe('generic')
    expect(scaffold.plan.nodes.some((node) => node.widgetType === 'checklist')).toBe(true)
    expect(scaffold.plan.nodes.some((node) => node.widgetType === 'priority_matrix')).toBe(true)
  })

  it('keeps typed clauses as checklist items so nothing is lost', () => {
    const scaffold = buildScaffold('sort out visa, find housing, open a bank account', {
      clauses: ['sort out visa', 'find housing', 'open a bank account'],
    })!
    const checklist = scaffold.plan.nodes.find((node) => node.widgetType === 'checklist')
    expect(checklist).toBeDefined()
    const items = (checklist!.data as { items: Array<{ label: string }> }).items
    expect(items.map((item) => item.label)).toContain('find housing')
  })

  it('tidies filler into a readable root title', () => {
    const scaffold = buildScaffold('i need to get my life together')!
    const root = scaffold.plan.nodes[0]!
    expect(root.title.toLowerCase()).not.toMatch(/^i need to/)
    expect(root.title.length).toBeLessThanOrEqual(56)
  })
})
