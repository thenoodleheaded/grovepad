import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  HierarchyConstraintGuide,
  HierarchyConstraintGuideGraphic,
} from './HierarchyConstraintGuide'

describe('HierarchyConstraintGuide', () => {
  it('renders the full edge-to-edge ruler and both end caps', () => {
    const markup = renderToStaticMarkup(
      <HierarchyConstraintGuideGraphic
        guide={{
        childId: 'child',
        guardianId: 'parent',
        x1: 80,
        x2: 520,
        y: 240,
        }}
      />,
    )
    expect(markup).toContain('data-hierarchy-constraint-guide="true"')
    expect(markup).toContain('x1="80" x2="520" y1="240" y2="240"')
    expect(markup.match(/gp-hierarchy-guide-cap/g)).toHaveLength(2)
  })

  it('renders nothing when no strict boundary is nearby', () => {
    expect(renderToStaticMarkup(<HierarchyConstraintGuide />)).toBe('')
  })
})
