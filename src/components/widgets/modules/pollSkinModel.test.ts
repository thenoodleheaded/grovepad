import { describe, expect, it } from 'vitest'
import type { PollData } from '../../../types/spatial'
import {
  addPollOption,
  castAnonymousVote,
  castApprovalBallot,
  castPairwiseWin,
  castRankedBallot,
  dataWithLiveRoom,
  duelWins,
  instantRunoffRounds,
  liveRoomState,
  liveRoomTurnout,
  pairwiseQueue,
  pairwiseStandings,
  pollBallotCount,
  pollIsTied,
  pollOptions,
  pollSkinMode,
  pollTallies,
  rankedBallots,
  removePollOption,
  resetPollVotes,
  segmentColor,
  totalPollVotes,
} from './pollSkinModel'

const base = (): PollData => ({
  skin: 'bars',
  question: 'Which direction?',
  options: [
    { id: 'a', label: 'North', votes: 3 },
    { id: 'b', label: 'South', votes: 1 },
    { id: 'c', label: 'East', votes: 0 },
  ],
})

describe('Poll option validation', () => {
  it('drops malformed rows, duplicate ids, and negative counts', () => {
    expect(pollOptions([
      { id: 'a', label: 'Keep', votes: 2 },
      { id: 'a', label: 'Duplicate id', votes: 9 },
      { id: 'b', label: 'Negative', votes: -4 },
      'not an option',
      null,
    ])).toEqual([
      { id: 'a', label: 'Keep', votes: 2 },
      { id: 'b', label: 'Negative', votes: 0 },
    ])
  })

  it('falls back to Bars for an unknown skin', () => {
    expect(pollSkinMode('donut')).toBe('donut')
    expect(pollSkinMode('ranked-choice')).toBe('bars')
    expect(pollSkinMode(undefined)).toBe('bars')
  })

  it('gives each option a stable colour by declared position', () => {
    expect(segmentColor(0)).not.toBe(segmentColor(1))
    expect(segmentColor(0)).toBe(segmentColor(8))
  })
})

describe('Poll standings', () => {
  it('ranks and shares without reordering the declared list', () => {
    const tallies = pollTallies(base().options)
    expect(tallies.map((tally) => tally.option.id)).toEqual(['a', 'b', 'c'])
    expect(tallies[0]).toMatchObject({ rank: 1, share: 75, leading: true })
    expect(tallies[1]).toMatchObject({ rank: 2, share: 25, leading: false })
  })

  it('sorts by standing and keeps declared order as the tie-break', () => {
    const tied = pollTallies([
      { id: 'a', label: 'A', votes: 1 },
      { id: 'b', label: 'B', votes: 4 },
      { id: 'c', label: 'C', votes: 1 },
    ], 'leading')
    expect(tied.map((tally) => tally.option.id)).toEqual(['b', 'a', 'c'])
  })

  it('reports no leader and no tie before anything is cast', () => {
    const empty = base().options.map((option) => ({ ...option, votes: 0 }))
    expect(totalPollVotes(empty)).toBe(0)
    expect(pollIsTied(empty)).toBe(false)
    expect(pollTallies(empty)[0]?.leading).toBe(false)
  })

  it('sees a tie at the top', () => {
    expect(pollIsTied([
      { id: 'a', label: 'A', votes: 2 },
      { id: 'b', label: 'B', votes: 2 },
    ])).toBe(true)
  })
})

describe('Approval ballots', () => {
  it('credits every approved option once and counts one ballot', () => {
    const next = castApprovalBallot(base(), ['a', 'c', 'a'])
    expect(next.options.map((option) => option.votes)).toEqual([4, 1, 1])
    expect(pollBallotCount(next, 'approval')).toBe(1)
  })

  it('ignores an empty ballot and unknown ids', () => {
    expect(castApprovalBallot(base(), [])).toEqual(base())
    expect(castApprovalBallot(base(), ['ghost'])).toEqual(base())
  })
})

describe('Ranked choice', () => {
  it('counts the first preference and keeps the whole ballot', () => {
    const next = castRankedBallot(base(), ['c', 'b', 'a'])
    expect(next.options.find((option) => option.id === 'c')?.votes).toBe(1)
    expect(rankedBallots(next)).toEqual([['c', 'b', 'a']])
    expect(next.skin).toBe('ranked_choice')
  })

  it('eliminates the weakest option until somebody holds a majority', () => {
    const ballots = [
      ['a', 'c'],
      ['a', 'c'],
      ['b', 'c'],
      ['b', 'c'],
      ['c', 'b'],
    ]
    const rounds = instantRunoffRounds(base().options, ballots)
    expect(rounds).toHaveLength(2)
    expect(rounds[0]?.eliminated).toBe('c')
    expect(rounds[1]?.winner).toBe('b')
    expect(rounds[1]?.counts.find((entry) => entry.id === 'b')?.votes).toBe(3)
  })

  it('ends immediately when one option already holds a majority', () => {
    const rounds = instantRunoffRounds(base().options, [['a'], ['a'], ['b']])
    expect(rounds).toHaveLength(1)
    expect(rounds[0]?.winner).toBe('a')
  })

  it('counts a ballot whose every preference is gone as exhausted', () => {
    const rounds = instantRunoffRounds(base().options, [['a'], ['b'], ['ghost']])
    expect(rounds[0]?.exhausted).toBe(1)
  })

  it('returns no rounds without ballots', () => {
    expect(instantRunoffRounds(base().options, [])).toEqual([])
  })
})

describe('Pairwise duels', () => {
  it('records the head-to-head result and credits the winner', () => {
    const next = castPairwiseWin(base(), 'b', 'a')
    expect(next.options.find((option) => option.id === 'b')?.votes).toBe(2)
    expect(duelWins(next.skinStates?.pairwise?.duels as Record<string, number>, 'b', 'a')).toBe(1)
  })

  it('refuses a duel against itself or an unknown option', () => {
    expect(castPairwiseWin(base(), 'a', 'a')).toEqual(base())
    expect(castPairwiseWin(base(), 'a', 'ghost')).toEqual(base())
  })

  it('offers the least-judged pairing first', () => {
    const judged = castPairwiseWin(base(), 'a', 'b')
    const queue = pairwiseQueue(judged.options, {
      ...(judged.skinStates?.pairwise?.duels as Record<string, number>),
    })
    expect(queue[0]?.map((option) => option.id)).toEqual(['a', 'c'])
    expect(queue.at(-1)?.map((option) => option.id)).toEqual(['a', 'b'])
  })

  it('tallies wins and losses across every pairing', () => {
    const duels = { 'a|b': 2, 'b|a': 1, 'c|a': 1 }
    expect(pairwiseStandings(base().options, duels)).toEqual([
      { id: 'a', wins: 2, losses: 2, judged: 4 },
      { id: 'b', wins: 1, losses: 2, judged: 3 },
      { id: 'c', wins: 1, losses: 0, judged: 1 },
    ])
  })
})

describe('Live room', () => {
  it('starts in the lobby with nothing revealed', () => {
    expect(liveRoomState(base())).toEqual({ participants: 0, phase: 'lobby', revealed: false })
  })

  it('re-hides a revealed result when the floor reopens', () => {
    const opened = dataWithLiveRoom(base(), { phase: 'open', participants: 8 })
    const revealed = dataWithLiveRoom(opened, { revealed: true })
    const closed = dataWithLiveRoom(revealed, { phase: 'closed' })
    expect(liveRoomState(closed).revealed).toBe(true)
    expect(liveRoomState(dataWithLiveRoom(closed, { phase: 'open' })).revealed).toBe(false)
  })

  it('clamps participants and caps turnout at full attendance', () => {
    expect(liveRoomState(dataWithLiveRoom(base(), { participants: -3 })).participants).toBe(0)
    expect(liveRoomTurnout(base().options, 8)).toBe(50)
    expect(liveRoomTurnout(base().options, 2)).toBe(100)
    expect(liveRoomTurnout(base().options, 0)).toBe(0)
  })
})

describe('Anonymous ballots', () => {
  it('records the choice in the aggregate and nothing else', () => {
    const next = castAnonymousVote(base(), 'c')
    expect(next.options.find((option) => option.id === 'c')?.votes).toBe(1)
    expect(next.skinStates?.anonymous).toEqual({ ballots: 1 })
  })
})

describe('Poll option lifecycle', () => {
  it('erases a removed option from ballots and duels', () => {
    const withBallot = castRankedBallot(base(), ['b', 'a', 'c'])
    const withDuel = castPairwiseWin(withBallot, 'a', 'b')
    const next = removePollOption(withDuel, 'b')
    expect(next.options.map((option) => option.id)).toEqual(['a', 'c'])
    expect(rankedBallots(next)).toEqual([['a', 'c']])
    expect(next.skinStates?.pairwise?.duels).toEqual({})
  })

  it('clears every skin ledger when votes are reset', () => {
    const busy = dataWithLiveRoom(castApprovalBallot(base(), ['a']), { phase: 'open' })
    const cleared = resetPollVotes(busy)
    expect(cleared.options.every((option) => option.votes === 0)).toBe(true)
    expect(cleared.skinStates).toBeUndefined()
    expect(liveRoomState(cleared).phase).toBe('lobby')
  })

  it('adds an option with a clean slate', () => {
    const next = addPollOption(base(), 'd')
    expect(next.options.at(-1)).toEqual({ id: 'd', label: '', votes: 0 })
  })
})
