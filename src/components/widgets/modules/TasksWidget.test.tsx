import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ChecklistData } from '../../../types/spatial'
import { TasksWidget } from './TasksWidget'
import type { TaskSkin } from './taskSkinModel'

const base: ChecklistData = {
  items: [
    { id: 'one', label: 'Draft the release notes', done: false, status: 'doing', due: '2026-07-22', day: 0, time: '09:00', start: 0, span: 2, quadrant: 0 },
    { id: 'two', label: 'Fix the seam banding', done: true, status: 'done', due: '2026-07-28', day: 2, time: '14:00', start: 2, span: 1, quadrant: 1 },
  ],
  mode: 'list',
}

function render(skin: TaskSkin, data: ChecklistData = base): string {
  return renderToStaticMarkup(
    <TasksWidget data={{ ...data, mode: skin }} skin={skin} onChange={() => undefined} />,
  )
}

describe('purpose-built Tasks skins', () => {
  it.each([
    ['list', 'gp-task-ledger'],
    ['inbox', 'gp-task-ledger'],
    ['shopping', 'gp-task-stepper'],
    ['assignments', 'gp-task-due'],
    ['day', 'gp-task-slot'],
    ['week', 'gp-task-week'],
    ['board', 'gp-task-board'],
    ['timeline', 'gp-task-timeline'],
    ['matrix', 'gp-task-matrix'],
    ['recurring', 'gp-task-repeat'],
    ['sprint', 'gp-task-sprint-meta'],
    ['dependencies', 'gp-task-blocker'],
    ['routine', 'gp-task-step-marker'],
  ] as const)('renders the %s arrangement with its own anatomy', (skin, className) => {
    const markup = render(skin)
    expect(markup).toContain(`data-tasks-skin="${skin}"`)
    expect(markup).toContain(className)
    // Whatever the arrangement, both tasks stay on screen and the finished one
    // still reads as finished.
    expect(markup).toContain('Draft the release notes')
    expect(markup).toContain('Fix the seam banding')
    expect(markup).toContain('gp-task-done')
  })

  it('reads specialist settings out of each skin"s own isolated slot', () => {
    const data: ChecklistData = {
      ...base,
      skinStates: {
        shopping: { quantities: { one: 4 } },
        recurring: { rules: { one: 'weekly' }, lastDone: {} },
        sprint: { name: 'Sprint 14', owners: { one: 'Rae Lin' }, estimates: { one: 5 } },
        dependencies: { blockedBy: { two: 'one' } },
        routine: { runs: 12, lastRunAt: '2026-07-24T08:00:00.000Z' },
      },
    }
    expect(render('shopping', data)).toContain('Quantity 4')
    expect(render('recurring', data)).toContain('Every week')
    const sprint = render('sprint', data)
    expect(sprint).toContain('Sprint 14')
    expect(sprint).toContain('RL')
    expect(render('dependencies', data)).toContain('gp-task-row-blocked')
    expect(render('routine', data)).toContain('12 runs')
  })

  it('leaves a blocked task locked while its blocker is open, and frees it once done', () => {
    const blocked: ChecklistData = {
      items: [
        { id: 'one', label: 'Blocker', done: false },
        { id: 'two', label: 'Waiting', done: false },
      ],
      mode: 'dependencies',
      skinStates: { dependencies: { blockedBy: { two: 'one' } } },
    }
    expect(render('dependencies', blocked)).toContain('Blocked by Blocker')

    const freed: ChecklistData = {
      ...blocked,
      items: blocked.items.map((item) => (item.id === 'one' ? { ...item, done: true } : item)),
    }
    expect(render('dependencies', freed)).not.toContain('gp-task-row-blocked')
  })

  it('shows the errand"s basket separately from what is still to buy', () => {
    const markup = render('shopping')
    expect(markup).toContain('In the basket')
    expect(markup).toContain('1 in basket')
  })
})
