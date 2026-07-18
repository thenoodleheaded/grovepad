import type { ModuleType } from '../types/spatial'
import type { CommandDescriptor, FieldDescriptor } from './contracts/fields'
export type { CommandDescriptor, FieldDescriptor, FieldValue } from './contracts/fields'
import { EXPANSION_COMMANDS, EXPANSION_FIELDS } from './fields/expansion'
import { ATLAS_COMMANDS, ATLAS_FIELDS } from './fields/atlas'
import { AUTOMATION_CORE_COMMANDS, AUTOMATION_CORE_FIELDS } from './fields/automationCore'
import { CORE_WIDGET_FIELDS } from './fields/coreWidgetFields'
import { DATA_MEDIA_FIELDS } from './fields/dataMediaFields'
import { STUDY_FIELDS } from './fields/studyFields'
import { INPUT_LOGIC_FIELDS } from './fields/inputLogicFields'
import { PROFESSIONAL_FIELDS } from './fields/professionalFields'
import { CORE_WIDGET_COMMANDS } from './fields/coreCommands'

// ---------------------------------------------------------------------------
// Bindable field registry — which values inside each module type can be
// wired up by the Unified Dependency Framework, and how to read/write them.
//
// A field with no `set` is source-only (an output port but no input port):
// derived values like a budget total or a checklist's done-count can feed
// other widgets but can't be overwritten themselves.
//
// Port geometry is deterministic: a field's index in this list IS its port
// slot on the card edge, so the wire layer and the port overlay agree on
// coordinates without any DOM measurement.
// ---------------------------------------------------------------------------
const WIDGET_FIELDS: Partial<Record<ModuleType, FieldDescriptor[]>> = {
  ...CORE_WIDGET_FIELDS,
  ...DATA_MEDIA_FIELDS,
  ...STUDY_FIELDS,
  ...INPUT_LOGIC_FIELDS,
  ...PROFESSIONAL_FIELDS,
  ...EXPANSION_FIELDS,
  ...ATLAS_FIELDS,
  ...AUTOMATION_CORE_FIELDS,
}

// ---------------------------------------------------------------------------
// Trigger commands — one-shot mutations a trigger connection can fire.
// ---------------------------------------------------------------------------

const WIDGET_COMMANDS: Partial<Record<ModuleType, CommandDescriptor[]>> = {
  ...CORE_WIDGET_COMMANDS,
  ...EXPANSION_COMMANDS,
  ...ATLAS_COMMANDS,
  ...AUTOMATION_CORE_COMMANDS,
}
export function fieldsFor(type: ModuleType): FieldDescriptor[] {
  return WIDGET_FIELDS[type] ?? []
}

export function fieldDescriptor(type: ModuleType, key: string): FieldDescriptor | undefined {
  return WIDGET_FIELDS[type]?.find((f) => f.key === key)
}

export function commandsFor(type: ModuleType): CommandDescriptor[] {
  return WIDGET_COMMANDS[type] ?? []
}
