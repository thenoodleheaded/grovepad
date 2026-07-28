// Generator entry — writes the launch-video `.grovepad` packages.
//
//   npm run demo:boards
//
// Output lands in `demo-boards/` at the repo root. Each file is a real
// Grovepad package built through the same serializer the app's own export
// uses, and is verified by reading it straight back through the importer's
// parser before it is written: if a card, wire, relation or glue would not
// survive a real import, the build fails here rather than on camera.
//
// It is deliberately NOT part of `npm run test` — the file has no `.test.`
// in its name, so the default Vitest include never picks it up.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { it } from 'vitest'
import { buildGrovepadPackage, readGrovepadPackage } from '../../src/utils/grovepadPackage'
import { buildLaunchShowcase } from './demoBoardContent'

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../demo-boards')

it('writes the launch-video demo packages', async () => {
  const board = buildLaunchShowcase()
  const state = board.toState()
  const stats = board.stats()

  // No media widgets carry blobs in these boards, so the loader is a no-op.
  const bytes = await buildGrovepadPackage(state, async () => null)

  const reread = await readGrovepadPackage(bytes)
  const survived = {
    canvases: Object.keys(reread.board.canvases).length,
    widgets: Object.keys(reread.board.widgets).length,
    relations: Object.keys(reread.board.relations).length,
    wires: Object.keys(reread.board.connections).length,
    glues: Object.keys(reread.board.glues).length,
  }
  for (const key of Object.keys(stats) as Array<keyof typeof stats>) {
    if (survived[key] !== stats[key]) {
      throw new Error(
        `${key}: built ${stats[key]} but only ${survived[key]} survived an import round-trip`,
      )
    }
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const file = resolve(OUT_DIR, 'grovepad-launch-showcase.grovepad')
  writeFileSync(file, bytes)

  console.log(`\n  ${file}`)
  console.log(`  ${(bytes.byteLength / 1024).toFixed(1)} KB`)
  console.log(
    `  ${stats.canvases} canvases · ${stats.widgets} cards · ${stats.glues} glue clusters · ` +
      `${stats.relations} relations · ${stats.wires} wires\n`,
  )
})
