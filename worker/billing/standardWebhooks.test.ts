import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOLERANCE_SECONDS,
  signedContent,
  verifyStandardWebhook,
} from './standardWebhooks'

// A real secret is 24-64 random bytes, base64, prefixed whsec_. This one is
// fixed so the expected signatures below are reproducible.
const SECRET_BYTES = new Uint8Array(32).map((_, index) => (index * 7 + 11) % 256)
const SECRET_BASE64 = btoa(String.fromCharCode(...SECRET_BYTES))
const SECRET = `whsec_${SECRET_BASE64}`

const ID = 'msg_2KWPBgLlAfxdpx2AI54pPJ85f4W'
const NOW_SECONDS = 1_786_000_000
const BODY = JSON.stringify({ type: 'subscription.active', data: { id: 'sub_1' } })

async function sign(
  body: string,
  id = ID,
  timestamp = String(NOW_SECONDS),
  secretBase64 = SECRET_BASE64,
): Promise<string> {
  const raw = Uint8Array.from(atob(secretBase64), (character) => character.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'raw',
    raw as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedContent(id, timestamp, body)) as unknown as ArrayBuffer,
  )
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

function headersFor(values: Record<string, string | undefined>) {
  return {
    get(name: string): string | null {
      return values[name.toLowerCase()] ?? null
    },
  }
}

async function validHeaders(body = BODY, timestamp = String(NOW_SECONDS)) {
  return headersFor({
    'webhook-id': ID,
    'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${await sign(body, ID, timestamp)}`,
  })
}

describe('accepting a genuine delivery', () => {
  it('verifies a correctly signed webhook', async () => {
    const result = await verifyStandardWebhook({
      secret: SECRET,
      headers: await validHeaders(),
      rawBody: BODY,
      nowSeconds: NOW_SECONDS,
    })
    expect(result).toEqual({ ok: true, id: ID, timestampSeconds: NOW_SECONDS })
  })

  it('accepts the secret with or without its whsec_ prefix', async () => {
    const headers = await validHeaders()
    const withPrefix = await verifyStandardWebhook({
      secret: SECRET,
      headers,
      rawBody: BODY,
      nowSeconds: NOW_SECONDS,
    })
    const withoutPrefix = await verifyStandardWebhook({
      secret: SECRET_BASE64,
      headers,
      rawBody: BODY,
      nowSeconds: NOW_SECONDS,
    })
    expect(withPrefix.ok).toBe(true)
    expect(withoutPrefix.ok).toBe(true)
  })

  it('accepts when one of several rotated signatures matches', async () => {
    const good = await sign(BODY)
    const headers = headersFor({
      'webhook-id': ID,
      'webhook-timestamp': String(NOW_SECONDS),
      // An old key's signature first, the current one second.
      'webhook-signature': `v1,${btoa('wrong-signature-bytes-here!')} v1,${good}`,
    })
    const result = await verifyStandardWebhook({
      secret: SECRET,
      headers,
      rawBody: BODY,
      nowSeconds: NOW_SECONDS,
    })
    expect(result.ok).toBe(true)
  })
})

describe('refusing a forgery', () => {
  it('refuses a body that changed after signing', async () => {
    const headers = await validHeaders(BODY)
    const tampered = JSON.stringify({ type: 'subscription.active', data: { id: 'sub_ATTACKER' } })
    const result = await verifyStandardWebhook({
      secret: SECRET,
      headers,
      rawBody: tampered,
      nowSeconds: NOW_SECONDS,
    })
    expect(result).toEqual({ ok: false, reason: 'no-signature-match' })
  })

  it('refuses a signature made with a different secret', async () => {
    const otherSecret = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)))
    const headers = headersFor({
      'webhook-id': ID,
      'webhook-timestamp': String(NOW_SECONDS),
      'webhook-signature': `v1,${await sign(BODY, ID, String(NOW_SECONDS), otherSecret)}`,
    })
    const result = await verifyStandardWebhook({
      secret: SECRET,
      headers,
      rawBody: BODY,
      nowSeconds: NOW_SECONDS,
    })
    expect(result).toEqual({ ok: false, reason: 'no-signature-match' })
  })

  it('refuses a signature that was signed for a different message id', async () => {
    const headers = headersFor({
      'webhook-id': 'msg_DIFFERENT',
      'webhook-timestamp': String(NOW_SECONDS),
      'webhook-signature': `v1,${await sign(BODY, ID)}`,
    })
    const result = await verifyStandardWebhook({
      secret: SECRET,
      headers,
      rawBody: BODY,
      nowSeconds: NOW_SECONDS,
    })
    expect(result).toEqual({ ok: false, reason: 'no-signature-match' })
  })

  it('refuses the asymmetric v1a scheme, which we do not support', async () => {
    const headers = headersFor({
      'webhook-id': ID,
      'webhook-timestamp': String(NOW_SECONDS),
      'webhook-signature': `v1a,${await sign(BODY)}`,
    })
    const result = await verifyStandardWebhook({
      secret: SECRET,
      headers,
      rawBody: BODY,
      nowSeconds: NOW_SECONDS,
    })
    expect(result).toEqual({ ok: false, reason: 'no-signature-match' })
  })

  it('refuses when any required header is absent', async () => {
    const signature = `v1,${await sign(BODY)}`
    for (const missing of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
      const values: Record<string, string> = {
        'webhook-id': ID,
        'webhook-timestamp': String(NOW_SECONDS),
        'webhook-signature': signature,
      }
      delete values[missing]
      const result = await verifyStandardWebhook({
        secret: SECRET,
        headers: headersFor(values),
        rawBody: BODY,
        nowSeconds: NOW_SECONDS,
      })
      expect(result).toEqual({ ok: false, reason: 'missing-headers' })
    }
  })
})

describe('replay protection', () => {
  it('refuses a delivery older than the tolerance window', async () => {
    const stale = NOW_SECONDS - DEFAULT_TOLERANCE_SECONDS - 1
    const result = await verifyStandardWebhook({
      secret: SECRET,
      headers: await validHeaders(BODY, String(stale)),
      rawBody: BODY,
      nowSeconds: NOW_SECONDS,
    })
    expect(result).toEqual({ ok: false, reason: 'timestamp-outside-tolerance' })
  })

  it('refuses a delivery from the future by the same margin', async () => {
    const ahead = NOW_SECONDS + DEFAULT_TOLERANCE_SECONDS + 1
    const result = await verifyStandardWebhook({
      secret: SECRET,
      headers: await validHeaders(BODY, String(ahead)),
      rawBody: BODY,
      nowSeconds: NOW_SECONDS,
    })
    expect(result).toEqual({ ok: false, reason: 'timestamp-outside-tolerance' })
  })

  it('accepts a delivery at the edge of the window', async () => {
    const edge = NOW_SECONDS - DEFAULT_TOLERANCE_SECONDS
    const result = await verifyStandardWebhook({
      secret: SECRET,
      headers: await validHeaders(BODY, String(edge)),
      rawBody: BODY,
      nowSeconds: NOW_SECONDS,
    })
    expect(result.ok).toBe(true)
  })

  it('refuses a timestamp that is not a plain integer', async () => {
    for (const timestamp of ['abc', '17.5', ' 1786000000', '+1786000000']) {
      const result = await verifyStandardWebhook({
        secret: SECRET,
        headers: headersFor({
          'webhook-id': ID,
          'webhook-timestamp': timestamp,
          'webhook-signature': `v1,${await sign(BODY)}`,
        }),
        rawBody: BODY,
        nowSeconds: NOW_SECONDS,
      })
      expect(result).toEqual({ ok: false, reason: 'malformed-timestamp' })
    }
  })
})

describe('malformed configuration', () => {
  it('refuses rather than trusting an unreadable secret', async () => {
    const result = await verifyStandardWebhook({
      secret: 'whsec_not!valid!base64',
      headers: await validHeaders(),
      rawBody: BODY,
      nowSeconds: NOW_SECONDS,
    })
    expect(result).toEqual({ ok: false, reason: 'malformed-secret' })
  })

  it('refuses an empty secret', async () => {
    const result = await verifyStandardWebhook({
      secret: 'whsec_',
      headers: await validHeaders(),
      rawBody: BODY,
      nowSeconds: NOW_SECONDS,
    })
    expect(result).toEqual({ ok: false, reason: 'malformed-secret' })
  })

  it('ignores signature entries it cannot parse instead of throwing', async () => {
    const headers = headersFor({
      'webhook-id': ID,
      'webhook-timestamp': String(NOW_SECONDS),
      'webhook-signature': `garbage v1 v1,!!!! v1,${await sign(BODY)}`,
    })
    const result = await verifyStandardWebhook({
      secret: SECRET,
      headers,
      rawBody: BODY,
      nowSeconds: NOW_SECONDS,
    })
    expect(result.ok).toBe(true)
  })
})
