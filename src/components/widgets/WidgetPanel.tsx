import { forwardRef, type CSSProperties, type ReactNode } from 'react'
import { GripVertical } from 'lucide-react'
import type { IslandSizing } from './FocusModeLayer'

interface WidgetPanelProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Per-panel drag button — grabbing it drags the whole widget. */
  grip?: boolean
  /** Plays the exit animation; the caller removes the panel ~130ms later. */
  removing?: boolean
  /** Stable island id for focus-mode layout persistence (XVIII.1). */
  island?: string
  /** Sizing charter class — how focus mode may scale this island. */
  sizing?: IslandSizing
  /** Optional widget-specific bounds. They may only tighten the global charter. */
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}

/**
 * One glass subdivision of a multi-panel widget. Each panel is its own
 * squircle plate with its own backing; panels keep an 8px seam so they read
 * as separate, calm glass surfaces inside one widget. A panel is never
 * shorter than 32px (0.8 cells).
 *
 * The grip is intentionally NOT a button: WidgetCard treats non-interactive
 * targets as drag surface, so grabbing any panel's grip moves the entire
 * widget as a single unit.
 */
export const WidgetPanel = forwardRef<HTMLDivElement, WidgetPanelProps>(function WidgetPanel({
  children,
  className = '',
  style,
  grip = true,
  removing = false,
  island,
  sizing,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
}, ref) {
  return (
    <div
      ref={ref}
      data-island={island}
      data-island-size={sizing}
      data-island-min-w={minWidth}
      data-island-min-h={minHeight}
      data-island-max-w={maxWidth}
      data-island-max-h={maxHeight}
      className={`gp-island gp-subpanel ${removing ? 'gp-subpanel-exit' : 'gp-subpanel-enter'} ${className}`}
      style={style}
    >
      {grip && (
        <span
          role="presentation"
          title="Drag widget"
          aria-hidden
          className="gp-subpanel-grip"
        >
          <GripVertical size={9} aria-hidden />
        </span>
      )}
      {children}
    </div>
  )
})

/** Delay (ms) between starting a panel's exit animation and removing it. */
export const PANEL_EXIT_MS = 130
