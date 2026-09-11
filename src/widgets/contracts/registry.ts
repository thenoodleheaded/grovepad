import type { LucideIcon } from 'lucide-react'
import type { DomainPack, ModuleData, ModuleType, Size } from '../../types/spatial'
import type {
  SkinImplementation,
  SkinPresentation,
} from '../skinBlueprints.generated'

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
   * The card fits its own width to its content, snapped to the grid, the same
   * way `autoHeight` fits its height. Only for cards whose width is decided by
   * one line of text they do not author (a canvas's name), where a fixed box
   * can only clip the name or pad it with empty glass.
   */
  autoWidth?: boolean
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
  /** What this skin helps the user do, shown by accessible skin surfaces. */
  description?: string
  /** Whether the existing data is enough or the skin owns optional extra data. */
  implementation?: SkinImplementation
  /** Shared layout language used by the renderer shell and resting face. */
  presentation?: SkinPresentation
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
  /**
   * Persisted field used by the skin roller. Existing consolidated widgets
   * use `mode`; widgets whose domain data already owns `mode` use `skin` so
   * changing appearance can never alter circuit behavior.
   */
  skinField?: 'mode' | 'skin'
  /**
   * Schema-extension skins whose renderer provides a purpose-built editor.
   * The generic key/value details overlay stays hidden for these values.
   */
  rendererOwnedSkinDetails?: readonly string[]
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
  /**
   * Whether the card wears the floating name row above its backplate. Set false
   * for a card that already states its own name inside itself, where the row
   * could only repeat it. Such a card publishes its skin trigger to its own
   * renderer (see WidgetSkinTrigger) so skins stay changeable, and gives up the
   * row's action buttons — deletion, renaming, and locking stay on right-click.
   */
  titleChrome?: boolean
}
