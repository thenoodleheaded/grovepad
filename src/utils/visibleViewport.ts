import type { Size } from '../types/spatial'

export interface VisibleViewport extends Size {
  offsetLeft: number
  offsetTop: number
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
