import { afterEach, describe, expect, it, vi } from 'vitest'
import { composePanelFloors, contentFitHeight, hasSignificantVerticalOverflow, naturalContentHeight, panelClassForIsland, verticalContentFloor } from './widgetContentFloor'

/** A stub element carrying just the fields naturalContentHeight reads. */
function fakeChild(offsetHeight: number, opts: { position?: string; marginTop?: number; marginBottom?: number } = {}) {
  return {
    offsetHeight,
    __style: {
      position: opts.position ?? 'static',
      marginTop: `${opts.marginTop ?? 0}px`,
      marginBottom: `${opts.marginBottom ?? 0}px`,
    },
  } as unknown as HTMLElement
}

function fakeUi(children: HTMLElement[]) {
  return { children } as unknown as HTMLElement
}

describe('widget content floors', () => {
  it('adds side-by-side panels and stacks vertical panels', () => {
    const panels = [{ width: 120, height: 80 }, { width: 180, height: 120 }]
    expect(composePanelFloors(panels, 'row', 8, 24, 24)).toEqual({ width: 332, height: 144 })
    expect(composePanelFloors(panels, 'column', 8, 24, 24)).toEqual({ width: 204, height: 232 })
  })

  it('maps focus island behavior to the matching whole-card floor class', () => {
    expect(panelClassForIsland('free')).toBe('reflow')
    expect(panelClassForIsland('width')).toBe('controls')
    expect(panelClassForIsland('aspect')).toBe('rigid')
    expect(panelClassForIsland('fixed')).toBe('rigid')
  })

  it('ignores sub-grid overflow noise that would otherwise cause grow loops', () => {
    expect(hasSignificantVerticalOverflow(4)).toBe(false)
    expect(hasSignificantVerticalOverflow(4.01)).toBe(true)
  })

  it('derives an idempotent height from content instead of repeatedly adding overflow', () => {
    expect(verticalContentFloor(450, 190)).toBe(476)
    expect(verticalContentFloor(450, 190)).toBe(476)
    expect(verticalContentFloor(470, 190, 120, 0)).toBe(472)
    expect(verticalContentFloor(260, 4, 280)).toBe(280)
  })

  it('shrinks auto-height cards from a stale default to their content-owned grid height', () => {
    expect(contentFitHeight(48, 120)).toBe(120)
    expect(contentFitHeight(121, 120)).toBe(160)
    expect(contentFitHeight(121, 120, 140)).toBe(140)
  })

  describe('natural content height (load-time void reclaim)', () => {
    afterEach(() => vi.unstubAllGlobals())

    // naturalContentHeight reads offsetHeight (layout px, unaffected by a
    // stretched container or canvas zoom) instead of the circular scrollHeight.
    const withStyleStub = (fn: () => void) => {
      vi.stubGlobal('getComputedStyle', (el: HTMLElement & { __style?: Record<string, string> }) => el.__style)
      fn()
    }

    it('sums the flow children so a compact stack reports its true short height', () => {
      withStyleStub(() => {
        // hero 112 + tiles 56 + writable 61 + command band 44 = 273 of real content
        const ui = fakeUi([fakeChild(112), fakeChild(56), fakeChild(61), fakeChild(44)])
        expect(naturalContentHeight(ui)).toBe(273)
      })
    })

    it('adds vertical margins between stacked children', () => {
      withStyleStub(() => {
        const ui = fakeUi([fakeChild(100, { marginBottom: 12 }), fakeChild(80, { marginTop: 12 })])
        expect(naturalContentHeight(ui)).toBe(204)
      })
    })

    it('ignores absolutely positioned chrome such as the drag grip and port rails', () => {
      withStyleStub(() => {
        const ui = fakeUi([fakeChild(120), fakeChild(9, { position: 'absolute' }), fakeChild(40, { position: 'fixed' })])
        expect(naturalContentHeight(ui)).toBe(120)
      })
    })
  })
})
