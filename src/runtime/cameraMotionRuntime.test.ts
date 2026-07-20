import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginCameraMotion,
  cameraWorldClipPath,
  endCameraMotion,
  hideCameraMotionPreview,
  registerCameraMotionRenderer,
  subscribeCameraMotion,
} from './cameraMotionRuntime'

describe('cameraMotionRuntime', () => {
  let disposeRenderer: (() => void) | null = null

  afterEach(() => {
    endCameraMotion('wheel')
    endCameraMotion('pointer')
    endCameraMotion('kinetic')
    endCameraMotion('animation')
    disposeRenderer?.()
    disposeRenderer = null
  })

  it('prepares the preview before telling the DOM world to hide', () => {
    const order: string[] = []
    disposeRenderer = registerCameraMotionRenderer({
      show: () => order.push('show-preview'),
      hide: () => order.push('hide-preview'),
    })
    const unsubscribe = subscribeCameraMotion((active) => order.push(`motion-${active}`))

    expect(beginCameraMotion('wheel')).toBe(true)
    expect(order).toEqual(['show-preview', 'motion-true'])

    endCameraMotion('wheel')
    hideCameraMotionPreview()
    expect(order).toEqual(['show-preview', 'motion-true', 'motion-false', 'hide-preview'])
    unsubscribe()
  })

  it('keeps the preview active until every motion source finishes', () => {
    const listener = vi.fn()
    const show = vi.fn()
    const hide = vi.fn()
    disposeRenderer = registerCameraMotionRenderer({ show, hide })
    const unsubscribe = subscribeCameraMotion(listener)

    beginCameraMotion('pointer')
    beginCameraMotion('kinetic')
    endCameraMotion('pointer')
    hideCameraMotionPreview()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(show).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith(true)
    expect(hide).not.toHaveBeenCalled()

    endCameraMotion('kinetic')
    expect(listener).toHaveBeenLastCalledWith(false)
    unsubscribe()
  })

  it('leaves the full DOM visible when no preview renderer is mounted', () => {
    expect(beginCameraMotion('wheel')).toBe(false)
  })

  it('does not clip the zero-sized infinite world while the camera is idle', () => {
    expect(cameraWorldClipPath(false)).toBe('none')
    expect(cameraWorldClipPath(true)).toBe('inset(50%)')
  })
})
