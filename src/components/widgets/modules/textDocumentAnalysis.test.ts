import { describe, expect, it } from 'vitest'
import {
  buildBibliography,
  citationKeyFor,
  citationKeys,
  documentOutline,
  documentStats,
  findMatches,
  formatCitation,
  inTextCitation,
  nextMatchFrom,
  plainText,
  replaceAll,
  replaceMatch,
  stripInline,
} from './textDocumentAnalysis'

describe('counting the writing', () => {
  /**
   * A word limit is a promise about prose, so the count is taken from what a
   * reader receives. Counting the raw markdown would score `- [ ] task` as
   * three words and a heading's `##` as one of its own.
   */
  it('counts the words a reader sees, not the markdown that makes them', () => {
    expect(documentStats('- [ ] wash the dishes').words).toBe(3)
    expect(documentStats('## Two words').words).toBe(2)
    expect(documentStats('**bold** *thin*').words).toBe(2)
  })

  it('leaves a citation token out of the count', () => {
    expect(documentStats('Evolution is gradual [@darwin1859]').words).toBe(3)
  })

  it('reports sentences, paragraphs and reading time', () => {
    const stats = documentStats('One thing. Two things.\n\nA second paragraph here.')
    expect(stats.sentences).toBe(3)
    expect(stats.paragraphs).toBe(2)
    expect(stats.readingMinutes).toBe(1)
  })

  it('says nothing is there when nothing is', () => {
    expect(documentStats('')).toMatchObject({ words: 0, sentences: 0, readingMinutes: 0 })
  })

  it('strips nested emphasis down to the words', () => {
    expect(stripInline('**bold with *thin* inside**')).toBe('bold with thin inside')
  })

  it('keeps code verbatim while dropping the fence lines', () => {
    expect(plainText('```\nconst x = 1\n```')).toBe('\nconst x = 1\n')
  })
})

describe('the outline', () => {
  it('lists headings with the size of the section each one opens', () => {
    const entries = documentOutline('# Intro\nthree words here\n\n## Method\none two')
    expect(entries.map((entry) => entry.title)).toEqual(['Intro', 'Method'])
    expect(entries[0]?.words).toBe(3)
    expect(entries[1]?.words).toBe(2)
    expect(entries[1]?.level).toBe(2)
  })

  it('points at the offset of its own heading line', () => {
    const source = '# One\nbody\n## Two'
    const entries = documentOutline(source)
    expect(source.slice(entries[1]!.start)).toBe('## Two')
  })

  it('names an empty heading rather than showing a blank row', () => {
    expect(documentOutline('# ')[0]?.title).toBe('Untitled section')
  })
})

describe('find and replace', () => {
  it('finds every occurrence, ignoring case by default', () => {
    expect(findMatches('Cat cat CAT', 'cat')).toHaveLength(3)
    expect(findMatches('Cat cat CAT', 'cat', { caseSensitive: true })).toHaveLength(1)
  })

  it('respects whole words', () => {
    expect(findMatches('cat category', 'cat', { wholeWord: true })).toHaveLength(1)
  })

  it('treats the query as text, not as a pattern', () => {
    expect(findMatches('a.b axb', 'a.b')).toHaveLength(1)
  })

  it('matches nothing for an empty query', () => {
    expect(findMatches('anything', '')).toEqual([])
  })

  it('replaces one match without touching the others', () => {
    const matches = findMatches('cat cat', 'cat')
    expect(replaceMatch('cat cat', matches[1]!, 'dog')).toBe('cat dog')
  })

  /** Right to left, so an earlier replacement cannot invalidate a later offset. */
  it('replaces all of them even when the replacement changes the length', () => {
    expect(replaceAll('cat cat cat', 'cat', 'elephant')).toBe('elephant elephant elephant')
  })

  it('starts from the caret and wraps around', () => {
    const matches = findMatches('cat cat cat', 'cat')
    expect(nextMatchFrom(matches, 5)).toBe(2)
    expect(nextMatchFrom(matches, 99)).toBe(0)
    expect(nextMatchFrom(matches, 5, -1)).toBe(1)
    expect(nextMatchFrom(matches, 0, -1)).toBe(2)
    expect(nextMatchFrom([], 0)).toBe(-1)
  })
})

describe('citations', () => {
  it('collects every key in order, without repeating one', () => {
    expect(citationKeys('A [@one] B [@two] C [@one]')).toEqual(['one', 'two'])
  })

  it('ignores a key that is only inside a code fence', () => {
    expect(citationKeys('```\n[@fenced]\n```')).toEqual([])
  })

  it('builds a key the way a writer would type it', () => {
    expect(citationKeyFor({ author: 'Charles Darwin', year: '1859' })).toBe('darwin1859')
    expect(citationKeyFor({ author: 'Ursula K. Le Guin', year: '' })).toBe('guin')
  })

  it('formats a source in each style it offers', () => {
    const source = { key: 'd', author: 'Darwin, C.', year: '1859', title: 'On the Origin of Species' }
    expect(formatCitation('APA', source)).toBe('Darwin, C. (1859). On the Origin of Species.')
    expect(formatCitation('MLA', source)).toContain('"On the Origin of Species."')
    expect(inTextCitation('APA', source)).toBe('(C., 1859)')
  })

  /**
   * A key pointing at nothing is exactly what a student needs told before they
   * hand the essay in, so it is reported rather than quietly dropped.
   */
  it('names the keys it could not resolve', () => {
    const bibliography = buildBibliography('[@known] and [@ghost]', [
      { key: 'known', author: 'Real, A.', year: '2020', title: 'A Paper' },
    ], 'APA')
    expect(bibliography.entries).toHaveLength(1)
    expect(bibliography.missing).toEqual(['ghost'])
  })

  it('lists the references alphabetically, as a reference list is ordered', () => {
    const bibliography = buildBibliography('[@z] [@a]', [
      { key: 'z', author: 'Zeta', year: '2001', title: 'Later' },
      { key: 'a', author: 'Alpha', year: '1999', title: 'Earlier' },
    ], 'APA')
    expect(bibliography.entries.map((entry) => entry.key)).toEqual(['a', 'z'])
  })

  it('lists a source only once however often it is cited', () => {
    const bibliography = buildBibliography('[@a] [@a] [@a]', [
      { key: 'a', author: 'Alpha', year: '1999', title: 'Once' },
    ], 'APA')
    expect(bibliography.entries).toHaveLength(1)
  })
})
