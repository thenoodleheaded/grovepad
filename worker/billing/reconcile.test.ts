import { describe, expect, it, vi } from 'vitest'
import { reconcileSubscriptions } from './reconcile'
import type { ProductCatalogue } from './polarEvents'

const NOW = Date.parse('2026-08-12T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const USER = '11111111-1111-4111-8111-111111111111'

const CATALOGUE: ProductCatalogue = { prod_yearly: { plan: 'air', interval: 'year' } }
const CONFIG = { url: 'https://project.supabase.co', serviceRoleKey: 'service-role-key' }

interface StubRow {
  user_id: string
  status: string
  polar_subscription_id: string | null
  current_period_end: string | null
}

/** Records every write so the test can assert what the sweep actually did. */
function stub(options: {
  rows: StubRow[]
  polar?: Record<string, { status: number; body?: unknown }>
}) {
  const writes: Array<{ url: string; method: string; body: unknown }> = []
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.includes('/rest/v1/subscriptions') && method === 'GET') {
      return Response.json(options.rows, { status: 200 })
    }
    if (url.includes('/rest/v1/subscriptions')) {
      writes.push({
        url,
        method,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      })
      return new Response(null, { status: 204 })
    }
    if (url.includes('/v1/subscriptions/')) {
      const id = url.split('/v1/subscriptions/')[1] ?? ''
      const configured = options.polar?.[id]
      if (!configured) return new Response('not found', { status: 404 })
      return configured.body === undefined
        ? new Response(null, { status: configured.status })
        : Response.json(configured.body, { status: configured.status })
    }
    throw new Error(`unexpected fetch to ${url}`)
  })

  const run = () =>
    reconcileSubscriptions({
      config: { ...CONFIG, fetcher: fetcher as unknown as typeof fetch },
      catalogue: CATALOGUE,
      polarAccessToken: 'polar_oat_test',
      fetcher: fetcher as unknown as typeof fetch,
      nowMs: NOW,
    })

  return { run, writes }
}

function polarSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_abc',
    status: 'active',
    product_id: 'prod_yearly',
    current_period_end: new Date(NOW + 300 * DAY).toISOString(),
    metadata: { grovepad_user_id: USER },
    ...overrides,
  }
}

/**
 * The same instant as PostgREST actually hands it back: Postgres renders a
 * timestamptz with no milliseconds and a `+00:00` offset, never `Z`. Storing a
 * `toISOString()` string here would compare the sweep's output against itself.
 */
function asStoredTimestamp(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, '+00:00')
}

describe('converging on what Polar says', () => {
  it('leaves a row alone when it already agrees', async () => {
    const remote = polarSubscription()
    const { run, writes } = stub({
      rows: [
        {
          user_id: USER,
          status: 'active',
          polar_subscription_id: 'sub_abc',
          current_period_end: asStoredTimestamp(remote.current_period_end as string),
        },
      ],
      polar: { sub_abc: { status: 200, body: remote } },
    })

    const report = await run()
    expect(report).toMatchObject({ examined: 1, corrected: 0, failed: 0 })
    expect(writes).toHaveLength(0)
  })

  // The missed-webhook case: our table still says active, Polar says otherwise.
  it('corrects a row whose cancellation webhook never arrived', async () => {
    const { run, writes } = stub({
      rows: [
        {
          user_id: USER,
          status: 'active',
          polar_subscription_id: 'sub_abc',
          current_period_end: new Date(NOW + 300 * DAY).toISOString(),
        },
      ],
      polar: { sub_abc: { status: 200, body: polarSubscription({ status: 'canceled' }) } },
    })

    const report = await run()
    expect(report.corrected).toBe(1)
    expect(writes[0]?.body).toMatchObject({ user_id: USER, status: 'canceled' })
  })

  it('lapses a subscription Polar no longer has', async () => {
    const { run, writes } = stub({
      rows: [
        {
          user_id: USER,
          status: 'active',
          polar_subscription_id: 'sub_gone',
          current_period_end: new Date(NOW + 300 * DAY).toISOString(),
        },
      ],
      polar: {},
    })

    const report = await run()
    expect(report.lapsed).toBe(1)
    expect(writes[0]?.method).toBe('PATCH')
    expect(writes[0]?.body).toMatchObject({
      status: 'lapsed',
      cloud_retention_until: new Date(NOW + 90 * DAY).toISOString(),
    })
  })
})

describe('the safety net under a row nothing will ever write again', () => {
  it('lapses a row with no provider id once its grace window has fully closed', async () => {
    const { run, writes } = stub({
      rows: [
        {
          user_id: USER,
          status: 'active',
          polar_subscription_id: null,
          current_period_end: new Date(NOW - 8 * DAY).toISOString(),
        },
      ],
    })

    const report = await run()
    expect(report.lapsed).toBe(1)
    expect(writes[0]?.body).toMatchObject({ status: 'lapsed' })
  })

  it('leaves that same row alone while it is still inside the grace window', async () => {
    const { run, writes } = stub({
      rows: [
        {
          user_id: USER,
          status: 'active',
          polar_subscription_id: null,
          current_period_end: new Date(NOW - 6 * DAY).toISOString(),
        },
      ],
    })

    const report = await run()
    expect(report.lapsed).toBe(0)
    expect(writes).toHaveLength(0)
  })

  it('never lapses a row that has no period end to judge it by', async () => {
    const { run, writes } = stub({
      rows: [
        {
          user_id: USER,
          status: 'active',
          polar_subscription_id: null,
          current_period_end: null,
        },
      ],
    })

    expect((await run()).lapsed).toBe(0)
    expect(writes).toHaveLength(0)
  })
})

describe('resilience', () => {
  // One unreachable subscription must not leave everyone else unreconciled.
  it('carries on past an account that failed', async () => {
    const { run, writes } = stub({
      rows: [
        {
          user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          status: 'active',
          polar_subscription_id: 'sub_broken',
          current_period_end: new Date(NOW + 300 * DAY).toISOString(),
        },
        {
          user_id: USER,
          status: 'active',
          polar_subscription_id: 'sub_abc',
          current_period_end: new Date(NOW + 300 * DAY).toISOString(),
        },
      ],
      polar: {
        sub_broken: { status: 500 },
        sub_abc: { status: 200, body: polarSubscription({ status: 'past_due' }) },
      },
    })

    const report = await run()
    expect(report).toMatchObject({ examined: 2, failed: 1, corrected: 1 })
    expect(writes[0]?.body).toMatchObject({ user_id: USER, status: 'past_due' })
  })

  // A provider hiccup must never be read as "this subscription ended".
  it('does not lapse anyone when Polar is simply unreachable', async () => {
    const { run, writes } = stub({
      rows: [
        {
          user_id: USER,
          status: 'active',
          polar_subscription_id: 'sub_abc',
          current_period_end: new Date(NOW + 300 * DAY).toISOString(),
        },
      ],
      polar: { sub_abc: { status: 503 } },
    })

    const report = await run()
    expect(report.lapsed).toBe(0)
    expect(writes).toHaveLength(0)
  })

  it('does nothing at all when there is nothing to reconcile', async () => {
    const { run, writes } = stub({ rows: [] })
    expect(await run()).toEqual({ examined: 0, corrected: 0, lapsed: 0, failed: 0 })
    expect(writes).toHaveLength(0)
  })
})
