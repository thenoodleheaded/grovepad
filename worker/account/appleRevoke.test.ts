import { describe, expect, it, vi } from 'vitest'
import {
  corsHeaders,
  handleNativeRevoke,
  handleWebCallback,
  handleWebStart,
  preflight,
  type AccountEnv,
} from './appleRevoke'

const NOW_MS = Date.parse('2026-09-11T12:00:00.000Z')
const APPLE_SUBJECT = '001234.abcdef.0987'

async function keyPair(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const pkcs8 = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer)
  const base64 = btoa(String.fromCharCode(...pkcs8))
  return { pem: `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----`, publicKey: pair.publicKey }
}

function envWith(pem: string): AccountEnv {
  return {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    GROVEPAD_SITE_ORIGIN: 'https://grovepad.app',
    APPLE_TEAM_ID: 'TEAM123456',
    APPLE_KEY_ID: 'KEY1234567',
    APPLE_PRIVATE_KEY: pem,
    APPLE_NATIVE_CLIENT_ID: 'app.grovepad',
    APPLE_WEB_CLIENT_ID: 'app.grovepad.web',
    ACCOUNT_STATE_SECRET: 'state-secret-for-tests',
  }
}

function idToken(subject: string): string {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '')
  return `${encode({ alg: 'RS256' })}.${encode({ sub: subject, aud: 'app.grovepad' })}.signature`
}

interface FakeOptions {
  identities?: unknown[]
  tokenSubject?: string
  tokenOk?: boolean
  revokeOk?: boolean
}

function fakeApple(options: FakeOptions = {}) {
  const calls: Array<{ url: string; form: URLSearchParams | null; headers: Headers }> = []
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    const form = init?.body instanceof URLSearchParams ? init.body : null
    calls.push({ url, form, headers })
    if (url.endsWith('/auth/v1/user')) {
      if (headers.get('authorization') !== 'Bearer session-token') return new Response('{}', { status: 401 })
      return Response.json({
        id: 'grovepad-user',
        identities: options.identities ?? [{ provider: 'apple', identity_data: { sub: APPLE_SUBJECT } }],
      })
    }
    if (url === 'https://appleid.apple.com/auth/token') {
      if (options.tokenOk === false) return Response.json({ error: 'invalid_grant' }, { status: 400 })
      return Response.json({
        access_token: 'apple-access',
        refresh_token: 'apple-refresh',
        id_token: idToken(options.tokenSubject ?? APPLE_SUBJECT),
      })
    }
    if (url === 'https://appleid.apple.com/auth/revoke') {
      return new Response(null, { status: options.revokeOk === false ? 400 : 200 })
    }
    return new Response('unexpected', { status: 500 })
  })
  return { fetcher: fetcher as unknown as typeof fetch, calls }
}

function nativeRequest(body: unknown = { code: 'apple-code' }, bearer = 'session-token'): Request {
  return new Request('https://grovepad.app/api/account/apple/revoke', {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json', origin: 'tauri://localhost' },
    body: JSON.stringify(body),
  })
}

async function verifySecret(secret: string, publicKey: CryptoKey): Promise<Record<string, unknown>> {
  const [header, payload, signature] = secret.split('.')
  const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)), (c) => c.charCodeAt(0))
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    decode(signature ?? '') as unknown as ArrayBuffer,
    new TextEncoder().encode(`${header}.${payload}`) as unknown as ArrayBuffer,
  )
  expect(valid).toBe(true)
  return JSON.parse(new TextDecoder().decode(decode(payload ?? ''))) as Record<string, unknown>
}

describe('native app revocation', () => {
  it('redeems the code with the bundle ID and revokes the refresh token', async () => {
    const { pem, publicKey } = await keyPair()
    const apple = fakeApple()
    const response = await handleNativeRevoke(nativeRequest(), envWith(pem), { fetcher: apple.fetcher, nowMs: () => NOW_MS })

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('tauri://localhost')
    const exchange = apple.calls.find((call) => call.url.endsWith('/auth/token'))
    const revoke = apple.calls.find((call) => call.url.endsWith('/auth/revoke'))
    expect(exchange?.form?.get('client_id')).toBe('app.grovepad')
    expect(exchange?.form?.get('code')).toBe('apple-code')
    expect(exchange?.form?.has('redirect_uri')).toBe(false)
    expect(revoke?.form?.get('token')).toBe('apple-refresh')
    expect(revoke?.form?.get('token_type_hint')).toBe('refresh_token')

    const claims = await verifySecret(exchange?.form?.get('client_secret') ?? '', publicKey)
    expect(claims).toMatchObject({
      iss: 'TEAM123456',
      sub: 'app.grovepad',
      aud: 'https://appleid.apple.com',
      iat: NOW_MS / 1000,
      exp: NOW_MS / 1000 + 300,
    })
  })

  it('refuses a missing session, a non-Apple account, and a different Apple Account', async () => {
    const { pem } = await keyPair()
    const deps = (options?: FakeOptions) => ({ fetcher: fakeApple(options).fetcher, nowMs: () => NOW_MS })

    expect((await handleNativeRevoke(nativeRequest(undefined, 'wrong'), envWith(pem), deps())).status).toBe(401)
    expect((await handleNativeRevoke(nativeRequest(), envWith(pem), deps({ identities: [{ provider: 'email' }] }))).status).toBe(409)
    const other = fakeApple({ tokenSubject: 'someone-else' })
    const mismatch = await handleNativeRevoke(nativeRequest(), envWith(pem), { fetcher: other.fetcher, nowMs: () => NOW_MS })
    expect(mismatch.status).toBe(409)
    expect(other.calls.some((call) => call.url.endsWith('/auth/revoke'))).toBe(false)
  })

  it('reports Apple failures and missing configuration without pretending success', async () => {
    const { pem } = await keyPair()
    const run = (options: FakeOptions) => handleNativeRevoke(nativeRequest(), envWith(pem), { fetcher: fakeApple(options).fetcher, nowMs: () => NOW_MS })
    expect((await run({ tokenOk: false })).status).toBe(502)
    expect((await run({ revokeOk: false })).status).toBe(502)
    const unconfigured = await handleNativeRevoke(nativeRequest(), { ...envWith(pem), APPLE_PRIVATE_KEY: undefined }, { fetcher: fakeApple().fetcher })
    expect(unconfigured.status).toBe(503)
  })
})

describe('website revocation round trip', () => {
  async function start(pem: string, apple = fakeApple()) {
    const response = await handleWebStart(
      new Request('https://grovepad.app/api/account/apple/start', {
        method: 'POST',
        headers: { authorization: 'Bearer session-token', origin: 'https://grovepad.app' },
      }),
      envWith(pem),
      { fetcher: apple.fetcher, nowMs: () => NOW_MS },
    )
    const body = (await response.json()) as { url: string }
    return { response, url: new URL(body.url) }
  }

  function callback(fields: Record<string, string>): Request {
    return new Request('https://grovepad.app/api/account/apple/callback', { method: 'POST', body: new URLSearchParams(fields) })
  }

  it('sends the person to Apple with the Services ID and a signed state, then revokes on return', async () => {
    const { pem } = await keyPair()
    const { response, url } = await start(pem)
    expect(response.status).toBe(200)
    expect(url.origin + url.pathname).toBe('https://appleid.apple.com/auth/authorize')
    expect(url.searchParams.get('client_id')).toBe('app.grovepad.web')
    expect(url.searchParams.get('redirect_uri')).toBe('https://grovepad.app/api/account/apple/callback')
    expect(url.searchParams.get('response_mode')).toBe('form_post')

    const apple = fakeApple()
    const back = await handleWebCallback(
      callback({ code: 'web-code', state: url.searchParams.get('state') ?? '' }),
      envWith(pem),
      { fetcher: apple.fetcher, nowMs: () => NOW_MS + 60_000 },
    )
    expect(back.status).toBe(303)
    expect(back.headers.get('location')).toBe('https://grovepad.app/?apple-revoke=done')
    const exchange = apple.calls.find((call) => call.url.endsWith('/auth/token'))
    expect(exchange?.form?.get('client_id')).toBe('app.grovepad.web')
    expect(exchange?.form?.get('redirect_uri')).toBe('https://grovepad.app/api/account/apple/callback')
    expect(apple.calls.some((call) => call.url.endsWith('/auth/revoke'))).toBe(true)
  })

  it('rejects a forged or expired state, and treats cancelling at Apple as cancelled', async () => {
    const { pem } = await keyPair()
    const { url } = await start(pem)
    const state = url.searchParams.get('state') ?? ''
    const run = (fields: Record<string, string>, nowMs = NOW_MS) => {
      const apple = fakeApple()
      return handleWebCallback(callback(fields), envWith(pem), { fetcher: apple.fetcher, nowMs: () => nowMs })
        .then((response) => ({ location: response.headers.get('location'), apple }))
    }

    const forged = await run({ code: 'web-code', state: `${state.split('.')[0]}.not-the-signature` })
    expect(forged.location).toBe('https://grovepad.app/?apple-revoke=failed')
    expect(forged.apple.calls).toHaveLength(0)

    const expired = await run({ code: 'web-code', state }, NOW_MS + 11 * 60_000)
    expect(expired.location).toBe('https://grovepad.app/?apple-revoke=failed')

    const cancelled = await run({ error: 'user_cancelled_authorize', state })
    expect(cancelled.location).toBe('https://grovepad.app/?apple-revoke=cancelled')
    expect(cancelled.apple.calls).toHaveLength(0)
  })
})

describe('who may call', () => {
  it('answers preflight only for the website and the native shells', () => {
    const env = envWith('')
    const ask = (origin: string) => new Request('https://grovepad.app/api/account/apple/revoke', { method: 'OPTIONS', headers: { origin } })
    expect(preflight(ask('tauri://localhost'), env).headers.get('access-control-allow-origin')).toBe('tauri://localhost')
    expect(corsHeaders(ask('https://grovepad.app'), env)['Access-Control-Allow-Origin']).toBe('https://grovepad.app')
    expect(corsHeaders(ask('https://evil.example'), env)).toEqual({})
  })
})
