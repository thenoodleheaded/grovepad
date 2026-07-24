/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const addModal = readFileSync(new URL('./AddWidgetModal.tsx', import.meta.url), 'utf8')
const backup = readFileSync(new URL('./GuestBackupNudge.tsx', import.meta.url), 'utf8')
const empty = readFileSync(new URL('./EmptyCanvasState.tsx', import.meta.url), 'utf8')
const shaper = readFileSync(new URL('./ShaperHUD.tsx', import.meta.url), 'utf8')
const toolbar = readFileSync(new URL('./CanvasToolbar.tsx', import.meta.url), 'utf8')
const selectionActions = readFileSync(new URL('./SelectionActionBar.tsx', import.meta.url), 'utf8')
const toolbarStyles = readFileSync(new URL('../../styles/product/02-canvas-toolbar.css', import.meta.url), 'utf8')
const responsiveStyles = readFileSync(new URL('../../styles/product/01-tokens-base.css', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../canvas/CanvasViewport.tsx', import.meta.url), 'utf8')
const navigator = readFileSync(new URL('./CanvasNavigator.tsx', import.meta.url), 'utf8')
const zoomControls = readFileSync(new URL('./ZoomControls.tsx', import.meta.url), 'utf8')
const shortcuts = readFileSync(new URL('./ShortcutsOverlay.tsx', import.meta.url), 'utf8')
const cloudConflict = readFileSync(new URL('./CloudConflictDialog.tsx', import.meta.url), 'utf8')
const account = readFileSync(new URL('./AccountChip.tsx', import.meta.url), 'utf8')
const documentImport = readFileSync(new URL('./ImportDocumentModal.tsx', import.meta.url), 'utf8')
const grid = readFileSync(new URL('../canvas/GridLayer.tsx', import.meta.url), 'utf8')

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

  it('keeps one Circuit mode toggle in the top-right toolbar', () => {
    expect(toolbar).toContain('pressed={circuitMode}')
    expect(toolbar).toContain('CircuitBoard')
    expect(toolbar).toContain("circuitMode ? 'Exit Circuit mode (W)' : 'Enter Circuit mode (W)'")
    expect(toolbar).toContain("setInteractionMode(next ? 'connect' : 'navigate')")
    expect(viewport).not.toContain('CanvasModeDock')
    const overflow = toolbar.slice(toolbar.indexOf('function ToolbarOverflow'), toolbar.indexOf('export function CanvasToolbar'))
    expect(overflow).not.toContain('Circuit mode')
    expect(overflow).toContain('md:hidden')
  })

  it('keeps the top-right actions focused and moves navigation beside the account', () => {
    expect(toolbar).not.toContain('Import document')
    expect(toolbar).not.toContain('Keyboard shortcuts')
    expect(toolbar).not.toContain('Untangle layout')
    expect(toolbar).not.toContain('Auto-fit sizes')
    expect(toolbar).not.toContain('Light theme')
    expect(toolbar).not.toContain('h-5 w-px')
    expect(toolbar).toContain('h-11 w-fit')
    expect(toolbar.indexOf('<AccountChip />')).toBeLessThan(toolbar.indexOf('<PanelLeft size={13}'))
    expect(toolbar).toContain('gp-canvas-frosted-control')
    expect(account).toContain('gp-canvas-frosted-control')
    expect(account).toContain("'--gp-frost-accent': profileColor")
    expect(toolbar).toContain('gp-canvas-ui-scale')
    expect(zoomControls).toContain('gp-canvas-ui-scale')
    expect(navigator).toContain('gp-canvas-ui-scale')
    expect(selectionActions).toContain('gp-canvas-ui-scale')
  })

  it('shows selection-only Untangle only for multiple selected widgets', () => {
    expect(selectionActions).toContain('{selectedIds.length >= 2 && (')
    expect(selectionActions).toContain('untangleWidgets(selectedIds)')
  })

  it('clips the canvas without creating a second native scroll coordinate system', () => {
    expect(viewport).toContain('overflow-clip')
    expect(viewport).not.toContain('select-none overflow-hidden')
  })

  it('dismisses widget focus on a background click, not when a canvas pan begins', () => {
    const pointerDown = viewport.slice(viewport.indexOf('const handleCanvasPointerDown'), viewport.indexOf('const handleCanvasPointerMove'))
    const pointerUp = viewport.slice(viewport.indexOf('const handleCanvasPointerUp'), viewport.indexOf('const handleCanvasPointerCancel'))
    expect(pointerDown).not.toContain('collapseWidget()')
    expect(pointerUp).toContain('if (press.moved) return')
    expect(pointerUp).toContain('collapseWidget()')
    expect(viewport).toContain('onPointerMove={handleCanvasPointerMove}')
    expect(viewport).toContain('onPointerUp={handleCanvasPointerUp}')
  })

  it('keeps the minimap without directional off-screen widget counters', () => {
    expect(navigator).toContain('Canvas minimap. Click or drag to navigate.')
    expect(navigator).toContain('isMinimapExpanded')
    expect(navigator).not.toContain('off-screen')
    expect(navigator).not.toContain('Board map')
    expect(navigator).not.toContain('exportCanvasImage(false)')
    expect(navigator).not.toContain('Download canvas as PNG')
    expect(navigator).toContain('Collapse minimap')
    expect(navigator).toContain('onClick={closeMap}\n              className="gp-touch-target flex h-9 w-9')
  })

  it('uses a dots-only canvas guide without grid lines', () => {
    expect(grid).toContain('radial-gradient')
    expect(grid).not.toContain('linear-gradient')
    expect(grid).not.toContain('COARSE_SIZE')
  })

  it('keeps phone bottom chrome compact while preserving every command', () => {
    expect(zoomControls).toContain('gp-desktop-zoom-step')
    expect(zoomControls).toContain('gp-tablet-zoom-secondary')
    expect(zoomControls).toContain('Fit board (F)')
    expect(toolbar).toContain("viewportClass === 'tablet'")
    expect(toolbar).toContain('useWidgetStore.getState().undo()')
    expect(toolbar).toContain('useWidgetStore.getState().redo()')
    expect(responsiveStyles).toContain(
      "html:is([data-viewport-class='phone'], [data-viewport-class='tablet']) .gp-desktop-zoom-step",
    )
    expect(toolbarStyles).toContain(
      "html:is([data-viewport-class='phone'], [data-viewport-class='tablet']) .gp-canvas-ui-scale",
    )
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

  it('fits the account control to the toolbar as a squircle', () => {
    expect(account).toContain('h-9 w-9')
    expect(account).toContain('rounded-[11px]')
  })
})
