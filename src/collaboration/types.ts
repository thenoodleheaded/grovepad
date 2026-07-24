import type { Connection } from '../types/circuit'
import type { Relation, Vector2D, Widget, WidgetGlue } from '../types/spatial'

export type CollaborationRole = 'owner' | 'editor' | 'commenter' | 'viewer'

export interface CanvasCollaborationSnapshot {
  canvasId: string
  canvas: {
    id: string
    name: string
    gridIntensity?: number
    linksVisible?: boolean
    relationStrict?: boolean
  }
  widgets: Record<string, Widget>
  relations: Record<string, Relation>
  connections: Record<string, Connection>
  glues: Record<string, WidgetGlue>
}

interface CollaborationCursor {
  x: number
  y: number
}

interface CollaborationCamera {
  pan: Vector2D
  zoom: number
}

export interface CollaborationPresence {
  clientId: number
  userId: string
  name: string
  color: string
  role: CollaborationRole
  cursor: CollaborationCursor | null
  selectedWidgetIds: string[]
  editingWidgetId: string | null
  camera: CollaborationCamera | null
  lastSeenAt: number
}
