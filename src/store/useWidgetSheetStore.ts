import { create } from 'zustand'
import type { SheetOrigin } from '../utils/widgetSheet'

interface WidgetSheetState {
  /** The one widget currently taking over the screen, or null. */
  sheetWidgetId: string | null
  /**
   * The on-screen rectangle the sheet grew out of, captured at the instant it
   * opened. The closing flight re-measures the tile instead of reusing this,
   * because the board can be panned or zoomed underneath an open sheet — but
   * this stays the honest fallback for a tile that is no longer on screen.
   */
  origin: SheetOrigin | null
  openWidgetSheet: (widgetId: string, origin: SheetOrigin | null) => void
  closeWidgetSheet: () => void
}

/**
 * Ephemeral, per-viewer view state for the phone fullscreen presentation —
 * the small-screen counterpart of the in-place expansion in
 * useWidgetRestStore. Nothing here persists, syncs, or enters undo history:
 * the board underneath is untouched, the widget keeps resting on the canvas at
 * its stored position, and closing the sheet leaves no trace.
 *
 * Deliberately a separate store from the expansion slot rather than a flag on
 * it. Every geometry consumer on the canvas — relation lines, wires, glue
 * seams, settling, virtualization — asks widgetRest.ts what a widget's
 * footprint is, and while a sheet is open the honest answer is "exactly what
 * it was before, a resting tile". Keeping the two apart means the canvas needs
 * no phone-specific cases at all.
 */
export const useWidgetSheetStore = create<WidgetSheetState>((set) => ({
  sheetWidgetId: null,
  origin: null,
  openWidgetSheet: (widgetId, origin) => set({ sheetWidgetId: widgetId, origin }),
  closeWidgetSheet: () => set({ sheetWidgetId: null }),
}))
