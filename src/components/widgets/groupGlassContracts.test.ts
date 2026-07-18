/// <reference types="node" />

import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const groupPlate = readFileSync(new URL('./GroupPlate.tsx', import.meta.url), 'utf8')
const widgetCard = readFileSync(new URL('./WidgetCard.tsx', import.meta.url), 'utf8')
const geometry = readFileSync(new URL('../../utils/groupGeometry.ts', import.meta.url), 'utf8')
const productCssDir = new URL('../../styles/product/', import.meta.url)
const productCss = readdirSync(productCssDir)
  .sort()
  .map((file) => readFileSync(new URL(file, productCssDir), 'utf8'))
  .join('\n')

describe('shared group glass contract', () => {
  it('renders one standard backplate without elastic SVG geometry', () => {
    expect(groupPlate).toContain('gp-glass gp-backplate gp-group-backplate-visual')
    expect(groupPlate).toContain('style={{ inset: GRID_SIZE / 2 }}')
    expect(groupPlate).not.toContain('<svg')
    expect(groupPlate).not.toContain('<path')
    expect(groupPlate).not.toContain('linearGradient')
    expect(groupPlate).not.toContain('convexHull')
    expect(groupPlate).not.toContain('shrinkWrapPath')
    expect(geometry).not.toContain('convexHull')
    expect(geometry).not.toContain('shrinkWrapPath')
  })

  it('switches grouped widgets from E0 glass to an E1 island', () => {
    expect(widgetCard).toContain("groupId ? 'gp-island gp-grouped-widget' : 'gp-glass gp-backplate'")
    expect(widgetCard).toContain('data-grouped={groupId || undefined}')
    expect(productCss).toContain('.gp-widget-card.gp-grouped-widget')
    expect(productCss).toContain('.gp-group-backplate[data-drop-target] > .gp-group-backplate-visual')
  })

  it('keeps title controls reachable across the space above a card', () => {
    expect(widgetCard).toContain('group/widget-shell')
    expect(widgetCard).toContain('gp-card-chrome pointer-events-auto')
    expect(widgetCard).toContain('group-hover/widget-shell:pointer-events-auto')
    expect(widgetCard).toContain('group-hover/widget-shell:opacity-100')
  })
})
