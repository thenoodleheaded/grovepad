import { Suspense } from 'react'
import type { ModuleData, Widget } from '../../types/spatial'
import { getOpaqueWidgetType } from '../../utils/persistedBoardSchema'
import { widgetLayoutTier } from '../../widgets/sizingProfiles'
import { renderFromFamilies, WIDGET_RENDERER_FAMILIES } from './renderers'

interface WidgetRendererProps {
  widget: Widget
  onUpdate: (data: ModuleData) => void
  onHeightChange: (height: number) => void
}

export function WidgetRenderer({ widget, onUpdate, onHeightChange }: WidgetRendererProps) {
  const opaqueType = getOpaqueWidgetType(widget)
  if (opaqueType) {
    return (
      <div
        aria-label={`Unsupported widget type ${opaqueType}`}
        className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-amber-400/25 bg-amber-300/5 px-5 text-center"
        data-opaque-widget
        data-opaque-widget-type={opaqueType}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300/80">
          Newer Grovepad widget
        </span>
        <p className="max-w-72 text-sm leading-5 text-neutral-300">
          This card was made with a newer version of Grovepad. Its data is preserved unchanged.
        </p>
        <code className="max-w-full truncate rounded-md bg-black/20 px-2 py-1 text-[11px] text-neutral-400">
          {opaqueType}
        </code>
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div data-widget-loading className="flex h-full w-full items-center justify-center">
          <span className="h-4 w-4 animate-spin rounded-full border border-neutral-700 border-t-neutral-300" />
        </div>
      }
    >
      <div
        className="gp-widget-ui h-full w-full"
        data-widget-type={widget.type}
        data-layout-tier={widgetLayoutTier(widget.type, widget.size.width)}
      >
        {renderFromFamilies(WIDGET_RENDERER_FAMILIES, { widget, onUpdate, onHeightChange })}
      </div>
    </Suspense>
  )
}
