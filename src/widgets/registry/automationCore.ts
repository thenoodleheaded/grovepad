import { GRID_SIZE } from '../../types/spatial'
import { AUTOMATION_CORE_CATALOG, AUTOMATION_CORE_TYPES, defaultAutomationCoreData, type AutomationCoreType } from '../automationCoreCatalog'
import type { WidgetDefinition } from '../contracts/registry'

/** Only automation cards whose catalogue promise has a complete executor. */
export const PUBLIC_AUTOMATION_CORE_TYPES: ReadonlySet<AutomationCoreType> = new Set([
  'approval_gate', 'workflow_lock', 'widget_creator',
  'queue', 'stack_store', 'set_store', 'state_machine', 'idempotency_store', 'mutex',
  'http_request', 'webhook_sender',
])

export const AUTOMATION_CORE_DEFINITIONS=Object.fromEntries(AUTOMATION_CORE_TYPES.map(type=>{
  const spec=AUTOMATION_CORE_CATALOG[type]
  const unavailable=!PUBLIC_AUTOMATION_CORE_TYPES.has(type)
  const reason = type==='script_block'
    ? 'Code execution is disabled until a capability-restricted runtime is available.'
    : type==='secret_reference'
      ? 'Secret references require a protected credential store that is not available in this beta.'
      : 'This automation is preserved for existing boards but is hidden until its advertised behavior has a dedicated executor and contract tests.'
  const definition:WidgetDefinition={type,label:spec.label,description:spec.description,icon:spec.icon,category:spec.category,accent:spec.accent,defaultSize:{width:360,height:GRID_SIZE*6},defaultData:()=>defaultAutomationCoreData(type),...(unavailable?{availability:'existing-only' as const,unavailableReason:reason}:{})}
  return [type,definition]
})) as Record<AutomationCoreType,WidgetDefinition>
