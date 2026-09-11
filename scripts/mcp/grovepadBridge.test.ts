/// <reference types="node" />
import { readFileSync } from 'node:fs'
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

  it('does not trust every other server the user runs on localhost', () => {
    // The origin check used to accept any port. A page served by any local tool
    // the user happens to be running could then register with this bridge and
    // drive their boards through the MCP tools.
    expect(isAllowedBrowserOrigin('http://localhost:8888')).toBe(false)
    expect(isAllowedBrowserOrigin('http://127.0.0.1:3000')).toBe(false)
    expect(isAllowedBrowserOrigin('http://localhost')).toBe(false)
  })

  it('refuses a second app while one is already connected', async () => {
    // Registration is unauthenticated, and the bridge used to route tool calls
    // to whichever client was seen most recently — so a second registrant could
    // take the conversation over just by polling faster.
    const bridge = createGrovepadBridge({ requestTimeoutMs: 2_000, pollTimeoutMs: 500 })
    bridges.push(bridge)
    const port = await bridge.listen(0)
    const base = `http://127.0.0.1:${port}`

    const first = await fetch(`${base}/bridge/register`, { method: 'POST', headers: { origin } })
    expect(first.status).toBe(200)

    const second = await fetch(`${base}/bridge/register`, { method: 'POST', headers: { origin } })
    expect(second.status).toBe(409)
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

  it('stops buffering a result body once it passes the size cap', () => {
    // Rejecting readJson's promise does not detach the data listener, so
    // without an explicit stop the 256 KB cap bounds nothing: the string keeps
    // growing past the 400 until V8 throws `Invalid string length` inside the
    // listener, an uncaught exception that takes the MCP process down
    // mid-session. Destroying the socket is not the fix either — that kills the
    // in-flight 400 the caller is written to expect.
    const source = readFileSync(new URL('./grovepadBridge.mjs', import.meta.url), 'utf8')
    const start = source.indexOf('function readJson')
    const listener = source.slice(start, source.indexOf("request.on('end'", start))
    expect(listener).toMatch(/if \(overflowed\) return/)
    expect(listener).toMatch(/overflowed = true/)
    expect(listener).not.toMatch(/request\.destroy\(/)
  })

  it('answers an oversized result body with a 400 and stays usable', async () => {
    const bridge = createGrovepadBridge({ requestTimeoutMs: 2_000, pollTimeoutMs: 500 })
    bridges.push(bridge)
    const port = await bridge.listen(0)
    const base = `http://127.0.0.1:${port}`
    const registration = await fetch(`${base}/bridge/register`, {
      method: 'POST', headers: { origin },
    })
    const { token } = await registration.json() as { token: string }

    const oversized = await fetch(`${base}/bridge/result`, {
      method: 'POST',
      headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: 'x'.repeat(512 * 1024),
    })
    expect(oversized.status).toBe(400)

    const after = await fetch(`${base}/bridge/result`, {
      method: 'POST',
      headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: 'nope', result: {} }),
    })
    expect(after.status).toBe(404)
  })
})
