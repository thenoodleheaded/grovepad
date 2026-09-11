import { createContext, useContext, type ReactNode, type RefObject } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { WidgetSkinOption } from '../../widgets/contracts/registry'

/**
 * The skin roller's trigger, handed to a widget's own renderer.
 *
 * Normally the trigger is the small icon tile in the card's floating name row.
 * A card that hides that row (`titleChrome: false`) would otherwise have no way
 * to change skins at all, so the card publishes the trigger here and the
 * renderer mounts it on whichever mark already stands for the widget inside the
 * card — for the Canvas door, its folder glyph.
 *
 * The context is only provided by cards that hide their name row. Everywhere
 * else it is null and `WidgetSkinTrigger` falls back to a plain, inert mark, so
 * no card can end up with two live triggers pointing at one roller.
 */
export interface WidgetSkinTriggerHandle {
  skin: WidgetSkinOption
  open: boolean
  setOpen: (open: boolean) => void
  /** True while the roller flies the chosen icon home; the slot stands aside. */
  handingBack: boolean
  triggerRef: RefObject<HTMLButtonElement | null>
  widgetTitle: string
}

const WidgetSkinTriggerContext = createContext<WidgetSkinTriggerHandle | null>(null)

export function WidgetSkinTriggerProvider({
  handle,
  children,
}: {
  handle: WidgetSkinTriggerHandle | null
  children: ReactNode
}) {
  return (
    <WidgetSkinTriggerContext.Provider value={handle}>
      {children}
    </WidgetSkinTriggerContext.Provider>
  )
}

/**
 * The widget's identity mark: a button that opens the skin roller when this
 * card owns one, and the same mark drawn as plain paint when it does not.
 * `className` keeps the renderer's own styling in both cases, so a skin's
 * layout never shifts depending on how many skins the card has.
 */
export function WidgetSkinTrigger({
  className,
  fallbackIcon: FallbackIcon,
  size = 15,
  children,
}: {
  className?: string
  fallbackIcon: LucideIcon
  size?: number
  children?: ReactNode
}) {
  const handle = useContext(WidgetSkinTriggerContext)
  if (!handle) {
    return (
      <span className={className} aria-hidden>
        <FallbackIcon size={size} aria-hidden />
        {children}
      </span>
    )
  }
  const SkinIcon = handle.skin.icon
  return (
    <button
      ref={handle.triggerRef}
      type="button"
      className={className}
      aria-label={`Change ${handle.widgetTitle} skin (currently ${handle.skin.label})`}
      aria-expanded={handle.open}
      style={{ visibility: handle.handingBack ? 'hidden' : undefined }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        handle.setOpen(!handle.open)
      }}
    >
      <SkinIcon size={size} aria-hidden />
      {children}
    </button>
  )
}
