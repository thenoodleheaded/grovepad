import { GRID_SIZE } from '../../types/spatial'
import { localDayKey } from '../../utils/localDate'

/** Grid cell shorthand used throughout registry default sizes. */
export const C = GRID_SIZE

export function uid(): string {
  return crypto.randomUUID()
}

export function todayISO(): string {
  return localDayKey()
}
