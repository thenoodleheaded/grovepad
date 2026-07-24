import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { SupabaseCollaborationRepository } from './supabaseCollaboration'

describe('SupabaseCollaborationRepository channels', () => {
  it('separates board updates from member awareness', () => {
    const calls: Array<{ topic: string; options: unknown }> = []
    const client = {
      channel: (topic: string, options: unknown) => {
        calls.push({ topic, options })
        return { topic } as unknown as RealtimeChannel
      },
    } as unknown as SupabaseClient
    const repository = new SupabaseCollaborationRepository(client)

    repository.channel('canvas-1')
    repository.awarenessChannel('canvas-1', 'user-1')

    expect(calls).toEqual([
      {
        topic: 'canvas:canvas-1',
        options: { config: { private: true, broadcast: { ack: true, self: false } } },
      },
      {
        topic: 'awareness:canvas-1',
        options: {
          config: {
            private: true,
            broadcast: { ack: true, self: false },
            presence: { key: 'user-1' },
          },
        },
      },
    ])
  })
})
