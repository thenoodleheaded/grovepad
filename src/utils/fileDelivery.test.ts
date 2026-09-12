import { afterEach, describe, expect, it, vi } from 'vitest'

import { deliverFile, setShareInvoke, toBase64 } from './fileDelivery'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120'

function host({ tauri, userAgent, maxTouchPoints = 5 }: {
  tauri: boolean
  userAgent: string
  maxTouchPoints?: number
}) {
  vi.stubGlobal('navigator', { userAgent, maxTouchPoints })
  vi.stubGlobal('window', tauri ? { __TAURI_INTERNALS__: {} } : {})
}

/**
 * The suite runs without a DOM (components here are checked through server
 * rendering), so the download path gets a stand-in document rather than jsdom.
 * It records what an anchor was actually asked to save.
 */
function trackAnchors() {
  const clicked: Array<{ download: string }> = []
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
  vi.stubGlobal('document', {
    createElement: () => ({
      href: '',
      download: '',
      click(this: { download: string }) {
        clicked.push({ download: this.download })
      },
      remove() {},
    }),
    body: { appendChild() {} },
  })
  return clicked
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setShareInvoke(null)
})

describe('file delivery', () => {
  it('sends the file to the iOS share sheet instead of a download that does nothing', async () => {
    // WKWebView ignores `<a download>` outright, so the download path is not a
    // degraded experience there — it is no experience at all.
    host({ tauri: true, userAgent: IPHONE })
    const clicked = trackAnchors()
    const invoke = vi.fn().mockResolvedValue(undefined)
    setShareInvoke(invoke)

    const route = await deliverFile({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'board.grovepad',
      mimeType: 'application/vnd.grovepad.board+zip',
    })

    expect(route).toBe('shared')
    expect(invoke).toHaveBeenCalledWith('share_file', {
      fileName: 'board.grovepad',
      base64: toBase64(new Uint8Array([1, 2, 3])),
    })
    expect(clicked).toEqual([])
  })

  it('downloads in a browser, including mobile Safari, which is not the app', async () => {
    host({ tauri: false, userAgent: IPHONE })
    const clicked = trackAnchors()
    const invoke = vi.fn()
    setShareInvoke(invoke)

    const route = await deliverFile({ bytes: 'hello', fileName: 'notes.md', mimeType: 'text/markdown' })

    expect(route).toBe('downloaded')
    expect(invoke).not.toHaveBeenCalled()
    expect(clicked).toEqual([{ download: 'notes.md' }])
  })

  it('falls back to a download when the share sheet cannot be reached', async () => {
    host({ tauri: true, userAgent: IPHONE })
    const clicked = trackAnchors()
    setShareInvoke(vi.fn().mockRejectedValue(new Error('no presenter')))

    const route = await deliverFile({ bytes: 'x', fileName: 'notes.md', mimeType: 'text/markdown' })

    // Losing the export outright would be worse than a download that may
    // itself do nothing, and it keeps one failure path for every caller.
    expect(route).toBe('downloaded')
    expect(clicked).toEqual([{ download: 'notes.md' }])
  })

  it('uses the download route on desktop', async () => {
    host({ tauri: true, userAgent: DESKTOP, maxTouchPoints: 0 })
    const clicked = trackAnchors()
    const invoke = vi.fn()
    setShareInvoke(invoke)

    expect(await deliverFile({ bytes: 'x', fileName: 'a.txt', mimeType: 'text/plain' })).toBe('downloaded')
    expect(invoke).not.toHaveBeenCalled()
    expect(clicked).toHaveLength(1)
  })

  it('encodes a package far larger than the call-argument limit', () => {
    // `String.fromCharCode(...bytes)` throws on a real board package, which
    // would turn a large export into what looks like a corrupt board.
    const big = new Uint8Array(300_000).map((_, index) => index % 256)
    const encoded = toBase64(big)
    expect(atob(encoded)).toHaveLength(big.length)
    expect(encoded).toBe(Buffer.from(big).toString('base64'))
  })
})
