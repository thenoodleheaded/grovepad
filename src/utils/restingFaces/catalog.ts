import type { ModuleType } from '../../types/spatial'
import type { UnitConverterData } from '../../types/widgetDataExpansion'
import type { FormulaSheetData } from '../../types/widgetDataEducation'
import { unitConverterReading } from '../../components/widgets/modules/unitConverterSkinModel'
import {
  formulaDerivationSteps,
  formulaExampleOpenId,
  formulaExampleResult,
  formulaExampleValues,
  formulaSheetItems,
  formulaSheetSkin,
  formulaSubject,
  formulaUnitVerdict,
  formulaUnits,
} from '../../components/widgets/modules/formulaSheetSkinModel'
import {
  clampFraction,
  compact,
  finite,
  formatRestNumber,
  record,
  REST_BAR_LIMIT,
  REST_CHIP_LIMIT,
  REST_LINE_LIMIT,
  REST_NODE_LIMIT,
  REST_ROW_LIMIT,
  type RestCell,
  type RestingFaceModel,
  type RestLine,
  type RestRow,
  type RestTone,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// The remaining catalogue families.
//
// Each of these cards has a body of its own that the generic ladder could not
// see: a risk register is scored rows, a SWOT is four quadrants, a process is
// a numbered spine, a metrics board is tiles. Folded, each keeps the shape it
// opens as — and where a skin really does re-present the same record (a KPI
// board wearing Big Number, a mood log wearing Month Heatmap, a status wearing
// Pipeline), the tile changes with it, because the open card does.
//
// Skins that only dress the body leave the eyebrow blank so the catalogue
// dress can name them.
// ---------------------------------------------------------------------------

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function skinOf(data: Record<string, unknown>): string {
  return text(data.skin) || text(data.mode)
}

function listOf(data: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = data[key]
  return Array.isArray(value)
    ? value.map((entry) => record(entry)).filter((entry): entry is Record<string, unknown> => entry !== null)
    : []
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => text(entry)).filter(Boolean) : []
}

/** Every face here folds to nothing when the card holds nothing. */
const EMPTY: RestingFaceModel = { kind: 'icon' }

/* ------------------------------------------------------------------- Risk */

function riskFace(data: Record<string, unknown>): RestingFaceModel {
  const items = listOf(data, 'items')
  if (items.length === 0) return EMPTY
  const score = (item: Record<string, unknown>) =>
    (finite(item.likelihood) ?? 0) * (finite(item.impact) ?? 0)
  // The open card sorts by score, so the folded one shows the same risks at
  // the top rather than whichever were typed first.
  const ranked = [...items].sort((left, right) => score(right) - score(left))
  const visible = ranked.slice(0, REST_ROW_LIMIT)
  return {
    kind: 'rows',
    rows: visible.map((item, index) => {
      const value = score(item)
      return {
        key: text(item.id, `risk-${index}`),
        lead: String(value),
        label: compact(text(item.risk, 'Untitled risk'), 24),
        done: item.status === 'resolved',
        tone: (item.status === 'resolved'
          ? 'muted'
          : value >= 15 ? 'bad' : value >= 8 ? 'warn' : 'good') as RestTone,
      }
    }),
    overflow: Math.max(0, items.length - visible.length),
  }
}

/* -------------------------------------------------------- Decision matrix */

const MATRIX_CRITERIA = 3
const MATRIX_OPTIONS = 4

function decisionMatrixFace(data: Record<string, unknown>): RestingFaceModel {
  const criteria = listOf(data, 'criteria')
  const options = listOf(data, 'options')
  if (options.length === 0) return EMPTY
  const weighted = (option: Record<string, unknown>) => {
    const scores = Array.isArray(option.scores) ? option.scores : []
    return criteria.reduce(
      (sum, criterion, index) => sum + (finite(criterion.weight) ?? 1) * (finite(scores[index]) ?? 0),
      0,
    )
  }
  const totals = options.map(weighted)
  const best = totals.reduce(
    (winner, value, index) => (value > (totals[winner] ?? -Infinity) ? index : winner),
    0,
  )
  const shownCriteria = criteria.slice(0, MATRIX_CRITERIA)
  const shownOptions = options.slice(0, MATRIX_OPTIONS)
  const cells: RestCell[] = []
  shownOptions.forEach((option, optionIndex) => {
    const scores = Array.isArray(option.scores) ? option.scores : []
    const winner = optionIndex === best
    const id = text(option.id, `option-${optionIndex}`)
    cells.push({
      key: `${id}-label`,
      text: compact(text(option.label, `Option ${optionIndex + 1}`), 12),
      ...(winner ? { tone: 'accent' as const, current: true } : {}),
    })
    shownCriteria.forEach((_criterion, criterionIndex) => {
      cells.push({
        key: `${id}-${criterionIndex}`,
        text: formatRestNumber(finite(scores[criterionIndex]) ?? 0),
      })
    })
    cells.push({
      key: `${id}-total`,
      text: formatRestNumber(Math.round((totals[optionIndex] ?? 0) * 10) / 10),
      tone: winner ? 'accent' : 'muted',
    })
  })
  return {
    kind: 'grid',
    cols: shownCriteria.length + 2,
    header: [
      'Option',
      ...shownCriteria.map((criterion, index) => compact(text(criterion.label, `C${index + 1}`), 8)),
      'Σ',
    ],
    cells,
  }
}

/* ------------------------------------------------------------------- SWOT */

const SWOT_QUADRANTS = [
  { key: 'strengths', label: 'Strengths', tone: 'good' as const },
  { key: 'weaknesses', label: 'Weaknesses', tone: 'bad' as const },
  { key: 'opportunities', label: 'Opportunities', tone: 'accent' as const },
  { key: 'threats', label: 'Threats', tone: 'warn' as const },
]

const SWOT_ITEMS = 2

function swotFace(data: Record<string, unknown>): RestingFaceModel {
  const columns = SWOT_QUADRANTS.map((quadrant) => {
    const items = strings(data[quadrant.key])
    return {
      key: quadrant.key,
      label: quadrant.label,
      tone: quadrant.tone,
      items: items.slice(0, SWOT_ITEMS).map((item, index) => ({
        key: `${quadrant.key}-${index}`,
        label: compact(item, 14),
      })),
      overflow: Math.max(0, items.length - SWOT_ITEMS),
    }
  })
  if (columns.every((column) => column.items.length === 0)) return EMPTY
  // Two across, two down: a SWOT flattened into one row of four would stop
  // being the square everybody reads it as.
  return { kind: 'columns', columns, wrap: 2 }
}

/* --------------------------------------------------------------- Timesheet */

function timesheetFace(data: Record<string, unknown>): RestingFaceModel {
  const entries = listOf(data, 'entries')
  if (entries.length === 0) return EMPTY
  const hours = (entry: Record<string, unknown>) => Math.max(0, finite(entry.hours) ?? 0)
  const total = entries.reduce((sum, entry) => sum + hours(entry), 0)
  const billable = entries.reduce((sum, entry) => sum + (entry.billable === true ? hours(entry) : 0), 0)
  const amount = billable * Math.max(0, finite(data.hourlyRate) ?? 0)
  const visible = entries.slice(0, REST_ROW_LIMIT - 1)
  return {
    kind: 'rows',
    rows: [
      {
        key: 'total',
        label: `${formatRestNumber(Math.round(total * 100) / 100)} h`,
        value: `${text(data.currency, '')}${formatRestNumber(Math.round(amount * 100) / 100)}`,
        tone: 'accent',
      },
      ...visible.map((entry, index) => ({
        key: text(entry.id, `entry-${index}`),
        label: compact(text(entry.label, 'Work item'), 22),
        value: `${formatRestNumber(hours(entry))}h`,
        ...(entry.billable === true ? {} : { tone: 'muted' as const }),
      })),
    ],
    overflow: Math.max(0, entries.length - visible.length),
  }
}

/* --------------------------------------------------------------- Inventory */

function inventoryFace(data: Record<string, unknown>): RestingFaceModel {
  const items = listOf(data, 'items')
  if (items.length === 0) return EMPTY
  const visible = items.slice(0, REST_ROW_LIMIT)
  return {
    kind: 'rows',
    rows: visible.map((item, index) => {
      const quantity = finite(item.quantity) ?? 0
      const low = quantity <= (finite(item.minimum) ?? 0)
      return {
        key: text(item.id, `item-${index}`),
        label: compact(text(item.name, 'Item'), 22),
        value: `${formatRestNumber(quantity)}${text(item.unit) ? ` ${text(item.unit)}` : ''}`,
        // Below the minimum is the one thing an inventory card exists to say.
        ...(low ? { tone: 'warn' as const } : {}),
      }
    }),
    overflow: Math.max(0, items.length - visible.length),
  }
}

/* ------------------------------------------------------------------ Status */

const STATUS_STEPS = [
  { value: 'not_started', label: 'Not started', progress: 0 },
  { value: 'in_progress', label: 'In progress', progress: 50 },
  { value: 'blocked', label: 'Blocked', progress: 50 },
  { value: 'done', label: 'Done', progress: 100 },
] as const

function statusFace(data: Record<string, unknown>): RestingFaceModel {
  const current = STATUS_STEPS.find((step) => step.value === data.value) ?? STATUS_STEPS[0]
  const label = compact(text(data.label, 'Status'), 22)
  const tone: RestTone = current.value === 'done'
    ? 'good'
    : current.value === 'blocked'
      ? 'bad'
      : current.value === 'in_progress' ? 'accent' : 'muted'
  const skin = skinOf(data)

  // A pipeline names the whole run of states, so it keeps the whole run.
  if (skin === 'pipeline') {
    return {
      kind: 'chain',
      shape: 'linear',
      nodes: STATUS_STEPS.slice(0, REST_NODE_LIMIT).map((step) => ({
        key: step.value,
        label: compact(step.label, 10),
        current: step.value === current.value,
      })),
      overflow: 0,
    }
  }
  if (skin === 'progress' || skin === 'service_health') {
    return {
      kind: 'gauge',
      progress: current.progress / 100,
      primary: `${current.progress}%`,
      secondary: compact(current.label, 18),
      caption: label,
      tone,
    }
  }
  // Badge, traffic light, availability and approval are all one lit state.
  return {
    kind: 'metric',
    primary: current.label,
    secondary: label,
    tone,
    progress: current.progress / 100,
  }
}

/* ----------------------------------------------------------------- Process */

const PROCESS_TONES: Record<string, RestTone> = { done: 'good', active: 'accent', todo: 'muted' }

function processFace(data: Record<string, unknown>): RestingFaceModel {
  const steps = listOf(data, 'steps')
  if (steps.length === 0) return EMPTY
  const done = steps.filter((step) => step.status === 'done').length
  const visible = steps.slice(0, REST_ROW_LIMIT)
  return {
    kind: 'rows',
    // The procedure's own completion meter, the same one the open card runs
    // across its head.
    meter: clampFraction(done / steps.length),
    rows: visible.map((step, index) => {
      const tone = PROCESS_TONES[text(step.status)]
      return {
        key: text(step.id, `step-${index}`),
        lead: String(index + 1).padStart(2, '0'),
        label: compact(text(step.label, 'Process step'), 22),
        done: step.status === 'done',
        ...(tone ? { tone } : {}),
      }
    }),
    overflow: Math.max(0, steps.length - visible.length),
  }
}

/* ----------------------------------------------------------------- Metrics */

const TREND_MARKS: Record<string, string> = { up: '↑', down: '↓', flat: '→' }
const TREND_TONES: Record<string, RestTone> = { up: 'good', down: 'bad', flat: 'muted' }

/** A tile's value is authored as text ("1.2k", "98%"), so a bar has to read
 * whatever number is inside it and give up gracefully when there is none. */
function tileNumber(value: unknown): number {
  const direct = finite(value)
  if (direct !== null) return direct
  const parsed = Number.parseFloat(text(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function metricsFace(data: Record<string, unknown>): RestingFaceModel {
  const tiles = listOf(data, 'tiles')
  if (tiles.length === 0) return EMPTY
  const skin = skinOf(data)
  const reading = (tile: Record<string, unknown>) => `${text(tile.value, '—')}${text(tile.unit)}`

  // One number the size of the card: the whole point of that skin.
  if (skin === 'big_number') {
    const lead = tiles[0]!
    const tone = TREND_TONES[text(lead.trend)]
    return {
      kind: 'metric',
      primary: compact(reading(lead), 12),
      secondary: compact(text(lead.label, 'Metric'), 20),
      ...(tone ? { tone } : {}),
    }
  }
  if (skin === 'traffic_lights') {
    const visible = tiles.slice(0, REST_CHIP_LIMIT)
    return {
      kind: 'chips',
      chips: visible.map((tile, index) => {
        const tone = TREND_TONES[text(tile.trend)]
        return {
          key: text(tile.id, `tile-${index}`),
          text: compact(text(tile.label, 'Metric'), 14),
          filled: true,
          ...(tone ? { tone } : {}),
        }
      }),
      overflow: Math.max(0, tiles.length - visible.length),
    }
  }
  if (skin === 'target') {
    const visible = tiles.slice(0, REST_BAR_LIMIT)
    const peak = Math.max(1, ...visible.map((tile) => Math.abs(tileNumber(tile.value))))
    return {
      kind: 'bars',
      bars: visible.map((tile, index) => {
        const tone = TREND_TONES[text(tile.trend)]
        return {
          key: text(tile.id, `tile-${index}`),
          label: compact(text(tile.label, 'Metric'), 18),
          value: compact(reading(tile), 10),
          fraction: clampFraction(Math.abs(tileNumber(tile.value)) / peak),
          ...(tone ? { tone } : {}),
        }
      }),
    }
  }
  const visible = tiles.slice(0, REST_ROW_LIMIT)
  return {
    kind: 'rows',
    rows: visible.map((tile, index) => {
      const tone = TREND_TONES[text(tile.trend)]
      return {
        key: text(tile.id, `tile-${index}`),
        label: compact(text(tile.label, 'Metric'), 20),
        value: compact(`${TREND_MARKS[text(tile.trend)] ?? ''}${reading(tile)}`, 12),
        ...(tone ? { tone } : {}),
      }
    }),
    overflow: Math.max(0, tiles.length - visible.length),
  }
}

/* ------------------------------------------------------------ Mood tracker */

const MOODS = ['☀️', '🌤️', '☁️', '🌧️', '⛈️']
const WEEK_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function moodFace(data: Record<string, unknown>): RestingFaceModel {
  const days = Array.isArray(data.days) ? data.days : []
  const marked = days.map((day) => finite(day)).filter((day): day is number => day !== null)
  if (marked.length === 0) return EMPTY
  const skin = skinOf(data)

  if (skin === 'month_heatmap') {
    return {
      kind: 'grid',
      cols: 7,
      dense: true,
      cells: days.slice(0, 28).map((day, index): RestCell => {
        const mood = finite(day)
        return {
          key: `day-${index}`,
          text: '',
          // The scale runs bright to stormy, so a low reading is a full cell.
          ...(mood === null ? {} : { fill: 1 - mood / Math.max(1, MOODS.length - 1) }),
        }
      }),
    }
  }
  if (skin === 'trend') {
    // Fewer is better on this scale, so the plot is inverted and a rising line
    // reads as a better week, the way the open card's colours do.
    return {
      kind: 'chart',
      series: marked.map((mood) => MOODS.length - mood),
      stats: [{ label: 'Now', value: MOODS[marked.at(-1)!] ?? '—' }],
    }
  }
  return {
    kind: 'chips',
    // A marked day is its weather and nothing else, the way the open card's
    // day cell is. Position already says which day it is, and a wider chip
    // ("M \u2600\ufe0f") wraps the week onto two lines — an emoji draws wider than
    // the tile measurer can predict for it.
    chips: days.slice(0, WEEK_INITIALS.length).map((day, index) => {
      const mood = finite(day)
      return {
        key: `day-${index}`,
        text: mood === null ? WEEK_INITIALS[index]! : MOODS[mood] ?? WEEK_INITIALS[index]!,
        filled: mood !== null,
        ...(mood === null ? { tone: 'muted' as const } : {}),
      }
    }),
    overflow: 0,
  }
}

/* ------------------------------------------------------------------- Study */

function citationFace(data: Record<string, unknown>): RestingFaceModel {
  const sources = listOf(data, 'sources')
  if (sources.length === 0) return EMPTY
  const visible = sources.slice(0, REST_ROW_LIMIT)
  return {
    kind: 'rows',
    rows: visible.map((source, index) => ({
      key: text(source.id, `source-${index}`),
      label: compact(text(source.author) || text(source.title, 'Untitled source'), 24),
      ...(text(source.year) ? { value: text(source.year) } : {}),
      // The style is the sheet's own heading, so it leads the first entry.
      ...(index === 0 ? { lead: text(data.style, 'APA') } : {}),
    })),
    overflow: Math.max(0, sources.length - visible.length),
  }
}


/**
 * A folded Formula Sheet keeps the shape of the skin it wears: the ledger's
 * two columns, the card deck led by its equation, the derivation's ladder, the
 * unit check's verdict, the worked example's answer. Every reading comes from
 * the same skin model the open card reads.
 */
function formulaSheetFace(data: Record<string, unknown>): RestingFaceModel {
  const formulas = formulaSheetItems(data.formulas)
  if (formulas.length === 0) return EMPTY
  const skin = formulaSheetSkin(data.skin)
  const held = data as unknown as FormulaSheetData

  if (skin === 'derivation') {
    // The ladder itself, when one is written — the steps, landing on the result.
    const derived = formulas.find((formula) => formulaDerivationSteps(held, formula.id).length > 0)
    if (derived) {
      const steps = formulaDerivationSteps(held, derived.id)
      const shown = steps.slice(0, Math.max(1, REST_NODE_LIMIT - 1))
      return {
        kind: 'chain',
        shape: 'linear',
        overflow: Math.max(0, steps.length - shown.length),
        nodes: [
          ...shown.map((step, index) => ({
            key: `${derived.id}-step-${index}`,
            label: compact(step, 20),
          })),
          {
            key: `${derived.id}-result`,
            label: compact(derived.expression || derived.name || 'Result', 20),
            ...(derived.name ? { caption: compact(derived.name, 18) } : {}),
          },
        ],
      }
    }
  }

  if (skin === 'unit_aware') {
    return {
      kind: 'rows',
      rows: formulas.slice(0, REST_ROW_LIMIT).map((formula): RestRow => {
        const verdict = formulaUnitVerdict(formula.expression, formulaUnits(held, formula.id))
        const tone: RestTone = verdict.state === 'balanced' ? 'good'
          : verdict.state === 'mismatch' ? 'bad'
            : 'muted'
        return {
          key: formula.id,
          label: compact(formula.expression || formula.name || 'Formula', 22),
          ...(verdict.left ? { value: compact(verdict.left, 12) } : {}),
          tone,
        }
      }),
      overflow: Math.max(0, formulas.length - REST_ROW_LIMIT),
    }
  }

  if (skin === 'worked_example') {
    const openId = formulaExampleOpenId(held)
    return {
      kind: 'rows',
      rows: formulas.slice(0, REST_ROW_LIMIT).map((formula): RestRow => {
        const result = formulaExampleResult(formula.expression, formulaExampleValues(held, formula.id))
        return {
          key: formula.id,
          label: compact(formula.name || formula.expression || 'Formula', 22),
          ...(result.state === 'solved' ? { value: compact(result.text, 12) } : {}),
          ...(formula.id === openId ? { lead: '▾', tone: 'accent' as const } : {}),
        }
      }),
      overflow: Math.max(0, formulas.length - REST_ROW_LIMIT),
    }
  }

  // The equation deck leads with the equation; the two ledgers lead with the
  // name, because that is the column a reader's eye lands on when it is open.
  const leadsWithExpression = skin === 'equation_cards'
  return {
    kind: 'lines',
    mono: true,
    lines: formulas.slice(0, REST_LINE_LIMIT).map((formula, index): RestLine => {
      const name = compact(formula.name, 16)
      const expression = compact(formula.expression, leadsWithExpression ? 20 : 18)
      if (leadsWithExpression) {
        const subject = formulaSubject(formula.expression)
        return {
          key: formula.id,
          left: expression || name || 'Formula',
          ...(subject && expression ? { right: compact(subject, 8) } : {}),
        }
      }
      // The strip is a printed booklet open or folded, so it keeps its numbers.
      const numbered = skin === 'exam_strip' ? `${index + 1}. ` : ''
      return {
        key: formula.id,
        left: numbered + (name || 'Formula'),
        ...(expression ? { right: expression } : {}),
      }
    }),
  }
}

function flashcardsFace(data: Record<string, unknown>): RestingFaceModel {
  const cards = listOf(data, 'cards')
  if (cards.length === 0) return EMPTY
  const current = Math.max(0, Math.min(cards.length - 1, finite(data.current) ?? 0))
  const rows: RestRow[] = []
  // The card on top is the card the open deck is showing; the rest follow in
  // deck order, so a folded deck and an open one are on the same card.
  for (let offset = 0; offset < cards.length && rows.length < REST_ROW_LIMIT; offset++) {
    const card = cards[(current + offset) % cards.length]!
    const back = compact(text(card.back), 12)
    rows.push({
      key: text(card.id, `card-${offset}`),
      label: compact(text(card.front, 'Card'), 26),
      ...(offset === 0
        ? { lead: '?', tone: 'accent' as const, ...(back ? { value: back } : {}) }
        : { tone: 'muted' as const }),
    })
  }
  return { kind: 'rows', rows, overflow: Math.max(0, cards.length - rows.length) }
}

function gradeCalcFace(data: Record<string, unknown>): RestingFaceModel {
  const components = listOf(data, 'components')
  if (components.length === 0) return EMPTY
  const weight = components.reduce((sum, item) => sum + Math.max(0, finite(item.weight) ?? 0), 0)
  const earned = components.reduce(
    (sum, item) => sum + (finite(item.score) ?? 0) * Math.max(0, finite(item.weight) ?? 0),
    0,
  )
  return {
    kind: 'bars',
    eyebrow: {
      label: 'Grade',
      note: weight > 0 ? `${formatRestNumber(Math.round((earned / weight) * 10) / 10)}%` : '—',
    },
    bars: components.slice(0, REST_BAR_LIMIT).map((component, index) => {
      const score = finite(component.score) ?? 0
      return {
        key: text(component.id, `component-${index}`),
        label: compact(text(component.name, 'Component'), 18),
        value: `${formatRestNumber(score)}%`,
        fraction: clampFraction(score / 100),
        ...(score >= 80 ? { tone: 'good' as const } : score < 50 ? { tone: 'bad' as const } : {}),
      }
    }),
  }
}

function readingListFace(data: Record<string, unknown>): RestingFaceModel {
  const items = listOf(data, 'items')
  if (items.length === 0) return EMPTY
  const visible = items.slice(0, REST_ROW_LIMIT)
  return {
    kind: 'rows',
    rows: visible.map((item, index) => {
      const status = text(item.status)
      return {
        key: text(item.id, `book-${index}`),
        label: compact(text(item.title, 'Untitled'), 24),
        done: status === 'finished' || status === 'done',
        ...(status ? { value: compact(status.replaceAll('_', ' '), 10) } : {}),
      }
    }),
    overflow: Math.max(0, items.length - visible.length),
  }
}

/* ------------------------------------------------------------- small cards */

function contactFace(data: Record<string, unknown>): RestingFaceModel {
  const rows: RestRow[] = []
  const name = text(data.name)
  if (name) rows.push({ key: 'name', label: compact(name, 24), tone: 'accent' })
  const role = text(data.role)
  if (role) rows.push({ key: 'role', label: compact(role, 26), tone: 'muted' })
  for (const [key, lead] of [['email', '@'], ['phone', '#']] as const) {
    const value = text(data[key])
    if (value && rows.length < REST_ROW_LIMIT) rows.push({ key, lead, label: compact(value, 26) })
  }
  return rows.length === 0 ? EMPTY : { kind: 'rows', rows, overflow: 0 }
}

function dialogFace(data: Record<string, unknown>): RestingFaceModel {
  const spoken = listOf(data, 'lines').filter((line) => text(line.character) || text(line.cue))
  if (spoken.length === 0) return EMPTY
  const visible = spoken.slice(0, REST_ROW_LIMIT)
  return {
    kind: 'rows',
    rows: visible.map((line, index) => ({
      key: text(line.id, `line-${index}`),
      ...(text(line.character) ? { lead: compact(text(line.character), 8) } : {}),
      label: compact(text(line.cue, '—'), 26),
    })),
    overflow: Math.max(0, spoken.length - visible.length),
  }
}

function decisionFace(data: Record<string, unknown>): RestingFaceModel {
  const options = strings(data.options)
  if (options.length === 0) return EMPTY
  const picked = finite(data.pickedIndex)
  const weights = Array.isArray(data.weights) ? data.weights : []
  const weighted = skinOf(data) === 'weighted'
  const visible = options.slice(0, REST_ROW_LIMIT)
  return {
    kind: 'rows',
    rows: visible.map((option, index) => {
      const weight = finite(weights[index])
      return {
        key: `option-${index}`,
        label: compact(option, 24),
        // The pick is the card's answer, so a folded card keeps it lit.
        ...(picked === index ? { lead: '★', tone: 'accent' as const } : { tone: 'muted' as const }),
        ...(weighted && weight !== null ? { value: `×${formatRestNumber(weight)}` } : {}),
      }
    }),
    overflow: Math.max(0, options.length - visible.length),
  }
}

function aiGeneratorFace(data: Record<string, unknown>): RestingFaceModel {
  const status = text(data.status, 'idle')
  const prompt = text(data.prompt)
  return {
    kind: 'rows',
    rows: [
      {
        key: 'status',
        label: status === 'generating' ? 'Generating' : status === 'done' ? 'Ready' : 'Idle',
        tone: status === 'generating' ? 'accent' : status === 'done' ? 'good' : 'muted',
      },
      ...(prompt ? [{ key: 'prompt', label: compact(prompt, 30), lead: '›' }] : []),
    ],
    overflow: 0,
  }
}

function audioPlayerFace(data: Record<string, unknown>): RestingFaceModel {
  return {
    kind: 'split',
    divider: '·',
    left: {
      primary: formatRestNumber(finite(data.bpm) ?? 0),
      secondary: 'BPM',
      ...(data.isPlaying === true ? { tone: 'accent' as const } : {}),
    },
    right: { primary: compact(text(data.key, '—'), 8), secondary: 'Key' },
  }
}

const TUNER_DIALS = [
  { key: 'grip', label: 'Grip' },
  { key: 'drift', label: 'Drift' },
  { key: 'stability', label: 'Stability' },
] as const

function gameTunerFace(data: Record<string, unknown>): RestingFaceModel {
  return {
    kind: 'bars',
    bars: TUNER_DIALS.map((dial) => {
      const value = finite(data[dial.key]) ?? 0
      return {
        key: dial.key,
        label: dial.label,
        value: formatRestNumber(value),
        // The dials are 0–1 on some presets and 0–100 on others; the bar reads
        // whichever scale the card is actually holding.
        fraction: clampFraction(value > 1 ? value / 100 : value),
      }
    }),
  }
}

function branchGateFace(data: Record<string, unknown>): RestingFaceModel | null {
  const skin = skinOf(data)
  const enabled = data.value === true
  const onLabel = compact(text(data.trueLabel, 'Pass'), 14)
  const offLabel = compact(text(data.falseLabel, 'Block'), 14)

  // An AND/OR gate is about both sides at once, so both stay on the tile.
  if (skin === 'and_or') {
    return {
      kind: 'chips',
      chips: [
        { key: 'off', text: offLabel, filled: !enabled, tone: enabled ? 'muted' : 'accent' },
        { key: 'on', text: onLabel, filled: enabled, tone: enabled ? 'accent' : 'muted' },
      ],
      overflow: 0,
    }
  }
  if (skin === 'inverter') {
    return {
      kind: 'split',
      divider: '¬',
      left: { primary: enabled ? 'On' : 'Off', secondary: 'In' },
      right: { primary: enabled ? 'Off' : 'On', secondary: 'Out', tone: 'accent' },
    }
  }
  if (skin === 'debounced_gate' || skin === 'permission') {
    const note = text(enabled ? data.trueNote : data.falseNote)
    return {
      kind: 'rows',
      rows: [
        { key: 'state', label: enabled ? onLabel : offLabel, tone: enabled ? 'good' : 'muted' },
        ...(note ? [{ key: 'note', label: compact(note, 28), tone: 'muted' as const }] : []),
      ],
      overflow: 0,
    }
  }
  // Pass/block and arm/disarm are the plain switch the base face already draws.
  return null
}

function colorPaletteFace(data: Record<string, unknown>): RestingFaceModel | null {
  const skin = skinOf(data)
  if (skin !== 'design_tokens' && skin !== 'accessibility') return null
  const colors = strings(data.colors)
  if (colors.length === 0) return null
  const visible = colors.slice(0, REST_ROW_LIMIT)
  // These two skins are about the values themselves rather than the swatch
  // strip, so the tile prints them the way the open card lists them.
  return {
    kind: 'rows',
    rows: visible.map((color, index) => ({
      key: `color-${index}`,
      lead: '■',
      label: color.toUpperCase(),
    })),
    overflow: Math.max(0, colors.length - visible.length),
  }
}


/* ------------------------------------------------------------------ Charts */

/**
 * The Chart family's tile normally carries no series of its own: the face
 * renderer reads the card's bars and draws them as the card's `mode` says —
 * a ring for donut and pie, a line for line, columns otherwise. So only the
 * skins that ladder does NOT serve are answered here, and everything else
 * falls through to the base chart face rather than being redescribed.
 */
function chartFace(data: Record<string, unknown>): RestingFaceModel | null {
  const bars = listOf(data, 'bars')
  if (bars.length === 0) return null
  const skin = skinOf(data)
  const unit = text(data.unit)
  const values = bars.map((bar) => finite(bar.value) ?? 0)
  const suffix = (value: number) => `${formatRestNumber(value)}${unit}`

  if (skin === 'gauge' || skin === 'progress_ring') {
    const latest = values.at(-1) ?? 0
    const peak = Math.max(...values.map((value) => Math.abs(value)), 1)
    return {
      kind: 'gauge',
      progress: clampFraction(Math.abs(latest) / peak),
      primary: suffix(latest),
      secondary: compact(text(bars.at(-1)?.label, 'Latest'), 18),
      // Only when the needle is somewhere short of the top: "72% of 72%" is a
      // caption that says nothing.
      ...(Math.abs(latest) < peak ? { caption: `of ${suffix(peak)}` } : {}),
    }
  }
  if (skin === 'heatmap') {
    const peak = Math.max(...values.map((value) => Math.abs(value)), 1)
    return {
      kind: 'grid',
      cols: 7,
      dense: true,
      cells: bars.slice(0, 28).map((bar, index): RestCell => ({
        key: text(bar.id, `cell-${index}`),
        text: '',
        fill: clampFraction(Math.abs(finite(bar.value) ?? 0) / peak),
      })),
    }
  }
  if (skin === 'stacked' || skin === 'donut' || skin === 'pie') {
    const total = values.reduce((sum, value) => sum + Math.max(0, value), 0)
    if (total <= 0) return null
    const visible = bars.slice(0, REST_BAR_LIMIT)
    return {
      kind: 'bars',
      bars: visible.map((bar, index) => {
        const value = Math.max(0, finite(bar.value) ?? 0)
        return {
          key: text(bar.id, `bar-${index}`),
          label: compact(text(bar.label, `Slice ${index + 1}`), 18),
          value: `${Math.round((value / total) * 100)}%`,
          fraction: clampFraction(value / total),
        }
      }),
    }
  }
  if (skin === 'area' || skin === 'sparkline') {
    // Handing the renderer a series is what makes it draw a line rather than
    // columns — which is the whole difference between these two skins and Bar.
    return {
      kind: 'chart',
      series: values,
      stats: [{ label: 'Now', value: suffix(values.at(-1) ?? 0) }],
    }
  }
  return null
}

/* -------------------------------------------------------------- Unit swap */

function unitConverterFace(data: Record<string, unknown>): RestingFaceModel | null {
  const reading = unitConverterReading(data as unknown as UnitConverterData)
  const precision = Math.max(0, Math.min(6, finite(data.precision) ?? 2))
  return {
    kind: 'split',
    divider: '→',
    left: {
      primary: compact(String(Number(reading.value.toFixed(precision))), 10),
      secondary: compact(reading.from.short || reading.from.label, 10),
    },
    right: {
      primary: compact(String(Number(reading.output.toFixed(precision))), 10),
      secondary: compact(reading.to.short || reading.to.label, 10),
      tone: 'accent',
    },
  }
}

/* ------------------------------------------------------------------ Media */

function mediaFace(data: Record<string, unknown>): RestingFaceModel | null {
  const skin = skinOf(data)
  // Everything else in this family really is a picture, and rests as one.
  if (skin !== 'audio' && skin !== 'document_preview') return null
  const url = text(data.url)
  if (!url) return null
  const file = url.split(/[?#]/)[0]!.split('/').filter(Boolean).at(-1) ?? url
  const caption = text(data.caption)
  return {
    kind: 'rows',
    rows: [
      {
        key: 'file',
        lead: skin === 'audio' ? '♪' : '¶',
        label: compact(decodeURIComponent(file), 26),
        tone: 'accent',
      },
      ...(caption ? [{ key: 'caption', label: compact(caption, 28), tone: 'muted' as const }] : []),
    ],
    overflow: 0,
  }
}

export function catalogRestingFace(
  type: ModuleType,
  data: Record<string, unknown>,
): RestingFaceModel | null {
  switch (type) {
    case 'bar_chart': return chartFace(data)
    case 'unit_converter': return unitConverterFace(data)
    case 'media': return mediaFace(data)
    case 'risk_register': return riskFace(data)
    case 'decision_matrix': return decisionMatrixFace(data)
    case 'swot': return swotFace(data)
    case 'timesheet': return timesheetFace(data)
    case 'inventory': return inventoryFace(data)
    case 'status': return statusFace(data)
    case 'process': return processFace(data)
    case 'metrics': return metricsFace(data)
    case 'mood_tracker': return moodFace(data)
    case 'citation': return citationFace(data)
    case 'formula_sheet': return formulaSheetFace(data)
    case 'flashcards': return flashcardsFace(data)
    case 'grade_calc': return gradeCalcFace(data)
    case 'reading_list': return readingListFace(data)
    case 'contact': return contactFace(data)
    case 'dialog': return dialogFace(data)
    case 'decision': return decisionFace(data)
    case 'ai_generator': return aiGeneratorFace(data)
    case 'audio_player': return audioPlayerFace(data)
    case 'game_tuner': return gameTunerFace(data)
    case 'branch_gate': return branchGateFace(data)
    case 'color_palette': return colorPaletteFace(data)
    default: return null
  }
}
