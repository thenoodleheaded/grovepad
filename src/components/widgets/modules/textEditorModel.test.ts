import { describe, expect, it } from 'vitest'
import {
  continueBlock,
  duplicateLines,
  deleteLines,
  insertLink,
  lineRange,
  moveLines,
  readDocument,
  readInline,
  shiftIndent,
  stripMarker,
  toggleBlock,
  toggleInline,
  toggleTodoAt,
  wordAt,
} from './textEditorModel'

describe('reading a document', () => {
  it('names every line by what it structurally is', () => {
    const lines = readDocument('# Title\n\n- one\n1. two\n- [ ] task\n> quoted\n---\nplain')
    expect(lines.map((line) => line.kind)).toEqual([
      'heading',
      'blank',
      'bullet',
      'ordered',
      'todo',
      'quote',
      'divider',
      'paragraph',
    ])
    expect(lines[0]?.level).toBe(1)
    expect(lines[4]?.checked).toBe(false)
  })

  // The classic markdown-highlighter bug, and one a student hits the first
  // time they paste a shell snippet into their notes.
  it('treats a heading inside a code fence as code', () => {
    const lines = readDocument('```\n# not a heading\n```\nafter')
    expect(lines.map((line) => line.kind)).toEqual(['fence', 'code', 'fence', 'paragraph'])
  })

  /**
   * The paint layer draws marker + body and nothing else, so if those two do
   * not rebuild the source exactly, the formatting slides out from under the
   * caret for the rest of the line. This is the invariant that stops it.
   */
  it('splits every line into a marker and a body that rebuild it exactly', () => {
    const source = '## Heading\n  - nested\n3) third\n- [x] done\n>  quoted\n\ttabbed'
    for (const line of readDocument(source)) {
      if (line.kind === 'blank' || line.kind === 'divider' || line.kind === 'fence' || line.kind === 'code') continue
      expect(line.marker + line.body).toBe(line.raw)
    }
  })

  it('records each line at its true offset in the document', () => {
    const source = 'one\ntwo\nthree'
    const lines = readDocument(source)
    expect(lines.map((line) => line.start)).toEqual([0, 4, 8])
    expect(source.slice(lines[2]!.start)).toBe('three')
  })
})

describe('reading emphasis', () => {
  it('reads the long fence before the short one', () => {
    const spans = readInline('**bold** and *thin*')
    expect(spans.map((span) => span.kind)).toEqual(['strong', 'em'])
    expect(spans[0]?.content).toBe('bold')
    expect(spans[1]?.content).toBe('thin')
  })

  it('leaves emphasis inside code alone', () => {
    const spans = readInline('`*not italic*`')
    expect(spans).toHaveLength(1)
    expect(spans[0]?.kind).toBe('code')
  })

  it('reads links and citations apart from each other', () => {
    const spans = readInline('see [the paper](https://x.test) and [@darwin1859]')
    expect(spans.map((span) => span.kind)).toEqual(['link', 'citation'])
    expect(spans[0]?.content).toBe('the paper')
    expect(spans[0]?.value).toBe('https://x.test')
    expect(spans[1]?.content).toBe('darwin1859')
  })

  it('ignores a fence that never closes, and one wrapping nothing', () => {
    expect(readInline('2 * 3 = 6')).toEqual([])
    expect(readInline('**')).toEqual([])
  })

  /** Same invariant as the line split: every character has to be accounted for. */
  it('reports spans whose markers and content rebuild the source', () => {
    const body = 'a **bold** b *thin* c `code` d [x](y) e'
    for (const span of readInline(body)) {
      const source = body.slice(span.start, span.end)
      expect(source.slice(0, span.openLength).length).toBe(span.openLength)
      expect(source.length).toBe(span.openLength + span.content.length + span.closeLength)
    }
  })
})

describe('inline commands', () => {
  it('bolds the word under a bare caret', () => {
    const next = toggleInline({ text: 'make this bold', start: 10, end: 10 }, '**')
    expect(next.text).toBe('make this **bold**')
  })

  it('unbolds from inside the markers as well as outside them', () => {
    const inside = toggleInline({ text: '**bold**', start: 2, end: 6 }, '**')
    expect(inside.text).toBe('bold')
    const outside = toggleInline({ text: '**bold**', start: 0, end: 8 }, '**')
    expect(outside.text).toBe('bold')
  })

  it('leaves an empty pair with the caret inside when there is no word', () => {
    const next = toggleInline({ text: 'a ', start: 2, end: 2 }, '**')
    expect(next.text).toBe('a ****')
    expect(next.start).toBe(4)
  })

  it('puts the caret in the parentheses of a new link', () => {
    const next = insertLink({ text: 'read this', start: 5, end: 9 })
    expect(next.text).toBe('read [this]()')
    expect(next.text.slice(next.start)).toBe(')')
  })

  it('finds the word around a caret, apostrophes included', () => {
    expect(wordAt("Darwin's finches", 3)).toEqual({ start: 0, end: 8 })
  })
})

describe('block commands', () => {
  it('turns lines into a list and back out again', () => {
    const listed = toggleBlock({ text: 'one\ntwo', start: 0, end: 7 }, 'bullet')
    expect(listed.text).toBe('- one\n- two')
    const plain = toggleBlock({ ...listed, start: 0, end: listed.text.length }, 'bullet')
    expect(plain.text).toBe('one\ntwo')
  })

  it('numbers an ordered list from one instead of repeating a marker', () => {
    const next = toggleBlock({ text: 'a\nb\nc', start: 0, end: 5 }, 'ordered')
    expect(next.text).toBe('1. a\n2. b\n3. c')
  })

  it('replaces one block shape with another rather than stacking them', () => {
    const bulleted = toggleBlock({ text: 'point', start: 0, end: 5 }, 'bullet')
    const heading = toggleBlock({ ...bulleted, start: 0, end: bulleted.text.length }, 'h2')
    expect(heading.text).toBe('## point')
  })

  it('keeps indentation when it changes a marker', () => {
    const next = toggleBlock({ text: '  nested', start: 0, end: 8 }, 'bullet')
    expect(next.text).toBe('  - nested')
  })

  it('strips any marker back to the bare line', () => {
    expect(stripMarker('  - [x] done')).toBe('  done')
    expect(stripMarker('### Heading')).toBe('Heading')
    expect(stripMarker('plain')).toBe('plain')
  })
})

describe('Enter, Tab, and moving lines', () => {
  it('carries a list on to the next line', () => {
    const next = continueBlock({ text: '- one', start: 5, end: 5 })
    expect(next?.text).toBe('- one\n- ')
  })

  it('counts the next number up', () => {
    const next = continueBlock({ text: '1. one\n2. two', start: 13, end: 13 })
    expect(next?.text.endsWith('3. ')).toBe(true)
  })

  it('starts a fresh unchecked box after a finished one', () => {
    const next = continueBlock({ text: '- [x] done', start: 10, end: 10 })
    expect(next?.text).toBe('- [x] done\n- [ ] ')
  })

  it('ends the list when Enter lands on an empty item', () => {
    const next = continueBlock({ text: '- one\n- ', start: 8, end: 8 })
    expect(next?.text).toBe('- one\n')
  })

  // Returning null keeps the browser's own newline — and with it the native
  // undo entry, which is still the best undo for ordinary typing.
  it('hands an ordinary paragraph back to the browser', () => {
    expect(continueBlock({ text: 'a sentence', start: 10, end: 10 })).toBeNull()
  })

  it('indents and outdents every line of the selection', () => {
    const inward = shiftIndent({ text: 'a\nb', start: 0, end: 3 }, 1)
    expect(inward.text).toBe('  a\n  b')
    expect(shiftIndent({ ...inward, start: 0, end: inward.text.length }, -1).text).toBe('a\nb')
  })

  it('moves a line up past its neighbour', () => {
    const next = moveLines({ text: 'one\ntwo\nthree', start: 4, end: 4 }, -1)
    expect(next.text).toBe('two\none\nthree')
  })

  it('refuses to move the first line off the top', () => {
    const start = { text: 'one\ntwo', start: 0, end: 0 }
    expect(moveLines(start, -1)).toEqual(start)
  })

  it('duplicates and deletes whole lines', () => {
    expect(duplicateLines({ text: 'one\ntwo', start: 0, end: 0 }).text).toBe('one\none\ntwo')
    expect(deleteLines({ text: 'one\ntwo', start: 0, end: 0 }).text).toBe('two')
  })

  it('flips a checkbox both ways', () => {
    const checked = toggleTodoAt('- [ ] task', 3)
    expect(checked).toBe('- [x] task')
    expect(toggleTodoAt(checked, 3)).toBe('- [ ] task')
  })

  it('leaves a line that has no checkbox untouched', () => {
    expect(toggleTodoAt('- plain', 3)).toBe('- plain')
  })

  it('covers whole lines from any caret inside them', () => {
    expect(lineRange('one\ntwo\nthree', 5, 5)).toEqual({ from: 4, to: 7 })
  })
})
