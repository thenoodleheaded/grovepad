import type { FormulaData } from '../../types/spatial'
import {
  counterSkin,
  goalCounterState,
  goalReading,
  multiCounterState,
  multiCounterTotal,
  periodEntryLabel,
  periodLabel,
  periodState,
  rateReading,
  safeCount,
  tallyGroups,
  timedRateState,
} from '../../components/widgets/modules/counterSkinModel'
import {
  angleUnit,
  calculatorSkinMode,
  dateMode,
  daysBetween,
  financeMode,
  financeRecipe,
  formatInBase,
  namedVariables,
  numberBase,
  tapeEntries,
  tapeTotal,
  workingDaysBetween,
} from '../../components/widgets/modules/calculatorSkinModel'
import {
  COMPARATOR_SYMBOL,
  comparatorOf,
  comparisonHolds,
  conditionalBranches,
  expressionText,
  formulaReading,
  formulaResultWord,
  formulaSkinMode,
  formulaOperator,
  growthProjection,
  OPERATOR_SYMBOL,
  simplifiedRatio,
  weightedRows,
} from '../../components/widgets/modules/formulaSkinModel'
import {
  clampFraction,
  compact,
  finite,
  formatRestDuration,
  formatRestNumber,
  record,
  REST_BAR_LIMIT,
  REST_CELL_LIMIT,
  REST_LINE_LIMIT,
  REST_ROW_LIMIT,
  type RestCell,
  type RestingFaceModel,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// The numeric families: Counter, Calculator, Formula, Number Input.
//
// All four publish one canonical number, and every skin is a different
// question asked of it. The folded card shows the ANSWER that skin is for —
// a tally's marks, a tape's running total, a ratio's two sides, a rate's
// events per minute — because the number alone is the one thing all seven
// skins would look identical holding.
// ---------------------------------------------------------------------------

/* ------------------------------------------------------------------ Counter */

export function counterRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const skin = counterSkin(data.skin)
  const count = safeCount(data.count)
  const label = typeof data.label === 'string' ? data.label.trim() : ''
  const states = record(data.skinStates) ?? {}

  if (skin === 'tally') {
    // Gate-five groups, exactly as the open sheet draws them: four uprights
    // and a crossing stroke, then the loose marks.
    const { groups, remainder } = tallyGroups(count)
    const cells: RestCell[] = []
    for (let index = 0; index < Math.min(groups, REST_CELL_LIMIT - 1); index++) {
      cells.push({ key: `group-${index}`, text: '卌', tone: 'accent' })
    }
    if (remainder > 0) cells.push({ key: 'remainder', text: '|'.repeat(remainder), tone: 'muted' })
    if (cells.length === 0) return { kind: 'metric', primary: '0', secondary: compact(label || 'Tally', 20) }
    return {
      kind: 'grid',
      dense: true,
      cols: Math.min(6, cells.length),
      cells,
      eyebrow: { label: compact(label || 'Tally', 18), note: formatRestNumber(count) },
    }
  }

  if (skin === 'goal_counter') {
    const reading = goalReading(count, goalCounterState(states.goal_counter))
    return {
      kind: 'gauge',
      progress: reading.progress,
      primary: `${formatRestNumber(reading.current)}`,
      secondary: compact(label || 'Goal', 18),
      caption: reading.reached
        ? 'Target reached'
        : `${formatRestNumber(reading.remaining)} to go`,
      tone: reading.reached ? 'good' : 'accent',
    }
  }

  if (skin === 'multi_counter') {
    const state = multiCounterState(states.multi_counter)
    if (state.counters.length === 0) {
      return { kind: 'metric', primary: formatRestNumber(count), secondary: compact(label || 'Counter', 20) }
    }
    const visible = state.counters.slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: {
        label: compact(label || 'Counters', 18),
        note: formatRestNumber(multiCounterTotal(state)),
      },
      rows: visible.map((counter) => ({
        key: counter.id,
        label: compact(counter.label || 'Untitled', 22),
        value: formatRestNumber(counter.count),
      })),
      overflow: Math.max(0, state.counters.length - visible.length),
    }
  }

  if (skin === 'timed_rate') {
    const state = timedRateState(states.timed_rate)
    const reading = rateReading(count, state, Date.now())
    return {
      kind: 'split',
      divider: '→',
      eyebrow: {
        label: compact(label || 'Rate', 18),
        note: reading.running ? 'Measuring' : 'Stopped',
        tone: reading.running ? 'accent' : 'muted',
      },
      left: { primary: formatRestNumber(reading.events), secondary: 'Events' },
      right: {
        primary: formatRestNumber(Math.round(reading.rate * 10) / 10),
        secondary: reading.windowLabel,
        tone: 'accent',
      },
    }
  }

  if (skin === 'resetting_period') {
    const state = periodState(states.resetting_period, new Date())
    const history = state.history.slice(0, REST_BAR_LIMIT - 1)
    const peak = Math.max(1, count, ...history.map((entry) => entry.total))
    return {
      kind: 'bars',
      eyebrow: { label: compact(label || 'Counter', 18), note: periodLabel(state.period) },
      bars: [
        {
          key: 'current',
          label: periodLabel(state.period),
          value: formatRestNumber(count),
          fraction: count / peak,
        },
        ...history.map((entry) => ({
          key: entry.key,
          label: periodEntryLabel(entry, state.period),
          value: formatRestNumber(entry.total),
          fraction: entry.total / peak,
          tone: 'muted' as const,
        })),
      ],
    }
  }

  // clicker and up_down are the plain number: one big reading, with the step
  // the buttons move by, because that is all their open cards add.
  const step = finite(data.step) ?? 1
  return {
    kind: 'metric',
    primary: formatRestNumber(count),
    secondary: skin === 'up_down'
      ? `±${formatRestNumber(Math.abs(step))} ${compact(label || 'Counter', 14)}`
      : compact(label || 'Counter', 20),
  }
}

/* --------------------------------------------------------------- Calculator */

const BASE_LABELS = { dec: 'DEC', hex: 'HEX', oct: 'OCT', bin: 'BIN' } as const

export function calculatorRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const skin = calculatorSkinMode(data.skin)
  const expression = typeof data.expression === 'string' ? data.expression : ''
  const result = typeof data.result === 'string' ? data.result : ''
  const states = record(data.skinStates) ?? {}

  if (skin === 'tape') {
    const entries = tapeEntries((record(states.tape) ?? {}).entries)
    if (entries.length === 0 && !expression) return { kind: 'icon' }
    // Newest at the top, the way an adding machine's paper reads once torn off.
    const visible = entries.slice(-REST_LINE_LIMIT).reverse()
    return {
      kind: 'lines',
      mono: true,
      eyebrow: { label: 'Tape', note: `${entries.length} entries` },
      lines: visible.map((entry, index) => ({
        key: entry.id,
        left: compact(entry.expression || '—', 22),
        right: compact(entry.result || '', 10),
        dim: index > 0,
      })),
      total: { key: 'total', left: 'Σ', right: formatRestNumber(tapeTotal(entries)), tone: 'accent' },
    }
  }

  if (skin === 'programmer') {
    const state = record(states.programmer) ?? {}
    const base = numberBase(state.base)
    const value = Number(result)
    const safe = Number.isFinite(value) ? Math.trunc(value) : 0
    // Every base at once: the whole reason to reach for this skin is seeing
    // the same integer in four alphabets.
    return {
      kind: 'lines',
      mono: true,
      eyebrow: { label: 'Programmer', note: BASE_LABELS[base] },
      lines: (['dec', 'hex', 'oct', 'bin'] as const).map((entry) => ({
        key: entry,
        left: BASE_LABELS[entry],
        right: compact(formatInBase(safe, entry), 18),
        tone: entry === base ? 'accent' as const : undefined,
        dim: entry !== base,
      })),
    }
  }

  if (skin === 'finance') {
    const state = record(states.finance) ?? {}
    const mode = financeMode(state.mode)
    const recipe = financeRecipe(mode)
    return {
      kind: 'rows',
      eyebrow: { label: compact(recipe.label, 18), note: result || '—' },
      rows: recipe.fields.slice(0, REST_ROW_LIMIT).map((field) => ({
        key: field.key,
        label: compact(field.label, 20),
        value: `${formatRestNumber(finite(state[field.key]) ?? 0)}${field.suffix ?? ''}`,
        tone: 'muted' as const,
      })),
      overflow: 0,
    }
  }

  if (skin === 'date_math') {
    const state = record(states.date_math) ?? {}
    const mode = dateMode(state.mode)
    const from = typeof state.from === 'string' ? state.from : ''
    const to = typeof state.to === 'string' ? state.to : ''
    // Both helpers throw on a missing date, and a fresh Date Math card has
    // neither. A resting face must never throw: it is built during render for
    // every folded card on the board, so one bad card would blank all of them.
    const days = from && to
      ? (mode === 'working_days' ? workingDaysBetween(from, to) : daysBetween(from, to))
      : null
    return {
      kind: 'split',
      divider: '→',
      eyebrow: {
        label: 'Date math',
        note: days === null
          ? 'Pick two dates'
          : mode === 'working_days' ? `${days} working` : `${days} days`,
      },
      left: { primary: compact(from || '—', 10), secondary: 'From' },
      right: { primary: compact(to || '—', 10), secondary: 'To', tone: 'accent' },
    }
  }

  if (skin === 'named_variables') {
    const state = record(states.named_variables) ?? {}
    const variables = namedVariables(state.variables)
    return {
      kind: 'lines',
      mono: true,
      eyebrow: { label: 'Variables', note: `${variables.length}` },
      lines: variables.slice(0, REST_LINE_LIMIT).map((variable, index) => ({
        key: `${variable.name}-${index}`,
        left: compact(variable.name || `x${index + 1}`, 14),
        right: formatRestNumber(variable.value),
      })),
      ...(result ? { total: { key: 'result', left: '=', right: compact(result, 14), tone: 'accent' as const } } : {}),
    }
  }

  // basic and scientific: the display, which is the expression that produced
  // the answer over the answer itself.
  if (!expression && !result) return { kind: 'icon' }
  const state = record(states.scientific) ?? {}
  return {
    kind: 'lines',
    mono: true,
    eyebrow: skin === 'scientific'
      ? { label: 'Scientific', note: angleUnit(state.angle).toUpperCase() }
      : { label: 'Calculator' },
    lines: [{ key: 'expression', left: compact(expression || '—', 26), dim: true }],
    total: { key: 'result', left: '=', right: compact(result || '0', 16), tone: 'accent' },
  }
}

/* ------------------------------------------------------------------ Formula */

export function formulaRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const a = finite(data.a)
  const b = finite(data.b)
  if (a === null || b === null) return null
  const formula = data as unknown as FormulaData
  const skin = formulaSkinMode(data.skin)
  const reading = formulaReading(formula)
  const states = record(data.skinStates) ?? {}
  const state = record(states[skin]) ?? {}
  const answer = `${formatRestNumber(reading.value)}${reading.suffix}`

  if (skin === 'ratio') {
    const simplified = simplifiedRatio(a, b)
    return {
      kind: 'split',
      divider: ':',
      eyebrow: { label: 'Ratio', note: answer },
      left: {
        primary: formatRestNumber(simplified?.left ?? a),
        secondary: 'A',
        tone: 'accent',
      },
      right: { primary: formatRestNumber(simplified?.right ?? b), secondary: 'B' },
    }
  }

  if (skin === 'percent_change') {
    const rising = reading.value > 0
    return {
      kind: 'split',
      divider: '→',
      eyebrow: {
        label: 'Percent change',
        note: `${rising ? '+' : ''}${answer}`,
        tone: reading.value === 0 ? 'muted' : rising ? 'good' : 'bad',
      },
      left: { primary: formatRestNumber(a), secondary: 'Was' },
      right: { primary: formatRestNumber(b), secondary: 'Now', tone: rising ? 'good' : 'bad' },
    }
  }

  if (skin === 'growth') {
    // Where the same rate takes the value — the projection IS the skin.
    const projection = growthProjection(a, b).slice(0, REST_BAR_LIMIT)
    const peak = Math.max(1, ...projection.map((value) => Math.abs(value)))
    return {
      kind: 'bars',
      eyebrow: { label: 'Growth', note: `${formatRestNumber(b)}%` },
      bars: projection.map((value, index) => ({
        key: `period-${index}`,
        label: `Period ${index + 1}`,
        value: formatRestNumber(value),
        fraction: Math.abs(value) / peak,
      })),
    }
  }

  if (skin === 'weighted_score') {
    const rows = weightedRows(state, a, b)
    const weight = rows.reduce((total, row) => total + row.weight, 0)
    return {
      kind: 'bars',
      eyebrow: { label: 'Weighted score', note: answer },
      bars: rows.slice(0, REST_BAR_LIMIT).map((row) => ({
        key: row.id,
        label: compact(row.label, 18),
        value: `×${formatRestNumber(row.weight)}`,
        fraction: weight === 0 ? 0 : clampFraction(row.weight / weight),
        tone: row.canonical ? undefined : ('muted' as const),
      })),
    }
  }

  if (skin === 'conditional') {
    const comparator = comparatorOf(state)
    const branches = conditionalBranches(state)
    const holds = comparisonHolds(a, b, comparator)
    return {
      kind: 'metric',
      primary: answer,
      secondary: holds ? 'Condition met' : 'Condition not met',
      tone: holds ? 'good' : 'muted',
      eyebrow: {
        label: `A ${COMPARATOR_SYMBOL[comparator]} B`,
        note: `${formatRestNumber(branches.whenTrue)} / ${formatRestNumber(branches.whenFalse)}`,
      },
    }
  }

  if (skin === 'expression') {
    const source = expressionText(state)
    return {
      kind: 'lines',
      mono: true,
      eyebrow: { label: 'Expression', note: reading.note ? '!' : undefined },
      lines: [
        { key: 'source', left: compact(source || 'A + B', 24), dim: true },
        { key: 'inputs', left: `A ${formatRestNumber(a)}   B ${formatRestNumber(b)}`, dim: true },
      ],
      total: { key: 'result', left: '=', right: answer, tone: reading.note ? 'warn' : 'accent' },
    }
  }

  // two_input: the sum as it is written, over the answer.
  return {
    kind: 'lines',
    mono: true,
    eyebrow: { label: formulaResultWord(skin) },
    lines: [{
      key: 'sum',
      left: `${formatRestNumber(a)} ${OPERATOR_SYMBOL[formulaOperator(data.operator)]} ${formatRestNumber(b)}`,
      dim: true,
    }],
    total: { key: 'result', left: '=', right: answer, tone: reading.note ? 'warn' : 'accent' },
  }
}

/* ------------------------------------------------------------- Number Input */

/**
 * Number Input has one renderer for all seven catalogue skins, so every one of
 * them folds to the same honest reading the open card gives: the value on its
 * track between the bounds. The catalogue dress adds the worn skin's name.
 */
export function numberInputRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const value = finite(data.value)
  if (value === null) return null
  const low = Math.min(finite(data.min) ?? 0, finite(data.max) ?? 100)
  const high = Math.max(finite(data.min) ?? 0, finite(data.max) ?? 100)
  const label = typeof data.label === 'string' ? data.label.trim() : ''
  const skin = typeof data.skin === 'string' ? data.skin : 'stepper'
  const primary = skin === 'duration'
    ? formatRestDuration(value)
    : skin === 'percent'
      ? `${formatRestNumber(value)}%`
      : formatRestNumber(value)
  return {
    kind: 'metric',
    primary,
    secondary: compact(label || 'Value', 20),
    ...(high > low ? { progress: clampFraction((value - low) / (high - low)) } : {}),
  }
}
