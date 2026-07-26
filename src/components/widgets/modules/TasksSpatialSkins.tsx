import {
  ChevronLeft,
  ChevronRight,
  Minus,
  MoveRight,
  Plus,
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import type { ChecklistItem } from '../../../types/spatial'
import { WidgetPanel } from '../WidgetPanel'
import {
  boardColumns,
  matrixQuadrants,
  ownerInitials,
  sprintPoints,
  taskQuadrant,
  taskStatus,
  timelineReading,
  WEEKDAY_LABELS,
  weekColumns,
  type TaskSkin,
  type TaskSprintState,
  type TaskStatus,
} from './taskSkinModel'

/**
 * Everything a two-dimensional Tasks skin needs from the card, handed over as
 * one object. These skins arrange the same task collection across columns,
 * days, spans, or quadrants; they never own it, and every write goes back
 * through the card so completion, undo, and persistence stay in one place.
 */
export interface TaskSurface {
  items: ChecklistItem[]
  sprint: TaskSprintState
  removingIds: ReadonlySet<string>
  taskInput: (item: ChecklistItem, placeholder?: string) => ReactNode
  check: (item: ChecklistItem, shape?: 'circle' | 'square') => ReactNode
  removeButton: (item: ChecklistItem) => ReactNode
  onFinishRemove: (id: string) => void
  onBeginRemove: (id: string) => void
  onStatus: (id: string, status: TaskStatus) => void
  onToggle: (id: string) => void
  onPatch: (id: string, patch: Partial<ChecklistItem>) => void
  onAdd: (patch?: Partial<ChecklistItem>, at?: number) => void
  onSprint: (state: TaskSprintState) => void
}

interface TaskSpatialSkinProps {
  skin: TaskSkin
  surface: TaskSurface
  heading: (right?: ReactNode) => ReactNode
}

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  todo: 'doing',
  doing: 'done',
  done: 'todo',
}

export function TaskSpatialSkin({ skin, surface, heading }: TaskSpatialSkinProps) {
  const card = (
    item: ChecklistItem,
    parts: { leading?: ReactNode; trailing?: ReactNode; className?: string; placeholder?: string },
  ) => (
    <WidgetPanel
      key={item.id}
      removing={surface.removingIds.has(item.id)}
      onExitComplete={() => surface.onFinishRemove(item.id)}
      floor="controls"
      grip={false}
      className={`gp-task-card ${item.done ? 'gp-task-done' : ''} ${parts.className ?? ''}`}
    >
      {parts.leading}
      {surface.taskInput(item, parts.placeholder)}
      {parts.trailing}
      {surface.removeButton(item)}
    </WidgetPanel>
  )

  if (skin === 'board' || skin === 'sprint') {
    const columns = boardColumns(surface.items)
    const isSprint = skin === 'sprint'
    const total = sprintPoints(surface.items, surface.sprint)
    return (
      <>
        {heading(isSprint
          ? (
            <input
              className="gp-task-sprint-name"
              value={surface.sprint.name}
              placeholder="Sprint name"
              aria-label="Sprint name"
              onChange={(event) => surface.onSprint({ ...surface.sprint, name: event.target.value })}
            />
          )
          : undefined)}
        <div className="gp-task-board" data-columns={columns.length}>
          {columns.map((column) => {
            const points = sprintPoints(column.items, surface.sprint)
            return (
              <section key={column.status} className="gp-task-column" data-status={column.status}>
                <header>
                  <span>{column.label}</span>
                  <small>
                    {isSprint && total > 0 ? `${points} pt` : column.items.length}
                  </small>
                </header>
                <div className="gp-task-column-body">
                  {column.items.map((item) => card(item, {
                    placeholder: isSprint ? 'Story' : 'Card',
                    leading: (
                      <button
                        type="button"
                        className="gp-task-status-dot"
                        data-status={taskStatus(item)}
                        aria-label={`Move ${item.label.trim() || 'untitled task'} to ${NEXT_STATUS[taskStatus(item)]}`}
                        onClick={() => surface.onStatus(item.id, NEXT_STATUS[taskStatus(item)])}
                      />
                    ),
                    trailing: isSprint ? (
                      <span className="gp-task-sprint-meta">
                        <label className="gp-task-owner" title="Owner">
                          <span aria-hidden>{ownerInitials(surface.sprint.owners[item.id] ?? '')}</span>
                          <input
                            value={surface.sprint.owners[item.id] ?? ''}
                            placeholder="Owner"
                            aria-label={`Owner of ${item.label.trim() || 'untitled task'}`}
                            onChange={(event) => surface.onSprint({
                              ...surface.sprint,
                              owners: { ...surface.sprint.owners, [item.id]: event.target.value },
                            })}
                          />
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={99}
                          className="gp-task-points"
                          value={surface.sprint.estimates[item.id] ?? ''}
                          placeholder="—"
                          aria-label={`Estimate for ${item.label.trim() || 'untitled task'}`}
                          onChange={(event) => surface.onSprint({
                            ...surface.sprint,
                            estimates: {
                              ...surface.sprint.estimates,
                              [item.id]: Number(event.target.value),
                            },
                          })}
                        />
                      </span>
                    ) : undefined,
                  }))}
                  <button
                    type="button"
                    className="gp-task-column-add"
                    aria-label={`Add a task to ${column.label}`}
                    onClick={() => surface.onAdd({ status: column.status, done: column.status === 'done' })}
                  >
                    <Plus size={11} aria-hidden />
                  </button>
                </div>
              </section>
            )
          })}
        </div>
      </>
    )
  }

  if (skin === 'week') {
    const columns = weekColumns(surface.items)
    return (
      <>
        {heading()}
        <div className="gp-task-week">
          {columns.map((dayItems, day) => (
            <section key={WEEKDAY_LABELS[day]} className="gp-task-day-column">
              <header>
                <span>{WEEKDAY_LABELS[day]}</span>
                {dayItems.length > 0 && <small>{dayItems.filter((item) => item.done).length}/{dayItems.length}</small>}
              </header>
              <div className="gp-task-column-body">
                {dayItems.map((item) => card(item, {
                  placeholder: 'Task',
                  leading: surface.check(item),
                }))}
                <button
                  type="button"
                  className="gp-task-column-add"
                  aria-label={`Add a task to ${WEEKDAY_LABELS[day]}`}
                  onClick={() => surface.onAdd({ day })}
                >
                  <Plus size={11} aria-hidden />
                </button>
              </div>
            </section>
          ))}
        </div>
      </>
    )
  }

  if (skin === 'timeline') {
    const { bars, totalUnits } = timelineReading(surface.items)
    return (
      <>
        {heading(<small>{totalUnits} units</small>)}
        <div className="gp-task-timeline" style={{ '--gp-task-units': totalUnits } as CSSProperties}>
          <div className="gp-task-timeline-scale" aria-hidden>
            {Array.from({ length: totalUnits }, (_, unit) => <span key={unit}>{unit + 1}</span>)}
          </div>
          {bars.map(({ item, start, span }) => (
            <WidgetPanel
              key={item.id}
              removing={surface.removingIds.has(item.id)}
              onExitComplete={() => surface.onFinishRemove(item.id)}
              floor="controls"
              grip={false}
              className={`gp-task-phase ${item.done ? 'gp-task-done' : ''}`}
            >
              <span className="gp-task-phase-label">
                {surface.check(item)}
                {surface.taskInput(item, 'Phase')}
                {surface.removeButton(item)}
              </span>
              <span className="gp-task-phase-track">
                <span
                  className="gp-task-phase-bar"
                  style={{ '--gp-task-start': start, '--gp-task-span': span } as CSSProperties}
                >
                  <button
                    type="button"
                    aria-label={`Start ${item.label.trim() || 'phase'} earlier`}
                    disabled={start === 0}
                    onClick={() => surface.onPatch(item.id, { start: start - 1 })}
                  >
                    <ChevronLeft size={10} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Start ${item.label.trim() || 'phase'} later`}
                    onClick={() => surface.onPatch(item.id, { start: start + 1 })}
                  >
                    <ChevronRight size={10} aria-hidden />
                  </button>
                  <span className="gp-task-phase-span">
                    <button
                      type="button"
                      aria-label={`Shorten ${item.label.trim() || 'phase'}`}
                      disabled={span <= 1}
                      onClick={() => surface.onPatch(item.id, { span: span - 1 })}
                    >
                      <Minus size={10} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Lengthen ${item.label.trim() || 'phase'}`}
                      onClick={() => surface.onPatch(item.id, { span: span + 1 })}
                    >
                      <Plus size={10} aria-hidden />
                    </button>
                  </span>
                </span>
              </span>
            </WidgetPanel>
          ))}
        </div>
      </>
    )
  }

  const quadrants = matrixQuadrants(surface.items)
  return (
    <>
      {heading()}
      <div className="gp-task-matrix">
        {quadrants.map((quadrant) => (
          <section
            key={quadrant.quadrant}
            className="gp-task-quadrant"
            data-quadrant={quadrant.quadrant}
          >
            <header>
              <span>{quadrant.label}</span>
              <small>{quadrant.hint}</small>
            </header>
            <div className="gp-task-column-body">
              {quadrant.items.map((item) => card(item, {
                placeholder: 'Priority',
                leading: surface.check(item),
                trailing: (
                  <button
                    type="button"
                    className="gp-task-move"
                    aria-label={`Move ${item.label.trim() || 'untitled task'} to the next quadrant`}
                    onClick={() => surface.onPatch(item.id, {
                      quadrant: (((taskQuadrant(item.quadrant) + 1) % 4) as 0 | 1 | 2 | 3),
                    })}
                  >
                    <MoveRight size={10} aria-hidden />
                  </button>
                ),
              }))}
              <button
                type="button"
                className="gp-task-column-add"
                aria-label={`Add a task to ${quadrant.label}`}
                onClick={() => surface.onAdd({ quadrant: quadrant.quadrant })}
              >
                <Plus size={11} aria-hidden />
              </button>
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
