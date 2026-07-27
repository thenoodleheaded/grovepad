import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LogbookData, LogbookSkinMode } from '../../../types/spatial'
import { LogbookWidget } from './LogbookWidget'

const entries: LogbookData['entries'] = [
  { id: 'one', timestamp: '2026-07-25T08:00:00.000Z', text: 'First observation', level: 'note' },
  { id: 'two', timestamp: '2026-07-25T09:30:00.000Z', text: 'Unexpected result', level: 'warning' },
]

function render(skin: LogbookSkinMode, skinState: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <LogbookWidget
      data={{
        skin,
        entries,
        skinStates: { [skin]: skinState },
      }}
      onChange={() => undefined}
    />,
  )
}

describe('purpose-built Logbook skins', () => {
  it.each([
    ['daily_log', 'gp-logbook-daily'],
    ['incident_log', 'gp-logbook-incidents'],
    ['lab_notebook', 'gp-logbook-lab'],
    ['change_log', 'gp-logbook-changes'],
    ['maintenance_log', 'gp-logbook-maintenance'],
    ['audit_trail', 'gp-logbook-audit'],
    ['travel_log', 'gp-logbook-travel'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    const markup = render(skin)
    expect(markup).toContain(className)
    expect(markup).toContain(`data-logbook-skin="${skin}"`)
    expect(markup).toContain('First observation')
    expect(markup).toContain('Unexpected result')
  })

  it('groups daily entries beneath a readable day heading', () => {
    const markup = render('daily_log')
    expect(markup).toContain('gp-logbook-day')
    expect(markup).toContain('Daily log entry')
  })

  it('renders incident status and response fields from isolated state', () => {
    const markup = render('incident_log', {
      entries: {
        two: {
          status: 'resolved',
          impact: 'Deployment paused',
          response: 'Rolled back',
          resolution: 'Patched',
        },
      },
    })
    expect(markup).toContain('data-status="resolved"')
    // Impact, response, and resolution are prose fields, so they wrap in
    // textareas rather than clipping a sentence inside a single-line input.
    expect(markup).toContain('>Deployment paused</textarea>')
    expect(markup).toContain('>Rolled back</textarea>')
    expect(markup).toContain('>Patched</textarea>')
  })

  it('renders the four-part scientific record', () => {
    const markup = render('lab_notebook', {
      entries: {
        one: {
          hypothesis: 'Caching helps',
          method: 'Compare two runs',
          observation: 'Second run was faster',
          conclusion: 'Keep the cache',
        },
      },
    })
    expect(markup).toContain('>Caching helps</textarea>')
    expect(markup).toContain('>Compare two runs</textarea>')
    expect(markup).toContain('>Second run was faster</textarea>')
    expect(markup).toContain('>Keep the cache</textarea>')
  })

  it('shows structured release and maintenance fields', () => {
    const change = render('change_log', {
      entries: { one: { version: 'v2.1', author: 'Mina', changeKind: 'fixed' } },
    })
    expect(change).toContain('value="v2.1"')
    expect(change).toContain('value="Mina"')
    // The change kind is a cycling chip, not a native select: a dropdown inside
    // the card's glass would be a second material.
    expect(change).toContain('data-kind="fixed"')
    expect(change).not.toContain('<select')

    const maintenance = render('maintenance_log', {
      entries: { one: { asset: 'Pump 4', parts: 'Seal kit', nextService: '2026-08-01' } },
    })
    expect(maintenance).toContain('value="Pump 4"')
    expect(maintenance).toContain('value="Seal kit"')
    expect(maintenance).toContain('value="2026-08-01"')
  })

  it('flags an overdue service date and stays quiet about a distant one', () => {
    const overdue = render('maintenance_log', {
      entries: { one: { asset: 'Pump 4', nextService: '2020-01-01' } },
    })
    expect(overdue).toContain('data-tone="overdue"')
    expect(overdue).toContain('days overdue')

    const distant = render('maintenance_log', {
      entries: { one: { asset: 'Pump 4', nextService: '2999-01-01' } },
    })
    expect(distant).not.toContain('gp-logbook-due')
  })

  it('keeps existing audit events read-only and identifies their source', () => {
    const markup = render('audit_trail', {
      entries: { one: { actor: 'Automation', source: 'Webhook' } },
    })
    expect(markup).toContain('data-append-only="true"')
    expect(markup).toContain('Existing events are read-only')
    expect(markup).toContain('Automation')
    expect(markup).toContain('Webhook')
    expect(markup).not.toContain('aria-label="Remove First observation"')
  })

  it('renders travel waypoints with place and trip context', () => {
    const markup = render('travel_log', {
      entries: {
        one: { place: 'Bukhara', distance: '268 km', context: 'Silk Road leg' },
      },
    })
    expect(markup).toContain('value="Bukhara"')
    expect(markup).toContain('value="268 km"')
    expect(markup).toContain('value="Silk Road leg"')
  })

  it('keeps a keyboard-friendly composer in every skin', () => {
    for (const skin of [
      'daily_log',
      'incident_log',
      'lab_notebook',
      'change_log',
      'maintenance_log',
      'audit_trail',
      'travel_log',
    ] as const) {
      const markup = render(skin)
      expect(markup, skin).toContain('gp-logbook-composer')
      expect(markup, skin).toContain('disabled=""')
    }
  })
})
