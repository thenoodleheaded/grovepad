import { clampZoom, type Size, type Vector2D } from '../types/spatial'

export interface VisibleViewport extends Size {
  offsetLeft: number
  offsetTop: number
}

export interface FocusRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Frames a widget inside the part of the browser that is actually visible.
 * `visualViewport` becomes shorter and may move down while a mobile keyboard
 * is open, unlike the layout viewport used by ordinary canvas framing.
 */
export function focusViewForVisibleViewport(
  rect: FocusRect,
  viewport: VisibleViewport,
  padding: number,
): { pan: Vector2D; zoom: number } {
  const width = Math.max(1, rect.width)
  const height = Math.max(1, rect.height)
  const availableWidth = Math.max(1, viewport.width - padding * 2)
  const availableHeight = Math.max(1, viewport.height - padding * 2)
  const zoom = clampZoom(Math.min(1.45, availableWidth / width, availableHeight / height))
  return {
    zoom,
    pan: {
      x: viewport.offsetLeft + viewport.width / 2 - (rect.x + width / 2) * zoom,
      y: viewport.offsetTop + viewport.height / 2 - (rect.y + height / 2) * zoom,
    },
  }
}

export function visibleViewportFromWindow(): VisibleViewport {
  const viewport = window.visualViewport
  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
    offsetLeft: viewport?.offsetLeft ?? 0,
    offsetTop: viewport?.offsetTop ?? 0,
  }
}

export function virtualKeyboardInset(
  layoutHeight: number,
  viewport: Pick<VisibleViewport, 'height' | 'offsetTop'>,
): number {
  return Math.max(0, Math.round(layoutHeight - viewport.height - viewport.offsetTop))
}

export function virtualKeyboardIsOpen(inset: number): boolean {
  // Browser bars and safe areas fluctuate by a few dozen pixels. A software
  // keyboard is a much larger occlusion, so keep the state stable below 120.
  return inset >= 120
}
