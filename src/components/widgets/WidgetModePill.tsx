import type { RefObject } from 'react'
import { resolveModeOptions } from '../../utils/widgetModeOptions'
import type { WidgetModeOption } from '../../widgets/contracts/registry'

interface WidgetModePillProps {
  mode: string
  options: readonly WidgetModeOption[]
  onChange: (mode: string) => void
  /** Matches the title capsule's own hidden state (collapsed/iconified). */
  hidden: boolean
  /** Controlled by useWidgetModeSwitch; the title capsule's own icon is the trigger. */
  open: boolean
  onClose: () => void
  plateRef: RefObject<HTMLDivElement | null>
}

const TRIGGER_SIZE = 32
const NUB_HEIGHT = 36 // matches the title row band that floats above the card
const PLATE_WIDTH = 56
const GAP = 10

/**
 * The floating plate a widget's title-icon button opens: a glass surface
 * that unfurls downward via `clip-path` to the widget's full height, listing
 * every mode besides the one already shown by that icon. It never overlaps
 * the card — it sits to the card's left, with a second, unclipped shadow
 * layer behind it throwing a shadow onto the widget (an element's own
 * box-shadow is clipped away by any clip-path on it, so that shadow has to
 * live on a sibling instead).
 */
export function WidgetModePill({ mode, options, onChange, hidden, open, onClose, plateRef }: WidgetModePillProps) {
  const resolved = resolveModeOptions(options, mode)
  if (!resolved) return null
  const { others } = resolved
  if (others.length === 0) return null
  const plateMinHeight = 16 + others.length * TRIGGER_SIZE + Math.max(0, others.length - 1) * 4

  return (
    <div
      ref={plateRef}
      inert={hidden || !open ? true : undefined}
      aria-hidden={hidden || !open || undefined}
      className={`gp-card-chrome absolute z-20 transition-opacity duration-200 ${
        hidden || !open ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'
      }`}
      style={{
        left: -(PLATE_WIDTH + GAP),
        top: -NUB_HEIGHT,
        width: PLATE_WIDTH + GAP,
        height: `max(calc(100% + ${NUB_HEIGHT}px), ${plateMinHeight}px)`,
      }}
    >
      <div aria-hidden className={`gp-mode-plate-shadow absolute bottom-0 left-0 top-0 ${open ? 'opacity-100' : 'opacity-0'}`} style={{ right: GAP }} />
      <div
        className="gp-mode-plate gp-glass gp-backplate absolute bottom-0 left-0 top-0 flex flex-col items-end gap-1 py-2 pl-4 pr-2"
        style={{
          right: GAP,
          clipPath: open ? 'inset(0px round var(--gp-r0))' : 'inset(0px 0px 100% 0px round var(--gp-r0))',
        }}
      >
        {others.map((option) => {
          const OptionIcon = option.icon
          return (
            <button
              key={option.value}
              type="button"
              title={option.label}
              aria-label={`Switch to ${option.label}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onChange(option.value)
                onClose()
              }}
              style={{ height: TRIGGER_SIZE, width: TRIGGER_SIZE }}
              className="gp-touch-target flex shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:text-neutral-200"
            >
              <OptionIcon size={13} aria-hidden />
            </button>
          )
        })}
      </div>
    </div>
  )
}
