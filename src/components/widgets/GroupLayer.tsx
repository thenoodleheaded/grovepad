import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWidgetStore } from '../../store/useWidgetStore'
import { rectsIntersect } from '../../utils/canvasView'
import { groupWorldBounds } from '../../utils/groupGeometry'
import { useQuantizedView } from '../../hooks/useQuantizedView'
import { GroupPlate } from './GroupPlate'

const GROUP_OVERSCAN_SCREEN = 520

/** World-space layer that renders visible GroupPlate bands below widgets. */
export function GroupLayer() {
  const { groups, widgets, activeCanvasId } = useWidgetStore(
    useShallow((state) => ({
      groups: state.groups,
      widgets: state.widgets,
      activeCanvasId: state.activeCanvasId,
    })),
  )
  const view = useQuantizedView(GROUP_OVERSCAN_SCREEN)

  const visibleGroups = useMemo(() => {
    return Object.values(groups).filter((group) => {
      // Group membership never spans canvases — checking one member suffices.
      const anchor = widgets[group.widgetIds[0] ?? '']
      if (!anchor || anchor.canvasId !== activeCanvasId) return false
      const bounds = groupWorldBounds(group, widgets)
      return bounds ? rectsIntersect(bounds, view.rect) : false
    })
  }, [activeCanvasId, groups, view.rect, widgets])

  if (visibleGroups.length === 0) return null

  return (
    <div className="absolute left-0 top-0">
      {visibleGroups.map((group) => (
        <GroupPlate key={group.id} group={group} />
      ))}
    </div>
  )
}
