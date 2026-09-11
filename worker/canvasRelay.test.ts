import { describe, expect, it, vi } from 'vitest'
import { handleCanvasRelay } from './canvasRelay'

const TOKEN = 'student-secret-token'

function relayRequest(
  payload: Record<string, unknown> = {
    origin: 'https://canvas.ou.edu',
    path: '/api/v1/courses?enrollment_state=active&per_page=100',
    token: TOKEN,
  },
  headers: Record<string, string> = {},
): Request {
  return new Request('https://grovepad.app/api/canvas-lms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://grovepad.app',
      'Sec-Fetch-Site': 'same-origin',
      ...headers,
    },
    body: JSON.stringify(payload),
  })
}

function relayEnv(success = true): Pick<Env, 'CANVAS_RELAY_RATE_LIMITER'> {
  return {
    CANVAS_RELAY_RATE_LIMITER: {
      limit: vi.fn().mockResolvedValue({ success }),
    },
  }
}

describe('Canvas LMS relay', () => {
  it('forwards a bounded read with bearer authorization and no token in the URL', async () => {
    const env = relayEnv()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify([{ id: 42, name: 'Interaction Design' }]),
      { headers: { 'Content-Type': 'application/json' } },
    ))

    const response = await handleCanvasRelay(relayRequest(), env, fetcher)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(await response.json()).toEqual([{ id: 42, name: 'Interaction Design' }])
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [target, options] = fetcher.mock.calls[0] ?? []
    expect(String(target)).toBe(
      'https://canvas.ou.edu/api/v1/courses?enrollment_state=active&per_page=100',
    )
    expect(String(target)).not.toContain(TOKEN)
    const headers = new Headers(options?.headers)
    expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`)
    expect(headers.get('User-Agent')).toBe(
      'Grovepad Canvas LMS/1.0 (+https://grovepad.app)',
    )
    expect(options?.redirect).toBe('manual')

    const limiter = vi.mocked(env.CANVAS_RELAY_RATE_LIMITER.limit)
    const limiterKey = limiter.mock.calls[0]?.[0].key
    expect(limiterKey).toMatch(/^[a-f0-9]{64}$/)
    expect(limiterKey).not.toContain(TOKEN)
  })

  it('rejects cross-site callers before contacting Canvas', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const response = await handleCanvasRelay(
      relayRequest(undefined, {
        Origin: 'https://attacker.example',
        'Sec-Fetch-Site': 'cross-site',
      }),
      relayEnv(),
      fetcher,
    )

    expect(response.status).toBe(403)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    ['an insecure origin', {
      origin: 'http://canvas.ou.edu',
      path: '/api/v1/courses?per_page=100',
      token: TOKEN,
    }],
    ['a local origin', {
      origin: 'https://localhost',
      path: '/api/v1/courses?per_page=100',
      token: TOKEN,
    }],
    ['an unapproved Canvas API path', {
      origin: 'https://canvas.ou.edu',
      path: '/api/v1/users/self/profile',
      token: TOKEN,
    }],
    ['an absolute outbound URL', {
      origin: 'https://canvas.ou.edu',
      path: '//attacker.example/api/v1/courses',
      token: TOKEN,
    }],
    ['an unapproved query parameter', {
      origin: 'https://canvas.ou.edu',
      path: '/api/v1/courses?access_token=leak',
      token: TOKEN,
    }],
  ])('rejects %s', async (_label, payload) => {
    const fetcher = vi.fn<typeof fetch>()
    const response = await handleCanvasRelay(relayRequest(payload), relayEnv(), fetcher)

    expect(response.status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('returns a clear token error without exposing the Canvas response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ errors: [{ message: 'private upstream detail' }] }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    ))

    const response = await handleCanvasRelay(relayRequest(), relayEnv(), fetcher)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: 'Canvas refused this access token. Check it and try again.',
    })
  })

  it('stops before Canvas when the per-token refresh limit is reached', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const response = await handleCanvasRelay(relayRequest(), relayEnv(false), fetcher)

    expect(response.status).toBe(429)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refuses redirects so credentials cannot be forwarded to another host', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { Location: 'https://attacker.example/collect' },
    }))

    const response = await handleCanvasRelay(relayRequest(), relayEnv(), fetcher)

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Canvas redirected the API request. Use the final Canvas site address.',
    })
  })
})
