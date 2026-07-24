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

  it('saves only compact public profile metadata and refreshes the live session', async () => {
    const updateUser = vi.fn(async () => ({
      data: {
        user: {
          id: 'person-1',
          email: 'person@example.com',
          user_metadata: { full_name: 'Mira', profile_color: '#a78bfa' },
        },
      },
      error: null,
    }))
    vi.doMock('../lib/supabase', () => ({
      supabaseConfigured: false,
      getSupabaseClient: async () => ({ auth: { updateUser } }),
    }))
    const { accountDisplayName, accountProfileColor, useAuthStore } = await import('./useAuthStore')
    useAuthStore.setState({
      session: {
        user: { id: 'person-1', email: 'person@example.com', user_metadata: {} },
      } as never,
    })

    await useAuthStore.getState().updateProfile({ displayName: '  Mira  ', profileColor: '#a78bfa' })

    expect(updateUser).toHaveBeenCalledWith({ data: { full_name: 'Mira', profile_color: '#a78bfa' } })
    expect(accountDisplayName(useAuthStore.getState().session)).toBe('Mira')
    expect(accountProfileColor(useAuthStore.getState().session)).toBe('#a78bfa')
  })
})
