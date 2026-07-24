import { memo, useMemo, useRef, type CSSProperties } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWidgetStore } from '../../store/useWidgetStore'
import { restingTileSize } from '../../utils/widgetRest'
import { lightweightWidgetPreviewImage } from '../../utils/widgetPreviewImage'

interface LightweightWidgetPreviewProps {
  widgetId: string
  resting: boolean
  interactive: boolean
  onActivate: (widgetId: string) => void
}

/**
 * One image and one positioning box replace the full widget subtree while a
 * card waits to hydrate. Far-zoom resting previews are pointer-transparent so
 * tiny controls can never steal a pan or selection gesture.
 */
export const LightweightWidgetPreview = memo(function LightweightWidgetPreview({
  widgetId,
  resting,
  interactive,
  onActivate,
}: LightweightWidgetPreviewProps) {
  // The visual is a genuine cache: live data changes do not rebuild it while
  // dormant. Only geometry stays subscribed, so remote moves remain aligned
  // without timers/text edits waking the preview subtree.
  const geometry = useWidgetStore(useShallow((state) => {
    const widget = state.widgets[widgetId]
    return widget
      ? {
          position: widget.position,
          size: widget.size,
          zIndex: widget.metadata.zIndex ?? 0,
        }
      : null
  }))
  const snapshotRef = useRef(useWidgetStore.getState().widgets[widgetId])
  const widget = snapshotRef.current
  const size = resting && widget ? restingTileSize(widget) : geometry?.size
  const src = useMemo(
    () => widget && size ? lightweightWidgetPreviewImage(widget, size) : '',
    // The image is intentionally frozen for this preview's mounted lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [widgetId, resting],
  )
  if (!widget || !geometry || !size || !src) return null

  const style = {
    transform: `translate3d(${geometry.position.x}px, ${geometry.position.y}px, 0)`,
    width: size.width,
    height: size.height,
    zIndex: geometry.zIndex,
    borderRadius: Math.min(22, Math.max(10, Math.min(size.width, size.height) * 0.18)),
    contain: 'strict',
    pointerEvents: interactive ? 'auto' : 'none',
  } satisfies CSSProperties
  const image = (
    <img
      alt=""
      aria-hidden
      draggable={false}
      decoding="async"
      src={src}
      className="block h-full w-full select-none object-fill"
    />
  )

  if (!interactive) {
    return (
      <div
        aria-hidden
        data-widget-preview={widgetId}
        data-preview-resting={resting || undefined}
        className="absolute left-0 top-0 overflow-hidden"
        style={style}
      >
        {image}
      </div>
    )
  }

  return (
    <button
      type="button"
      data-widget-preview={widgetId}
      data-preview-resting={resting || undefined}
      aria-label={`Load ${widget.title}`}
      title={widget.title}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onActivate(widgetId)
      }}
      className="absolute left-0 top-0 m-0 overflow-hidden border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
      style={style}
    >
      {image}
    </button>
  )
})
