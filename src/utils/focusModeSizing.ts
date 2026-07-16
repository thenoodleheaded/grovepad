import type { Size } from '../types/spatial'

export interface IslandSizeBounds {
  sizing: 'free' | 'width' | 'aspect' | 'fixed'
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
  containerWidth: number
}

/** Clamp one persisted island size to its current live charter. A result of
 * undefined means the saved geometry cannot be represented safely now and
 * must yield to the renderer's natural flow. */
export function safePersistedIslandSize(
  saved: Partial<Size> | undefined,
  bounds: IslandSizeBounds,
): Partial<Size> | undefined {
  if (!saved || bounds.sizing === 'fixed' || bounds.containerWidth <= 0) return undefined
  const maxWidth = Math.min(bounds.maxWidth, bounds.containerWidth)
  if (maxWidth < bounds.minWidth) return undefined
  const next: Partial<Size> = {}
  if (saved.width !== undefined && Number.isFinite(saved.width)) {
    next.width = Math.min(maxWidth, Math.max(bounds.minWidth, saved.width))
  }
  if (
    bounds.sizing !== 'width' &&
    saved.height !== undefined &&
    Number.isFinite(saved.height) &&
    bounds.maxHeight >= bounds.minHeight
  ) {
    next.height = Math.min(bounds.maxHeight, Math.max(bounds.minHeight, saved.height))
  }
  return next.width === undefined && next.height === undefined ? undefined : next
}
