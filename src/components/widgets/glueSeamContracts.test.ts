/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const layer = readFileSync(new URL('./GlueSeamLayer.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../canvas/CanvasViewport.tsx', import.meta.url), 'utf8')
const controls = readFileSync(new URL('../../styles/product/04-controls.css', import.meta.url), 'utf8')
const card = readFileSync(new URL('./WidgetCard.tsx', import.meta.url), 'utf8')

describe('glue welds replace the group backplate entirely', () => {
  it('ships no backplate, plate, or grouping surface anywhere', () => {
    for (const source of [layer, viewport, controls, card]) {
      expect(source).not.toContain('gp-group-backplate')
      expect(source).not.toContain('GroupPlate')
      expect(source).not.toContain('gp-grouped-widget')
    }
  })

  it('paints welds beneath the cards, one layer, world space', () => {
    // Seams under the glass: the weld shows only in the 0.3-cell gap while
    // its bleed hides beneath each card's opaque backplate.
    expect(viewport).toContain('<GlueSeamLayer />\n        <WidgetLayer />')
  })

  it('derives every weld from the shared cluster geometry', () => {
    expect(layer).toContain('glueSeamsForCluster(glue.widgetIds, widgets, maxGap)')
    // Glue never spans canvases; one member answers for the cluster.
    expect(layer).toContain("widgets[glue.widgetIds[0] ?? '']")
  })

  it('blends the two widgets\' accent colours across the weld', () => {
    expect(layer).toContain('widgetAccent(widget, widgetDefinition(widget.type))')
    expect(layer).toContain("seam.aFirst ? [accentA, accentB] : [accentB, accentA]")
  })

  it('draws the shape of the merge: bars for facing edges, patches for elbows', () => {
    expect(layer).toContain("seam.axis === 'x'")
    expect(layer).toContain("seam.axis === 'y'")
    // The corner patch angles its gradient along the actual diagonal.
    expect(layer).toContain("downRight ? '135deg' : '45deg'")
  })
})

describe('the weld preview mirrors the drop exactly', () => {
  it('previews against the snap position, not the cursor position', () => {
    expect(layer).toContain('position: glueIntent.position')
  })

  it('fades welds to a member being pulled free', () => {
    expect(layer).toContain('unglueIntentWidgetId === seam.aId || unglueIntentWidgetId === seam.bId')
    expect(controls).toContain('.gp-glue-seam[data-glue-fading]')
  })

  it('pulses the preview, and stands the pulse down under reduced motion', () => {
    expect(controls).toContain('.gp-glue-seam[data-glue-preview]')
    expect(controls).toContain('@keyframes gp-glue-preview-pulse')
    const reducedMotion = controls.slice(controls.indexOf('prefers-reduced-motion', controls.indexOf('gp-glue-seam')))
    expect(reducedMotion).toContain('.gp-glue-seam[data-glue-preview]')
  })

  it('marks the pulled-free card with the letting-go outline', () => {
    expect(card).toContain('data-unglue-intent={hasUnglueIntent || undefined}')
    expect(controls).toContain('.gp-widget-layout-motion[data-unglue-intent] .gp-widget-card')
  })
})
