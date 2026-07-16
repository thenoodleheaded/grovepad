import type { WidgetSizing } from '../widgets/contracts/registry'

/** Mounted-card measurements are deliberately kept out of persisted Zustand
 * state. They are ephemeral DOM facts used by resize clamps while a card is
 * visible; the registry remains the fallback for culled cards. */
const liveSizing = new Map<string, WidgetSizing>()

export function setLiveWidgetSizing(widgetId: string, sizing: WidgetSizing): void {
  liveSizing.set(widgetId, sizing)
}

export function getLiveWidgetSizing(widgetId: string): WidgetSizing | undefined {
  return liveSizing.get(widgetId)
}

export function clearLiveWidgetSizing(widgetId: string): void {
  liveSizing.delete(widgetId)
}

export function mergeWidgetSizing(
  fallback: WidgetSizing | undefined,
  live: WidgetSizing | undefined,
): WidgetSizing {
  return {
    ...fallback,
    ...live,
    minWidth: Math.max(fallback?.minWidth ?? 0, live?.minWidth ?? 0) || undefined,
    minHeight: Math.max(fallback?.minHeight ?? 0, live?.minHeight ?? 0) || undefined,
  }
}

