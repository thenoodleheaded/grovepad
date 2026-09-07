import { describe, expect, it } from 'vitest'
import {
  claimEvent,
  listReconcilableSubscriptions,
  SupabaseAdminError,
  type SupabaseAdminConfig,
} from './subscriptionStore'

const USER = '11111111-1111-4111-8111-111111111111'

function configWith(responder: (url: string) => Response): {
  config: SupabaseAdminConfig
  urls: string[]
} {
  const urls: string[] = []
  return {
    urls,
    config: {
      url: 'https://project.supabase.co',
      serviceRoleKey: 'service-role-key',
      fetcher: (async (input: RequestInfo | URL) => {
        const url = String(input)
        urls.push(url)
        return responder(url)
      }) as unknown as typeof fetch,
    },
  }
}

const EVENT = {
  eventId: 'msg_1',
  eventType: 'subscription.revoked',
  userId: USER,
  polarSubscriptionId: 'sub_1',
  payload: {},
}

describe('claimEvent', () => {
  it('reads a 409 as a duplicate delivery only when it carries 23505', async () => {
    const { config } = configWith(
      () => new Response('duplicate key value violates 23505', { status: 409 }),
    )
    expect(await claimEvent(config, EVENT)).toBe(false)
  })

  /**
   * PostgREST answers 409 for a foreign_key_violation too. Swallowing that as
   * a duplicate would acknowledge the delivery to Polar with no audit row and
   * no subscription write, and nothing would ever retry.
   */
  it('throws when a 409 is a foreign key violation rather than a duplicate', async () => {
    const { config } = configWith(
      () =>
        new Response(
          JSON.stringify({ code: '23503', message: 'violates foreign key constraint' }),
          { status: 409 },
        ),
    )
    await expect(claimEvent(config, EVENT)).rejects.toBeInstanceOf(SupabaseAdminError)
    await expect(claimEvent(config, EVENT)).rejects.toMatchObject({ status: 409 })
  })

  it('claims a delivery that PostgREST accepts', async () => {
    const { config } = configWith(() => new Response('', { status: 201 }))
    expect(await claimEvent(config, EVENT)).toBe(true)
  })
})

describe('listReconcilableSubscriptions', () => {
  /**
   * A LIMIT with no ORDER BY returns whichever rows the planner happens to
   * emit, so accounts outside that accident are never repaired.
   */
  it('asks for a stable key order alongside the limit', async () => {
    const { config, urls } = configWith(() => new Response('[]', { status: 200 }))
    await listReconcilableSubscriptions(config, 250)
    expect(urls[0]).toContain('order=user_id.asc')
    expect(urls[0]).toContain('limit=250')
  })
})
