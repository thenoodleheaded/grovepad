import { afterEach, describe, expect, it } from 'vitest'
import { AUTH_STORAGE_KEY, durableAuthStorage } from './durableAuthStorage'

// ---------------------------------------------------------------------------
// Adopting the SDK's old entry is one-shot and destructive: it deletes the
// legacy key as it reads it. So it matters enormously WHICH read gets to spend
// it. The SDK's very first storage read of a page load is
// `<storageKey>-code-verifier`, issued unconditionally from the GoTrueClient
// constructor before any session read — if that read is allowed to consume the
// legacy entry, every user signed in under the old key lands on the login page
// with their token filed under a key nothing ever looks at.
//
// There is no DOM in this test environment, so localStorage is stood up by
// hand. `indexedDB` stays undefined on purpose: the mirror read swallows that
// and answers null, which is exactly the cold-boot path being exercised.
// ---------------------------------------------------------------------------

/** Item keys must be own enumerable properties — `adoptLegacySession` scans with `Object.keys`. */
function installLocalStorage(seed: Record<string, string>): Record<string, string> {
  const store: Record<string, string> = { ...seed }
  const define = (name: string, value: unknown): void => {
    Object.defineProperty(store, name, { value, enumerable: false, configurable: true })
  }
  define('getItem', (key: string) => (typeof store[key] === 'string' ? store[key] : null))
  define('setItem', (key: string, value: string) => {
    store[key] = value
  })
  define('removeItem', (key: string) => {
    delete store[key]
  })
  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
    writable: true,
  })
  return store
}

afterEach(() => {
  Reflect.deleteProperty(globalThis as object, 'localStorage')
})

describe('carrying an existing sign-in over to the durable key', () => {
  it('does not let the code-verifier read spend the legacy session', async () => {
    const store = installLocalStorage({ 'sb-abcdefgh-auth-token': '{"access_token":"legacy"}' })

    // What the SDK asks for first, before it has ever asked about a session.
    await expect(durableAuthStorage.getItem(`${AUTH_STORAGE_KEY}-code-verifier`)).resolves.toBeNull()
    expect(store['sb-abcdefgh-auth-token']).toBe('{"access_token":"legacy"}')
    expect(store[`${AUTH_STORAGE_KEY}-code-verifier`]).toBeUndefined()

    // And the session read that follows still finds it.
    await expect(durableAuthStorage.getItem(AUTH_STORAGE_KEY)).resolves.toBe(
      '{"access_token":"legacy"}',
    )
  })

  it('adopts the legacy entry once, on the session key, and clears it', async () => {
    const store = installLocalStorage({ 'sb-abcdefgh-auth-token': '{"access_token":"legacy"}' })

    await expect(durableAuthStorage.getItem(AUTH_STORAGE_KEY)).resolves.toBe(
      '{"access_token":"legacy"}',
    )
    // Left behind, it would silently sign the account back in after a sign-out.
    expect(store['sb-abcdefgh-auth-token']).toBeUndefined()
    expect(store[AUTH_STORAGE_KEY]).toBe('{"access_token":"legacy"}')
  })

  it('answers a non-session key from its own slot when one exists', async () => {
    installLocalStorage({ [`${AUTH_STORAGE_KEY}-code-verifier`]: 'verifier-123' })

    await expect(durableAuthStorage.getItem(`${AUTH_STORAGE_KEY}-code-verifier`)).resolves.toBe(
      'verifier-123',
    )
  })
})
