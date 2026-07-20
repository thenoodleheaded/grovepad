/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const addModal = readFileSync(new URL('./AddWidgetModal.tsx', import.meta.url), 'utf8')
const backup = readFileSync(new URL('./GuestBackupNudge.tsx', import.meta.url), 'utf8')
const empty = readFileSync(new URL('./EmptyCanvasState.tsx', import.meta.url), 'utf8')
const shaper = readFileSync(new URL('./ShaperHUD.tsx', import.meta.url), 'utf8')
const toolbar = readFileSync(new URL('./CanvasToolbar.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../canvas/CanvasViewport.tsx', import.meta.url), 'utf8')
const navigator = readFileSync(new URL('./CanvasNavigator.tsx', import.meta.url), 'utf8')
const zoomControls = readFileSync(new URL('./ZoomControls.tsx', import.meta.url), 'utf8')
const shortcuts = readFileSync(new URL('./ShortcutsOverlay.tsx', import.meta.url), 'utf8')
const cloudConflict = readFileSync(new URL('./CloudConflictDialog.tsx', import.meta.url), 'utf8')
const account = readFileSync(new URL('./AccountChip.tsx', import.meta.url), 'utf8')
const documentImport = readFileSync(new URL('./ImportDocumentModal.tsx', import.meta.url), 'utf8')

describe('beta UI interaction contracts', () => {
  it('starts tree shaping on double-click only from the bare viewport', () => {
    expect(viewport).toContain('isStrictCanvasSurface(e.target, e.currentTarget)')
    expect(viewport).toContain('startGhostShaper(world.x, world.y)')
    expect(viewport).not.toContain('openAddWidget(world)')
    expect(viewport).not.toContain("e.target.closest('article, svg")
  })

  it('reuses the widget library as the tree multi-picker without checkbox tiles', () => {
    expect(addModal).toContain('data-selected={selected || undefined}')
    expect(addModal).toContain("`${selected ? 'Deselect' : 'Select'} ${def.label}`")
    expect(addModal).toContain('selection.onConfirm(selectedTypes)')
  })

  it('keeps the favorite hit target alive under the tile hover owner', () => {
    expect(addModal).toContain('group/tile relative')
    expect(addModal).toContain('group-hover/tile:opacity-100')
    expect(addModal).not.toContain("pointer-events-none opacity-0 group-hover/tile:pointer-events-auto")
  })

  it('clears pointer-only picker highlighting and uses a full-card fading accent', () => {
    expect(addModal).toContain('onPointerLeave={onUnhover}')
    expect(addModal).toContain('hoveredIndex === null && keyboardActive && flatIndex === clampedActive')
    expect(addModal).toContain('setKeyboardActive(false)')
    expect(addModal).toContain('max-w-7xl')
  })

  it('suspends passive empty/backup overlays while the tree shaper owns input', () => {
    expect(backup).toContain('shaping) return null')
    expect(empty).toContain('shaping) return null')
    expect(shaper).toContain('z-[220]')
  })

  it('exposes Circuit mode as a pressed toggle', () => {
    expect(toolbar).toContain('pressed={circuitMode}')
    expect(toolbar).toContain("circuitMode ? 'Exit Circuit mode (W)' : 'Enter Circuit mode (W)'")
  })

  it('clips the canvas without creating a second native scroll coordinate system', () => {
    expect(viewport).toContain('overflow-clip')
    expect(viewport).not.toContain('select-none overflow-hidden')
  })

  it('keeps the minimap without directional off-screen widget counters', () => {
    expect(navigator).toContain('Canvas minimap. Click or drag to navigate.')
    expect(navigator).toContain('isMinimapExpanded')
    expect(navigator).not.toContain('off-screen')
  })

  it('keeps phone bottom chrome compact while preserving every command', () => {
    expect(zoomControls).toContain('gp-desktop-zoom-step')
    expect(zoomControls).toContain('Fit board (F)')
    expect(shortcuts).toContain('Touch & trackpad')
    expect(shortcuts).toContain('gp-shortcuts-panel')
  })

  it('offers workspace merge for cloud conflicts and accepts Grovepad canvas drops', () => {
    expect(cloudConflict).toContain('Merge workspaces')
    expect(cloudConflict).toContain("resolveCloudConflict('merge')")
    expect(viewport).toContain("endsWith('.grovepad')")
    expect(viewport).toContain('importBoardFileOntoCanvas')
  })

  it('exposes only .grovepad for user-facing board files', () => {
    expect(account).toContain('accept=".grovepad,application/vnd.grovepad.board+zip"')
    expect(account).toContain('Import')
    expect(account).toContain('Export')
    expect(account).not.toContain('Export JSON backup')
    expect(account).not.toContain('application/json')
    expect(documentImport).not.toContain("'.pdf,.md,.markdown,.txt,.csv,.json'")
    expect(documentImport).not.toContain('CSV · JSON')
    expect(viewport).toContain('JSON files are no longer supported; use a .grovepad package')
  })
})
