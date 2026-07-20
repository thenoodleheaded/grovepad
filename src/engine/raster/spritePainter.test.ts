import { describe, expect, it } from 'vitest'
import { DARK_SPRITE_THEME, paintSprites, type SpriteRegion } from './spritePainter'
import type { PrimitiveWidget } from '../../widgets/primitiveWidget'

function widget(id: string, x: number, y: number, overrides: Partial<PrimitiveWidget> = {}): PrimitiveWidget {
  return {
    id,
    type: 'notes',
    canvasId: 'c',
    title: `Widget ${id}`,
    x,
    y,
    width: 320,
    height: 160,
    expandedWidth: 320,
    expandedHeight: 160,
    flags: 0,
    zIndex: 0,
    accent: '#84cc16',
    badges: [],
    visual: { kind: 'text', primary: 'Some body text for the sprite', rows: [] },
    ...overrides,
  }
}

interface Call {
  op: string
  args: unknown[]
}

/** Recording stub of the 2D context surface the painter uses. */
function recordingCtx() {
  const calls: Call[] = []
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args })
    }
  return {
    calls,
    ctx: {
      clearRect: record('clearRect'),
      save: record('save'),
      restore: record('restore'),
      scale: record('scale'),
      translate: record('translate'),
      beginPath: record('beginPath'),
      roundRect: record('roundRect'),
      fill: record('fill'),
      stroke: record('stroke'),
      fillRect: record('fillRect'),
      fillText: record('fillText'),
      fillStyle: '' as string,
      strokeStyle: '' as string,
      lineWidth: 0,
      font: '',
      textBaseline: 'alphabetic' as CanvasTextBaseline,
      globalAlpha: 1,
    },
  }
}

const region: SpriteRegion = { x: 0, y: 0, width: 2000, height: 1000, paintZoom: 1, devicePixelRatio: 1 }

describe('sprite painter', () => {
  it('paints only widgets inside the region and reports the count', () => {
    const { ctx } = recordingCtx()
    const painted = paintSprites(
      ctx,
      [widget('in', 100, 100), widget('out', 5000, 5000)],
      region,
      DARK_SPRITE_THEME,
    )
    expect(painted).toBe(1)
  })

  it('draws title text at readable zoom and none at micro zoom', () => {
    const readable = recordingCtx()
    paintSprites(readable.ctx, [widget('a', 100, 100)], region, DARK_SPRITE_THEME)
    expect(readable.calls.some((call) => call.op === 'fillText')).toBe(true)

    const micro = recordingCtx()
    paintSprites(
      micro.ctx,
      [widget('a', 100, 100)],
      { ...region, paintZoom: 0.05 },
      DARK_SPRITE_THEME,
    )
    expect(micro.calls.some((call) => call.op === 'fillText')).toBe(false)
  })

  it('scales and translates the context to the region anchor', () => {
    const { ctx, calls } = recordingCtx()
    paintSprites(ctx, [], { x: 400, y: 300, width: 100, height: 100, paintZoom: 0.5, devicePixelRatio: 2 }, DARK_SPRITE_THEME)
    expect(calls.find((call) => call.op === 'scale')?.args).toEqual([1, 1])
    expect(calls.find((call) => call.op === 'translate')?.args).toEqual([-400, -300])
  })

  it('truncates long titles instead of overflowing the card', () => {
    const { calls, ctx } = recordingCtx()
    paintSprites(
      ctx,
      [widget('a', 100, 100, { title: 'An enormously long widget title that cannot possibly fit' })],
      region,
      DARK_SPRITE_THEME,
    )
    const title = calls.find((call) => call.op === 'fillText')?.args[0] as string
    expect(title.endsWith('…')).toBe(true)
  })
})
