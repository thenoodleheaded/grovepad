import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clampPopover } from '../../utils/popoverPosition'

interface ContextMenuSurfaceProps {
  /** Requested screen position; clamped into the visual viewport. */
  x: number
  y: number
  /** Estimated panel footprint used for clamping (matches prior inline math). */
  estimatedWidth: number
  estimatedHeight: number
  onClose: () => void
  /** Width/padding classes appended to the shared popup-menu panel classes. */
  panelClassName?: string
  children: ReactNode
}

/**
 * Shared right-click menu surface: full-screen close catcher (pointer or a
 * second context-click) under a viewport-clamped `gp-popup-menu` panel.
 */
export function ContextMenuSurface({
  x,
  y,
  estimatedWidth,
  estimatedHeight,
  onClose,
  panelClassName = 'w-52 p-1.5 max-h-[calc(100dvh-16px)]',
  children,
}: ContextMenuSurfaceProps) {
  const { x: left, y: top } = clampPopover(x, y, estimatedWidth, estimatedHeight, 8)
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40"
        onPointerDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <div
        className={`gp-popup-menu gp-menu gp-pop gp-panel fixed z-50 origin-top-left overflow-y-auto rounded-2xl shadow-2xl ${panelClassName}`}
        style={{ left, top }}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}
