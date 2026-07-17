import type { Size } from '../types/spatial'
import type { WidgetSizing } from '../widgets/contracts/registry'

export type PanelFloorClass = 'reflow' | 'rows' | 'rigid' | 'controls'
export type PanelFlow = 'row' | 'column'

export interface PanelFloor {
  width: number
  height: number
}

const READABLE_REFLOW_WIDTH = 112
const CONTROL_MIN_HEIGHT = 28
const CARD_INSET = 24
const SUBGRID = 4

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

export function panelClassForIsland(sizing?: string): PanelFloorClass {
  if (sizing === 'fixed' || sizing === 'aspect') return 'rigid'
  if (sizing === 'width') return 'controls'
  return 'reflow'
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
  const island = Number(element.dataset[`islandMin${axis.toUpperCase()}` as 'islandMinW' | 'islandMinH'])
  const css = px(axis === 'w' ? getComputedStyle(element).minWidth : getComputedStyle(element).minHeight)
  return Math.max(finite(declared), finite(island), css)
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

/** Measure one mounted full card. Deleting content lowers the returned floor;
 * callers enforce the grow-only rule by applying growTo only when it expands. */
export function measureWidgetContentFloor(
  root: HTMLElement,
  current: Size,
  fallback: WidgetSizing,
): ContentFloorMeasurement {
  const maxWidth = fallback.maxWidth ?? Infinity
  const maxHeight = fallback.maxHeight ?? Infinity
  const intrinsicWidth = intrinsicElementWidth(root) + CARD_INSET
  const minWidth = Math.min(maxWidth, ceilSubgrid(Math.max(fallback.minWidth ?? 0, intrinsicWidth)))
  const overflowY = largestHiddenVerticalOverflow(root)
  const minHeight = Math.min(
    maxHeight,
    verticalContentFloor(root.scrollHeight, overflowY, fallback.minHeight),
  )
  return {
    sizing: { minWidth, minHeight },
    growTo: {
      width: Math.max(current.width, minWidth),
      height: Math.max(current.height, minHeight),
    },
  }
}
