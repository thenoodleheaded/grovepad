import { describe, expect, it } from 'vitest'
import { widgetToMarkdown, widgetsToMarkdown } from './widgetMarkdown'

describe('widgetToMarkdown', () => {
  it('renders notes as plain text under the title', () => {
    expect(widgetToMarkdown({ title: 'Ideas', type: 'notes', data: { text: 'hello' } })).toBe(
      '### Ideas\n\nhello',
    )
  })

  it('renders checklist items with a checkbox per line', () => {
    const md = widgetToMarkdown({
      title: 'Tasks',
      type: 'checklist',
      data: { items: [{ label: 'A', done: true }, { label: 'B', done: false }] },
    })
    expect(md).toBe('### Tasks\n\n- [x] A\n- [ ] B')
  })

  it('renders bullets as a plain list', () => {
    const md = widgetToMarkdown({ title: 'List', type: 'bullets', data: { items: [{ label: 'One' }] } })
    expect(md).toBe('### List\n\n- One')
  })

  it('renders pros/cons as two labeled lists', () => {
    const md = widgetToMarkdown({
      title: 'Decision',
      type: 'pros_cons',
      data: { pros: [{ label: 'Fast' }], cons: [{ label: 'Risky' }] },
    })
    expect(md).toContain('**Pros:**\n- Fast')
    expect(md).toContain('**Cons:**\n- Risky')
  })

  it('falls back to pretty-printed JSON for unrecognized shapes', () => {
    const md = widgetToMarkdown({ title: 'Chart', type: 'bar_chart', data: { bars: [1, 2] } })
    expect(md).toBe('### Chart\n\n{\n  "bars": [\n    1,\n    2\n  ]\n}')
  })
})

describe('widgetsToMarkdown', () => {
  it('joins member sections with a horizontal rule', () => {
    const md = widgetsToMarkdown([
      { title: 'A', type: 'notes', data: { text: 'first' } },
      { title: 'B', type: 'notes', data: { text: 'second' } },
    ])
    expect(md).toBe('### A\n\nfirst\n\n---\n\n### B\n\nsecond')
  })

  it('returns an empty string for no members', () => {
    expect(widgetsToMarkdown([])).toBe('')
  })
})
