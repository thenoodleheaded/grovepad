// ---------------------------------------------------------------------------
// The only writer of public.subscriptions.
//
// This runs with the service role key, which bypasses row-level security
// entirely. That key never reaches a browser: it lives as a Worker secret, and
// every function here is reachable only from a request that already passed
// signature verification.
//
// PostgREST is called over plain fetch rather than through the Supabase SDK.
// The Worker needs three narrow operations, the SDK is a large dependency to
// carry into an edge bundle for that, and the explicit URLs make it obvious at
// a glance exactly which tables the billing path can touch.
// ---------------------------------------------------------------------------

import type { SubscriptionUpsert } from './polarEvents'

export interface SupabaseAdminConfig {
  url: string
  serviceRoleKey: string
  fetcher?: typeof fetch
}

export class SupabaseAdminError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'SupabaseAdminError'
    this.status = status
  }
}

function restUrl(config: SupabaseAdminConfig, path: string): string {
  return `${config.url.replace(/\/$/, '')}/rest/v1/${path}`
}

function headers(config: SupabaseAdminConfig, extra: Record<string, string> = {}): HeadersInit {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function assertOk(response: Response, what: string): Promise<void> {
  if (response.ok) return
  // The body carries PostgREST's reason. It is safe to surface into our own
  // logs but never into an HTTP response the sender can read.
  const detail = await response.text().catch(() => '')
  throw new SupabaseAdminError(`${what} failed (${response.status}): ${detail}`, response.status)
}

/**
 * Claim a webhook delivery id.
 *
 * Returns false when this id has already been recorded, which is the whole
 * idempotency mechanism: the primary key on billing_events does the work, and
 * a conflict is an expected outcome rather than an error. Claiming happens
 * BEFORE the subscription is written, so a crash between the two re-delivers
 * rather than double-applies.
 */
export async function claimEvent(
  config: SupabaseAdminConfig,
  event: {
    eventId: string
    eventType: string
    userId: string | null
    polarSubscriptionId: string | null
    payload: unknown
  },
): Promise<boolean> {
  const fetcher = config.fetcher ?? fetch
  const response = await fetcher(restUrl(config, 'billing_events'), {
    method: 'POST',
    headers: headers(config, { Prefer: 'return=minimal' }),
    body: JSON.stringify({
      event_id: event.eventId,
      event_type: event.eventType,
      user_id: event.userId,
      polar_subscription_id: event.polarSubscriptionId,
      payload: event.payload,
    }),
  })
  // 23505 is unique_violation: we have seen this delivery before. PostgREST
  // also answers 409 for a foreign_key_violation (23503) — a user_id Polar
  // echoed back that no longer exists in auth.users — so the code has to be
  // read. Treating that as a duplicate would acknowledge the delivery to
  // Polar without ever writing the subscription; throwing surfaces as a 500
  // so the failure is logged and Polar retries.
  if (response.status === 409) {
    const detail = await response.text().catch(() => '')
    if (detail.includes('23505')) return false
    throw new SupabaseAdminError(`claimEvent failed (409): ${detail}`, 409)
  }
  if (response.status === 400) {
    const detail = await response.text().catch(() => '')
    if (detail.includes('23505')) return false
    throw new SupabaseAdminError(`claimEvent failed (400): ${detail}`, 400)
  }
  await assertOk(response, 'claimEvent')
  return true
}

/** Write the account's subscription row. One row per account, so this upserts. */
export async function upsertSubscription(
  config: SupabaseAdminConfig,
  intent: SubscriptionUpsert,
): Promise<void> {
  const fetcher = config.fetcher ?? fetch
  const response = await fetcher(restUrl(config, 'subscriptions?on_conflict=user_id'), {
    method: 'POST',
    headers: headers(config, {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify({
      user_id: intent.userId,
      plan: intent.plan,
      status: intent.status,
      billing_interval: intent.billingInterval,
      current_period_end: intent.currentPeriodEnd,
      trial_ends_at: intent.trialEndsAt,
      cancel_at_period_end: intent.cancelAtPeriodEnd,
      polar_customer_id: intent.polarCustomerId,
      polar_subscription_id: intent.polarSubscriptionId,
      cloud_retention_until: intent.cloudRetentionUntil,
    }),
  })
  await assertOk(response, 'upsertSubscription')
}

export interface StoredSubscription {
  userId: string
  status: string
  polarSubscriptionId: string | null
  currentPeriodEnd: string | null
}

/**
 * Every row the reconciliation sweep might need to correct.
 *
 * Only live-ish rows are fetched: an account already marked lapsed cannot drift
 * further, so re-reading it every night would be pure cost.
 */
export async function listReconcilableSubscriptions(
  config: SupabaseAdminConfig,
  limit = 1000,
): Promise<StoredSubscription[]> {
  const fetcher = config.fetcher ?? fetch
  const query =
    'subscriptions?select=user_id,status,polar_subscription_id,current_period_end' +
    '&status=in.(trialing,active,past_due,canceled)' +
    // A LIMIT without an ORDER BY lets the planner hand back any subset it
    // likes, so which accounts the sweep can repair would be an accident of
    // the query plan. user_id is the primary key: ordering by it makes the
    // window stable and, when the sweep learns to page, resumable.
    '&order=user_id.asc' +
    `&limit=${limit}`
  const response = await fetcher(restUrl(config, query), {
    method: 'GET',
    headers: headers(config),
  })
  await assertOk(response, 'listReconcilableSubscriptions')
  const rows: unknown = await response.json()
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row: unknown) => {
    if (typeof row !== 'object' || row === null) return []
    const value = row as Record<string, unknown>
    if (typeof value.user_id !== 'string') return []
    return [
      {
        userId: value.user_id,
        status: typeof value.status === 'string' ? value.status : '',
        polarSubscriptionId:
          typeof value.polar_subscription_id === 'string' ? value.polar_subscription_id : null,
        currentPeriodEnd:
          typeof value.current_period_end === 'string' ? value.current_period_end : null,
      },
    ]
  })
}

/** Mark one account lapsed and start its retention clock. */
export async function markLapsed(
  config: SupabaseAdminConfig,
  userId: string,
  cloudRetentionUntil: string,
): Promise<void> {
  const fetcher = config.fetcher ?? fetch
  const response = await fetcher(
    restUrl(config, `subscriptions?user_id=eq.${encodeURIComponent(userId)}`),
    {
      method: 'PATCH',
      headers: headers(config, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ status: 'lapsed', cloud_retention_until: cloudRetentionUntil }),
    },
  )
  await assertOk(response, 'markLapsed')
}
