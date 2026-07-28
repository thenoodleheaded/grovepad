import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CanvasLmsFeed } from '../../../services/canvasLmsService'
import type { CanvasLmsSkin } from '../../../types/widgetDataEducation'
import { CanvasLmsBody, CanvasLmsWidget } from './CanvasLmsWidget'

const feed: CanvasLmsFeed = {
  syncedAt: 0,
  courses: [{
    id: '42',
    name: 'Interaction Design',
    code: 'DES 204',
    term: 'Fall 2026',
    score: 91.5,
    grade: 'A-',
    url: 'https://college.instructure.com/courses/42',
    color: '#e45b52',
  }],
  items: [{
    id: 'assignment:8',
    courseId: '42',
    courseName: 'Interaction Design',
    title: 'Prototype critique',
    dueAt: '2026-09-10T17:00:00Z',
    type: 'assignment',
    completed: false,
    submitted: true,
    pointsPossible: 25,
    score: null,
    url: 'https://college.instructure.com/courses/42/assignments/8',
    color: '#e45b52',
  }],
  announcements: [{
    id: '3',
    courseId: '42',
    courseName: 'Interaction Design',
    title: 'Studio moved',
    postedAt: '2026-09-01T10:00:00Z',
    excerpt: 'Meet in Room 210.',
    url: 'https://college.instructure.com/courses/42/discussion_topics/3',
    color: '#e45b52',
  }],
}

describe('College Canvas widget', () => {
  it('starts with a private device-local connection form', () => {
    const html = renderToStaticMarkup(<CanvasLmsWidget data={{ skin: 'overview' }} />)
    expect(html).toContain('Connect your college Canvas')
    expect(html).toContain('Personal access token')
    expect(html).toContain('never saved in the board')
  })

  it.each([
    ['overview', 'gp-canvas-lms-overview'],
    ['courses', 'gp-canvas-lms-courses'],
    ['assignments', 'gp-canvas-lms-assignments'],
    ['grades', 'gp-canvas-lms-grades'],
    ['announcements', 'gp-canvas-lms-announcements'],
  ] satisfies [CanvasLmsSkin, string][])('renders the %s skin as its own layout', (skin, className) => {
    const html = renderToStaticMarkup(<CanvasLmsBody skin={skin} feed={feed} />)
    expect(html).toContain(className)
    expect(html).toContain(`data-canvas-lms-skin="${skin}"`)
  })
})
