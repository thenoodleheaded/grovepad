import { Suspense } from 'react'
import type { ModuleData, Widget } from '../../types/spatial'
import { getOpaqueWidgetType } from '../../utils/persistedBoardSchema'
import { currentSkin } from '../../utils/widgetSkins'
import { widgetDefinition } from '../../widgets/registry'
import { renderFromFamilies, WIDGET_RENDERER_FAMILIES } from './renderers'
import { WidgetSkinDetails } from './WidgetSkinDetails'

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

  const skin = currentSkin(widget, widgetDefinition(widget.type))

  return (
    <Suspense
      fallback={
        <div data-widget-loading className="flex h-full w-full items-center justify-center">
          <span className="h-4 w-4 animate-spin rounded-full border border-neutral-700 border-t-neutral-300" />
        </div>
      }
    >
      <div
        className="gp-widget-ui relative h-full w-full"
        data-widget-type={widget.type}
        data-widget-skin={skin?.value}
        data-skin-presentation={skin?.presentation}
        data-skin-implementation={skin?.implementation}
        role={skin?.description ? 'group' : undefined}
        aria-label={
          skin?.description
            ? `${skin.label} skin. ${skin.description}`
            : undefined
        }
      >
        {renderFromFamilies(WIDGET_RENDERER_FAMILIES, { widget, onUpdate, onHeightChange })}
        {skin?.implementation === 'schema-extension' && (
          <WidgetSkinDetails data={widget.data} skin={skin} onUpdate={onUpdate} />
        )}
      </div>
    </Suspense>
  )
}
