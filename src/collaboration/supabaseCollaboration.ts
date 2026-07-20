import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { CollaborationRole } from './types'
import { byteaToBytes, bytesToBytea } from './binaryEncoding'

export interface CollaborationBootstrap {
  role: CollaborationRole
  snapshot: Uint8Array | null
  lastSequence: number
  updates: Array<{ id: string; sequence: number; payload: Uint8Array }>
}

export interface CollaborationCanvasMetadata {
  canvasId: string
  name: string
  ownerId: string
}

export interface CollaborationComment {
  id: string
  canvasId: string
  authorId: string
  parentId: string | null
  widgetId: string | null
  body: string
  createdAt: string
}

interface SnapshotRow { snapshot: string; last_seq: number }
interface UpdateRow { update_id: string; seq: number; payload: string }
interface MemberRow { role: CollaborationRole }

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export class SupabaseCollaborationRepository {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async ensureCanvas(canvasId: string, name: string): Promise<CollaborationRole> {
    const result = await this.client.rpc('ensure_canvas_collaboration', {
      p_canvas_id: canvasId,
      p_name: name,
    })
    throwIfError(result.error)
    if (typeof result.data === 'string') return result.data as CollaborationRole
    if (Array.isArray(result.data) && typeof result.data[0]?.role === 'string') {
      return result.data[0].role as CollaborationRole
    }
    const member = await this.client
      .from('canvas_members')
      .select('role')
      .eq('canvas_id', canvasId)
      .single<MemberRow>()
    throwIfError(member.error)
    return member.data!.role
  }

  async bootstrap(canvasId: string, name: string): Promise<CollaborationBootstrap> {
    const role = await this.ensureCanvas(canvasId, name)
    const snapshotResult = await this.client
      .from('canvas_crdt_documents')
      .select('snapshot,last_seq')
      .eq('canvas_id', canvasId)
      .maybeSingle<SnapshotRow>()
    throwIfError(snapshotResult.error)
    const snapshot = snapshotResult.data?.snapshot
      ? byteaToBytes(snapshotResult.data.snapshot)
      : null
    const lastSequence = snapshotResult.data?.last_seq ?? 0
    const updates = await this.fetchUpdates(canvasId, lastSequence)
    return { role, snapshot, lastSequence, updates }
  }

  async getCanvasMetadata(canvasId: string): Promise<CollaborationCanvasMetadata> {
    const result = await this.client
      .from('canvas_collaborations')
      .select('canvas_id,name,owner_id')
      .eq('canvas_id', canvasId)
      .single<{ canvas_id: string; name: string; owner_id: string }>()
    throwIfError(result.error)
    return { canvasId: result.data!.canvas_id, name: result.data!.name, ownerId: result.data!.owner_id }
  }

  async fetchUpdates(canvasId: string, afterSequence: number): Promise<CollaborationBootstrap['updates']> {
    const result = await this.client
      .from('canvas_crdt_updates')
      .select('update_id,seq,payload')
      .eq('canvas_id', canvasId)
      .gt('seq', afterSequence)
      .order('seq', { ascending: true })
      .limit(10_000)
      .returns<UpdateRow[]>()
    throwIfError(result.error)
    return (result.data ?? []).map((row) => ({
      id: row.update_id,
      sequence: Number(row.seq),
      payload: byteaToBytes(row.payload),
    }))
  }

  async persistUpdate(canvasId: string, updateId: string, payload: Uint8Array): Promise<number> {
    const result = await this.client
      .from('canvas_crdt_updates')
      .upsert({ canvas_id: canvasId, update_id: updateId, payload: bytesToBytea(payload) }, {
        onConflict: 'canvas_id,update_id', ignoreDuplicates: true,
      })
      .select('seq')
      .single<{ seq: number }>()
    if (result.error?.message.includes('0 rows')) {
      const existing = await this.client
        .from('canvas_crdt_updates')
        .select('seq')
        .eq('canvas_id', canvasId)
        .eq('update_id', updateId)
        .single<{ seq: number }>()
      throwIfError(existing.error)
      return Number(existing.data!.seq)
    }
    throwIfError(result.error)
    return Number(result.data!.seq)
  }

  async persistUpdates(
    canvasId: string,
    updates: ReadonlyArray<{ id: string; payload: Uint8Array }>,
  ): Promise<void> {
    if (updates.length === 0) return
    const result = await this.client.from('canvas_crdt_updates').upsert(
      updates.map((update) => ({
        canvas_id: canvasId,
        update_id: update.id,
        payload: bytesToBytea(update.payload),
      })),
      { onConflict: 'canvas_id,update_id', ignoreDuplicates: true },
    )
    throwIfError(result.error)
  }

  async compact(canvasId: string, snapshot: Uint8Array, lastSequence: number): Promise<void> {
    const result = await this.client.rpc('compact_canvas_crdt', {
      p_canvas_id: canvasId,
      p_snapshot: bytesToBytea(snapshot),
      p_last_seq: lastSequence,
    })
    throwIfError(result.error)
  }

  async setMemberRole(canvasId: string, email: string, role: CollaborationRole): Promise<void> {
    const result = await this.client.rpc('set_canvas_member_role', {
      p_canvas_id: canvasId, p_email: email.trim().toLowerCase(), p_role: role,
    })
    throwIfError(result.error)
  }

  async listComments(canvasId: string): Promise<CollaborationComment[]> {
    const result = await this.client
      .from('canvas_comments')
      .select('id,canvas_id,author_id,parent_id,widget_id,body,created_at')
      .eq('canvas_id', canvasId)
      .order('created_at', { ascending: true })
      .returns<Array<{
        id: string; canvas_id: string; author_id: string; parent_id: string | null
        widget_id: string | null; body: string; created_at: string
      }>>()
    throwIfError(result.error)
    return (result.data ?? []).map((row) => ({
      id: row.id, canvasId: row.canvas_id, authorId: row.author_id,
      parentId: row.parent_id, widgetId: row.widget_id, body: row.body, createdAt: row.created_at,
    }))
  }

  async addComment(
    canvasId: string,
    body: string,
    options: { parentId?: string; widgetId?: string } = {},
  ): Promise<void> {
    const result = await this.client.from('canvas_comments').insert({
      canvas_id: canvasId,
      body: body.trim(),
      parent_id: options.parentId ?? null,
      widget_id: options.widgetId ?? null,
    })
    throwIfError(result.error)
  }

  channel(canvasId: string, presenceKey: string): RealtimeChannel {
    return this.client.channel(`canvas:${canvasId}`, {
      config: { private: true, broadcast: { ack: true, self: false }, presence: { key: presenceKey } },
    })
  }
}
