import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { GradeCalcData } from '../../../types/spatial'
import { GradeCalcWidget } from './GradeCalcWidget'
import type { GradeSkinMode } from './gradeSkinModel'

const SKINS: readonly GradeSkinMode[] = [
  'weighted',
  'gpa',
  'pass_fail',
  'what_if',
  'rubric',
  'dropped_scores',
  'curve_simulator',
]

const data: GradeCalcData = {
  mode: 'weighted',
  components: [
    { id: 'exam', name: 'Exam', score: 82, weight: 60 },
    { id: 'project', name: 'Project', score: 94, weight: 40 },
  ],
  gpa: {
    courses: [
      { id: 'math', name: 'Mathematics', credits: 3, points: 4 },
      { id: 'art', name: 'Studio Art', credits: 2, points: 3.7 },
    ],
  },
  skinStates: {
    pass_fail: { threshold: 70 },
    what_if: { componentId: 'exam', score: 90 },
    dropped_scores: { count: 1 },
    curve_simulator: { points: 5 },
  },
}

function render(skin: GradeSkinMode) {
  return renderToStaticMarkup(
    <GradeCalcWidget data={{ ...data, mode: skin }} skin={skin} onChange={() => undefined} />,
  )
}

describe('purpose-built Grades skins', () => {
  it.each([
    ['weighted', 'gp-grades--weighted'],
    ['gpa', 'gp-grades--gpa'],
    ['pass_fail', 'gp-grades--pass-fail'],
    ['what_if', 'gp-grades--what-if'],
    ['rubric', 'gp-grades--rubric'],
    ['dropped_scores', 'gp-grades--dropped'],
    ['curve_simulator', 'gp-grades--curve'],
  ] as const)('renders %s with its own visual anatomy', (skin, className) => {
    expect(render(skin)).toContain(className)
  })

  it('shows distinct, useful readings for every scenario', () => {
    expect(render('weighted')).toContain('86.8')
    expect(render('gpa')).toContain('3.88')
    expect(render('pass_fail')).toContain('Passing')
    expect(render('what_if')).toContain('91.6')
    expect(render('rubric')).toContain('Rubric score')
    expect(render('dropped_scores')).toContain('94.0')
    expect(render('curve_simulator')).toContain('91.8')
  })

  it.each(SKINS)('keeps every %s input on the card backplate', (skin) => {
    const markup = render(skin)
    let cursor = markup.indexOf('<input')
    while (cursor !== -1) {
      const prefix = markup.slice(0, cursor)
      const open = Math.max(prefix.lastIndexOf('<div'), prefix.lastIndexOf('<label'))
      const openTag = prefix.slice(open, prefix.indexOf('>', open) + 1)
      expect(openTag, `${skin} input wrapper`).toContain('gp-bare-field')
      cursor = markup.indexOf('<input', cursor + 1)
    }
  })

  it('keeps the input-free drop policy operable with named buttons', () => {
    const markup = render('dropped_scores')
    expect(markup).toContain('aria-label="Drop fewer scores"')
    expect(markup).toContain('aria-label="Drop more scores"')
  })

  it('keeps destructive row actions available to keyboard and touch users', () => {
    const markup = render('weighted')
    expect(markup).toContain('aria-label="Remove Exam"')
    expect(markup).not.toContain('pointer-events-none')
  })
})
