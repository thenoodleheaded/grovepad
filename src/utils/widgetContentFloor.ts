import type { Size } from '../types/spatial'
import { WIDGET_MAX_EDGE } from '../types/spatial'
import type { WidgetSizing } from '../widgets/contracts/registry'

export type PanelFloorClass = 'reflow' | 'rows' | 'rigid' | 'controls'
export type PanelFlow = 'row' | 'column'

export interface PanelFloor {
  width: number
  height: number
}

const READABLE_REFLOW_WIDTH = 112
const CONTROL_MIN_HEIGHT = 28
/** Content box inset (padding + chrome) added when converting a content
 * height to a card height. Shared by the grow floor and the load-time fit. */
export const CARD_INSET = 24
/** Card heights are aligned to this sub-grid, finer than the 40px board grid. */
export const SUBGRID = 4

const finite = (value: number): number => Number.isFinite(value) ? value : 0
const px = (value: string): number => finite(Number.parseFloat(value))
const ceilSubgrid = (value: number): number => Math.ceil(value / SUBGRID) * SUBGRID

export function hasSignificantVerticalOverflow(value: number): boolean {
  return Number.isFinite(value) && value > SUBGRID
}

export function verticalContentFloor(
  scrollHeight: number,
  overflow: number,
  fallbackMinHeight = 0,
  inset = CARD_INSET,
): number {
  const contentHeight = hasSignificantVerticalOverflow(overflow)
    ? finite(scrollHeight) + inset
    : 0
  return ceilSubgrid(Math.max(fallbackMinHeight, contentHeight))
}

/**
 * Layout-pixel height of a widget's composed content, independent of a
 * stretched container. `scrollHeight` cannot detect a card taller than its
 * content: once the `.gp-widget-ui` fills an oversized card, its scrollHeight
 * equals its clientHeight and the emptiness is invisible. Summing the flow
 * children's own `offsetHeight` (plus their vertical margins) sees through
 * that — a compact stack reports its true short height, while a `flex-1`
 * region reports its stretched allocation, so genuinely content-filled cards
 * (including internal scroll panels) measure equal to the card and are left
 * alone. `offsetHeight` is unscaled layout px, so the reading is correct at
 * any canvas zoom (unlike getBoundingClientRect). Absolutely-positioned
 * children (the drag grip, port rails) never contribute.
 */
export function naturalContentHeight(ui: HTMLElement): number {
  let height = 0
  for (const child of Array.from(ui.children)) {
    const style = getComputedStyle(child)
    if (style.position === 'absolute' || style.position === 'fixed') continue
    height += (child as HTMLElement).offsetHeight + px(style.marginTop) + px(style.marginBottom)
  }
  return height
}

/** Snap a content-owned card height to the board grid in one idempotent step.
 * Unlike overflow repair, auto-height fitting is allowed to shrink a stale
 * default/saved height back to the renderer's natural content height. */
export function contentFitHeight(
  contentHeight: number,
  minHeight: number,
  maxHeight = Infinity,
  inset = CARD_INSET,
  grid = 40,
): number {
  const safeGrid = Math.max(1, finite(grid))
  const natural = Math.ceil((finite(contentHeight) + Math.max(0, finite(inset))) / safeGrid) * safeGrid
  return Math.min(maxHeight, Math.max(minHeight, natural))
}

/** Compose panel floors the same way their parent lays them out. */
export function composePanelFloors(
  panels: readonly PanelFloor[],
  flow: PanelFlow,
  gap = 0,
  insetX = 0,
  insetY = 0,
): PanelFloor {
  if (panels.length === 0) return { width: insetX, height: insetY }
  const seams = Math.max(0, panels.length - 1) * gap
  return flow === 'row'
    ? {
        width: panels.reduce((sum, panel) => sum + panel.width, 0) + seams + insetX,
        height: Math.max(...panels.map((panel) => panel.height)) + insetY,
      }
    : {
        width: Math.max(...panels.map((panel) => panel.width)) + insetX,
        height: panels.reduce((sum, panel) => sum + panel.height, 0) + seams + insetY,
      }
}

function visibleChildren(element: HTMLElement): HTMLElement[] {
  return Array.from(element.children).filter((child): child is HTMLElement => {
    if (!(child instanceof HTMLElement)) return false
    const style = getComputedStyle(child)
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      style.position !== 'absolute' && style.position !== 'fixed'
  })
}

let measureContext: CanvasRenderingContext2D | null = null

function measuredTextWidth(element: HTMLElement, text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const style = getComputedStyle(element)
  if (!measureContext) measureContext = document.createElement('canvas').getContext('2d')
  if (!measureContext) return trimmed.length * Math.max(5, px(style.fontSize) * 0.52)
  measureContext.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  return measureContext.measureText(trimmed).width
}

function ownText(element: HTMLElement): string {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join(' ')
    .trim()
}

function horizontalChrome(style: CSSStyleDeclaration): number {
  return px(style.paddingLeft) + px(style.paddingRight) +
    px(style.borderLeftWidth) + px(style.borderRightWidth)
}

function explicitMinimum(element: HTMLElement, axis: 'w' | 'h'): number {
  const declared = Number(element.dataset[`floorMin${axis.toUpperCase()}` as 'floorMinW' | 'floorMinH'])
  const css = px(axis === 'w' ? getComputedStyle(element).minWidth : getComputedStyle(element).minHeight)
  return Math.max(finite(declared), css)
}

function controlText(element: HTMLElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value || element.placeholder
  }
  if (element instanceof HTMLSelectElement) {
    return Array.from(element.options).map((option) => option.text).sort((a, b) => b.length - a.length)[0] ?? ''
  }
  return element.textContent ?? ''
}

/**
 * Browser min-content measurement with two deliberate differences from CSS:
 * single-line controls/ellipsis report their complete value, while prose is
 * allowed to wrap down to a readable two-word column.
 */
function intrinsicElementWidth(element: HTMLElement): number {
  const style = getComputedStyle(element)
  const explicit = explicitMinimum(element, 'w')
  if (element.dataset.floorOverflow === 'scroll') return Math.max(explicit, READABLE_REFLOW_WIDTH)

  const tag = element.tagName
  if (tag === 'TEXTAREA') return Math.max(explicit, READABLE_REFLOW_WIDTH)
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON') {
    const text = controlText(element)
    const affordance = tag === 'SELECT' ? 28 : tag === 'INPUT' ? 12 : 0
    return Math.max(explicit, CONTROL_MIN_HEIGHT, measuredTextWidth(element, text) + horizontalChrome(style) + affordance)
  }
  if (element instanceof HTMLTableElement) {
    const rows = Array.from(element.rows)
    const columnCount = rows[0]?.cells.length ?? 0
    if (columnCount > 0) {
      let widestCell = 0
      for (const row of rows) {
        for (const cell of Array.from(row.cells).slice(0, columnCount)) {
          widestCell = Math.max(widestCell, intrinsicElementWidth(cell))
        }
      }
      // The editable table deliberately renders equal columns. A long header
      // therefore raises every track's floor, not only its own cell.
      return Math.max(explicit, (widestCell + 8) * columnCount + horizontalChrome(style))
    }
  }

  const children = visibleChildren(element)
  const directText = ownText(element)
  const nowrap = style.whiteSpace === 'nowrap' || style.textOverflow === 'ellipsis' ||
    element.classList.contains('truncate') || element.dataset.floorLabel !== undefined
  const textWidth = nowrap
    ? measuredTextWidth(element, directText)
    : Math.max(0, ...directText.split(/\s+/).map((word) => measuredTextWidth(element, word)))

  if (children.length === 0) {
    return Math.max(explicit, textWidth + horizontalChrome(style))
  }

  const childFloors = children.map(intrinsicElementWidth)
  const columnGap = px(style.columnGap || style.gap)
  const rowLike =
    (style.display === 'flex' && style.flexDirection.startsWith('row') && style.flexWrap === 'nowrap') ||
    style.display === 'inline-flex' || style.display === 'table-row'

  let childrenWidth: number
  if (style.display === 'grid') {
    const tracks = style.gridTemplateColumns.split(' ').filter(Boolean).length || 1
    const columns = Array.from({ length: tracks }, () => 0)
    childFloors.forEach((width, index) => {
      const column = index % tracks
      columns[column] = Math.max(columns[column]!, width)
    })
    childrenWidth = columns.reduce((sum, width) => sum + width, 0) + Math.max(0, tracks - 1) * columnGap
  } else if (rowLike) {
    childrenWidth = childFloors.reduce((sum, width) => sum + width, 0) + Math.max(0, children.length - 1) * columnGap
  } else {
    childrenWidth = Math.max(...childFloors)
  }
  return Math.max(explicit, textWidth, childrenWidth + horizontalChrome(style))
}

function largestHiddenVerticalOverflow(root: HTMLElement): number {
  // Only overflow of the composed renderer can be repaired by growing the
  // card. A fixed-height child can have a persistent one-pixel text overflow;
  // adding that child delta to the outer height on every ResizeObserver pass
  // creates an endless grow loop without making the child any taller.
  return Math.max(0, root.scrollHeight - root.clientHeight)
}

export interface ContentFloorMeasurement {
  sizing: WidgetSizing
  growTo: Size
}

/**
 * Whether anything inside the card grows to fill the height it is given.
 *
 * This is the question that decides whether a card can have a *void* at all.
 * A stack of fixed-height pieces (rows, stat tiles, buttons) has one intrinsic
 * height, so any card taller than that is showing empty space below its last
 * control. A renderer with a stretching region — an internal scroll panel, a
 * canvas, a chart that fills its box — has no intrinsic height: it uses
 * whatever it is given, so there is no such thing as too tall.
 *
 * Only `flex-grow` is readable here: a computed style resolves every other way
 * of saying "fill the box" (`height: 100%`, `inset-0`) to the pixels it
 * currently occupies, which is indistinguishable from a fixed height. Those
 * cases are caught by the measurement instead — a filling child reports the
 * card's own height, so the derived ceiling sits above the card and never
 * binds. This check exists for the flex case, where the same reasoning would
 * otherwise pin a scroll panel to whatever height it happened to have.
 */
export function contentStretchesToFill(ui: HTMLElement): boolean {
  for (const child of Array.from(ui.children)) {
    const style = getComputedStyle(child)
    if (style.position === 'absolute' || style.position === 'fixed') continue
    if (px(style.flexGrow) > 0) return true
  }
  return false
}

/** Slack allowed above the content's own height before a card counts as
 * holding a void. One grid cell — the same threshold the scale-debug pass
 * already uses to flag `content-void`, so the resize gesture and the audit
 * agree on what "too tall" means. */
const CONTENT_CEILING_SLACK = 40

/** Measure one mounted full card. Deleting content lowers the returned floor;
 * callers enforce the grow-only rule by applying growTo only when it expands. */
export function measureWidgetContentFloor(
  root: HTMLElement,
  current: Size,
  fallback: WidgetSizing,
): ContentFloorMeasurement {
  // A measured floor is still a size, so the absolute ceiling binds it: an
  // unbounded floor could otherwise demand a card larger than any clamp would
  // grant, leaving the grow pass permanently unsatisfied.
  const maxWidth = Math.min(WIDGET_MAX_EDGE, fallback.maxWidth ?? WIDGET_MAX_EDGE)
  const maxHeight = Math.min(WIDGET_MAX_EDGE, fallback.maxHeight ?? WIDGET_MAX_EDGE)
  const intrinsicWidth = intrinsicElementWidth(root) + CARD_INSET
  const minWidth = Math.min(maxWidth, ceilSubgrid(Math.max(fallback.minWidth ?? 0, intrinsicWidth)))
  const overflowY = largestHiddenVerticalOverflow(root)
  const minHeight = Math.min(
    maxHeight,
    verticalContentFloor(root.scrollHeight, overflowY, fallback.minHeight),
  )
  // A card made only of fixed-height pieces has a real ceiling: past its own
  // content plus a cell of slack it is just empty space below the last
  // control. Publishing it as a live maximum is what stops a drag from
  // opening that void in the first place — the gesture meets the same wall
  // the store would clamp to, and the rubber band shows it.
  const natural = naturalContentHeight(root)
  const ceiling = !contentStretchesToFill(root) && natural > 0
    ? Math.max(minHeight, Math.min(maxHeight, ceilSubgrid(natural + CARD_INSET) + CONTENT_CEILING_SLACK))
    : undefined
  return {
    sizing: ceiling === undefined
      ? { minWidth, minHeight }
      : { minWidth, minHeight, maxHeight: ceiling },
    growTo: {
      width: Math.max(current.width, minWidth),
      height: Math.max(current.height, minHeight),
    },
  }
}
