import { describe, expect, it } from 'vitest'
import {
  canCommentOnCollaborativeCanvas,
  canEditCollaborativeCanvas,
} from '../store/useCollaborationStore'
import { documentImportAvailable } from '../utils/commandPaletteAvailability'

describe('collaboration role capabilities', () => {
  it.each([
    ['owner', true, true],
    ['editor', true, true],
    ['commenter', false, true],
    ['viewer', false, false],
    [null, false, false],
  ] as const)('%s resolves explicit edit and comment capabilities', (role, edit, comment) => {
    expect(canEditCollaborativeCanvas(role)).toBe(edit)
    expect(canCommentOnCollaborativeCanvas(role)).toBe(comment)
  })
})

describe('document import availability', () => {
  // The import's writes are all permission-guarded silent no-ops for a
  // read-only role, so the importer must refuse before spending the user's
  // API budget. The null row is the load-bearing one: null means NO
  // collaboration session — ordinary solo use — and canEditCollaborativeCanvas
  // maps null to false, so a guard that forgets the null arm locks every solo
  // user out of importing entirely.
  it.each([
    [null, true],
    ['owner', true],
    ['editor', true],
    ['commenter', false],
    ['viewer', false],
  ] as const)('role %s -> import available %s', (role, expected) => {
    expect(documentImportAvailable(role)).toBe(expected)
  })
})
