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
  /**
   * The card is entirely content-driven: no resize handle, no manual size.
   * For widgets whose layout is a list of its own items, where every pixel of
   * the card is already decided by what the user typed — dragging an edge can
   * only add empty glass or clip a row.
   *
   * A predicate lets a mode-switching widget be fixed in the views that are
   * lists and free in the views that are canvases (a board, a schedule grid).
   */
  fixed?: boolean | ((data: unknown) => boolean)
}

/** Resolve `sizing.fixed` for one widget's current data. */
export function isFixedSizeWidget(
  sizing: WidgetSizing | undefined,
  data: unknown,
): boolean {
  const fixed = sizing?.fixed
  return typeof fixed === 'function' ? fixed(data) : fixed === true
}

/**
 * One skin a widget can wear — an alternate shape for the same card. `value`
 * must match the widget data's `mode` field, which stays named `mode` because
 * it is persisted board data (see the storage contract); everything the user
 * ever sees calls it a skin.
 */
export interface WidgetSkinOption {
  value: string
  label: string
  icon: LucideIcon
  /** Every skin owns its hue: the card icon, resting tile, and roller wear it. */
  accent: string
}

export interface WidgetDefinition {
  type: ModuleType
  label: string
  description: string
  icon: LucideIcon
  category: WidgetCategory
  /** Accent hue used for picker tiles, card icons, and hover bloom. A widget
   *  wearing a skin takes that skin's accent instead. */
  accent: string
  defaultSize: Size
  defaultData: () => ModuleData
  sizing?: WidgetSizing
  /** Skins this widget can wear, rolled through from the card's title. */
  skins?: readonly WidgetSkinOption[]
  /** Present when the type is gated behind a domain pack. */
  pack?: DomainPack
  /** Existing-only types hydrate safely but are not offered for new work. */
  availability?: 'public' | 'existing-only'
  unavailableReason?: string
  /**
   * Widgets rest by default as compact, non-editable summary tiles and mount
   * their full interactive card only while ephemerally expanded (click).
   * Set false only for a type that cannot safely use the global resting-face
   * contract — see utils/widgetRest.ts.
   */
  restingFace?: boolean
}
