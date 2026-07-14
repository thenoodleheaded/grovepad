export interface PopoverPoint {
  x: number
  y: number
}

/** Clamp a fixed-position surface into the visual viewport with safe gutters. */
export function clampPopover(
  x: number,
  y: number,
  width: number,
  height: number,
  gutter = 12,
): PopoverPoint {
  const viewport = window.visualViewport
  const viewportWidth = viewport?.width ?? window.innerWidth
  const viewportHeight = viewport?.height ?? window.innerHeight
  const offsetX = viewport?.offsetLeft ?? 0
  const offsetY = viewport?.offsetTop ?? 0
  return {
    x: Math.max(offsetX + gutter, Math.min(x, offsetX + viewportWidth - width - gutter)),
    y: Math.max(offsetY + gutter, Math.min(y, offsetY + viewportHeight - height - gutter)),
  }
}

export function belowAnchor(
  anchor: DOMRect,
  width: number,
  height: number,
  gap = 8,
): PopoverPoint {
  return clampPopover(anchor.left, anchor.bottom + gap, width, height)
}
