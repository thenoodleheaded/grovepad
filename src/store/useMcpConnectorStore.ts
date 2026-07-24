import { create } from 'zustand'
import { canEditCollaborativeCanvas, useCollaborationStore } from './useCollaborationStore'
import { useToastStore } from './useToastStore'
import { useWidgetStore } from './useWidgetStore'
import { thoughtPlanFromMcpTree, type McpTreePreview } from '../mcp/treeContract'

type McpConnectorStatus = 'disabled' | 'connecting' | 'connected'

interface McpCommitOutcome {
  canvasId: string
  createdIds: string[]
  alreadyCommitted: boolean
}

/** Retired previews (committed or dismissed) are remembered so a replayed
 * commit_tree stays idempotent instead of erroring or duplicating a tree.
 * Only the most recent handful matter; previews themselves expire in minutes. */
const RETIRED_LIMIT = 20

interface McpConnectorState {
  status: McpConnectorStatus
  connectedClients: number
  previews: McpTreePreview[]
  committed: Record<string, { canvasId: string; createdIds: string[] }>
  dismissedIds: string[]
  setConnection: (status: McpConnectorStatus, connectedClients?: number) => void
  addPreview: (preview: McpTreePreview) => void
  dismissPreview: (previewId: string) => void
  pruneExpiredPreviews: (now?: number) => void
  /** Creates the preview's cards as one Undo action, from either the AI
   * client's commit_tree call or the on-canvas Add button — whichever runs
   * first wins and the other replays the same result. Throws with an
   * AI-readable message when the preview cannot be committed. */
  commitPreview: (previewId: string) => McpCommitOutcome
}

function capRetired<T>(entries: [string, T][]): Record<string, T> {
  return Object.fromEntries(entries.slice(-RETIRED_LIMIT))
}

export const useMcpConnectorStore = create<McpConnectorState>()((set, get) => ({
  status: 'disabled',
  connectedClients: 0,
  previews: [],
  committed: {},
  dismissedIds: [],

  setConnection: (status, connectedClients = 0) => set({ status, connectedClients }),

  addPreview: (preview) => {
    get().pruneExpiredPreviews()
    set((state) => ({ previews: [...state.previews.filter((p) => p.previewId !== preview.previewId), preview] }))
    useToastStore.getState().addToast(
      `AI proposed a ${preview.nodes.length}-card tree — review it on the canvas`,
    )
  },

  dismissPreview: (previewId) => {
    if (!get().previews.some((p) => p.previewId === previewId)) return
    set((state) => ({
      previews: state.previews.filter((p) => p.previewId !== previewId),
      dismissedIds: [...state.dismissedIds.filter((id) => id !== previewId), previewId].slice(-RETIRED_LIMIT),
    }))
  },

  pruneExpiredPreviews: (now = Date.now()) => {
    if (get().previews.every((p) => p.expiresAt > now)) return
    set((state) => ({ previews: state.previews.filter((p) => p.expiresAt > now) }))
  },

  commitPreview: (previewId) => {
    get().pruneExpiredPreviews()
    const replay = get().committed[previewId]
    if (replay) return { ...replay, alreadyCommitted: true }
    if (get().dismissedIds.includes(previewId)) {
      throw new Error('The user dismissed this preview inside Grovepad; ask them before preparing a new tree')
    }
    const preview = get().previews.find((p) => p.previewId === previewId)
    if (!preview) throw new Error('Tree preview is missing or expired; run preview_tree again')
    const board = useWidgetStore.getState()
    const canvas = board.canvases[preview.canvasId]
    if (!canvas) throw new Error('Target canvas no longer exists')
    if (board.activeCanvasId !== preview.canvasId) {
      throw new Error(`Open "${canvas.name}" in Grovepad before committing this tree`)
    }
    if (canvas.shared && !canEditCollaborativeCanvas(useCollaborationStore.getState().role)) {
      throw new Error('Your role cannot edit this shared canvas')
    }
    const createdIds = board.commitThoughtPlan(thoughtPlanFromMcpTree(preview), preview.origin)
    if (createdIds.length !== preview.nodes.length) {
      throw new Error('Grovepad could not create every card in the preview')
    }
    set((state) => ({
      previews: state.previews.filter((p) => p.previewId !== previewId),
      committed: capRetired([
        ...Object.entries(state.committed),
        [previewId, { canvasId: preview.canvasId, createdIds }],
      ]),
    }))
    useToastStore.getState().addToast(`Added ${createdIds.length} cards from AI`, {
      action: { label: 'Undo', run: () => useWidgetStore.getState().undo() },
    })
    return { canvasId: preview.canvasId, createdIds, alreadyCommitted: false }
  },
}))
