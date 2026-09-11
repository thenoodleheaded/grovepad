import type { ReactNode } from 'react'
import type { ModuleData, ModuleType, Widget } from '../../../types/spatial'

export interface WidgetRenderContext {
  widget: Widget
  onUpdate: (data: ModuleData) => void
  onHeightChange: (height: number) => void
  /**
   * Only wired for `sizing.autoWidth` cards: how much wider (positive) or
   * narrower (negative) the content needs the card to be, in pixels.
   */
  onWidthChange?: (slack: number) => void
}

export type WidgetContentRenderer = (context: WidgetRenderContext) => ReactNode

export interface WidgetRendererFamily {
  id: string
  renderers: Partial<Record<ModuleType, WidgetContentRenderer>>
}

export function rendererFamilyIdsForType(
  families: readonly WidgetRendererFamily[],
  type: ModuleType,
): string[] {
  return families
    .filter((family) => family.renderers[type] !== undefined)
    .map((family) => family.id)
}

export function renderFromFamilies(
  families: readonly WidgetRendererFamily[],
  context: WidgetRenderContext,
): ReactNode {
  for (const family of families) {
    const render = family.renderers[context.widget.type]
    if (render) return render(context)
  }
  return null
}
