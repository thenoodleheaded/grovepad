import type { SupabaseClient } from '@supabase/supabase-js'

/** What the iOS plugin hands back from Apple's native sign-in sheet. */
export interface NativeAppleCredential {
  identityToken: string
  authorizationCode?: string | null
  givenName?: string | null
  familyName?: string | null
}

export interface AppleNonce {
  /** Sent to Supabase, which hashes it and compares with the token's claim. */
  raw: string
  /** SHA-256 hex of `raw`, sent to Apple and embedded in the ID token. */
  hashed: string
}

export type AppleInvoke = (
  command: 'sign_in_with_apple',
  args: { nonce: string },
) => Promise<NativeAppleCredential>

interface HostWindow {
  [key: string]: unknown
}

interface HostNavigator {
  userAgent: string
  maxTouchPoints?: number
}

/** The exact rejection the Swift plugin uses when the person dismisses the sheet. */
const CANCEL_MESSAGE = 'Apple sign-in canceled'

const toHex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * True inside Grovepad's iPhone/iPad app, where Apple's native sheet replaces
 * the web redirect. A web redirect cannot come back there: the page lives at
 * tauri://localhost, which no sign-in provider will redirect to.
 */
export function isNativeAppleHost(
  win: HostWindow | undefined = typeof window === 'undefined' ? undefined : (window as unknown as HostWindow),
  nav: HostNavigator | undefined = typeof navigator === 'undefined' ? undefined : navigator,
): boolean {
  if (!win || !('__TAURI_INTERNALS__' in win) || !nav) return false
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true
  // iPadOS WebKit reports a desktop Mac user agent; touch points give it away.
  return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1
}

/**
 * The iOS app offers Apple alone. Its web-redirect providers cannot return to
 * the app, and App Review expects Sign in with Apple wherever any third-party
 * sign-in appears, so showing only the one that works satisfies both.
 */
export function visibleOAuthProviderIds<T extends string>(ids: readonly T[], nativeApple: boolean): T[] {
  return nativeApple ? ids.filter((id) => id === 'apple') : [...ids]
}

export async function createAppleNonce(
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = (bytes) => crypto.getRandomValues(bytes),
): Promise<AppleNonce> {
  const raw = toHex(random(new Uint8Array(32)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return { raw, hashed: toHex(new Uint8Array(digest)) }
}

export function isAppleSignInCancel(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes(CANCEL_MESSAGE)
}

export async function defaultAppleInvoke(): Promise<AppleInvoke> {
  const { invoke } = await import('@tauri-apps/api/core')
  return (command, args) => invoke<NativeAppleCredential>(command, args)
}

/**
 * Show Apple's native sheet, then trade its ID token for a Supabase session.
 * The session arrives through the normal auth listener, exactly as a web
 * sign-in does. Dismissing the sheet is not an error.
 */
export async function signInWithAppleNative(
  supabase: Pick<SupabaseClient, 'auth'>,
  options: { invoke?: AppleInvoke; createNonce?: () => Promise<AppleNonce> } = {},
): Promise<{ canceled: boolean; error: string | null }> {
  const nonce = await (options.createNonce ?? createAppleNonce)()
  let credential: NativeAppleCredential
  try {
    const invoke = options.invoke ?? (await defaultAppleInvoke())
    credential = await invoke('sign_in_with_apple', { nonce: nonce.hashed })
  } catch (error) {
    if (isAppleSignInCancel(error)) return { canceled: true, error: null }
    return { canceled: false, error: 'Apple sign-in did not complete. Please try again.' }
  }
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: nonce.raw,
  })
  return { canceled: false, error: error ? error.message : null }
}
