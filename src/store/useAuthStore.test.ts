import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('../lib/supabase')
  vi.resetModules()
})

describe('auth initialization lifecycle', () => {
  it('does not strand a returning guest on the boot screen after auth already initialized', async () => {
    vi.doMock('../lib/supabase', () => ({
      supabaseConfigured: true,
      getSupabaseClient: async () => ({
        auth: {
          getSession: async () => ({ data: { session: null } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        },
      }),
    }))
    const { ensureAuthInitialized, useAuthStore } = await import('./useAuthStore')
    await ensureAuthInitialized()
    useAuthStore.getState().continueAsGuest()
    useAuthStore.getState().exitGuest()
    expect(useAuthStore.getState()).toMatchObject({ isGuest: false, loading: false })
  })
})
