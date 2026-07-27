const TITLE_PREFIX = 'grovepad |'

export function grovepadPageTitle(page: string, status?: string): string {
  const pageName = page.trim() || 'canvas'
  const pageStatus = status?.trim()
  return `${TITLE_PREFIX} ${pageName}${pageStatus ? ` (${pageStatus})` : ''}`
}
