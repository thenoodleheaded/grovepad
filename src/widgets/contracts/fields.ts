import type { ModuleData, SeriesPoint } from '../../types/spatial'
import type { FieldCommand, FieldValueType, SemanticUnit } from '../../types/fieldConnections'

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
