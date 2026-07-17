export function menuNavigationIndex(current: number, length: number, key: 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'): number {
  if (length <= 0) return -1
  if (key === 'Home') return 0
  if (key === 'End') return length - 1
  return (Math.max(0, current) + (key === 'ArrowDown' ? 1 : -1) + length) % length
}
