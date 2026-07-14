import { useEffect } from 'react'
import { useToastStore } from '../../store/useToastStore'
import { useWidgetStore, type WidgetStoreState } from '../../store/useWidgetStore'
import type { NotifierData } from '../../types/spatial'

/** Side-effect sink for scheduled notifier widgets. */
export function AutomationRuntime() {
  useEffect(() => {
    const processing = new Set<string>()
    let structureVersion = -1
    let notifierIds = new Set<string>()

    const rebuildNotifierIndex = (state: WidgetStoreState) => {
      if (state.widgetStructureVersion === structureVersion) return
      notifierIds = new Set(
        Object.values(state.widgets)
          .filter((widget) => widget.type === 'notifier')
          .map((widget) => widget.id),
      )
      structureVersion = state.widgetStructureVersion
    }

    const processPending = (state: WidgetStoreState) => {
      rebuildNotifierIndex(state)
      for (const widgetId of notifierIds) {
        const widget = state.widgets[widgetId]
        if (!widget || widget.type !== 'notifier') continue
        const data = widget.data as NotifierData
        if (!data.pendingFireAt) continue
        const token = `${widget.id}:${data.pendingFireAt}`
        if (processing.has(token)) continue
        processing.add(token)
        const cooldownMs = Math.max(0, data.cooldownMinutes) * 60_000
        const allowed = !data.lastFiredAt || data.pendingFireAt - data.lastFiredAt >= cooldownMs
        if (allowed) {
          const message = data.message.trim() || data.label || 'Grovepad reminder'
          useToastStore.getState().addToast(message)
          if (data.channel === 'browser' && typeof Notification !== 'undefined') {
            if (Notification.permission === 'granted') new Notification(data.label || 'Grovepad', { body: message })
            else if (Notification.permission === 'default') {
              void Notification.requestPermission().then((permission) => {
                if (permission === 'granted') new Notification(data.label || 'Grovepad', { body: message })
              }).catch(() => { /* toast already delivered */ })
            }
          }
        }
        useWidgetStore.setState((current) => {
          const live = current.widgets[widget.id]
          if (!live || live.type !== 'notifier') return current
          const liveData = live.data as NotifierData
          if (liveData.pendingFireAt !== data.pendingFireAt) return current
          const nextData: NotifierData = {
            ...liveData,
            pendingFireAt: null,
            ...(allowed ? { lastFiredAt: data.pendingFireAt, fireCount: liveData.fireCount + 1 } : {}),
          }
          return { widgets: { ...current.widgets, [widget.id]: { ...live, data: nextData } } }
        })
        processing.delete(token)
      }
    }

    processPending(useWidgetStore.getState())
    return useWidgetStore.subscribe((state, previous) => {
      if (
        state.widgets === previous.widgets &&
        state.widgetStructureVersion === previous.widgetStructureVersion
      ) {
        return
      }
      processPending(state)
    })
  }, [])

  return null
}
