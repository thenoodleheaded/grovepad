import { it } from 'vitest'
import { buildLaunchShowcase } from '../../scripts/demo/demoBoardContent'
import { restingFace } from '../../src/utils/restingFace'
import { restingTileSize } from '../../src/utils/widgetRest'

it('column 4 of money', () => {
  const state = buildLaunchShowcase().toState()
  for (const w of Object.values(state.widgets)) {
    if (w.canvasId !== 'demo-canvas-money-center') continue
    if (w.position.x !== 1080) continue
    console.log(`${w.title} pos=${w.position.y} size=${w.size.width}x${w.size.height} pinned=${w.metadata.pinned === true} face=${restingFace(w).model.kind} tile=${JSON.stringify(restingTileSize(w))}`)
  }
})
