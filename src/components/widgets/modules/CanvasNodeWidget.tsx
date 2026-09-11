import { FolderOpen, Network, Sparkles } from 'lucide-react'
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWidgetStore } from '../../../store/useWidgetStore'
import type { CanvasNodeData, ModuleData, Widget } from '../../../types/spatial'
import { dataWithSkinState, skinStateFor } from '../../../utils/widgetSkins'
import { openCanvasFromClick, type CanvasOpenModifiers } from '../../../utils/canvasOpenIntent'
import { WidgetSkinTrigger } from '../WidgetSkinTrigger'
import {
  canvasCoverState,
  canvasNodeSkin,
  canvasPreviewItems,
  summarizeCanvasNode,
  type CanvasNodeSkin,
} from './canvasNodeSkinModel'

/** How long a single click on the name waits to see if a second one follows. */
const DOUBLE_CLICK_MS = 260

/**
 * The slice of the workspace record this card can possibly draw from. Both
 * skin-model helpers already filter by canvasId, so subscribing to the whole
 * `widgets` record instead made every canvas card re-run two workspace-wide
 * scans and a localeCompare sort on every pointer-move frame of any drag
 * anywhere — `moveWidget` hands back a fresh record per delta. Paired with
 * `useShallow`, the entries here are shallow-equal whenever nothing on THIS
 * canvas moved, so the card sits out those frames entirely. Insertion order
 * is preserved, so `canvasPreviewItems`' slice picks the same members it did.
 */
export function canvasMembers(
  widgets: Record<string, Widget>,
  canvasId: string,
): Record<string, Widget> {
  const scoped: Record<string, Widget> = {}
  for (const [id, widget] of Object.entries(widgets)) {
    if (widget.canvasId === canvasId) scoped[id] = widget
  }
  return scoped
}

interface CanvasNodeWidgetProps {
  data: CanvasNodeData
  onChange?: (data: CanvasNodeData) => void
  onHeightChange?: (height: number) => void
  /**
   * How much wider (positive) or narrower (negative) the canvas name needs the
   * card to be. The card owns the snapping and the limits; this only measures.
   */
  onWidthChange?: (slack: number) => void
  skin?: CanvasNodeSkin
}

export function CanvasNodeWidget({
  data,
  onChange,
  onHeightChange,
  onWidthChange,
  skin: requestedSkin,
}: CanvasNodeWidgetProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [renaming, setRenaming] = useState(false)
  // A single click cannot commit to renaming until the double-click window has
  // passed, or every attempt to go in would drop a caret in the name first.
  const renameTimer = useRef(0)
  // The box the canvas name is laid into, and an inline span wrapping the text
  // itself. An inline box shrink-wraps its text, so the difference between the
  // two is the name's true overflow or slack — readable even when the visible
  // name is clipped to an ellipsis.
  const nameSlotRef = useRef<HTMLElement>(null)
  const nameTextRef = useRef<HTMLSpanElement>(null)
  const canvases = useWidgetStore((state) => state.canvases)
  const widgets = useWidgetStore(useShallow((state) => canvasMembers(state.widgets, data.canvasId)))
  const skin = requestedSkin ?? canvasNodeSkin(data.skin)
  const canvas = canvases[data.canvasId]
  const canvasName = canvas?.name ?? 'Canvas'
  const summary = useMemo(
    () => summarizeCanvasNode(data.canvasId, canvases, widgets),
    [canvases, data.canvasId, widgets],
  )
  const preview = useMemo(
    () => canvasPreviewItems(data.canvasId, widgets),
    [data.canvasId, widgets],
  )

  useLayoutEffect(() => {
    if (rootRef.current) onHeightChange?.(rootRef.current.scrollHeight)
  }, [onHeightChange, preview.length, skin, summary.widgetCount])

  // Portal is the one skin whose whole content IS the name, so it is the one
  // that fits its width to it. Cover's title is sized against the card itself
  // (a width change would resize the type, which would then ask for another
  // width), and the thumbnail's body is a board preview, not a line of text.
  //
  // The card is re-measured whenever its own box changes, not only when React
  // re-renders: a resize the card grants is itself the next measurement, and
  // without watching for it the very first measurement — taken before the
  // layout has a width at all — would be the only one that ever counted.
  // The card hands down a fresh callback each render; held in a ref so the
  // observer below is built once per skin rather than torn down every frame.
  const reportWidth = useRef(onWidthChange)
  reportWidth.current = onWidthChange

  useLayoutEffect(() => {
    if (skin !== 'portal') return
    const root = rootRef.current
    if (!root) return
    const measure = () => {
      const slot = nameSlotRef.current
      const text = nameTextRef.current
      // A zero-width slot means the layout has not resolved yet. Reporting
      // then would read the whole name as overflow and grow the card for it.
      if (!slot || !text || slot.clientWidth === 0) return
      // Both in LAYOUT pixels. A bounding rect would be in screen pixels —
      // scaled by the canvas zoom — and comparing one against the other made
      // the card grow a little more at every zoom level but 100%.
      const slack = text.offsetWidth - slot.clientWidth
      // Sub-pixel differences are text rendering, not a request for room.
      if (Math.abs(slack) >= 1) reportWidth.current?.(slack)
    }
    // Re-measuring straight inside the observer callback puts the next resize
    // in the same frame as the one that triggered it, and the browser drops
    // those follow-ups to break resize loops — leaving the card one step short
    // of fitting. Handing each pass to the next frame keeps every one of them.
    let frame = 0
    const remeasure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    measure()
    const observer = new ResizeObserver(remeasure)
    observer.observe(root)
    // A web font that lands after first paint changes the name's width without
    // changing any box, so nothing else would ask for the second measurement.
    document.fonts?.ready.then(remeasure).catch(() => undefined)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [canvasName, skin])

  const enter = (canvasId = data.canvasId, modifiers?: CanvasOpenModifiers) => {
    window.clearTimeout(renameTimer.current)
    openCanvasFromClick(canvasId, modifiers)
  }

  const commitName = (next: string) => {
    setRenaming(false)
    const trimmed = next.trim()
    if (trimmed && trimmed !== canvasName) {
      useWidgetStore.getState().renameCanvas(data.canvasId, trimmed)
    }
  }

  const updateCover = (patch: Partial<ReturnType<typeof canvasCoverState>>) => {
    if (!onChange) return
    const current = canvasCoverState(skinStateFor(data, 'cover'))
    onChange(dataWithSkinState(
      { ...data, skin } as ModuleData,
      'cover',
      { ...current, ...patch },
    ) as CanvasNodeData)
  }

  const openCanvas = (event: ReactMouseEvent) => {
    event.stopPropagation()
    enter(data.canvasId, event)
  }

  /**
   * Double-click anywhere on the card goes in — the card IS the door, so the
   * whole face answers, not one line of it. The exception is a field the user
   * is writing in, where a double-click means "select this word".
   */
  const openFromCardDoubleClick = (event: ReactMouseEvent) => {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
    openCanvas(event)
  }

  /**
   * The canvas's name, and the two things you can do to it: click once to
   * rename it in place, twice to go in. A single click cannot commit until the
   * double-click window has passed, or every attempt to enter would drop a
   * cursor into the name on the way. `className` keeps each skin's own type.
   */
  // A plain function, not a nested component: a component declared during
  // render is a NEW type every render, so React would remount the input and
  // the caret would jump out of it after the first keystroke.
  const renderName = ({
    className,
    slotRef,
    textRef,
  }: {
    className: string
    slotRef?: typeof nameSlotRef
    textRef?: typeof nameTextRef
  }) => {
    if (renaming) {
      return (
        <input
          className={`${className} gp-canvas-name-input`}
          aria-label="Canvas name"
          defaultValue={canvasName}
          autoFocus
          maxLength={80}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          // Opening with the name selected means typing replaces it, which is
          // what renaming almost always means; the caret is one arrow away.
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => commitName(event.currentTarget.value)}
          onKeyDown={(event) => {
            // The board's own shortcut layer is listening: without this, Enter
            // and Escape never reach the field that is supposed to own them.
            event.stopPropagation()
            if (event.key === 'Enter') commitName(event.currentTarget.value)
            if (event.key === 'Escape') setRenaming(false)
          }}
        />
      )
    }
    return (
      <strong
        ref={slotRef}
        className={className}
        title={canvasName}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          window.clearTimeout(renameTimer.current)
          renameTimer.current = window.setTimeout(() => setRenaming(true), DOUBLE_CLICK_MS)
        }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          window.clearTimeout(renameTimer.current)
          enter(data.canvasId, event)
        }}
      >
        <span ref={textRef}>{canvasName}</span>
      </strong>
    )
  }

  if (skin === 'cover') {
    const cover = canvasCoverState(skinStateFor(data, 'cover'))
    return (
      <div
        ref={rootRef}
        className="gp-canvas-node gp-canvas-node-cover"
        data-canvas-skin="cover"
        onDoubleClick={openFromCardDoubleClick}
      >
        <div className="gp-canvas-cover-orbit" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <header className="gp-canvas-cover-heading">
          <WidgetSkinTrigger className="gp-canvas-node-icon" fallbackIcon={FolderOpen} size={22} />
          {renderName({ className: 'gp-canvas-cover-title' })}
        </header>
        <textarea
          className="gp-canvas-cover-subtitle"
          aria-label="Canvas cover subtitle"
          value={cover.subtitle}
          placeholder="What lives inside this canvas?"
          maxLength={160}
          rows={2}
          onChange={(event) => updateCover({ subtitle: event.target.value })}
        />
      </div>
    )
  }

  if (skin === 'live_thumbnail') {
    return (
      <div
        ref={rootRef}
        className="gp-canvas-node gp-canvas-node-thumbnail"
        data-canvas-skin="live_thumbnail"
        onDoubleClick={openFromCardDoubleClick}
      >
        <header className="gp-canvas-node-heading">
          <WidgetSkinTrigger className="gp-canvas-node-icon" fallbackIcon={Network} size={20} />
          {renderName({ className: 'gp-canvas-node-title' })}
          <span className="gp-canvas-live-dot" title="Preview is current" />
        </header>
        <div className="gp-canvas-preview" aria-label={`${canvasName} preview`}>
          {preview.length === 0 ? (
            <div className="gp-canvas-preview-empty">
              <Sparkles size={18} aria-hidden />
            </div>
          ) : preview.map((item, index) => (
            <span
              key={item.id}
              className="gp-canvas-preview-card"
              data-completed={item.completed || undefined}
              style={{
                '--gp-preview-x': `${item.x}%`,
                '--gp-preview-y': `${item.y}%`,
                '--gp-preview-width': `${item.width}%`,
                '--gp-preview-height': `${item.height}%`,
                '--gp-preview-delay': `${Math.min(index, 8) * 18}ms`,
              } as CSSProperties}
            />
          ))}
          <span className="gp-canvas-preview-grid" aria-hidden />
        </div>
      </div>
    )
  }

  return (
    // The name is editable in place, so it can no longer sit inside a button —
    // a text field nested in one is invalid, and the button would eat the
    // caret. The arrow keeps the single-click way in; the card takes the
    // double-click.
    <div
      ref={rootRef}
      className="gp-canvas-node gp-canvas-node-portal"
      data-canvas-skin="portal"
      onDoubleClick={openFromCardDoubleClick}
    >
      <WidgetSkinTrigger className="gp-canvas-portal-glyph" fallbackIcon={FolderOpen} size={22}>
        <span aria-hidden />
      </WidgetSkinTrigger>
      <div className="gp-canvas-portal-link">
        {renderName({
          className: 'gp-canvas-portal-name',
          slotRef: nameSlotRef,
          textRef: nameTextRef,
        })}
      </div>
    </div>
  )
}
