import { memo, type CSSProperties, type MouseEvent } from 'react'
import { useWidgetStore } from '../../store/useWidgetStore'
import type { CanvasNodeData, Widget } from '../../types/spatial'
import { linkAnchorId } from '../../utils/linkTarget'
import { widgetDefinition } from '../../widgets/registry'

interface WidgetProxyProps {
  widget: Widget
  selected: boolean
  blocked: boolean
}

/**
 * Cheap spatial stand-in used below the map-mode zoom threshold, when a full
 * widget body would be unreadable. One shallow painted control: an icon and
 * the widget's name, scaled with container queries to fill its footprint.
 */
export const WidgetProxy = memo(function WidgetProxy({
  widget,
  selected,
  blocked,
}: WidgetProxyProps) {
  const definition = widgetDefinition(widget.type)
  const Icon = definition.icon

  const select = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const state = useWidgetStore.getState()
    const dependencySource = state.dependencyLinkSource
    if (dependencySource) {
      const prerequisiteId = linkAnchorId(state, dependencySource)
      const dependentId = linkAnchorId(state, widget.id)
      if (prerequisiteId !== dependentId) state.addRelation(prerequisiteId, dependentId, 'blocker')
      state.clearDependencyLink()
      return
    }
    const childSource = state.childLinkSource
    if (childSource) {
      const parentId = linkAnchorId(state, widget.id)
      const childId = linkAnchorId(state, childSource)
      if (parentId !== childId) state.addRelation(parentId, childId, 'parent')
      state.clearChildLink()
      return
    }
    state.selectWidget(widget.id, event.shiftKey)
  }

  const openMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const state = useWidgetStore.getState()
    if (!state.selectedIds.has(widget.id)) state.selectWidget(widget.id, false)
    state.openContextMenu(widget.id, event.clientX, event.clientY)
  }

  const openCanvas = (event: MouseEvent<HTMLButtonElement>) => {
    if (widget.type !== 'canvas_node') return
    event.preventDefault()
    event.stopPropagation()
    useWidgetStore
      .getState()
      .navigateToCanvas((widget.data as CanvasNodeData).canvasId)
  }

  const style = {
    '--gp-proxy-accent': definition.accent,
    transform: `translate(${widget.position.x}px, ${widget.position.y}px)`,
    width: widget.size.width,
    height: widget.size.height,
  } as CSSProperties

  return (
    <article
      data-widget-id={widget.id}
      className="gp-widget-proxy-shell"
      style={style}
    >
      <button
        type="button"
        data-selected={selected || undefined}
        data-blocked={blocked || undefined}
        aria-label={`${widget.title}, ${definition.label}`}
        aria-pressed={selected}
        title={widget.title}
        className="gp-widget-proxy gp-widget-proxy--map"
        onClick={select}
        onDoubleClick={openCanvas}
        onContextMenu={openMenu}
      >
        <span className="gp-widget-proxy__icon" aria-hidden>
          <Icon size="100%" strokeWidth={1.8} />
        </span>
        <span className="gp-widget-proxy__title">{widget.title}</span>
      </button>
    </article>
  )
})
