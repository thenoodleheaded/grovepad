import type { CollaborationPresence } from './types'

export interface FollowResolution {
  /** The follow target after reconciling against who is actually present.
   * `null` means following must stop. */
  followingClientId: number | null
  /** Camera to adopt this tick, when the followed client is present and is
   * publishing one. */
  camera: { pan: { x: number; y: number }; zoom: number } | null
}

/**
 * Reconciles follow mode against the live participant list.
 *
 * Following hands the camera to someone else — the gesture engine routes
 * wheel/touch to them for as long as it is active. So a target that is no
 * longer present must drop follow rather than linger: otherwise the local
 * client keeps a locked camera it can never move, with a "Following" banner
 * naming nobody.
 */
export function resolveFollowTarget(
  participants: readonly CollaborationPresence[],
  followingClientId: number | null,
): FollowResolution {
  if (followingClientId === null) return { followingClientId: null, camera: null }
  const followed = participants.find((participant) => participant.clientId === followingClientId)
  if (!followed) return { followingClientId: null, camera: null }
  return { followingClientId, camera: followed.camera ?? null }
}
