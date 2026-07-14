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
}
