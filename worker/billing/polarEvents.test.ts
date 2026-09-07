import { describe, expect, it } from 'vitest'
import { interpretPolarEvent, resolveUserId, type ProductCatalogue } from './polarEvents'

const NOW = Date.parse('2026-08-12T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const USER = '11111111-1111-4111-8111-111111111111'

const CATALOGUE: ProductCatalogue = {
  prod_yearly: { plan: 'air', interval: 'year' },
  prod_monthly: { plan: 'air', interval: 'month' },
  prod_student: { plan: 'air_student', interval: 'year' },
}

function subscription(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sub_abc',
    status: 'active',
    product_id: 'prod_yearly',
    customer_id: 'cus_xyz',
    current_period_end: new Date(NOW + 365 * DAY).toISOString(),
    cancel_at_period_end: false,
    metadata: { grovepad_user_id: USER },
    ...overrides,
  }
}

function event(type: string, data: Record<string, unknown> = subscription()) {
  return { type, data }
}

describe('which events we act on', () => {
  it('acts on the subscription lifecycle events', () => {
    for (const type of [
      'subscription.created',
      'subscription.updated',
      'subscription.active',
      'subscription.canceled',
      'subscription.uncanceled',
      'subscription.revoked',
    ]) {
      expect(interpretPolarEvent(event(type), CATALOGUE, NOW).kind).toBe('upsert')
    }
  })

  it('ignores events it has not been taught, rather than guessing', () => {
    for (const type of ['checkout.created', 'benefit_grant.created', 'customer.updated']) {
      expect(interpretPolarEvent(event(type), CATALOGUE, NOW)).toEqual({
        kind: 'ignore',
        reason: 'unhandled-event-type',
      })
    }
  })

  it('ignores payloads it cannot read', () => {
    expect(interpretPolarEvent(null, CATALOGUE, NOW).kind).toBe('ignore')
    expect(interpretPolarEvent('nope', CATALOGUE, NOW).kind).toBe('ignore')
    expect(interpretPolarEvent({}, CATALOGUE, NOW)).toEqual({
      kind: 'ignore',
      reason: 'malformed-payload',
    })
    expect(interpretPolarEvent({ type: 'subscription.active' }, CATALOGUE, NOW)).toEqual({
      kind: 'ignore',
      reason: 'no-subscription-object',
    })
  })
})

describe('finding the account', () => {
  it('reads our id from checkout metadata', () => {
    expect(resolveUserId(subscription())).toBe(USER)
  })

  it('falls back through the other channels Polar can carry it in', () => {
    expect(resolveUserId(subscription({ metadata: {}, external_customer_id: USER }))).toBe(USER)
    expect(resolveUserId(subscription({ metadata: {}, customer: { external_id: USER } }))).toBe(
      USER,
    )
    expect(
      resolveUserId(
        subscription({ metadata: {}, customer: { metadata: { grovepad_user_id: USER } } }),
      ),
    ).toBe(USER)
  })

  // A real payment that entitles nobody is the worst failure this system has,
  // so it must be visible rather than silently applied to the wrong account.
  it('refuses to guess when no account is attached', () => {
    expect(
      interpretPolarEvent(
        event('subscription.active', subscription({ metadata: {} })),
        CATALOGUE,
        NOW,
      ),
    ).toEqual({ kind: 'ignore', reason: 'no-account-reference' })
  })
})

describe('mapping Polar status to ours', () => {
  const cases: Array<[string, string]> = [
    ['trialing', 'trialing'],
    ['active', 'active'],
    ['past_due', 'past_due'],
    ['canceled', 'canceled'],
    ['unpaid', 'lapsed'],
    ['incomplete', 'lapsed'],
    ['incomplete_expired', 'lapsed'],
  ]

  it.each(cases)('maps %s to %s', (polar, ours) => {
    const intent = interpretPolarEvent(
      event('subscription.updated', subscription({ status: polar })),
      CATALOGUE,
      NOW,
    )
    expect(intent.kind === 'upsert' && intent.status).toBe(ours)
  })

  it('lapses on a status it has never seen, rather than granting Air', () => {
    const intent = interpretPolarEvent(
      event('subscription.updated', subscription({ status: 'some_new_state' })),
      CATALOGUE,
      NOW,
    )
    expect(intent.kind === 'upsert' && intent.status).toBe('lapsed')
  })

  // Polar's explicit "access has ended now". It has to beat the status field,
  // or a revoked subscription would keep Air through a grace window it no
  // longer deserves.
  it('treats subscription.revoked as final regardless of the status field', () => {
    const intent = interpretPolarEvent(
      event('subscription.revoked', subscription({ status: 'active' })),
      CATALOGUE,
      NOW,
    )
    expect(intent.kind === 'upsert' && intent.status).toBe('lapsed')
  })
})

describe('which plan was bought', () => {
  it('reads plan and interval from the product catalogue', () => {
    const student = interpretPolarEvent(
      event('subscription.active', subscription({ product_id: 'prod_student' })),
      CATALOGUE,
      NOW,
    )
    expect(student.kind === 'upsert' && student.plan).toBe('air_student')
    expect(student.kind === 'upsert' && student.billingInterval).toBe('year')

    const monthly = interpretPolarEvent(
      event('subscription.active', subscription({ product_id: 'prod_monthly' })),
      CATALOGUE,
      NOW,
    )
    expect(monthly.kind === 'upsert' && monthly.billingInterval).toBe('month')
  })

  it('reads the product id from a nested product object too', () => {
    const intent = interpretPolarEvent(
      event(
        'subscription.active',
        subscription({ product_id: undefined, product: { id: 'prod_student' } }),
      ),
      CATALOGUE,
      NOW,
    )
    expect(intent.kind === 'upsert' && intent.plan).toBe('air_student')
  })

  // Somebody paid, so they get an entitlement — but never the student rate by
  // accident, and the interval comes from what Polar actually reports.
  it('still entitles an unknown product, at the plain plan', () => {
    const intent = interpretPolarEvent(
      event(
        'subscription.active',
        subscription({ product_id: 'prod_unheard_of', recurring_interval: 'month' }),
      ),
      CATALOGUE,
      NOW,
    )
    expect(intent.kind === 'upsert' && intent.plan).toBe('air')
    expect(intent.kind === 'upsert' && intent.billingInterval).toBe('month')
  })
})

describe('the fields carried through', () => {
  it('normalises dates to ISO and keeps the provider ids', () => {
    const intent = interpretPolarEvent(
      event(
        'subscription.created',
        subscription({
          status: 'trialing',
          trial_ends_at: '2026-09-11T00:00:00Z',
          cancel_at_period_end: true,
        }),
      ),
      CATALOGUE,
      NOW,
    )
    expect(intent).toMatchObject({
      kind: 'upsert',
      userId: USER,
      status: 'trialing',
      trialEndsAt: '2026-09-11T00:00:00.000Z',
      cancelAtPeriodEnd: true,
      polarCustomerId: 'cus_xyz',
      polarSubscriptionId: 'sub_abc',
    })
  })

  it('drops a date it cannot parse instead of passing it on', () => {
    const intent = interpretPolarEvent(
      event('subscription.active', subscription({ current_period_end: 'next tuesday' })),
      CATALOGUE,
      NOW,
    )
    expect(intent.kind === 'upsert' && intent.currentPeriodEnd).toBeNull()
  })

  it('starts the 90-day retention clock only when access has ended', () => {
    const lapsed = interpretPolarEvent(event('subscription.revoked'), CATALOGUE, NOW)
    expect(lapsed.kind === 'upsert' && lapsed.cloudRetentionUntil).toBe(
      new Date(NOW + 90 * DAY).toISOString(),
    )

    const live = interpretPolarEvent(event('subscription.active'), CATALOGUE, NOW)
    expect(live.kind === 'upsert' && live.cloudRetentionUntil).toBeNull()
  })
})
