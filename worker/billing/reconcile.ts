// ---------------------------------------------------------------------------
// The nightly repair pass.
//
// Webhooks go missing. A deploy lands mid-delivery, a retry budget runs out, an
// event is dropped between claiming it and applying it. Every one of those
// leaves a row that says "active" for somebody who cancelled, or "past_due" for
// somebody whose payment went through — and nobody notices, because the failure
// is silent by construction.
//
// So the truth is re-asked once a day rather than assumed. Polar's own
// subscription list is authoritative; our table is a cache of it that happens
// to be readable by row-level security.
//
// This pass only ever converges toward Polar. It never invents an entitlement,
// and the one thing it does unilaterally — lapsing a row whose grace window has
// fully closed — is the conservative direction.
// ---------------------------------------------------------------------------

import { CLOUD_RETENTION_DAYS, interpretPolarEvent, type ProductCatalogue } from './polarEvents'
import {
  listReconcilableSubscriptions,
  markLapsed,
  upsertSubscription,
  type SupabaseAdminConfig,
} from './subscriptionStore'

/** Mirrors ENTITLEMENT_GRACE_DAYS in src/subscription/entitlements.ts. */
const GRACE_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface ReconcileOptions {
  config: SupabaseAdminConfig
  catalogue: ProductCatalogue
  polarAccessToken: string
  polarApiBase?: string
  fetcher?: typeof fetch
  nowMs?: number
  /** Bound the work so one bad night cannot run for hours. */
  maxAccounts?: number
}

export interface ReconcileReport {
  examined: number
  corrected: number
  lapsed: number
  failed: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Ask Polar what one subscription actually looks like right now.
 *
 * A 404 is meaningful rather than an error: the subscription no longer exists
 * at the provider, so whatever we think we know about it is stale.
 */
async function fetchPolarSubscription(options: {
  polarAccessToken: string
  apiBase: string
  fetcher: typeof fetch
  subscriptionId: string
}): Promise<Record<string, unknown> | 'missing' | null> {
  const response = await options.fetcher(
    `${options.apiBase}/v1/subscriptions/${encodeURIComponent(options.subscriptionId)}`,
    { headers: { Authorization: `Bearer ${options.polarAccessToken}` } },
  )
  if (response.status === 404) return 'missing'
  if (!response.ok) return null
  const body: unknown = await response.json().catch(() => null)
  return isRecord(body) ? body : null
}

/**
 * Lapse a row whose paid period plus its grace window has fully elapsed.
 *
 * This is the safety net under a webhook that never arrived: without it, a
 * subscription that silently stopped renewing would keep its entitlement
 * forever, because nothing else would ever write that row again.
 */
async function lapseIfExpired(
  config: SupabaseAdminConfig,
  row: { userId: string; currentPeriodEnd: string | null },
  nowMs: number,
): Promise<boolean> {
  if (!row.currentPeriodEnd) return false
  const periodEnd = Date.parse(row.currentPeriodEnd)
  if (!Number.isFinite(periodEnd)) return false
  if (nowMs < periodEnd + GRACE_DAYS * MS_PER_DAY) return false
  await markLapsed(
    config,
    row.userId,
    new Date(nowMs + CLOUD_RETENTION_DAYS * MS_PER_DAY).toISOString(),
  )
  return true
}

/**
 * Bring our table back in line with Polar.
 *
 * Errors on one account never abort the sweep: a single unreachable
 * subscription must not leave the other 999 unreconciled.
 */
export async function reconcileSubscriptions(options: ReconcileOptions): Promise<ReconcileReport> {
  const fetcher = options.fetcher ?? fetch
  const nowMs = options.nowMs ?? Date.now()
  const apiBase = (options.polarApiBase ?? 'https://api.polar.sh').replace(/\/$/, '')
  const report: ReconcileReport = { examined: 0, corrected: 0, lapsed: 0, failed: 0 }

  const rows = await listReconcilableSubscriptions(options.config, options.maxAccounts ?? 1000)

  for (const row of rows) {
    report.examined += 1
    try {
      // A row with no provider id can never be checked against Polar. All that
      // can be said about it is whether its own grace window has run out.
      if (!row.polarSubscriptionId) {
        if (await lapseIfExpired(options.config, row, nowMs)) report.lapsed += 1
        continue
      }

      const remote = await fetchPolarSubscription({
        polarAccessToken: options.polarAccessToken,
        apiBase,
        fetcher,
        subscriptionId: row.polarSubscriptionId,
      })
      if (remote === null) {
        report.failed += 1
        continue
      }
      if (remote === 'missing') {
        await markLapsed(
          options.config,
          row.userId,
          new Date(nowMs + CLOUD_RETENTION_DAYS * MS_PER_DAY).toISOString(),
        )
        report.lapsed += 1
        continue
      }

      // Reuse the webhook's own interpreter by wrapping the object in the shape
      // it expects. One mapping, not two — a reconciliation that disagreed with
      // the webhook would be worse than no reconciliation at all.
      const intent = interpretPolarEvent(
        { type: 'subscription.updated', data: remote },
        options.catalogue,
        nowMs,
      )
      if (intent.kind !== 'upsert') {
        report.failed += 1
        continue
      }
      // Compare instants, not strings. Polar's timestamp comes back through
      // `new Date(...).toISOString()` (`...T00:00:00.000Z`) while PostgREST
      // renders the same instant as `...T00:00:00+00:00`, so a string equality
      // here never holds and every unchanged row would be rewritten nightly —
      // pinning `corrected` to `examined` and hiding real webhook drift.
      const remoteEnd = intent.currentPeriodEnd
      const storedEnd = row.currentPeriodEnd
      const sameEnd =
        remoteEnd === null || storedEnd === null
          ? remoteEnd === storedEnd
          : Date.parse(remoteEnd) === Date.parse(storedEnd)
      if (intent.status === row.status && sameEnd) {
        continue
      }
      await upsertSubscription(options.config, intent)
      report.corrected += 1
      if (intent.status === 'lapsed') report.lapsed += 1
    } catch {
      report.failed += 1
    }
  }

  return report
}
