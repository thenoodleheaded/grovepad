/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Coffee, Hourglass, Timer } from 'lucide-react'
import { currentSkin, dataWearingSkin, skinsFor, splitSkins, widgetAccent } from '../../utils/widgetSkins'
import { ATLAS_TYPES } from '../../widgets/atlasCatalog'
import type { WidgetSkinOption } from '../../widgets/contracts/registry'
import {
  ANGLE_STEP,
  DRUM_RADIUS,
  ROW_HEIGHT,
  WHEEL_NOTCH,
  indexForOffset,
  isPastEnd,
  placeRow,
  resistOffset,
  rubberBand,
  settledOffset,
  stepSettle,
  wheelSteps,
} from './skinRollerGeometry'

const TIMEKEEPER_SKINS: readonly WidgetSkinOption[] = [
  { value: 'countdown', label: 'Countdown', icon: Timer, accent: '#86efac' },
  { value: 'pomodoro', label: 'Pomodoro', icon: Coffee, accent: '#fb7185' },
  { value: 'stopwatch', label: 'Stopwatch', icon: Hourglass, accent: '#7dd3fc' },
]

const timekeeperDef = { skins: TIMEKEEPER_SKINS, accent: '#86efac' }

function timekeeper(mode: string, accent?: string) {
  return { type: 'timekeeper' as const, data: { mode }, metadata: { accent } }
}

describe('which skins a card has', () => {
  it('puts the worn skin first and keeps the rest in declared order', () => {
    const split = splitSkins(TIMEKEEPER_SKINS, 'pomodoro')
    expect(split?.current.value).toBe('pomodoro')
    expect(split?.others.map((skin) => skin.value)).toEqual(['countdown', 'stopwatch'])
  })

  it('falls back to the first skin for stale or unknown data', () => {
    expect(currentSkin(timekeeper('not-a-real-skin'), timekeeperDef)?.value).toBe('countdown')
    expect(splitSkins([], 'anything')).toBeNull()
  })

  it('offers a widget with no skins nothing to roll through', () => {
    expect(skinsFor({ type: 'notes' }, {})).toEqual([])
    expect(currentSkin({ type: 'notes', data: {} }, {})).toBeNull()
  })

  it('treats every Atlas preset as a skin of the one Tracker card', () => {
    const skins = skinsFor({ type: 'tracker' }, {})
    expect(skins).toHaveLength(ATLAS_TYPES.length)
    expect(skins.every((skin) => skin.accent.startsWith('#'))).toBe(true)
  })

  it('keeps a snapshot of the Tracker preset being left behind', () => {
    const worn = { trackerMode: 'hydration', primary: 900, target: 2200, items: [], modeStates: {} }
    const next = dataWearingSkin({ type: 'tracker', data: worn }, 'sleep_ledger') as typeof worn
    expect(next.trackerMode).toBe('sleep_ledger')
    expect((next.modeStates as Record<string, unknown>).hydration).toMatchObject({ primary: 900 })
  })

  it('changes only the mode field for an ordinary widget', () => {
    const data = { mode: 'countdown', countdown: { durationSeconds: 300 } }
    expect(dataWearingSkin({ type: 'timekeeper', data }, 'stopwatch')).toEqual({
      mode: 'stopwatch',
      countdown: { durationSeconds: 300 },
    })
  })
})

describe('the colour a card wears', () => {
  it('takes the worn skin’s hue, so each skin reads as itself', () => {
    expect(widgetAccent(timekeeper('countdown'), timekeeperDef)).toBe('#86efac')
    expect(widgetAccent(timekeeper('pomodoro'), timekeeperDef)).toBe('#fb7185')
    expect(widgetAccent(timekeeper('stopwatch'), timekeeperDef)).toBe('#7dd3fc')
  })

  it('still lets a hand-picked accent on the card win', () => {
    expect(widgetAccent(timekeeper('pomodoro', '#ffffff'), timekeeperDef)).toBe('#ffffff')
  })

  it('falls back to the widget type’s accent when it has no skins', () => {
    expect(widgetAccent({ type: 'notes', data: {}, metadata: {} }, { accent: '#e2e8f0' })).toBe('#e2e8f0')
  })
})

describe('skin roller detents', () => {
  const count = TIMEKEEPER_SKINS.length

  it('puts one whole row of travel between neighbouring skins', () => {
    expect(indexForOffset(0, count)).toBe(0)
    expect(indexForOffset(ROW_HEIGHT, count)).toBe(1)
    expect(indexForOffset(ROW_HEIGHT * 2, count)).toBe(2)
  })

  it('switches the lane at the halfway point, not on release', () => {
    expect(indexForOffset(ROW_HEIGHT * 0.49, count)).toBe(0)
    expect(indexForOffset(ROW_HEIGHT * 0.51, count)).toBe(1)
  })

  it('never reports a skin that does not exist, however far it is pushed', () => {
    expect(indexForOffset(-9999, count)).toBe(0)
    expect(indexForOffset(9999, count)).toBe(count - 1)
    expect(indexForOffset(0, 0)).toBe(0)
  })

  it('settles onto the nearest whole row', () => {
    expect(settledOffset(ROW_HEIGHT * 1.4, count)).toBe(ROW_HEIGHT)
    expect(settledOffset(ROW_HEIGHT * 1.6, count)).toBe(ROW_HEIGHT * 2)
    expect(settledOffset(-40, count)).toBe(0)
  })
})

describe('scrolling steps one skin at a time', () => {
  it('banks small wheel movements until they add up to a whole row', () => {
    expect(wheelSteps(WHEEL_NOTCH - 1)).toEqual({ steps: 0, remainder: WHEEL_NOTCH - 1 })
    expect(wheelSteps(WHEEL_NOTCH)).toEqual({ steps: 1, remainder: 0 })
  })

  it('never skips a skin silently — leftovers carry to the next event', () => {
    const first = wheelSteps(WHEEL_NOTCH * 1.5)
    expect(first.steps).toBe(1)
    expect(wheelSteps(first.remainder + WHEEL_NOTCH * 0.5).steps).toBe(1)
  })

  it('steps backwards on an upward scroll', () => {
    expect(wheelSteps(-WHEEL_NOTCH).steps).toBe(-1)
    expect(wheelSteps(-WHEEL_NOTCH * 2).steps).toBe(-2)
  })
})

describe('skin roller ends', () => {
  const count = 2 // the shortest real list — Grade has exactly two skins

  it('stretches past the ends but never lets a full row through', () => {
    const pulled = resistOffset(-ROW_HEIGHT * 4, count)
    expect(pulled).toBeLessThan(0)
    expect(Math.abs(pulled)).toBeLessThan(ROW_HEIGHT)
  })

  it('gives more at first and less the harder it is pulled', () => {
    const gentle = rubberBand(20)
    const hard = rubberBand(200)
    expect(gentle).toBeGreaterThan(0)
    expect(hard).toBeGreaterThan(gentle)
    expect(hard - gentle).toBeLessThan(200 - 20)
  })

  it('leaves the middle of the list completely unresisted', () => {
    expect(resistOffset(ROW_HEIGHT * 0.5, 4)).toBe(ROW_HEIGHT * 0.5)
  })

  it('knows when it is past an end, so the limit tick fires once', () => {
    expect(isPastEnd(0, count)).toBe(false)
    expect(isPastEnd(ROW_HEIGHT, count)).toBe(false)
    expect(isPastEnd(-1, count)).toBe(true)
    expect(isPastEnd(ROW_HEIGHT + 1, count)).toBe(true)
  })
})

describe('skin roller barrel placement', () => {
  it('lays the selected row flat in the lane', () => {
    const place = placeRow(1, ROW_HEIGHT)
    expect(place.rotateX).toBe(0)
    expect(place.translateY).toBe(0)
    expect(place.opacity).toBe(1)
    expect(place.hidden).toBe(false)
  })

  it('rotates neighbours away by one angle step per row, in both directions', () => {
    expect(placeRow(0, ROW_HEIGHT).rotateX).toBe(ANGLE_STEP)
    expect(placeRow(2, ROW_HEIGHT).rotateX).toBe(-ANGLE_STEP)
  })

  it('turns rotation and flat travel into the same distance', () => {
    // Rows are flat faces of a barrel, so the face length — not the chord
    // through the barrel — is what has to equal one row.
    const face = 2 * DRUM_RADIUS * Math.tan((ANGLE_STEP * Math.PI) / 360)
    expect(face).toBeCloseTo(ROW_HEIGHT, 6)
  })

  it('fades rows out and drops them at the horizon', () => {
    const near = placeRow(2, 0)
    const far = placeRow(5, 0)
    expect(near.opacity).toBeGreaterThan(0)
    expect(near.opacity).toBeLessThan(1)
    expect(far.hidden).toBe(true)
    expect(far.opacity).toBe(0)
  })

  it('draws only a handful of rows even for the Tracker’s long list', () => {
    const drawn = ATLAS_TYPES.filter((_, index) => !placeRow(index, 0).hidden)
    expect(drawn.length).toBeLessThanOrEqual(6)
  })

  it('paints rows nearer the lane in front', () => {
    expect(placeRow(1, ROW_HEIGHT).zIndex).toBeGreaterThan(placeRow(2, ROW_HEIGHT).zIndex)
  })

  it('keeps the lane and its first three choices each way perfectly sharp', () => {
    for (let distance = 0; distance <= 3; distance += 1) {
      expect(placeRow(distance, 0).blur).toBe(0)
      expect(placeRow(0, distance * ROW_HEIGHT).blur).toBe(0)
    }
  })

  it('blurs gradually just past the third choice, then holds the full blur flat', () => {
    const ramping = placeRow(3.5, 0).blur
    const full = placeRow(4, 0).blur
    const beyond = placeRow(4.4, 0).blur
    expect(ramping).toBeGreaterThan(0)
    expect(ramping).toBeLessThan(full)
    // Past the ramp every row wears the same full blur — flat, not trailing off.
    expect(beyond).toBe(full)
  })
})

/**
 * The drag/click split cannot be reached without a DOM, and getting it wrong
 * is the difference between nudging the drum and committing a skin the user
 * never chose. These pin the two rules that keep them apart.
 */
describe('skin roller press arbitration source contract', () => {
  const roller = readFileSync(new URL('./WidgetSkinRoller.tsx', import.meta.url), 'utf8')

  it('ignores pointer travel inside the slop, so a jittery click never rolls', () => {
    expect(roller).toContain('if (drag.moved <= TAP_SLOP) return')
    expect(roller).toContain('drag.dragging = true')
  })

  it('never lets a press that became a drag end as a click', () => {
    expect(roller).toContain('if (drag.dragging) {')
    expect(roller).toContain('startSettle(settledOffset(offsetRef.current, count))')
  })

  it('remembers the row pressed, not the row released over', () => {
    expect(roller).toContain('pressedIndex: row ? Number(row.getAttribute(\'data-row-index\')) : null')
    expect(roller).toContain('const clicked = drag.pressedIndex ?? activeIndex')
  })

  it('takes the whole screen, so the board behind receives no mouse input', () => {
    expect(roller).toContain('className="gp-skin-roller-surface fixed inset-0')
    expect(roller).toContain('onPointerDown={onPointerDown}')
    expect(roller).toContain('onWheel={onWheel}')
  })

  it('keeps its events out of the widget card, which shares its React tree', () => {
    // The drum is portalled to <body>, but React bubbles synthetic events
    // through the component tree — without these stops, a press on the drum
    // starts a card drag that steals pointer capture mid-press.
    expect(roller.split('event.stopPropagation()').length).toBeGreaterThan(4)
  })

  it('rolls without transitions once open, so fast scrolling paints instantly', () => {
    expect(roller).toContain("const animatingPhase = phase !== 'open'")
    expect(roller).toContain('reducedMotion || !animatingPhase')
  })

  it('closes by fading the label and flying the icon home, never by refolding', () => {
    expect(roller).toContain('iconHomeRef')
    expect(roller).toContain('setFlight')
    expect(roller).toContain('LABEL_FADE_MS')
  })

  it('waits for a painted folded frame before unfurling', () => {
    // A CSS transition animates from the last *painted* state. A timeout can
    // fire before that first title-sized frame reaches the screen, and then
    // the drum appears at full size having animated nothing.
    expect(roller).toContain("requestAnimationFrame(() => setPhase('opening'))")
  })
})

/**
 * The chosen icon flies home to a slot the card is already filling with the
 * very same icon. If that slot does not stand aside, the flight lands on a
 * duplicate of itself — which reads as the drum snapping shut over the title.
 */
describe('skin roller icon handoff source contract', () => {
  const card = readFileSync(new URL('./WidgetCard.tsx', import.meta.url), 'utf8')
  const hook = readFileSync(new URL('./useWidgetSkinSwitch.ts', import.meta.url), 'utf8')

  it('empties the title icon slot for the length of the flight', () => {
    expect(hook).toContain('handingBack')
    expect(card).toContain("visibility: skinSwitch.handingBack ? 'hidden' : undefined")
    expect(card).toContain('skinSwitch.setHandingBack(true)')
  })

  it('gives the slot back once the roller has closed', () => {
    expect(card).toContain('skinSwitch.setHandingBack(false)')
  })
})

describe('skin roller settle', () => {
  it('closes on the target without ever passing it', () => {
    let offset = 0
    for (let frame = 0; frame < 60; frame += 1) {
      const next = stepSettle(offset, ROW_HEIGHT, 16)
      expect(next).toBeGreaterThanOrEqual(offset)
      expect(next).toBeLessThanOrEqual(ROW_HEIGHT)
      offset = next
    }
    expect(offset).toBe(ROW_HEIGHT)
  })

  it('arrives in about a tenth of a second of frames', () => {
    let offset = 0
    let frames = 0
    while (offset !== ROW_HEIGHT && frames < 600) {
      offset = stepSettle(offset, ROW_HEIGHT, 16)
      frames += 1
    }
    expect(frames).toBeLessThan(20)
  })

  it('covers the same ground whether frames are long or short', () => {
    let fast = 0
    for (let frame = 0; frame < 8; frame += 1) fast = stepSettle(fast, ROW_HEIGHT, 8)
    let slow = stepSettle(0, ROW_HEIGHT, 32)
    slow = stepSettle(slow, ROW_HEIGHT, 32)
    expect(fast).toBeCloseTo(slow, 0)
  })

  it('runs backwards just as well', () => {
    const next = stepSettle(ROW_HEIGHT, 0, 16)
    expect(next).toBeLessThan(ROW_HEIGHT)
    expect(next).toBeGreaterThanOrEqual(0)
  })
})
