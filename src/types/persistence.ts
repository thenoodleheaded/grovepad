import type { Connection } from './circuit'
import type {
  CanvasMeta,
  DomainPack,
  Relation,
  Vector2D,
  Widget,
  WidgetGroup,
  Workspace,
} from './spatial'

/** Version-2 board payload accepted by local, IndexedDB, and cloud adapters. */
export interface PersistedBoard {
  workspaces: Record<string, Workspace>
  canvases: Record<string, CanvasMeta>
  widgets: Record<string, Widget>
  relations: Record<string, Relation>
  /** Circuit wires. Absent in older payloads and normalized to an empty record. */
  connections: Record<string, Connection>
  groups: Record<string, WidgetGroup>
  activePacks: DomainPack[]
  activeWorkspaceId: string
  activeCanvasId: string
  canvasViews: Record<string, { pan: Vector2D; zoom: number }>
}
