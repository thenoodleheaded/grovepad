import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterEach, describe, expect, it } from 'vitest'

const origin = 'http://localhost:5173'
let client

afterEach(async () => {
  await client?.close()
  client = undefined
})

describe('Grovepad MCP stdio server', () => {
  it('advertises five tools and carries a status request through the app bridge', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [new URL('../grovepad-mcp.mjs', import.meta.url).pathname],
      cwd: new URL('../..', import.meta.url).pathname,
      stderr: 'pipe',
    })
    const portPromise = new Promise((resolve, reject) => {
      let output = ''
      const timeout = setTimeout(() => reject(new Error(`MCP server did not announce its port: ${output}`)), 3_000)
      transport.stderr?.on('data', (chunk) => {
        output += String(chunk)
        const match = output.match(/127\.0\.0\.1:(\d+)/)
        if (!match) return
        clearTimeout(timeout)
        resolve(Number(match[1]))
      })
    })
    client = new Client({ name: 'grovepad-test', version: '1.0.0' })
    await client.connect(transport)
    const port = await portPromise
    const base = `http://127.0.0.1:${port}`
    const registered = await fetch(`${base}/bridge/register`, {
      method: 'POST', headers: { origin },
    })
    const { token } = await registered.json()

    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      'grovepad_status',
      'list_canvases',
      'read_canvas_outline',
      'preview_tree',
      'commit_tree',
    ])

    const resultPromise = client.callTool({ name: 'grovepad_status', arguments: {} })
    const next = await fetch(`${base}/bridge/next`, {
      headers: { origin, authorization: `Bearer ${token}` },
    })
    const request = await next.json()
    await fetch(`${base}/bridge/result`, {
      method: 'POST',
      headers: {
        origin,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        requestId: request.requestId,
        result: { connected: true, activeCanvasId: 'canvas-1' },
      }),
    })

    const result = await resultPromise
    expect(JSON.parse(result.content[0].text)).toEqual({
      connected: true,
      activeCanvasId: 'canvas-1',
    })
  })
})
