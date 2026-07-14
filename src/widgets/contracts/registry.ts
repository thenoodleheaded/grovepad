import type { LucideIcon } from 'lucide-react'
import type { DomainPack, ModuleData, ModuleType, Size } from '../../types/spatial'

export type WidgetCategory =
  | 'structure'
  | 'notes'
  | 'planning'
  | 'study'
  | 'data'
  | 'media'
  | 'tracking'
  | 'automation'
  | 'life'
  | 'specialist'

export interface WidgetSizing {
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  autoHeight?: boolean
}

export interface WidgetDefinition {
  type: ModuleType
  label: string
  description: string
  icon: LucideIcon
  category: WidgetCategory
  /** Accent hue used for picker tiles, card icons, and hover bloom. */
  accent: string
  defaultSize: Size
  defaultData: () => ModuleData
  sizing?: WidgetSizing
  /** Present when the type is gated behind a domain pack. */
  pack?: DomainPack
}
