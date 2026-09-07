import { describe, expect, it, vi } from 'vitest'
import {
  handleCheckout,
  handlePolarWebhook,
  productCatalogue,
  type BillingEnv,
} from './routes'
import { signedContent } from './standardWebhooks'

const SECRET_BASE64 = btoa(String.fromCharCode(...new Uint8Array(32).fill(42)))
const NOW_MS = Date.parse('2026-08-12T12:00:00.000Z')
const USER = '11111111-1111-4111-8111-111111111111'

const ENV: BillingEnv = {
  POLAR_WEBHOOK_SECRET: `whsec_${SECRET_BASE64}`,
  POLAR_ACCESS_TOKEN: 'polar_oat_test',
  POLAR_API_BASE: 'https://sandbox-api.polar.sh',
  POLAR_PRODUCT_AIR_YEARLY: 'prod_yearly',
  POLAR_PRODUCT_AIR_STUDENT_YEARLY: 'prod_student',
  POLAR_PRODUCT_AIR_STUDENT_MONTHLY: 'prod_student_monthly',
  POLAR_PRODUCT_AIR_MONTHLY: 'prod_monthly',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SUPABASE_ANON_KEY: 'anon-key',
  GROVEPAD_SITE_ORIGIN: 'https://grovepad.app',
}

async function sign(id: string, timestamp: string, body: string): Promise<string> {
  const raw = Uint8Array.from(atob(SECRET_BASE64), (character) => character.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'raw',
    raw as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedContent(id, timestamp, body)) as unknown as ArrayBuffer,
  )
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(signature)))}`
}

const EVENT_BODY = JSON.stringify({
  type: 'subscription.active',
  data: {
    id: 'sub_abc',
    status: 'active',
    product_id: 'prod_yearly',
    customer_id: 'cus_xyz',
    current_period_end: '2027-08-12T00:00:00Z',
    metadata: { grovepad_user_id: USER },
  },
})

async function signedRequest(body = EVENT_BODY, id = 'msg_1'): Promise<Request> {
  const timestamp = String(Math.floor(NOW_MS / 1000))
  return new Request('https://grovepad.app/api/billing/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': await sign(id, timestamp, body),
    },
    body,
  })
}

/** A fetch stand-in that records what the handler asked the world to do. */
function stubFetch(handlers: {
  billingEvents?: () => Response
  subscriptions?: () => Response
  authUser?: () => Response
  polarCheckout?: () => Response
}) {
  const calls: Array<{ url: string; method: string; body: string | null }> = []
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : null,
    })
    if (url.includes('/rest/v1/billing_events')) {
      return handlers.billingEvents?.() ?? new Response(null, { status: 201 })
    }
    if (url.includes('/rest/v1/subscriptions')) {
      return handlers.subscriptions?.() ?? new Response(null, { status: 201 })
    }
    if (url.includes('/auth/v1/user')) {
      return (
        handlers.authUser?.() ??
        Response.json({ id: USER, email: 'person@example.com' }, { status: 200 })
      )
    }
    if (url.includes('/v1/checkouts/')) {
      return (
        handlers.polarCheckout?.() ??
        Response.json({ id: 'co_1', url: 'https://polar.sh/checkout/co_1' }, { status: 201 })
      )
    }
    throw new Error(`unexpected fetch to ${url}`)
  })
  return { fetcher: fetcher as unknown as typeof fetch, calls }
}

describe('the webhook endpoint', () => {
  it('records a genuine event and writes the subscription', async () => {
    const { fetcher, calls } = stubFetch({})
    const response = await handlePolarWebhook(await signedRequest(), ENV, {
      fetcher,
      nowMs: () => NOW_MS,
    })

    expect(response.status).toBe(200)
    const claim = calls.find((call) => call.url.includes('billing_events'))
    expect(claim?.body).toContain('"event_id":"msg_1"')
    const upsert = calls.find((call) => call.url.includes('/rest/v1/subscriptions'))
    expect(upsert?.body).toContain(`"user_id":"${USER}"`)
    expect(upsert?.body).toContain('"status":"active"')
  })

  // The single most important property: money events must not apply twice.
  it('treats a redelivered event as a no-op and never rewrites the subscription', async () => {
    const { fetcher, calls } = stubFetch({
      billingEvents: () => new Response('duplicate key value violates 23505', { status: 409 }),
    })
    const response = await handlePolarWebhook(await signedRequest(), ENV, {
      fetcher,
      nowMs: () => NOW_MS,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, duplicate: true })
    expect(calls.some((call) => call.url.includes('/rest/v1/subscriptions'))).toBe(false)
  })

  it('recognises the conflict when PostgREST reports it as a 400', async () => {
    const { fetcher, calls } = stubFetch({
      billingEvents: () =>
        new Response(JSON.stringify({ code: '23505', message: 'duplicate key' }), { status: 400 }),
    })
    const response = await handlePolarWebhook(await signedRequest(), ENV, {
      fetcher,
      nowMs: () => NOW_MS,
    })
    expect(response.status).toBe(200)
    expect(calls.some((call) => call.url.includes('/rest/v1/subscriptions'))).toBe(false)
  })

  it('refuses an unsigned request and touches nothing', async () => {
    const { fetcher, calls } = stubFetch({})
    const request = new Request('https://grovepad.app/api/billing/webhook', {
      method: 'POST',
      body: EVENT_BODY,
    })
    const response = await handlePolarWebhook(request, ENV, { fetcher, nowMs: () => NOW_MS })

    expect(response.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('refuses a body edited after signing', async () => {
    const { fetcher, calls } = stubFetch({})
    const timestamp = String(Math.floor(NOW_MS / 1000))
    const tampered = new Request('https://grovepad.app/api/billing/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': 'msg_1',
        'webhook-timestamp': timestamp,
        // Signed over the honest body, sent with an edited one.
        'webhook-signature': await sign('msg_1', timestamp, EVENT_BODY),
      },
      body: EVENT_BODY.replace(USER, '99999999-9999-4999-8999-999999999999'),
    })
    const response = await handlePolarWebhook(tampered, ENV, { fetcher, nowMs: () => NOW_MS })

    expect(response.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('acknowledges an event it deliberately ignores, so Polar stops retrying', async () => {
    const body = JSON.stringify({ type: 'benefit_grant.created', data: { id: 'ben_1' } })
    const { fetcher, calls } = stubFetch({})
    const response = await handlePolarWebhook(await signedRequest(body, 'msg_ignored'), ENV, {
      fetcher,
      nowMs: () => NOW_MS,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, ignored: 'unhandled-event-type' })
    expect(calls.some((call) => call.url.includes('/rest/v1/subscriptions'))).toBe(false)
  })

  // 5xx is the only status that makes Polar try again, so a transient database
  // failure has to produce one — otherwise the event is lost for good.
  it('asks for a retry when the database write fails', async () => {
    const { fetcher } = stubFetch({
      subscriptions: () => new Response('upstream exploded', { status: 500 }),
    })
    const response = await handlePolarWebhook(await signedRequest(), ENV, {
      fetcher,
      nowMs: () => NOW_MS,
    })
    expect(response.status).toBe(500)
  })

  it('asks for a retry rather than dropping deliveries when unconfigured', async () => {
    const { fetcher } = stubFetch({})
    const response = await handlePolarWebhook(
      await signedRequest(),
      { ...ENV, POLAR_WEBHOOK_SECRET: undefined },
      { fetcher, nowMs: () => NOW_MS },
    )
    expect(response.status).toBe(500)
  })

  it('rejects anything but POST', async () => {
    const { fetcher } = stubFetch({})
    const response = await handlePolarWebhook(
      new Request('https://grovepad.app/api/billing/webhook'),
      ENV,
      { fetcher, nowMs: () => NOW_MS },
    )
    expect(response.status).toBe(405)
  })
})

describe('the checkout endpoint', () => {
  function checkoutRequest(body: unknown, token = 'valid-access-token'): Request {
    return new Request('https://grovepad.app/api/billing/checkout', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('returns a checkout link with the account id attached both ways', async () => {
    const { fetcher, calls } = stubFetch({})
    const response = await handleCheckout(checkoutRequest({ plan: 'yearly' }), ENV, { fetcher })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: 'https://polar.sh/checkout/co_1' })

    const checkout = calls.find((call) => call.url.includes('/v1/checkouts/'))
    expect(checkout?.url).toBe('https://sandbox-api.polar.sh/v1/checkouts/')
    const sent = JSON.parse(checkout?.body ?? '{}')
    expect(sent.products).toEqual(['prod_yearly'])
    // Both channels, so the webhook can always match the payment to an account.
    expect(sent.external_customer_id).toBe(USER)
    expect(sent.metadata).toEqual({ grovepad_user_id: USER })
  })

  it('routes the student checkbox to the student product', async () => {
    const { fetcher, calls } = stubFetch({})
    await handleCheckout(checkoutRequest({ plan: 'student_yearly' }), ENV, { fetcher })
    const checkout = calls.find((call) => call.url.includes('/v1/checkouts/'))
    expect(JSON.parse(checkout?.body ?? '{}').products).toEqual(['prod_student'])
  })

  // Four products exist, so all four have to be reachable. A plan with no
  // route behind it is a buyer who cannot give you money.
  it('sells each of the four plans from its own product', async () => {
    const expected: Array<[string, string]> = [
      ['yearly', 'prod_yearly'],
      ['monthly', 'prod_monthly'],
      ['student_yearly', 'prod_student'],
      ['student_monthly', 'prod_student_monthly'],
    ]
    for (const [plan, product] of expected) {
      const { fetcher, calls } = stubFetch({})
      const response = await handleCheckout(checkoutRequest({ plan }), ENV, { fetcher })
      expect(response.status).toBe(200)
      const checkout = calls.find((call) => call.url.includes('/v1/checkouts/'))
      expect(JSON.parse(checkout?.body ?? '{}').products).toEqual([product])
    }
  })

  it('maps the student monthly product back to the right plan and interval', () => {
    expect(productCatalogue(ENV).prod_student_monthly).toEqual({
      plan: 'air_student',
      interval: 'month',
    })
  })

  // The caller's own claim about who they are is discarded entirely; identity
  // comes from the token Supabase validates.
  it('refuses an unauthenticated caller', async () => {
    const { fetcher, calls } = stubFetch({
      authUser: () => new Response('bad jwt', { status: 401 }),
    })
    const response = await handleCheckout(checkoutRequest({ plan: 'yearly' }), ENV, { fetcher })

    expect(response.status).toBe(401)
    expect(calls.some((call) => call.url.includes('/v1/checkouts/'))).toBe(false)
  })

  it('refuses a request with no bearer token at all', async () => {
    const { fetcher } = stubFetch({})
    const request = new Request('https://grovepad.app/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'yearly' }),
    })
    expect((await handleCheckout(request, ENV, { fetcher })).status).toBe(401)
  })

  it('refuses a plan it does not sell', async () => {
    const { fetcher } = stubFetch({})
    const response = await handleCheckout(checkoutRequest({ plan: 'lifetime' }), ENV, { fetcher })
    expect(response.status).toBe(400)
  })

  // Better an honest 503 than charging somebody for the wrong product.
  it('declines when the product id has not been configured yet', async () => {
    const { fetcher } = stubFetch({})
    const response = await handleCheckout(
      checkoutRequest({ plan: 'monthly' }),
      { ...ENV, POLAR_PRODUCT_AIR_MONTHLY: undefined },
      { fetcher },
    )
    expect(response.status).toBe(503)
  })

  it('reports a provider failure without leaking its detail', async () => {
    const { fetcher } = stubFetch({
      polarCheckout: () => new Response('polar internal detail', { status: 500 }),
    })
    const response = await handleCheckout(checkoutRequest({ plan: 'yearly' }), ENV, { fetcher })
    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain('polar internal detail')
  })
})
