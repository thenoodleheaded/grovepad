/**
 * One place that turns an interaction into a physical tick.
 *
 * Today only the web Vibration API exists, and only phones implement it, so
 * on desktop every call here is a no-op. When Grovepad runs on a phone —
 * browser or native shell — this is the single function that starts buzzing,
 * and every caller inherits it without changing.
 */

/** Milliseconds per pattern; short enough to read as a detent, not a rumble. */
const DURATIONS = {
  /** A row crossing into the selection lane. */
  detent: 8,
  /** A choice landing — heavier than the ticks that led to it. */
  commit: 18,
  /** Pushing against the end of a list that cannot go further. */
  limit: 4,
} as const

export type HapticKind = keyof typeof DURATIONS

export function haptic(kind: HapticKind): void {
  if (typeof navigator === 'undefined') return
  // `vibrate` is absent on desktop browsers and present-but-ignored on some
  // others; both are fine — the call is advisory, never load-bearing.
  navigator.vibrate?.(DURATIONS[kind])
}
