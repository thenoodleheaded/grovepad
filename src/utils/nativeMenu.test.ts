import { afterEach, describe, expect, it, vi } from 'vitest'

import { presentNativeMenu, setMenuInvoke, usesNativeMenu } from './nativeMenu'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'

function host({ tauri, userAgent = IPHONE, maxTouchPoints = 5 }: {
  tauri: boolean
  userAgent?: string
  maxTouchPoints?: number
}) {
  vi.stubGlobal('navigator', { userAgent, maxTouchPoints })
  vi.stubGlobal('window', tauri ? { __TAURI_INTERNALS__: {} } : {})
}

const ITEMS = [{ label: 'Duplicate' }, { label: 'Delete', danger: true }]
const ANCHOR = { x: 120, y: 240, width: 0, height: 0 }

afterEach(() => {
  vi.unstubAllGlobals()
  setMenuInvoke(null)
})

describe('native context menu', () => {
  it('claims the menu only inside the iOS app', () => {
    host({ tauri: true })
    expect(usesNativeMenu()).toBe(true)
    host({ tauri: false })
    expect(usesNativeMenu()).toBe(false)
    host({ tauri: true, userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 0 })
    expect(usesNativeMenu()).toBe(false)
  })

  it('sends the labels, the danger flag and the press point', async () => {
    host({ tauri: true })
    const invoke = vi.fn().mockResolvedValue({ index: 1 })
    setMenuInvoke(invoke)

    expect(await presentNativeMenu('Budget', ITEMS, ANCHOR)).toBe(1)
    expect(invoke).toHaveBeenCalledWith('present_menu', {
      request: { title: 'Budget', items: ITEMS, sourceRect: ANCHOR },
    })
  })

  it('reports a dismissal as no choice rather than a failure', async () => {
    // Tapping outside is how iOS says "never mind"; a caller has to tell that
    // apart from the bridge falling over.
    host({ tauri: true })
    setMenuInvoke(vi.fn().mockResolvedValue({ index: null }))
    expect(await presentNativeMenu('Budget', ITEMS, ANCHOR)).toBeNull()
  })

  it('refuses an index the menu never offered', async () => {
    // Running action 7 of a 2-item menu would fire whatever happened to be
    // there; out of range is treated as a dismissal.
    host({ tauri: true })
    setMenuInvoke(vi.fn().mockResolvedValue({ index: 7 }))
    expect(await presentNativeMenu('Budget', ITEMS, ANCHOR)).toBeNull()
    setMenuInvoke(vi.fn().mockResolvedValue({ index: -1 }))
    expect(await presentNativeMenu('Budget', ITEMS, ANCHOR)).toBeNull()
  })

  it('resolves to no choice when the sheet cannot be presented', async () => {
    host({ tauri: true })
    setMenuInvoke(vi.fn().mockRejectedValue(new Error('no presenter')))
    expect(await presentNativeMenu('Budget', ITEMS, ANCHOR)).toBeNull()
  })

  it('never presents an empty sheet', async () => {
    host({ tauri: true })
    const invoke = vi.fn()
    setMenuInvoke(invoke)
    expect(await presentNativeMenu('Budget', [], ANCHOR)).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('passes a null title rather than an empty one', async () => {
    host({ tauri: true })
    const invoke = vi.fn().mockResolvedValue({ index: 0 })
    setMenuInvoke(invoke)
    await presentNativeMenu('', ITEMS, ANCHOR)
    expect(invoke.mock.calls[0]![1].request.title).toBeNull()
  })
})
