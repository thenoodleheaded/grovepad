import { describe, expect, it } from 'vitest'
import type { CanvasLmsFeed } from '../../../services/canvasLmsService'
import {
  activeCanvasItems,
  canvasLmsSkin,
  canvasSubmissionLabel,
} from './canvasLmsModel'

const feed: CanvasLmsFeed = {
  courses: [],
  announcements: [],
  syncedAt: 0,
  items: [
    {
      id: 'later',
      courseId: '1',
      courseName: 'Course',
      title: 'Later',
      dueAt: '2026-10-03T12:00:00Z',
      type: 'assignment',
      completed: false,
      submitted: false,
      pointsPossible: null,
      score: null,
      url: null,
      color: '#fff',
    },
    {
      id: 'done',
      courseId: '1',
      courseName: 'Course',
      title: 'Done',
      dueAt: '2026-09-01T12:00:00Z',
      type: 'assignment',
      completed: true,
      submitted: true,
      pointsPossible: 10,
      score: 9,
      url: null,
      color: '#fff',
    },
    {
      id: 'first',
      courseId: '1',
      courseName: 'Course',
      title: 'First',
      dueAt: '2026-09-20T12:00:00Z',
      type: 'assignment',
      completed: false,
      submitted: true,
      pointsPossible: 20,
      score: null,
      url: null,
      color: '#fff',
    },
  ],
}

describe('Canvas LMS skin model', () => {
  it('falls back to overview for old or malformed board data', () => {
    expect(canvasLmsSkin('grades')).toBe('grades')
    expect(canvasLmsSkin('unknown')).toBe('overview')
    expect(canvasLmsSkin(null)).toBe('overview')
  })

  it('keeps only incomplete work and orders it by due date', () => {
    expect(activeCanvasItems(feed).map((item) => item.id)).toEqual(['first', 'later'])
  })

  it('reports submission and score states without changing source data', () => {
    expect(canvasSubmissionLabel(feed.items[0]!)).toBe('To do')
    expect(canvasSubmissionLabel(feed.items[1]!)).toBe('9 / 10 pts')
    expect(canvasSubmissionLabel(feed.items[2]!)).toBe('Submitted')
  })
})
