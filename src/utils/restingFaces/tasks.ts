import type { ChecklistItem } from '../../types/spatial'
import {
  assignmentOrder,
  boardColumns,
  dayOrder,
  dependencyReadings,
  dueReading,
  formatTaskTime,
  matrixQuadrants,
  REPEAT_LABELS,
  routineReading,
  shoppingGroups,
  sprintPoints,
  taskDependencyState,
  taskProgress,
  taskRecurringState,
  taskShoppingState,
  taskSkin,
  taskSprintState,
  taskRoutineState,
  taskTime,
  timelineReading,
  WEEKDAY_LABELS,
  weekColumns,
  type DueTone,
  type TaskSkin,
} from '../../components/widgets/modules/taskSkinModel'
import {
  compact,
  record,
  REST_COLUMN_ITEM_LIMIT,
  REST_LANE_LIMIT,
  REST_ROW_LIMIT,
  type RestColumn,
  type RestRow,
  type RestingFaceModel,
  type RestTone,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// Tasks resting faces.
//
// One card, thirteen shapes. A folded Tasks card keeps the shape it is wearing
// — a board folds to columns, a timeline to spans, a matrix to quadrants —
// because the arrangement IS what the skin is for. Everything below reads the
// same `items` collection through taskSkinModel, so a resting tile can never
// disagree with the open card, with the Done count port, or with undo.
// ---------------------------------------------------------------------------

const EYEBROWS: Record<TaskSkin, string> = {
  list: 'Tasks',
  inbox: 'Inbox',
  shopping: 'Shopping',
  assignments: 'Assignments',
  day: 'Today',
  week: 'This week',
  board: 'Board',
  timeline: 'Timeline',
  matrix: 'Priorities',
  recurring: 'Recurring',
  sprint: 'Sprint',
  dependencies: 'Dependencies',
  routine: 'Routine',
}

const DUE_TONE: Record<DueTone, RestTone> = {
  none: 'muted',
  overdue: 'bad',
  today: 'warn',
  soon: 'accent',
  later: 'muted',
}

function checklistItems(raw: unknown): ChecklistItem[] {
  return Array.isArray(raw)
    ? raw.filter((item): item is ChecklistItem => Boolean(record(item)))
    : []
}

function label(item: ChecklistItem, fallback = 'Untitled task'): string {
  return compact(item.label?.trim() || fallback, 30)
}

function taskRow(item: ChecklistItem, extra: Partial<RestRow> = {}): RestRow {
  return { key: item.id, label: label(item), done: item.done === true, ...extra }
}

function column(
  key: string,
  name: string,
  items: readonly ChecklistItem[],
  options: { note?: string; tone?: RestTone; value?: (item: ChecklistItem) => string | undefined } = {},
): RestColumn {
  const visible = items.slice(0, REST_COLUMN_ITEM_LIMIT)
  return {
    key,
    label: name,
    ...(options.note === undefined ? {} : { note: options.note }),
    ...(options.tone === undefined ? {} : { tone: options.tone }),
    items: visible.map((item) => ({
      key: item.id,
      label: compact(item.label?.trim() || 'Untitled', 18),
      done: item.done === true,
      ...(options.value ? { value: options.value(item) } : {}),
    })),
    overflow: Math.max(0, items.length - visible.length),
  }
}

/**
 * The resting face for a Tasks card. Returns null only when there is nothing
 * written down at all — an empty card rests as its own icon, like every other
 * widget with nothing to show.
 */
export function tasksRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const items = checklistItems(data.items)
  const skin = taskSkin(data.mode)
  if (items.length === 0) return null

  const progress = taskProgress(items)
  const states = record(data.skinStates) ?? {}
  const eyebrow = (note?: string, tone?: RestTone) => ({
    label: EYEBROWS[skin],
    ...(note === undefined ? {} : { note }),
    ...(tone === undefined ? {} : { tone }),
  })
  const countNote = `${progress.done}/${progress.total}`

  if (skin === 'board' || skin === 'sprint') {
    const sprint = taskSprintState(states.sprint, items)
    const total = sprintPoints(items, sprint)
    const columns = boardColumns(items)
    return {
      kind: 'columns',
      eyebrow: eyebrow(
        skin === 'sprint' && sprint.name ? compact(sprint.name, 18) : countNote,
      ),
      columns: columns.map((lane) => column(
        lane.status,
        lane.label,
        lane.items,
        {
          note: skin === 'sprint' && total > 0
            ? `${sprintPoints(lane.items, sprint)}pt`
            : String(lane.items.length),
          tone: lane.status === 'done' ? 'good' : lane.status === 'doing' ? 'warn' : 'muted',
          value: skin === 'sprint'
            ? (item) => {
              const points = sprint.estimates[item.id]
              return points === undefined ? undefined : String(points)
            }
            : undefined,
        },
      )),
    }
  }

  if (skin === 'week') {
    const columns = weekColumns(items)
    return {
      kind: 'columns',
      eyebrow: eyebrow(countNote),
      columns: columns.map((dayItems, day) => column(
        WEEKDAY_LABELS[day]!,
        WEEKDAY_LABELS[day]!,
        dayItems,
        {
          note: dayItems.length > 0 ? String(dayItems.length) : undefined,
          tone: dayItems.length === 0 ? 'muted' : 'accent',
        },
      )),
    }
  }

  if (skin === 'matrix') {
    const quadrants = matrixQuadrants(items)
    return {
      kind: 'columns',
      wrap: 2,
      eyebrow: eyebrow(countNote),
      columns: quadrants.map((quadrant) => column(
        `q${quadrant.quadrant}`,
        quadrant.label,
        quadrant.items,
        {
          note: quadrant.items.length > 0 ? String(quadrant.items.length) : undefined,
          // The urgency the quadrant names is its colour: do-first burns,
          // drop goes quiet, and the two middles sit between them.
          tone: quadrant.quadrant === 0
            ? 'bad'
            : quadrant.quadrant === 1 ? 'accent' : quadrant.quadrant === 2 ? 'warn' : 'muted',
        },
      )),
    }
  }

  if (skin === 'timeline') {
    const { bars, totalUnits } = timelineReading(items)
    const visible = bars.slice(0, REST_LANE_LIMIT)
    return {
      kind: 'timeline',
      units: totalUnits,
      eyebrow: eyebrow(`${totalUnits} units`),
      lanes: visible.map(({ item, start, span }) => ({
        key: item.id,
        label: label(item, 'Phase'),
        start,
        span,
        done: item.done === true,
      })),
    }
  }

  if (skin === 'routine') {
    const routine = taskRoutineState(states.routine)
    const reading = routineReading(items)
    const visible = items.slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: eyebrow(`${routine.runs} ${routine.runs === 1 ? 'run' : 'runs'}`),
      meter: progress.total === 0 ? 0 : progress.done / progress.total,
      rows: visible.map((item, index) => taskRow(item, {
        lead: String(index + 1),
        value: item.done
          ? 'Done'
          : item.id === reading.currentId ? 'Do now' : 'Waiting',
        tone: item.done ? 'good' : item.id === reading.currentId ? 'accent' : 'muted',
      })),
      overflow: Math.max(0, items.length - visible.length),
    }
  }

  if (skin === 'day') {
    const ordered = dayOrder(items).slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: eyebrow(countNote),
      rows: ordered.map((item) => taskRow(item, {
        lead: formatTaskTime(taskTime(item.time)),
        label: label(item, 'What is happening'),
      })),
      overflow: Math.max(0, items.length - ordered.length),
    }
  }

  if (skin === 'assignments') {
    const ordered = assignmentOrder(items)
    const late = ordered.filter((item) => !item.done && dueReading(item.due).tone === 'overdue')
    const visible = ordered.slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: late.length > 0
        ? eyebrow(`${late.length} late`, 'bad')
        : eyebrow(countNote),
      rows: visible.map((item) => {
        const due = dueReading(item.due)
        return taskRow(item, {
          label: label(item, 'Assignment'),
          value: due.label,
          tone: item.done ? 'muted' : DUE_TONE[due.tone],
        })
      }),
      overflow: Math.max(0, ordered.length - visible.length),
    }
  }

  if (skin === 'shopping') {
    const shopping = taskShoppingState(states.shopping, items)
    const { pending, basket } = shoppingGroups(items)
    // Still-to-buy first, the basket underneath — the errand's own order.
    const ordered = [...pending, ...basket]
    const visible = ordered.slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: eyebrow(`${basket.length} in basket`),
      rows: visible.map((item) => {
        const quantity = shopping.quantities[item.id]
        return taskRow(item, {
          label: label(item, 'What to buy'),
          ...(quantity === undefined ? {} : { value: `×${quantity}` }),
        })
      }),
      overflow: Math.max(0, ordered.length - visible.length),
    }
  }

  if (skin === 'recurring') {
    const recurring = taskRecurringState(states.recurring, items)
    const visible = items.slice(0, REST_ROW_LIMIT)
    const repeating = Object.keys(recurring.rules).length
    return {
      kind: 'rows',
      eyebrow: eyebrow(`${repeating} repeating`),
      rows: visible.map((item) => {
        const rule = recurring.rules[item.id]
        const due = dueReading(item.due)
        return taskRow(item, {
          label: label(item, 'Something you repeat'),
          value: rule ? REPEAT_LABELS[rule] : 'Once',
          tone: rule ? DUE_TONE[due.tone] : 'muted',
        })
      }),
      overflow: Math.max(0, items.length - visible.length),
    }
  }

  if (skin === 'dependencies') {
    const dependencies = taskDependencyState(states.dependencies, items)
    const readings = dependencyReadings(items, dependencies)
    const blocked = readings.filter((reading) => reading.blocked).length
    const visible = readings.slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: blocked > 0
        ? eyebrow(`${blocked} blocked`, 'bad')
        : eyebrow('Nothing blocked'),
      rows: visible.map(({ item, blockedBy, blocked: isBlocked }) => taskRow(item, {
        // A blocked task shows what is holding it, not a padlock with no name.
        ...(blockedBy ? { value: compact(blockedBy.label?.trim() || 'earlier task', 14) } : {}),
        tone: isBlocked ? 'bad' : undefined,
      })),
      overflow: Math.max(0, readings.length - visible.length),
    }
  }

  if (skin === 'inbox') {
    // Newest first: what you just threw in is what you are still thinking about.
    const ordered = [...items].reverse()
    const visible = ordered.slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: eyebrow(`${progress.total - progress.done} to sort`),
      rows: visible.map((item) => taskRow(item, { label: label(item, 'Captured') })),
      overflow: Math.max(0, ordered.length - visible.length),
    }
  }

  const visible = items.slice(0, REST_ROW_LIMIT)
  return {
    kind: 'rows',
    eyebrow: eyebrow(countNote),
    meter: progress.total === 0 ? 0 : progress.done / progress.total,
    rows: visible.map((item) => taskRow(item)),
    overflow: Math.max(0, items.length - visible.length),
  }
}
