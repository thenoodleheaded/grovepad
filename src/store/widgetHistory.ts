export interface HistoryStatus {
  canUndo: boolean
  canRedo: boolean
}

interface HistoryOptions {
  limit?: number
  coalesceMs?: number
  now?: () => number
}

/** Explicit, store-owned undo session. No process-global history survives hydration. */
export function createHistorySession<Snapshot>({
  limit = 100,
  coalesceMs = 900,
  now = Date.now,
}: HistoryOptions = {}) {
  const past: Snapshot[] = []
  const future: Snapshot[] = []
  let lastTag: string | null = null
  let lastTagAt = 0

  const status = (): HistoryStatus => ({
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  })

  return {
    /** Returns false when a same-tag edit coalesces into the previous step. */
    capture(snapshot: Snapshot, tag?: string): boolean {
      const timestamp = now()
      if (tag && tag === lastTag && timestamp - lastTagAt < coalesceMs) {
        lastTagAt = timestamp
        return false
      }
      lastTag = tag ?? null
      lastTagAt = timestamp
      past.push(snapshot)
      if (past.length > limit) past.shift()
      future.length = 0
      return true
    },

    undo(current: Snapshot): Snapshot | null {
      const snapshot = past.pop()
      if (!snapshot) return null
      future.push(current)
      lastTag = null
      return snapshot
    },

    redo(current: Snapshot): Snapshot | null {
      const snapshot = future.pop()
      if (!snapshot) return null
      past.push(current)
      lastTag = null
      return snapshot
    },

    clear(): void {
      past.length = 0
      future.length = 0
      lastTag = null
      lastTagAt = 0
    },

    status,
  }
}
