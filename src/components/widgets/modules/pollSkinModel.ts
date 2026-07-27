import type { ModuleData, PollData, PollOption, PollSkinMode } from '../../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'

/**
 * Poll skins in catalogue order.
 *
 * Every skin collects preferences a different way, but they all settle into the
 * same canonical `options[].votes`. That is what makes a skin change safe: a
 * ranked ballot leaves first-preference counts behind, a duel leaves the
 * winner's tally behind, and Bars can read either one without knowing how the
 * numbers were gathered. Anything a single skin needs and no other skin can
 * interpret — ballots, duel records, room phase — lives in `skinStates`.
 */
export const POLL_SKINS: readonly PollSkinMode[] = [
  'bars',
  'donut',
  'approval',
  'ranked_choice',
  'pairwise',
  'live_room',
  'anonymous',
]

export type PollOrder = 'declared' | 'leading'
export type LiveRoomPhase = 'lobby' | 'open' | 'closed'

/** Segment colours, in option order. Harmonised with the Poll's fuchsia accent. */
export const POLL_SEGMENT_COLORS: readonly string[] = [
  '#f0abfc',
  '#c4b5fd',
  '#93c5fd',
  '#5eead4',
  '#fcd34d',
  '#fda4af',
  '#bef264',
  '#a5b4fc',
]

export interface PollTally {
  option: PollOption
  /** Position in the declared option list — the stable colour index. */
  index: number
  votes: number
  /** 0–100, rounded to one decimal. Zero when nothing has been cast. */
  share: number
  /** 1-based standing; ties share a rank. */
  rank: number
  leading: boolean
}

export interface RankedRound {
  counts: Array<{ id: string; votes: number }>
  /** Removed at the end of this round, if the count had to be narrowed. */
  eliminated: string | null
  /** Set on the final round when somebody holds a majority. */
  winner: string | null
  exhausted: number
}

export interface PairwiseStanding {
  id: string
  wins: number
  losses: number
  judged: number
}

const MAX_OPTIONS = 24
const MAX_LABEL = 160
const MAX_QUESTION = 400
const MAX_VOTES = 1_000_000
const MAX_BALLOTS = 200
const MAX_PARTICIPANTS = 999
const LIVE_PHASES = new Set<LiveRoomPhase>(['lobby', 'open', 'closed'])

function wholeCount(raw: unknown, limit: number): number {
  const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 0
  return Math.min(Math.max(value, 0), limit)
}

export function pollSkinMode(raw: unknown): PollSkinMode {
  return typeof raw === 'string' && POLL_SKINS.includes(raw as PollSkinMode)
    ? raw as PollSkinMode
    : 'bars'
}

export function pollQuestion(raw: unknown): string {
  return typeof raw === 'string' ? raw.slice(0, MAX_QUESTION) : ''
}

export function pollOptions(raw: unknown): PollOption[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.slice(0, MAX_OPTIONS).flatMap((item, index) => {
    if (!item || typeof item !== 'object') return []
    const option = item as Partial<PollOption>
    const candidate = typeof option.id === 'string' && option.id ? option.id : `option-${index}`
    if (seen.has(candidate)) return []
    seen.add(candidate)
    return [{
      id: candidate,
      label: typeof option.label === 'string' ? option.label.slice(0, MAX_LABEL) : '',
      votes: wholeCount(option.votes, MAX_VOTES),
    }]
  })
}

export function totalPollVotes(options: readonly PollOption[]): number {
  return options.reduce((sum, option) => sum + option.votes, 0)
}

export function pollShare(votes: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((votes / total) * 1000) / 10
}

/**
 * Every option with its standing. `order: 'leading'` sorts by votes and keeps
 * the declared order as the tie-break, so a re-sorted list never shuffles
 * beneath the reader when two options are level.
 */
export function pollTallies(
  options: readonly PollOption[],
  order: PollOrder = 'declared',
): PollTally[] {
  const total = totalPollVotes(options)
  const top = options.reduce((best, option) => Math.max(best, option.votes), 0)
  const descending = [...options].sort((a, b) => b.votes - a.votes)
  const tallies = options.map((option, index) => ({
    option,
    index,
    votes: option.votes,
    share: pollShare(option.votes, total),
    rank: descending.findIndex((entry) => entry.votes === option.votes) + 1,
    leading: top > 0 && option.votes === top,
  }))
  if (order === 'declared') return tallies
  return tallies.sort((a, b) => b.votes - a.votes || a.index - b.index)
}

export function leadingPollOption(options: readonly PollOption[]): PollOption | null {
  const total = totalPollVotes(options)
  if (total <= 0) return null
  return [...options].sort((a, b) => b.votes - a.votes)[0] ?? null
}

/** True when more than one option is tied at the top of a non-empty poll. */
export function pollIsTied(options: readonly PollOption[]): boolean {
  const leader = leadingPollOption(options)
  if (!leader) return false
  return options.filter((option) => option.votes === leader.votes).length > 1
}

export function segmentColor(index: number): string {
  return POLL_SEGMENT_COLORS[index % POLL_SEGMENT_COLORS.length]!
}

// --- canonical writes -------------------------------------------------------

function withOptions(data: PollData, options: PollOption[]): PollData {
  return { ...data, options }
}

export function addPollVotes(
  data: PollData,
  votes: Readonly<Record<string, number>>,
): PollData {
  return withOptions(data, pollOptions(data.options).map((option) => (
    votes[option.id]
      ? { ...option, votes: Math.min(option.votes + votes[option.id]!, MAX_VOTES) }
      : option
  )))
}

export function castPollVote(data: PollData, optionId: string): PollData {
  return addPollVotes(data, { [optionId]: 1 })
}

export function setPollOptionLabel(
  data: PollData,
  optionId: string,
  label: string,
): PollData {
  return withOptions(data, pollOptions(data.options).map((option) => (
    option.id === optionId ? { ...option, label: label.slice(0, MAX_LABEL) } : option
  )))
}

export function addPollOption(data: PollData, id: string = crypto.randomUUID()): PollData {
  const options = pollOptions(data.options)
  if (options.length >= MAX_OPTIONS) return data
  return withOptions(data, [...options, { id, label: '', votes: 0 }])
}

/**
 * Remove an option and every trace of it from the skins that reference it by
 * id, so a deleted option can never resurrect as a phantom ranking row or an
 * unresolvable duel.
 */
export function removePollOption(data: PollData, optionId: string): PollData {
  const states = Object.fromEntries(
    Object.entries(data.skinStates ?? {}).map(([skin, rawState]) => {
      const state = readState(rawState)
      const next: WidgetSkinState = { ...state }
      if (Array.isArray(state.ballots)) {
        next.ballots = readBallots(state).map((ballot) => (
          ballot.filter((id) => id !== optionId)
        )).filter((ballot) => ballot.length > 0)
      }
      if (state.duels) {
        next.duels = Object.fromEntries(
          Object.entries(readDuels(state)).filter(([key]) => !key.split('|').includes(optionId)),
        )
      }
      return [skin, next]
    }),
  )
  const cleaned = { ...data, options: pollOptions(data.options).filter((option) => option.id !== optionId) }
  return Object.keys(states).length > 0 ? { ...cleaned, skinStates: states } : cleaned
}

export function resetPollVotes(data: PollData): PollData {
  return {
    ...data,
    options: pollOptions(data.options).map((option) => ({ ...option, votes: 0 })),
    skinStates: undefined,
  }
}

// --- skin state -------------------------------------------------------------

function readState(raw: unknown): WidgetSkinState {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as WidgetSkinState : {}
}

function patchState(
  data: PollData,
  skin: PollSkinMode,
  patch: WidgetSkinState,
): PollData {
  const state = skinStateFor(data, skin)
  return dataWithSkinState(
    { ...data, skin } as ModuleData,
    skin,
    { ...state, ...patch },
  ) as PollData
}

export function pollOrder(data: Pick<PollData, 'skinStates'>, skin: PollSkinMode): PollOrder {
  return skinStateFor(data, skin).order === 'leading' ? 'leading' : 'declared'
}

export function dataWithPollOrder(
  data: PollData,
  skin: PollSkinMode,
  order: PollOrder,
): PollData {
  return patchState(data, skin, { order })
}

/** How many ballots a skin has collected — the denominator its copy quotes. */
export function pollBallotCount(
  data: Pick<PollData, 'skinStates'>,
  skin: PollSkinMode,
): number {
  return wholeCount(skinStateFor(data, skin).ballots, MAX_VOTES)
}

// --- Approval ---------------------------------------------------------------

/**
 * One approval ballot approves any number of options at once, so each approved
 * option gains a vote and the ballot count gains one. Share is then read
 * against ballots, not against total votes: "on 4 of 6 ballots".
 */
export function castApprovalBallot(
  data: PollData,
  approvedIds: readonly string[],
): PollData {
  const known = new Set(pollOptions(data.options).map((option) => option.id))
  const approved = [...new Set(approvedIds)].filter((id) => known.has(id))
  if (approved.length === 0) return data
  const voted = addPollVotes(
    data,
    Object.fromEntries(approved.map((id) => [id, 1])),
  )
  return patchState(voted, 'approval', {
    ballots: Math.min(pollBallotCount(data, 'approval') + 1, MAX_VOTES),
  })
}

// --- Ranked choice ----------------------------------------------------------

function readBallots(state: WidgetSkinState): string[][] {
  if (!Array.isArray(state.ballots)) return []
  return state.ballots.slice(-MAX_BALLOTS).flatMap((raw) => {
    if (!Array.isArray(raw)) return []
    const ranking = [...new Set(raw.filter((id): id is string => typeof id === 'string'))]
    return ranking.length > 0 ? [ranking.slice(0, MAX_OPTIONS)] : []
  })
}

export function rankedBallots(data: Pick<PollData, 'skinStates'>): string[][] {
  return readBallots(skinStateFor(data, 'ranked_choice'))
}

/**
 * A submitted ranking counts as one vote for its first preference, so the
 * canonical tally still means something in every other skin, while the whole
 * ordered ballot is kept for the runoff.
 */
export function castRankedBallot(data: PollData, ranking: readonly string[]): PollData {
  const known = new Set(pollOptions(data.options).map((option) => option.id))
  const ballot = [...new Set(ranking)].filter((id) => known.has(id))
  if (ballot.length === 0) return data
  const voted = castPollVote(data, ballot[0]!)
  return patchState(voted, 'ranked_choice', {
    ballots: [...rankedBallots(data), ballot].slice(-MAX_BALLOTS),
  })
}

/**
 * Instant-runoff rounds. Each round counts every ballot's highest surviving
 * preference; a majority ends it, otherwise the lowest-scoring option is
 * eliminated. Ties eliminate the option declared last, so the same ballots
 * always produce the same rounds.
 */
export function instantRunoffRounds(
  options: readonly PollOption[],
  ballots: readonly (readonly string[])[],
): RankedRound[] {
  const order = pollOptions(options).map((option) => option.id)
  if (order.length === 0 || ballots.length === 0) return []
  const active = new Set(order)
  const rounds: RankedRound[] = []

  while (rounds.length < order.length) {
    const counts = new Map(order.filter((id) => active.has(id)).map((id) => [id, 0]))
    let exhausted = 0
    for (const ballot of ballots) {
      const choice = ballot.find((id) => active.has(id))
      if (choice === undefined) exhausted += 1
      else counts.set(choice, (counts.get(choice) ?? 0) + 1)
    }

    const standing = [...counts].map(([id, votes]) => ({ id, votes }))
    const counted = ballots.length - exhausted
    const best = standing.reduce(
      (top, entry) => (entry.votes > top.votes ? entry : top),
      standing[0] ?? { id: '', votes: 0 },
    )

    if (standing.length <= 1 || (counted > 0 && best.votes * 2 > counted)) {
      rounds.push({ counts: standing, eliminated: null, winner: best.id || null, exhausted })
      return rounds
    }

    const lowest = standing.reduce((worst, entry) => (entry.votes <= worst.votes ? entry : worst))
    active.delete(lowest.id)
    rounds.push({ counts: standing, eliminated: lowest.id, winner: null, exhausted })
  }
  return rounds
}

// --- Pairwise ---------------------------------------------------------------

function readDuels(state: WidgetSkinState): Record<string, number> {
  const raw = state.duels
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(([key]) => key.split('|').length === 2)
      .map(([key, value]) => [key, wholeCount(value, MAX_VOTES)])
      .filter(([, value]) => (value as number) > 0),
  ) as Record<string, number>
}

/** Head-to-head record, keyed `winnerId|loserId`. */
export function pairwiseDuels(data: Pick<PollData, 'skinStates'>): Record<string, number> {
  return readDuels(skinStateFor(data, 'pairwise'))
}

export function duelKey(winnerId: string, loserId: string): string {
  return `${winnerId}|${loserId}`
}

export function duelWins(
  duels: Readonly<Record<string, number>>,
  winnerId: string,
  loserId: string,
): number {
  return duels[duelKey(winnerId, loserId)] ?? 0
}

export function castPairwiseWin(
  data: PollData,
  winnerId: string,
  loserId: string,
): PollData {
  const known = new Set(pollOptions(data.options).map((option) => option.id))
  if (winnerId === loserId || !known.has(winnerId) || !known.has(loserId)) return data
  const duels = pairwiseDuels(data)
  const key = duelKey(winnerId, loserId)
  return patchState(castPollVote(data, winnerId), 'pairwise', {
    duels: { ...duels, [key]: Math.min((duels[key] ?? 0) + 1, MAX_VOTES) },
  })
}

/** Every unordered pairing, least-judged first, then in declared order. */
export function pairwiseQueue(
  options: readonly PollOption[],
  duels: Readonly<Record<string, number>>,
): Array<[PollOption, PollOption]> {
  const list = pollOptions(options)
  const pairs: Array<{ pair: [PollOption, PollOption]; judged: number; seq: number }> = []
  let seq = 0
  for (let a = 0; a < list.length; a += 1) {
    for (let b = a + 1; b < list.length; b += 1) {
      const left = list[a]!
      const right = list[b]!
      pairs.push({
        pair: [left, right],
        judged: duelWins(duels, left.id, right.id) + duelWins(duels, right.id, left.id),
        seq: seq++,
      })
    }
  }
  return pairs
    .sort((x, y) => x.judged - y.judged || x.seq - y.seq)
    .map((entry) => entry.pair)
}

export function pairwiseStandings(
  options: readonly PollOption[],
  duels: Readonly<Record<string, number>>,
): PairwiseStanding[] {
  const list = pollOptions(options)
  return list.map((option) => {
    let wins = 0
    let losses = 0
    for (const other of list) {
      if (other.id === option.id) continue
      wins += duelWins(duels, option.id, other.id)
      losses += duelWins(duels, other.id, option.id)
    }
    return { id: option.id, wins, losses, judged: wins + losses }
  })
}

// --- Live room --------------------------------------------------------------

export interface LiveRoomState {
  participants: number
  phase: LiveRoomPhase
  revealed: boolean
}

export function liveRoomState(data: Pick<PollData, 'skinStates'>): LiveRoomState {
  const state = skinStateFor(data, 'live_room')
  return {
    participants: wholeCount(state.participants, MAX_PARTICIPANTS),
    phase: LIVE_PHASES.has(state.phase as LiveRoomPhase)
      ? state.phase as LiveRoomPhase
      : 'lobby',
    revealed: state.revealed === true,
  }
}

/**
 * Closing the room reveals nothing on its own — a host still chooses when the
 * result appears — but reopening a closed room hides it again so a second
 * round is never voted on with the first round's answer on screen.
 */
export function dataWithLiveRoom(
  data: PollData,
  patch: Partial<LiveRoomState>,
): PollData {
  const current = liveRoomState(data)
  const next = { ...current, ...patch }
  if (patch.phase === 'open' && current.phase !== 'open') next.revealed = false
  return patchState(data, 'live_room', {
    participants: wholeCount(next.participants, MAX_PARTICIPANTS),
    phase: next.phase,
    revealed: next.revealed,
  })
}

export function liveRoomTurnout(
  options: readonly PollOption[],
  participants: number,
): number {
  if (participants <= 0) return 0
  return Math.min(100, Math.round((totalPollVotes(options) / participants) * 100))
}

// --- Anonymous --------------------------------------------------------------

/**
 * An anonymous ballot increments the chosen option and the ballot count and
 * records nothing else. There is deliberately no per-voter trace to store,
 * which is why "have I voted" stays component state and never reaches disk.
 */
export function castAnonymousVote(data: PollData, optionId: string): PollData {
  const known = new Set(pollOptions(data.options).map((option) => option.id))
  if (!known.has(optionId)) return data
  return patchState(castPollVote(data, optionId), 'anonymous', {
    ballots: Math.min(pollBallotCount(data, 'anonymous') + 1, MAX_VOTES),
  })
}
