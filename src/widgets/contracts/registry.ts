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

/** One choice in a widget's mode switcher. `value` must match the widget data's `mode` field. */
export interface WidgetModeOption {
  value: string
  label: string
  icon: LucideIcon
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
  /** Alternate data shapes the widget switches between, shown via the card's mode pill. */
  modes?: readonly WidgetModeOption[]
  /** Present when the type is gated behind a domain pack. */
  pack?: DomainPack
  /** Existing-only types hydrate safely but are not offered for new work. */
  availability?: 'public' | 'existing-only'
  unavailableReason?: string
}
