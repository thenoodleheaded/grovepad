import { useMcpConnectorStore } from '../store/useMcpConnectorStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useCanvasStore } from '../store/useCanvasStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { screenToWorld } from '../types/spatial'
import {
  canvasOutline,
  MCP_TREE_LIMITS,
  normalizeMcpTreeDraft,
  type McpTreePreview,
} from '../mcp/treeContract'

const BRIDGE_BASE_PORT = 43_110
const BRIDGE_PORT_COUNT = 5
const RECONNECT_DELAY_MS = 2_500

interface BridgeRequest {
  requestId: string
  method: string
  params?: unknown
}

interface McpBridgeRuntimeOptions {
  basePort?: number
  portCount?: number
  fetchImpl?: typeof fetch
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function viewCenterWorld() {
  const { pan, zoom, viewportSize } = useCanvasStore.getState()
  return screenToWorld(
    { x: viewportSize.width / 2, y: viewportSize.height / 2 },
    { x: pan.x, y: pan.y, zoom },
  )
}

function waitForRetry(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timeout = window.setTimeout(resolve, RECONNECT_DELAY_MS)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timeout)
      resolve()
    }, { once: true })
  })
}

function responseError(value: unknown, fallback: string): string {
  if (value && typeof value === 'object' && 'error' in value && typeof value.error === 'string') {
    return value.error
  }
  return fallback
}

function createToolHandler() {
  return async (method: string, params: unknown): Promise<unknown> => {
    useMcpConnectorStore.getState().pruneExpiredPreviews()
    const state = useWidgetStore.getState()
    const activeCanvas = state.canvases[state.activeCanvasId]

    if (method === 'status') {
      return {
        connected: true,
        connectorEnabled: useSettingsStore.getState().mcpConnector,
        activeCanvasId: state.activeCanvasId,
        activeCanvasName: activeCanvas?.name ?? null,
        canvasPrivacy: activeCanvas?.shared ? 'shared' : 'private',
        pendingPreviews: useMcpConnectorStore.getState().previews.length,
      }
    }

    if (method === 'list_canvases') {
      return {
        activeCanvasId: state.activeCanvasId,
        canvases: Object.values(state.canvases)
          .map((canvas) => ({
            id: canvas.id,
            name: canvas.name,
            workspaceId: canvas.workspaceId,
            workspaceName: state.workspaces[canvas.workspaceId]?.name ?? 'Unknown workspace',
            parentCanvasId: canvas.parentCanvasId,
            active: canvas.id === state.activeCanvasId,
            privacy: canvas.shared ? 'shared' : 'private',
          }))
          .sort((a, b) => a.workspaceName.localeCompare(b.workspaceName) || a.name.localeCompare(b.name)),
      }
    }

    if (method === 'read_canvas_outline') {
      const input = object(params ?? {}, 'read_canvas_outline input')
      const canvasId = input.canvasId === undefined ? state.activeCanvasId : input.canvasId
      if (typeof canvasId !== 'string' || !state.canvases[canvasId]) throw new Error('Canvas was not found')
      if (input.includeNoteText !== undefined && typeof input.includeNoteText !== 'boolean') {
        throw new Error('includeNoteText must be true or false')
      }
      return {
        canvasId,
        canvasName: state.canvases[canvasId].name,
        ...canvasOutline(state.widgets, state.relations, canvasId, input.includeNoteText !== false),
      }
    }

    if (method === 'preview_tree') {
      const draft = normalizeMcpTreeDraft(params, state.activeCanvasId, viewCenterWorld())
      const canvas = state.canvases[draft.canvasId]
      if (!canvas) throw new Error('Target canvas was not found')
      if (draft.canvasId !== state.activeCanvasId) {
        throw new Error(`Open "${canvas.name}" in Grovepad before previewing a tree there`)
      }
      const now = Date.now()
      const preview: McpTreePreview = {
        ...draft,
        previewId: crypto.randomUUID(),
        createdAt: now,
        expiresAt: now + MCP_TREE_LIMITS.previewLifetimeMs,
      }
      useMcpConnectorStore.getState().addPreview(preview)
      return {
        previewId: preview.previewId,
        canvasId: preview.canvasId,
        canvasName: canvas.name,
        nodeCount: preview.nodes.length,
        rootCount: preview.nodes.filter((node) => node.parentId === null).length,
        maxDepth: Math.max(...preview.nodes.map((node) => node.depth)),
        expiresInMinutes: MCP_TREE_LIMITS.previewLifetimeMs / 60_000,
        nodes: preview.nodes.map(({ id, title, parentId, depth }) => ({ id, title, parentId, depth })),
        message: 'The board is unchanged. The tree is now visible on the user\'s canvas with Add and Dismiss buttons; the user can approve it there, or you can call commit_tree with this previewId.',
      }
    }

    if (method === 'commit_tree') {
      const input = object(params, 'commit_tree input')
      if (typeof input.previewId !== 'string') throw new Error('previewId must be text')
      // The store consumes a preview on its first successful commit — from
      // either this call or the on-canvas Add button — so a retried or raced
      // commit replays the same created ids and can never duplicate a tree.
      const outcome = useMcpConnectorStore.getState().commitPreview(input.previewId)
      return {
        committed: true,
        canvasId: outcome.canvasId,
        createdIds: outcome.createdIds,
        undoableAsOneAction: true,
        ...(outcome.alreadyCommitted
          ? { alreadyCommitted: true, message: 'The user already added this preview inside Grovepad; the cards exist and nothing was duplicated.' }
          : {}),
      }
    }

    throw new Error(`Unsupported Grovepad tool operation: ${method}`)
  }
}

/** Connect the browser app to every MCP process in the small loopback port
 * range. This lets multiple MCP clients work simultaneously without sharing
 * stdio or fighting over one fixed port. */
export function initMcpBridgeRuntime(options: McpBridgeRuntimeOptions = {}): () => void {
  const basePort = options.basePort ?? BRIDGE_BASE_PORT
  const portCount = options.portCount ?? BRIDGE_PORT_COUNT
  const fetchImpl = options.fetchImpl ?? fetch
  const handleTool = createToolHandler()
  let controller: AbortController | null = null
  let disposed = false
  const connectedPorts = new Set<number>()

  const publishConnection = () => {
    if (disposed) return
    if (!useSettingsStore.getState().mcpConnector) {
      useMcpConnectorStore.getState().setConnection('disabled')
    } else if (connectedPorts.size > 0) {
      useMcpConnectorStore.getState().setConnection('connected', connectedPorts.size)
    } else {
      useMcpConnectorStore.getState().setConnection('connecting')
    }
  }

  const runPort = async (port: number, signal: AbortSignal) => {
    const baseUrl = `http://127.0.0.1:${port}`
    while (!signal.aborted) {
      try {
        const registration = await fetchImpl(`${baseUrl}/bridge/register`, {
          method: 'POST', mode: 'cors', cache: 'no-store', signal,
        })
        if (!registration.ok) throw new Error('Bridge registration was rejected')
        const registrationBody = await registration.json() as unknown
        const token = object(registrationBody, 'Bridge registration').token
        if (typeof token !== 'string') throw new Error('Bridge registration token is missing')
        connectedPorts.add(port)
        publishConnection()

        while (!signal.aborted) {
          const next = await fetchImpl(`${baseUrl}/bridge/next`, {
            headers: { Authorization: `Bearer ${token}` },
            mode: 'cors', cache: 'no-store', signal,
          })
          if (next.status === 204) continue
          if (!next.ok) throw new Error('Bridge session ended')
          const body = object(await next.json(), 'Bridge request')
          if (typeof body.requestId !== 'string' || typeof body.method !== 'string') {
            throw new Error('Bridge request is malformed')
          }
          const request: BridgeRequest = {
            requestId: body.requestId,
            method: body.method,
            params: body.params,
          }
          let result: unknown
          let error: string | undefined
          try {
            result = await handleTool(request.method, request.params)
          } catch (cause) {
            error = cause instanceof Error ? cause.message : String(cause)
          }
          const response = await fetchImpl(`${baseUrl}/bridge/result`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ requestId: request.requestId, ...(error ? { error } : { result }) }),
            mode: 'cors', cache: 'no-store', signal,
          })
          if (!response.ok) {
            const value = await response.json().catch(() => null) as unknown
            throw new Error(responseError(value, 'Bridge response was rejected'))
          }
        }
      } catch {
        if (signal.aborted) break
        connectedPorts.delete(port)
        publishConnection()
        await waitForRetry(signal)
      }
    }
    connectedPorts.delete(port)
    publishConnection()
  }

  const stop = () => {
    controller?.abort()
    controller = null
    connectedPorts.clear()
    publishConnection()
  }

  const syncEnabled = () => {
    stop()
    if (!useSettingsStore.getState().mcpConnector || disposed) return
    controller = new AbortController()
    publishConnection()
    for (let offset = 0; offset < portCount; offset += 1) {
      void runPort(basePort + offset, controller.signal)
    }
  }

  const unsubscribe = useSettingsStore.subscribe((current, previous) => {
    if (current.mcpConnector !== previous.mcpConnector) syncEnabled()
  })
  syncEnabled()

  return () => {
    if (disposed) return
    disposed = true
    unsubscribe()
    stop()
    useMcpConnectorStore.getState().setConnection('disabled')
  }
}
