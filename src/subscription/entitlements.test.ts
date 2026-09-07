import { describe, expect, it } from 'vitest'
import {
  CLOUD_RETENTION_DAYS,
  ENTITLEMENT_GRACE_DAYS,
  FREE_ENTITLEMENTS,
  FREE_PER_BOARD_DAILY_SECONDS,
  AIR_ATTACHMENT_QUOTA_BYTES,
  AIR_MAX_PARTICIPANTS,
  AIR_MONTHLY_HOST_SECONDS,
  cloudRetentionDaysRemaining,
  deriveEntitlements,
  parseSubscriptionRow,
  trialDaysRemaining,
  type SubscriptionRecord,
} from './entitlements'

const NOW = Date.parse('2026-08-12T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function record(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    plan: 'air',
    status: 'active',
    billingInterval: 'year',
    currentPeriodEnd: new Date(NOW + 30 * DAY).toISOString(),
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    cloudRetentionUntil: null,
    ...overrides,
  }
}

describe('the constants the plan fixes', () => {
  // These numbers are duplicated in SQL and on the pricing page. A silent edit
  // here would change what people are sold without changing what they are told.
  it('pins the grace window that the SQL mirror also hard-codes', () => {
    expect(ENTITLEMENT_GRACE_DAYS).toBe(7)
  })

  it('pins the published tier limits', () => {
    expect(CLOUD_RETENTION_DAYS).toBe(90)
    expect(AIR_ATTACHMENT_QUOTA_BYTES).toBe(10 * 1024 ** 3)
    expect(AIR_MAX_PARTICIPANTS).toBe(10)
    expect(AIR_MONTHLY_HOST_SECONDS).toBe(40 * 60 * 60)
    expect(FREE_PER_BOARD_DAILY_SECONDS).toBe(20 * 60)
  })
})

describe('the free plan', () => {
  it('is what an account with no subscription gets', () => {
    expect(deriveEntitlements(null, NOW)).toBe(FREE_ENTITLEMENTS)
  })

  it('cannot sync, publish, or render exports, and has no cloud storage', () => {
    const free = deriveEntitlements(null, NOW)
    expect(free.isSubscribed).toBe(false)
    expect(free.canSync).toBe(false)
    expect(free.canPublish).toBe(false)
    expect(free.canExportRendered).toBe(false)
    expect(free.canUseCloudWidgets).toBe(false)
    expect(free.attachmentQuotaBytes).toBe(0)
    expect(free.versionHistoryDays).toBe(0)
  })

  it('can still host a live board, bounded per board per day', () => {
    const free = deriveEntitlements(null, NOW)
    expect(free.hostedSession.perBoardDailySeconds).toBe(FREE_PER_BOARD_DAILY_SECONDS)
    expect(free.hostedSession.monthlyHostSeconds).toBeNull()
  })
})

describe('statuses that hold Air', () => {
  it('grants Air while active inside the paid period', () => {
    const entitlements = deriveEntitlements(record({ status: 'active' }), NOW)
    expect(entitlements.isSubscribed).toBe(true)
    expect(entitlements.source).toBe('air')
    expect(entitlements.canSync).toBe(true)
    expect(entitlements.canPublish).toBe(true)
    expect(entitlements.hostedSession.monthlyHostSeconds).toBe(AIR_MONTHLY_HOST_SECONDS)
    expect(entitlements.hostedSession.perBoardDailySeconds).toBeNull()
  })

  it('grants Air during a trial and reports it as a trial', () => {
    const entitlements = deriveEntitlements(record({ status: 'trialing' }), NOW)
    expect(entitlements.isSubscribed).toBe(true)
    expect(entitlements.source).toBe('trial')
  })

  it('keeps a cancelled subscription working until its paid period runs out', () => {
    const cancelled = record({ status: 'canceled', cancelAtPeriodEnd: true })
    expect(deriveEntitlements(cancelled, NOW).isSubscribed).toBe(true)
    expect(deriveEntitlements(cancelled, NOW).source).toBe('air')
  })

  it('keeps a past-due subscription working while dunning retries', () => {
    const entitlements = deriveEntitlements(record({ status: 'past_due' }), NOW)
    expect(entitlements.isSubscribed).toBe(true)
    expect(entitlements.source).toBe('grace')
  })

  it('trusts the status when the provider has not sent a period end yet', () => {
    const entitlements = deriveEntitlements(record({ currentPeriodEnd: null }), NOW)
    expect(entitlements.isSubscribed).toBe(true)
  })
})

describe('the grace window', () => {
  const expired = record({ currentPeriodEnd: new Date(NOW - 1 * DAY).toISOString() })
  const periodEnd = Date.parse(expired.currentPeriodEnd!)

  it('keeps a device working past a missed renewal — a flight must not kill sync', () => {
    const entitlements = deriveEntitlements(expired, NOW)
    expect(entitlements.isSubscribed).toBe(true)
    expect(entitlements.source).toBe('grace')
  })

  it('still holds at the last instant of the window', () => {
    expect(deriveEntitlements(expired, periodEnd + ENTITLEMENT_GRACE_DAYS * DAY - 1).isSubscribed).toBe(
      true,
    )
  })

  it('drops to free once the window closes', () => {
    expect(deriveEntitlements(expired, periodEnd + ENTITLEMENT_GRACE_DAYS * DAY).isSubscribed).toBe(false)
    expect(deriveEntitlements(expired, periodEnd + (ENTITLEMENT_GRACE_DAYS + 1) * DAY).isSubscribed).toBe(
      false,
    )
  })
})

describe('lapsing', () => {
  it('loses Air immediately, with no grace, because lapsed is the settled end', () => {
    const lapsed = record({
      status: 'lapsed',
      currentPeriodEnd: new Date(NOW + 30 * DAY).toISOString(),
    })
    expect(deriveEntitlements(lapsed, NOW)).toBe(FREE_ENTITLEMENTS)
  })

  it('counts down the 90-day cloud retention clock', () => {
    const lapsed = record({
      status: 'lapsed',
      cloudRetentionUntil: new Date(NOW + 60 * DAY).toISOString(),
    })
    expect(cloudRetentionDaysRemaining(lapsed, NOW)).toBe(60)
    expect(cloudRetentionDaysRemaining(lapsed, NOW + 61 * DAY)).toBe(0)
  })

  it('reports no retention clock while the plan is live', () => {
    expect(cloudRetentionDaysRemaining(record(), NOW)).toBeNull()
    expect(cloudRetentionDaysRemaining(null, NOW)).toBeNull()
  })
})

describe('trial countdown', () => {
  it('counts whole days from the trial end', () => {
    const trialing = record({
      status: 'trialing',
      trialEndsAt: new Date(NOW + 12 * DAY).toISOString(),
    })
    expect(trialDaysRemaining(trialing, NOW)).toBe(12)
  })

  it('falls back to the period end when no trial end was sent', () => {
    const trialing = record({ status: 'trialing', trialEndsAt: null })
    expect(trialDaysRemaining(trialing, NOW)).toBe(30)
  })

  it('is null for anything that is not a trial', () => {
    expect(trialDaysRemaining(record({ status: 'active' }), NOW)).toBeNull()
    expect(trialDaysRemaining(null, NOW)).toBeNull()
  })

  it('never goes negative', () => {
    const trialing = record({
      status: 'trialing',
      trialEndsAt: new Date(NOW - 3 * DAY).toISOString(),
    })
    expect(trialDaysRemaining(trialing, NOW)).toBe(0)
  })
})

describe('parsing a row from the database', () => {
  const row = {
    plan: 'air_student',
    status: 'active',
    billing_interval: 'year',
    current_period_end: '2027-08-12T00:00:00+00:00',
    trial_ends_at: null,
    cancel_at_period_end: false,
    cloud_retention_until: null,
  }

  it('normalises snake_case into the record shape', () => {
    expect(parseSubscriptionRow(row)).toEqual({
      plan: 'air_student',
      status: 'active',
      billingInterval: 'year',
      currentPeriodEnd: '2027-08-12T00:00:00+00:00',
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
      cloudRetentionUntil: null,
    })
  })

  // The failure direction matters: a row we cannot read must cost us nothing,
  // not hand out free hosting.
  it('reads an unusable row as no subscription rather than as Air', () => {
    expect(parseSubscriptionRow(null)).toBeNull()
    expect(parseSubscriptionRow('air')).toBeNull()
    expect(parseSubscriptionRow([])).toBeNull()
    expect(parseSubscriptionRow({ ...row, status: 'vip' })).toBeNull()
    expect(parseSubscriptionRow({ ...row, plan: 'enterprise' })).toBeNull()
    expect(parseSubscriptionRow({ ...row, billing_interval: 'week' })).toBeNull()
    expect(parseSubscriptionRow({ ...row, status: undefined })).toBeNull()
  })

  it('drops unparseable dates instead of trusting them', () => {
    const parsed = parseSubscriptionRow({ ...row, current_period_end: 'soon' })
    expect(parsed?.currentPeriodEnd).toBeNull()
  })

  it('treats a non-boolean cancel flag as not cancelling', () => {
    const parsed = parseSubscriptionRow({ ...row, cancel_at_period_end: 'yes' })
    expect(parsed?.cancelAtPeriodEnd).toBe(false)
  })
})
