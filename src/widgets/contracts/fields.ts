import type { ModuleData, ModuleType, SeriesPoint } from '../../types/spatial'
import type { FieldCommand, FieldValueType, SemanticUnit } from '../../types/fieldConnections'

/**
 * Two retired cards' editors are still the UI for a canonical widget's skin:
 * Decision's Weighted skin and Goal's OKR skin are drawn by the generic
 * expansion renderer under these names. They are NOT widget types — nothing can
 * create one, and they are absent from the registry and from `ModuleType`. They
 * survive only as renderer identities, which is why the field and command tables
 * are keyed slightly wider than the type union.
 */
export type SkinRendererType = 'random_picker' | 'okr'

/** Anything that can own a field or command table: a widget type or a skin renderer. */
export type FieldOwner = ModuleType | SkinRendererType

export type FieldValue = number | boolean | string | SeriesPoint[]

export interface FieldDescriptor {
  key: string
  label: string
  valueType: FieldValueType
  get: (data: ModuleData) => FieldValue
  /** Absent = read-only source field. */
  set?: (data: ModuleData, value: FieldValue) => ModuleData
  /** Re-read on the shared minute heartbeat when this field is connected. */
  timeSensitive?: boolean
  /** Advisory semantic tag — drives auto-suggested wire transforms, never gates a connection. */
  unit?: SemanticUnit
}

export interface CommandDescriptor {
  key: FieldCommand
  label: string
  /** Apply one trigger delivery. Payload is the post-transform source value. */
  run: (data: ModuleData, payload?: FieldValue) => ModuleData
  /** True when `run` consumes payload and the inspector should offer transforms. */
  acceptsPayload?: boolean
}
