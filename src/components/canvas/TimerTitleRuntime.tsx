import { useEffect } from 'react'
import { useWidgetStore } from '../../store/useWidgetStore'
import type { PomodoroData, TimerData } from '../../types/spatial'

function activeDeadline(): number | null {
  let soonest: number | null = null
  for (const widget of Object.values(useWidgetStore.getState().widgets)) {
    const endAt = widget.type === 'timer'
      ? (widget.data as TimerData).endAt
      : widget.type === 'pomodoro'
        ? (widget.data as PomodoroData).endAt
        : null
    if (endAt && endAt > Date.now() && (soonest === null || endAt < soonest)) soonest = endAt
  }
  return soonest
}

export function TimerTitleRuntime() {
  const canvasName = useWidgetStore(
    (state) => state.canvases[state.activeCanvasId]?.name ?? 'Canvas',
  )

  useEffect(() => {
    const original = document.title
    const baseTitle = `grovepad | ${canvasName}`
    const update = () => {
      const deadline = activeDeadline()
      if (!deadline) { document.title = baseTitle; return }
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      const minutes = Math.floor(seconds / 60)
      document.title = `(${minutes}:${String(seconds % 60).padStart(2, '0')}) ${baseTitle}`
    }
    update()
    const timer = window.setInterval(update, 1000)
    return () => { window.clearInterval(timer); document.title = original }
  }, [canvasName])
  return null
}
