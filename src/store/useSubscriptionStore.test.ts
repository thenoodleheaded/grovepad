import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// This suite runs headless, with no DOM, so the browser's own storage is stood
// up in memory. The store treats a missing localStorage as "no cache" via its
// own try/catch — that path is real and safe, but it cannot prove the caching
// behaviour, which is the whole point of the offline tests below.
const memoryStorage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => memoryStorage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryStorage.set(key, value)
  },
  removeItem: (key: string) => {
    memoryStorage.delete(key)
  },
  clear: () => {
    memoryStorage.clear()
  },
})

// The store imports the Supabase client lazily; the mock stands in for the
// network so the offline path can be exercised without one.
const maybeSingle = vi.fn()
const eq = vi.fn(() => ({ maybeSingle }))
const select = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ select }))
let client: unknown = { from }

vi.mock('../lib/supabase', () => ({
  getSupabaseClient: () => Promise.resolve(client),
}))

const { useSubscriptionStore } = await import('./useSubscriptionStore')
const { FREE_ENTITLEMENTS } = await import('../subscription/entitlements')

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER_USER = '22222222-2222-4222-8222-222222222222'
const CACHE_KEY = `grovepad:subscription:v1:${USER}`
const DAY = 24 * 60 * 60 * 1000

function activeRow(periodEndMs: number) {
  return {
    plan: 'air',
    status: 'active',
    billing_interval: 'year',
    current_period_end: new Date(periodEndMs).toISOString(),
    trial_ends_at: null,
    cancel_at_period_end: false,
    cloud_retention_until: null,
  }
}

function resetStore(): void {
  useSubscriptionStore.setState({
    userId: null,
    record: null,
    entitlements: FREE_ENTITLEMENTS,
    status: 'idle',
    lastSyncedAt: null,
    fromCache: false,
    error: null,
  })
}

beforeEach(() => {
  localStorage.clear()
  client = { from }
  maybeSingle.mockReset()
  from.mockClear()
  resetStore()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('adopting an account', () => {
  it('starts free and becomes Air once the row arrives', async () => {
    maybeSingle.mockResolvedValue({ data: activeRow(Date.now() + 30 * DAY), error: null })
    expect(useSubscriptionStore.getState().entitlements.isSubscribed).toBe(false)

    await useSubscriptionStore.getState().adoptAccount(USER)

    const state = useSubscriptionStore.getState()
    expect(state.status).toBe('ready')
    expect(state.entitlements.isSubscribed).toBe(true)
    expect(state.fromCache).toBe(false)
  })

  it('stays free when the account has no subscription row', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    await useSubscriptionStore.getState().adoptAccount(USER)
    expect(useSubscriptionStore.getState().entitlements).toBe(FREE_ENTITLEMENTS)
    expect(useSubscriptionStore.getState().status).toBe('ready')
  })

  it('caches the row so the next boot does not start from nothing', async () => {
    maybeSingle.mockResolvedValue({ data: activeRow(Date.now() + 30 * DAY), error: null })
    await useSubscriptionStore.getState().adoptAccount(USER)
    expect(localStorage.getItem(CACHE_KEY)).toContain('"plan":"air"')
  })
})

describe('the offline path — a flight must not kill sync', () => {
  it('seeds Air from cache synchronously, before any request resolves', async () => {
    maybeSingle.mockResolvedValue({ data: activeRow(Date.now() + 30 * DAY), error: null })
    await useSubscriptionStore.getState().adoptAccount(USER)

    // A returning boot: same cache on disk, store back at its initial state,
    // and the network gone.
    resetStore()
    maybeSingle.mockRejectedValue(new Error('network down'))

    const adoption = useSubscriptionStore.getState().adoptAccount(USER)
    expect(useSubscriptionStore.getState().entitlements.isSubscribed).toBe(true)
    expect(useSubscriptionStore.getState().fromCache).toBe(true)
    await adoption
    expect(useSubscriptionStore.getState().entitlements.isSubscribed).toBe(true)
  })

  it('keeps the cached entitlement when the refresh fails', async () => {
    maybeSingle.mockResolvedValue({ data: activeRow(Date.now() + 30 * DAY), error: null })
    await useSubscriptionStore.getState().adoptAccount(USER)

    maybeSingle.mockRejectedValue(new Error('network down'))
    await useSubscriptionStore.getState().refresh()

    const state = useSubscriptionStore.getState()
    expect(state.status).toBe('error')
    expect(state.error).toBe('network down')
    // The whole point: a failed read revokes nothing.
    expect(state.entitlements.isSubscribed).toBe(true)
  })

  it('lets the grace window close on its own even while offline', async () => {
    const periodEnd = Date.now() - 1 * DAY
    maybeSingle.mockResolvedValue({ data: activeRow(periodEnd), error: null })
    await useSubscriptionStore.getState().adoptAccount(USER)
    expect(useSubscriptionStore.getState().entitlements.isSubscribed).toBe(true)

    // Eight days past the period end is past the seven-day grace.
    vi.spyOn(Date, 'now').mockReturnValue(periodEnd + 8 * DAY)
    useSubscriptionStore.getState().revalidate()
    expect(useSubscriptionStore.getState().entitlements.isSubscribed).toBe(false)
  })
})

describe('account boundaries', () => {
  it('never reads one account cache as another account', async () => {
    maybeSingle.mockResolvedValue({ data: activeRow(Date.now() + 30 * DAY), error: null })
    await useSubscriptionStore.getState().adoptAccount(USER)

    resetStore()
    maybeSingle.mockRejectedValue(new Error('offline'))
    const adoption = useSubscriptionStore.getState().adoptAccount(OTHER_USER)
    expect(useSubscriptionStore.getState().entitlements.isSubscribed).toBe(false)
    await adoption
    expect(useSubscriptionStore.getState().entitlements.isSubscribed).toBe(false)
  })

  it('drops to free and forgets the cache on sign-out', async () => {
    maybeSingle.mockResolvedValue({ data: activeRow(Date.now() + 30 * DAY), error: null })
    await useSubscriptionStore.getState().adoptAccount(USER)

    useSubscriptionStore.getState().reset()

    expect(useSubscriptionStore.getState().userId).toBeNull()
    expect(useSubscriptionStore.getState().entitlements).toBe(FREE_ENTITLEMENTS)
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
  })

  it('ignores a response that lands after the account changed', async () => {
    let release: (value: { data: unknown; error: null }) => void = () => {}
    maybeSingle.mockReturnValue(
      new Promise((resolve) => {
        release = resolve as typeof release
      }),
    )
    const pending = useSubscriptionStore.getState().adoptAccount(USER)
    useSubscriptionStore.setState({ userId: OTHER_USER })
    release({ data: activeRow(Date.now() + 30 * DAY), error: null })
    await pending

    expect(useSubscriptionStore.getState().entitlements.isSubscribed).toBe(false)
  })
})

describe('a build with no cloud configured', () => {
  it('reports the free plan as a settled answer, not an error', async () => {
    client = null
    await useSubscriptionStore.getState().adoptAccount(USER)
    const state = useSubscriptionStore.getState()
    expect(state.status).toBe('ready')
    expect(state.error).toBeNull()
    expect(state.entitlements).toBe(FREE_ENTITLEMENTS)
  })
})

describe('a tampered cache', () => {
  it('is read through the same validator, so a forged plan is refused', async () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        userId: USER,
        fetchedAt: Date.now(),
        record: { plan: 'lifetime', status: 'active', billingInterval: 'year' },
      }),
    )
    maybeSingle.mockRejectedValue(new Error('offline'))
    await useSubscriptionStore.getState().adoptAccount(USER)
    expect(useSubscriptionStore.getState().entitlements.isSubscribed).toBe(false)
  })

  it('ignores unparseable cache content', async () => {
    localStorage.setItem(CACHE_KEY, 'not json')
    maybeSingle.mockRejectedValue(new Error('offline'))
    await useSubscriptionStore.getState().adoptAccount(USER)
    expect(useSubscriptionStore.getState().entitlements.isSubscribed).toBe(false)
  })

  it('refuses a cache stamped with a different account id', async () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        userId: OTHER_USER,
        fetchedAt: Date.now(),
        record: {
          plan: 'air',
          status: 'active',
          billingInterval: 'year',
          currentPeriodEnd: new Date(Date.now() + 30 * DAY).toISOString(),
          trialEndsAt: null,
          cancelAtPeriodEnd: false,
          cloudRetentionUntil: null,
        },
      }),
    )
    maybeSingle.mockRejectedValue(new Error('offline'))
    await useSubscriptionStore.getState().adoptAccount(USER)
    expect(useSubscriptionStore.getState().entitlements.isSubscribed).toBe(false)
  })
})
