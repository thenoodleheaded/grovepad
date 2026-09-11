import type { Session } from '@supabase/supabase-js'
import { createAppleNonce, defaultAppleInvoke, isAppleSignInCancel, type AppleInvoke } from './appleSignIn'

// ---------------------------------------------------------------------------
// Revoking Sign in with Apple when an account is deleted (App Review 5.1.1(v)).
// The account Worker does the revoking; see worker/account/appleRevoke.ts.
// Nothing here stores an Apple token.
// ---------------------------------------------------------------------------

/** Marks a website deletion this browser started, so a bare link cannot resume one. */
export const APPLE_REVOKE_PENDING_KEY = 'grovepad:account:apple-revoke-pending:v1'
const PENDING_TTL_MS = 15 * 60 * 1000
const SITE_ORIGIN = 'https://grovepad.app'

export type AppleRevokeReturn = 'resume' | 'cancelled' | 'failed'

const CANCELLED = 'Account not deleted. Apple needs you to confirm before it can be disconnected.'
const NOT_CONFIRMED = 'Account not deleted. Apple could not confirm it is you. Try again.'

export function isAppleAccount(session: Session | null): boolean {
  if (!session) return false
  if ((session.user.identities ?? []).some((identity) => identity.provider === 'apple')) return true
  const providers: unknown = session.user.app_metadata?.providers
  return Array.isArray(providers) && providers.includes('apple')
}

/** The native shells load from tauri://localhost, so they need the absolute address. */
export function accountApiUrl(path: string, nativeApp: boolean): string {
  return nativeApp ? `${SITE_ORIGIN}${path}` : path
}

async function serverError(response: Response, fallback: string): Promise<string> {
  const body: unknown = await response.json().catch(() => null)
  const message = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).error : null
  return `Account not deleted. ${typeof message === 'string' && message ? message : fallback}`
}

/** iPhone/iPad app: Apple's sheet gives a fresh code, the Worker revokes with it. */
export async function revokeAppleOnNative(
  session: Session,
  deps: { fetcher?: typeof fetch; invoke?: AppleInvoke } = {},
): Promise<void> {
  const nonce = await createAppleNonce()
  let code: string | null | undefined
  try {
    const invoke = deps.invoke ?? (await defaultAppleInvoke())
    code = (await invoke('sign_in_with_apple', { nonce: nonce.hashed })).authorizationCode
  } catch (error) {
    throw new Error(isAppleSignInCancel(error) ? CANCELLED : NOT_CONFIRMED)
  }
  if (!code) throw new Error(NOT_CONFIRMED)
  const response = await (deps.fetcher ?? fetch)(accountApiUrl('/api/account/apple/revoke', true), {
    method: 'POST',
    headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!response.ok) throw new Error(await serverError(response, 'Apple could not be disconnected. Try again.'))
}

/** Website: go to Apple; the Worker revokes and sends the person back to Grovepad. */
export async function startAppleRevokeOnWeb(
  session: Session,
  deps: {
    fetcher?: typeof fetch
    storage?: Pick<Storage, 'setItem'>
    navigate?: (url: string) => void
    nowMs?: () => number
  } = {},
): Promise<void> {
  const response = await (deps.fetcher ?? fetch)(accountApiUrl('/api/account/apple/start', false), {
    method: 'POST',
    headers: { authorization: `Bearer ${session.access_token}` },
  })
  if (!response.ok) throw new Error(await serverError(response, 'Apple could not be reached. Try again.'))
  const body: unknown = await response.json().catch(() => null)
  const url = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).url : null
  if (typeof url !== 'string' || !url.startsWith('https://appleid.apple.com/')) {
    throw new Error('Account not deleted. Apple could not be reached. Try again.')
  }
  try {
    (deps.storage ?? localStorage).setItem(
      APPLE_REVOKE_PENDING_KEY,
      JSON.stringify({ userId: session.user.id, at: (deps.nowMs ?? Date.now)() }),
    )
  } catch {
    throw new Error('Account not deleted. This browser blocked the storage account deletion needs.')
  }
  ;(deps.navigate ?? ((target: string) => globalThis.location.assign(target)))(url)
}

/**
 * Read — and always strip — the `?apple-revoke=` result Apple's round trip
 * leaves in the address. Only a deletion this browser started for this account
 * in the last 15 minutes counts; anything else returns null.
 */
export function consumeAppleRevokeReturn(
  userId: string,
  deps: {
    href?: string
    storage?: Pick<Storage, 'getItem' | 'removeItem'>
    replaceUrl?: (url: string) => void
    nowMs?: () => number
  } = {},
): AppleRevokeReturn | null {
  const url = new URL(deps.href ?? globalThis.location.href)
  const outcome = url.searchParams.get('apple-revoke')
  if (!outcome) return null
  url.searchParams.delete('apple-revoke')
  ;(deps.replaceUrl ?? ((next: string) => globalThis.history.replaceState(null, '', next)))(url.toString())

  let pending: unknown = null
  try {
    const storage = deps.storage ?? localStorage
    pending = JSON.parse(storage.getItem(APPLE_REVOKE_PENDING_KEY) ?? 'null')
    storage.removeItem(APPLE_REVOKE_PENDING_KEY)
  } catch {
    return null
  }
  const marker = typeof pending === 'object' && pending !== null ? (pending as Record<string, unknown>) : null
  const fresh = marker !== null
    && marker.userId === userId
    && typeof marker.at === 'number'
    && (deps.nowMs ?? Date.now)() - marker.at <= PENDING_TTL_MS
  if (!fresh) return null
  if (outcome === 'done') return 'resume'
  return outcome === 'cancelled' ? 'cancelled' : 'failed'
}
