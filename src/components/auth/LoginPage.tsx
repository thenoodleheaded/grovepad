import { useState, type FormEvent, type ReactElement } from 'react'
import type { Provider } from '@supabase/supabase-js'
import { ArrowRight, Loader2, Sparkles, WandSparkles } from 'lucide-react'
import { getSupabaseClient, supabaseConfigured } from '../../lib/supabase'
import { ensureAuthInitialized, useAuthStore } from '../../store/useAuthStore'

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

function MicrosoftMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 23 23" aria-hidden>
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  )
}

function FacebookMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2" aria-hidden>
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.89v2.25h3.32l-.53 3.49h-2.79V24C19.61 23.09 24 18.1 24 12.07z" />
    </svg>
  )
}

/** Quick sign-in providers, in display order — add another Supabase OAuth
 *  provider here and it appears in the grid with no further wiring.
 *
 *  `tint` follows each brand's own sign-in button convention rather than one
 *  uniform recipe: Google and Microsoft's marks already carry their official
 *  multicolor palette, so their island stays neutral glass; Apple ships a
 *  monochrome mark and is conventionally rendered on a near-black button;
 *  Facebook's brand is a single solid blue, so its island is tinted with it.
 *
 *  `comingSoon` disables the button without removing it — the provider isn't
 *  wired up on the Supabase project yet. */
const OAUTH_PROVIDERS: Array<{
  id: Provider
  label: string
  Mark: () => ReactElement
  tint: string
  comingSoon?: boolean
}> = [
  { id: 'google', label: 'Google', Mark: GoogleMark, tint: 'text-neutral-100 hover:bg-white/5' },
  { id: 'apple', label: 'Apple', Mark: AppleMark, tint: 'bg-black/40 text-white', comingSoon: true },
  { id: 'azure', label: 'Microsoft', Mark: MicrosoftMark, tint: 'text-neutral-100 hover:bg-white/5' },
  { id: 'facebook', label: 'Facebook', Mark: FacebookMark, tint: 'bg-[#1877F2]/20 text-white hover:bg-[#1877F2]/28' },
]

/** Full-screen login gate — Supabase auth with a local-first guest exit. */
export function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const continueAsGuest = useAuthStore((state) => state.continueAsGuest)

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
        options: { emailRedirectTo: window.location.origin },
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
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
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
    <div className="gp-login relative flex h-dvh w-screen items-center justify-center overflow-hidden bg-neutral-950">
      {/* Ambient background bloom — two static radial glows, zero per-frame cost */}
      <div aria-hidden className="gp-login-glow pointer-events-none absolute inset-0" />

      <div className="gp-pop gp-panel relative z-10 w-full max-w-md rounded-3xl p-9 shadow-2xl">
        <div className="mb-7 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 shadow-[0_0_28px_rgba(163,230,53,0.18)]">
            <Sparkles size={20} className="text-emerald-300" aria-hidden />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-neutral-100">
            grove<span className="text-emerald-400">pad</span>
          </h1>
        </div>

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
              className="gp-input h-10 w-full text-sm text-neutral-100 placeholder:text-neutral-600 disabled:opacity-50"
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
              className="gp-input h-10 w-full text-sm text-neutral-100 placeholder:text-neutral-600 disabled:opacity-50"
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
        <div className="mt-2.5 grid grid-cols-2 gap-2">
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
          <button
            type="button"
            onClick={continueAsGuest}
            className="gp-island gp-login-action gp-login-action--guest flex h-10 items-center justify-center gap-1.5 text-sm font-medium text-emerald-300 transition-all active:scale-[0.98]"
          >
            Continue as guest
            <ArrowRight size={13} aria-hidden />
          </button>
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

        <div className="grid grid-cols-2 gap-2">
          {OAUTH_PROVIDERS.map(({ id, label, Mark, tint, comingSoon }) => (
            <button
              key={id}
              type="button"
              title={comingSoon ? `${label} sign-in is coming soon` : `Continue with ${label}`}
              aria-label={comingSoon ? `${label} sign-in is coming soon` : `Continue with ${label}`}
              disabled={comingSoon || !supabaseConfigured || busy !== null}
              onClick={() => oauth(id)}
              className={`gp-island gp-login-provider flex h-11 items-center justify-center gap-2 px-3 text-xs font-medium transition-all active:scale-[0.97] disabled:opacity-40 ${tint}`}
            >
              {busy === id ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Mark />}
              {busy === id ? 'Connecting…' : label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
