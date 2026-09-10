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

describe('deleting the account', () => {
  it('asks the server first, then forgets the account on this device', async () => {
    const rpc = vi.fn(async () => ({ error: null }))
    const signOut = vi.fn(async () => ({ error: null }))
    const clearLocalAccountData = vi.fn(async () => undefined)
    vi.doMock('../lib/supabase', () => ({
      supabaseConfigured: true,
      getSupabaseClient: async () => ({ rpc, auth: { signOut } }),
    }))
    vi.doMock('../utils/signOutTeardown', () => ({ clearLocalAccountData }))
    const { useAuthStore } = await import('./useAuthStore')
    useAuthStore.setState({
      session: { user: { id: 'person-1', email: 'person@example.com', user_metadata: {} } } as never,
      rememberedAccount: { id: 'person-1', name: 'Mira', color: '#a78bfa' },
    })

    await useAuthStore.getState().deleteAccount()

    // No argument: the function reads auth.uid() server-side, so a caller can
    // never name somebody else's account.
    expect(rpc).toHaveBeenCalledWith('delete_own_account')
    expect(clearLocalAccountData).toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({ session: null, isGuest: false, rememberedAccount: null })
  })

  it('keeps the boards on this device when the server refuses to delete', async () => {
    const rpc = vi.fn(async () => ({ error: { message: 'network unreachable' } }))
    const signOut = vi.fn(async () => ({ error: null }))
    const clearLocalAccountData = vi.fn(async () => undefined)
    vi.doMock('../lib/supabase', () => ({
      supabaseConfigured: true,
      getSupabaseClient: async () => ({ rpc, auth: { signOut } }),
    }))
    vi.doMock('../utils/signOutTeardown', () => ({ clearLocalAccountData }))
    const { useAuthStore } = await import('./useAuthStore')
    const session = { user: { id: 'person-1', email: 'person@example.com', user_metadata: {} } } as never
    useAuthStore.setState({ session })

    await expect(useAuthStore.getState().deleteAccount()).rejects.toThrow('network unreachable')

    // The whole point of deleting server-side first: a failed deletion must not
    // cost somebody their boards, and must leave them still signed in.
    expect(clearLocalAccountData).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
    expect(useAuthStore.getState().session).toBe(session)
  })
})
