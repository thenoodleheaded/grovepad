// ---------------------------------------------------------------------------
// The billing endpoints.
//
//   POST /api/billing/webhook   Polar tells us what changed.
//   POST /api/billing/checkout  A signed-in person asks for a checkout link.
//
// There is deliberately no portal endpoint: Polar hosts the cancel/card-change
// screen, so Settings links straight to it and we build no billing UI at all.
//
// The two endpoints trust different things, and it matters which:
//   * the webhook trusts a signature, never the body's claims about who it is;
//   * checkout trusts a Supabase access token, never a user id in the request.
// In both cases the caller's assertion about identity is discarded and the
// identity is derived from something they cannot forge.
// ---------------------------------------------------------------------------

import { interpretPolarEvent, type ProductCatalogue } from './polarEvents'
import { claimEvent, upsertSubscription, type SupabaseAdminConfig } from './subscriptionStore'
import { verifyStandardWebhook } from './standardWebhooks'

export const WEBHOOK_PATH = '/api/billing/webhook'
export const CHECKOUT_PATH = '/api/billing/checkout'

/** Polar caps a webhook body well below this; the limit is a denial-of-service
 *  guard, not a protocol rule. */
const MAX_WEBHOOK_BYTES = 512 * 1024

export interface BillingEnv {
  POLAR_WEBHOOK_SECRET?: string
  POLAR_ACCESS_TOKEN?: string
  /** https://api.polar.sh in production, https://sandbox-api.polar.sh in test. */
  POLAR_API_BASE?: string
  POLAR_PRODUCT_AIR_YEARLY?: string
  POLAR_PRODUCT_AIR_MONTHLY?: string
  POLAR_PRODUCT_AIR_STUDENT_YEARLY?: string
  POLAR_PRODUCT_AIR_STUDENT_MONTHLY?: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  SUPABASE_ANON_KEY?: string
  /** Where Polar sends the buyer back to. */
  GROVEPAD_SITE_ORIGIN?: string
}

export interface BillingDeps {
  fetcher?: typeof fetch
  nowMs?: () => number
}

/**
 * The four things somebody can buy. Spelled out rather than composed from
 * "student" plus an interval, so a request can never ask for a combination
 * that has no product behind it.
 */
export type PlanChoice = 'yearly' | 'monthly' | 'student_yearly' | 'student_monthly'

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/** Which Polar product is which plan, assembled once from configuration. */
export function productCatalogue(env: BillingEnv): ProductCatalogue {
  const catalogue: Record<string, { plan: 'air' | 'air_student'; interval: 'month' | 'year' }> =
    {}
  if (env.POLAR_PRODUCT_AIR_YEARLY) {
    catalogue[env.POLAR_PRODUCT_AIR_YEARLY] = { plan: 'air', interval: 'year' }
  }
  if (env.POLAR_PRODUCT_AIR_MONTHLY) {
    catalogue[env.POLAR_PRODUCT_AIR_MONTHLY] = { plan: 'air', interval: 'month' }
  }
  if (env.POLAR_PRODUCT_AIR_STUDENT_YEARLY) {
    catalogue[env.POLAR_PRODUCT_AIR_STUDENT_YEARLY] = { plan: 'air_student', interval: 'year' }
  }
  if (env.POLAR_PRODUCT_AIR_STUDENT_MONTHLY) {
    catalogue[env.POLAR_PRODUCT_AIR_STUDENT_MONTHLY] = { plan: 'air_student', interval: 'month' }
  }
  return catalogue
}

function adminConfig(env: BillingEnv, fetcher?: typeof fetch): SupabaseAdminConfig | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null
  return { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY, fetcher }
}

// --- Webhook ------------------------------------------------------------------

/**
 * Receive one Polar delivery.
 *
 * Status codes are chosen for what Polar does with them, not for tidiness:
 * 2xx means "settled, never send this again", 5xx means "retry". An event we
 * deliberately ignore therefore returns 200 — asking Polar to keep redelivering
 * something we will always ignore is how a retry queue becomes a backlog.
 */
export async function handlePolarWebhook(
  request: Request,
  env: BillingEnv,
  deps: BillingDeps = {},
): Promise<Response> {
  const fetcher = deps.fetcher ?? fetch
  const nowMs = deps.nowMs ?? Date.now

  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  if (!env.POLAR_WEBHOOK_SECRET) {
    // Misconfigured rather than malicious. 500 so deliveries queue for retry
    // instead of being silently thrown away while the secret is missing.
    return json({ error: 'Billing is not configured.' }, 500)
  }
  const config = adminConfig(env, fetcher)
  if (!config) return json({ error: 'Billing is not configured.' }, 500)

  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    return json({ error: 'Payload too large.' }, 413)
  }
  // The signature covers these exact bytes, so the body is read once as text
  // and never re-serialised.
  const rawBody = await request.text()
  if (rawBody.length > MAX_WEBHOOK_BYTES) return json({ error: 'Payload too large.' }, 413)

  const verification = await verifyStandardWebhook({
    secret: env.POLAR_WEBHOOK_SECRET,
    headers: request.headers,
    rawBody,
    nowSeconds: Math.floor(nowMs() / 1000),
  })
  if (!verification.ok) {
    // The reason stays in our logs. Telling a prober which part of their
    // forgery failed is free help.
    console.warn('billing webhook refused', verification.reason)
    return json({ error: 'Signature verification failed.' }, 401)
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    // Correctly signed but unparseable. Retrying cannot fix it.
    return json({ ok: true, ignored: 'malformed-json' }, 200)
  }

  const intent = interpretPolarEvent(payload, productCatalogue(env), nowMs())
  const eventType =
    typeof payload === 'object' && payload !== null && 'type' in payload
      ? String((payload as { type: unknown }).type).slice(0, 128)
      : 'unknown'

  try {
    // Claim first. A crash between claiming and writing means Polar redelivers
    // and the claim fails, so the safe direction is chosen deliberately: an
    // event may be dropped by a crash, and the nightly reconciliation is what
    // repairs that, whereas double-applying a refund has no repair.
    const claimed = await claimEvent(config, {
      eventId: verification.id,
      eventType,
      userId: intent.kind === 'upsert' ? intent.userId : null,
      polarSubscriptionId: intent.kind === 'upsert' ? intent.polarSubscriptionId : null,
      payload,
    })
    if (!claimed) return json({ ok: true, duplicate: true }, 200)

    if (intent.kind === 'ignore') return json({ ok: true, ignored: intent.reason }, 200)

    await upsertSubscription(config, intent)
    return json({ ok: true }, 200)
  } catch (error: unknown) {
    console.error('billing webhook failed', error)
    // 5xx asks Polar to try again. This is the one case where retrying helps.
    return json({ error: 'Could not record the billing event.' }, 500)
  }
}

// --- Checkout -----------------------------------------------------------------

/** Confirm the bearer token and return whose it is. Never trust a body field. */
async function resolveCaller(
  request: Request,
  env: BillingEnv,
  fetcher: typeof fetch,
): Promise<{ id: string; email: string | null } | null> {
  const authorization = request.headers.get('authorization')
  if (!authorization?.toLowerCase().startsWith('bearer ') || !env.SUPABASE_URL) return null
  const token = authorization.slice(7).trim()
  if (!token || token.length > 4096) return null

  const response = await fetcher(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY ?? '',
    },
  })
  if (!response.ok) return null
  const user: unknown = await response.json().catch(() => null)
  if (typeof user !== 'object' || user === null) return null
  const value = user as Record<string, unknown>
  if (typeof value.id !== 'string') return null
  return { id: value.id, email: typeof value.email === 'string' ? value.email : null }
}

const PLAN_PRODUCTS: Record<PlanChoice, keyof BillingEnv> = {
  yearly: 'POLAR_PRODUCT_AIR_YEARLY',
  monthly: 'POLAR_PRODUCT_AIR_MONTHLY',
  student_yearly: 'POLAR_PRODUCT_AIR_STUDENT_YEARLY',
  student_monthly: 'POLAR_PRODUCT_AIR_STUDENT_MONTHLY',
}

function productFor(env: BillingEnv, plan: PlanChoice): string | null {
  return env[PLAN_PRODUCTS[plan]] ?? null
}

function parsePlan(value: unknown): PlanChoice | null {
  return typeof value === 'string' && value in PLAN_PRODUCTS ? (value as PlanChoice) : null
}

/**
 * Create a Polar checkout session for the signed-in caller.
 *
 * The account id is attached twice — as `external_customer_id` and in metadata
 * — because that pairing is what lets the webhook match the eventual payment
 * back to an account. A checkout created without it produces a real payment
 * that entitles nobody, which is the worst failure this system has.
 */
export async function handleCheckout(
  request: Request,
  env: BillingEnv,
  deps: BillingDeps = {},
): Promise<Response> {
  const fetcher = deps.fetcher ?? fetch
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  if (!env.POLAR_ACCESS_TOKEN) return json({ error: 'Billing is not configured.' }, 500)

  const caller = await resolveCaller(request, env, fetcher)
  if (!caller) return json({ error: 'Sign in to subscribe.' }, 401)

  const body: unknown = await request.json().catch(() => null)
  const plan = parsePlan(
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>).plan : null,
  )
  if (!plan) return json({ error: 'Choose a plan.' }, 400)

  const product = productFor(env, plan)
  if (!product) return json({ error: 'That plan is not available yet.' }, 503)

  const origin = env.GROVEPAD_SITE_ORIGIN ?? 'https://grovepad.app'
  const apiBase = (env.POLAR_API_BASE ?? 'https://api.polar.sh').replace(/\/$/, '')

  const response = await fetcher(`${apiBase}/v1/checkouts/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.POLAR_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      products: [product],
      success_url: `${origin}/?subscribed=1`,
      customer_email: caller.email ?? undefined,
      external_customer_id: caller.id,
      metadata: { grovepad_user_id: caller.id },
    }),
  })

  if (!response.ok) {
    console.error('polar checkout failed', response.status, await response.text().catch(() => ''))
    return json({ error: 'Could not start checkout. Try again shortly.' }, 502)
  }
  const session: unknown = await response.json().catch(() => null)
  const url =
    typeof session === 'object' && session !== null
      ? (session as Record<string, unknown>).url
      : null
  if (typeof url !== 'string') return json({ error: 'Checkout did not return a link.' }, 502)
  return json({ url }, 200)
}

/** Route a billing request, or return null so the caller can try other routes. */
export function billingRoute(pathname: string): 'webhook' | 'checkout' | null {
  if (pathname === WEBHOOK_PATH) return 'webhook'
  if (pathname === CHECKOUT_PATH) return 'checkout'
  return null
}
