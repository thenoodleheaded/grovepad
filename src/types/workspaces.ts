export interface Workspace {
  id: string
  name: string
  rootCanvasId: string
  createdAt: number
  sortIndex?: number
  tint?: string
}

export interface CanvasMeta {
  id: string
  name: string
  workspaceId: string
  /** Null only for a workspace root canvas. */
  parentCanvasId: string | null
  /**
   * Opt-in collaboration. Missing/false means the canvas never leaves this
   * device. True means it has a server collaboration the owner's invitees can
   * join; access is still membership-only, never public.
   */
  shared?: boolean
  /** Per-canvas multiplier for the device's grid preference. */
  gridIntensity?: number
  /** Hides relation, dependency, and circuit lines without deleting them. */
  linksVisible?: boolean
  /**
   * Legacy canvas-wide relation setting. Retained only so older board files
   * round-trip without data loss; current relation behavior ignores it.
   * @deprecated Strictness is no longer a canvas preference.
   */
  relationStrict?: boolean
}
