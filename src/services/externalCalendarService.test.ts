import { describe, expect, it } from 'vitest'
import {
  externalCalendarsFromResponse,
  externalEventsFromResponse,
  type ExternalCalendar,
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

  it('normalizes Outlook all-day events and rejects entries without an id or start', () => {
    const calendar: ExternalCalendar = {
      provider: 'microsoft',
      id: 'work',
      name: 'Work',
      color: '#0078d4',
      primary: true,
    }
    expect(externalEventsFromResponse(calendar, {
      value: [
        {
          id: 'holiday',
          subject: 'Company day',
          isAllDay: true,
          start: { dateTime: '2026-07-27T00:00:00Z' },
          end: { dateTime: '2026-07-28T00:00:00Z' },
          webLink: 'https://outlook.office.com/calendar/item/holiday',
        },
        { id: 'missing-start', subject: 'Broken' },
      ],
    })).toEqual([{
      provider: 'microsoft',
      id: 'holiday',
      calendarId: 'work',
      calendarName: 'Work',
      title: 'Company day',
      start: '2026-07-27T00:00:00Z',
      end: '2026-07-28T00:00:00Z',
      allDay: true,
      url: 'https://outlook.office.com/calendar/item/holiday',
      color: '#0078d4',
    }])
  })
})
