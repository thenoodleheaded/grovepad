import { afterEach, describe, expect, it, vi } from 'vitest'
import { composePanelFloors, contentFitHeight, contentStretchesToFill, hasSignificantVerticalOverflow, inFlowScrollHeight, naturalContentHeight, verticalContentFloor } from './widgetContentFloor'

/** A stub element carrying just the fields naturalContentHeight reads. */
function fakeChild(offsetHeight: number, opts: { position?: string; marginTop?: number; marginBottom?: number; flexGrow?: number; height?: string; offsetTop?: number } = {}) {
  return {
    offsetHeight,
    offsetTop: opts.offsetTop ?? 0,
    __style: {
      position: opts.position ?? 'static',
      marginTop: `${opts.marginTop ?? 0}px`,
      marginBottom: `${opts.marginBottom ?? 0}px`,
      flexGrow: `${opts.flexGrow ?? 0}`,
      height: opts.height ?? 'auto',
      display: 'block',
      paddingBottom: '0px',
    },
  } as unknown as HTMLElement
}

function fakeUi(children: HTMLElement[], opts: { scrollHeight?: number } = {}) {
  const ui = {
    children,
    offsetTop: 0,
    scrollHeight: opts.scrollHeight ?? 0,
    __style: {
      position: 'relative',
      display: 'block',
      paddingBottom: '0px',
      marginTop: '0px',
      marginBottom: '0px',
      flexGrow: '0',
      height: 'auto',
    },
  } as unknown as HTMLElement
  // The children name this box as their offsetParent, which is what lets their
  // offsetTop be read as a distance inside it.
  for (const child of children) (child as unknown as { offsetParent: unknown }).offsetParent = ui
  return ui
}

describe('widget content floors', () => {
  it('adds side-by-side panels and stacks vertical panels', () => {
    const panels = [{ width: 120, height: 80 }, { width: 180, height: 120 }]
    expect(composePanelFloors(panels, 'row', 8, 24, 24)).toEqual({ width: 332, height: 144 })
    expect(composePanelFloors(panels, 'column', 8, 24, 24)).toEqual({ width: 204, height: 232 })
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

  describe('whether a card can hold a void at all', () => {
    afterEach(() => vi.unstubAllGlobals())
    const withStyleStub = (fn: () => void) => {
      vi.stubGlobal('getComputedStyle', (el: HTMLElement & { __style?: Record<string, string> }) => el.__style)
      fn()
    }

    it('reads a stack of fixed-height pieces as having its own intrinsic height', () => {
      // Rows, stat tiles, buttons: taller than their sum is empty space.
      withStyleStub(() => {
        expect(contentStretchesToFill(fakeUi([fakeChild(40), fakeChild(60), fakeChild(32)]))).toBe(false)
      })
    })

    it('reads a flex-growing region as having no intrinsic height', () => {
      // An internal scroll panel or a chart uses whatever height it is given,
      // so "too tall" is not a thing that can happen to it.
      withStyleStub(() => {
        expect(contentStretchesToFill(fakeUi([fakeChild(40), fakeChild(200, { flexGrow: 1 })]))).toBe(true)
      })
    })

    it('ignores floating chrome, which never fills anything', () => {
      withStyleStub(() => {
        expect(contentStretchesToFill(fakeUi([
          fakeChild(40),
          fakeChild(999, { position: 'absolute', flexGrow: 1 }),
        ]))).toBe(false)
      })
    })
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

  /**
   * The height a card may grow to fit. Raw scrollHeight counts chrome a skin
   * hangs BENEATH the card (Sticky's colour strip sits at `top: 100%`), and a
   * card can never grow to cover something anchored to its own bottom edge:
   * every grow moves it down by what was gained. That fed both the auto-height
   * pass and the published live floor, so the card climbed to the maximum edge
   * and clamped even correct shrink requests back up on arrival.
   */
  describe('in-flow scroll height (what the card may grow to fit)', () => {
    afterEach(() => vi.unstubAllGlobals())

    const withStyleStub = (fn: () => void) => {
      vi.stubGlobal('getComputedStyle', (el: HTMLElement & { __style?: Record<string, string> }) => el.__style)
      fn()
    }

    it('leaves out chrome hung beneath the card, which no card can ever catch', () => {
      withStyleStub(() => {
        // A Sticky: 116px of writing, with the 26px colour strip anchored
        // below the card at 195. Raw scrollHeight would read 221.
        const ui = fakeUi(
          [fakeChild(116), fakeChild(26, { position: 'absolute', offsetTop: 195 })],
          { scrollHeight: 221 },
        )
        expect(inFlowScrollHeight(ui)).toBe(116)
      })
    })

    it('still reports an in-flow child that genuinely overflows, so real overflow still grows', () => {
      withStyleStub(() => {
        const ui = fakeUi([fakeChild(40), fakeChild(300, { offsetTop: 40 })], { scrollHeight: 340 })
        expect(inFlowScrollHeight(ui)).toBe(340)
      })
    })

    it('counts the lowest edge, not the sum, so stacked children are not double counted', () => {
      withStyleStub(() => {
        const ui = fakeUi([fakeChild(28), fakeChild(84, { offsetTop: 28, marginBottom: 4 })])
        expect(inFlowScrollHeight(ui)).toBe(116)
      })
    })

    it('skips a hidden child rather than reserving room for it', () => {
      withStyleStub(() => {
        const hidden = fakeChild(200, { offsetTop: 100 })
        ;(hidden as unknown as { __style: Record<string, string> }).__style.display = 'none'
        const ui = fakeUi([fakeChild(90), hidden], { scrollHeight: 300 })
        expect(inFlowScrollHeight(ui)).toBe(90)
      })
    })

    it('falls back to scrollHeight when there is no in-flow child to measure', () => {
      withStyleStub(() => {
        // A renderer whose content is bare text nodes still has a height.
        const ui = fakeUi([fakeChild(20, { position: 'absolute' })], { scrollHeight: 64 })
        expect(inFlowScrollHeight(ui)).toBe(64)
      })
    })
  })
})
