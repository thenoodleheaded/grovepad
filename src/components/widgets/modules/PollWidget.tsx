import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Crown,
  Eye,
  EyeOff,
  ListOrdered,
  Minus,
  PieChart,
  Plus,
  Radio,
  Shield,
  Shuffle,
  Swords,
  X,
} from 'lucide-react'
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type { PollData, PollOption, PollSkinMode } from '../../../types/spatial'
import { useTransientValue } from '../../../hooks/useTransientValue'
import {
  addPollOption,
  castAnonymousVote,
  castApprovalBallot,
  castPairwiseWin,
  castPollVote,
  castRankedBallot,
  dataWithLiveRoom,
  dataWithPollOrder,
  duelWins,
  instantRunoffRounds,
  leadingPollOption,
  liveRoomState,
  liveRoomTurnout,
  pairwiseDuels,
  pairwiseQueue,
  pairwiseStandings,
  pollBallotCount,
  pollIsTied,
  pollOptions,
  pollOrder,
  pollQuestion,
  pollShare,
  pollSkinMode,
  pollTallies,
  rankedBallots,
  removePollOption,
  segmentColor,
  setPollOptionLabel,
  totalPollVotes,
} from './pollSkinModel'

interface PollWidgetProps {
  data: PollData
  onChange: (data: PollData) => void
  onHeightChange?: (height: number) => void
}

const SKIN_COPY: Record<PollSkinMode, { eyebrow: string; hint: string }> = {
  bars: {
    eyebrow: 'Vote share',
    hint: 'Tap +1 on the option you favour.',
  },
  donut: {
    eyebrow: 'Share of votes',
    hint: 'Tap a swatch to add a vote.',
  },
  approval: {
    eyebrow: 'Approval ballot',
    hint: 'Approve as many as you like, then cast one ballot.',
  },
  ranked_choice: {
    eyebrow: 'Ranked choice',
    hint: 'Order every option, then submit the ranking.',
  },
  pairwise: {
    eyebrow: 'Head to head',
    hint: 'Pick a winner from each pairing.',
  },
  live_room: {
    eyebrow: 'Live room',
    hint: 'Open the floor, collect votes, then reveal.',
  },
  anonymous: {
    eyebrow: 'Anonymous ballot',
    hint: 'One tap. Nothing is stored against a voter.',
  },
}

const DONUT_GAP = 0.9

function skinIcon(skin: PollSkinMode): ReactNode {
  if (skin === 'bars') return <BarChart3 size={12} aria-hidden />
  if (skin === 'donut') return <PieChart size={12} aria-hidden />
  if (skin === 'approval') return <Check size={12} aria-hidden />
  if (skin === 'ranked_choice') return <ListOrdered size={12} aria-hidden />
  if (skin === 'pairwise') return <Swords size={12} aria-hidden />
  if (skin === 'live_room') return <Radio size={12} aria-hidden />
  return <Shield size={12} aria-hidden />
}

function optionName(option: PollOption, fallback = 'Untitled option'): string {
  return option.label.trim() || fallback
}

/** Tap-to-vote poll wearing one of seven ways to gather a preference. */
export function PollWidget({ data, onChange, onHeightChange }: PollWidgetProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const skin = pollSkinMode(data.skin)
  const question = pollQuestion(data.question)
  const options = pollOptions(data.options)
  const total = totalPollVotes(options)
  const order = pollOrder(data, skin)
  const copy = SKIN_COPY[skin]

  const [approvals, setApprovals] = useState<ReadonlySet<string>>(() => new Set())
  const [ranking, setRanking] = useState<readonly string[]>([])
  const [duelOffset, setDuelOffset] = useState(0)
  const [hasCastAnonymously, setHasCastAnonymously] = useState(false)
  const [ack, showAck] = useTransientValue('')

  useLayoutEffect(() => {
    if (rootRef.current) onHeightChange?.(rootRef.current.scrollHeight)
  }, [data, onHeightChange, skin])

  const base = (): PollData => ({ ...data, skin, question, options })

  const tallies = pollTallies(options, order)
  const leader = leadingPollOption(options)
  const tied = pollIsTied(options)

  const vote = (optionId: string) => onChange(castPollVote(base(), optionId))
  const relabel = (optionId: string, label: string) =>
    onChange(setPollOptionLabel(base(), optionId, label))
  const drop = (optionId: string) => {
    setApprovals((previous) => {
      const next = new Set(previous)
      next.delete(optionId)
      return next
    })
    onChange(removePollOption(base(), optionId))
  }
  const add = () => onChange(addPollOption(base()))

  const labelField = (option: PollOption, placeholder = 'Option…') => (
    <div className="gp-poll-label gp-bare-field">
      <input
        value={option.label}
        placeholder={placeholder}
        aria-label="Option label"
        onChange={(event) => relabel(option.id, event.target.value)}
      />
    </div>
  )

  const removeButton = (option: PollOption) => (
    <button
      type="button"
      aria-label={`Remove ${optionName(option, 'empty option')}`}
      onClick={() => drop(option.id)}
      className="gp-poll-remove"
    >
      <X size={10} aria-hidden />
    </button>
  )

  const voteButton = (option: PollOption) => (
    <button
      type="button"
      aria-label={`Vote for ${optionName(option)}`}
      onClick={() => vote(option.id)}
      className="gp-poll-vote"
    >
      <Plus size={10} aria-hidden />
      <span>1</span>
    </button>
  )

  // --- Bars -----------------------------------------------------------------

  const barsView = (
    <ul className="gp-poll-bars">
      {tallies.map((tally) => (
        <li
          key={tally.option.id}
          className="gp-poll-bar-row"
          data-leading={tally.leading || undefined}
        >
          <span className="gp-poll-rank" aria-hidden>
            {tally.leading && total > 0 ? <Crown size={10} /> : tally.rank}
          </span>
          <div className="gp-poll-bar-body">
            {labelField(tally.option)}
            <div className="gp-poll-track">
              <span
                style={{
                  width: `${tally.share}%`,
                  '--gp-poll-seg': segmentColor(tally.index),
                } as CSSProperties}
              />
            </div>
          </div>
          <span className="gp-poll-stat">
            <b>{tally.share}%</b>
            <small>{tally.votes} vote{tally.votes === 1 ? '' : 's'}</small>
          </span>
          {voteButton(tally.option)}
          {removeButton(tally.option)}
        </li>
      ))}
    </ul>
  )

  // --- Donut ----------------------------------------------------------------

  let sweep = 0
  const arcs = tallies.map((tally) => {
    const length = total > 0 ? (tally.votes / total) * 100 : 100 / Math.max(tallies.length, 1)
    const arc = {
      id: tally.option.id,
      color: segmentColor(tally.index),
      length,
      offset: sweep,
    }
    sweep += length
    return arc
  })

  const donutView = (
    <div className="gp-poll-donut">
      <figure className="gp-poll-dial" data-empty={total === 0 || undefined}>
        <svg viewBox="0 0 100 100" role="img" aria-label={`Vote share across ${options.length} options`}>
          <circle className="gp-poll-dial-track" cx="50" cy="50" r="40" pathLength={100} />
          {arcs.map((arc) => {
            const drawn = Math.max(arc.length - DONUT_GAP, 0.4)
            return (
              <circle
                key={arc.id}
                className="gp-poll-dial-arc"
                cx="50"
                cy="50"
                r="40"
                pathLength={100}
                stroke={arc.color}
                strokeDasharray={`${drawn} ${100 - drawn}`}
                strokeDashoffset={-arc.offset}
              />
            )
          })}
        </svg>
        <figcaption>
          <strong>{total}</strong>
          <span>{total === 1 ? 'vote' : 'votes'}</span>
          {leader && (
            <em>{tied ? 'Tied' : optionName(leader)}</em>
          )}
        </figcaption>
      </figure>
      <ul className="gp-poll-legend">
        {tallies.map((tally) => (
          <li key={tally.option.id} className="gp-poll-legend-row">
            <button
              type="button"
              aria-label={`Vote for ${optionName(tally.option)}`}
              onClick={() => vote(tally.option.id)}
              className="gp-poll-swatch gp-check-free"
              style={{ '--gp-poll-seg': segmentColor(tally.index) } as CSSProperties}
            >
              <Plus size={9} aria-hidden />
            </button>
            {labelField(tally.option)}
            <span className="gp-poll-stat">
              <b>{tally.share}%</b>
              <small>{tally.votes}</small>
            </span>
            {removeButton(tally.option)}
          </li>
        ))}
      </ul>
    </div>
  )

  // --- Approval -------------------------------------------------------------

  const approvalBallots = pollBallotCount(data, 'approval')
  const toggleApproval = (optionId: string) => {
    setApprovals((previous) => {
      const next = new Set(previous)
      if (next.has(optionId)) next.delete(optionId)
      else next.add(optionId)
      return next
    })
  }
  const castApproval = () => {
    onChange(castApprovalBallot(base(), [...approvals]))
    setApprovals(new Set())
    showAck('Ballot counted', 1_800)
  }

  const approvalView = (
    <div className="gp-poll-approval">
      <ul className="gp-poll-approval-list">
        {tallies.map((tally) => {
          const approved = approvals.has(tally.option.id)
          const rate = approvalBallots > 0
            ? Math.min(100, Math.round((tally.votes / approvalBallots) * 100))
            : 0
          return (
            <li
              key={tally.option.id}
              className="gp-poll-approval-row"
              data-approved={approved || undefined}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={approved}
                aria-label={`Approve ${optionName(tally.option)}`}
                onClick={() => toggleApproval(tally.option.id)}
                className="gp-poll-approve"
              >
                <Check size={11} aria-hidden />
              </button>
              {labelField(tally.option)}
              <div className="gp-poll-track gp-poll-track-slim">
                <span
                  style={{
                    width: `${rate}%`,
                    '--gp-poll-seg': segmentColor(tally.index),
                  } as CSSProperties}
                />
              </div>
              <span className="gp-poll-count">
                {approvalBallots > 0 ? `${tally.votes}/${approvalBallots}` : '—'}
              </span>
              {removeButton(tally.option)}
            </li>
          )
        })}
      </ul>
      <div className="gp-poll-action-bar">
        <button
          type="button"
          onClick={castApproval}
          disabled={approvals.size === 0}
          className="gp-poll-primary"
        >
          <Check size={11} aria-hidden />
          Cast ballot
          {approvals.size > 0 && <em>{approvals.size}</em>}
        </button>
        <span className="gp-poll-meta">
          {approvalBallots} ballot{approvalBallots === 1 ? '' : 's'} cast
        </span>
      </div>
    </div>
  )

  // --- Ranked choice --------------------------------------------------------

  // Derived, never stored: a draft ranking keeps any order the voter set and
  // absorbs added or removed options without an effect chasing the data.
  const knownIds = options.map((option) => option.id)
  const keptRanking = ranking.filter((id) => knownIds.includes(id))
  const orderedIds = [...keptRanking, ...knownIds.filter((id) => !keptRanking.includes(id))]

  const byId = new Map(options.map((option) => [option.id, option]))
  const nameOf = (id: string, fallback = 'an option') => {
    const option = byId.get(id)
    return option ? optionName(option) : fallback
  }
  const ballots = rankedBallots(data)
  const rounds = instantRunoffRounds(options, ballots)

  const moveRank = (index: number, delta: number) => {
    const next = [...orderedIds]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    const [moved] = next.splice(index, 1)
    if (moved) next.splice(target, 0, moved)
    setRanking(next)
  }

  const submitRanking = () => {
    onChange(castRankedBallot(base(), orderedIds))
    showAck('Ranking submitted', 1_800)
  }

  const rankedView = (
    <div className="gp-poll-ranked">
      <section className="gp-poll-ranking">
        <h4>Your ranking</h4>
        <ol>
          {orderedIds.map((id, index) => {
            const option = byId.get(id)
            if (!option) return null
            return (
              <li key={id} className="gp-poll-rank-row">
                <span className="gp-poll-medal" data-place={index + 1} aria-hidden>
                  {index + 1}
                </span>
                {labelField(option)}
                <span className="gp-poll-move">
                  <button
                    type="button"
                    disabled={index === 0}
                    aria-label={`Move ${optionName(option)} up`}
                    onClick={() => moveRank(index, -1)}
                  >
                    <ChevronUp size={10} aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={index === orderedIds.length - 1}
                    aria-label={`Move ${optionName(option)} down`}
                    onClick={() => moveRank(index, 1)}
                  >
                    <ChevronDown size={10} aria-hidden />
                  </button>
                </span>
                {removeButton(option)}
              </li>
            )
          })}
        </ol>
        <div className="gp-poll-action-bar">
          <button
            type="button"
            onClick={submitRanking}
            disabled={orderedIds.length === 0}
            className="gp-poll-primary"
          >
            <ListOrdered size={11} aria-hidden />
            Submit ranking
          </button>
          <span className="gp-poll-meta">
            {ballots.length} ballot{ballots.length === 1 ? '' : 's'}
          </span>
        </div>
      </section>

      <section className="gp-poll-rounds">
        <h4>Instant runoff</h4>
        <div className="gp-poll-round-list">
        {rounds.length === 0 ? (
          <p className="gp-poll-note">Submit a ranking to run the first round.</p>
        ) : rounds.map((round, index) => {
          const counted = ballots.length - round.exhausted
          return (
            <article key={`round-${index}`} className="gp-poll-round">
              <header>
                <span>Round {index + 1}</span>
                {round.winner
                  ? <em data-outcome="win">Majority</em>
                  : <em data-outcome="cut">Eliminates {nameOf(round.eliminated ?? '')}</em>}
              </header>
              <ul>
                {[...round.counts]
                  .sort((a, b) => b.votes - a.votes)
                  .map((entry) => {
                    const option = byId.get(entry.id)
                    if (!option) return null
                    return (
                      <li
                        key={entry.id}
                        data-state={
                          entry.id === round.winner
                            ? 'win'
                            : entry.id === round.eliminated ? 'cut' : undefined
                        }
                      >
                        <span>{optionName(option)}</span>
                        <div className="gp-poll-track gp-poll-track-slim">
                          <span
                            style={{
                              width: `${pollShare(entry.votes, Math.max(counted, 1))}%`,
                              '--gp-poll-seg': segmentColor(
                                options.findIndex((item) => item.id === entry.id),
                              ),
                            } as CSSProperties}
                          />
                        </div>
                        <b>{entry.votes}</b>
                      </li>
                    )
                  })}
              </ul>
            </article>
          )
        })}
        </div>
      </section>
    </div>
  )

  // --- Pairwise -------------------------------------------------------------

  const duels = pairwiseDuels(data)
  const queue = pairwiseQueue(options, duels)
  const pair = queue.length > 0 ? queue[duelOffset % queue.length] : null
  const standings = pairwiseStandings(options, duels)
  const standingById = new Map(standings.map((entry) => [entry.id, entry]))
  const judged = standings.reduce((sum, entry) => sum + entry.wins, 0)

  const pickWinner = (winner: PollOption, loser: PollOption) => {
    onChange(castPairwiseWin(base(), winner.id, loser.id))
    setDuelOffset((previous) => previous + 1)
  }

  const duelCard = (option: PollOption, rival: PollOption, seat: 'a' | 'b') => {
    const record = standingById.get(option.id)
    return (
      <button
        type="button"
        data-seat={seat}
        onClick={() => pickWinner(option, rival)}
        aria-label={`${optionName(option)} beats ${optionName(rival)}`}
        className="gp-poll-duel-card gp-check-free"
        style={{
          '--gp-poll-seg': segmentColor(options.findIndex((item) => item.id === option.id)),
        } as CSSProperties}
      >
        <strong>{optionName(option, seat === 'a' ? 'Option A' : 'Option B')}</strong>
        <em>
          {duelWins(duels, option.id, rival.id)}–{duelWins(duels, rival.id, option.id)} here
        </em>
        <span>{record?.wins ?? 0}W · {record?.losses ?? 0}L overall</span>
      </button>
    )
  }

  const pairwiseView = (
    <div className="gp-poll-pairwise">
      {pair ? (
        <div className="gp-poll-duel">
          {duelCard(pair[0], pair[1], 'a')}
          <span className="gp-poll-vs" aria-hidden>vs</span>
          {duelCard(pair[1], pair[0], 'b')}
        </div>
      ) : (
        <p className="gp-poll-note">Add a second option to start comparing.</p>
      )}

      <div className="gp-poll-action-bar">
        <button
          type="button"
          onClick={() => setDuelOffset((previous) => previous + 1)}
          disabled={queue.length < 2}
          className="gp-poll-ghost"
        >
          <Shuffle size={11} aria-hidden />
          Another pairing
        </button>
        <span className="gp-poll-meta">
          {judged} comparison{judged === 1 ? '' : 's'} across {queue.length} pairing
          {queue.length === 1 ? '' : 's'}
        </span>
      </div>

      {options.length > 1 && (
        <div className="gp-poll-matrix-scroll">
          <table className="gp-poll-matrix">
            <caption className="gp-sr-only">Head-to-head wins, row over column</caption>
            <thead>
              <tr>
                <th scope="col"><span className="gp-sr-only">Option</span></th>
                {options.map((option, index) => (
                  <th key={option.id} scope="col">
                    <span style={{ '--gp-poll-seg': segmentColor(index) } as CSSProperties}>
                      {optionName(option, '—').slice(0, 2).toUpperCase()}
                    </span>
                  </th>
                ))}
                <th scope="col">W</th>
              </tr>
            </thead>
            <tbody>
              {options.map((option, index) => (
                <tr key={option.id}>
                  <th scope="row">
                    <i
                      aria-hidden
                      style={{ '--gp-poll-seg': segmentColor(index) } as CSSProperties}
                    />
                    {labelField(option)}
                    {removeButton(option)}
                  </th>
                  {options.map((rival) => {
                    if (rival.id === option.id) return <td key={rival.id} data-self>·</td>
                    const wins = duelWins(duels, option.id, rival.id)
                    return (
                      <td key={rival.id} data-strong={wins > 0 || undefined}>
                        {wins || '–'}
                      </td>
                    )
                  })}
                  <td data-total>{standingById.get(option.id)?.wins ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  // --- Live room ------------------------------------------------------------

  const room = liveRoomState(data)
  const turnout = liveRoomTurnout(options, room.participants)
  const setRoom = (patch: Partial<typeof room>) => onChange(dataWithLiveRoom(base(), patch))

  const liveRoomView = (
    <div
      className="gp-poll-room"
      data-phase={room.phase}
      data-revealed={room.revealed || undefined}
    >
      <div className="gp-poll-room-bar">
        <span className="gp-poll-phase" data-phase={room.phase}>
          <CircleDot size={9} aria-hidden />
          {room.phase === 'lobby' ? 'Lobby' : room.phase === 'open' ? 'Voting open' : 'Closed'}
        </span>
        <span className="gp-poll-stepper">
          <button
            type="button"
            aria-label="One fewer participant"
            onClick={() => setRoom({ participants: room.participants - 1 })}
            disabled={room.participants === 0}
          >
            <Minus size={10} aria-hidden />
          </button>
          <b>{room.participants}</b>
          <button
            type="button"
            aria-label="One more participant"
            onClick={() => setRoom({ participants: room.participants + 1 })}
          >
            <Plus size={10} aria-hidden />
          </button>
          <i>in room</i>
        </span>
        <span className="gp-poll-turnout">
          <span className="gp-poll-track gp-poll-track-slim">
            <span style={{ width: `${turnout}%` }} />
          </span>
          <small>{total}/{room.participants || '—'} voted</small>
        </span>
      </div>

      <ul className="gp-poll-room-list">
        {tallies.map((tally) => (
          <li key={tally.option.id} className="gp-poll-room-row">
            <button
              type="button"
              aria-label={`Vote for ${optionName(tally.option)}`}
              disabled={room.phase !== 'open'}
              onClick={() => vote(tally.option.id)}
              className="gp-poll-radio gp-check-free"
            >
              <Radio size={11} aria-hidden />
            </button>
            {labelField(tally.option)}
            <div className="gp-poll-track" data-masked={!room.revealed || undefined}>
              <span
                style={{
                  width: `${room.revealed ? tally.share : 100 / Math.max(options.length, 1)}%`,
                  '--gp-poll-seg': segmentColor(tally.index),
                } as CSSProperties}
              />
            </div>
            <b className="gp-poll-count" data-masked={!room.revealed || undefined}>
              {room.revealed ? `${tally.share}%` : '•••'}
            </b>
            {removeButton(tally.option)}
          </li>
        ))}
      </ul>

      <div className="gp-poll-action-bar">
        <button
          type="button"
          onClick={() => setRoom({ phase: room.phase === 'open' ? 'closed' : 'open' })}
          className="gp-poll-primary"
        >
          <Radio size={11} aria-hidden />
          {room.phase === 'open' ? 'Close voting' : room.phase === 'closed' ? 'Reopen voting' : 'Open voting'}
        </button>
        <button
          type="button"
          onClick={() => setRoom({ revealed: !room.revealed })}
          disabled={room.phase === 'lobby'}
          className="gp-poll-ghost"
        >
          {room.revealed ? <EyeOff size={11} aria-hidden /> : <Eye size={11} aria-hidden />}
          {room.revealed ? 'Hide results' : 'Reveal results'}
        </button>
      </div>
    </div>
  )

  // --- Anonymous ------------------------------------------------------------

  const anonymousBallots = pollBallotCount(data, 'anonymous')
  const castAnonymous = (optionId: string) => {
    onChange(castAnonymousVote(base(), optionId))
    setHasCastAnonymously(true)
  }

  const anonymousView = (
    <div className="gp-poll-anon" data-cast={hasCastAnonymously || undefined}>
      <p className="gp-poll-shield">
        <Shield size={11} aria-hidden />
        {hasCastAnonymously
          ? 'Ballot counted. Nothing links it back to you.'
          : 'Aggregate only — no voter identity is stored.'}
        {hasCastAnonymously && (
          <button type="button" onClick={() => setHasCastAnonymously(false)}>
            Pass to next voter
          </button>
        )}
      </p>

      <ul className="gp-poll-anon-list">
        {tallies.map((tally) => (
          <li key={tally.option.id} className="gp-poll-anon-row">
            <button
              type="button"
              disabled={hasCastAnonymously}
              aria-label={`Vote for ${optionName(tally.option)}`}
              onClick={() => castAnonymous(tally.option.id)}
              className="gp-poll-anon-mark gp-check-free"
            >
              <CircleDot size={11} aria-hidden />
            </button>
            {labelField(tally.option)}
            <div className="gp-poll-track" data-masked={!hasCastAnonymously || undefined}>
              <span
                style={{
                  width: `${hasCastAnonymously ? tally.share : 100 / Math.max(options.length, 1)}%`,
                  '--gp-poll-seg': segmentColor(tally.index),
                } as CSSProperties}
              />
            </div>
            <b className="gp-poll-count" data-masked={!hasCastAnonymously || undefined}>
              {hasCastAnonymously ? `${tally.share}%` : '•••'}
            </b>
            {removeButton(tally.option)}
          </li>
        ))}
      </ul>

      <p className="gp-poll-meta gp-poll-anon-foot">
        {anonymousBallots} anonymous ballot{anonymousBallots === 1 ? '' : 's'} in the tally
      </p>
    </div>
  )

  // --- Chrome ---------------------------------------------------------------

  const views: Record<PollSkinMode, ReactNode> = {
    bars: barsView,
    donut: donutView,
    approval: approvalView,
    ranked_choice: rankedView,
    pairwise: pairwiseView,
    live_room: liveRoomView,
    anonymous: anonymousView,
  }

  // Wherever the body veils the standing — a room holding its result back, a
  // sealed ballot waiting on this voter — the one always-visible line must not
  // name the leader anyway.
  const veiled = (skin === 'live_room' && !room.revealed)
    || (skin === 'anonymous' && !hasCastAnonymously)
  const summary = veiled
    ? skin === 'anonymous'
      ? 'Vote to see the tally'
      : room.phase === 'lobby' ? 'Floor not open yet' : 'Results held back'
    : total === 0 || !leader
      ? 'No votes yet'
      : tied
        ? `Tied at ${leader.votes}`
        : `${optionName(leader)} leads`

  return (
    <div ref={rootRef} className="gp-poll" data-poll-skin={skin}>
      <header className="gp-poll-header">
        <span className="gp-poll-eyebrow">
          {skinIcon(skin)}
          {copy.eyebrow}
        </span>
        <span className="gp-poll-summary">
          <strong>{total}</strong>
          {total === 1 ? 'vote' : 'votes'}
          <small>{ack || summary}</small>
        </span>
        {(skin === 'bars' || skin === 'donut') && (
          <button
            type="button"
            title={order === 'leading' ? 'Leading first' : 'Declared order'}
            aria-label={order === 'leading' ? 'Show options in declared order' : 'Show leading options first'}
            onClick={() => onChange(dataWithPollOrder(
              base(),
              skin,
              order === 'leading' ? 'declared' : 'leading',
            ))}
            className="gp-poll-order"
          >
            {order === 'leading' ? 'Leading' : 'Declared'}
          </button>
        )}
      </header>

      <div className="gp-poll-question gp-bare-field">
        <input
          value={question}
          placeholder="Ask something…"
          aria-label="Poll question"
          onChange={(event) => onChange({ ...base(), question: event.target.value })}
        />
      </div>

      {options.length > 0 ? views[skin] : (
        <div className="gp-poll-empty">
          {skinIcon(skin)}
          <strong>No options yet</strong>
          <span>{copy.hint}</span>
        </div>
      )}

      <footer className="gp-poll-footer">
        <button type="button" onClick={add} className="gp-poll-add">
          <Plus size={11} aria-hidden />
          Add option
        </button>
        <span className="gp-poll-meta">{copy.hint}</span>
      </footer>
    </div>
  )
}
