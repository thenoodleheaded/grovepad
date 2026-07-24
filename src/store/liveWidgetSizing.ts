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
    // Tighten, never loosen — in both directions. A measured ceiling may pull
    // a registry maximum *in* (a card of fixed-height rows cannot usefully be
    // dragged taller than its own content), but may never push it out: only a
    // content author raises a type's useful range. Whichever is smaller wins,
    // and a floor above it still takes precedence below.
    maxWidth: tighterMax(fallback?.maxWidth, live?.maxWidth),
    maxHeight: tighterMax(fallback?.maxHeight, live?.maxHeight),
    autoHeight: fallback?.autoHeight,
  }
}

function tighterMax(fallback: number | undefined, live: number | undefined): number | undefined {
  if (fallback === undefined) return live
  if (live === undefined) return fallback
  return Math.min(fallback, live)
}

