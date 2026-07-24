import type { Relation, Widget } from '../types/spatial'

/**
 * Shared test fixture for the canonical notes-widget literal that most suites
 * previously hand-rolled. Defaults mirror the dominant shape across tests:
 * a notes card on canvas 'canvas' at the origin, 240x160, empty text, bare
 * metadata. The title mirrors the id unless overridden.
 */
export function makeWidget(overrides: Partial<Widget> = {}): Widget {
  const id = overrides.id ?? 'w1'
  return {
    id,
    type: 'notes',
    title: id,
    canvasId: 'canvas',
    position: { x: 0, y: 0 },
    size: { width: 240, height: 160 },
    data: { text: '' },
    metadata: { badges: [] },
    ...overrides,
  }
}

/** Shared test fixture for the common Relation literal. */
export function makeRelation(overrides: Partial<Relation> = {}): Relation {
  return {
    id: 'r1',
    fromId: 'a',
    toId: 'b',
    type: 'parent',
    isResolved: true,
    ...overrides,
  }
}
