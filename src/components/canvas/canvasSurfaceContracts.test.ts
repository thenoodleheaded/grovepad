/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const viewport = readFileSync(new URL('./CanvasViewport.tsx', import.meta.url), 'utf8')
const ghostTree = readFileSync(new URL('./GhostTreeShaper.tsx', import.meta.url), 'utf8')
const wireLayer = readFileSync(new URL('./WireLayer.tsx', import.meta.url), 'utf8')

/** Body of the `readImage` drop handler, up to the next top-level helper. */
function readImageBody(): string {
  const start = viewport.indexOf('const readImage = async (')
  expect(start).toBeGreaterThan(-1)
  const end = viewport.indexOf('const importGrovepadFile', start)
  expect(end).toBeGreaterThan(start)
  return viewport.slice(start, end)
}

describe('dropped-image persistence', () => {
  it('never leaves a blank Image card behind when the blob write fails', () => {
    const body = readImageBody()
    // storeMediaBlob rejects on a quota-exceeded or unavailable IndexedDB. The
    // widget is created BEFORE that await, so an unguarded rejection strands an
    // empty card, drops the photo's only copy, and says nothing to the user.
    expect(body).toMatch(/try\s*\{\s*await storeMediaBlob\(id, blob\)\s*\}\s*catch/)
    expect(body).toContain('state.deleteWidgets([id])')
    expect(body).toContain("tone: 'danger'")
    // The data patch that makes the card readable must stay on the success path.
    const patchIndex = body.indexOf("localBlobKey: id")
    expect(patchIndex).toBeGreaterThan(body.indexOf('} catch {'))
  })
})

describe('widget-library code splitting', () => {
  it('keeps the widget library off the board-open path from every entry point', () => {
    // CanvasViewport defers it; GhostTreeShaper is statically imported by
    // CanvasViewport, so a static import there re-attaches the chunk eagerly
    // and defeats the lazy() boundary for every user.
    expect(viewport).toContain("import('../ui/AddWidgetModal')")
    expect(ghostTree).not.toMatch(/^import \{ AddWidgetModal \} from/m)
    expect(ghostTree).toContain("lazy(() =>\n  import('../ui/AddWidgetModal')")
    expect(ghostTree).toContain('<Suspense fallback={null}>')
  })
})

describe('wire edge memoisation', () => {
  it('compares every WireDescriptor field so no wire freezes its paint', () => {
    const interfaceStart = wireLayer.indexOf('interface WireDescriptor {')
    expect(interfaceStart).toBeGreaterThan(-1)
    const interfaceBody = wireLayer.slice(
      interfaceStart,
      wireLayer.indexOf('}', interfaceStart),
    )
    const fields = [...interfaceBody.matchAll(/^\s{2}(\w+):/gm)].map((match) => match[1]!)
    expect(fields).toContain('valueLabel')

    const comparator = wireLayer.slice(wireLayer.indexOf('}, (prev, next) =>'))
    for (const field of fields) {
      // `id` is the React key — it cannot change for a mounted element.
      if (field === 'id') continue
      expect(comparator, `Wire memo comparator ignores "${field}"`).toContain(`prev.wire.${field}`)
    }
    expect(comparator).toContain('prev.onOpen === next.onOpen')
  })
})
