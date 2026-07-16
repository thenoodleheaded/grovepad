import type { WidgetSizing } from '../widgets/contracts/registry'

/**
 * Mounted-card measurements are browser facts, not board data. Keeping them
 * outside Zustand means undo, persistence, and cloud sync never record a value
 * that is only true for the current font/browser render.
 */
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

/** Mounted content may tighten a registry window, never loosen it. */
export function mergeWidgetSizing(
  fallback: WidgetSizing | undefined,
  live: WidgetSizing | undefined,
): WidgetSizing {
  const minWidth = Math.max(fallback?.minWidth ?? 0, live?.minWidth ?? 0)
  const minHeight = Math.max(fallback?.minHeight ?? 0, live?.minHeight ?? 0)
  return {
    ...fallback,
    ...live,
    minWidth: minWidth || undefined,
    minHeight: minHeight || undefined,
    // A live floor is allowed to reach a static ceiling, but never silently
    // replaces that ceiling. Content authors can raise the registry maximum
    // when a composition genuinely needs a larger useful range.
    maxWidth: fallback?.maxWidth,
    maxHeight: fallback?.maxHeight,
    autoHeight: fallback?.autoHeight,
  }
}

