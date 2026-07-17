/** A calendar-day key in the user's local timezone, suitable for date inputs. */
export function localDayKey(at = Date.now()): string {
  const date = new Date(at)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Move by local calendar days so DST and positive UTC offsets cannot shift the date. */
export function localDayKeyInDays(days: number, at = Date.now()): string {
  const date = new Date(at)
  date.setDate(date.getDate() + days)
  return localDayKey(date.getTime())
}
