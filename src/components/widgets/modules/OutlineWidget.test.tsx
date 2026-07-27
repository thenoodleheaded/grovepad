import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { OutlineData, OutlineSkinMode } from '../../../types/spatial'
import { OutlineWidget } from './OutlineWidget'

const items: OutlineData['items'] = [
  { id: 'one', text: 'Launch plan', depth: 0, collapsed: false },
  { id: 'two', text: 'Editorial pass', depth: 1, collapsed: false },
  { id: 'three', text: 'Final review', depth: 2, collapsed: false },
]

function render(skin: OutlineSkinMode, skinState: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <OutlineWidget
      data={{
        skin,
        items,
        skinStates: { [skin]: skinState },
      }}
      onChange={() => undefined}
    />,
  )
}

describe('purpose-built Outline skins', () => {
  it.each([
    ['tree', 'gp-outline-tree'],
    ['roman', 'gp-outline-roman'],
    ['scenes', 'gp-outline-scenes'],
    ['sitemap', 'gp-outline-sitemap'],
    ['course', 'gp-outline-course'],
    ['work_breakdown', 'gp-outline-work_breakdown'],
    ['collapsible_brief', 'gp-outline-collapsible_brief'],
  ] as const)('renders %s with its own anatomy', (skin, className) => {
    const markup = render(skin)
    expect(markup).toContain(className)
    expect(markup).toContain(`data-outline-skin="${skin}"`)
    expect(markup).toContain('Launch plan')
    expect(markup).toContain('Editorial pass')
    expect(markup).toContain('Final review')
  })

  it('renders formal hierarchy markers for Roman mode', () => {
    const markup = render('roman')
    expect(markup).toContain('gp-outline-roman-marker')
    expect(markup).toContain('I.')
    expect(markup).toContain('A.')
    expect(markup).toContain('1.')
  })

  it('uses purpose-specific hierarchy language for story, site, and course skins', () => {
    expect(render('scenes')).toContain('>Act<')
    expect(render('sitemap')).toContain('>Page<')
    expect(render('course')).toContain('>Exercise<')
  })

  it('renders work ownership, effort, completion, and a single progress reading', () => {
    const markup = render('work_breakdown', {
      items: {
        two: { owner: 'Mina', estimate: '2d', complete: true },
      },
    })
    expect(markup).toContain('value="Mina"')
    expect(markup).toContain('value="2d"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('33%')
  })

  it('reveals brief notes and attachments only for expanded headings', () => {
    const markup = render('collapsible_brief', {
      expandedIds: ['one'],
      items: {
        one: {
          notes: 'Executive context',
          attachments: ['brief.pdf', 'source.md'],
        },
      },
    })
    expect(markup).toContain('gp-outline-brief-details')
    expect(markup).toContain('>Executive context</textarea>')
    expect(markup).toContain('value="brief.pdf, source.md"')
  })

  it('keeps keyboard instructions and labelled controls in every skin', () => {
    for (const skin of [
      'tree',
      'roman',
      'scenes',
      'sitemap',
      'course',
      'work_breakdown',
      'collapsible_brief',
    ] as const) {
      const markup = render(skin)
      expect(markup, skin).toContain('Enter adds')
      expect(markup, skin).toContain('aria-label="Outdent Launch plan"')
      expect(markup, skin).toContain('aria-label="Remove Launch plan"')
    }
  })
})
