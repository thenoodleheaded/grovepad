#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as z from 'zod/v4'
import { listenForGrovepadApp } from './mcp/grovepadBridge.mjs'

function toolResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  }
}

const additionalOrigins = (process.env.GROVEPAD_BRIDGE_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const { bridge, port } = await listenForGrovepadApp({ additionalOrigins })
const server = new McpServer({ name: 'grovepad', version: '0.1.0' })

server.registerTool('grovepad_status', {
  description: 'Check whether an open Grovepad app is connected and which canvas is active.',
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, async () => {
  if (!bridge.isConnected()) {
    return toolResult({
      connected: false,
      message: 'Open Grovepad and enable MCP connector in Settings → Data.',
    })
  }
  return toolResult(await bridge.request('status'))
})

server.registerTool('list_canvases', {
  description: 'List Grovepad canvases and identify the active target. This does not change the board.',
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, async () => toolResult(await bridge.request('list_canvases')))

server.registerTool('read_canvas_outline', {
  description: 'Read a bounded semantic outline of one Grovepad canvas: card ids, titles, types, parent links, and optionally Note text.',
  inputSchema: {
    canvasId: z.string().min(1).max(160).optional()
      .describe('Canvas id from list_canvases. Omit to read the active canvas.'),
    includeNoteText: z.boolean().optional().default(true)
      .describe('Include up to 1,000 characters from each Note card.'),
  },
  annotations: { readOnlyHint: true },
}, async (input) => toolResult(await bridge.request('read_canvas_outline', input)))

const treeNodesSchema = z.array(z.object({
  id: z.string().min(1).max(80).describe('Stable temporary id unique inside this tree.'),
  title: z.string().min(1).max(120).describe('Visible Grovepad Note title.'),
  parentId: z.string().min(1).max(80).nullable().optional()
    .describe('Temporary id of the parent. Omit or use null for a root.'),
  note: z.string().max(4_000).optional().describe('Optional body text for the Note card.'),
})).min(1).max(60)

server.registerTool('preview_tree', {
  description: 'Validate and preview a mind map/tree for Grovepad without changing the board. Returns a short-lived previewId; call commit_tree only after inspecting this result.',
  inputSchema: {
    canvasId: z.string().min(1).max(160).optional()
      .describe('Target canvas. Omit for the active canvas.'),
    origin: z.object({ x: z.number().finite(), y: z.number().finite() }).optional()
      .describe('Optional Grovepad world coordinate. Omit to place at the center of the current view.'),
    nodes: treeNodesSchema,
  },
  annotations: { readOnlyHint: true },
}, async (input) => toolResult(await bridge.request('preview_tree', input)))

server.registerTool('commit_tree', {
  description: 'Commit a previously validated Grovepad tree preview. This creates Note cards and parent lines as one undoable board action; the target canvas must still be active.',
  inputSchema: {
    previewId: z.string().uuid().describe('The previewId returned by preview_tree.'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
}, async (input) => toolResult(await bridge.request('commit_tree', input)))

const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`Grovepad MCP bridge is listening on 127.0.0.1:${port}`)

let stopping = false
const stop = async () => {
  if (stopping) return
  stopping = true
  await bridge.close()
  process.exit(0)
}
process.once('SIGINT', () => { void stop() })
process.once('SIGTERM', () => { void stop() })
process.stdin.once('end', () => { void stop() })
process.stdin.once('close', () => { void stop() })
