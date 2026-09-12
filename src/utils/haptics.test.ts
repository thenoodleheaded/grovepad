import { afterEach, describe, expect, it, vi } from 'vitest'

import { haptic, setHapticInvoke, type HapticKind } from './haptics'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120'

function host({ tauri, userAgent, maxTouchPoints = 5 }: {
  tauri: boolean
  userAgent: string
  maxTouchPoints?: number
}) {
  const vibrate = vi.fn()
  vi.stubGlobal('navigator', { userAgent, maxTouchPoints, vibrate })
  vi.stubGlobal('window', tauri ? { __TAURI_INTERNALS__: {} } : {})
  return vibrate
}

afterEach(() => {
  vi.unstubAllGlobals()
  setHapticInvoke(null)
})

describe('haptic routing', () => {
  it('drives the Taptic Engine in the iOS app, not the dead web API', async () => {
    // WKWebView does not implement navigator.vibrate at all, so the web call
    // would be silent on the one platform with the best hardware for this.
    const vibrate = host({ tauri: true, userAgent: IPHONE })
    const invoke = vi.fn().mockResolvedValue(undefined)
    setHapticInvoke(invoke)

    for (const kind of ['detent', 'commit', 'limit'] satisfies HapticKind[]) haptic(kind)
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(3))

    expect(invoke.mock.calls.map(([command, args]) => [command, args.kind])).toEqual([
      ['haptic_tap', 'detent'],
      ['haptic_tap', 'commit'],
      ['haptic_tap', 'limit'],
    ])
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('treats an iPad reporting a desktop user agent as the iOS app', async () => {
    host({ tauri: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })
    const invoke = vi.fn().mockResolvedValue(undefined)
    setHapticInvoke(invoke)
    haptic('commit')
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))
  })

  it('keeps the web vibration route on Android, where it actually works', () => {
    const vibrate = host({ tauri: true, userAgent: ANDROID })
    const invoke = vi.fn()
    setHapticInvoke(invoke)
    haptic('detent')
    expect(vibrate).toHaveBeenCalledWith(8)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('uses the web route in mobile Safari, which is not the app', () => {
    const vibrate = host({ tauri: false, userAgent: IPHONE })
    const invoke = vi.fn()
    setHapticInvoke(invoke)
    haptic('limit')
    expect(invoke).not.toHaveBeenCalled()
    expect(vibrate).toHaveBeenCalledWith(4)
  })

  it('stays silent rather than throwing when the bridge rejects', async () => {
    host({ tauri: true, userAgent: IPHONE })
    const invoke = vi.fn().mockRejectedValue(new Error('no engine'))
    setHapticInvoke(invoke)
    // A tick reports something the interface already did; a failure here must
    // never reach a caller, because no caller is allowed to branch on it.
    expect(() => haptic('commit')).not.toThrow()
    await vi.waitFor(() => expect(invoke).toHaveBeenCalled())
  })

  it('never makes a caller wait on a tick', () => {
    host({ tauri: true, userAgent: IPHONE })
    setHapticInvoke(vi.fn().mockReturnValue(new Promise(() => {})))
    // A never-settling bridge must not block the gesture that asked for it.
    expect(haptic('detent')).toBeUndefined()
  })
})
