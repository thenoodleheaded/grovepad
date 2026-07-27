import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { HabitData, HabitSkinMode } from '../../../types/spatial'
import { HabitWidget } from './HabitWidget'

const SKINS: HabitSkinMode[] = [
  'week_grid',
  'month_heatmap',
  'chain',
  'scorecard',
  'routine_stack',
  'minimum_target',
  'flexible_frequency',
]

function render(skin: HabitSkinMode, patch: Partial<HabitData> = {}) {
  const data = {
    label: 'Morning pages',
    days: [true, true, false, true, false, false, false],
    streak: 3,
    skin,
    ...patch,
  } as HabitData
  return renderToStaticMarkup(<HabitWidget data={data} skin={skin} onChange={() => undefined} />)
}

describe('purpose-built Habit Tracker skins', () => {
  it.each([
    ['week_grid', 'gp-habit-week-grid'],
    ['month_heatmap', 'gp-habit-heatmap'],
    ['chain', 'gp-habit-chain'],
    ['scorecard', 'gp-habit-score-ring'],
    ['routine_stack', 'gp-habit-routine-list'],
    ['minimum_target', 'gp-habit-target-readout'],
    ['flexible_frequency', 'gp-habit-frequency-hero'],
  ] as const)('renders %s with its own anatomy', (skin, anatomy) => {
    expect(render(skin)).toContain(anatomy)
  })

  it.each(SKINS)('keeps the editable habit name in the %s skin', (skin) => {
    const markup = render(skin)
    expect(markup).toContain('value="Morning pages"')
    expect(markup).toContain('aria-label="Habit name"')
    expect(markup).toContain('gp-bare-field')
  })

  it.each(['week_grid', 'month_heatmap', 'chain', 'scorecard', 'flexible_frequency'] as HabitSkinMode[])(
    'exposes all seven canonical days in %s',
    (skin) => {
      const markup = render(skin)
      expect(markup.match(/role="checkbox"/g)).toHaveLength(7)
      expect(markup).toContain('Monday complete')
      expect(markup).toContain('Sunday not complete')
    },
  )

  it('keeps specialist controls clearly labelled', () => {
    const routine = render('routine_stack')
    expect(routine).toContain('aria-label="Wednesday routine"')
    expect(routine).toContain('aria-label="Routine step 1"')
    expect(routine).toContain('role="checkbox"')

    const target = render('minimum_target')
    expect(target).toContain('aria-label="Increase amount"')
    expect(target).toContain('>Minimum</span>')
    expect(target).toContain('>Ideal target</span>')
  })

  it('renders an honest score from the same seven completions', () => {
    const markup = render('scorecard')
    expect(markup).toContain('43<small>%</small>')
    expect(markup).toContain('<dd>3<small> days</small></dd>')
    expect(markup).toContain('<dd>2<small> days</small></dd>')
  })
})
