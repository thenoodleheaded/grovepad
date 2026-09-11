import { useSettingsStore } from '../store/useSettingsStore'
import {
  analyticsConfigured,
  analyticsState,
  appSurface,
  browserRefusesTracking,
  captureUsageEvent,
  stopUsageCounting,
  USAGE_EVENTS,
  type AnalyticsState,
} from '../services/analytics'

export interface AnalyticsRuntimeOptions {
  /** Reads the device-local opt-out. Defaults to the settings store. */
  readOptedIn?: () => boolean
  /** Subscribes to opt-out changes. Defaults to the settings store. */
  subscribe?: (listener: () => void) => () => void
  configured?: boolean
  browserRefuses?: () => boolean
  capture?: typeof captureUsageEvent
  stop?: () => void
}

/**
 * Once per page load, not once per runtime start. React's development
 * StrictMode mounts, unmounts and remounts the app, and a torn-down runtime
 * that restarts is still the same launch — a per-instance flag counted that
 * launch twice and quietly inflated every number the quit rules read.
 */
let sentThisPageLoad = false

/** Test seam: forget that this page load has already been counted. */
export function resetAnalyticsRuntimeForTests(): void {
  sentThisPageLoad = false
}

/**
 * Owns the one usage event Grovepad sends.
 *
 * `app_opened` is sent once per app start, at the first moment counting is
 * allowed. Someone who starts opted out and turns the toggle on mid-session is
 * counted from that moment rather than not at all; turning it off stops the
 * client and nothing further is sent for this page load.
 */
export function initAnalyticsRuntime(options: AnalyticsRuntimeOptions = {}): () => void {
  const readOptedIn = options.readOptedIn ?? (() => useSettingsStore.getState().usageAnalytics)
  const subscribe = options.subscribe ?? ((listener) => useSettingsStore.subscribe(listener))
  const configured = options.configured ?? analyticsConfigured
  const browserRefuses = options.browserRefuses ?? browserRefusesTracking
  const capture = options.capture ?? captureUsageEvent
  const stop = options.stop ?? stopUsageCounting

  let disposed = false
  let counting = false

  const readState = (): AnalyticsState =>
    analyticsState({ configured, optedIn: readOptedIn(), browserRefuses: browserRefuses() })

  const apply = () => {
    if (disposed) return
    const nowCounting = readState() === 'counting'
    if (nowCounting === counting) return
    counting = nowCounting
    if (!nowCounting) {
      stop()
      return
    }
    if (sentThisPageLoad) return
    sentThisPageLoad = true
    capture(USAGE_EVENTS.appOpened, { surface: appSurface() })
  }

  apply()
  const unsubscribe = subscribe(apply)

  return () => {
    if (disposed) return
    disposed = true
    unsubscribe()
  }
}
