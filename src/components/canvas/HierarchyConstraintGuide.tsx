import { useDragDisplacementStore } from '../../store/dragDisplacement'
import type { HierarchyBoundaryGuide } from '../../store/hierarchyGuide'

export function HierarchyConstraintGuide() {
  const guide = useDragDisplacementStore((state) => state.hierarchyGuide)
  if (!guide) return null
  return <HierarchyConstraintGuideGraphic guide={guide} />
}

export function HierarchyConstraintGuideGraphic({
  guide,
}: {
  guide: HierarchyBoundaryGuide
}) {
  return (
    <svg
      aria-hidden
      data-hierarchy-constraint-guide
      className="pointer-events-none absolute left-0 top-0 z-[4] overflow-visible"
      width="1"
      height="1"
    >
      <line
        x1={guide.x1}
        x2={guide.x2}
        y1={guide.y}
        y2={guide.y}
        className="gp-hierarchy-guide-line"
      />
      <line
        x1={guide.x1}
        x2={guide.x1}
        y1={guide.y - 6}
        y2={guide.y + 6}
        className="gp-hierarchy-guide-cap"
      />
      <line
        x1={guide.x2}
        x2={guide.x2}
        y1={guide.y - 6}
        y2={guide.y + 6}
        className="gp-hierarchy-guide-cap"
      />
    </svg>
  )
}
