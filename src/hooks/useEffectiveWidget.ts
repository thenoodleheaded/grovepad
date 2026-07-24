import type { Widget } from '../types/spatial'
import { useWidgetRestStore } from '../store/useWidgetRestStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { widgetWithEffectiveSize } from '../utils/widgetRest'

/** The widget as it currently sits on screen: resting tile size, or the
 * offset position an expanded card occupies. For per-widget
 * components that hand world coordinates back out (port rail wire drags). */
export function useEffectiveWidget(widgetId: string): Widget | undefined {
  const widget = useWidgetStore((state) => state.widgets[widgetId])
  const expandedWidgetId = useWidgetRestStore((state) => state.expandedWidgetId)
  const expandedOffset = useWidgetRestStore((state) => state.expandedOffset)
  return widget
    ? widgetWithEffectiveSize(widget, { expandedWidgetId, expandedOffset })
    : undefined
}
