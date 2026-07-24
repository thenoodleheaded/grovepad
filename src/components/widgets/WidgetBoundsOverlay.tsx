import type { ReactNode, SVGProps } from 'react'

// ---------------------------------------------------------------------------
// Every overlay a card paints onto its own outline goes through here — the
// clock bezel today, a progress rim or gauge tomorrow.
//
// Why it has to exist. A card's box *glides* between sizes: expanding from a
// resting tile, shrinking to an icon, snapping to the grid on resize release,
// undo/redo — all of it animates through `width`/`height` on
// `.gp-widget-layout-motion` (index.css). But the numbers a renderer draws
// from (`widget.size`, the resting tile) jump to the destination on the very
// frame the glide starts. An overlay sized in those numbers therefore paints
// the FINAL box on top of a box that is still mid-glide: the bezel hangs
// outside the card for the length of the transition and then snaps back in.
//
// The fix is to stop stating a pixel size at all. The geometry is declared in
// a `viewBox` and the element fills its box, so whatever size the card is
// being painted at on this frame is the size the overlay is drawn at. The
// card cannot clip its overflow (title capsule, badges and the detach button
// deliberately live outside it), so escaping the outline has to be made
// geometrically impossible rather than merely unlikely.
//
// The cost of that guarantee is that a glide between two different aspect
// ratios stretches the marks for its duration instead of jumping them. At
// rest the viewBox equals the box exactly, so nothing is ever distorted where
// anyone can study it.
// ---------------------------------------------------------------------------

type WidgetBoundsOverlayProps = Omit<
  SVGProps<SVGSVGElement>,
  'width' | 'height' | 'viewBox' | 'preserveAspectRatio'
> & {
  /** The card's own coordinate space — the box the geometry was solved for. */
  width: number
  height: number
  children: ReactNode
}

export function WidgetBoundsOverlay({
  width,
  height,
  className = '',
  children,
  ...rest
}: WidgetBoundsOverlayProps) {
  return (
    <svg
      aria-hidden
      {...rest}
      // No width/height attributes on purpose: sizing this in pixels is the
      // bug this component exists to prevent.
      viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`}
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    >
      {children}
    </svg>
  )
}
