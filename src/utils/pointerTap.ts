interface PointerPoint {
  clientX: number
  clientY: number
}

export function pointerStayedWithinTapSlop(
  start: PointerPoint,
  current: PointerPoint,
  slop = 4,
): boolean {
  return Math.hypot(current.clientX - start.clientX, current.clientY - start.clientY) < slop
}
