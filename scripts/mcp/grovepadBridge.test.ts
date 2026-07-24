import { afterEach, describe, expect, it } from 'vitest'
import { createGrovepadBridge, isAllowedBrowserOrigin } from './grovepadBridge.mjs'

const origin = 'http://localhost:5173'
const bridges: Array<ReturnType<typeof createGrovepadBridge>> = []

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.close()))
})

describe('Grovepad MCP loopback bridge', () => {
  it('accepts only local Grovepad-style browser origins by default', () => {
    expect(isAllowedBrowserOrigin(origin)).toBe(true)
    expect(isAllowedBrowserOrigin('tauri://localhost')).toBe(true)
    expect(isAllowedBrowserOrigin('https://attacker.example')).toBe(false)
  })

  it('carries one tool request from MCP to the browser and returns its result', async () => {
    const bridge = createGrovepadBridge({ requestTimeoutMs: 2_000, pollTimeoutMs: 500 })
    bridges.push(bridge)
    const port = await bridge.listen(0)
    const base = `http://127.0.0.1:${port}`
    const registration = await fetch(`${base}/bridge/register`, {
      method: 'POST', headers: { origin },
    })
    const { token } = await registration.json() as { token: string }

    const toolResult = bridge.request('status', {})
    const next = await fetch(`${base}/bridge/next`, {
      headers: { origin, authorization: `Bearer ${token}` },
    })
    const request = await next.json() as { requestId: string; method: string }
    expect(request.method).toBe('status')
    await fetch(`${base}/bridge/result`, {
      method: 'POST',
      headers: {
        origin,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ requestId: request.requestId, result: { activeCanvasId: 'canvas-1' } }),
    })

    await expect(toolResult).resolves.toEqual({ activeCanvasId: 'canvas-1' })
  })
})
