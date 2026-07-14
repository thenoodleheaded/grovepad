import { useLayoutEffect, useState } from 'react'

interface ClockSubscriber {
  intervalMs: number
  lastTick: number
  notify: (now: number) => void
}

const subscribers = new Set<ClockSubscriber>()
let timeoutId = 0

function stopTimer(): void {
  if (timeoutId !== 0) {
    window.clearTimeout(timeoutId)
    timeoutId = 0
  }
}

function schedule(): void {
  stopTimer()
  if (subscribers.size === 0 || document.visibilityState === 'hidden') return
  const now = Date.now()
  let wait = 60_000
  for (const subscriber of subscribers) {
    wait = Math.min(wait, Math.max(16, subscriber.intervalMs - (now - subscriber.lastTick)))
  }
  timeoutId = window.setTimeout(tick, wait)
}

function tick(): void {
  timeoutId = 0
  if (document.visibilityState === 'hidden') return
  const now = Date.now()
  for (const subscriber of subscribers) {
    if (now - subscriber.lastTick + 2 < subscriber.intervalMs) continue
    subscriber.lastTick = now
    subscriber.notify(now)
  }
  schedule()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopTimer()
    else {
      tick()
      schedule()
    }
  })
}

/**
 * A visibility-aware shared wall clock. All mounted timers use one scheduled
 * callback instead of owning independent intervals, and stopped timers do no
 * recurring work at all.
 */
export function useSharedClock(
  intervalMs: number,
  enabled = true,
  alignToBoundary = false,
): number {
  const [now, setNow] = useState(() => Date.now())

  useLayoutEffect(() => {
    if (!enabled) return
    const current = Date.now()
    const subscriber: ClockSubscriber = {
      intervalMs: Math.max(50, intervalMs),
      lastTick: alignToBoundary
        ? Math.floor(current / Math.max(50, intervalMs)) * Math.max(50, intervalMs)
        : current,
      notify: setNow,
    }
    subscribers.add(subscriber)
    setNow(current)
    schedule()
    return () => {
      subscribers.delete(subscriber)
      schedule()
    }
  }, [alignToBoundary, enabled, intervalMs])

  return now
}
