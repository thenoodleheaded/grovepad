import {
  atlasWidgetRendererFamily,
  automationWidgetRendererFamily,
  expansionWidgetRendererFamily,
} from './catalogWidgetRenderers'
import { coreWidgetRendererFamily } from './coreWidgetRenderers'
import { consolidatedWidgetRendererFamily } from './consolidatedWidgetRenderers'
import { educationWidgetRendererFamily } from './educationWidgetRenderers'
import type { WidgetRendererFamily } from './contracts'
import { workflowWidgetRendererFamily } from './workflowWidgetRenderers'

export const WIDGET_RENDERER_FAMILIES = [
  consolidatedWidgetRendererFamily,
  coreWidgetRendererFamily,
  educationWidgetRendererFamily,
  workflowWidgetRendererFamily,
  expansionWidgetRendererFamily,
  atlasWidgetRendererFamily,
  automationWidgetRendererFamily,
] as const satisfies readonly WidgetRendererFamily[]

export { rendererFamilyIdsForType, renderFromFamilies } from './contracts'
