/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const widget = readFileSync(new URL('./CanvasNodeWidget.tsx', import.meta.url), 'utf8')
const skins = readFileSync(new URL('../../../styles/product/10-canvas-node-skins.css', import.meta.url), 'utf8')
const card = readFileSync(new URL('../WidgetCard.tsx', import.meta.url), 'utf8')
const registry = readFileSync(new URL('../../../widgets/registry/structureNotesWidgets.ts', import.meta.url), 'utf8')

/**
 * A Portal canvas card has no content but the canvas's name, so its width is
 * that name's width, snapped up to the grid. Three pieces have to agree for
 * that to hold, and no test in this suite can see whether they do: the widths
 * involved are layout facts, and there is no DOM here to lay anything out.
 *
 * The bug these guard against is silent and one-directional. The renderer
 * reports the DIFFERENCE between the room the name is given and the room it
 * needs; if the box that gives the room shrink-wraps its own text instead of
 * filling the card, that difference is zero for every name that fits. The card
 * then only ever sees overflow — it grows for a long name and can never come
 * back in for a short one — and every canvas card sits in a box sized by its
 * default rather than by its name. Nothing throws, nothing logs, and the cards
 * look merely roomy.
 */
describe('canvas portal card fits its width to the canvas name', () => {
  it('gives the name slot a filling flex basis, so slack is measurable at all', () => {
    // `flex: 1 1 auto` is the whole contract: this box must be the room the
    // card OFFERS, never the room the text happens to take. A flex item's
    // default `0 1 auto` shrink-wraps, which makes slot and text the same
    // number and the measurement below always report 0.
    expect(skins).toMatch(/\.gp-canvas-portal-name \{[^}]*flex: 1 1 auto;/)
  })

  it('measures the offered box against an inline span that shrink-wraps the name', () => {
    // The pairing is what makes an overflowing name measurable: the visible
    // name is clipped to an ellipsis at the slot, while the span inside still
    // reports the name's true width.
    expect(widget).toContain('const slack = text.offsetWidth - slot.clientWidth')
    expect(widget).toContain('<span ref={textRef}>{canvasName}</span>')
    // Layout pixels on both sides. A getBoundingClientRect() here would be in
    // screen pixels — multiplied by the canvas zoom — and the card would fit
    // to a different width at every zoom level but 100%.
    expect(widget).not.toMatch(/const slack = [^\n]*getBoundingClientRect/)
  })

  it('reports slack in both directions, not overflow only', () => {
    // The absolute value is the point: a negative slack is a card that has
    // outgrown its name and has to come back in.
    expect(widget).toContain('if (Math.abs(slack) >= 1) reportWidth.current?.(slack)')
  })

  it('leaves the snapping and the limits to the card, which rounds up to the grid', () => {
    expect(card).toContain('Math.ceil((current.size.width + slack) / GRID_SIZE) * GRID_SIZE')
  })

  it('keeps the type declaring autoWidth, or the card ignores the report', () => {
    // handleWidthChange returns early without this, so the whole chain above
    // becomes dead measurement.
    expect(registry).toMatch(/canvas_node:[\s\S]*?sizing: \{[\s\S]*?autoWidth: true/)
  })
})
