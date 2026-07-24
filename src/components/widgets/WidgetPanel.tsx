import {
  forwardRef,
  type CSSProperties,
  type ReactNode,
  type TransitionEventHandler,
} from 'react'
import { GripVertical } from 'lucide-react'
import type { PanelFloorClass } from '../../utils/widgetContentFloor'

interface WidgetPanelProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Per-panel drag button — grabbing it drags the whole widget. */
  grip?: boolean
  /** Plays the exit animation; `onExitComplete` finalizes its data removal. */
  removing?: boolean
  /** Finalize removal from the CSS transition itself, not from a guessed timer. */
  onExitComplete?: () => void
  /** Optional widget-specific floor bounds. */
  minWidth?: number
  minHeight?: number
  /** How this panel contributes to the full card's content-derived floor. */
  floor?: PanelFloorClass
  /** Deliberate internal scrolling: overflow here does not grow the card. */
  allowOverflow?: boolean
}

/**
 * One glass subdivision of a multi-panel widget — an E1 island on the
 * card's backplate. Panels keep an 8px seam and are never shorter than 32px
 * (0.8 cells).
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
  onExitComplete,
  minWidth,
  minHeight,
  floor,
  allowOverflow = false,
}, ref) {
  return (
    <div
      ref={ref}
      data-floor-panel={floor ?? 'reflow'}
      data-floor-min-w={minWidth}
      data-floor-min-h={minHeight}
      data-floor-overflow={allowOverflow ? 'scroll' : undefined}
      className={`gp-island gp-subpanel ${removing ? 'gp-subpanel-exit' : 'gp-subpanel-enter'} ${className}`}
      style={style}
      onTransitionEnd={onExitComplete ? ((event) => {
        if (event.target === event.currentTarget && event.propertyName === 'opacity') {
          onExitComplete()
        }
      }) satisfies TransitionEventHandler<HTMLDivElement> : undefined}
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
