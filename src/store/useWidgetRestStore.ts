import { create } from 'zustand'
import type { Size, Vector2D } from '../types/spatial'
import { useWidgetStore } from './useWidgetStore'

const NO_OFFSET: Vector2D = { x: 0, y: 0 }

/**
 * The scale state a card was showing at the instant it expanded — the state it
 * must fold back onto when the expansion closes. A resting tile carries no
 * size: the tile re-derives from content on collapse. An icon keeps its exact
 * square, because an icon between 2×2 and 3×3 must come back at that precise
 * size, never at the 2×2 floor.
 */
export type ExpandOrigin = { kind: 'rest' } | { kind: 'icon'; size: Size }

interface WidgetRestState {
  /** The one widget currently expanded out of its resting face, or null.
   * Accordion: expanding one collapses the previous. */
  expandedWidgetId: string | null
  /**
   * How far the expanded card is drawn from its stored position, captured once
   * when it opens and then held still for as long as it stays open.
   *
   * Frozen on purpose. Recomputing it from the live size each frame meant that
   * resizing an open card moved it by half of every size change, so dragging
   * one side grew both — the card scaled out of its own centre no matter which
   * edge you had hold of. Freezing lets an open card be resized from the side
   * you grabbed; the next time it opens, a fresh offset centres it again.
   */
  expandedOffset: Vector2D
  /** What the expanded card looked like the moment it opened — captured with
   * the offset, forgotten with it on collapse. */
  expandedFrom: ExpandOrigin | null
  expandWidget: (id: string, offset?: Vector2D, origin?: ExpandOrigin) => void
  /**
   * Absorb an open card's resize into the view offset instead of its stored
   * position, so the side you pinned holds still on screen while the widget's
   * saved anchor never moves. That is what lets a card be scaled however it
   * likes and still fold back onto the exact spot it was opened from.
   */
  nudgeExpandedOffset: (delta: Vector2D) => void
  /**
   * Close the expansion and return the card to the state it was opened from.
   * A card opened out of an icon folds back into that exact icon square —
   * history-neutral, re-centred by the store so the icon lands on the very
   * spot it was opened from. `restoreOrigin: false` releases the slot without
   * the fold-back, for callers that intend to keep the card open (pinning).
   */
  collapseWidget: (options?: { restoreOrigin?: boolean }) => void
}

/**
 * Ephemeral, per-viewer view state for the resting-face system. Expansion is
 * a *view*, never an edit: nothing here persists, syncs to collaborators, or
 * creates undo history. The board's saved layout (position/size/iconified)
 * stays untouched — a reload simply returns every unpinned widget to rest.
 * (The one deliberate exception: opening a card *out of an icon* parks the
 * icon state for the life of the expansion; collapse puts it back, so the
 * open-and-close pair still nets to no edit.)
 */
export const useWidgetRestStore = create<WidgetRestState>((set, get) => ({
  expandedWidgetId: null,
  expandedOffset: NO_OFFSET,
  expandedFrom: null,
  expandWidget: (id, offset = NO_OFFSET, origin = { kind: 'rest' }) =>
    set({ expandedWidgetId: id, expandedOffset: offset, expandedFrom: origin }),
  nudgeExpandedOffset: (delta) => set((state) => (
    state.expandedWidgetId === null
      ? state
      : { expandedOffset: { x: state.expandedOffset.x + delta.x, y: state.expandedOffset.y + delta.y } }
  )),
  collapseWidget: (options = {}) => {
    const { expandedWidgetId, expandedFrom } = get()
    if (options.restoreOrigin !== false && expandedWidgetId !== null && expandedFrom?.kind === 'icon') {
      // Fold the card back into the icon it was opened from. skipHistory keeps
      // the round trip out of undo — the matching scale change on open skipped
      // it too, so the pair nets to nothing. The action re-centres the icon on
      // the tile box at the stored anchor, which is the exact inverse of the
      // re-centring the open performed: the icon lands where it started.
      useWidgetStore.getState().setWidgetScaleState(expandedWidgetId, 'icon', {
        skipHistory: true,
        toSize: expandedFrom.size,
      })
    }
    set({ expandedWidgetId: null, expandedOffset: NO_OFFSET, expandedFrom: null })
  },
}))
