// ---------------------------------------------------------------------------
// The one owner of "what does this account get".
//
// Every gate in the app imports from here. Nothing else re-derives `isSubscribed`
// from a status string, because the moment two places decide what "past_due"
// means they will disagree, and the disagreement will be a person losing their
// boards on a plane.
//
// This module is pure: a record in, an entitlement out, no clock of its own and
// no network. The server mirror is public.has_air_entitlement() in
// supabase/migrations/20260812090000_subscriptions.sql — the grace window is
// duplicated there and pinned by entitlements.test.ts.
//
// The line the whole plan rests on: anything on the user's own machine is free
// forever. Nothing in this file gates a local board, a widget, a skin, or an
// export. Those are not entitlements, they are the product.
// ---------------------------------------------------------------------------

export type SubscriptionPlan = 'air' | 'air_student'

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'lapsed'

export type BillingInterval = 'month' | 'year'

/** A normalised `public.subscriptions` row. Dates are ISO-8601 or null. */
export interface SubscriptionRecord {
  plan: SubscriptionPlan
  status: SubscriptionStatus
  billingInterval: BillingInterval
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  cancelAtPeriodEnd: boolean
  /** When cloud copies are deleted after a lapse. Null while the plan is live. */
  cloudRetentionUntil: string | null
}

/** Why the current entitlement is what it is — for honest UI copy, not gating. */
export type EntitlementSource = 'free' | 'trial' | 'air' | 'grace'

export interface HostedSessionLimits {
  /** Concurrent people on a board this account hosts. Guests are never charged. */
  maxParticipants: number
  /** Free tier's rule, said in one breath: 20 minutes per board per day. */
  perBoardDailySeconds: number | null
  /** Air tier's ceiling: 40 hours of hosted session time per month. */
  monthlyHostSeconds: number | null
}

export interface Entitlements {
  isSubscribed: boolean
  source: EntitlementSource
  /** Push this account's own canvases to the cloud. Joining is always free. */
  canSync: boolean
  /** Publish a canvas publicly. Free tier has no publish surface at all. */
  canPublish: boolean
  /** PDF and PNG export. JSON and Markdown export are never gated. */
  canExportRendered: boolean
  /** Home-screen widgets that refresh from the cloud. Local ones are free. */
  canUseCloudWidgets: boolean
  attachmentQuotaBytes: number
  versionHistoryDays: number
  hostedSession: HostedSessionLimits
  /** Days of read-only cloud retention after a lapse. */
  cloudRetentionDays: number
}

// --- Constants the plan fixes -------------------------------------------------

/**
 * How long a known period end keeps working after it passes. Covers three real
 * situations at once: a dunning retry that has not settled, a webhook we never
 * received, and a device that has been offline since before the renewal.
 *
 * MIRRORED in SQL as `interval '7 days'`. Change both or neither.
 */
export const ENTITLEMENT_GRACE_DAYS = 7

/** Cloud copies stay downloadable this long after a lapse, then are deleted. */
export const CLOUD_RETENTION_DAYS = 90

export const AIR_ATTACHMENT_QUOTA_BYTES = 10 * 1024 * 1024 * 1024
export const AIR_VERSION_HISTORY_DAYS = 365
export const AIR_MAX_PARTICIPANTS = 10
export const AIR_MONTHLY_HOST_SECONDS = 40 * 60 * 60

/** Free hosting: 20 minutes per board per day. */
export const FREE_PER_BOARD_DAILY_SECONDS = 20 * 60
/**
 * Free hosting is bounded by time, not by headcount, but an unbounded room is
 * an unbounded bill. The same ceiling as Air is the conservative reading: it
 * never makes the free tier feel counted, and it caps the worst case.
 */
export const FREE_MAX_PARTICIPANTS = 10

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Statuses that still hold Air until their paid period runs out. */
const ENTITLED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>([
  'trialing',
  'active',
  'past_due',
  'canceled',
])

// --- The free plan, stated once ----------------------------------------------

/**
 * What an account with no subscription gets. A signed-out guest and a signed-in
 * free account get exactly this, because a free account is not a lesser paid
 * account — it is the product, and it only ever loosens after launch.
 */
export const FREE_ENTITLEMENTS: Entitlements = Object.freeze({
  isSubscribed: false,
  source: 'free',
  canSync: false,
  canPublish: false,
  canExportRendered: false,
  canUseCloudWidgets: false,
  attachmentQuotaBytes: 0,
  versionHistoryDays: 0,
  hostedSession: Object.freeze({
    maxParticipants: FREE_MAX_PARTICIPANTS,
    perBoardDailySeconds: FREE_PER_BOARD_DAILY_SECONDS,
    monthlyHostSeconds: null,
  }),
  cloudRetentionDays: CLOUD_RETENTION_DAYS,
}) as Entitlements

const AIR_HOSTED_SESSION: HostedSessionLimits = Object.freeze({
  maxParticipants: AIR_MAX_PARTICIPANTS,
  perBoardDailySeconds: null,
  monthlyHostSeconds: AIR_MONTHLY_HOST_SECONDS,
})

function subscribedEntitlements(source: EntitlementSource): Entitlements {
  return {
    isSubscribed: true,
    source,
    canSync: true,
    canPublish: true,
    canExportRendered: true,
    canUseCloudWidgets: true,
    attachmentQuotaBytes: AIR_ATTACHMENT_QUOTA_BYTES,
    versionHistoryDays: AIR_VERSION_HISTORY_DAYS,
    hostedSession: AIR_HOSTED_SESSION,
    cloudRetentionDays: CLOUD_RETENTION_DAYS,
  }
}

// --- Derivation ---------------------------------------------------------------

function parseTime(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The verdict. `nowMs` is passed in rather than read, so every caller — tests,
 * the store, a Worker — is looking at the same clock on purpose.
 */
export function deriveEntitlements(
  record: SubscriptionRecord | null,
  nowMs: number,
): Entitlements {
  if (!record) return FREE_ENTITLEMENTS
  // 'lapsed' is the only status that loses Air the moment it is written. It is
  // the settled end state, not a payment that might still land.
  if (!ENTITLED_STATUSES.has(record.status)) return FREE_ENTITLEMENTS

  const periodEnd = parseTime(record.currentPeriodEnd)
  // No end date means the provider has not told us one yet. Trusting the status
  // alone is right here: the alternative is refusing sync to somebody who has
  // just paid, and the reconciliation sweep corrects a stale row within a day.
  if (periodEnd !== null && nowMs >= periodEnd + ENTITLEMENT_GRACE_DAYS * MS_PER_DAY) {
    return FREE_ENTITLEMENTS
  }

  const withinPaidPeriod = periodEnd === null || nowMs < periodEnd
  if (record.status === 'trialing') return subscribedEntitlements(withinPaidPeriod ? 'trial' : 'grace')
  if (!withinPaidPeriod) return subscribedEntitlements('grace')
  if (record.status === 'past_due') return subscribedEntitlements('grace')
  return subscribedEntitlements('air')
}

/** Days left before a lapsed account's cloud copies are deleted, or null. */
export function cloudRetentionDaysRemaining(
  record: SubscriptionRecord | null,
  nowMs: number,
): number | null {
  const until = parseTime(record?.cloudRetentionUntil ?? null)
  if (until === null) return null
  return Math.max(0, Math.ceil((until - nowMs) / MS_PER_DAY))
}

/** Whole days left in a trial, or null when the account is not trialling. */
export function trialDaysRemaining(
  record: SubscriptionRecord | null,
  nowMs: number,
): number | null {
  if (record?.status !== 'trialing') return null
  const endsAt = parseTime(record.trialEndsAt) ?? parseTime(record.currentPeriodEnd)
  if (endsAt === null) return null
  return Math.max(0, Math.ceil((endsAt - nowMs) / MS_PER_DAY))
}

// --- Parsing ------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function enumField<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

function isoField(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null
}

const PLANS = ['air', 'air_student'] as const
const STATUSES = ['trialing', 'active', 'past_due', 'canceled', 'lapsed'] as const
const INTERVALS = ['month', 'year'] as const

/**
 * Validate a PostgREST row before it is trusted. An unknown or malformed row
 * reads as no subscription, never as Air: the failure direction has to be the
 * one that costs us money rather than the one that hands out free hosting.
 */
export function parseSubscriptionRow(row: unknown): SubscriptionRecord | null {
  if (!isRecord(row)) return null
  const plan = enumField(row.plan, PLANS)
  const status = enumField(row.status, STATUSES)
  const billingInterval = enumField(row.billing_interval, INTERVALS)
  if (!plan || !status || !billingInterval) return null
  return {
    plan,
    status,
    billingInterval,
    currentPeriodEnd: isoField(row.current_period_end),
    trialEndsAt: isoField(row.trial_ends_at),
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    cloudRetentionUntil: isoField(row.cloud_retention_until),
  }
}
