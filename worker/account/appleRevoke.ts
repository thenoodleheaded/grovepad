// ---------------------------------------------------------------------------
// Sign in with Apple token revocation, for account deletion.
//
// Apple requires an app that offers Sign in with Apple to revoke the person's
// Apple tokens when they delete their account. Nothing here stores a token:
// the person confirms with Apple at the moment of deletion, this Worker trades
// that one-time authorization code for a token and revokes it immediately.
//
//   iPhone/iPad app  POST /api/account/apple/revoke   { code }  (bearer session)
//   website          POST /api/account/apple/start    -> Apple authorize URL
//                    POST /api/account/apple/callback  <- Apple form_post
//
// Codes from the app were issued to the bundle ID; codes from the website to
// the Services ID. Each must be redeemed and revoked with its own client_id.
// ---------------------------------------------------------------------------

export const APPLE_REVOKE_PATH = '/api/account/apple/revoke'
export const APPLE_START_PATH = '/api/account/apple/start'
export const APPLE_CALLBACK_PATH = '/api/account/apple/callback'

export interface AccountEnv {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  GROVEPAD_SITE_ORIGIN?: string
  APPLE_TEAM_ID?: string
  APPLE_KEY_ID?: string
  /** Full contents of the AuthKey_<KeyID>.p8 file. Worker secret only. */
  APPLE_PRIVATE_KEY?: string
  /** The app's bundle ID — the audience of tokens from the native sheet. */
  APPLE_NATIVE_CLIENT_ID?: string
  /** The Services ID — the audience of tokens from the website. */
  APPLE_WEB_CLIENT_ID?: string
  /** Signs the website round trip so a callback cannot be forged. */
  ACCOUNT_STATE_SECRET?: string
}

export interface AccountDeps {
  fetcher?: typeof fetch
  nowMs?: () => number
}

export type AccountRoute = 'native-revoke' | 'web-start' | 'web-callback'

export type RevokeOutcome = 'done' | 'cancelled' | 'failed'

const APPLE_AUTH_BASE = 'https://appleid.apple.com'
/** Where the Tauri shells load the frontend from. */
const NATIVE_APP_ORIGINS = new Set(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'])
const STATE_TTL_MS = 10 * 60 * 1000
const CLIENT_SECRET_TTL_S = 5 * 60
const MAX_CODE_LENGTH = 1024

const encoder = new TextEncoder()

export function accountRoute(pathname: string): AccountRoute | null {
  if (pathname === APPLE_REVOKE_PATH) return 'native-revoke'
  if (pathname === APPLE_START_PATH) return 'web-start'
  if (pathname === APPLE_CALLBACK_PATH) return 'web-callback'
  return null
}

function siteOrigin(env: AccountEnv): string {
  return (env.GROVEPAD_SITE_ORIGIN ?? 'https://grovepad.app').replace(/\/$/, '')
}

/** Only Grovepad's own website and the native shells may call the JSON routes. */
export function corsHeaders(request: Request, env: AccountEnv): Record<string, string> {
  const origin = request.headers.get('origin')
  if (!origin || (!NATIVE_APP_ORIGINS.has(origin) && origin !== siteOrigin(env))) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

export function preflight(request: Request, env: AccountEnv): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) })
}

function json(request: Request, env: AccountEnv, body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0', ...corsHeaders(request, env) },
  })
}

function redirectHome(env: AccountEnv, outcome: RevokeOutcome): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${siteOrigin(env)}/?apple-revoke=${outcome}`,
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}

// --- encoding ---------------------------------------------------------------

function base64UrlBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlText(text: string): string {
  return base64UrlBytes(encoder.encode(text))
}

function decodeBase64Url(value: string): string | null {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    return atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  } catch {
    return null
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

// --- Apple ------------------------------------------------------------------

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '')
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

/**
 * A short-lived client secret for one request. Generated per call, so unlike
 * the website secret in Supabase it never needs a six-month renewal.
 */
export async function appleClientSecret(env: AccountEnv, clientId: string, nowMs: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(env.APPLE_PRIVATE_KEY ?? ''),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const issuedAt = Math.floor(nowMs / 1000)
  const header = base64UrlText(JSON.stringify({ alg: 'ES256', kid: env.APPLE_KEY_ID, typ: 'JWT' }))
  const payload = base64UrlText(JSON.stringify({
    iss: env.APPLE_TEAM_ID,
    iat: issuedAt,
    exp: issuedAt + CLIENT_SECRET_TTL_S,
    aud: APPLE_AUTH_BASE,
    sub: clientId,
  }))
  const signingInput = `${header}.${payload}`
  // WebCrypto ECDSA already returns the raw r||s form a JWS signature needs.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(signingInput) as unknown as ArrayBuffer,
  )
  return `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`
}

/** The token came straight from Apple over TLS, so reading `sub` needs no re-verification. */
function subjectOf(idToken: string | null): string | null {
  const payload = idToken?.split('.')[1]
  if (!payload) return null
  const decoded = decodeBase64Url(payload)
  if (!decoded) return null
  try {
    return text(record(JSON.parse(decoded)).sub)
  } catch {
    return null
  }
}

interface AppleTokens {
  token: string
  hint: 'refresh_token' | 'access_token'
  subject: string | null
}

async function exchangeCode(
  env: AccountEnv,
  clientId: string,
  code: string,
  redirectUri: string | null,
  deps: Required<AccountDeps>,
): Promise<AppleTokens | null> {
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: await appleClientSecret(env, clientId, deps.nowMs()),
    code,
    grant_type: 'authorization_code',
  })
  if (redirectUri) form.set('redirect_uri', redirectUri)
  const response = await deps.fetcher(`${APPLE_AUTH_BASE}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  if (!response.ok) return null
  const body = record(await response.json().catch(() => null))
  const refresh = text(body.refresh_token)
  const access = text(body.access_token)
  const token = refresh ?? access
  if (!token) return null
  return { token, hint: refresh ? 'refresh_token' : 'access_token', subject: subjectOf(text(body.id_token)) }
}

async function revokeToken(
  env: AccountEnv,
  clientId: string,
  tokens: AppleTokens,
  deps: Required<AccountDeps>,
): Promise<boolean> {
  const response = await deps.fetcher(`${APPLE_AUTH_BASE}/auth/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: await appleClientSecret(env, clientId, deps.nowMs()),
      token: tokens.token,
      token_type_hint: tokens.hint,
    }),
  })
  return response.ok
}

// --- the caller ---------------------------------------------------------------

/** Confirm the bearer token with Supabase and return the account's Apple identity. */
async function resolveCaller(
  request: Request,
  env: AccountEnv,
  fetcher: typeof fetch,
): Promise<{ id: string; appleSubject: string | null } | null> {
  const authorization = request.headers.get('authorization')
  if (!authorization?.toLowerCase().startsWith('bearer ') || !env.SUPABASE_URL) return null
  const token = authorization.slice(7).trim()
  if (!token || token.length > 4096) return null
  const response = await fetcher(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY ?? '' },
  })
  if (!response.ok) return null
  const user = record(await response.json().catch(() => null))
  const id = text(user.id)
  if (!id) return null
  const identities = Array.isArray(user.identities) ? user.identities : []
  const apple = identities.map(record).find((identity) => identity.provider === 'apple')
  const appleSubject = apple
    ? text(record(apple.identity_data).sub) ?? text(apple.provider_id) ?? text(apple.id)
    : null
  return { id, appleSubject }
}

// --- signed state for the website round trip ----------------------------------

interface RoundTripState {
  subject: string
  expiresAt: number
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret) as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value) as unknown as ArrayBuffer)
  return base64UrlBytes(new Uint8Array(signature))
}

function sameText(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

async function signState(secret: string, state: RoundTripState): Promise<string> {
  const body = base64UrlText(JSON.stringify(state))
  return `${body}.${await hmac(secret, body)}`
}

async function readState(secret: string, raw: string, nowMs: number): Promise<RoundTripState | null> {
  const [body, signature, extra] = raw.split('.')
  if (!body || !signature || extra !== undefined) return null
  if (!sameText(signature, await hmac(secret, body))) return null
  const decoded = decodeBase64Url(body)
  if (!decoded) return null
  try {
    const value = record(JSON.parse(decoded))
    const subject = text(value.subject)
    const expiresAt = typeof value.expiresAt === 'number' ? value.expiresAt : 0
    if (!subject || expiresAt < nowMs) return null
    return { subject, expiresAt }
  } catch {
    return null
  }
}

// --- handlers ---------------------------------------------------------------------

function withDefaults(deps: AccountDeps): Required<AccountDeps> {
  return { fetcher: deps.fetcher ?? fetch, nowMs: deps.nowMs ?? Date.now }
}

function appleConfigured(env: AccountEnv): boolean {
  return Boolean(env.SUPABASE_URL && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY)
}

async function readCode(request: Request): Promise<string | null> {
  const body = record(await request.json().catch(() => null))
  const code = text(body.code)
  return code && code.length <= MAX_CODE_LENGTH ? code : null
}

/** The app already holds a fresh code from Apple's native sheet. */
export async function handleNativeRevoke(request: Request, env: AccountEnv, deps: AccountDeps = {}): Promise<Response> {
  const run = withDefaults(deps)
  if (request.method !== 'POST') return json(request, env, { error: 'Use POST.' }, 405)
  const clientId = env.APPLE_NATIVE_CLIENT_ID
  if (!appleConfigured(env) || !clientId) {
    return json(request, env, { error: 'Apple sign-in revocation is not configured.' }, 503)
  }
  const caller = await resolveCaller(request, env, run.fetcher)
  if (!caller) return json(request, env, { error: 'Sign in again to delete your account.' }, 401)
  if (!caller.appleSubject) return json(request, env, { error: 'This account is not linked to Apple.' }, 409)
  const code = await readCode(request)
  if (!code) return json(request, env, { error: 'Missing Apple confirmation.' }, 400)

  const tokens = await exchangeCode(env, clientId, code, null, run)
  if (!tokens) return json(request, env, { error: 'Apple could not confirm it is you. Try again.' }, 502)
  if (tokens.subject !== caller.appleSubject) {
    return json(request, env, { error: 'That Apple Account is not the one linked to this Grovepad account.' }, 409)
  }
  if (!(await revokeToken(env, clientId, tokens, run))) {
    return json(request, env, { error: 'Apple did not accept the request. Try again.' }, 502)
  }
  return json(request, env, { ok: true }, 200)
}

/** The website cannot show Apple's sheet, so it sends the person to Apple and back. */
export async function handleWebStart(request: Request, env: AccountEnv, deps: AccountDeps = {}): Promise<Response> {
  const run = withDefaults(deps)
  if (request.method !== 'POST') return json(request, env, { error: 'Use POST.' }, 405)
  const clientId = env.APPLE_WEB_CLIENT_ID
  const secret = env.ACCOUNT_STATE_SECRET
  if (!appleConfigured(env) || !clientId || !secret) {
    return json(request, env, { error: 'Apple sign-in revocation is not configured.' }, 503)
  }
  const caller = await resolveCaller(request, env, run.fetcher)
  if (!caller) return json(request, env, { error: 'Sign in again to delete your account.' }, 401)
  if (!caller.appleSubject) return json(request, env, { error: 'This account is not linked to Apple.' }, 409)

  const url = new URL(`${APPLE_AUTH_BASE}/auth/authorize`)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', `${siteOrigin(env)}${APPLE_CALLBACK_PATH}`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('response_mode', 'form_post')
  url.searchParams.set('state', await signState(secret, {
    subject: caller.appleSubject,
    expiresAt: run.nowMs() + STATE_TTL_MS,
  }))
  return json(request, env, { url: url.toString() }, 200)
}

/** Apple posts the code here; every outcome sends the person back to Grovepad. */
export async function handleWebCallback(request: Request, env: AccountEnv, deps: AccountDeps = {}): Promise<Response> {
  const run = withDefaults(deps)
  const clientId = env.APPLE_WEB_CLIENT_ID
  const secret = env.ACCOUNT_STATE_SECRET
  if (request.method !== 'POST' || !appleConfigured(env) || !clientId || !secret) return redirectHome(env, 'failed')

  const form = await request.formData().catch(() => null)
  if (!form) return redirectHome(env, 'failed')
  const state = await readState(secret, String(form.get('state') ?? ''), run.nowMs())
  if (!state) return redirectHome(env, 'failed')
  if (form.get('error')) return redirectHome(env, 'cancelled')
  const code = String(form.get('code') ?? '')
  if (!code || code.length > MAX_CODE_LENGTH) return redirectHome(env, 'failed')

  const tokens = await exchangeCode(env, clientId, code, `${siteOrigin(env)}${APPLE_CALLBACK_PATH}`, run)
  if (!tokens || tokens.subject !== state.subject) return redirectHome(env, 'failed')
  return redirectHome(env, (await revokeToken(env, clientId, tokens, run)) ? 'done' : 'failed')
}
