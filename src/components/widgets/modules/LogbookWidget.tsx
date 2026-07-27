import {
  AlertTriangle,
  ArrowDownUp,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Compass,
  CornerDownLeft,
  FlaskConical,
  GitCommitHorizontal,
  Lock,
  MapPinned,
  Plus,
  Route,
  ShieldCheck,
  Siren,
  Wrench,
  X,
} from 'lucide-react'
import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type {
  LogbookData,
  LogbookSkinMode,
  LogEntry,
  LogLevel,
} from '../../../types/spatial'
import { WidgetPanel } from '../WidgetPanel'
import {
  appendLogbookEntry,
  dataWithLogbookEntryDetails,
  dataWithLogbookOrder,
  defaultLogbookDetails,
  latestLogbookEntry,
  logbookDayGroups,
  logbookEntries,
  logbookEntryDetails,
  logbookOrder,
  logbookSkinMode,
  logbookWarningCount,
  orderedLogbookEntries,
  removeLogbookEntry,
  type ChangeKind,
  type IncidentStatus,
  type LogbookEntryDetails,
} from './logbookSkinModel'

interface LogbookWidgetProps {
  data: LogbookData
  onChange: (data: LogbookData) => void
  onHeightChange?: (height: number) => void
}

const LEVELS: readonly LogLevel[] = ['note', 'info', 'warning']
const INCIDENT_STATUSES: readonly IncidentStatus[] = ['open', 'monitoring', 'resolved']
const CHANGE_KINDS: readonly ChangeKind[] = ['added', 'changed', 'fixed', 'removed']

const SKIN_COPY: Record<LogbookSkinMode, {
  eyebrow: string
  add: string
  placeholder: string
  emptyTitle: string
  emptyHint: string
}> = {
  daily_log: {
    eyebrow: 'Chronicle',
    add: 'Log entry',
    placeholder: 'What happened?',
    emptyTitle: 'The day is still blank',
    emptyHint: 'Anything you log lands under its own day, newest first.',
  },
  incident_log: {
    eyebrow: 'Response desk',
    add: 'Open incident',
    placeholder: 'Summarize the incident…',
    emptyTitle: 'All quiet',
    emptyHint: 'Open one when something breaks, then move it to resolved.',
  },
  lab_notebook: {
    eyebrow: 'Research record',
    add: 'New experiment',
    placeholder: 'Name the experiment…',
    emptyTitle: 'No experiments recorded',
    emptyHint: 'Each experiment keeps a hypothesis, method, observation and conclusion.',
  },
  change_log: {
    eyebrow: 'Release history',
    add: 'Record change',
    placeholder: 'What changed?',
    emptyTitle: 'Nothing shipped yet',
    emptyHint: 'Every release carries a version, a type and an author.',
  },
  maintenance_log: {
    eyebrow: 'Service history',
    add: 'Record service',
    placeholder: 'Work performed…',
    emptyTitle: 'No service on record',
    emptyHint: 'Record the work, the parts used, and when it is next due.',
  },
  audit_trail: {
    eyebrow: 'Append-only trail',
    add: 'Append event',
    placeholder: 'Describe the event…',
    emptyTitle: 'The trail starts here',
    emptyHint: 'Appended events stay exactly as written — nothing here can be edited.',
  },
  travel_log: {
    eyebrow: 'Journey journal',
    add: 'Add waypoint',
    placeholder: 'What happened here?',
    emptyTitle: 'No waypoints yet',
    emptyHint: 'Add a place and the route draws itself, waypoint by waypoint.',
  },
}

function shortTime(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function shortDate(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp))
}

function longDay(day: string): string {
  const parsed = new Date(`${day}T12:00:00`)
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(parsed)
}

/** Whole days from today to a `yyyy-mm-dd` service date, or null if unusable. */
function daysUntil(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const due = new Date(`${day}T12:00:00`)
  if (Number.isNaN(due.getTime())) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

function serviceDue(day: string | undefined): { tone: string; label: string } | null {
  if (!day) return null
  const days = daysUntil(day)
  if (days === null) return null
  if (days < 0) return { tone: 'overdue', label: days === -1 ? '1 day overdue' : `${-days} days overdue` }
  if (days === 0) return { tone: 'today', label: 'Due today' }
  if (days <= 14) return { tone: 'soon', label: `In ${days} ${days === 1 ? 'day' : 'days'}` }
  return null
}

function nextIn<T>(values: readonly T[], current: T): T {
  const index = values.indexOf(current)
  return values[(index + 1) % values.length] ?? values[0]!
}

function skinIcon(skin: LogbookSkinMode, size = 11): ReactNode {
  if (skin === 'daily_log') return <CalendarDays size={size} aria-hidden />
  if (skin === 'incident_log') return <Siren size={size} aria-hidden />
  if (skin === 'lab_notebook') return <FlaskConical size={size} aria-hidden />
  if (skin === 'change_log') return <GitCommitHorizontal size={size} aria-hidden />
  if (skin === 'maintenance_log') return <Wrench size={size} aria-hidden />
  if (skin === 'audit_trail') return <ShieldCheck size={size} aria-hidden />
  return <MapPinned size={size} aria-hidden />
}

function DetailField({
  label,
  value,
  placeholder,
  type = 'text',
  multiline = false,
  icon,
  className = '',
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  type?: 'text' | 'date'
  multiline?: boolean
  icon?: ReactNode
  className?: string
  onChange: (value: string) => void
}) {
  return (
    <label className={`gp-logbook-detail gp-bare-field ${className}`.trim()}>
      <span>
        {icon}
        {label}
      </span>
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

export function LogbookWidget({
  data,
  onChange,
  onHeightChange,
}: LogbookWidgetProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  const [draftLevel, setDraftLevel] = useState<LogLevel>('note')
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set())
  const skin = logbookSkinMode(data.skin)
  const entries = logbookEntries(data.entries)
  const order = logbookOrder(data, skin)
  const ordered = orderedLogbookEntries(entries, order)
  const details = logbookEntryDetails(data, skin)
  const latest = latestLogbookEntry(entries)
  const warnings = logbookWarningCount(entries)
  const copy = SKIN_COPY[skin]

  useLayoutEffect(() => {
    if (rootRef.current) onHeightChange?.(rootRef.current.scrollHeight)
  }, [data, onHeightChange, skin])

  const baseData = (): LogbookData => ({ ...data, skin, entries })

  const patchEntry = (id: string, patch: Partial<LogEntry>) => {
    onChange({
      ...baseData(),
      entries: entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry),
    })
  }

  const patchDetails = (id: string, patch: Partial<LogbookEntryDetails>) => {
    onChange(dataWithLogbookEntryDetails(baseData(), skin, id, patch))
  }

  const add = () => {
    const text = draft.trim()
    if (!text) return
    const id = crypto.randomUUID()
    let next = appendLogbookEntry(baseData(), text, draftLevel, new Date().toISOString(), id)
    const defaults = defaultLogbookDetails(skin, next.entries.length - 1)
    if (Object.keys(defaults).length > 0) {
      next = dataWithLogbookEntryDetails(next, skin, id, defaults)
    }
    onChange(next)
    setDraft('')
    setDraftLevel('note')
  }

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    add()
  }

  const beginRemove = (id: string) => {
    setRemovingIds((previous) => new Set(previous).add(id))
  }

  const finishRemove = (id: string) => {
    setRemovingIds((previous) => {
      const next = new Set(previous)
      next.delete(id)
      return next
    })
    onChange(removeLogbookEntry(baseData(), id))
  }

  const levelGlyph = (level: LogLevel) => (
    level === 'warning'
      ? <AlertTriangle size={9} aria-hidden />
      : level === 'info'
        ? <CircleDot size={9} aria-hidden />
        : <span aria-hidden />
  )

  const levelButton = (entry: LogEntry, editable = true) => (
    <button
      type="button"
      aria-label={`${editable ? 'Change' : ''} ${entry.level} level`.trim()}
      title={editable ? `Level: ${entry.level} — click to change` : entry.level}
      disabled={!editable}
      data-level={entry.level}
      onClick={() => editable && patchEntry(entry.id, {
        level: nextIn(LEVELS, entry.level),
      })}
      className="gp-logbook-level"
    >
      {levelGlyph(entry.level)}
    </button>
  )

  const removeButton = (entry: LogEntry) => (
    <button
      type="button"
      aria-label={`Remove ${entry.text || 'empty log entry'}`}
      title="Remove entry"
      onClick={() => beginRemove(entry.id)}
      className="gp-logbook-remove"
    >
      <X size={10} aria-hidden />
    </button>
  )

  const entryText = (
    entry: LogEntry,
    label = 'Log entry',
    placeholder = 'Log what happened…',
  ) => (
    <textarea
      rows={1}
      value={entry.text}
      aria-label={label}
      placeholder={placeholder}
      onChange={(event) => patchEntry(entry.id, { text: event.target.value })}
      className="gp-logbook-entry-text"
    />
  )

  const timeStamp = (entry: LogEntry, withTime = false) => (
    <time dateTime={entry.timestamp} className="gp-logbook-stamp">
      {shortDate(entry.timestamp)}
      {withTime && <i aria-hidden>{shortTime(entry.timestamp)}</i>}
    </time>
  )

  const row = (
    entry: LogEntry,
    content: ReactNode,
    className = '',
    removable = true,
  ) => (
    <WidgetPanel
      key={entry.id}
      grip={false}
      floor="controls"
      removing={removingIds.has(entry.id)}
      onExitComplete={() => finishRemove(entry.id)}
      className={`gp-logbook-row ${className} gp-logbook-row-${entry.level}`}
    >
      {content}
      {removable && removeButton(entry)}
    </WidgetPanel>
  )

  let content: ReactNode

  if (skin === 'daily_log') {
    content = (
      <div className="gp-logbook-list gp-logbook-daily">
        {logbookDayGroups(entries, order).map((group) => (
          <section key={group.day} className="gp-logbook-day">
            <header>
              <strong>{longDay(group.day)}</strong>
              <span>{group.entries.length}</span>
            </header>
            <div className="gp-logbook-day-track">
              {group.entries.map((entry) => row(entry, (
                <>
                  <time dateTime={entry.timestamp}>{shortTime(entry.timestamp)}</time>
                  {levelButton(entry)}
                  <div className="gp-bare-field">{entryText(entry, 'Daily log entry', 'What happened?')}</div>
                </>
              ), 'gp-logbook-daily-row'))}
            </div>
          </section>
        ))}
      </div>
    )
  } else if (skin === 'incident_log') {
    content = (
      <div className="gp-logbook-list gp-logbook-incidents">
        {ordered.map((entry) => {
          const detail = details[entry.id] ?? {}
          const status = detail.status ?? 'open'
          return row(entry, (
            <>
              <header className="gp-logbook-incident-head">
                {levelButton(entry)}
                <div className="gp-bare-field">{entryText(entry, 'Incident summary', 'What happened?')}</div>
                <button
                  type="button"
                  data-status={status}
                  aria-label={`Incident status: ${status}`}
                  title="Cycle incident status"
                  onClick={() => patchDetails(entry.id, {
                    status: nextIn(INCIDENT_STATUSES, status),
                  })}
                  className="gp-logbook-status"
                >
                  {status === 'resolved'
                    ? <CheckCircle2 size={9} aria-hidden />
                    : <span aria-hidden />}
                  {status}
                </button>
                {timeStamp(entry)}
              </header>
              <div className="gp-logbook-incident-grid">
                <DetailField label="Impact" value={detail.impact ?? ''} placeholder="Who was affected?" multiline onChange={(value) => patchDetails(entry.id, { impact: value })} />
                <DetailField label="Response" value={detail.response ?? ''} placeholder="Immediate action" multiline onChange={(value) => patchDetails(entry.id, { response: value })} />
                <DetailField label="Resolution" value={detail.resolution ?? ''} placeholder="How it ended" multiline onChange={(value) => patchDetails(entry.id, { resolution: value })} />
              </div>
            </>
          ), `gp-logbook-incident-row gp-logbook-status-${status}`)
        })}
      </div>
    )
  } else if (skin === 'lab_notebook') {
    content = (
      <div className="gp-logbook-list gp-logbook-lab">
        {ordered.map((entry, index) => {
          const detail = details[entry.id] ?? {}
          return row(entry, (
            <>
              <header className="gp-logbook-lab-head">
                <span>EXP {String(entries.length - index).padStart(2, '0')}</span>
                <div className="gp-bare-field">{entryText(entry, 'Experiment title', 'Untitled experiment')}</div>
                {timeStamp(entry)}
                {levelButton(entry)}
              </header>
              <div className="gp-logbook-lab-grid">
                <DetailField label="Hypothesis" value={detail.hypothesis ?? ''} placeholder="If…, then…" multiline onChange={(value) => patchDetails(entry.id, { hypothesis: value })} />
                <DetailField label="Method" value={detail.method ?? ''} placeholder="What was tested?" multiline onChange={(value) => patchDetails(entry.id, { method: value })} />
                <DetailField label="Observation" value={detail.observation ?? ''} placeholder="What occurred?" multiline onChange={(value) => patchDetails(entry.id, { observation: value })} />
                <DetailField label="Conclusion" value={detail.conclusion ?? ''} placeholder="What did we learn?" multiline onChange={(value) => patchDetails(entry.id, { conclusion: value })} />
              </div>
            </>
          ), 'gp-logbook-lab-row')
        })}
      </div>
    )
  } else if (skin === 'change_log') {
    content = (
      <div className="gp-logbook-list gp-logbook-changes">
        <div className="gp-logbook-change-labels" aria-hidden>
          <span>Version</span><span>Type</span><span>Change</span><span>Author</span><span>Date</span>
        </div>
        {ordered.map((entry) => {
          const detail = details[entry.id] ?? {}
          const kind = detail.changeKind ?? 'changed'
          const author = detail.author ?? ''
          return row(entry, (
            <div className="gp-logbook-change-grid">
              <label className="gp-bare-field gp-logbook-version">
                <span className="gp-sr-only">Version</span>
                <input aria-label="Version" value={detail.version ?? ''} placeholder="v1.0" onChange={(event) => patchDetails(entry.id, { version: event.target.value })} />
              </label>
              <button
                type="button"
                data-kind={kind}
                aria-label={`Change type: ${kind}`}
                title="Cycle change type"
                onClick={() => patchDetails(entry.id, {
                  changeKind: nextIn(CHANGE_KINDS, kind),
                })}
                className="gp-logbook-kind"
              >
                <span aria-hidden />
                {kind}
              </button>
              <div className="gp-bare-field gp-logbook-change-copy">
                {entryText(entry, 'Change description', 'Describe the change')}
              </div>
              <label className="gp-bare-field gp-logbook-author">
                <span className="gp-sr-only">Author</span>
                <i aria-hidden>{(author.trim()[0] ?? '·').toLocaleUpperCase()}</i>
                <input aria-label="Author" value={author} placeholder="Author" onChange={(event) => patchDetails(entry.id, { author: event.target.value })} />
              </label>
              {timeStamp(entry)}
              {levelButton(entry)}
            </div>
          ), 'gp-logbook-change-row')
        })}
      </div>
    )
  } else if (skin === 'maintenance_log') {
    content = (
      <div className="gp-logbook-list gp-logbook-maintenance">
        {ordered.map((entry) => {
          const detail = details[entry.id] ?? {}
          const due = serviceDue(detail.nextService)
          return row(entry, (
            <>
              <header className="gp-logbook-maintenance-head">
                <span className="gp-logbook-tool" aria-hidden><Wrench size={11} /></span>
                <DetailField label="Asset" value={detail.asset ?? ''} placeholder="Asset or system" className="gp-logbook-asset" onChange={(value) => patchDetails(entry.id, { asset: value })} />
                {due && <span className="gp-logbook-due" data-tone={due.tone}>{due.label}</span>}
                {timeStamp(entry)}
                {levelButton(entry)}
              </header>
              <div className="gp-logbook-maintenance-work gp-bare-field">
                {entryText(entry, 'Work performed', 'Describe the service performed')}
              </div>
              <div className="gp-logbook-maintenance-grid">
                <DetailField label="Parts / materials" value={detail.parts ?? ''} placeholder="What was used?" onChange={(value) => patchDetails(entry.id, { parts: value })} />
                <DetailField label="Next service" type="date" value={detail.nextService ?? ''} onChange={(value) => patchDetails(entry.id, { nextService: value })} />
              </div>
            </>
          ), 'gp-logbook-maintenance-row')
        })}
      </div>
    )
  } else if (skin === 'audit_trail') {
    content = (
      <div className="gp-logbook-list gp-logbook-audit" data-append-only="true">
        <header className="gp-logbook-audit-banner">
          <Lock size={9} aria-hidden />
          Existing events are read-only in this view
        </header>
        {ordered.map((entry, index) => {
          const detail = details[entry.id] ?? {}
          return row(entry, (
            <>
              <code className="gp-logbook-audit-seq">{String(entries.length - index).padStart(4, '0')}</code>
              {levelButton(entry, false)}
              <div className="gp-logbook-audit-event">
                <strong>{entry.text || 'Untitled event'}</strong>
                <span>
                  <b>{detail.actor ?? 'Unknown actor'}</b>
                  <i aria-hidden>·</i>
                  {detail.source ?? 'Unspecified source'}
                </span>
              </div>
              <time dateTime={entry.timestamp}>
                {shortDate(entry.timestamp)}
                <i aria-hidden>{shortTime(entry.timestamp)}</i>
              </time>
            </>
          ), 'gp-logbook-audit-row', false)
        })}
      </div>
    )
  } else {
    content = (
      <div className="gp-logbook-list gp-logbook-travel">
        {ordered.map((entry, index) => {
          const detail = details[entry.id] ?? {}
          return row(entry, (
            <>
              <span className="gp-logbook-waypoint" aria-hidden>{index + 1}</span>
              <div className="gp-logbook-travel-card">
                <header>
                  <DetailField label="Place" value={detail.place ?? ''} placeholder="Where were you?" className="gp-logbook-place" onChange={(value) => patchDetails(entry.id, { place: value })} />
                  {timeStamp(entry)}
                  {levelButton(entry)}
                </header>
                <div className="gp-logbook-travel-copy gp-bare-field">
                  {entryText(entry, 'Travel memory', 'What happened here?')}
                </div>
                <div className="gp-logbook-travel-details">
                  <DetailField label="Distance" icon={<Route size={8} aria-hidden />} value={detail.distance ?? ''} placeholder="12 km" onChange={(value) => patchDetails(entry.id, { distance: value })} />
                  <DetailField label="Trip context" icon={<Compass size={8} aria-hidden />} value={detail.context ?? ''} placeholder="Leg, route, or companion" onChange={(value) => patchDetails(entry.id, { context: value })} />
                </div>
              </div>
            </>
          ), 'gp-logbook-travel-row')
        })}
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className="gp-logbook"
      data-logbook-skin={skin}
    >
      <header className="gp-logbook-header">
        <span className="gp-logbook-eyebrow">
          {skinIcon(skin)}
          {copy.eyebrow}
        </span>
        <span className="gp-logbook-summary">
          <strong>{entries.length}</strong>
          <span>{entries.length === 1 ? 'entry' : 'entries'}</span>
          {warnings > 0 && (
            <em title={`${warnings} flagged ${warnings === 1 ? 'entry' : 'entries'}`}>
              <AlertTriangle size={8} aria-hidden />
              {warnings}
            </em>
          )}
        </span>
        {latest && (
          <small className="gp-logbook-latest" title="Latest entry">
            {shortTime(latest.timestamp)}
          </small>
        )}
        <button
          type="button"
          aria-label={order === 'newest' ? 'Show oldest entries first' : 'Show newest entries first'}
          title={order === 'newest' ? 'Newest first' : 'Oldest first'}
          onClick={() => onChange(dataWithLogbookOrder(
            baseData(),
            skin,
            order === 'newest' ? 'oldest' : 'newest',
          ))}
          className="gp-logbook-order"
        >
          <ArrowDownUp size={9} aria-hidden />
          {order === 'newest' ? 'Newest' : 'Oldest'}
        </button>
      </header>

      {entries.length > 0 ? content : (
        <div className="gp-logbook-empty">
          <span aria-hidden>{skinIcon(skin, 15)}</span>
          <strong>{copy.emptyTitle}</strong>
          <span>{copy.emptyHint}</span>
        </div>
      )}

      <footer className="gp-logbook-composer">
        <button
          type="button"
          aria-label={`New entry level: ${draftLevel}`}
          title={`New-entry level: ${draftLevel} — click to change`}
          data-level={draftLevel}
          onClick={() => setDraftLevel(nextIn(LEVELS, draftLevel))}
          className="gp-logbook-level"
        >
          {levelGlyph(draftLevel)}
        </button>
        <div className="gp-bare-field gp-logbook-composer-field">
          <textarea
            rows={1}
            value={draft}
            aria-label={`New entry: ${copy.add.toLocaleLowerCase()}`}
            placeholder={copy.placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onComposerKeyDown}
          />
        </div>
        <kbd className="gp-logbook-hint" aria-hidden>
          <CornerDownLeft size={8} />
        </kbd>
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          title={copy.add}
          className="gp-logbook-add"
        >
          <Plus size={11} aria-hidden />
          {copy.add}
        </button>
      </footer>
    </div>
  )
}
