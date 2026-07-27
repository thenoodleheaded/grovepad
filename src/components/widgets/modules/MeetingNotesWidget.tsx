import {
  CalendarClock,
  Check,
  Gavel,
  Handshake,
  Hourglass,
  Lightbulb,
  ListOrdered,
  MessagesSquare,
  Plus,
  Repeat2,
  ScrollText,
  Sparkles,
  Stamp,
  Sunrise,
  ThumbsDown,
  ThumbsUp,
  Timer,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type {
  MeetingNotesData,
  MeetingNotesSkinMode,
} from '../../../types/spatial'
import { WidgetPanel } from '../WidgetPanel'
import {
  agendaTotalMinutes,
  dataWithMeetingItemDetails,
  dataWithMeetingPanels,
  decisionsDueForReview,
  meetingAttendees,
  meetingItemDetails,
  meetingNotesSkinMode,
  meetingPanels,
  openActionCount,
  removeMeetingAction,
  type MeetingItemDetails,
  type MeetingPanels,
} from './meetingNotesSkinModel'

type MeetingAction = MeetingNotesData['actions'][number]

interface MeetingNotesWidgetProps {
  data: MeetingNotesData
  onChange: (data: MeetingNotesData) => void
  onHeightChange?: (height: number) => void
}

/**
 * The words each shape uses for the two shared surfaces. The notes field and
 * the action list are the same data in every skin — only their name and their
 * arrangement change, so nothing a person wrote can disappear behind a roll.
 */
const SKIN_COPY: Record<MeetingNotesSkinMode, {
  eyebrow: string
  notesLabel: string
  notesPlaceholder: string
  listLabel: string
  addLabel: string
  itemPlaceholder: string
}> = {
  agenda: {
    eyebrow: 'Agenda',
    notesLabel: 'Preparation',
    notesPlaceholder: 'Context to read before we start…',
    listLabel: 'Topics',
    addLabel: 'Add topic',
    itemPlaceholder: 'Topic to cover…',
  },
  minutes: {
    eyebrow: 'Minutes',
    notesLabel: 'Discussion',
    notesPlaceholder: 'What was discussed…',
    listLabel: 'Resolutions',
    addLabel: 'Record resolution',
    itemPlaceholder: 'Resolved that…',
  },
  stand_up: {
    eyebrow: 'Stand-up',
    notesLabel: 'Today',
    notesPlaceholder: 'What I am working on today…',
    listLabel: 'Help needed',
    addLabel: 'Ask for help',
    itemPlaceholder: 'What would unblock you?',
  },
  retrospective: {
    eyebrow: 'Retro',
    notesLabel: 'Went well',
    notesPlaceholder: 'What should we keep doing?',
    listLabel: 'Next experiments',
    addLabel: 'Add experiment',
    itemPlaceholder: 'Try this next sprint…',
  },
  one_to_one: {
    eyebrow: 'One-to-one',
    notesLabel: 'Talking points',
    notesPlaceholder: 'What do we want to cover?',
    listLabel: 'Commitments',
    addLabel: 'Add commitment',
    itemPlaceholder: 'Who will do what…',
  },
  decision_review: {
    eyebrow: 'Decision review',
    notesLabel: 'Context',
    notesPlaceholder: 'What were we deciding between?',
    listLabel: 'Decisions',
    addLabel: 'Record decision',
    itemPlaceholder: 'We decided to…',
  },
  handoff: {
    eyebrow: 'Handoff',
    notesLabel: 'Current state',
    notesPlaceholder: 'Where things stand right now…',
    listLabel: 'Next actions',
    addLabel: 'Add next action',
    itemPlaceholder: 'The next thing to do…',
  },
}

function skinIcon(skin: MeetingNotesSkinMode, size = 12): ReactNode {
  if (skin === 'agenda') return <ListOrdered size={size} aria-hidden />
  if (skin === 'minutes') return <ScrollText size={size} aria-hidden />
  if (skin === 'stand_up') return <Sunrise size={size} aria-hidden />
  if (skin === 'retrospective') return <Repeat2 size={size} aria-hidden />
  if (skin === 'one_to_one') return <MessagesSquare size={size} aria-hidden />
  if (skin === 'decision_review') return <Gavel size={size} aria-hidden />
  return <Handshake size={size} aria-hidden />
}

function longDate(date: string): string {
  if (!date) return 'No date'
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(parsed)
}

function shortDate(date: string): string {
  if (!date) return ''
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(parsed)
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase()
  return `${parts[0]![0]}${parts.at(-1)![0]}`.toLocaleUpperCase()
}

/** A labelled control that sits on the card's backplate, never in a second pane. */
function Field({
  label,
  value,
  placeholder,
  type = 'text',
  multiline = false,
  className = '',
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  type?: 'text' | 'date' | 'number'
  multiline?: boolean
  className?: string
  onChange: (value: string) => void
}) {
  return (
    <label className={`gp-meeting-field gp-bare-field ${className}`}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          rows={1}
          value={value}
          aria-label={label}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          type={type}
          value={value}
          aria-label={label}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  )
}

export function MeetingNotesWidget({
  data,
  onChange,
  onHeightChange,
}: MeetingNotesWidgetProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const skin = meetingNotesSkinMode(data.skin)
  const copy = SKIN_COPY[skin]
  // Hydrated boards can carry anything; every other reading here is normalized,
  // so the action list is too rather than trusting the declared type.
  const actions = Array.isArray(data.actions) ? data.actions : []
  const items = meetingItemDetails(data, skin)
  const panels = meetingPanels(data, skin)
  const attendees = meetingAttendees(data.attendees)
  const today = new Date().toISOString().slice(0, 10)

  useLayoutEffect(() => {
    if (rootRef.current) onHeightChange?.(rootRef.current.scrollHeight)
  }, [data, onHeightChange, skin])

  const base = (): MeetingNotesData => ({ ...data, skin, actions })

  const patch = (next: Partial<MeetingNotesData>) => onChange({ ...base(), ...next })

  const patchAction = (id: string, next: Partial<MeetingAction>) =>
    patch({ actions: actions.map((a) => (a.id === id ? { ...a, ...next } : a)) })

  const patchItem = (id: string, next: Partial<MeetingItemDetails>) =>
    onChange(dataWithMeetingItemDetails(base(), skin, id, next))

  const patchPanels = (next: Partial<MeetingPanels>) =>
    onChange(dataWithMeetingPanels(base(), skin, next))

  const addAction = () =>
    patch({ actions: [...actions, { id: crypto.randomUUID(), text: '', done: false }] })

  const removeAction = (id: string) => onChange(removeMeetingAction(base(), id))

  const onItemKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    addAction()
  }

  /* ---------------------------------------------------------------- parts */

  const check = (action: MeetingAction, label: string) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={action.done}
      aria-label={action.text || label}
      onClick={() => patchAction(action.id, { done: !action.done })}
      className="gp-meeting-check"
    >
      {action.done && <Check size={9} aria-hidden strokeWidth={3.5} />}
    </button>
  )

  const removeButton = (action: MeetingAction) => (
    <button
      type="button"
      aria-label={`Remove ${action.text || 'empty item'}`}
      onClick={() => removeAction(action.id)}
      className="gp-meeting-remove"
    >
      <X size={10} aria-hidden />
    </button>
  )

  const itemText = (action: MeetingAction, placeholder = copy.itemPlaceholder) => (
    <div className="gp-bare-field gp-meeting-item-text">
      <input
        value={action.text}
        aria-label={copy.listLabel}
        placeholder={placeholder}
        onChange={(event) => patchAction(action.id, { text: event.target.value })}
        onKeyDown={onItemKeyDown}
      />
    </div>
  )

  const row = (action: MeetingAction, content: ReactNode, className = '') => (
    <WidgetPanel
      key={action.id}
      grip={false}
      floor="controls"
      className={`gp-meeting-row ${className}`}
    >
      {content}
      {removeButton(action)}
    </WidgetPanel>
  )

  const notesField = (className = '') => (
    <label className={`gp-meeting-notes gp-bare-field ${className}`}>
      <span>{copy.notesLabel}</span>
      <textarea
        value={data.notes}
        aria-label={copy.notesLabel}
        placeholder={copy.notesPlaceholder}
        onChange={(event) => patch({ notes: event.target.value })}
      />
    </label>
  )

  const panelField = (
    key: keyof MeetingPanels,
    label: string,
    placeholder: string,
    className = '',
  ) => (
    <label className={`gp-meeting-notes gp-bare-field ${className}`}>
      <span>{label}</span>
      <textarea
        value={(panels[key] as string | undefined) ?? ''}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => patchPanels({ [key]: event.target.value } as Partial<MeetingPanels>)}
      />
    </label>
  )

  const addButton = (
    <button type="button" onClick={addAction} className="gp-meeting-add">
      <Plus size={11} aria-hidden />
      {copy.addLabel}
    </button>
  )

  const emptyList = (hint: string) => (
    <p className="gp-meeting-empty">{hint}</p>
  )

  const ownerChip = (action: MeetingAction, detail: MeetingItemDetails) => (
    <label className="gp-meeting-owner gp-bare-field" title="Owner">
      <UserRound size={9} aria-hidden />
      <input
        value={detail.owner ?? ''}
        aria-label={`Owner of ${action.text || 'item'}`}
        placeholder="Owner"
        onChange={(event) => patchItem(action.id, { owner: event.target.value })}
      />
    </label>
  )

  const dueChip = (action: MeetingAction, detail: MeetingItemDetails) => (
    <label
      className="gp-meeting-due gp-bare-field"
      data-overdue={Boolean(detail.due) && detail.due! < today && !action.done}
      title="Due date"
    >
      <input
        type="date"
        value={detail.due ?? ''}
        aria-label={`Due date for ${action.text || 'item'}`}
        onChange={(event) => patchItem(action.id, { due: event.target.value })}
      />
    </label>
  )

  /* ------------------------------------------------------------- masthead */

  const meta = (
    <div className="gp-meeting-meta">
      <label className="gp-meeting-date gp-bare-field">
        <CalendarClock size={11} aria-hidden />
        <input
          type="date"
          value={data.date}
          aria-label="Meeting date"
          onChange={(event) => patch({ date: event.target.value })}
        />
      </label>
      <label className="gp-meeting-attendees gp-bare-field">
        <Users size={11} aria-hidden />
        <input
          value={data.attendees}
          aria-label="Attendees"
          placeholder="Attendees…"
          onChange={(event) => patch({ attendees: event.target.value })}
        />
      </label>
    </div>
  )

  const chips = attendees.length > 0 && (
    <ul className="gp-meeting-chips">
      {attendees.map((name, index) => (
        <li key={`${name}-${index}`}>
          <span aria-hidden>{initials(name)}</span>
          {name}
        </li>
      ))}
    </ul>
  )

  /* ----------------------------------------------------------------- body */

  let body: ReactNode

  if (skin === 'agenda') {
    const total = agendaTotalMinutes(data)
    const covered = actions.filter((action) => action.done).length
    body = (
      <>
        <header className="gp-meeting-head">
          <span className="gp-meeting-eyebrow">{skinIcon(skin)}{copy.eyebrow}</span>
          <span className="gp-meeting-summary">
            {total > 0 && <strong><Timer size={10} aria-hidden />{total} min</strong>}
            <small>{covered}/{actions.length} covered</small>
          </span>
        </header>
        {meta}
        {notesField('gp-meeting-notes--brief')}
        <div className="gp-meeting-section">
          <p className="gp-meeting-legend">{copy.listLabel}</p>
          <ol className="gp-meeting-rail">
            {actions.map((action, index) => {
              const detail = items[action.id] ?? {}
              return (
                <li key={action.id}>
                  <span className="gp-meeting-rail-dot" data-done={action.done} aria-hidden>
                    {index + 1}
                  </span>
                  {row(action, (
                    <>
                      <div className="gp-meeting-topic-head">
                        {check(action, 'Agenda topic')}
                        {itemText(action)}
                        <label className="gp-meeting-timebox gp-bare-field" title="Timebox in minutes">
                          <input
                            type="number"
                            min={0}
                            max={480}
                            value={detail.minutes ?? ''}
                            aria-label={`Timebox for ${action.text || 'topic'} in minutes`}
                            placeholder="––"
                            onChange={(event) => patchItem(action.id, { minutes: event.target.value })}
                          />
                          <span aria-hidden>min</span>
                        </label>
                      </div>
                      <Field
                        label="Desired outcome"
                        value={detail.outcome ?? ''}
                        placeholder="What does done look like?"
                        onChange={(value) => patchItem(action.id, { outcome: value })}
                      />
                    </>
                  ), 'gp-meeting-topic')}
                </li>
              )
            })}
          </ol>
          {actions.length === 0 && emptyList('No topics yet — add the first thing to cover.')}
          {addButton}
        </div>
      </>
    )
  } else if (skin === 'minutes') {
    body = (
      <>
        <header className="gp-meeting-masthead">
          <span className="gp-meeting-wordmark">{skinIcon(skin, 13)}Minutes</span>
          <strong>{longDate(data.date)}</strong>
          <small>{attendees.length} present</small>
        </header>
        {meta}
        {chips}
        {notesField('gp-meeting-notes--ruled')}
        <div className="gp-meeting-section">
          <p className="gp-meeting-legend">{copy.listLabel}</p>
          <ol className="gp-meeting-ledger">
            {actions.map((action, index) => {
              const detail = items[action.id] ?? {}
              return (
                <li key={action.id}>
                  <span className="gp-meeting-ordinal" aria-hidden>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {row(action, (
                    <>
                      <div className="gp-meeting-resolution-head">
                        {check(action, 'Resolution')}
                        {itemText(action)}
                      </div>
                      <div className="gp-meeting-chip-row">
                        {ownerChip(action, detail)}
                        {dueChip(action, detail)}
                      </div>
                    </>
                  ), 'gp-meeting-resolution')}
                </li>
              )
            })}
          </ol>
          {actions.length === 0 && emptyList('No resolutions recorded.')}
          {addButton}
        </div>
      </>
    )
  } else if (skin === 'stand_up') {
    body = (
      <>
        <header className="gp-meeting-head">
          <span className="gp-meeting-eyebrow">{skinIcon(skin)}{copy.eyebrow}</span>
          <span className="gp-meeting-summary">
            <small>{shortDate(data.date) || 'No date'}</small>
          </span>
        </header>
        {meta}
        <div className="gp-meeting-lanes">
          {panelField('yesterday', 'Yesterday', 'What I finished…', 'gp-meeting-lane gp-meeting-lane--past')}
          {notesField('gp-meeting-lane gp-meeting-lane--today')}
          {panelField('blockers', 'Blockers', 'What is in the way…', 'gp-meeting-lane gp-meeting-lane--blocked')}
        </div>
        <div className="gp-meeting-section">
          <p className="gp-meeting-legend">{copy.listLabel}</p>
          <ul className="gp-meeting-asks">
            {actions.map((action) => row(action, (
              <>
                {check(action, 'Help needed')}
                {itemText(action)}
              </>
            ), 'gp-meeting-ask'))}
          </ul>
          {actions.length === 0 && emptyList('Nothing blocked — no help needed.')}
          {addButton}
        </div>
      </>
    )
  } else if (skin === 'retrospective') {
    body = (
      <>
        <header className="gp-meeting-head">
          <span className="gp-meeting-eyebrow">{skinIcon(skin)}{copy.eyebrow}</span>
          <span className="gp-meeting-summary">
            <small>{shortDate(data.date) || 'No date'} · {attendees.length} people</small>
          </span>
        </header>
        {meta}
        <div className="gp-meeting-quadrants">
          <section className="gp-meeting-quadrant gp-meeting-quadrant--kept">
            <p><ThumbsUp size={10} aria-hidden />Went well</p>
            {notesField('gp-meeting-notes--quadrant')}
          </section>
          <section className="gp-meeting-quadrant gp-meeting-quadrant--dropped">
            <p><ThumbsDown size={10} aria-hidden />Did not</p>
            {panelField('improve', 'Did not go well', 'What should we stop?', 'gp-meeting-notes--quadrant')}
          </section>
          <section className="gp-meeting-quadrant gp-meeting-quadrant--learned">
            <p><Lightbulb size={10} aria-hidden />Learned</p>
            {panelField('learned', 'Learned', 'What surprised us?', 'gp-meeting-notes--quadrant')}
          </section>
          <section className="gp-meeting-quadrant gp-meeting-quadrant--next">
            <p><Sparkles size={10} aria-hidden />{copy.listLabel}</p>
            <ul className="gp-meeting-experiments">
              {actions.map((action) => row(action, (
                <>
                  {check(action, 'Experiment')}
                  {itemText(action)}
                </>
              ), 'gp-meeting-experiment'))}
            </ul>
            {actions.length === 0 && emptyList('No experiment chosen yet.')}
            {addButton}
          </section>
        </div>
      </>
    )
  } else if (skin === 'one_to_one') {
    body = (
      <>
        <header className="gp-meeting-head">
          <span className="gp-meeting-eyebrow">{skinIcon(skin)}{copy.eyebrow}</span>
          <span className="gp-meeting-summary">
            <small>{longDate(data.date)}</small>
          </span>
        </header>
        {meta}
        {chips}
        <div className="gp-meeting-columns">
          {notesField('gp-meeting-column')}
          {panelField('feedback', 'Feedback', 'Given and received…', 'gp-meeting-column')}
        </div>
        <div className="gp-meeting-section">
          <p className="gp-meeting-legend">{copy.listLabel}</p>
          <ul className="gp-meeting-commitments">
            {actions.map((action) => {
              const detail = items[action.id] ?? {}
              return row(action, (
                <>
                  {check(action, 'Commitment')}
                  {itemText(action)}
                  {ownerChip(action, detail)}
                  {dueChip(action, detail)}
                </>
              ), 'gp-meeting-commitment')
            })}
          </ul>
          {actions.length === 0 && emptyList('No commitments made yet.')}
          {addButton}
        </div>
        <footer className="gp-meeting-followup">
          <Field
            label="Follow-up"
            type="date"
            value={panels.followUp ?? ''}
            onChange={(value) => patchPanels({ followUp: value })}
          />
        </footer>
      </>
    )
  } else if (skin === 'decision_review') {
    const due = decisionsDueForReview(data, today)
    body = (
      <>
        <header className="gp-meeting-head">
          <span className="gp-meeting-eyebrow">{skinIcon(skin)}{copy.eyebrow}</span>
          <span className="gp-meeting-summary">
            <strong>{actions.length}</strong> {actions.length === 1 ? 'decision' : 'decisions'}
            {due > 0 && <em><Hourglass size={9} aria-hidden />{due} to revisit</em>}
          </span>
        </header>
        {meta}
        {notesField('gp-meeting-notes--brief')}
        <div className="gp-meeting-section">
          <p className="gp-meeting-legend">{copy.listLabel}</p>
          <ul className="gp-meeting-decisions">
            {actions.map((action) => {
              const detail = items[action.id] ?? {}
              const overdue = Boolean(detail.review) && detail.review! <= today
              return row(action, (
                <>
                  <div className="gp-meeting-decision-head">
                    {check(action, 'Decision')}
                    {itemText(action)}
                  </div>
                  <Field
                    label="Rationale"
                    value={detail.rationale ?? ''}
                    placeholder="Why this, and not the alternative?"
                    multiline
                    onChange={(value) => patchItem(action.id, { rationale: value })}
                  />
                  <div className="gp-meeting-chip-row">
                    {ownerChip(action, detail)}
                    <label className="gp-meeting-review gp-bare-field" data-due={overdue} title="Review date">
                      <Hourglass size={9} aria-hidden />
                      <input
                        type="date"
                        value={detail.review ?? ''}
                        aria-label={`Review date for ${action.text || 'decision'}`}
                        onChange={(event) => patchItem(action.id, { review: event.target.value })}
                      />
                    </label>
                  </div>
                </>
              ), 'gp-meeting-decision')
            })}
          </ul>
          {actions.length === 0 && emptyList('No decisions recorded yet.')}
          {addButton}
        </div>
      </>
    )
  } else {
    const acknowledged = panels.acknowledged === true
    const open = openActionCount(data)
    body = (
      <>
        <header className="gp-meeting-head">
          <span className="gp-meeting-eyebrow">{skinIcon(skin)}{copy.eyebrow}</span>
          <span className="gp-meeting-summary">
            <strong>{open}</strong> open
            {acknowledged && <em><Stamp size={9} aria-hidden />Acknowledged</em>}
          </span>
        </header>
        {meta}
        {notesField('gp-meeting-notes--state')}
        {panelField('risks', 'Open risks', 'What could go wrong for the next owner…', 'gp-meeting-notes--risks')}
        <div className="gp-meeting-section">
          <p className="gp-meeting-legend">{copy.listLabel}</p>
          <ol className="gp-meeting-next">
            {actions.map((action, index) => (
              <li key={action.id}>
                <span className="gp-meeting-step" aria-hidden>{index + 1}</span>
                {row(action, (
                  <>
                    {check(action, 'Next action')}
                    {itemText(action)}
                  </>
                ), 'gp-meeting-next-row')}
              </li>
            ))}
          </ol>
          {actions.length === 0 && emptyList('No next actions handed over.')}
          {addButton}
        </div>
        <footer className="gp-meeting-signoff" data-acknowledged={acknowledged}>
          <Field
            label="Accepted by"
            value={panels.acknowledgedBy ?? ''}
            placeholder="Who is taking this on?"
            onChange={(value) => patchPanels({ acknowledgedBy: value })}
          />
          <button
            type="button"
            role="checkbox"
            aria-checked={acknowledged}
            aria-label="Handoff acknowledged"
            onClick={() => patchPanels({ acknowledged: !acknowledged })}
            className="gp-meeting-stamp"
          >
            <Stamp size={11} aria-hidden />
            {acknowledged ? 'Acknowledged' : 'Mark acknowledged'}
          </button>
        </footer>
      </>
    )
  }

  return (
    <div ref={rootRef} className="gp-meeting" data-meeting-skin={skin}>
      {body}
    </div>
  )
}
