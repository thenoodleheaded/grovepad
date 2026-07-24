import { create } from 'zustand'
import type { CollaborationComment } from '../collaboration/supabaseCollaboration'
import type { CollaborationPresence, CollaborationRole } from '../collaboration/types'

export type CollaborationStatus =
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'error'

export interface CollaborationState {
  status: CollaborationStatus
  canvasId: string | null
  role: CollaborationRole | null
  localClientId: number | null
  participants: CollaborationPresence[]
  followingClientId: number | null
  comments: CollaborationComment[]
  commentsOpen: boolean
  pendingUpdates: number
  error: string | null
}

export const INITIAL_COLLABORATION_STATE: CollaborationState = {
  status: 'disabled',
  canvasId: null,
  role: null,
  localClientId: null,
  participants: [],
  followingClientId: null,
  comments: [],
  commentsOpen: false,
  pendingUpdates: 0,
  error: null,
}

export const useCollaborationStore = create<CollaborationState>()(() => ({
  ...INITIAL_COLLABORATION_STATE,
}))

export function canEditCollaborativeCanvas(role: CollaborationRole | null): boolean {
  return role === 'owner' || role === 'editor'
}

export function canCommentOnCollaborativeCanvas(role: CollaborationRole | null): boolean {
  return role === 'owner' || role === 'editor' || role === 'commenter'
}
