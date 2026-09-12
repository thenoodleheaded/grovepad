/**
 * One answer to "am I running inside Grovepad's iPhone/iPad app?".
 *
 * Several features need this and they must not each keep their own copy of the
 * rule: Apple's sign-in sheet replaces the web redirect there, and the haptic
 * engine is reachable there and nowhere else on Apple hardware. A second copy
 * would drift the day iPadOS changes what it reports.
 */

export interface HostWindow {
  [key: string]: unknown
}

export interface HostNavigator {
  userAgent: string
  maxTouchPoints?: number
}

const defaultWindow = () =>
  typeof window === 'undefined' ? undefined : (window as unknown as HostWindow)
const defaultNavigator = () => (typeof navigator === 'undefined' ? undefined : navigator)

/** True inside the native shell on any platform — desktop included. */
export function isNativeHost(win: HostWindow | undefined = defaultWindow()): boolean {
  return Boolean(win) && '__TAURI_INTERNALS__' in (win as HostWindow)
}

/**
 * True only inside the iPhone/iPad app. The browser on those devices is not
 * enough: a web page there can reach neither the Apple sign-in sheet nor the
 * Taptic Engine, so both callers need the shell AND the hardware.
 */
export function isNativeIosHost(
  win: HostWindow | undefined = defaultWindow(),
  nav: HostNavigator | undefined = defaultNavigator(),
): boolean {
  if (!isNativeHost(win) || !nav) return false
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true
  // iPadOS WebKit reports a desktop Mac user agent; touch points give it away.
  return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1
}
