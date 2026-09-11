const RELAY_PATH = '/api/canvas-lms'
const MAX_REQUEST_BYTES = 12 * 1024
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_TOKEN_LENGTH = 2_048

const CANVAS_PATH_QUERY_KEYS = {
  '/api/v1/courses': new Set([
    'enrollment_state',
    'enrollment_type',
    'include[]',
    'per_page',
  ]),
  '/api/v1/planner/items': new Set([
    'start_date',
    'end_date',
    'per_page',
  ]),
  '/api/v1/announcements': new Set([
    'start_date',
    'end_date',
    'active_only',
    'per_page',
    'context_codes[]',
  ]),
} as const

type CanvasPath = keyof typeof CANVAS_PATH_QUERY_KEYS

interface RelayPayload {
  origin: string
  path: string
  token: string
}

type RelayEnv = Pick<Env, 'CANVAS_RELAY_RATE_LIMITER'>
type WorkerFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

class RelayInputError extends Error {}
class RelaySizeError extends Error {}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

async function readBoundedBytes(
  stream: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (!stream) return new Uint8Array()
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  let exceededLimit = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maximumBytes) {
        exceededLimit = true
        throw new RelaySizeError('Payload exceeded its safety limit.')
      }
      chunks.push(value)
    }
  } finally {
    if (exceededLimit) await reader.cancel()
    reader.releaseLock()
  }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

async function readRelayPayload(request: Request): Promise<RelayPayload> {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new RelaySizeError('Request exceeded its safety limit.')
  }
  const bytes = await readBoundedBytes(request.body, MAX_REQUEST_BYTES)
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new RelayInputError('Send a valid Canvas relay request.')
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RelayInputError('Send a valid Canvas relay request.')
  }
  const source = value as Record<string, unknown>
  if (
    typeof source.origin !== 'string'
    || typeof source.path !== 'string'
    || typeof source.token !== 'string'
  ) {
    throw new RelayInputError('Canvas address, request path, and token are required.')
  }
  const token = source.token.trim()
  if (
    token.length < 10
    || token.length > MAX_TOKEN_LENGTH
    || token.includes('\r')
    || token.includes('\n')
  ) {
    throw new RelayInputError('Enter a valid Canvas access token.')
  }
  return { origin: source.origin, path: source.path, token }
}

function canvasOrigin(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new RelayInputError('Enter a valid Canvas address.')
  }
  const host = url.hostname.toLowerCase()
  const dnsName = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i
  const forbiddenSuffix = /(?:^|\.)(?:localhost|local|internal|invalid|test)$/
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.port
    || url.pathname !== '/'
    || url.search
    || url.hash
    || !dnsName.test(host)
    || forbiddenSuffix.test(host)
  ) {
    throw new RelayInputError('Use the secure public address of your school’s Canvas site.')
  }
  return url
}

function canvasPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || value.length > 8_000) {
    throw new RelayInputError('Canvas request path is not allowed.')
  }
  const parsed = new URL(value, 'https://canvas-relay.invalid')
  const pathname = parsed.pathname as CanvasPath
  const allowedKeys: ReadonlySet<string> | undefined = CANVAS_PATH_QUERY_KEYS[pathname]
  if (!allowedKeys) throw new RelayInputError('Canvas request path is not allowed.')
  for (const [key, queryValue] of parsed.searchParams) {
    if (!allowedKeys.has(key) || queryValue.length > 200) {
      throw new RelayInputError('Canvas request parameters are not allowed.')
    }
    if (key === 'per_page' && queryValue !== '100') {
      throw new RelayInputError('Canvas page size is not allowed.')
    }
    if (key === 'context_codes[]' && !/^course_\d{1,20}$/.test(queryValue)) {
      throw new RelayInputError('Canvas course identifier is not allowed.')
    }
  }
  return `${parsed.pathname}${parsed.search}`
}

/**
 * The bucket a request counts against.
 *
 * This used to hash the Canvas token. The token is supplied by the caller, so
 * anyone could mint a fresh bucket per request simply by varying it — which is
 * exactly what credential spraying does anyway, leaving the limiter with no
 * effect on the one attack it existed to stop. Keyed on the caller's address
 * and the destination host instead: neither is under the caller's control, so
 * the budget is real. `Origin` is no help here either — it is a header, and only
 * a browser is obliged to tell the truth in it.
 */
async function rateLimitKey(request: Request, origin: URL): Promise<string> {
  const client = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${origin.hostname}\0${client}`),
  )
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function sameOriginBrowserRequest(request: Request): boolean {
  const requestOrigin = new URL(request.url).origin
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  return origin === requestOrigin && (!fetchSite || fetchSite === 'same-origin')
}

export async function handleCanvasRelay(
  request: Request,
  env: RelayEnv,
  fetcher: WorkerFetcher = fetch,
): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname !== RELAY_PATH) return jsonResponse({ error: 'Not found.' }, 404)
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)
  if (!sameOriginBrowserRequest(request)) {
    return jsonResponse({ error: 'Canvas relay requests must come from Grovepad.' }, 403)
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return jsonResponse({ error: 'Canvas relay requests must use JSON.' }, 415)
  }

  try {
    const payload = await readRelayPayload(request)
    const origin = canvasOrigin(payload.origin)
    const path = canvasPath(payload.path)
    const limit = await env.CANVAS_RELAY_RATE_LIMITER.limit({
      key: await rateLimitKey(request, origin),
    })
    if (!limit.success) {
      return jsonResponse({ error: 'Canvas refresh limit reached. Wait a minute and try again.' }, 429)
    }

    const response = await fetcher(new URL(path, origin), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${payload.token}`,
        'User-Agent': 'Grovepad Canvas LMS/1.0 (+https://grovepad.app)',
      },
      redirect: 'manual',
    })
    if (response.status === 401 || response.status === 403) {
      return jsonResponse({ error: 'Canvas refused this access token. Check it and try again.' }, response.status)
    }
    if (response.status >= 300 && response.status < 400) {
      return jsonResponse({ error: 'Canvas redirected the API request. Use the final Canvas site address.' }, 502)
    }
    if (!response.ok) {
      return jsonResponse({ error: `Canvas could not be reached (${response.status}).` }, 502)
    }
    if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return jsonResponse({ error: 'Canvas returned an unexpected response.' }, 502)
    }
    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      return jsonResponse({ error: 'Canvas returned too much data for one refresh.' }, 502)
    }
    let body: Uint8Array
    try {
      body = await readBoundedBytes(response.body, MAX_RESPONSE_BYTES)
    } catch (error) {
      if (error instanceof RelaySizeError) {
        return jsonResponse({ error: 'Canvas returned too much data for one refresh.' }, 502)
      }
      throw error
    }
    try {
      JSON.parse(new TextDecoder().decode(body))
    } catch {
      return jsonResponse({ error: 'Canvas returned invalid data.' }, 502)
    }
    return new Response(body, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Content-Type': 'application/json; charset=utf-8',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof RelayInputError) return jsonResponse({ error: error.message }, 400)
    if (error instanceof RelaySizeError) return jsonResponse({ error: error.message }, 413)
    return jsonResponse({ error: 'Grovepad could not reach Canvas. Try again shortly.' }, 502)
  }
}
