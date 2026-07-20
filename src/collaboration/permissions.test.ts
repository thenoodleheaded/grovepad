import { describe, expect, it } from 'vitest'
import {
  canCommentOnCollaborativeCanvas,
  canEditCollaborativeCanvas,
} from '../store/useCollaborationStore'

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
