import { describe, expect, it } from 'vitest'
import {
  noteCalloutTone,
  noteVersionSnapshots,
  noteWordDiff,
  parseNoteMarkdown,
} from './noteSkinModel'

describe('Note skin model', () => {
  it('parses the safe Markdown vocabulary used by the reading skin', () => {
    const blocks = parseNoteMarkdown([
      '# Heading',
      '',
      'A **clear** paragraph.',
      '',
      '- First',
      '- Second',
      '',
      '> Keep this.',
      '',
      '```ts',
      'const value = 1',
      '```',
    ].join('\n'))

    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Heading' },
      { kind: 'paragraph', text: 'A **clear** paragraph.' },
      { kind: 'unordered-list', items: ['First', 'Second'] },
      { kind: 'quote', text: 'Keep this.' },
      { kind: 'code', language: 'ts', code: 'const value = 1' },
    ])
  })

  it('sanitizes callout and version state from persisted unknown data', () => {
    expect(noteCalloutTone('warning')).toBe('warning')
    expect(noteCalloutTone('loud')).toBe('info')
    expect(noteVersionSnapshots([
      { id: 'one', label: 'Draft', text: 'Hello', createdAt: '2026-01-01T00:00:00Z' },
      { id: 2, label: 'Broken', text: 'Ignored', createdAt: 'now' },
    ])).toEqual([
      { id: 'one', label: 'Draft', text: 'Hello', createdAt: '2026-01-01T00:00:00Z' },
    ])
  })

  it('summarizes word changes without treating repeated words as one', () => {
    expect(noteWordDiff('one two two three', 'one two four')).toEqual({
      added: 2,
      removed: 1,
      unchanged: 2,
    })
  })
})
