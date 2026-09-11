/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./lazyCoreWidgets.ts', import.meta.url), 'utf8')

// The idle prefetch runtime walks CORE_WIDGET_MODULE_LOADERS unconditionally on
// every cold start, so a loader for a type that can no longer mount costs every
// user a chunk download for nothing. These four are in DELETED_WIDGET_TYPES and
// are dropped on both hydration paths, so no board can ever ask for them.
const DELETED_MODULES = [
  'KanbanWidget',
  'PriorityMatrixWidget',
  'TimelineWidget',
  'WeeklyPlannerWidget',
]

describe('core widget module loaders', () => {
  it('never fetches a chunk for a deleted widget type', () => {
    for (const name of DELETED_MODULES) {
      expect(source).not.toContain(`../modules/${name}`)
    }
  })
})
