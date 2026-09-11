import type { AutomationCoreData } from '../../types/spatial'
import {
  AUTOMATION_CORE_CATALOG,
  type AutomationCoreType,
} from '../../widgets/automationCoreCatalog'
import {
  compact,
  finite,
  record,
  REST_ROW_LIMIT,
  type RestingFaceModel,
  type RestRow,
  type RestTone,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// The automation nodes.
//
// All forty-eight persist one envelope — a label, an input, an output, a
// config, a run count, an error, and a list of held records — and the open
// card draws them in one fixed order: a status island (what the node is doing
// right now), the input it will act on, whatever it last produced or failed
// with, and the records it is holding. The folded tile is that same column,
// shortened: the status line always, then only the parts that hold something.
//
// A node's skin is not a second renderer — a Queue wearing Dead Letter is the
// same body under a different dress — so the tile leaves its eyebrow blank and
// lets the catalogue dress name the skin. That is the one thing a folded
// automation node could not otherwise say about itself.
// ---------------------------------------------------------------------------

/** What each family of node is, in a word a reader recognises. The catalogue's
 * own kinds are internal ("state", "join"), and a tile that trailed the word
 * "state" beside "Ready" would read as a second status rather than a family. */
const KIND_WORDS: Record<string, string> = {
  orchestrator: 'Flow',
  source: 'Trigger',
  join: 'Join',
  canvas: 'Canvas',
  state: 'Store',
  integration: 'Service',
  observability: 'Monitor',
}

/** The words the status island prints, in the island's own priority order. */
function statusReading(data: AutomationCoreData): { label: string; tone: RestTone } {
  if (data.running) return { label: 'Running', tone: 'accent' }
  if (typeof data.lastError === 'string' && data.lastError.trim()) {
    return { label: 'Needs attention', tone: 'bad' }
  }
  const count = finite(data.count) ?? 0
  if (count > 0) return { label: `${count} ${count === 1 ? 'run' : 'runs'}`, tone: 'good' }
  return data.enabled === false
    ? { label: 'Paused', tone: 'muted' }
    : { label: 'Ready', tone: 'muted' }
}

/** A held record's own words. The stores keep loose records, so this reads the
 * first thing that looks like a name and falls back to the raw value — never
 * to a position, which would say nothing about what is being held. */
function heldLabel(entry: unknown, index: number): string {
  if (typeof entry === 'string') return entry.trim() || `Item ${index + 1}`
  if (typeof entry === 'number' || typeof entry === 'boolean') return String(entry)
  const item = record(entry)
  if (!item) return `Item ${index + 1}`
  for (const key of ['label', 'name', 'title', 'text', 'key', 'id', 'value'] as const) {
    const value = item[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return `Item ${index + 1}`
}

export function automationCoreRestingFace(
  type: AutomationCoreType,
  data: Record<string, unknown>,
): RestingFaceModel {
  const node = data as unknown as AutomationCoreData
  const spec = AUTOMATION_CORE_CATALOG[type]
  const status = statusReading(node)
  const rows: RestRow[] = [{
    key: 'status',
    label: status.label,
    tone: status.tone,
    value: KIND_WORDS[spec.kind] ?? compact(spec.kind.replaceAll('_', ' '), 14),
  }]

  const input = typeof node.input === 'string' ? node.input.trim() : ''
  if (input) rows.push({ key: 'input', label: compact(input, 30), lead: '→', tone: 'muted' })

  // The open card shows an error in place of the output, never both.
  const error = typeof node.lastError === 'string' ? node.lastError.trim() : ''
  const output = typeof node.output === 'string' ? node.output.trim() : ''
  if (error || output) {
    rows.push({
      key: 'result',
      label: compact(error || output, 30),
      lead: error ? '!' : '=',
      tone: error ? 'bad' : 'accent',
    })
  }

  // What the node holds is the only part of an automation card that is real
  // content rather than machinery, so it gets whatever rows are left.
  const items = Array.isArray(node.items) ? node.items : []
  let held = 0
  for (const entry of items) {
    if (rows.length >= REST_ROW_LIMIT) break
    held += 1
    rows.push({ key: `held-${held}`, label: compact(heldLabel(entry, held - 1), 28) })
  }

  return { kind: 'rows', rows, overflow: Math.max(0, items.length - held) }
}
