import type { Connection } from '../types/circuit'
import type { Relation, Vector2D, Widget, WidgetGroup } from '../types/spatial'

export type CollaborationRole = 'owner' | 'editor' | 'commenter' | 'viewer'

export interface CanvasCollaborationSnapshot {
  canvasId: string
  canvas: { id: string; name: string }
  widgets: Record<string, Widget>
  relations: Record<string, Relation>
  connections: Record<string, Connection>
  groups: Record<string, WidgetGroup>
}

export interface CollaborationCursor {
  x: number
  y: number
}

export interface CollaborationCamera {
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
