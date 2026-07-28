import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CalendarData } from '../../../types/spatial'
import { CalendarWidget } from './CalendarWidget'
import type { CalendarSkin } from './calendarSkinModel'

describe('purpose-built Calendar skins', () => {
  const base: CalendarData = {
    year: 2026,
    month: 6,
    markedDates: ['2026-07-25'],
    skin: 'month',
  }

  it.each([
    ['month', 'gp-calendar-month'],
    ['week', 'gp-calendar-week'],
    ['agenda', 'gp-calendar-agenda'],
    ['year_heatmap', 'gp-calendar-year'],
    ['availability', 'gp-calendar-availability'],
    ['shift_rota', 'gp-calendar-rota'],
    ['birthday_and_anniversary', 'gp-calendar-occasions'],
    ['connected_calendars', 'gp-calendar-connected'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    const markup = renderToStaticMarkup(
      <CalendarWidget
        data={{ ...base, skin: skin as CalendarSkin }}
        skin={skin as CalendarSkin}
        onChange={() => undefined}
      />,
    )
    expect(markup).toContain(className)
    expect(markup).toContain(`data-calendar-skin="${skin}"`)
  })

  it('renders specialist calendar data from isolated skin state', () => {
    const rota = renderToStaticMarkup(
      <CalendarWidget
        data={{
          ...base,
          skin: 'shift_rota',
          skinStates: {
            shift_rota: {
              anchorDate: '2026-07-20',
              assignee: 'Ada',
              role: 'Support',
              shifts: { '2026-07-20': 'morning' },
            },
          },
        }}
        skin="shift_rota"
        onChange={() => undefined}
      />,
    )
    const occasions = renderToStaticMarkup(
      <CalendarWidget
        data={{
          ...base,
          skin: 'birthday_and_anniversary',
          skinStates: {
            birthday_and_anniversary: {
              occasions: [
                { id: 'ada', name: 'Ada', date: '12-10', kind: 'birthday' },
              ],
            },
          },
        }}
        skin="birthday_and_anniversary"
        onChange={() => undefined}
      />,
    )
    expect(rota).toContain('value="Ada"')
    expect(rota).toContain('data-shift="morning"')
    expect(occasions).toContain('Ada')
    expect(occasions).toContain('Dec 10')
  })

  it('offers private read-only Google and Outlook connections', () => {
    const markup = renderToStaticMarkup(
      <CalendarWidget
        data={{ ...base, skin: 'connected_calendars' }}
        skin="connected_calendars"
        onChange={() => undefined}
      />,
    )
    expect(markup).toContain('Google Calendar')
    expect(markup).toContain('Outlook Calendar')
    expect(markup).toContain('events and access tokens are never saved on the board')
  })
})
