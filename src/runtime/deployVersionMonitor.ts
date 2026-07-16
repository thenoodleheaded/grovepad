import { usePersistenceStatusStore } from '../store/usePersistenceStatusStore'

const CHECK_INTERVAL_MS = 15 * 60 * 1000
const META_TAG_PATTERN = /<meta\s+[^>]*>/gi
const NAME_PATTERN = /\bname\s*=\s*["']grovepad-build["']/i
const CONTENT_PATTERN = /\bcontent\s*=\s*["']([^"']+)["']/i

/** Extract the build identity injected into index.html by Vite. */
export function extractBuildId(html: string): string | null {
  for (const tag of html.match(META_TAG_PATTERN) ?? []) {
    if (!NAME_PATTERN.test(tag)) continue
    return tag.match(CONTENT_PATTERN)?.[1] ?? null
  }
  return null
}

export function isDifferentDeploy(currentBuildId: string | null, html: string): boolean {
  if (!currentBuildId) return false
  const remoteBuildId = extractBuildId(html)
  return remoteBuildId !== null && remoteBuildId !== currentBuildId
}

/**
 * Notify long-lived tabs when the deployed application shell changes. The
 * service is canvas-runtime owned and returns an idempotent disposer.
 */
export function initDeployVersionMonitor(): () => void {
  const currentBuildId = document.querySelector<HTMLMetaElement>(
    'meta[name="grovepad-build"]',
  )?.content ?? null
  let disposed = false
  let checking = false

  const check = async () => {
    if (disposed || checking || !currentBuildId) return
    checking = true
    try {
      const response = await fetch(new URL('/', window.location.href), { cache: 'no-store' })
      if (!response.ok) return
      if (isDifferentDeploy(currentBuildId, await response.text())) {
        usePersistenceStatusStore.getState().setDeployUpdateAvailable(true)
      }
    } catch {
      // Offline or optional hosting failure must not interrupt local board work.
    } finally {
      checking = false
    }
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') void check()
  }
  const interval = window.setInterval(() => { void check() }, CHECK_INTERVAL_MS)
  document.addEventListener('visibilitychange', onVisibilityChange)
  void check()

  return () => {
    if (disposed) return
    disposed = true
    window.clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
