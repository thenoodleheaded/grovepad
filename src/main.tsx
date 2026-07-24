import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/product.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary
      onError={(error) => console.error('Unhandled error in grovepad:', error)}
      fallback={(retry) => (
        <div className="flex h-dvh w-screen flex-col items-center justify-center gap-3 bg-neutral-950 text-center text-neutral-300">
          <p className="text-sm font-medium">Something went wrong.</p>
          <p className="max-w-sm text-xs text-neutral-500">
            Your board is safe — it's saved locally. Try reloading, or retry in place.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={retry}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-500"
            >
              Reload
            </button>
          </div>
        </div>
      )}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
