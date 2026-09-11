import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCanvasLmsFeed,
  normalizeCanvasAnnouncements,
  normalizeCanvasCourses,
  normalizeCanvasPlannerItems,
  parseCanvasOrigin,
} from './canvasLmsService'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Canvas LMS service', () => {
  it('accepts only a secure school origin', () => {
    expect(parseCanvasOrigin('college.instructure.com/courses/4')).toBe(
      'https://college.instructure.com',
    )
    expect(() => parseCanvasOrigin('http://college.instructure.com')).toThrow(/HTTPS/)
    expect(() => parseCanvasOrigin('not a school url')).toThrow(/valid Canvas address/)
  })

  it('normalizes bounded courses, planner items, and announcements', () => {
    const courses = normalizeCanvasCourses([{
      id: 42,
      name: 'Interaction Design',
      course_code: 'DES 204',
      html_url: 'https://college.instructure.com/courses/42',
      term: { name: 'Fall 2026' },
      enrollments: [{
        type: 'StudentEnrollment',
        grades: { current_score: 91.5, current_grade: 'A-' },
      }],
    }])
    expect(courses[0]).toMatchObject({
      id: '42',
      name: 'Interaction Design',
      code: 'DES 204',
      score: 91.5,
      grade: 'A-',
    })

    const items = normalizeCanvasPlannerItems([{
      plannable_id: 8,
      plannable_type: 'assignment',
      course_id: 42,
      plannable_date: '2026-09-10T17:00:00Z',
      plannable: {
        title: 'Prototype critique',
        points_possible: 25,
        html_url: 'https://college.instructure.com/courses/42/assignments/8',
      },
      submissions: { workflow_state: 'submitted', score: 22 },
    }], courses)
    expect(items[0]).toMatchObject({
      id: 'assignment:8',
      courseName: 'Interaction Design',
      title: 'Prototype critique',
      submitted: true,
      score: 22,
    })

    const announcements = normalizeCanvasAnnouncements([{
      id: 3,
      context_code: 'course_42',
      title: 'Studio moved',
      message: '<p>Meet in <strong>Room 210</strong> &amp; bring sketches.</p>',
      posted_at: '2026-09-01T10:00:00Z',
      html_url: 'javascript:alert(1)',
    }], courses)
    expect(announcements[0]).toMatchObject({
      courseName: 'Interaction Design',
      excerpt: 'Meet in Room 210 & bring sketches.',
      url: null,
    })
  })

  it('uses bearer authorization without placing the token in request URLs', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: 42,
        name: 'Interaction Design',
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))

    const feed = await fetchCanvasLmsFeed({
      origin: 'https://college.instructure.com',
      token: 'student-secret-token',
    }, undefined, fetcher)

    expect(feed.courses).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledTimes(3)
    for (const [url, options] of fetcher.mock.calls) {
      expect(String(url)).not.toContain('student-secret-token')
      expect(new Headers(options?.headers).get('Authorization')).toBe(
        'Bearer student-secret-token',
      )
    }
  })

  it('keeps native-app reads direct instead of calling the website relay', async () => {
    vi.stubGlobal('window', {
      location: { protocol: 'http:' },
      __TAURI_INTERNALS__: {},
    })
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))

    await fetchCanvasLmsFeed({
      origin: 'https://canvas.ou.edu',
      token: 'student-secret-token',
    }, undefined, fetcher)

    const [url, options] = fetcher.mock.calls[0] ?? []
    expect(String(url)).toMatch(/^https:\/\/canvas\.ou\.edu\/api\/v1\//)
    expect(new Headers(options?.headers).get('Authorization')).toBe(
      'Bearer student-secret-token',
    )
  })

  it('uses the same-origin no-storage relay in the website build', async () => {
    vi.stubGlobal('window', { location: { protocol: 'https:' } })
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: 42,
        name: 'Interaction Design',
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

    await fetchCanvasLmsFeed({
      origin: 'https://canvas.ou.edu',
      token: 'student-secret-token',
    }, undefined, fetcher)

    expect(fetcher).toHaveBeenCalledTimes(3)
    for (const [url, options] of fetcher.mock.calls) {
      expect(url).toBe('/api/canvas-lms')
      expect(options?.method).toBe('POST')
      expect(new Headers(options?.headers).has('Authorization')).toBe(false)
      const body = JSON.parse(String(options?.body)) as {
        origin: string
        path: string
        token: string
      }
      expect(body.origin).toBe('https://canvas.ou.edu')
      expect(body.path).toMatch(/^\/api\/v1\//)
      expect(body.token).toBe('student-secret-token')
    }
  })

  it('shows a relay explanation instead of the browser’s opaque fetch error', async () => {
    vi.stubGlobal('window', { location: { protocol: 'https:' } })
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(fetchCanvasLmsFeed({
      origin: 'https://canvas.ou.edu',
      token: 'student-secret-token',
    }, undefined, fetcher)).rejects.toThrow(
      'Grovepad’s secure Canvas relay could not be reached. Reload and try again.',
    )
  })
})
