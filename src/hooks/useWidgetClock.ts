import type { Widget } from '../types/spatial'
import {
  isClockWidget,
  widgetClock,
  widgetClockIntervalMs,
  widgetClockRunning,
  type WidgetClock,
} from '../utils/widgetClock'
import { useSharedClock } from './useSharedClock'

/**
 * The live dial reading for one widget, or null when it has no clock.
 *
 * Subscribes to the shared wall clock only while this widget's timer is
 * actually ticking, so a board full of paused timers — and every non-timer
 * card — costs nothing per frame.
 */
export function useWidgetClock(widget: Pick<Widget, 'type' | 'data'> | undefined): WidgetClock | null {
  const isClock = Boolean(widget && isClockWidget(widget.type))
  const running = isClock && widget ? widgetClockRunning(widget) : false
  const interval = isClock && widget ? widgetClockIntervalMs(widget) : 1000
  const now = useSharedClock(interval, running)
  if (!widget || !isClock) return null
  return widgetClock(widget, now)
}
