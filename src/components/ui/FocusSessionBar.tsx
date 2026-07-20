import { useEffect, useState } from 'react'
import { Check, LayoutPanelTop, Pencil } from 'lucide-react'
import { useFocusStore } from '../../store/useFocusStore'
import { useWidgetStore } from '../../store/useWidgetStore'

function focusFirstEditor(widgetId: string): void {
  requestAnimationFrame(() => {
    const subject = document.querySelector<HTMLElement>(
      `article[data-widget-id="${CSS.escape(widgetId)}"]`,
    )
    subject
      ?.querySelector<HTMLElement>(
        '.gp-widget-content :is(input:not([type="button"]), textarea, select, [contenteditable="true"])',
      )
      ?.focus({ preventScroll: true })
  })
}

export function FocusSessionBar() {
  const widgetId = useFocusStore((state) => state.focusedWidgetId)
  const purpose = useFocusStore((state) => state.focusPurpose)
  const title = useWidgetStore((state) => widgetId ? state.widgets[widgetId]?.title : undefined)
  const [arrangeState, setArrangeState] = useState<{ widgetId: string | null; canArrange: boolean }>({
    widgetId: null,
    canArrange: false,
  })
  const canArrange = arrangeState.widgetId === widgetId && arrangeState.canArrange

  useEffect(() => {
    if (!widgetId) {
      setArrangeState({ widgetId: null, canArrange: false })
      return
    }
    let frame = 0
    const subject = document.querySelector<HTMLElement>(
      `article[data-widget-id="${CSS.escape(widgetId)}"]`,
    )
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        setArrangeState({
          widgetId,
          canArrange: Boolean(subject?.querySelector('.gp-island, [data-island]')),
        })
      })
    }
    measure()
    const observer = subject ? new MutationObserver(measure) : null
    if (subject) observer?.observe(subject, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [widgetId])

  if (!widgetId || !purpose) return null

  return (
    <div
      data-canvas-ui
      data-focus-session-ui
      role="toolbar"
      aria-label={`Focused widget controls for ${title ?? 'widget'}`}
      className="gp-focus-session-bar gp-panel fixed left-1/2 z-[80] flex -translate-x-1/2 items-center gap-1 rounded-2xl p-1.5"
    >
      <span className="max-w-32 truncate px-2 text-xs font-semibold text-neutral-200 sm:max-w-56">
        {title}
      </span>
      <button
        type="button"
        aria-label="Edit widget content"
        aria-pressed={purpose === 'edit'}
        className="gp-touch-target flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs text-neutral-300 transition-colors hover:bg-white/8 hover:text-white aria-pressed:bg-emerald-400/14 aria-pressed:text-emerald-200"
        onClick={() => {
          useFocusStore.getState().enterFocus(widgetId, 'edit')
          focusFirstEditor(widgetId)
        }}
      >
        <Pencil size={14} aria-hidden />
        <span className="hidden sm:inline">Edit</span>
      </button>
      <button
        type="button"
        aria-label="Arrange widget panels"
        aria-pressed={purpose === 'layout'}
        disabled={!canArrange}
        className="gp-touch-target flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs text-neutral-300 transition-colors hover:bg-white/8 hover:text-white aria-pressed:bg-violet-400/14 aria-pressed:text-violet-200 disabled:opacity-35"
        onClick={() => useFocusStore.getState().enterFocus(widgetId, 'layout')}
      >
        <LayoutPanelTop size={14} aria-hidden />
        <span className="hidden sm:inline">Arrange</span>
      </button>
      <button
        type="button"
        aria-label="Done with focused widget"
        className="gp-touch-target flex h-9 items-center gap-1.5 rounded-xl bg-white/8 px-2.5 text-xs font-semibold text-neutral-100 transition-colors hover:bg-white/12"
        onClick={() => useFocusStore.getState().exitFocus()}
      >
        <Check size={14} aria-hidden />
        <span className="hidden sm:inline">Done</span>
      </button>
    </div>
  )
}
