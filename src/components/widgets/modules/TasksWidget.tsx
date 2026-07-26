import {
  CalendarClock,
  CalendarDays,
  Check,
  CircleDashed,
  Clock3,
  Inbox,
  Link2,
  ListChecks,
  Lock,
  Minus,
  Plus,
  Repeat,
  RotateCcw,
  ShoppingCart,
  X,
} from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type { ChecklistData, ChecklistItem, ModuleData } from '../../../types/spatial'
import { localDayKey } from '../../../utils/localDate'
import { dataWithSkinState, skinStateFor } from '../../../utils/widgetSkins'
import { WidgetPanel } from '../WidgetPanel'
import { withoutPanelItem } from '../panelRemoval'
import { TaskSpatialSkin, type TaskSurface } from './TasksSpatialSkins'
import {
  assignmentOrder,
  dayOrder,
  dependencyReadings,
  dueReading,
  formatTaskTime,
  itemWithStatus,
  nextOccurrence,
  REPEAT_LABELS,
  REPEAT_ORDER,
  routineReading,
  shoppingGroups,
  taskDependencyState,
  taskProgress,
  taskRecurringState,
  taskRoutineState,
  taskShoppingState,
  taskSkin,
  taskSprintState,
  taskTime,
  type TaskRepeat,
  type TaskSkin,
  type TaskStatus,
} from './taskSkinModel'

interface TasksWidgetProps {
  data: ChecklistData
  onChange: (data: ChecklistData) => void
  onHeightChange?: (height: number) => void
  skin?: TaskSkin
}

const EYEBROWS: Record<TaskSkin, { label: string; icon: typeof ListChecks }> = {
  list: { label: 'Tasks', icon: ListChecks },
  inbox: { label: 'Inbox', icon: Inbox },
  shopping: { label: 'Shopping', icon: ShoppingCart },
  assignments: { label: 'Assignments', icon: CalendarClock },
  day: { label: 'Today', icon: Clock3 },
  week: { label: 'This week', icon: CalendarDays },
  board: { label: 'Board', icon: ListChecks },
  timeline: { label: 'Timeline', icon: CalendarDays },
  matrix: { label: 'Priorities', icon: ListChecks },
  recurring: { label: 'Recurring', icon: Repeat },
  sprint: { label: 'Sprint', icon: ListChecks },
  dependencies: { label: 'Dependencies', icon: Link2 },
  routine: { label: 'Routine', icon: RotateCcw },
}

const ADD_LABELS: Partial<Record<TaskSkin, string>> = {
  inbox: 'Capture',
  shopping: 'Add item',
  assignments: 'Add assignment',
  week: 'Add to Monday',
  board: 'Add to To do',
  timeline: 'Add phase',
  matrix: 'Add priority',
  routine: 'Add step',
}

/**
 * Every Tasks skin, dispatched from one card.
 *
 * The skins share a single task collection and a single completion truth, so
 * checking something in Board leaves it checked in List. What differs is the
 * arrangement — a queue, an errand, a deadline ledger, a day, a board — and,
 * for the four schema-extension skins, a small isolated slot of settings that
 * only that skin reads.
 */
export function TasksWidget({
  data,
  onChange,
  onHeightChange,
  skin: requestedSkin,
}: TasksWidgetProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRefs = useRef(new Map<string, HTMLInputElement>())
  const pendingFocusId = useRef<string | null>(null)
  const [removingIds, setRemovingIds] = useState<ReadonlySet<string>>(new Set())

  const skin = requestedSkin ?? taskSkin(data.mode)
  const items = data.items
  const progress = taskProgress(items)

  const shopping = taskShoppingState(skinStateFor(data, 'shopping'), items)
  const recurring = taskRecurringState(skinStateFor(data, 'recurring'), items)
  const sprint = taskSprintState(skinStateFor(data, 'sprint'), items)
  const dependencies = taskDependencyState(skinStateFor(data, 'dependencies'), items)
  const routine = taskRoutineState(skinStateFor(data, 'routine'))

  useEffect(() => {
    if (pendingFocusId.current === null) return
    inputRefs.current.get(pendingFocusId.current)?.focus()
    pendingFocusId.current = null
  })

  useLayoutEffect(() => {
    if (rootRef.current) onHeightChange?.(rootRef.current.scrollHeight)
  }, [data, onHeightChange, removingIds, skin])

  /** Every write spreads the card's own data, so the worn skin and every other
   *  skin's saved settings survive an edit made from any one of them. */
  const commit = (nextItems: ChecklistItem[] = items) => {
    onChange({ ...data, items: nextItems, mode: skin })
  }

  const commitState = (
    value: TaskSkin,
    state: Record<string, unknown>,
    nextItems: ChecklistItem[] = items,
  ) => {
    onChange(dataWithSkinState(
      { ...data, items: nextItems, mode: skin } as ModuleData,
      value,
      state,
    ) as ChecklistData)
  }

  const patchItem = (id: string, patch: Partial<ChecklistItem>) =>
    items.map((item) => (item.id === id ? { ...item, ...patch } : item))

  const setLabel = (id: string, label: string) => commit(patchItem(id, { label }))

  const setStatus = (id: string, status: TaskStatus) =>
    commit(items.map((item) => (item.id === id ? itemWithStatus(item, status) : item)))

  /**
   * Ticking a repeating task does not finish it — it schedules the next one.
   * The task stays open with a new due date and the run is recorded, which is
   * the whole reason someone chose Recurring over List.
   */
  const toggle = (id: string) => {
    const item = items.find((candidate) => candidate.id === id)
    if (!item) return
    const rule = recurring.rules[id]
    if (skin === 'recurring' && rule && !item.done) {
      const today = localDayKey()
      const base = dueReading(item.due).key || today
      commitState('recurring', {
        ...recurring,
        lastDone: { ...recurring.lastDone, [id]: today },
      }, patchItem(id, { done: false, status: 'todo', due: nextOccurrence(base, rule) }))
      return
    }
    setStatus(id, item.done ? 'todo' : 'done')
  }

  const beginRemove = (id: string) => {
    setRemovingIds((previous) => new Set(previous).add(id))
  }

  const finishRemove = (id: string) => {
    setRemovingIds((previous) => {
      if (!previous.has(id)) return previous
      const next = new Set(previous)
      next.delete(id)
      return next
    })
    commit(withoutPanelItem(items, id))
  }

  const addTask = (patch: Partial<ChecklistItem> = {}, at = items.length) => {
    const task: ChecklistItem = {
      id: crypto.randomUUID(),
      label: '',
      done: false,
      status: 'todo',
      ...patch,
    }
    const next = [...items]
    next.splice(Math.max(0, Math.min(next.length, at)), 0, task)
    pendingFocusId.current = task.id
    commit(next)
  }

  const onRowKeyDown = (event: KeyboardEvent<HTMLInputElement>, item: ChecklistItem) => {
    const index = items.findIndex((candidate) => candidate.id === item.id)
    if (index < 0) return
    if (event.key === 'Enter') {
      event.preventDefault()
      // A new row belongs to the same day, quadrant, or column as the one it
      // grew from, or it would vanish out of the view that created it.
      addTask({
        day: item.day,
        quadrant: item.quadrant,
        status: item.status === 'done' ? 'todo' : item.status,
        due: skin === 'assignments' || skin === 'day' ? item.due : undefined,
        time: skin === 'day' ? item.time : undefined,
      }, index + 1)
    } else if (event.key === 'Backspace' && item.label === '' && items.length > 1) {
      event.preventDefault()
      const neighbor = items[index - 1] ?? items[index + 1]
      if (neighbor) pendingFocusId.current = neighbor.id
      beginRemove(item.id)
    }
  }

  const registerInput = (id: string) => (element: HTMLInputElement | null) => {
    if (element) inputRefs.current.set(id, element)
    else inputRefs.current.delete(id)
  }

  const taskInput = (item: ChecklistItem, placeholder = 'Task  ↵ adds another') => (
    <input
      ref={registerInput(item.id)}
      value={item.label}
      placeholder={placeholder}
      aria-label={item.label.trim() || 'Untitled task'}
      onChange={(event) => setLabel(item.id, event.target.value)}
      onKeyDown={(event) => onRowKeyDown(event, item)}
      className="gp-task-input"
    />
  )

  const check = (item: ChecklistItem, shape: 'circle' | 'square' = 'circle') => (
    <button
      type="button"
      role="checkbox"
      aria-checked={item.done}
      aria-label={`${item.done ? 'Reopen' : 'Complete'} ${item.label.trim() || 'untitled task'}`}
      onClick={() => toggle(item.id)}
      className="gp-task-check"
      data-shape={shape}
    >
      <Check size={shape === 'square' ? 12 : 10} strokeWidth={3} aria-hidden />
    </button>
  )

  const removeButton = (item: ChecklistItem) => items.length > 1 && (
    <button
      type="button"
      aria-label={`Remove ${item.label.trim() || 'untitled task'}`}
      onClick={() => beginRemove(item.id)}
      className="gp-task-remove"
    >
      <X size={11} aria-hidden />
    </button>
  )

  const row = (
    item: ChecklistItem,
    parts: {
      leading?: ReactNode
      trailing?: ReactNode
      className?: string
      placeholder?: string
      style?: CSSProperties
    } = {},
  ) => (
    <WidgetPanel
      key={item.id}
      removing={removingIds.has(item.id)}
      onExitComplete={() => finishRemove(item.id)}
      floor="controls"
      grip={false}
      className={`gp-task-row ${item.done ? 'gp-task-done' : ''} ${parts.className ?? ''}`}
      style={parts.style}
    >
      {parts.leading ?? check(item)}
      {taskInput(item, parts.placeholder)}
      {parts.trailing}
      {removeButton(item)}
    </WidgetPanel>
  )

  const surface: TaskSurface = {
    items,
    sprint,
    removingIds,
    taskInput,
    check,
    removeButton,
    onFinishRemove: finishRemove,
    onBeginRemove: beginRemove,
    onStatus: setStatus,
    onToggle: toggle,
    onPatch: (id, patch) => commit(patchItem(id, patch)),
    onAdd: addTask,
    onSprint: (state) => commitState('sprint', { ...state }),
  }

  const Eyebrow = EYEBROWS[skin].icon
  const heading = (right?: ReactNode) => (
    <header className="gp-tasks-heading">
      <span><Eyebrow size={12} aria-hidden /> {EYEBROWS[skin].label}</span>
      {right ?? (
        <small aria-label={`${progress.done} of ${progress.total} done`}>
          {progress.done}/{progress.total}
        </small>
      )}
    </header>
  )

  const meter = (
    <div className="gp-task-meter" aria-hidden>
      <span style={{ width: `${progress.percent}%` }} />
    </div>
  )

  let content: ReactNode

  if (skin === 'inbox') {
    // A capture queue is read newest first: what you just threw in is what you
    // are still thinking about. The list itself keeps its own order.
    content = (
      <>
        {heading(<small>{progress.total - progress.done} to sort</small>)}
        <div className="gp-task-ledger">
          {[...items].reverse().map((item) => row(item, {
            placeholder: 'Capture a thought  ↵ adds another',
            leading: item.done
              ? check(item)
              : (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={false}
                  aria-label={`Complete ${item.label.trim() || 'untitled task'}`}
                  onClick={() => toggle(item.id)}
                  className="gp-task-check"
                  data-shape="circle"
                >
                  <CircleDashed size={12} aria-hidden />
                </button>
              ),
          }))}
        </div>
      </>
    )
  } else if (skin === 'shopping') {
    const { pending, basket } = shoppingGroups(items)
    const stepper = (item: ChecklistItem) => {
      const quantity = shopping.quantities[item.id] ?? 1
      const setQuantity = (next: number) => commitState('shopping', {
        ...shopping,
        quantities: { ...shopping.quantities, [item.id]: Math.min(99, Math.max(1, next)) },
      })
      return (
        <span className="gp-task-stepper">
          <button
            type="button"
            aria-label={`Fewer ${item.label.trim() || 'items'}`}
            disabled={quantity <= 1}
            onClick={() => setQuantity(quantity - 1)}
          >
            <Minus size={10} aria-hidden />
          </button>
          <output aria-label={`Quantity ${quantity}`}>{quantity}</output>
          <button
            type="button"
            aria-label={`More ${item.label.trim() || 'items'}`}
            onClick={() => setQuantity(quantity + 1)}
          >
            <Plus size={10} aria-hidden />
          </button>
        </span>
      )
    }
    content = (
      <>
        {heading(<small>{basket.length} in basket</small>)}
        <div className="gp-task-ledger gp-task-ledger-roomy">
          {pending.map((item) => row(item, {
            className: 'gp-task-row-large',
            placeholder: 'What to buy',
            leading: check(item, 'square'),
            trailing: stepper(item),
          }))}
          {pending.length === 0 && (
            <p className="gp-tasks-empty">Everything on the list is in the basket.</p>
          )}
        </div>
        {basket.length > 0 && (
          <section className="gp-task-basket" aria-label="In the basket">
            <h3>In the basket</h3>
            <div className="gp-task-ledger">
              {basket.map((item) => row(item, {
                className: 'gp-task-row-large',
                placeholder: 'What to buy',
                leading: check(item, 'square'),
                trailing: stepper(item),
              }))}
            </div>
          </section>
        )}
      </>
    )
  } else if (skin === 'assignments') {
    const ordered = assignmentOrder(items)
    const overdue = ordered.filter((item) => !item.done && dueReading(item.due).tone === 'overdue')
    content = (
      <>
        {heading(overdue.length > 0
          ? <small data-tone="overdue">{overdue.length} late</small>
          : undefined)}
        <div className="gp-task-ledger">
          {ordered.map((item) => {
            const due = dueReading(item.due)
            return row(item, {
              placeholder: 'Assignment',
              trailing: (
                <span className="gp-task-due" data-tone={item.done ? 'none' : due.tone}>
                  <CalendarClock size={10} aria-hidden />
                  <span>{due.label}</span>
                  <input
                    type="date"
                    value={due.key}
                    aria-label={`Due date for ${item.label.trim() || 'untitled task'}`}
                    onChange={(event) => commit(patchItem(item.id, { due: event.target.value }))}
                  />
                </span>
              ),
            })
          })}
        </div>
      </>
    )
  } else if (skin === 'day') {
    const ordered = dayOrder(items)
    content = (
      <>
        {heading(<small>{progress.done}/{progress.total}</small>)}
        <div className="gp-task-agenda">
          {ordered.map((item) => row(item, {
            className: 'gp-task-row-agenda',
            placeholder: 'What is happening',
            leading: (
              <span className="gp-task-slot">
                <time dateTime={taskTime(item.time)}>{formatTaskTime(taskTime(item.time))}</time>
                <input
                  type="time"
                  value={taskTime(item.time)}
                  aria-label={`Time for ${item.label.trim() || 'untitled task'}`}
                  onChange={(event) => commit(patchItem(item.id, { time: event.target.value }))}
                />
                <span className="gp-task-slot-dot" aria-hidden />
              </span>
            ),
            trailing: check(item),
          }))}
        </div>
      </>
    )
  } else if (skin === 'recurring') {
    content = (
      <>
        {heading(<small>{Object.keys(recurring.rules).length} repeating</small>)}
        <div className="gp-task-ledger">
          {items.map((item) => {
            const rule = recurring.rules[item.id]
            const due = dueReading(item.due)
            const cycle = () => {
              const index = rule ? REPEAT_ORDER.indexOf(rule) + 1 : 0
              const next = REPEAT_ORDER[index] as TaskRepeat | undefined
              const rules = { ...recurring.rules }
              if (next) rules[item.id] = next
              else delete rules[item.id]
              commitState('recurring', { ...recurring, rules })
            }
            return row(item, {
              placeholder: 'Something you repeat',
              trailing: (
                <span className="gp-task-repeat-group">
                  {rule && (
                    <span className="gp-task-due" data-tone={due.tone}>
                      <span>{due.label}</span>
                    </span>
                  )}
                  <button
                    type="button"
                    className="gp-task-repeat"
                    data-active={Boolean(rule) || undefined}
                    aria-label={`Repeat for ${item.label.trim() || 'untitled task'}: ${rule ? REPEAT_LABELS[rule] : 'never'}`}
                    onClick={cycle}
                  >
                    <Repeat size={10} aria-hidden />
                    {rule ? REPEAT_LABELS[rule] : 'Once'}
                  </button>
                </span>
              ),
            })
          })}
        </div>
        <p className="gp-tasks-note">
          Ticking a repeating task schedules the next one instead of closing it.
        </p>
      </>
    )
  } else if (skin === 'dependencies') {
    const readings = dependencyReadings(items, dependencies)
    const blocked = readings.filter((reading) => reading.blocked).length
    content = (
      <>
        {heading(blocked > 0
          ? <small data-tone="overdue">{blocked} blocked</small>
          : <small>Nothing blocked</small>)}
        <div className="gp-task-ledger">
          {readings.map(({ item, blockedBy, blocked: isBlocked }) => row(item, {
            className: isBlocked ? 'gp-task-row-blocked' : '',
            placeholder: 'Task',
            leading: isBlocked
              ? (
                <span className="gp-task-lock" title={`Blocked by ${blockedBy?.label || 'an earlier task'}`}>
                  <Lock size={11} aria-hidden />
                </span>
              )
              : check(item),
            trailing: (
              <label className="gp-task-blocker">
                <Link2 size={10} aria-hidden />
                <select
                  value={dependencies.blockedBy[item.id] ?? ''}
                  aria-label={`Blocker for ${item.label.trim() || 'untitled task'}`}
                  onChange={(event) => {
                    const blockedByMap = { ...dependencies.blockedBy }
                    if (event.target.value) blockedByMap[item.id] = event.target.value
                    else delete blockedByMap[item.id]
                    commitState('dependencies', { blockedBy: blockedByMap })
                  }}
                >
                  <option value="">No blocker</option>
                  {items
                    .filter((candidate) => candidate.id !== item.id)
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.label.trim() || 'Untitled task'}
                      </option>
                    ))}
                </select>
              </label>
            ),
          }))}
        </div>
      </>
    )
  } else if (skin === 'routine') {
    const reading = routineReading(items)
    const finishRun = () => commitState(
      'routine',
      { runs: routine.runs + 1, lastRunAt: new Date().toISOString() },
      items.map((item) => ({ ...item, done: false, status: 'todo' as const })),
    )
    content = (
      <>
        {heading(
          <small>
            {routine.runs} {routine.runs === 1 ? 'run' : 'runs'}
          </small>,
        )}
        {meter}
        <div className="gp-task-ledger">
          {items.map((item, index) => row(item, {
            className: 'gp-task-row-step',
            placeholder: 'Step',
            style: { '--gp-task-step': index + 1 } as CSSProperties,
            leading: (
              <span className="gp-task-step-marker" data-current={item.id === reading.currentId || undefined}>
                {item.done ? <Check size={10} strokeWidth={3} aria-hidden /> : index + 1}
              </span>
            ),
            trailing: (
              <button
                type="button"
                className="gp-task-step-toggle"
                aria-label={`${item.done ? 'Reopen' : 'Complete'} step ${index + 1}`}
                onClick={() => toggle(item.id)}
              >
                {item.done ? 'Done' : item.id === reading.currentId ? 'Do now' : 'Waiting'}
              </button>
            ),
          }))}
        </div>
        <footer className="gp-task-runbar">
          <span>
            {reading.finished
              ? 'Every step is done.'
              : `Step ${Math.min(reading.completed + 1, reading.total)} of ${reading.total}`}
          </span>
          <button type="button" onClick={finishRun} disabled={reading.completed === 0}>
            <RotateCcw size={11} aria-hidden />
            Start a new run
          </button>
        </footer>
      </>
    )
  } else if (skin !== 'list') {
    content = (
      <TaskSpatialSkin
        skin={skin}
        surface={surface}
        heading={heading}
      />
    )
  } else {
    content = (
      <>
        {heading()}
        {meter}
        <div className="gp-task-ledger">
          {items.map((item) => row(item))}
        </div>
      </>
    )
  }

  return (
    <div ref={rootRef} className="gp-tasks-skin" data-tasks-skin={skin}>
      {content}
      <button
        type="button"
        className="gp-task-add"
        onClick={() => addTask(
          skin === 'inbox'
            ? {}
            : { day: 0, quadrant: 0, time: '09:00', due: skin === 'day' ? localDayKey() : undefined },
        )}
      >
        <Plus size={11} aria-hidden />
        {ADD_LABELS[skin] ?? 'Add task'}
      </button>
    </div>
  )
}
