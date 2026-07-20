import type { CollaborationRole } from './types'

interface CollaborationController {
  setEditingWidget: (widgetId: string | null) => void
  follow: (clientId: number | null) => void
  invite: (email: string, role: CollaborationRole) => Promise<void>
  postComment: (body: string, parentId?: string, widgetId?: string) => Promise<void>
  refreshComments: () => Promise<void>
}

let controller: CollaborationController | null = null

export function registerCollaborationController(next: CollaborationController): () => void {
  controller = next
  return () => {
    if (controller === next) controller = null
  }
}

export function setCollaborativeEditingWidget(widgetId: string | null): void {
  controller?.setEditingWidget(widgetId)
}

export function followCollaborator(clientId: number | null): void {
  controller?.follow(clientId)
}

export function collaborationShareUrl(canvasId: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set('collaborate', canvasId)
  return url.toString()
}

export function inviteCollaborator(email: string, role: CollaborationRole): Promise<void> {
  return controller?.invite(email, role) ?? Promise.reject(new Error('Collaboration is not connected'))
}

export function postCollaborationComment(
  body: string,
  parentId?: string,
  widgetId?: string,
): Promise<void> {
  return controller?.postComment(body, parentId, widgetId) ?? Promise.reject(new Error('Collaboration is not connected'))
}

export function refreshCollaborationComments(): Promise<void> {
  return controller?.refreshComments() ?? Promise.resolve()
}

