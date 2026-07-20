import type { AppState } from '@excalidraw/excalidraw/types'

/**
 * Drawing preferences worth carrying between sessions (stroke color, fill
 * style, font, …). Deliberately excludes camera position — the fullscreen
 * editor fits the viewport to content on open instead, so a stale scroll/zoom
 * from a differently-sized window never leaves the scene looking empty.
 */
const PERSISTED_APP_STATE_KEYS = [
  'viewBackgroundColor',
  'currentItemStrokeColor',
  'currentItemBackgroundColor',
  'currentItemFillStyle',
  'currentItemStrokeWidth',
  'currentItemStrokeStyle',
  'currentItemRoughness',
  'currentItemOpacity',
  'currentItemFontFamily',
  'currentItemFontSize',
  'currentItemTextAlign',
  'currentItemArrowType',
  'currentItemStartArrowhead',
  'currentItemEndArrowhead',
  'currentItemRoundness',
  'gridModeEnabled',
] as const satisfies readonly (keyof AppState)[]

export function pickPersistedAppState(appState: AppState): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const key of PERSISTED_APP_STATE_KEYS) picked[key] = appState[key]
  return picked
}
