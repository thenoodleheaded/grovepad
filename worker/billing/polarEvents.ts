// ---------------------------------------------------------------------------
// Turning a Polar webhook payload into what our `subscriptions` row should say.
//
// Pure on purpose: no network, no clock of its own, no database. The whole
// question "what does this event mean for this account" is answerable from the
// payload plus the current time, which makes every awkward case — a revoke that
// arrives before the cancel, a product id we have never seen, an event with no
// account attached — a test rather than a production surprise.
//
// The status vocabulary here is OURS, not Polar's. Polar's states are mapped
// into the five that src/subscription/entitlements.ts knows how to reason
// about, and anything unrecognised maps to the safe side.
// ---------------------------------------------------------------------------

export type SubscriptionPlan = 'air' | 'air_student'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'lapsed'
export type BillingInterval = 'month' | 'year'

/** Mirrors CLOUD_RETENTION_DAYS in src/subscription/entitlements.ts. */
export const CLOUD_RETENTION_DAYS = 90

export interface ProductCatalogue {
  /** Polar product id → what that product actually sells. */
  readonly [productId: string]: { plan: SubscriptionPlan; interval: BillingInterval }
}

export interface SubscriptionUpsert {
  kind: 'upsert'
  userId: string
  plan: SubscriptionPlan
  status: SubscriptionStatus
  billingInterval: BillingInterval
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  cancelAtPeriodEnd: boolean
  polarCustomerId: string | null
  polarSubscriptionId: string | null
  /** Set only when the account has just lost access. */
  cloudRetentionUntil: string | null
}

export interface IgnoredEvent {
  kind: 'ignore'
  reason:
    | 'unhandled-event-type'
    | 'malformed-payload'
    | 'no-account-reference'
    | 'no-subscription-object'
}

export type BillingIntent = SubscriptionUpsert | IgnoredEvent

/**
 * The events we act on. Everything else — checkout progress, benefit grants,
 * customer edits — is acknowledged and ignored, because acting on an event we
 * have not thought about is how entitlements get granted by accident.
 */
const HANDLED_EVENTS = new Set([
  'subscription.created',
  'subscription.updated',
  'subscription.active',
  'subscription.canceled',
  'subscription.uncanceled',
  'subscription.revoked',
])

/**
 * Polar's subscription states → ours.
 *
 * `unpaid` and `incomplete_expired` are terminal failures, so they lapse
 * immediately. `incomplete` is a checkout that never completed: it has never
 * granted anything, so it lapses too rather than sitting as a half-entitlement.
 */
const STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  canceled: 'canceled',
  unpaid: 'lapsed',
  incomplete: 'lapsed',
  incomplete_expired: 'lapsed',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

/**
 * Which Grovepad account this belongs to.
 *
 * Checkout attaches our user id in metadata, and Polar echoes it on the
 * subscription. `external_id` on the customer is the second channel, used when
 * an account is linked after a signed-out purchase. Several shapes are accepted
 * because the alternative — one blessed path — silently drops real payments
 * when Polar moves a field, and a dropped payment is a support ticket from
 * somebody who has already been charged.
 */
export function resolveUserId(subscription: Record<string, unknown>): string | null {
  const metadata = isRecord(subscription.metadata) ? subscription.metadata : {}
  const customer = isRecord(subscription.customer) ? subscription.customer : {}
  const customerMetadata = isRecord(customer.metadata) ? customer.metadata : {}
  return (
    stringOrNull(metadata.grovepad_user_id) ??
    stringOrNull(metadata.user_id) ??
    stringOrNull(subscription.external_customer_id) ??
    stringOrNull(customer.external_id) ??
    stringOrNull(customerMetadata.grovepad_user_id) ??
    null
  )
}

function resolveProduct(
  subscription: Record<string, unknown>,
  catalogue: ProductCatalogue,
): { plan: SubscriptionPlan; interval: BillingInterval } {
  const product = isRecord(subscription.product) ? subscription.product : {}
  const productId = stringOrNull(subscription.product_id) ?? stringOrNull(product.id) ?? ''
  const known = catalogue[productId]
  if (known) return known

  // An unknown product still deserves an entitlement — somebody paid — but it
  // gets the plain plan and the interval Polar reports, never the student rate.
  const recurring = stringOrNull(subscription.recurring_interval)
  return { plan: 'air', interval: recurring === 'month' ? 'month' : 'year' }
}

/**
 * Interpret one event.
 *
 * `nowMs` is only consulted to stamp the retention clock on a lapse, so the
 * function stays deterministic for every other path.
 */
export function interpretPolarEvent(
  payload: unknown,
  catalogue: ProductCatalogue,
  nowMs: number,
): BillingIntent {
  if (!isRecord(payload)) return { kind: 'ignore', reason: 'malformed-payload' }
  const type = stringOrNull(payload.type)
  if (!type) return { kind: 'ignore', reason: 'malformed-payload' }
  if (!HANDLED_EVENTS.has(type)) return { kind: 'ignore', reason: 'unhandled-event-type' }

  const subscription = isRecord(payload.data) ? payload.data : null
  if (!subscription) return { kind: 'ignore', reason: 'no-subscription-object' }

  const userId = resolveUserId(subscription)
  // Without an account this cannot be applied to anyone. The caller still
  // records the event, so a mis-linked purchase is findable rather than lost.
  if (!userId) return { kind: 'ignore', reason: 'no-account-reference' }

  const { plan, interval } = resolveProduct(subscription, catalogue)

  // `subscription.revoked` is Polar's explicit "access has ended now", and it
  // overrides whatever the status field happens to say. Treating it as
  // authoritative is what stops a revoked subscription keeping Air through the
  // grace window it no longer deserves.
  const rawStatus = stringOrNull(subscription.status) ?? ''
  const status: SubscriptionStatus =
    type === 'subscription.revoked' ? 'lapsed' : (STATUS_MAP[rawStatus] ?? 'lapsed')

  const lapsed = status === 'lapsed'

  return {
    kind: 'upsert',
    userId,
    plan,
    status,
    billingInterval: interval,
    currentPeriodEnd:
      isoOrNull(subscription.current_period_end) ?? isoOrNull(subscription.ends_at),
    trialEndsAt: isoOrNull(subscription.trial_ends_at) ?? isoOrNull(subscription.trial_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    polarCustomerId:
      stringOrNull(subscription.customer_id) ??
      (isRecord(subscription.customer) ? stringOrNull(subscription.customer.id) : null),
    polarSubscriptionId: stringOrNull(subscription.id),
    cloudRetentionUntil: lapsed
      ? new Date(nowMs + CLOUD_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
      : null,
  }
}
