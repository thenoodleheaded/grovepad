import { useState, type FormEvent, type ReactElement } from 'react'
import type { Provider } from '@supabase/supabase-js'
import { ArrowRight, Loader2, WandSparkles } from 'lucide-react'
import { getSupabaseClient, supabaseConfigured } from '../../lib/supabase'
import { ensureAuthInitialized, useAuthStore } from '../../store/useAuthStore'
import { isNativeAppleHost, signInWithAppleNative, visibleOAuthProviderIds } from '../../lib/appleSignIn'

type Mode = 'signin' | 'signup'

interface Notice {
  kind: 'error' | 'success'
  text: string
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.02.15 3.5 2.7.24.03c2.2-2.1 3.5-5.1 3.5-8.6"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.8-2.1-6.8-5l-.14.01-3.7 2.8-.05.13C3.3 21.3 7.3 24 12 24"
      />
      <path
        fill="#FBBC05"
        d="M5.2 14.4c-.3-.7-.4-1.5-.4-2.4 0-.8.2-1.6.4-2.4l-.01-.16-3.7-2.9-.12.06C.5 8.2 0 10 0 12s.5 3.8 1.4 5.4l3.8-3"
      />
      <path
        fill="#EB4335"
        d="M12 4.6c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.4 6.6l3.8 3c1-2.9 3.6-5 6.8-5"
      />
    </svg>
  )
}

function AppleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 384 512" fill="currentColor" aria-hidden>
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  )
}

/** Quick sign-in providers, in display order — add another Supabase OAuth
 *  provider here and it appears in the grid with no further wiring.
 *
 *  `tint` follows each brand's own sign-in button convention rather than one
 *  uniform recipe: Google's mark already carries its official multicolor
 *  palette, so its island stays neutral glass; Apple ships a
 *  monochrome mark and is conventionally rendered on a near-black button. */
const OAUTH_PROVIDERS: Array<{
  id: Provider
  label: string
  Mark: () => ReactElement
  tint: string
}> = [
  { id: 'google', label: 'Google', Mark: GoogleMark, tint: 'text-neutral-100 hover:bg-white/5' },
  { id: 'apple', label: 'Apple', Mark: AppleMark, tint: 'bg-black/40 text-white' },
]

/** Grovepad's front door is this sign-in screen, so it carries the product
 *  pitch too — a first-time visitor arrives here, not on a separate marketing
 *  page. Shots scroll one-up on a phone and sit three-up from `lg`. */
const SHOTS: Array<{ src: string; alt: string; caption: string }> = [
  {
    src: '/screens/notes.webp',
    alt: 'A Grovepad board of lecture notes: a formula sheet, a source list, definitions and a study log laid out side by side on one canvas.',
    caption: 'Notes, sources and formulas on one canvas.',
  },
  {
    src: '/screens/math.webp',
    alt: 'A Grovepad money board: a monthly budget, a ledger with a running total, a savings rate and a debt payoff plan, with values flowing between the cards.',
    caption: 'Budgets and ledgers that add themselves up.',
  },
  {
    src: '/screens/wires.webp',
    alt: 'A Grovepad automation board: cards wired to each other, where a weekly target and hours done feed a pace calculation that arms an alert.',
    caption: 'Wire one card into another; the value flows.',
  },
]

function ProductShots({ className = '' }: { className?: string }) {
  return (
    <div className={`-mx-4 flex w-[calc(100%+2rem)] snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:w-full lg:snap-none lg:overflow-visible lg:px-0 ${className}`}>
      {SHOTS.map((shot) => (
        <figure key={shot.src} className="m-0 w-[78%] shrink-0 snap-center lg:w-auto lg:flex-1">
          <img
            src={shot.src}
            alt={shot.alt}
            width={1440}
            height={900}
            loading="lazy"
            decoding="async"
            className="block w-full rounded-xl border border-neutral-800 shadow-lg"
          />
          <figcaption className="mt-1.5 text-[10px] leading-snug text-neutral-500">
            {shot.caption}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

function authRedirectUrl(): string {
  const url = new URL(window.location.href)
  return url.searchParams.has('collaborate') ? url.toString() : url.origin
}

/** Full-screen login gate — Supabase auth with a local-first guest exit. */
export function LoginPage({ sharedCanvasLink = false }: { sharedCanvasLink?: boolean }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const continueAsGuest = useAuthStore((state) => state.continueAsGuest)
  const nativeApple = isNativeAppleHost()
  const visibleProviderIds = visibleOAuthProviderIds(OAUTH_PROVIDERS.map((provider) => provider.id), nativeApple)
  const providers = OAUTH_PROVIDERS.filter((provider) => visibleProviderIds.includes(provider.id))

  const fail = (text: string) => setNotice({ kind: 'error', text })
  const succeed = (text: string) => setNotice({ kind: 'success', text })

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabaseConfigured) return
    setNotice(null)
    setBusy('password')
    try {
      await ensureAuthInitialized()
      const supabase = await getSupabaseClient()
      if (!supabase) return
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) fail(error.message)
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) fail(error.message)
        else succeed('Account created — check your inbox to confirm your email.')
      }
    } catch {
      fail('Could not reach the sign-in service. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const sendMagicLink = async () => {
    if (!supabaseConfigured) return
    if (!email.trim()) {
      fail('Enter your email above first — the magic link goes there.')
      return
    }
    setNotice(null)
    setBusy('magic')
    try {
      await ensureAuthInitialized()
      const supabase = await getSupabaseClient()
      if (!supabase) return
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: authRedirectUrl() },
      })
      if (error) fail(error.message)
      else succeed('Magic link sent — check your inbox.')
    } catch {
      fail('Could not send the magic link. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const oauth = async (provider: Provider) => {
    if (!supabaseConfigured) return
    setNotice(null)
    setBusy(provider)
    try {
      await ensureAuthInitialized()
      const supabase = await getSupabaseClient()
      if (!supabase) {
        setBusy(null)
        return
      }
      // In the iOS app a web redirect cannot come back to tauri://localhost,
      // so Apple's native sheet hands over an ID token directly instead.
      if (provider === 'apple' && nativeApple) {
        const result = await signInWithAppleNative(supabase)
        if (result.error) fail(result.error)
        setBusy(null)
        return
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: authRedirectUrl() },
      })
      if (error) {
        fail(error.message)
        setBusy(null)
      }
      // On success the browser navigates away — no need to clear busy.
    } catch {
      fail('Could not start social sign-in. Please try again.')
      setBusy(null)
    }
  }

  return (
    // The pitch column makes this taller than one screen on a phone, so the
    // page scrolls rather than clipping the sign-in panel out of reach. That
    // needs a FIXED height: #root is overflow: hidden, and a min-height box
    // just grows past the screen and gets clipped without ever scrolling. The
    // shell centres with auto margins rather than items-center, because flex
    // centring pushes overflow above the top edge where it cannot be scrolled
    // to, while auto margins collapse to zero once the content is taller.
    <div className="gp-login relative flex h-dvh w-screen overflow-y-auto bg-neutral-950 px-4 pt-[calc(var(--gp-safe-top)+2.5rem)] pb-[calc(var(--gp-safe-bottom)+2.5rem)]">
      {/* Ambient background bloom — two static radial glows, zero per-frame cost */}
      <div aria-hidden className="gp-login-glow pointer-events-none fixed inset-0" />

      <div className="gp-login-shell gp-pop relative z-10 m-auto grid w-full max-w-md gap-9 lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_23.5rem] lg:items-center lg:gap-12">
        <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left">
          <div className="gp-login-brand flex items-center gap-2.5">
            <img src="/brand/logo_light_borderless.png" alt="" aria-hidden className="h-10 w-10" />
            <span className="text-2xl font-bold tracking-tight text-neutral-100">
              grove<span className="text-emerald-400">pad</span>
            </span>
          </div>

          <h1 className="max-w-[20ch] text-2xl font-bold leading-tight tracking-tight text-neutral-50 lg:text-4xl">
            The board where your notes do the math
          </h1>
          <p className="max-w-[48ch] text-sm leading-relaxed text-neutral-400">
            Drag calculators, trackers, tables and charts onto one infinite board, then wire a
            card into another so a value flows between them. Any card can open into a whole
            board of its own.
          </p>

          <p className="text-xs font-medium text-neutral-500">Free, offline, no account.</p>
        </div>

        <div className="gp-login-form-panel gp-panel w-full rounded-3xl p-9 shadow-2xl">
          {sharedCanvasLink && (
            <div className="mb-4 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-emerald-100/90">
              Sign in or create an account to view this shared canvas. Public links are
              read-only unless the owner approves your email as an Editor.
            </div>
          )}
          {!supabaseConfigured && (
            <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-amber-200/90">
              Supabase isn't configured yet. Add <code className="">VITE_SUPABASE_URL</code>{' '}
              and <code className="">VITE_SUPABASE_ANON_KEY</code> to{' '}
              <code className="">.env.local</code>, then restart the dev server. Guest mode
              works in the meantime.
            </div>
          )}

          <form onSubmit={submitPassword} className="flex flex-col gap-2.5">
            <div className="gp-field-island">
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                placeholder="Email"
                aria-label="Email"
                disabled={!supabaseConfigured}
                onChange={(e) => setEmail(e.target.value)}
                className="gp-input gp-login-input h-10 w-full text-sm text-neutral-100 placeholder:text-neutral-600 disabled:opacity-50"
              />
            </div>
            <div className="gp-field-island">
              <input
                type="password"
                required
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                placeholder="Password"
                aria-label="Password"
                disabled={!supabaseConfigured}
                onChange={(e) => setPassword(e.target.value)}
                className="gp-input gp-login-input h-10 w-full text-sm text-neutral-100 placeholder:text-neutral-600 disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={!supabaseConfigured || busy !== null}
              className="group flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500/90 text-sm font-semibold text-neutral-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-40"
            >
              {busy === 'password' ? (
                <Loader2 size={15} className="animate-spin" aria-hidden />
              ) : (
                <>
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                  <ArrowRight
                    size={14}
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </>
              )}
            </button>
          </form>

          {/* Create account and guest are equally weighted, real buttons — guest
              is a first-class local-only path, not an afterthought link. */}
          <div className={`mt-2.5 grid gap-2 ${sharedCanvasLink ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setNotice(null)
              }}
              className="gp-island gp-login-action gp-login-action--secondary flex h-10 items-center justify-center text-sm font-medium text-neutral-200 transition-all active:scale-[0.98]"
            >
              {mode === 'signin' ? 'Create account' : 'Sign in instead'}
            </button>
            {!sharedCanvasLink && (
              <button
                type="button"
                onClick={continueAsGuest}
                className="gp-island gp-login-action gp-login-action--guest flex h-10 items-center justify-center gap-1.5 text-sm font-medium text-emerald-300 transition-all active:scale-[0.98]"
              >
                Continue as guest
                <ArrowRight size={13} aria-hidden />
              </button>
            )}
          </div>
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              disabled={!supabaseConfigured || busy !== null}
              onClick={sendMagicLink}
              className="flex items-center gap-1 text-[11px] text-neutral-500 transition-colors hover:text-emerald-300 disabled:opacity-40"
            >
              {busy === 'magic' ? (
                <Loader2 size={11} className="animate-spin" aria-hidden />
              ) : (
                <WandSparkles size={11} aria-hidden />
              )}
              Magic link
            </button>
          </div>

          {notice && (
            <p
              role={notice.kind === 'error' ? 'alert' : 'status'}
              className={`mt-3 rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
                notice.kind === 'error'
                  ? 'border border-red-500/25 bg-red-500/[0.07] text-red-300'
                  : 'border border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-300'
              }`}
            >
              {notice.text}
            </p>
          )}

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-neutral-800" aria-hidden />
            <span className="text-[10px] uppercase tracking-widest text-neutral-600">or</span>
            <span className="h-px flex-1 bg-neutral-800" aria-hidden />
          </div>

          <div className={`grid gap-2 ${providers.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {providers.map(({ id, label, Mark, tint }) => (
              <button
                key={id}
                type="button"
                title={`Continue with ${label}`}
                aria-label={`Continue with ${label}`}
                disabled={!supabaseConfigured || busy !== null}
                onClick={() => oauth(id)}
                className={`gp-island gp-login-provider flex h-11 items-center justify-center gap-2 px-3 text-xs font-medium transition-all active:scale-[0.97] disabled:opacity-40 ${tint}`}
              >
                {busy === id ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Mark />}
                {busy === id ? 'Connecting…' : label}
              </button>
            ))}
          </div>
        </div>

        {/* Full shell width so the boards stay legible rather than thumbnail-sized. */}
        <ProductShots className="lg:col-span-2" />
      </div>
    </div>
  )
}
