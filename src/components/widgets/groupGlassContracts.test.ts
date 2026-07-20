/// <reference types="node" />

import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const groupPlate = readFileSync(new URL('./GroupPlate.tsx', import.meta.url), 'utf8')
const widgetCard = readFileSync(new URL('./WidgetCard.tsx', import.meta.url), 'utf8')
const widgetModePill = readFileSync(new URL('./WidgetModePill.tsx', import.meta.url), 'utf8')
const geometry = readFileSync(new URL('../../utils/groupGeometry.ts', import.meta.url), 'utf8')
const productCssDir = new URL('../../styles/product/', import.meta.url)
const productCss = readdirSync(productCssDir)
  .sort()
  .map((file) => readFileSync(new URL(file, productCssDir), 'utf8'))
  .join('\n')

describe('shared group glass contract', () => {
  it('renders one glass surface carved to the member-union silhouette', () => {
    // Still exactly one shared E0 surface (Article XIII) — carved by
    // clip-path to the union of member hover footprints, never rebuilt as
    // per-member glass or an elastic convex hull.
    expect(groupPlate).toContain('gp-glass gp-backplate gp-group-plate-shape gp-group-backplate-visual')
    expect(groupPlate).toContain('clipPath: `path("${plate.glassPath}")`')
    // The grab surface shares the silhouette so concave notches stay canvas.
    expect(groupPlate).toContain('clipPath: `path("${plate.hitPath}")`')
    // The SVG exists only to stroke the hairline along the clipped edge; the
    // glass paint itself stays CSS (no SVG gradients).
    expect(groupPlate).toContain('gp-group-plate-outline')
    expect(groupPlate).not.toContain('linearGradient')
    expect(groupPlate).not.toContain('convexHull')
    expect(groupPlate).not.toContain('shrinkWrapPath')
    expect(geometry).not.toContain('convexHull')
    expect(geometry).not.toContain('shrinkWrapPath')
    // Group geometry wraps the hover footprint (title row + button chrome),
    // sharing WidgetCard's own catch-all constants and its overflow test —
    // the extra half-cell of width only applies when there's a real button
    // spilling into it, on both the lone-card catch-all and the group plate.
    expect(geometry).toContain('widgetHoverRect')
    expect(geometry).toContain('widgetHasButtonOverflow')
    expect(widgetCard).toContain('top: -WIDGET_HOVER_TOP, left: 0, right: hasButtonOverflow ? -WIDGET_HOVER_RIGHT : 0')
  })

  it('switches grouped widgets from E0 glass to an E1 island', () => {
    expect(widgetCard).toContain("groupId ? 'gp-island gp-grouped-widget' : 'gp-glass gp-backplate'")
    expect(widgetCard).toContain('data-grouped={groupId || undefined}')
    expect(productCss).toContain('.gp-widget-card.gp-grouped-widget')
    expect(productCss).toContain(".gp-group-backplate[data-drop-target] .gp-group-plate-shape")
  })

  it('keeps title controls reachable across the space above a card', () => {
    expect(widgetCard).toContain('group/widget-shell')
    expect(widgetCard).toContain('gp-card-chrome pointer-events-none absolute bottom-full')
    expect(widgetCard).toContain("capsuleHidden ? 'pointer-events-none' : 'pointer-events-auto'")
    expect(widgetCard).toContain("isVisible ? 'pointer-events-auto' : 'pointer-events-none'")
    // The plate's own visibility is open-state driven (its trigger is the
    // title capsule's icon, not a hover reveal on the plate itself) — it
    // still must stay pointer-events-none whenever it isn't both visible and
    // open, so a closed plate can never leave an invisible-but-hit-testable
    // dead zone in the gutter beside the card (Article XIX).
    expect(widgetModePill).toContain("hidden || !open ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'")
    expect(widgetModePill).toContain('width: PLATE_WIDTH + GAP')
  })
})
