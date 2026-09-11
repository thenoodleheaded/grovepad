import { describe, expect, it } from 'vitest'
import {
  analyticsState,
  appSurface,
  browserRefusesTracking,
  captureUsageEvent,
  DEFAULT_ANALYTICS_HOST,
  keepOnlyUsageEvents,
  readAnalyticsConfig,
  resetAnalyticsClientForTests,
  USAGE_EVENTS,
} from './analytics'

describe('analytics configuration', () => {
  it('treats a missing, blank, or placeholder key as no analytics at all', () => {
    expect(readAnalyticsConfig({})).toBeNull()
    expect(readAnalyticsConfig({ VITE_POSTHOG_KEY: '   ' })).toBeNull()
    expect(readAnalyticsConfig({ VITE_POSTHOG_KEY: 'YOUR_POSTHOG_PROJECT_KEY' })).toBeNull()
  })

  it('defaults the region and trims a trailing slash off a custom one', () => {
    expect(readAnalyticsConfig({ VITE_POSTHOG_KEY: 'phc_test' })).toEqual({
      key: 'phc_test',
      host: DEFAULT_ANALYTICS_HOST,
    })
    expect(readAnalyticsConfig({
      VITE_POSTHOG_KEY: ' phc_test ',
      VITE_POSTHOG_HOST: 'https://eu.i.posthog.com/',
    })).toEqual({ key: 'phc_test', host: 'https://eu.i.posthog.com' })
  })
})

describe('analytics state', () => {
  it('names the reason nothing is being counted, most fundamental first', () => {
    const optedIn = true
    expect(analyticsState({ configured: false, optedIn, browserRefuses: false })).toBe('unconfigured')
    expect(analyticsState({ configured: true, optedIn: false, browserRefuses: false })).toBe('opted-out')
    expect(analyticsState({ configured: true, optedIn, browserRefuses: true })).toBe('refused-by-browser')
    expect(analyticsState({ configured: true, optedIn, browserRefuses: false })).toBe('counting')
  })

  it('ranks a missing key above an opt-out, so an unkeyed build never claims to count', () => {
    expect(analyticsState({ configured: false, optedIn: false, browserRefuses: true })).toBe('unconfigured')
  })
})

describe('browser refusals', () => {
  it('honours Do Not Track from either object and Global Privacy Control', () => {
    expect(browserRefusesTracking({}, {})).toBe(false)
    expect(browserRefusesTracking({ doNotTrack: '0' }, {})).toBe(false)
    expect(browserRefusesTracking({ doNotTrack: '1' }, {})).toBe(true)
    expect(browserRefusesTracking({}, { doNotTrack: '1' })).toBe(true)
    expect(browserRefusesTracking({ globalPrivacyControl: true }, {})).toBe(true)
  })
})

describe('capture', () => {
  it('is a silent no-op without a project key', () => {
    resetAnalyticsClientForTests()
    expect(() => captureUsageEvent(USAGE_EVENTS.appOpened, { surface: 'web' }, null)).not.toThrow()
  })

  it('sends exactly one kind of event', () => {
    expect(Object.values(USAGE_EVENTS)).toEqual(['app_opened'])
  })

  it('drops every event the SDK raises on its own initiative', () => {
    // The SDK sends a `$set` of person properties the first time it decides a
    // visitor looks internal, and future versions may add more. The privacy
    // page promises one event, so anything else dies at this gate.
    expect(keepOnlyUsageEvents({ event: 'app_opened' })).toEqual({ event: 'app_opened' })
    expect(keepOnlyUsageEvents({ event: '$set' })).toBeNull()
    expect(keepOnlyUsageEvents({ event: '$pageview' })).toBeNull()
    expect(keepOnlyUsageEvents({ event: '$identify' })).toBeNull()
    expect(keepOnlyUsageEvents({ event: '$feature_flag_called' })).toBeNull()
    expect(keepOnlyUsageEvents(null)).toBeNull()
  })
})

describe('app surface', () => {
  it('reports the installed app only when the Tauri bridge is present', () => {
    expect(appSurface({})).toBe('web')
    expect(appSurface(undefined)).toBe('web')
    expect(appSurface({ __TAURI_INTERNALS__: {} })).toBe('app')
  })
})
