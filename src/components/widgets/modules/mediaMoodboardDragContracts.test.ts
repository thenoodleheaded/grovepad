/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const media = readFileSync(new URL('./MediaWidget.tsx', import.meta.url), 'utf8')
const pointerDrag = readFileSync(new URL('../../../utils/pointerDrag.ts', import.meta.url), 'utf8')

/**
 * A moodboard tile drag ends on the figure's own pointerup — an event a
 * detached element can never fire. If the card unmounts mid-drag (a canvas
 * switch, an undo of its creation, a sync delete) the session is never ended,
 * and `data-widget-dragging` stays on <body> for the rest of the page's life:
 * `cursor: grabbing !important` on every element, and every widget's position
 * transition collapsed to zero. Nothing throws and only a reload clears it.
 *
 * There is no DOM in this suite to unmount anything in, so the teardown itself
 * is the contract.
 */
describe('moodboard tile drag cannot outlive its card', () => {
  it('ends the drag session on unmount', () => {
    expect(media).toMatch(
      /useEffect\(\(\) => \(\) => \{\s*dragRef\.current\?\.session\.end\(\)\s*dragRef\.current = null\s*\}, \[\]\)/,
    )
  })

  it('is the only thing that can clear the body flag the drag sets', () => {
    // The premise: the flag goes on at the drag threshold and comes off only
    // from end(). No global pointerup rescue exists, so a session that is
    // never ended leaves it set.
    expect(pointerDrag).toContain("document.body.setAttribute('data-widget-dragging', 'true')")
    expect(pointerDrag).toMatch(
      /end\(\): boolean \{\s*if \(this\.moved\) document\.body\.removeAttribute\('data-widget-dragging'\)/,
    )
  })
})
