import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { useMcpConnectorStore } from './useMcpConnectorStore'
import { useWidgetStore } from './useWidgetStore'
import type { McpTreePreview } from '../mcp/treeContract'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
  useMcpConnectorStore.setState({
    status: 'disabled', connectedClients: 0, previews: [], committed: {}, dismissedIds: [],
  })
})

function makePreview(overrides: Partial<McpTreePreview> = {}): McpTreePreview {
  const now = Date.now()
  return {
    previewId: crypto.randomUUID(),
    canvasId: useWidgetStore.getState().activeCanvasId,
    origin: { x: 0, y: 0 },
    createdAt: now,
    expiresAt: now + 600_000,
    nodes: [
      { id: 'root', title: 'Launch plan', parentId: null, note: '', depth: 0 },
      { id: 'child', title: 'First milestone', parentId: 'root', note: 'Ship it', depth: 1 },
    ],
    ...overrides,
  }
}

describe('MCP preview lifecycle', () => {
  it('commits a pending preview as one undoable action', () => {
    const preview = makePreview()
    useMcpConnectorStore.getState().addPreview(preview)
    expect(useMcpConnectorStore.getState().previews).toHaveLength(1)

    const outcome = useMcpConnectorStore.getState().commitPreview(preview.previewId)
    expect(outcome.alreadyCommitted).toBe(false)
    expect(outcome.createdIds).toHaveLength(2)
    expect(useMcpConnectorStore.getState().previews).toHaveLength(0)
    for (const id of outcome.createdIds) {
      expect(useWidgetStore.getState().widgets[id]?.type).toBe('notes')
    }

    useWidgetStore.getState().undo()
    for (const id of outcome.createdIds) {
      expect(useWidgetStore.getState().widgets[id]).toBeUndefined()
    }
  })

  it('replays a committed preview instead of duplicating the tree', () => {
    const preview = makePreview()
    useMcpConnectorStore.getState().addPreview(preview)
    const first = useMcpConnectorStore.getState().commitPreview(preview.previewId)
    const widgetCount = Object.keys(useWidgetStore.getState().widgets).length

    const replay = useMcpConnectorStore.getState().commitPreview(preview.previewId)
    expect(replay.alreadyCommitted).toBe(true)
    expect(replay.createdIds).toEqual(first.createdIds)
    expect(replay.canvasId).toBe(first.canvasId)
    expect(Object.keys(useWidgetStore.getState().widgets)).toHaveLength(widgetCount)
  })

  it('tells the AI client when the user dismissed its preview', () => {
    const preview = makePreview()
    useMcpConnectorStore.getState().addPreview(preview)
    useMcpConnectorStore.getState().dismissPreview(preview.previewId)
    expect(useMcpConnectorStore.getState().previews).toHaveLength(0)
    expect(() => useMcpConnectorStore.getState().commitPreview(preview.previewId))
      .toThrow(/dismissed this preview/)
  })

  it('expires previews and refuses to commit them afterwards', () => {
    const preview = makePreview({ expiresAt: Date.now() - 1 })
    useMcpConnectorStore.setState({ previews: [preview] })
    useMcpConnectorStore.getState().pruneExpiredPreviews()
    expect(useMcpConnectorStore.getState().previews).toHaveLength(0)
    expect(() => useMcpConnectorStore.getState().commitPreview(preview.previewId))
      .toThrow(/missing or expired/)
  })

  it('requires the preview canvas to be the open canvas', () => {
    const owner = useWidgetStore.getState().createWidget('Nested', { x: 0, y: 0 }, 'canvas_node')
    const childCanvas = (useWidgetStore.getState().widgets[owner]!.data as { canvasId: string }).canvasId
    const preview = makePreview({ canvasId: childCanvas })
    useMcpConnectorStore.getState().addPreview(preview)
    expect(() => useMcpConnectorStore.getState().commitPreview(preview.previewId))
      .toThrow(/before committing this tree/)
  })
})
