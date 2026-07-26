import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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

  useLayoutEffect(() => {
    const refreshForCamera = (
      nextCamera: CameraViewport,
      previousZoom: number,
      immediate = false,
    ) => {
      const crossedDetailLine =
        (nextCamera.zoom < RESTING_FACE_INTERACTION_ZOOM) !==
        (previousZoom < RESTING_FACE_INTERACTION_ZOOM)
      const viewportNeedsWindow = !rectContains(
        windowRef.current.retainedRect,
        worldRectForViewport(nextCamera, WIDGET_WINDOW_REPLAN_PX),
      )
      if (!crossedDetailLine && !viewportNeedsWindow) return

      const apply = () => {
        const next = makeWindow()
        windowRef.current = next
        setVirtualWindow(next)
      }
      cancelAnimationFrame(frameRef.current)
      if (immediate) apply()
      else frameRef.current = requestAnimationFrame(apply)
    }

    const unsubscribe = useCanvasStore.subscribe((state, previous) => {
      const cameraChanged =
        state.pan !== previous.pan ||
        state.zoom !== previous.zoom ||
        state.viewportSize !== previous.viewportSize
      if (!cameraChanged) return
      refreshForCamera({
        pan: state.pan,
        zoom: state.zoom,
        viewportSize: state.viewportSize,
      }, previous.zoom)
    })

    // Persistence can restore a saved camera between the initial render and
    // this subscription. Re-read it before paint so opening a board never
    // waits for the first gesture to wake the virtual window.
    const currentCamera = readCamera()
    refreshForCamera(currentCamera, windowRef.current.camera.zoom, true)
    return unsubscribe
  }, [])

  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  return virtualWindow
}
