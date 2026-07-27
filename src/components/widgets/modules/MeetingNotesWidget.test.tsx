import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MeetingNotesData, MeetingNotesSkinMode } from '../../../types/spatial'
import { MeetingNotesWidget } from './MeetingNotesWidget'

const actions: MeetingNotesData['actions'] = [
  { id: 'one', text: 'Pick the launch date', done: false },
  { id: 'two', text: 'Draft the changelog', done: true },
]

function render(
  skin: MeetingNotesSkinMode,
  skinState: Record<string, unknown> = {},
  overrides: Partial<MeetingNotesData> = {},
) {
  return renderToStaticMarkup(
    <MeetingNotesWidget
      data={{
        skin,
        date: '2026-07-26',
        attendees: 'Amir Hamza, Rae Ndlovu',
        notes: 'Shipping the skin roller.',
        actions,
        skinStates: { [skin]: skinState },
        ...overrides,
      }}
      onChange={() => undefined}
    />,
  )
}

describe('purpose-built Meeting Notes skins', () => {
  it.each([
    ['agenda', 'gp-meeting-rail'],
    ['minutes', 'gp-meeting-ledger'],
    ['stand_up', 'gp-meeting-lanes'],
    ['retrospective', 'gp-meeting-quadrants'],
    ['one_to_one', 'gp-meeting-columns'],
    ['decision_review', 'gp-meeting-decisions'],
    ['handoff', 'gp-meeting-signoff'],
  ] as const)('gives %s its own body', (skin, marker) => {
    const html = render(skin)
    expect(html).toContain(`data-meeting-skin="${skin}"`)
    expect(html).toContain(marker)
  })

  it.each([
    'agenda',
    'minutes',
    'stand_up',
    'retrospective',
    'one_to_one',
    'decision_review',
    'handoff',
  ] as const)('%s still shows every canonical fact', (skin) => {
    const html = render(skin)
    // Date, attendees, notes, and both actions survive in every shape — this is
    // what makes rolling a skin safe.
    expect(html).toContain('2026-07-26')
    expect(html).toContain('Amir Hamza, Rae Ndlovu')
    expect(html).toContain('Shipping the skin roller.')
    expect(html).toContain('Pick the launch date')
    expect(html).toContain('Draft the changelog')
  })

  it('reads a completed action back as checked', () => {
    const html = render('minutes')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('aria-checked="false"')
  })

  it('shows an agenda timebox and its running total', () => {
    const html = render('agenda', { items: { one: { minutes: '15' }, two: { minutes: '30' } } })
    expect(html).toContain('45 min')
    expect(html).toContain('1/2 covered')
  })

  it('counts decisions that have reached their review date', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const html = render('decision_review', { items: { one: { review: past } } })
    expect(html).toContain('to revisit')
  })

  it('stamps an acknowledged handoff and leaves an unsigned one open', () => {
    const signed = render('handoff', { acknowledged: true, acknowledgedBy: 'Jun Park' })
    expect(signed).toContain('data-acknowledged="true"')
    expect(signed).toContain('Jun Park')

    const unsigned = render('handoff')
    expect(unsigned).toContain('data-acknowledged="false"')
    expect(unsigned).toContain('Mark acknowledged')
  })

  it('renders attendees as chips where a shape presents them formally', () => {
    const html = render('minutes')
    expect(html).toContain('gp-meeting-chips')
    expect(html).toContain('2 present')
    // Initials, not the whole name, sit in the avatar.
    expect(html).toContain('>AH<')
  })

  it('gives every skin a real empty state instead of a bare list', () => {
    for (const skin of ['agenda', 'stand_up', 'decision_review', 'handoff'] as const) {
      const html = render(skin, {}, { actions: [] })
      expect(html).toContain('gp-meeting-empty')
    }
  })

  it('survives a card with nothing filled in', () => {
    const html = renderToStaticMarkup(
      <MeetingNotesWidget
        data={{ skin: 'retrospective', date: '', attendees: '', notes: '', actions: [] }}
        onChange={() => undefined}
      />,
    )
    expect(html).toContain('gp-meeting-quadrants')
    expect(html).not.toContain('gp-meeting-chips')
  })

  it('labels the shared writing surface for the shape it is worn as', () => {
    expect(render('stand_up')).toContain('Today')
    expect(render('retrospective')).toContain('Went well')
    expect(render('handoff')).toContain('Current state')
    expect(render('one_to_one')).toContain('Talking points')
  })
})
