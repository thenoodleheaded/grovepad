import { useEffect, useRef, useState } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import {
  RESTING_FACE_INTERACTION_ZOOM,
  WIDGET_WINDOW_OVERSCAN_PX,
  WIDGET_WINDOW_REPLAN_PX,
  rectContains,
  worldRectForViewport,
  type CameraViewport,
  type WorldRect,
} from '../utils/widgetVirtualization'

export interface VirtualCanvasWindow {
  camera: CameraViewport
  retainedRect: WorldRect
}

function readCamera(): CameraViewport {
  const state = useCanvasStore.getState()
  return {
    pan: state.pan,
    zoom: state.zoom,
    viewportSize: state.viewportSize,
  }
}

function makeWindow(camera = readCamera()): VirtualCanvasWindow {
  return {
    camera,
    retainedRect: worldRectForViewport(camera, WIDGET_WINDOW_OVERSCAN_PX),
  }
}

/**
 * Camera panning remains imperative. React only receives a new virtual window
 * after the viewport consumes its safety gutter or crosses the 60% LOD line.
 */
export function useVirtualCanvasWindow(): VirtualCanvasWindow {
  const [virtualWindow, setVirtualWindow] = useState(makeWindow)
  const windowRef = useRef(virtualWindow)
  const frameRef = useRef(0)

  useEffect(() => useCanvasStore.subscribe((state, previous) => {
    const cameraChanged =
      state.pan !== previous.pan ||
      state.zoom !== previous.zoom ||
      state.viewportSize !== previous.viewportSize
    if (!cameraChanged) return

    const nextCamera: CameraViewport = {
      pan: state.pan,
      zoom: state.zoom,
      viewportSize: state.viewportSize,
    }
    const crossedDetailLine =
      (state.zoom < RESTING_FACE_INTERACTION_ZOOM) !==
      (previous.zoom < RESTING_FACE_INTERACTION_ZOOM)
    const viewportNeedsWindow = !rectContains(
      windowRef.current.retainedRect,
      worldRectForViewport(nextCamera, WIDGET_WINDOW_REPLAN_PX),
    )
    if (!crossedDetailLine && !viewportNeedsWindow) return

    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      const next = makeWindow()
      windowRef.current = next
      setVirtualWindow(next)
    })
  }), [])

  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  return virtualWindow
}
