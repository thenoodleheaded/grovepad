import { create } from 'zustand'
import type { Size, Vector2D } from '../types/spatial'

const NO_OFFSET: Vector2D = { x: 0, y: 0 }

/**
 * The scale state a card was showing at the instant it expanded — the state it
 * returns to when the expansion closes, and the state a pin has to record as
 * the thing it interrupted. A resting tile carries no size: the tile re-derives
 * from content. An icon keeps its exact square, because an icon between 2×2 and
 * 3×3 must come back at that precise size, never at the 2×2 floor.
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
   * Close the expansion. Nothing to put back: the board record was never
   * changed to open the card, not even for an icon, so dropping the slot IS
   * the collapse — the card simply draws as its tile or its icon again.
   */
  collapseWidget: () => void
}

/**
 * Ephemeral, per-viewer view state for the resting-face system. Expansion is
 * a *view*, never an edit: nothing here persists, syncs to collaborators, or
 * creates undo history. The board's saved layout (position/size/iconified)
 * stays untouched — a reload simply returns every unpinned widget to rest.
 *
 * That holds for icons too. Opening one used to swap it to a full card for the
 * life of the peek, which made a click a real board edit: neighbours shuffled
 * aside to make room, undo grew a step, and on a shared canvas everyone else's
 * view of the group jostled because someone glanced at a card. The record now
 * stays an icon throughout and the geometry layer sizes the open card from
 * `expandedSize` (see `expandedIconSize`); the swap commits at exactly one
 * moment — a pin — which is also the one moment making space is right.
 */
export const useWidgetRestStore = create<WidgetRestState>((set) => ({
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
  collapseWidget: () => {
    set({ expandedWidgetId: null, expandedOffset: NO_OFFSET, expandedFrom: null })
  },
}))
