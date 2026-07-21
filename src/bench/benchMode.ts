/**
 * Bench mode gate — `?bench=1` on the URL. Deliberately dependency-free so
 * appRuntime can consult it without pulling any bench code into the normal
 * bundle. In bench mode the app skips persistence entirely: the generated
 * 2,000-widget board must never be written into a user's real storage.
 */
export function isBenchMode(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('bench')
}
