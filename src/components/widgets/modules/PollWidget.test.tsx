import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PollData, PollSkinMode } from '../../../types/spatial'
import { PollWidget } from './PollWidget'

const options: PollData['options'] = [
  { id: 'a', label: 'Coastal route', votes: 3 },
  { id: 'b', label: 'Mountain pass', votes: 1 },
]

function render(skin: PollSkinMode, skinState: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <PollWidget
      data={{
        skin,
        question: 'Which direction?',
        options,
        skinStates: { [skin]: skinState },
      }}
      onChange={() => undefined}
    />,
  )
}

describe('purpose-built Poll skins', () => {
  it.each([
    ['bars', 'gp-poll-bars'],
    ['donut', 'gp-poll-donut'],
    ['approval', 'gp-poll-approval'],
    ['ranked_choice', 'gp-poll-ranked'],
    ['pairwise', 'gp-poll-pairwise'],
    ['live_room', 'gp-poll-room'],
    ['anonymous', 'gp-poll-anon'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    const markup = render(skin)
    expect(markup).toContain(className)
    expect(markup).toContain(`data-poll-skin="${skin}"`)
    expect(markup).toContain('Which direction?')
    expect(markup).toContain('Coastal route')
    expect(markup).toContain('Mountain pass')
  })

  it('crowns the leader and states the share on the bars', () => {
    const markup = render('bars')
    expect(markup).toContain('data-leading="true"')
    expect(markup).toContain('75%')
    expect(markup).toContain('25%')
  })

  it('draws one dial arc per option and a total in the middle', () => {
    const markup = render('donut')
    expect(markup.match(/gp-poll-dial-arc/g)).toHaveLength(2)
    expect(markup).toContain('<strong>4</strong>')
  })

  it('quotes approval against ballots cast, not against total votes', () => {
    expect(render('approval', { ballots: 4 })).toContain('3/4')
    expect(render('approval')).toContain('—')
  })

  it('shows the runoff only once a ranking has been submitted', () => {
    expect(render('ranked_choice')).toContain('Submit a ranking to run the first round')
    const withBallots = render('ranked_choice', { ballots: [['b', 'a'], ['b', 'a'], ['a', 'b']] })
    expect(withBallots).toContain('Round 1')
    expect(withBallots).toContain('Majority')
  })

  it('pairs the two options and reports the head-to-head record', () => {
    const markup = render('pairwise', { duels: { 'a|b': 2 } })
    expect(markup).toContain('gp-poll-duel-card')
    expect(markup).toContain('2–0 here')
    expect(markup).toContain('gp-poll-matrix')
  })

  it('masks the room result until the host reveals it', () => {
    const hidden = render('live_room', { phase: 'open', participants: 6 })
    expect(hidden).toContain('data-masked="true"')
    expect(hidden).toContain('•••')
    expect(hidden).not.toContain('75%')

    const shown = render('live_room', { phase: 'closed', participants: 6, revealed: true })
    expect(shown).toContain('75%')
    expect(shown).not.toContain('data-masked="true"')
  })

  it('never names the leader in the header while the body is veiled', () => {
    const hidden = render('live_room', { phase: 'open', participants: 6 })
    expect(hidden).toContain('Results held back')
    expect(hidden).not.toContain('Coastal route leads')

    expect(render('live_room')).toContain('Floor not open yet')
    expect(render('anonymous', { ballots: 3 })).toContain('Vote to see the tally')

    const revealed = render('live_room', { phase: 'closed', revealed: true })
    expect(revealed).toContain('Coastal route leads')
  })

  it('keeps the room shut until the floor is opened', () => {
    expect(render('live_room')).toContain('Open voting')
    expect(render('live_room', { phase: 'open' })).toContain('Close voting')
  })

  it('veils the anonymous tally until this voter has cast', () => {
    const markup = render('anonymous', { ballots: 12 })
    expect(markup).toContain('no voter identity is stored')
    expect(markup).toContain('data-masked="true"')
    expect(markup).toContain('12 anonymous ballots in the tally')
  })

  it('collapses to a prompt when every option has been removed', () => {
    const markup = renderToStaticMarkup(
      <PollWidget
        data={{ skin: 'bars', question: 'Which direction?', options: [] }}
        onChange={() => undefined}
      />,
    )
    expect(markup).toContain('gp-poll-empty')
    expect(markup).toContain('No options yet')
    expect(markup).not.toContain('gp-poll-bar-row')
  })

  it('labels every control for a screen reader', () => {
    const markup = render('bars')
    expect(markup).toContain('aria-label="Vote for Coastal route"')
    expect(markup).toContain('aria-label="Remove Coastal route"')
    expect(markup).toContain('aria-label="Poll question"')
  })
})
