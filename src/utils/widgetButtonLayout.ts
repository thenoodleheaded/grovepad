import type { Widget } from '../types/spatial'

// ---------------------------------------------------------------------------
// Pure mirror of WidgetCard's title-row button flow: how many of the card's
// action buttons are active, whether they fit in the title row, and — the
// piece other geometry needs — whether any of them overflow into the
// vertical column past the card's right edge. WidgetCard's own hover
// catch-all needs this answer, so it lives here instead of being recomputed
// (and risking drift) in each place.
// ---------------------------------------------------------------------------

const BUTTON_CELL = 40
const TITLE_ICON_CELL = 40
const TITLE_ICON_GAP = 4
const TITLE_TRAILING_PAD = 8
const MAX_TITLE_TEXT_WIDTH = 200
const ESTIMATED_CHAR_WIDTH = 7

/** Count of the STATIC action buttons in the title row: Pin, Favorite, and
 * Delete on every card, plus the Completed checkbox on checklists. There is
 * no customize menu and no per-widget visibility. */
export function widgetActiveButtonCount(widget: Pick<Widget, 'type' | 'metadata'>): number {
  return widget.type === 'checklist' ? 4 : 3
}

/** Same estimate WidgetCard uses to reserve room for the draggable title text. */
export function widgetTitleAreaWidth(title: string): number {
  const estimated = Math.min(MAX_TITLE_TEXT_WIDTH, title.length * ESTIMATED_CHAR_WIDTH)
  return TITLE_ICON_CELL + TITLE_ICON_GAP + estimated + TITLE_TRAILING_PAD
}

/**
 * True when the static button row runs past the card's right edge — buttons
 * never wrap into a column, so a narrow card's row simply extends rightward,
 * past the card's own hover-catch-all width.
 */
export function widgetHasButtonOverflow(
  widget: Pick<Widget, 'type' | 'metadata' | 'title' | 'size'>,
): boolean {
  const itemCount = widgetActiveButtonCount(widget)
  const titleAreaWidth = widgetTitleAreaWidth(widget.title)
  const maxHorizontalSpace = widget.size.width - titleAreaWidth
  const maxHorizontalCount = Math.max(0, Math.floor(maxHorizontalSpace / BUTTON_CELL))
  return itemCount > maxHorizontalCount
}
