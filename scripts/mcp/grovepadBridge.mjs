import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

export const GROVEPAD_BRIDGE_BASE_PORT = 43_110
export const GROVEPAD_BRIDGE_PORT_COUNT = 5

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_POLL_TIMEOUT_MS = 15_000
const DEFAULT_CLIENT_STALE_MS = 45_000
const MAX_BODY_BYTES = 256 * 1024

export function isAllowedBrowserOrigin(origin, additionalOrigins = []) {
  if (additionalOrigins.includes(origin)) return true
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) return true
  return origin === 'tauri://localhost'
    || origin === 'http://tauri.localhost'
    || origin === 'https://tauri.localhost'
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > MAX_BODY_BYTES) reject(new Error('Request body is too large'))
    })
    request.on('end', () => {
      if (!body) return resolve({})
      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error('Request body must be valid JSON'))
      }
    })
    request.on('error', reject)
  })
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  response.end(body)
}

function bearerToken(request) {
  const authorization = request.headers.authorization ?? ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
}

function message(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * A tiny loopback broker between an MCP stdio process and an open Grovepad tab.
 * Board state never enters this process except as the bounded tool result that
 * the tab deliberately returns.
 */
export function createGrovepadBridge(options = {}) {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const pollTimeoutMs = options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS
  const clientStaleMs = options.clientStaleMs ?? DEFAULT_CLIENT_STALE_MS
  const additionalOrigins = options.additionalOrigins ?? []
  const clients = new Map()
  const pending = new Map()
  let closed = false

  const cleanClients = () => {
    const staleBefore = Date.now() - clientStaleMs
    for (const [token, client] of clients) {
      if (client.lastSeen >= staleBefore) continue
      if (client.pollResponse) {
        client.pollResponse.writeHead(204, { 'Cache-Control': 'no-store' })
        client.pollResponse.end()
      }
      clients.delete(token)
    }
  }

  const activeClient = () => {
    cleanClients()
    return [...clients.values()].sort((a, b) => b.lastSeen - a.lastSeen)[0] ?? null
  }

  const deliver = (client) => {
    if (!client.pollResponse || client.queue.length === 0) return
    const response = client.pollResponse
    client.pollResponse = null
    if (client.pollTimer) clearTimeout(client.pollTimer)
    client.pollTimer = null
    sendJson(response, 200, client.queue.shift())
  }

  const server = createServer(async (request, response) => {
    const origin = request.headers.origin ?? ''
    if (!isAllowedBrowserOrigin(origin, additionalOrigins)) {
      sendJson(response, 403, { error: 'This browser origin is not allowed to connect to Grovepad' })
      return
    }
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Private-Network', 'true')

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
      })
      response.end()
      return
    }

    try {
      if (request.method === 'POST' && request.url === '/bridge/register') {
        cleanClients()
        const token = randomUUID()
        clients.set(token, {
          token,
          lastSeen: Date.now(),
          queue: [],
          pollResponse: null,
          pollTimer: null,
        })
        sendJson(response, 200, { token })
        return
      }

      const token = bearerToken(request)
      const client = clients.get(token)
      if (!client) {
        sendJson(response, 401, { error: 'Grovepad bridge session is missing or expired' })
        return
      }
      client.lastSeen = Date.now()

      if (request.method === 'GET' && request.url === '/bridge/next') {
        if (client.pollResponse) {
          client.pollResponse.writeHead(204, { 'Cache-Control': 'no-store' })
          client.pollResponse.end()
          if (client.pollTimer) clearTimeout(client.pollTimer)
        }
        client.pollResponse = response
        client.pollTimer = setTimeout(() => {
          if (client.pollResponse !== response) return
          client.pollResponse = null
          client.pollTimer = null
          response.writeHead(204, { 'Cache-Control': 'no-store' })
          response.end()
        }, pollTimeoutMs)
        deliver(client)
        return
      }

      if (request.method === 'POST' && request.url === '/bridge/result') {
        const body = await readJson(request)
        const requestId = typeof body.requestId === 'string' ? body.requestId : ''
        const entry = pending.get(requestId)
        if (!entry || entry.clientToken !== token) {
          sendJson(response, 404, { error: 'Tool request is no longer pending' })
          return
        }
        pending.delete(requestId)
        clearTimeout(entry.timeout)
        if (typeof body.error === 'string' && body.error) entry.reject(new Error(body.error))
        else entry.resolve(body.result)
        sendJson(response, 200, { accepted: true })
        return
      }

      sendJson(response, 404, { error: 'Unknown Grovepad bridge route' })
    } catch (error) {
      sendJson(response, 400, { error: message(error) })
    }
  })

  return {
    server,
    isConnected() {
      return activeClient() !== null
    },
    request(method, params = {}) {
      if (closed) return Promise.reject(new Error('Grovepad bridge has stopped'))
      const client = activeClient()
      if (!client) {
        return Promise.reject(new Error(
          'No Grovepad app is connected. Open Grovepad and enable MCP connector in Settings → Data.',
        ))
      }
      const requestId = randomUUID()
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(requestId)
          reject(new Error('Grovepad did not finish the tool request in time'))
        }, requestTimeoutMs)
        pending.set(requestId, { clientToken: client.token, resolve, reject, timeout })
        client.queue.push({ requestId, method, params })
        deliver(client)
      })
    },
    listen(port) {
      return new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening)
          reject(error)
        }
        const onListening = () => {
          server.off('error', onError)
          const address = server.address()
          resolve(typeof address === 'object' && address ? address.port : port)
        }
        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(port, '127.0.0.1')
      })
    },
    close() {
      if (closed) return Promise.resolve()
      closed = true
      for (const client of clients.values()) {
        if (client.pollTimer) clearTimeout(client.pollTimer)
        client.pollResponse?.end()
      }
      clients.clear()
      for (const entry of pending.values()) {
        clearTimeout(entry.timeout)
        entry.reject(new Error('Grovepad bridge stopped'))
      }
      pending.clear()
      return new Promise((resolve) => server.close(() => resolve()))
    },
  }
}

export async function listenForGrovepadApp(options = {}) {
  const basePort = options.basePort ?? GROVEPAD_BRIDGE_BASE_PORT
  const portCount = options.portCount ?? GROVEPAD_BRIDGE_PORT_COUNT
  let lastError
  for (let index = 0; index < portCount; index += 1) {
    const bridge = createGrovepadBridge(options)
    try {
      const port = await bridge.listen(basePort + index)
      return { bridge, port }
    } catch (error) {
      lastError = error
      await bridge.close()
      if (error?.code !== 'EADDRINUSE') throw error
    }
  }
  throw lastError ?? new Error('No local Grovepad bridge port is available')
}
