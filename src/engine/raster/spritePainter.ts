import type { PrimitiveWidget } from '../../widgets/primitiveWidget'

// ---------------------------------------------------------------------------
// Sprite painter (canvas engine contract §3, tier T2).
//
// Paints simplified card sprites from PrimitiveWidget projections onto a 2D
// context. Pure with respect to its inputs and callable from the raster
// worker (OffscreenCanvas), the main thread, and tests (recording stub ctx).
//
// A sprite is deliberately the CHEAP portrait of a card — backplate, title,
// accent chip, row hints — not a pixel copy of the DOM. During motion the
// compositor scales these bitmaps (softness is the ratified trade); at
// settle the DOM ring re-covers the viewport with crisp live cards.
// ---------------------------------------------------------------------------

export interface SpriteRegion {
  /** World-space rect this canvas covers. */
  x: number
  y: number
  width: number
  height: number
  /** World→bitmap scale the region was painted at. */
  paintZoom: number
  /** Extra device scale (DPR) baked into the bitmap. */
  devicePixelRatio: number
}

export interface SpriteTheme {
  cardFill: string
  cardStroke: string
  titleColor: string
  rowColor: string
  doneColor: string
  pillFill: string
}

export const DARK_SPRITE_THEME: SpriteTheme = {
  cardFill: '#171a18',
  cardStroke: 'rgba(255,255,255,0.09)',
  titleColor: 'rgba(235,235,235,0.92)',
  rowColor: 'rgba(163,163,163,0.75)',
  doneColor: 'rgba(110,231,183,0.8)',
  pillFill: '#1d211e',
}

/** Below this painted width a card is a flat accent-tinted chip — matching
 * what the eye can resolve, not degrading what it could read. */
const MICRO_WIDTH_PX = 26

type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | 'clearRect'
  | 'save'
  | 'restore'
  | 'scale'
  | 'translate'
  | 'beginPath'
  | 'roundRect'
  | 'fill'
  | 'stroke'
  | 'fillRect'
  | 'fillText'
> & {
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  font: string
  textBaseline: CanvasTextBaseline
  globalAlpha: number
}

function paintCard(ctx: Ctx2D, widget: PrimitiveWidget, zoom: number, theme: SpriteTheme): void {
  const w = widget.width
  const h = widget.height
  const paintedWidth = w * zoom

  if (paintedWidth < MICRO_WIDTH_PX) {
    // Micro tier: one soft accent chip. Still the card's real footprint.
    ctx.globalAlpha = 0.85
    ctx.fillStyle = theme.pillFill
    ctx.beginPath()
    ctx.roundRect(widget.x, widget.y, w, h, Math.min(12, h / 3))
    ctx.fill()
    ctx.globalAlpha = 0.9
    ctx.fillStyle = widget.accent
    ctx.beginPath()
    ctx.roundRect(widget.x, widget.y, w, Math.min(6 / zoom, h), Math.min(12, h / 3))
    ctx.fill()
    ctx.globalAlpha = 1
    return
  }

  const radius = Math.min(22, w / 4, h / 4)
  ctx.fillStyle = theme.cardFill
  ctx.strokeStyle = theme.cardStroke
  ctx.lineWidth = 1 / zoom
  ctx.beginPath()
  ctx.roundRect(widget.x, widget.y, w, h, radius)
  ctx.fill()
  ctx.stroke()

  // Accent chip where the type icon sits on the real card.
  const pad = Math.min(14, w * 0.06)
  const chip = Math.min(18, h * 0.2)
  ctx.globalAlpha = 0.9
  ctx.fillStyle = widget.accent
  ctx.beginPath()
  ctx.roundRect(widget.x + pad, widget.y + pad, chip, chip, chip * 0.3)
  ctx.fill()
  ctx.globalAlpha = 1

  // Title + row hints only when the paint resolution can actually show them.
  if (paintedWidth >= 70) {
    const titleSize = Math.min(15, Math.max(11, h * 0.11))
    ctx.font = `600 ${titleSize}px 'Clash Display', sans-serif`
    ctx.textBaseline = 'middle'
    ctx.fillStyle = theme.titleColor
    const titleX = widget.x + pad + chip + pad * 0.6
    const maxTitleChars = Math.max(3, Math.floor((w - (titleX - widget.x) - pad) / (titleSize * 0.56)))
    ctx.fillText(
      widget.title.length > maxTitleChars ? `${widget.title.slice(0, maxTitleChars - 1)}…` : widget.title,
      titleX,
      widget.y + pad + chip / 2,
    )

    const rowSize = Math.max(9, titleSize * 0.8)
    ctx.font = `400 ${rowSize}px 'Clash Display', sans-serif`
    let rowY = widget.y + pad + chip + pad
    const rowStep = rowSize * 1.7
    for (const row of widget.visual.rows) {
      if (rowY + rowStep > widget.y + h - pad) break
      ctx.fillStyle = row.done ? theme.doneColor : theme.rowColor
      const maxRowChars = Math.max(3, Math.floor((w - pad * 2) / (rowSize * 0.54)))
      ctx.fillText(
        row.label.length > maxRowChars ? `${row.label.slice(0, maxRowChars - 1)}…` : row.label,
        widget.x + pad,
        rowY + rowSize / 2,
      )
      rowY += rowStep
    }
    if (widget.visual.rows.length === 0 && widget.visual.primary) {
      ctx.fillStyle = theme.rowColor
      const maxChars = Math.max(3, Math.floor((w - pad * 2) / (rowSize * 0.54)))
      const line = widget.visual.primary.replace(/\s+/g, ' ')
      for (let i = 0; i < 3; i++) {
        const segment = line.slice(i * maxChars, (i + 1) * maxChars)
        if (!segment || rowY + rowStep > widget.y + h - pad) break
        ctx.fillText(segment, widget.x + pad, rowY + rowSize / 2)
        rowY += rowStep
      }
    }
  }
}

/** Paint every sprite into a bitmap covering `region`. The context is
 * expected to be region-sized: region.width×paintZoom×dpr device pixels. */
export function paintSprites(
  ctx: Ctx2D,
  widgets: readonly PrimitiveWidget[],
  region: SpriteRegion,
  theme: SpriteTheme = DARK_SPRITE_THEME,
): number {
  const scale = region.paintZoom * region.devicePixelRatio
  ctx.clearRect(0, 0, region.width * scale, region.height * scale)
  ctx.save()
  ctx.scale(scale, scale)
  ctx.translate(-region.x, -region.y)
  let painted = 0
  for (const widget of widgets) {
    if (
      widget.x > region.x + region.width ||
      widget.x + widget.width < region.x ||
      widget.y > region.y + region.height ||
      widget.y + widget.height < region.y
    ) {
      continue
    }
    paintCard(ctx, widget, region.paintZoom, theme)
    painted++
  }
  ctx.restore()
  return painted
}
