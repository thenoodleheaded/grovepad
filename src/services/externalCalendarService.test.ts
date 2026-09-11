import { describe, expect, it } from 'vitest'
import {
  externalCalendarsFromResponse,
  externalEventsFromResponse,
} from './externalCalendarService'

describe('external calendar normalization', () => {
  it('keeps bounded, display-safe Google calendar and event fields', () => {
    const calendars = externalCalendarsFromResponse('google', {
      items: [
        {
          id: 'primary@example.com',
          summary: 'Personal',
          backgroundColor: '#4285f4',
          primary: true,
        },
        { id: '', summary: 'Malformed' },
      ],
    })
    expect(calendars).toEqual([{
      provider: 'google',
      id: 'primary@example.com',
      name: 'Personal',
      color: '#4285f4',
      primary: true,
    }])
    expect(externalEventsFromResponse(calendars[0]!, {
      items: [{
        id: 'event-1',
        summary: 'Design review',
        start: { dateTime: '2026-07-25T09:30:00Z' },
        end: { dateTime: '2026-07-25T10:00:00Z' },
        htmlLink: 'javascript:alert(1)',
      }],
    })).toMatchObject([{
      id: 'event-1',
      title: 'Design review',
      start: '2026-07-25T09:30:00Z',
      allDay: false,
      calendarName: 'Personal',
    }])
    expect(externalEventsFromResponse(calendars[0]!, {
      items: [{
        id: 'event-2',
        start: { date: '2026-07-26' },
        htmlLink: 'javascript:alert(1)',
      }],
    })[0]).not.toHaveProperty('url')
  })
})
