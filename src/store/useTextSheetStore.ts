import { create } from 'zustand'
import type { SheetOrigin } from '../utils/widgetSheet'

interface TextSheetState {
  /** The one Text card currently open in the writing view, or null. */
  widgetId: string | null
  /**
   * The card's on-screen rectangle at the instant it opened, so the sheet can
   * grow out of the card rather than appearing from nowhere. Null when the
   * card was off screen — the sheet then simply grows from its own centre.
   */
  origin: SheetOrigin | null
  openTextSheet: (widgetId: string, origin: SheetOrigin | null) => void
  closeTextSheet: () => void
}

/**
 * Which Text card is open in the writing view.
 *
 * Lifted out of the card for one reason: the way in is the expand button on
 * the card's own name row, and that row is chrome the CARD owns — it is drawn
 * for a resting tile too, when the widget's editor is not mounted at all. A
 * flag inside `TextWidget` could never be reached from there.
 *
 * Ephemeral, per-viewer, and deliberately separate from `useWidgetSheetStore`
 * for the same reason that one is separate from the expansion slot: nothing
 * here persists, syncs, or enters undo history, and the board underneath is
 * untouched while it is open.
 */
export const useTextSheetStore = create<TextSheetState>((set) => ({
  widgetId: null,
  origin: null,
  openTextSheet: (widgetId, origin) => set({ widgetId, origin }),
  closeTextSheet: () => set({ widgetId: null }),
}))
