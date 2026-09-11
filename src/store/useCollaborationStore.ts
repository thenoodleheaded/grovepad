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
  publicAccess: boolean
  localClientId: number | null
  participants: CollaborationPresence[]
  followingClientId: number | null
  comments: CollaborationComment[]
  pendingUpdates: number
  error: string | null
  /**
   * A `?collaborate=` link the user has not accepted yet.
   *
   * Joining is not a read: it marks a local canvas shared and replaces its
   * contents with the remote document. Doing that straight off a URL meant a
   * link could blank somebody's board on page load, so the invite waits here
   * until it is confirmed.
   */
  pendingInvite: PendingCanvasInvite | null
}

export interface PendingCanvasInvite {
  canvasId: string
  name: string
}

export const INITIAL_COLLABORATION_STATE: CollaborationState = {
  status: 'disabled',
  canvasId: null,
  role: null,
  publicAccess: false,
  localClientId: null,
  participants: [],
  followingClientId: null,
  comments: [],
  pendingUpdates: 0,
  error: null,
  pendingInvite: null,
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
