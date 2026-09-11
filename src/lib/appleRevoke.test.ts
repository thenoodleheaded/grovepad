import { describe, expect, it, vi } from 'vitest'
import {
  APPLE_REVOKE_PENDING_KEY,
  consumeAppleRevokeReturn,
  isAppleAccount,
  revokeAppleOnNative,
  startAppleRevokeOnWeb,
} from './appleRevoke'

const NOW = Date.parse('2026-09-11T12:00:00.000Z')

function session(identities: Array<{ provider: string }> = [{ provider: 'apple' }]) {
  return { access_token: 'session-token', user: { id: 'person-1', identities, app_metadata: {} } } as never
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  }
}

describe('isAppleAccount', () => {
  it('recognises an Apple identity and ignores everyone else', () => {
    expect(isAppleAccount(session())).toBe(true)
    expect(isAppleAccount(session([{ provider: 'email' }]))).toBe(false)
    expect(isAppleAccount(null)).toBe(false)
  })
})

describe('revokeAppleOnNative', () => {
  it('confirms with Apple, then sends the code to the account Worker with the session', async () => {
    const invoke = vi.fn().mockResolvedValue({ identityToken: 'apple.jwt', authorizationCode: 'apple-code' })
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }))
    await revokeAppleOnNative(session(), { invoke, fetcher })

    expect(invoke.mock.calls[0]?.[1]?.nonce).toMatch(/^[0-9a-f]{64}$/)
    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(url).toBe('https://grovepad.app/api/account/apple/revoke')
    expect(init.headers.authorization).toBe('Bearer session-token')
    expect(JSON.parse(init.body)).toEqual({ code: 'apple-code' })
  })

  it('stops the deletion when the person cancels or the Worker refuses', async () => {
    const cancel = revokeAppleOnNative(session(), { invoke: vi.fn().mockRejectedValue('Apple sign-in canceled'), fetcher: vi.fn() })
    await expect(cancel).rejects.toThrow('Apple needs you to confirm')

    const refused = revokeAppleOnNative(session(), {
      invoke: vi.fn().mockResolvedValue({ identityToken: 'x', authorizationCode: 'c' }),
      fetcher: vi.fn().mockResolvedValue(Response.json({ error: 'That Apple Account is not the one linked to this Grovepad account.' }, { status: 409 })),
    })
    await expect(refused).rejects.toThrow('not the one linked')
  })
})

describe('website round trip', () => {
  it('remembers the deletion this browser started, then goes to Apple', async () => {
    const storage = memoryStorage()
    const navigate = vi.fn()
    const fetcher = vi.fn().mockResolvedValue(Response.json({ url: 'https://appleid.apple.com/auth/authorize?client_id=app.grovepad.web' }))
    await startAppleRevokeOnWeb(session(), { fetcher, storage, navigate, nowMs: () => NOW })

    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/account/apple/start')
    expect(JSON.parse(storage.data.get(APPLE_REVOKE_PENDING_KEY) ?? '{}')).toEqual({ userId: 'person-1', at: NOW })
    expect(navigate).toHaveBeenCalledWith('https://appleid.apple.com/auth/authorize?client_id=app.grovepad.web')
  })

  it('refuses to navigate anywhere but Apple', async () => {
    const navigate = vi.fn()
    const fetcher = vi.fn().mockResolvedValue(Response.json({ url: 'https://evil.example/' }))
    await expect(startAppleRevokeOnWeb(session(), { fetcher, storage: memoryStorage(), navigate })).rejects.toThrow('Account not deleted')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('resumes only a fresh deletion this browser started for this account', () => {
    const marker = JSON.stringify({ userId: 'person-1', at: NOW })
    const replaceUrl = vi.fn()
    const run = (href: string, stored: Record<string, string>, nowMs = NOW + 60_000, userId = 'person-1') =>
      consumeAppleRevokeReturn(userId, { href, storage: memoryStorage(stored), replaceUrl, nowMs: () => nowMs })

    expect(run('https://grovepad.app/', { [APPLE_REVOKE_PENDING_KEY]: marker })).toBeNull()
    expect(replaceUrl).not.toHaveBeenCalled()

    expect(run('https://grovepad.app/?apple-revoke=done', { [APPLE_REVOKE_PENDING_KEY]: marker })).toBe('resume')
    expect(replaceUrl).toHaveBeenLastCalledWith('https://grovepad.app/')
    expect(run('https://grovepad.app/?apple-revoke=cancelled', { [APPLE_REVOKE_PENDING_KEY]: marker })).toBe('cancelled')

    // A bare link, a stale marker, or somebody else's marker never deletes anything.
    expect(run('https://grovepad.app/?apple-revoke=done', {})).toBeNull()
    expect(run('https://grovepad.app/?apple-revoke=done', { [APPLE_REVOKE_PENDING_KEY]: marker }, NOW + 16 * 60_000)).toBeNull()
    expect(run('https://grovepad.app/?apple-revoke=done', { [APPLE_REVOKE_PENDING_KEY]: marker }, NOW, 'person-2')).toBeNull()
  })
})
