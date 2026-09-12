/**
 * One place that turns an interaction into a physical tick.
 *
 * Three platforms, two routes:
 *
 * - **iPhone/iPad app** — the Taptic Engine, through the `native-haptics`
 *   plugin. This is the only route Apple offers: WKWebView does not implement
 *   the web Vibration API at all, so every call here used to be silent on the
 *   one platform whose hardware is best at this.
 * - **Android, browser or app** — the web Vibration API, which Chrome
 *   implements and which needs no bridge.
 * - **Desktop** — nothing to drive; every call is a no-op.
 *
 * A tick is always advisory. It reports something the interface has ALREADY
 * done, so nothing may wait on it or branch on whether it happened — which is
 * why this returns `void` on every path and swallows its own failures.
 */

import { isNativeIosHost } from './nativeHost'

/**
 * Milliseconds per pattern for the web route; short enough to read as a detent,
 * not a rumble. iOS ignores these — UIKit owns the feel of its own generators,
 * and the Swift plugin maps each name onto the generator that already means
 * this to an iPhone owner (see NativeHapticsPlugin.swift).
 */
const DURATIONS = {
  /** A row crossing into the selection lane. */
  detent: 8,
  /** A choice landing — heavier than the ticks that led to it. */
  commit: 18,
  /** Pushing against the end of a list that cannot go further. */
  limit: 4,
} as const

export type HapticKind = keyof typeof DURATIONS

/** Swapped in tests; the real one is loaded lazily so the web build stays clean. */
export type HapticInvoke = (command: 'haptic_tap', args: { kind: HapticKind }) => Promise<unknown>

let invoker: Promise<HapticInvoke> | null = null

async function nativeInvoke(): Promise<HapticInvoke> {
  const { invoke } = await import('@tauri-apps/api/core')
  return (command, args) => invoke(command, args)
}

/** Test seam. Passing `null` restores the real bridge. */
export function setHapticInvoke(next: HapticInvoke | null): void {
  invoker = next ? Promise.resolve(next) : null
}

export function haptic(kind: HapticKind): void {
  if (typeof navigator === 'undefined') return

  if (isNativeIosHost()) {
    // Deliberately not awaited. The tick describes something that already
    // happened on screen, so blocking a gesture on an IPC round-trip would
    // trade the very responsiveness this exists to convey.
    invoker ??= nativeInvoke()
    void invoker.then((invoke) => invoke('haptic_tap', { kind })).catch(() => {})
    return
  }

  // `vibrate` is absent on desktop browsers and present-but-ignored on some
  // others; both are fine — the call is advisory, never load-bearing.
  navigator.vibrate?.(DURATIONS[kind])
}
