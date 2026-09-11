import type { LogbookData, LogbookSkinMode, LogEntry, LogLevel } from '../../types/spatial'
import {
  logbookEntries,
  logbookEntryDetails,
  logbookOrder,
  logbookServiceDue,
  logbookSkinMode,
  logbookWarningCount,
  orderedLogbookEntries,
  type ChangeKind,
  type IncidentStatus,
  type LogbookEntryDetails,
} from '../../components/widgets/modules/logbookSkinModel'
import {
  compact,
  REST_ROW_LIMIT,
  type RestEyebrow,
  type RestingFaceModel,
  type RestRow,
  type RestTone,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// Logbook resting faces.
//
// One record, seven readings. A folded Logbook keeps showing real entries —
// the newest few lines of the log itself — and the worn skin decides what
// stands beside each line: an incident's status, a change's version, how
// overdue a service is, who acted, where the traveller was. Every reading
// comes through logbookSkinModel, the same model the open card reads, so the
// tile can never contradict the card, a warning-count port, or undo.
//
// Deliberately lightweight: every skin folds into the shared `rows` grammar
// (eyebrow + lead + label + trailing value + tone) — no new grammar kinds, no
// renderer branches, no CSS. The skin's whole resting identity is which words
// and colours it puts in those slots.
// ---------------------------------------------------------------------------

const EYEBROWS: Record<LogbookSkinMode, string> = {
  daily_log: 'Daily Log',
  incident_log: 'Incident Log',
  lab_notebook: 'Lab Notebook',
  change_log: 'Change Log',
  maintenance_log: 'Maintenance Log',
  audit_trail: 'Audit Trail',
  travel_log: 'Travel Log',
}

/** What an entry with no words is standing in for, in the skin's own terms. */
const EMPTY_LABELS: Record<LogbookSkinMode, string> = {
  daily_log: 'Empty entry',
  incident_log: 'Untitled incident',
  lab_notebook: 'Untitled experiment',
  change_log: 'Untitled change',
  maintenance_log: 'Unlogged work',
  audit_trail: 'Recorded event',
  travel_log: 'Unnamed stop',
}

const LEVEL_TONES: Record<LogLevel, RestTone | undefined> = {
  note: undefined,
  info: 'accent',
  warning: 'warn',
}

const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: 'Open',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
}

const STATUS_TONES: Record<IncidentStatus, RestTone> = {
  open: 'bad',
  monitoring: 'warn',
  resolved: 'good',
}

const CHANGE_LABELS: Record<ChangeKind, string> = {
  added: 'Added',
  changed: 'Changed',
  fixed: 'Fixed',
  removed: 'Removed',
}

const CHANGE_TONES: Record<ChangeKind, RestTone> = {
  added: 'good',
  changed: 'neutral',
  fixed: 'accent',
  removed: 'bad',
}

const DUE_TONES: Record<'overdue' | 'today' | 'soon', RestTone> = {
  overdue: 'bad',
  today: 'warn',
  soon: 'accent',
}

const TIME = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' })

function entryTime(entry: LogEntry): string {
  return TIME.format(new Date(entry.timestamp))
}

/** An incident with no recorded status is an open one — the open card's own
 * default for a fresh entry. */
function incidentStatus(detail: LogbookEntryDetails): IncidentStatus {
  return detail.status ?? 'open'
}

/** The furthest stage the experiment reached, scientific-method order. */
function labStage(detail: LogbookEntryDetails): { label: string; tone: RestTone } {
  if (detail.conclusion) return { label: 'Conclusion', tone: 'good' }
  if (detail.observation) return { label: 'Observation', tone: 'accent' }
  if (detail.method) return { label: 'Method', tone: 'neutral' }
  if (detail.hypothesis) return { label: 'Hypothesis', tone: 'muted' }
  return { label: 'Experiment', tone: 'muted' }
}

/**
 * The resting face for a Logbook card: the newest few real entries, each
 * carrying the reading its worn skin is for.
 */
export function logbookRestingFace(data: Record<string, unknown>): RestingFaceModel {
  const entries = logbookEntries(data.entries)
  if (entries.length === 0) return { kind: 'icon' }

  const logData = data as unknown as LogbookData
  const skin = logbookSkinMode(data.skin)
  const details = logbookEntryDetails(logData, skin)
  const ordered = orderedLogbookEntries(entries, logbookOrder(logData, skin))
  const visible = ordered.slice(0, REST_ROW_LIMIT)
  const overflow = Math.max(0, ordered.length - visible.length)
  const newest = orderedLogbookEntries(entries, 'newest')[0]!

  const eyebrow = (note?: string, tone?: RestTone): RestEyebrow => ({
    label: EYEBROWS[skin],
    ...(note === undefined ? {} : { note }),
    ...(tone === undefined ? {} : { tone }),
  })
  const row = (entry: LogEntry, extra: Partial<RestRow> = {}): RestRow => ({
    key: entry.id,
    label: compact(entry.text || EMPTY_LABELS[skin], 28),
    ...extra,
  })
  const face = (head: RestEyebrow, rows: RestRow[]): RestingFaceModel => (
    { kind: 'rows', eyebrow: head, rows, overflow }
  )

  if (skin === 'incident_log') {
    const statuses = entries.map((entry) => incidentStatus(details[entry.id] ?? {}))
    const open = statuses.filter((status) => status === 'open').length
    const monitoring = statuses.filter((status) => status === 'monitoring').length
    const head = open > 0
      ? eyebrow(`${open} open`, 'bad')
      : monitoring > 0
        ? eyebrow(`${monitoring} monitoring`, 'warn')
        : eyebrow('All resolved', 'good')
    return face(head, visible.map((entry) => {
      const status = incidentStatus(details[entry.id] ?? {})
      return row(entry, { value: STATUS_LABELS[status], tone: STATUS_TONES[status] })
    }))
  }

  if (skin === 'lab_notebook') {
    const concluded = entries.filter((entry) => details[entry.id]?.conclusion).length
    return face(
      eyebrow(concluded > 0 ? `${concluded} concluded` : undefined),
      visible.map((entry) => {
        const stage = labStage(details[entry.id] ?? {})
        return row(entry, { value: stage.label, tone: stage.tone })
      }),
    )
  }

  if (skin === 'change_log') {
    return face(
      eyebrow(details[newest.id]?.version),
      visible.map((entry) => {
        const detail = details[entry.id] ?? {}
        return row(entry, {
          ...(detail.version ? { lead: compact(detail.version, 8) } : {}),
          value: detail.changeKind ? CHANGE_LABELS[detail.changeKind] : 'Change',
          ...(detail.changeKind ? { tone: CHANGE_TONES[detail.changeKind] } : {}),
        })
      }),
    )
  }

  if (skin === 'maintenance_log') {
    const dues = entries.map((entry) => logbookServiceDue(details[entry.id]?.nextService))
    const overdue = dues.filter((due) => due?.tone === 'overdue').length
    const upcoming = dues.filter((due) => due?.tone === 'today' || due?.tone === 'soon').length
    const head = overdue > 0
      ? eyebrow(`${overdue} overdue`, 'bad')
      : upcoming > 0
        ? eyebrow(`${upcoming} due soon`, 'warn')
        : eyebrow()
    return face(head, visible.map((entry) => {
      const detail = details[entry.id] ?? {}
      const due = logbookServiceDue(detail.nextService)
      const value = due?.label ?? detail.nextService ?? detail.asset
      return row(entry, {
        ...(value ? { value: compact(value, 16) } : {}),
        ...(due ? { tone: DUE_TONES[due.tone] } : {}),
      })
    }))
  }

  if (skin === 'audit_trail') {
    return face(
      eyebrow(`${entries.length} ${entries.length === 1 ? 'event' : 'events'}`),
      visible.map((entry) => {
        const detail = details[entry.id] ?? {}
        return row(entry, {
          lead: entryTime(entry),
          value: compact(detail.actor || detail.source || 'Event', 16),
        })
      }),
    )
  }

  if (skin === 'travel_log') {
    const lastPlace = details[newest.id]?.place
    return face(
      eyebrow(lastPlace ? compact(lastPlace, 18) : undefined),
      visible.map((entry) => {
        const detail = details[entry.id] ?? {}
        const value = detail.place || detail.distance || 'Waypoint'
        return row(entry, {
          value: compact(value, 16),
          ...(detail.place ? { tone: 'accent' as const } : {}),
        })
      }),
    )
  }

  // Daily Log: the day's running record, each line at the time it was written.
  const warnings = logbookWarningCount(entries)
  return face(
    warnings > 0
      ? eyebrow(`${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`, 'warn')
      : eyebrow(),
    visible.map((entry) => row(entry, {
      lead: entryTime(entry),
      tone: LEVEL_TONES[entry.level],
    })),
  )
}
