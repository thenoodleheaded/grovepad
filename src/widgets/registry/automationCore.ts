import { GRID_SIZE } from '../../types/spatial'
import { AUTOMATION_CORE_CATALOG, AUTOMATION_CORE_TYPES, defaultAutomationCoreData, type AutomationCoreType } from '../automationCoreCatalog'
import type { WidgetDefinition } from '../registry'

export const AUTOMATION_CORE_DEFINITIONS=Object.fromEntries(AUTOMATION_CORE_TYPES.map(type=>{
  const spec=AUTOMATION_CORE_CATALOG[type]
  const definition:WidgetDefinition={type,label:spec.label,description:spec.description,icon:spec.icon,category:spec.category,accent:spec.accent,defaultSize:{width:360,height:GRID_SIZE*6},defaultData:()=>defaultAutomationCoreData(type)}
  return [type,definition]
})) as Record<AutomationCoreType,WidgetDefinition>
