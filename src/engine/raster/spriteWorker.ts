import type { PrimitiveWidget } from '../../widgets/primitiveWidget'
import { paintSprites, type SpriteRegion, type SpriteTheme } from './spritePainter'

// ---------------------------------------------------------------------------
// Raster worker (canvas engine contract §3). Receives primitive projections
// (plain structured-cloneable data) plus a region, paints the sprite bitmap
// on an OffscreenCanvas entirely off the main thread, and transfers the
// finished ImageBitmap back. The main thread's only cost is one
// transferFromImageBitmap call — compositor-cheap.
//
// Requests carry a generation counter; a stale response (camera moved on)
// is discarded by the caller, so out-of-order worker completions are safe.
// ---------------------------------------------------------------------------

export interface SpritePaintRequest {
  kind: 'paint'
  generation: number
  widgets: PrimitiveWidget[]
  region: SpriteRegion
  theme: SpriteTheme
  /** Device-pixel bitmap size, capped by the caller. */
  bitmapWidth: number
  bitmapHeight: number
}

export interface SpritePaintResponse {
  kind: 'painted'
  generation: number
  region: SpriteRegion
  bitmap: ImageBitmap
  painted: number
  paintMs: number
}

self.onmessage = (event: MessageEvent<SpritePaintRequest>) => {
  const request = event.data
  if (request.kind !== 'paint') return
  const started = performance.now()
  const canvas = new OffscreenCanvas(request.bitmapWidth, request.bitmapHeight)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const painted = paintSprites(ctx, request.widgets, request.region, request.theme)
  const bitmap = canvas.transferToImageBitmap()
  const response: SpritePaintResponse = {
    kind: 'painted',
    generation: request.generation,
    region: request.region,
    bitmap,
    painted,
    paintMs: performance.now() - started,
  }
  self.postMessage(response, { transfer: [bitmap] })
}
