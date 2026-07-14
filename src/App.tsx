import { lazy, Suspense } from 'react'
import { useAuthStore } from './store/useAuthStore'

const LoginPage = lazy(() =>
  import('./components/auth/LoginPage').then((module) => ({ default: module.LoginPage })),
)
const CanvasViewport = lazy(() =>
  import('./components/canvas/CanvasViewport').then((module) => ({ default: module.CanvasViewport })),
)

function AppBootScreen() {
  return (
    <div className="gp-app-boot flex h-dvh w-screen items-center justify-center bg-neutral-950" aria-busy="true">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="gp-boot-mark" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-600">
          Preparing your canvas
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const session = useAuthStore((state) => state.session)
  const isGuest = useAuthStore((state) => state.isGuest)
  const loading = useAuthStore((state) => state.loading)

  // Hold a blank frame for the brief initial session check so a signed-in
  // user never sees the login page flash before the canvas.
  if (loading && !isGuest) {
    return <AppBootScreen />
  }

  return (
    <Suspense fallback={<AppBootScreen />}>
      {!session && !isGuest ? <LoginPage /> : <CanvasViewport />}
    </Suspense>
  )
}
