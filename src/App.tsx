import { lazy, Suspense, useEffect } from 'react'
import { ensureAuthInitialized, useAuthStore } from './store/useAuthStore'
import { consumeAppleRevokeReturn } from './lib/appleRevoke'
import { useToastStore } from './store/useToastStore'
import { usePersistenceStatusStore } from './store/usePersistenceStatusStore'
import { PersistenceCompatibilityBlock } from './components/ui/PersistenceCompatibilityBlock'
import { initAdaptiveInputRuntime } from './runtime/adaptiveInputRuntime'
import { grovepadPageTitle } from './utils/pageTitle'
import { shouldShowLoginPage } from './utils/authGate'

const LoginPage = lazy(() =>
  import('./components/auth/LoginPage').then((module) => ({ default: module.LoginPage })),
)
const CanvasViewport = lazy(() =>
  import('./components/canvas/CanvasViewport').then((module) => ({ default: module.CanvasViewport })),
)

/** The second half of the boot sequence. The pre-mount splash in index.html
 *  paints the same ground — aurora, drifting grid, vignette — and its <style>
 *  block outlives #root, so re-using those class names here means the mount
 *  swaps the copy without the scene underneath it ever cutting. `--settled`
 *  skips the camera push-in, which already played once in the splash. */
function AppBootScreen() {
  return (
    <div className="gp-app-boot flex h-dvh w-screen items-center justify-center" aria-busy="true">
      <div className="gp-splash-field gp-splash-field--settled" aria-hidden>
        <div className="gp-splash-aurora" />
        <div className="gp-splash-grid" />
        <div className="gp-splash-vignette" />
      </div>
      <div className="gp-boot-copy flex flex-col items-center gap-5 text-center">
        <div className="gp-boot-mark" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
          Preparing your canvas
        </p>
        <div className="gp-splash-progress" aria-hidden>
          <span />
        </div>
      </div>
    </div>
  )
}

export default function App() {
  useEffect(() => initAdaptiveInputRuntime(), [])

  const session = useAuthStore((state) => state.session)
  const isGuest = useAuthStore((state) => state.isGuest)
  const loading = useAuthStore((state) => state.loading)
  const rememberedAccount = useAuthStore((state) => state.rememberedAccount)
  const networkOnline = usePersistenceStatusStore((state) => state.networkOnline)
  const compatibilityBlock = usePersistenceStatusStore((state) => state.compatibilityBlock)
  const joiningSharedCanvas = new URL(window.location.href).searchParams.has('collaborate')
  const showLogin = shouldShowLoginPage({
    hasSession: session !== null,
    isGuest,
    hasRememberedAccount: rememberedAccount !== null,
    networkOnline,
    joiningSharedCanvas,
  })
  const pageName = compatibilityBlock
    ? 'update required'
    : loading && !isGuest
      ? 'loading'
      : showLogin
        ? 'login'
        : null

  useEffect(() => {
    if (pageName) document.title = grovepadPageTitle(pageName)
  }, [pageName])

  useEffect(() => {
    if (joiningSharedCanvas && !session) void ensureAuthInitialized()
  }, [joiningSharedCanvas, session])

  // Back from Apple during a website account deletion. Only a deletion this
  // browser started in the last few minutes resumes; a bare link does nothing.
  useEffect(() => {
    if (!session) return
    const outcome = consumeAppleRevokeReturn(session.user.id)
    if (outcome === 'resume') {
      void useAuthStore.getState().deleteAccount({ appleRevoked: true }).catch((error: unknown) => {
        useToastStore.getState().addToast(
          error instanceof Error ? error.message : 'Could not delete your account',
          { tone: 'danger' },
        )
      })
    } else if (outcome) {
      useToastStore.getState().addToast(
        outcome === 'cancelled'
          ? 'Account not deleted. Apple needs you to confirm before it can be disconnected.'
          : 'Account not deleted. Apple could not confirm it is you. Try again.',
        { tone: 'danger' },
      )
    }
  }, [session])

  if (compatibilityBlock) {
    return <PersistenceCompatibilityBlock block={compatibilityBlock} />
  }

  // Hold a blank frame for the brief initial session check so a signed-in
  // user never sees the login page flash before the canvas.
  if (loading && !isGuest) {
    return <AppBootScreen />
  }

  return (
    <Suspense fallback={<AppBootScreen />}>
      {showLogin
        ? <LoginPage sharedCanvasLink={joiningSharedCanvas} />
        : <CanvasViewport />}
    </Suspense>
  )
}
