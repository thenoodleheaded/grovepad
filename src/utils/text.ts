/** Ellipsis-truncate a label for compact chrome (menus, chips, wire labels). */
export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}
