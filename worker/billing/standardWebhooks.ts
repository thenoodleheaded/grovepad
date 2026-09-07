// ---------------------------------------------------------------------------
// Standard Webhooks signature verification.
//
// Polar signs its webhooks with the Standard Webhooks specification, which is
// deliberately small: HMAC-SHA256 over the exact string
//
//     <webhook-id>.<webhook-timestamp>.<raw request body>
//
// The verification here is the only thing standing between a stranger with our
// endpoint URL and a free lifetime subscription, so it is written to fail
// closed at every branch and to make the raw-body requirement structural: the
// caller hands in the bytes it actually received, and there is no path that
// re-serialises JSON, because re-serialising changes the bytes and would either
// break every real delivery or, worse, tempt someone into skipping the check.
//
// Spec: https://github.com/standard-webhooks/standard-webhooks
// ---------------------------------------------------------------------------

export const WEBHOOK_ID_HEADER = 'webhook-id'
export const WEBHOOK_TIMESTAMP_HEADER = 'webhook-timestamp'
export const WEBHOOK_SIGNATURE_HEADER = 'webhook-signature'

/**
 * How far the sender's clock may be from ours. Five minutes each way is the
 * conventional window: wide enough for real clock drift and a slow retry,
 * narrow enough that a captured request stops being replayable quickly.
 */
export const DEFAULT_TOLERANCE_SECONDS = 5 * 60

const SECRET_PREFIX = 'whsec_'
/** Only the symmetric scheme. `v1a` is asymmetric and we do not accept it. */
const SYMMETRIC_VERSION = 'v1'

export type WebhookVerificationFailure =
  | 'missing-headers'
  | 'malformed-timestamp'
  | 'timestamp-outside-tolerance'
  | 'malformed-secret'
  | 'no-signature-match'

export type WebhookVerificationResult =
  | { ok: true; id: string; timestampSeconds: number }
  | { ok: false; reason: WebhookVerificationFailure }

export interface VerifyOptions {
  /** The endpoint secret, with or without the `whsec_` prefix. */
  secret: string
  /** Case-insensitive header lookup, satisfied by the Fetch API's Headers. */
  headers: { get(name: string): string | null }
  /** The EXACT bytes received. Never a re-serialised object. */
  rawBody: string
  nowSeconds: number
  toleranceSeconds?: number
}

function decodeBase64(value: string): Uint8Array | null {
  // Reject anything that is not well-formed base64 before atob, because atob is
  // lenient in ways that would let two different strings compare equal.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length === 0 || value.length % 4 !== 0) {
    return null
  }
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

/**
 * Length-independent equality. Comparing with === would leak, through timing,
 * how much of a forged signature was correct, which is enough to reconstruct
 * one byte at a time.
 */
function constantTimeEquals(left: Uint8Array, right: Uint8Array): boolean {
  // The length itself is not secret; the contents are. Bail on length first so
  // the loop below always compares equal-length buffers.
  if (left.byteLength !== right.byteLength) return false
  let difference = 0
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index]! ^ right[index]!
  }
  return difference === 0
}

/** The signed string, spelled out once so no caller can assemble it wrongly. */
export function signedContent(id: string, timestamp: string, rawBody: string): string {
  return `${id}.${timestamp}.${rawBody}`
}

async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(message) as unknown as ArrayBuffer,
  )
  return new Uint8Array(signature)
}

/**
 * Verify a Standard Webhooks delivery.
 *
 * Every failure returns a reason rather than throwing, so the caller can log
 * precisely why a delivery was refused without ever being able to accidentally
 * treat a thrown error as a pass.
 */
export async function verifyStandardWebhook(
  options: VerifyOptions,
): Promise<WebhookVerificationResult> {
  const id = options.headers.get(WEBHOOK_ID_HEADER)
  const timestamp = options.headers.get(WEBHOOK_TIMESTAMP_HEADER)
  const signatureHeader = options.headers.get(WEBHOOK_SIGNATURE_HEADER)
  if (!id || !timestamp || !signatureHeader) return { ok: false, reason: 'missing-headers' }

  // A unix timestamp in seconds and nothing else — no leading plus, no decimal,
  // no whitespace that would then be signed differently than it is parsed.
  if (!/^\d{1,15}$/.test(timestamp)) return { ok: false, reason: 'malformed-timestamp' }
  const timestampSeconds = Number(timestamp)
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
  // Both directions: a future timestamp is as suspicious as an old one.
  if (Math.abs(options.nowSeconds - timestampSeconds) > tolerance) {
    return { ok: false, reason: 'timestamp-outside-tolerance' }
  }

  const rawSecret = options.secret.startsWith(SECRET_PREFIX)
    ? options.secret.slice(SECRET_PREFIX.length)
    : options.secret
  const secretBytes = decodeBase64(rawSecret)
  if (!secretBytes || secretBytes.byteLength === 0) {
    return { ok: false, reason: 'malformed-secret' }
  }

  const expected = await hmacSha256(secretBytes, signedContent(id, timestamp, options.rawBody))

  // The header carries space-delimited signatures so a secret can be rotated
  // without downtime. Any one of them matching is a pass; all of them are
  // checked so rotation order never matters.
  let matched = false
  for (const entry of signatureHeader.split(' ')) {
    const separator = entry.indexOf(',')
    if (separator === -1) continue
    if (entry.slice(0, separator) !== SYMMETRIC_VERSION) continue
    const candidate = decodeBase64(entry.slice(separator + 1))
    if (!candidate) continue
    // Deliberately not short-circuiting: the loop always runs to the end so the
    // number of signatures offered does not change how long a forgery takes.
    if (constantTimeEquals(candidate, expected)) matched = true
  }

  if (!matched) return { ok: false, reason: 'no-signature-match' }
  return { ok: true, id, timestampSeconds }
}
