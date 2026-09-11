/**
 * Device-local canvas visit history — which canvases this person actually
 * works on, most recent first. Deliberately NOT board state: recency is a
 * per-device fact (two collaborators have different trails), so it lives in
 * localStorage beside the quick-add recents, never in the synced document.
 *
 * Fed by every canvas navigation; read by the command palette's "recent
 * canvases" row and by workspace switching, which returns to the canvas you
 * last stood on in that workspace instead of hard-jumping to its root.
 */

const RECENTS_KEY = 'gp-recent-canvases'

export interface CanvasVisit {
  id: string
  /** Epoch milliseconds of the most recent arrival. */
  at: number
}

export const CANVAS_RECENT_LIMIT = 24

/** Most-recent-first, de-duplicated by canvas id, capped. */
export function promoteCanvasVisit(
  list: readonly CanvasVisit[],
  id: string,
  at: number,
  limit = CANVAS_RECENT_LIMIT,
): CanvasVisit[] {
  if (!id) return [...list]
  return [{ id, at }, ...list.filter((visit) => visit.id !== id)].slice(0, limit)
}

export function readCanvasVisits(): CanvasVisit[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (value): value is CanvasVisit =>
          typeof value === 'object' &&
          value !== null &&
          typeof (value as CanvasVisit).id === 'string' &&
          typeof (value as CanvasVisit).at === 'number',
      )
      .slice(0, CANVAS_RECENT_LIMIT)
  } catch {
    return []
  }
}

/** Records a visit and returns the new list. Storage failure is never fatal. */
export function recordCanvasVisit(id: string, at = Date.now()): CanvasVisit[] {
  const next = promoteCanvasVisit(readCanvasVisits(), id, at)
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch {
    // A full or blocked store must not cost the user their navigation.
  }
  return next
}

/**
 * The canvas to land on when entering `workspaceId`: the most recently
 * visited canvas that still exists and still belongs to that workspace, or
 * null when the trail holds none (first visit, or everything was deleted).
 */
export function lastVisitedCanvasIn(
  visits: readonly CanvasVisit[],
  canvases: Record<string, { id: string; workspaceId: string }>,
  workspaceId: string,
): string | null {
  for (const visit of visits) {
    const canvas = canvases[visit.id]
    if (canvas && canvas.workspaceId === workspaceId) return canvas.id
  }
  return null
}
