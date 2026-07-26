import { useEffect } from 'react'
import { useWidgetStore } from '../../store/useWidgetStore'
import type { PomodoroData, TimekeeperData, TimerData } from '../../types/spatial'

function activeDeadline(): number | null {
  let soonest: number | null = null
  for (const widget of Object.values(useWidgetStore.getState().widgets)) {
    let endAt = widget.type === 'timer'
      ? (widget.data as TimerData).endAt
      : widget.type === 'pomodoro'
        ? (widget.data as PomodoroData).endAt
        : null
    if (widget.type === 'timekeeper') {
      const data = widget.data as TimekeeperData
      if (data.mode === 'countdown' || data.mode === 'hourglass') endAt = data.countdown.endAt
      else if (data.mode === 'pomodoro') endAt = data.pomodoro.endAt
      else if (data.mode === 'intervals' || data.mode === 'tabata' || data.mode === 'multi_stage_timer') {
        const value = data.skinStates?.[data.mode]?.endAt
        endAt = typeof value === 'number' && Number.isFinite(value) ? value : null
      }
    }
    if (endAt && endAt > Date.now() && (soonest === null || endAt < soonest)) soonest = endAt
  }
  return soonest
}

export function TimerTitleRuntime() {
  const canvasName = useWidgetStore(
    (state) => state.canvases[state.activeCanvasId]?.name ?? 'Canvas',
  )
  const workspaceName = useWidgetStore(
    (state) => state.workspaces[state.activeWorkspaceId]?.name ?? 'Workspace',
  )

  useEffect(() => {
    const original = document.title
    const isOrigin = canvasName.toLowerCase() === 'origin'
    const displayTitle = isOrigin ? workspaceName : canvasName
    const baseTitle = `grovepad | ${displayTitle}`
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
  }, [canvasName, workspaceName])
  return null
}
