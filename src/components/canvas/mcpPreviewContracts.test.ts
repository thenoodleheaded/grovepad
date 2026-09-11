/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const layer = readFileSync(new URL('./McpPreviewLayer.tsx', import.meta.url), 'utf8')
const quickAdd = readFileSync(new URL('./QuickAddPreviewLayer.tsx', import.meta.url), 'utf8')
const previewScene = readFileSync(new URL('./quickAddPreviewScene.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('./CanvasViewport.tsx', import.meta.url), 'utf8')

describe('MCP preview UI contracts', () => {
  it('mounts the MCP preview inside the canvas world transform', () => {
    const world = viewport.slice(viewport.indexOf('data-world-layer'))
    expect(world).toContain('<McpPreviewLayer />')
  })

  it('shares blueprint paint with Quick Add instead of forking it', () => {
    expect(quickAdd).toContain('export function BlueprintSceneView')
    expect(previewScene).toContain('export function buildPreviewScene')
    expect(layer).toContain('BlueprintSceneView')
    expect(layer).not.toContain('gp-bp-chip')
  })

  it('keeps the ghost tree passive while the approval pill stays interactive', () => {
    expect(layer).toContain('data-canvas-ui')
    expect(layer).toContain('pointer-events-none')
    expect(layer).toContain('commitPreview(preview.previewId)')
    expect(layer).toContain('dismissPreview(preview.previewId)')
  })

  it('renders previews only for the canvas they target', () => {
    expect(layer).toContain('preview.canvasId === activeCanvasId')
  })

  // A `?? []` literal here re-allocates on the closed-preview path, so the
  // fold-out effect's deps change on the re-render `setLeaving` triggers and
  // its cleanup cancels the 240ms timer before `leaving` drains. The stale
  // chips then paint in the NEXT Quick Add preview — opaque under
  // prefers-reduced-motion, which disables the fold animation.
  it('feeds the fold-out hook a stable empty chip list when no scene exists', () => {
    expect(quickAdd).toContain('const NO_CHIPS: PreviewChip[] = []')
    expect(quickAdd).toContain('useLeavingChips(scene?.chips ?? NO_CHIPS)')
    expect(quickAdd).not.toContain('useLeavingChips(scene?.chips ?? [])')
  })
})
