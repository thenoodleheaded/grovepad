import { getSupabaseClient } from '../lib/supabase'
import { parsePersistedBoard, type PersistedBoard } from './persistence'

// ---------------------------------------------------------------------------
// One row per signed-in user in the `boards` table (see README/schema note in
// initCloudSync) — the whole board serialized as jsonb, same shape as the
// localStorage payload. No realtime/merge logic: last write wins, same as
// the debounced localStorage saver this mirrors.
// ---------------------------------------------------------------------------

export interface CloudBoardResult {
  board: PersistedBoard
  updatedAt: string | null
}

/** Fetches the signed-in user's board and reconciliation timestamp. */
export async function fetchCloudBoard(userId: string): Promise<CloudBoardResult | null> {
  const supabase = await getSupabaseClient()
  if (!supabase) throw new Error('Cloud client unavailable')
  const { data, error } = await supabase
    .from('boards')
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const board = parsePersistedBoard(data.data)
  if (!board) throw new Error('Cloud board has an unsupported or corrupt shape')
  return { board, updatedAt: typeof data.updated_at === 'string' ? data.updated_at : null }
}

/** Upserts the signed-in user's board. The caller surfaces failures while the
 * local IndexedDB copy remains available. */
export async function pushCloudBoard(userId: string, board: PersistedBoard): Promise<void> {
  const supabase = await getSupabaseClient()
  if (!supabase) throw new Error('Cloud client unavailable')
  const { error } = await supabase
    .from('boards')
    .upsert({ user_id: userId, data: board, updated_at: new Date().toISOString() })
  if (error) throw error
}
