import { describe, expect, it } from 'vitest'
import {
  documentFileHtml,
  documentPlainText,
  exportBody,
  exportFileName,
  markdownToHtml,
} from './documentExport'

const options = { title: 'Essay' }

describe('markdown as document HTML', () => {
  it('writes headings, paragraphs, and emphasis', () => {
    const html = markdownToHtml('# Title\n\nA **bold** claim.', options)
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<p>A <strong>bold</strong> claim.</p>')
  })

  it('gathers consecutive items into one list and closes it', () => {
    const html = markdownToHtml('- one\n- two\n\nafter', options)
    expect(html).toContain('<ul>\n<li>one</li>\n<li>two</li>\n</ul>')
    expect(html).toContain('<p>after</p>')
  })

  it('numbers an ordered list as an ordered list', () => {
    expect(markdownToHtml('1. one\n2. two', options)).toContain('<ol>')
  })

  /** A file is going to a marker or a printer, where a live control is noise. */
  it('exports a checkbox as a printed box, not an input', () => {
    const html = markdownToHtml('- [x] done\n- [ ] todo', options)
    expect(html).toContain('☑ done')
    expect(html).toContain('☐ todo')
    expect(html).not.toContain('<input')
  })

  it('keeps a code fence literal', () => {
    const html = markdownToHtml('```\n# not a heading\n```', options)
    expect(html).toContain('<pre><code># not a heading</code></pre>')
    expect(html).not.toContain('<h1>')
  })

  it('escapes markup that was written as text', () => {
    expect(markdownToHtml('a <script>alert(1)</script> b', options)).toContain('&lt;script&gt;')
  })

  /**
   * An exported file is opened outside the app, where none of our own
   * protections reach — so a script URL is dropped rather than carried along.
   */
  it('drops a javascript: link target but keeps the words', () => {
    const html = markdownToHtml('[click](javascript:alert(1))', options)
    expect(html).not.toContain('javascript:')
    expect(html).toContain('click')
    expect(markdownToHtml('[ok](https://x.test)', options)).toContain('href="https://x.test"')
  })

  it('turns a citation into its in-text form and a reference list', () => {
    const html = markdownToHtml('Gradual change [@darwin1859].', {
      title: 'Essay',
      sources: [{ key: 'darwin1859', author: 'Darwin, C.', year: '1859', title: 'Origin' }],
      style: 'APA',
    })
    expect(html).toContain('(C., 1859)')
    expect(html).toContain('References')
    expect(html).toContain('Darwin, C. (1859). Origin.')
  })

  it('leaves an unresolved citation exactly as it was written', () => {
    expect(markdownToHtml('see [@ghost]', { title: 'x', sources: [] })).toContain('[@ghost]')
  })
})

describe('the files themselves', () => {
  it('writes a standalone document Word can open', () => {
    const file = documentFileHtml('# Hello', { title: 'My Essay' })
    expect(file.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(file).toContain('urn:schemas-microsoft-com:office:word')
    expect(file).toContain('<title>My Essay</title>')
    expect(file).toContain('<h1>Hello</h1>')
  })

  /**
   * Handing in a page that says the same thing twice, in two different sizes,
   * is exactly the small wrongness a marker notices.
   */
  it('does not print the card title above a document that already has one', () => {
    const withOwn = documentFileHtml('# The Real Title\n\nBody.', { title: 'Card name' })
    expect(withOwn).toContain('<h1>The Real Title</h1>')
    expect(withOwn).not.toContain('<h1>Card name</h1>')
    expect(documentFileHtml('Just body text.', { title: 'Card name' })).toContain('<h1>Card name</h1>')
  })

  /**
   * Only the opening line can be the document's own title. A `# Part Two`
   * halfway down is a section break, and letting it stand in for a title
   * hands in a page with no title at all.
   */
  it('still prints the card title when the only H1 is mid-document', () => {
    const file = documentFileHtml('Intro paragraph.\n\n# Part Two\n\nMore.', { title: 'Card name' })
    expect(file).toContain('<h1>Card name</h1>')
    expect(file).toContain('<h1>Part Two</h1>')
  })

  it('double-spaces the body when the brief asks for it', () => {
    expect(documentFileHtml('x', { title: 't', doubleSpaced: true })).toContain('line-height: 2')
    expect(documentFileHtml('x', { title: 't' })).toContain('line-height: 1.5')
  })

  /**
   * Emphasis goes, list markers stay. A text file that turned a five-item list
   * into five loose sentences would have dropped structure the writer put in.
   */
  it('drops emphasis from plain text but keeps the list', () => {
    expect(documentPlainText('# Title\n\n- **one**\n- two', { title: 'Notes' })).toBe(
      'Notes\n\nTitle\n\n- one\n- two',
    )
  })

  it('exports markdown as exactly what was written', () => {
    const source = '# Untouched **source**'
    expect(exportBody('markdown', source, options)).toBe(source)
  })

  it('builds a filename that survives every filesystem', () => {
    expect(exportFileName('Essay: Draft/2', 'doc')).toBe('Essay Draft2.doc')
    expect(exportFileName('   ', 'md')).toBe('Untitled.md')
    expect(exportFileName('x'.repeat(200), 'txt').length).toBeLessThanOrEqual(84)
  })
})
