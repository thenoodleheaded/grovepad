import type { PostHog } from 'posthog-js'

// ---------------------------------------------------------------------------
// Usage counting — PostHog, configured entirely through Vite env vars so the
// project key never lives in source. Fill these in `.env.local`:
//
//   VITE_POSTHOG_KEY=phc_<project key>
//   VITE_POSTHOG_HOST=https://eu.i.posthog.com   (optional; US is the default)
//
// Three rules hold this module together:
//
//   1. No key, no analytics. Every entry point no-ops and nothing is loaded.
//   2. No consent, no download. The SDK is a dynamic import behind the consent
//      gate, so a person who turns usage counting off never fetches PostHog at
//      all — there is no beacon to block because there is no request.
//   3. No content, ever. Only the events named in `USAGE_EVENTS` are sent, and
//      board text, widget contents, filenames and identifiers are not among
//      the properties any of them carry.
// ---------------------------------------------------------------------------

/** PostHog's US region. EU projects override this with `VITE_POSTHOG_HOST`. */
export const DEFAULT_ANALYTICS_HOST = 'https://us.i.posthog.com'

export interface AnalyticsEnv {
  readonly VITE_POSTHOG_KEY?: string
  readonly VITE_POSTHOG_HOST?: string
}

export interface AnalyticsConfig {
  readonly key: string
  readonly host: string
}

/** The complete list of events Grovepad sends. Adding to it is a privacy
 * change: the policy page enumerates these by name, so both move together. */
export const USAGE_EVENTS = {
  /** Fired once per app start, after consent. The only event that exists. */
  appOpened: 'app_opened',
} as const

export type UsageEvent = (typeof USAGE_EVENTS)[keyof typeof USAGE_EVENTS]

/** Values allowed on an event. Deliberately narrow: no objects, no arrays,
 * nothing that could carry a board's contents by accident. */
export type UsageProperties = Record<string, string | number | boolean>

/**
 * The last gate before anything leaves the device: drop every event that is
 * not one of ours. The SDK emits events of its own accord — a `$set` of person
 * properties the first time it decides a visitor looks internal, for one — and
 * the privacy page promises that `app_opened` is the only event that exists.
 * A promise enforced by configuration alone survives exactly until an SDK
 * upgrade changes a default, so it is enforced here instead.
 */
export function keepOnlyUsageEvents<T extends { event: string } | null>(payload: T): T | null {
  if (!payload) return null
  return (Object.values(USAGE_EVENTS) as string[]).includes(payload.event) ? payload : null
}

function isConfigured(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('YOUR_')
}

/** Validates env into a config, treating the `.env.example` placeholder as
 * absent so a half-filled checkout behaves exactly like an unconfigured one. */
export function readAnalyticsConfig(env: AnalyticsEnv): AnalyticsConfig | null {
  const key = env.VITE_POSTHOG_KEY?.trim()
  if (!isConfigured(key)) return null
  const host = env.VITE_POSTHOG_HOST?.trim()
  return { key, host: isConfigured(host) ? host.replace(/\/+$/, '') : DEFAULT_ANALYTICS_HOST }
}

export const analyticsConfig = readAnalyticsConfig(import.meta.env as AnalyticsEnv)

/** True once a project key is present. The Settings panel says so in words. */
export const analyticsConfigured = analyticsConfig !== null

/**
 * Browser-level refusals to be tracked: the old Do Not Track header and the
 * newer Global Privacy Control. PostHog honours DNT itself when `respect_dnt`
 * is set, but reading it here lets the app skip the download entirely and
 * explain the situation in Settings rather than silently sending nothing.
 */
export function browserRefusesTracking(
  navigatorLike: { doNotTrack?: string | null; globalPrivacyControl?: boolean } =
    typeof navigator === 'undefined' ? {} : (navigator as { doNotTrack?: string | null }),
  windowLike: { doNotTrack?: string | null } =
    typeof window === 'undefined' ? {} : (window as { doNotTrack?: string | null }),
): boolean {
  return navigatorLike.globalPrivacyControl === true
    || navigatorLike.doNotTrack === '1'
    || windowLike.doNotTrack === '1'
}

export type AnalyticsState =
  /** No project key is set in this build — nothing is or can be counted. */
  | 'unconfigured'
  /** The person turned usage counting off in Settings. */
  | 'opted-out'
  /** The browser sends Do Not Track or Global Privacy Control. */
  | 'refused-by-browser'
  | 'counting'

/** One place that decides whether anything is sent, so the Settings copy and
 * the runtime can never disagree about why nothing is arriving. */
export function analyticsState(input: {
  configured: boolean
  optedIn: boolean
  browserRefuses: boolean
}): AnalyticsState {
  if (!input.configured) return 'unconfigured'
  if (!input.optedIn) return 'opted-out'
  if (input.browserRefuses) return 'refused-by-browser'
  return 'counting'
}

/** Which shell the app is running in. Neither value identifies a device. */
export function appSurface(
  windowLike: object | undefined = typeof window === 'undefined' ? undefined : window,
): 'app' | 'web' {
  return windowLike && '__TAURI_INTERNALS__' in windowLike ? 'app' : 'web'
}

let clientPromise: Promise<PostHog | null> | null = null

/**
 * Load and start the SDK once. Called only after consent, so an opted-out
 * session never downloads it. A failed load resets the promise but is
 * otherwise swallowed: usage counting must never break board work.
 */
function loadClient(config: AnalyticsConfig): Promise<PostHog | null> {
  clientPromise ??= import('posthog-js')
    .then(({ posthog }) => {
      posthog.init(config.key, {
        api_host: config.host,
        defaults: '2026-06-25',
        // Counting, not watching. Every observational feature is off: no
        // click/DOM autocapture, no replay, no heatmaps, no surveys, no
        // toolbar, no exception capture. Only explicit `capture` calls send.
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_heatmaps: false,
        capture_dead_clicks: false,
        capture_performance: false,
        capture_exceptions: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_web_experiments: true,
        disable_product_tours: true,
        // No feature flags and no remotely loaded site apps or scripts: the
        // strict CSP would refuse them anyway, and a counting client has no
        // business fetching runnable code.
        advanced_disable_feature_flags: true,
        opt_in_site_apps: false,
        disable_external_dependency_loading: true,
        // localStorage only. No cookies means no cookie banner, and the
        // anonymous id disappears with the rest of the site data.
        persistence: 'localStorage',
        person_profiles: 'identified_only',
        mask_personal_data_properties: true,
        respect_dnt: true,
        before_send: keepOnlyUsageEvents,
      })
      return posthog
    })
    .catch(() => {
      clientPromise = null
      return null
    })
  return clientPromise
}

/**
 * Send one usage event. Silent no-op unless a key is configured and the
 * browser has not refused tracking; the caller owns the consent decision.
 */
export function captureUsageEvent(
  event: UsageEvent,
  properties: UsageProperties = {},
  config: AnalyticsConfig | null = analyticsConfig,
): void {
  if (!config || browserRefusesTracking()) return
  void loadClient(config).then((client) => client?.capture(event, properties))
}

/**
 * Stop an already-started client. Reached when someone turns the toggle off
 * mid-session; PostHog records the refusal locally so later runs stay quiet
 * even before this module has decided anything.
 */
export function stopUsageCounting(): void {
  if (!clientPromise) return
  void clientPromise.then((client) => client?.opt_out_capturing())
}

/** Test seam: forget the loaded client between cases. */
export function resetAnalyticsClientForTests(): void {
  clientPromise = null
}
