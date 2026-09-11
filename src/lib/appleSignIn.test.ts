import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createAppleNonce,
  isAppleSignInCancel,
  isNativeAppleHost,
  signInWithAppleNative,
  visibleOAuthProviderIds,
} from './appleSignIn'

const tauri = { __TAURI_INTERNALS__: {} }
const iPhoneUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_2 like Mac OS X) AppleWebKit/605.1.15'
const macUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'

describe('isNativeAppleHost', () => {
  it('is false on the website, even on an iPhone', () => {
    expect(isNativeAppleHost({}, { userAgent: iPhoneUa })).toBe(false)
  })

  it('is true in the iPhone app and in the iPad app that reports a Mac user agent', () => {
    expect(isNativeAppleHost(tauri, { userAgent: iPhoneUa })).toBe(true)
    expect(isNativeAppleHost(tauri, { userAgent: macUa, maxTouchPoints: 5 })).toBe(true)
  })

  it('is false in the macOS desktop app', () => {
    expect(isNativeAppleHost(tauri, { userAgent: macUa, maxTouchPoints: 0 })).toBe(false)
  })
})

describe('visibleOAuthProviderIds', () => {
  const ids = ['google', 'apple'] as const

  it('keeps every provider on the website', () => {
    expect(visibleOAuthProviderIds(ids, false)).toEqual(['google', 'apple'])
  })

  it('offers only Apple in the iOS app', () => {
    expect(visibleOAuthProviderIds(ids, true)).toEqual(['apple'])
  })
})

describe('createAppleNonce', () => {
  it('sends Apple the SHA-256 of the raw nonce Supabase receives', async () => {
    const nonce = await createAppleNonce((bytes) => bytes.map((_, index) => index))
    expect(nonce.raw).toBe([...Array(32).keys()].map((n) => n.toString(16).padStart(2, '0')).join(''))
    expect(nonce.hashed).toBe(createHash('sha256').update(nonce.raw).digest('hex'))
  })
})

describe('signInWithAppleNative', () => {
  const nonce = { raw: 'raw-nonce', hashed: 'hashed-nonce' }

  it('gives Apple the hashed nonce and Supabase the token with the raw nonce', async () => {
    const invoke = vi.fn().mockResolvedValue({ identityToken: 'apple.jwt' })
    const signInWithIdToken = vi.fn().mockResolvedValue({ error: null })
    const result = await signInWithAppleNative(
      { auth: { signInWithIdToken } } as never,
      { invoke, createNonce: async () => nonce },
    )
    expect(invoke).toHaveBeenCalledWith('sign_in_with_apple', { nonce: 'hashed-nonce' })
    expect(signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'apple.jwt', nonce: 'raw-nonce' })
    expect(result).toEqual({ canceled: false, error: null })
  })

  it('treats dismissing the sheet as a quiet cancel, not an error', async () => {
    const invoke = vi.fn().mockRejectedValue('Apple sign-in canceled')
    const signInWithIdToken = vi.fn()
    const result = await signInWithAppleNative(
      { auth: { signInWithIdToken } } as never,
      { invoke, createNonce: async () => nonce },
    )
    expect(result).toEqual({ canceled: true, error: null })
    expect(signInWithIdToken).not.toHaveBeenCalled()
    expect(isAppleSignInCancel(new Error('Apple sign-in canceled'))).toBe(true)
  })

  it('reports a native failure and a rejected token plainly', async () => {
    const failed = await signInWithAppleNative(
      { auth: { signInWithIdToken: vi.fn() } } as never,
      { invoke: vi.fn().mockRejectedValue('ASAuthorizationError 1000'), createNonce: async () => nonce },
    )
    expect(failed).toEqual({ canceled: false, error: 'Apple sign-in did not complete. Please try again.' })

    const rejected = await signInWithAppleNative(
      { auth: { signInWithIdToken: vi.fn().mockResolvedValue({ error: { message: 'Unacceptable audience' } }) } } as never,
      { invoke: vi.fn().mockResolvedValue({ identityToken: 'apple.jwt' }), createNonce: async () => nonce },
    )
    expect(rejected).toEqual({ canceled: false, error: 'Unacceptable audience' })
  })
})
