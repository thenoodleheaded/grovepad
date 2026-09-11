import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ChoreRotationData } from '../../../types/widgetDataExpansion'
import { ExpansionWidget } from './ExpansionWidgets'

const source = readFileSync(new URL('./ExpansionWidgets.tsx', import.meta.url), 'utf8')

const rotation: ChoreRotationData = {
  people: ['You', 'Housemate'],
  chores: ['Kitchen', 'Bins'],
  offset: 0,
  cadenceLabel: 'weekly',
}

/**
 * There is no DOM in this suite, so the contract is pinned on the source. The
 * People and Chores fields used to split on every keystroke, which erased a
 * comma typed at the end of the field — `filter(Boolean)` dropped the empty
 * tail, the stored array came back identical, and React restored the old text
 * over the character just typed. Neither list could be extended by keyboard.
 */
describe('lists edited as one comma-separated field', () => {
  it('shows the stored list before anything is typed', () => {
    const markup = renderToStaticMarkup(
      <ExpansionWidget type="chore_rotation" data={rotation} onChange={() => undefined} />,
    )
    expect(markup).toContain('value="You, Housemate"')
    expect(markup).toContain('value="Kitchen, Bins"')
  })

  it('keeps the typed text as written and splits it only when the field is left', () => {
    const listBox = source.slice(source.indexOf('function ListBox'), source.indexOf('function SelectBox'))
    expect(listBox).toContain("value={draft??values.join(', ')}")
    expect(listBox).toContain('onChange={next=>setDraft(next)}')
    expect(listBox).toContain('onBlur={()=>{')
    expect(listBox).toContain('filter(Boolean)')
  })

  it('never rebuilds a stored list straight from a keystroke', () => {
    expect(source).not.toMatch(/onChange=\{v=>onChange\(\{\.\.\.q,people:v\.split/)
    expect(source).not.toMatch(/onChange=\{v=>onChange\(\{\.\.\.q,chores:v\.split/)
  })
})
