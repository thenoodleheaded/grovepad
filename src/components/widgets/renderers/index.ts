import {
  atlasWidgetRendererFamily,
  automationWidgetRendererFamily,
  expansionWidgetRendererFamily,
} from './catalogWidgetRenderers'
import { coreWidgetRendererFamily } from './coreWidgetRenderers'
import { educationWidgetRendererFamily } from './educationWidgetRenderers'
import type { WidgetRendererFamily } from './contracts'
import { workflowWidgetRendererFamily } from './workflowWidgetRenderers'

export const WIDGET_RENDERER_FAMILIES = [
  coreWidgetRendererFamily,
  educationWidgetRendererFamily,
  workflowWidgetRendererFamily,
  expansionWidgetRendererFamily,
  atlasWidgetRendererFamily,
  automationWidgetRendererFamily,
] as const satisfies readonly WidgetRendererFamily[]

export { rendererFamilyIdsForType, renderFromFamilies } from './contracts'
