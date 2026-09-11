/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const addModal = readFileSync(new URL('./AddWidgetModal.tsx', import.meta.url), 'utf8')
const faces = readFileSync(new URL('./widgetFaces.tsx', import.meta.url), 'utf8')
const pickerStyles = readFileSync(new URL('../../styles/product/03-glass-chrome.css', import.meta.url), 'utf8')
const backup = readFileSync(new URL('./GuestBackupNudge.tsx', import.meta.url), 'utf8')
const empty = readFileSync(new URL('./EmptyCanvasState.tsx', import.meta.url), 'utf8')
const shaper = readFileSync(new URL('./ShaperHUD.tsx', import.meta.url), 'utf8')
const toolbar = readFileSync(new URL('./CanvasToolbar.tsx', import.meta.url), 'utf8')
const selectionActions = readFileSync(new URL('./SelectionActionBar.tsx', import.meta.url), 'utf8')
const modeDock = readFileSync(new URL('./CanvasModeDock.tsx', import.meta.url), 'utf8')
const toolbarStyles = readFileSync(new URL('../../styles/product/02-canvas-toolbar.css', import.meta.url), 'utf8')
const responsiveStyles = readFileSync(new URL('../../styles/product/01-tokens-base.css', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../canvas/CanvasViewport.tsx', import.meta.url), 'utf8')
const navigator = readFileSync(new URL('./CanvasNavigator.tsx', import.meta.url), 'utf8')
const zoomControls = readFileSync(new URL('./ZoomControls.tsx', import.meta.url), 'utf8')
const shortcuts = readFileSync(new URL('./ShortcutsOverlay.tsx', import.meta.url), 'utf8')
const account = readFileSync(new URL('./AccountChip.tsx', import.meta.url), 'utf8')
const documentImport = readFileSync(new URL('./ImportDocumentModal.tsx', import.meta.url), 'utf8')
const grid = readFileSync(new URL('../canvas/GridLayer.tsx', import.meta.url), 'utf8')

describe('beta UI interaction contracts', () => {
  it('splits the two canvas gestures: right button places, double-click sculpts', () => {
    // Both gestures answer only to bare canvas, never to a widget under the
    // pointer, and both read the surface the same way.
    expect(viewport).toContain('isStrictCanvasSurface(e.target, e.currentTarget)')
    expect(viewport).not.toContain("e.target.closest('article, svg")
    // The right button opens the library at the point you clicked.
    expect(viewport).toContain('onContextMenu={handleContextMenu}')
    expect(viewport).toContain('openAddWidget(world)')
    // Double-click starts the tree shaper there instead.
    expect(viewport).toContain('onDoubleClick={handleDoubleClick}')
    expect(viewport).toContain('startGhostShaper(world.x, world.y)')
    // Mid-sculpt the shaper owns the surface; a stray right-click cannot stack
    // the library on top of it.
    expect(viewport).toContain('if (useWidgetStore.getState().ghostConfig) return')
    // The canvas context menu is gone, not merely unrendered.
    expect(viewport).not.toContain('CanvasContextMenu')
  })

  it('reuses the widget library as the tree multi-picker without checkbox tiles', () => {
    expect(addModal).toContain('data-selected={selected || undefined}')
    expect(addModal).toContain("`${selected ? 'Deselect' : 'Select'} ${def.label}`")
    expect(addModal).toContain('selection.onConfirm(selectedTypes)')
  })

  it('keeps the favorite hit target alive under the row hover owner', () => {
    expect(addModal).toContain('group/tile relative')
    expect(addModal).toContain('group-hover/tile:opacity-100')
    expect(addModal).not.toContain("pointer-events-none opacity-0 group-hover/tile:pointer-events-auto")
  })

  it('hands the picker highlight between pointer and keyboard without ever going dark', () => {
    expect(addModal).toContain('onPointerLeave={onUnhover}')
    expect(addModal).toContain('const litIndex = hoveredIndex ?? (keyboardActive ? clampedActive : null)')
    expect(addModal).toContain('setKeyboardActive(false)')
    // Leaving a row hands the highlight back to the keyboard where the pointer
    // left it, so Enter always has a target and the crown always has a hue.
    expect(addModal).toContain('setActiveIndex(index)')
  })

  it('opens as a palette anchored at the spawn point, not a full-screen shell', () => {
    // Sized to its own grid, placed after measuring, and grown from the anchor.
    expect(addModal).not.toContain('max-w-7xl')
    expect(addModal).not.toContain('gp-picker-scrim')
    expect(addModal).toContain('gp-palette-scrim')
    expect(addModal).toContain('gp-widget-palette')
    expect(addModal).toContain('width: PALETTE_WIDTH')
    expect(addModal).toContain('transformOrigin: placement?.origin')
    expect(addModal).toContain('useLayoutEffect')
    // The camera is read once so a pan underneath never drags the panel along.
    expect(addModal).toContain('useCanvasStore.getState()')
    expect(addModal).not.toContain('useCanvasStore((state)')
  })

  it('presents the library as one column of drawn faces, not a grid of icons', () => {
    // Every widget wears a miniature of its own layout, so identity comes from
    // shape and the column can stay in neutral ink.
    expect(addModal).toContain('gp-facet-row')
    expect(addModal).toContain('<WidgetFace type={def.type} category={def.category} />')
    expect(addModal).not.toContain('gp-picker-cell')
    expect(addModal).not.toContain('gp-picker-row')
    expect(addModal).not.toContain('grid-cols')
    expect(addModal).not.toContain('PALETTE_COLUMNS')
    expect(faces).toContain("stroke=\"currentColor\"")
    expect(faces).not.toMatch(/#[0-9a-f]{6}/i)
  })

  it('lights exactly one hue at a time and never paints a row in glass', () => {
    // The lit row's accent is the only colour on the panel; the crown and the
    // hairline take that same hue.
    expect(addModal).toContain("'--gp-lit-accent': litAccent ?? 'transparent'")
    expect(addModal).toContain('gp-facet-crown')
    expect(addModal).toContain('data-lit={litAccent ? \'\' : undefined}')
    // Rows paint a flat tint and a spine — no per-row blur or drop shadow, which
    // is what keeps a long library scrolling at speed.
    const rowBlock = pickerStyles.slice(pickerStyles.indexOf('.gp-facet-row {'), pickerStyles.indexOf('.gp-facet-glyph {'))
    expect(rowBlock).not.toContain('backdrop-filter')
    expect(rowBlock).not.toContain('blur(')
  })

  it('walks the column with up and down and leaves left and right to the caret', () => {
    expect(addModal).toContain("case 'ArrowDown'")
    expect(addModal).toContain("case 'ArrowUp'")
    expect(addModal).not.toContain("case 'ArrowLeft'")
    expect(addModal).not.toContain("case 'ArrowRight'")
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
    // The touch tool dock is mounted again, but it must never grow a second
    // Circuit toggle: it holds Navigate, Select, Undo and Redo only.
    expect(viewport).toContain('<CanvasModeDock />')
    expect(modeDock).not.toContain('CircuitBoard')
    expect(modeDock).not.toContain("'connect'")
    const overflow = toolbar.slice(toolbar.indexOf('function ToolbarOverflow'), toolbar.indexOf('export function CanvasToolbar'))
    expect(overflow).not.toContain('Circuit mode')
    expect(overflow).toContain('md:hidden')
  })

  it('gives a finger a path to every selection tool the keyboard owns', () => {
    // Shift-click and marquee need Select mode; ⌘G and Option-drag need Glue.
    expect(selectionActions).toContain('label="Select more"')
    expect(selectionActions).toContain("setInteractionMode('select')")
    expect(selectionActions).toContain('label="Glue"')
    expect(selectionActions).toContain('glueSelection(selectedIds)')
    // Undo/Redo moved to the dock; the tree shaper moved into the ⋯ menu,
    // because its toolbar button hides below md and double-tap belongs to zoom.
    const overflow = toolbar.slice(toolbar.indexOf('function ToolbarOverflow'), toolbar.indexOf('export function CanvasToolbar'))
    expect(overflow).toContain('Shape a tree')
    expect(overflow).toContain('startGhostShaper(point.x, point.y)')
    expect(overflow).not.toContain('.undo()')
    expect(modeDock).toContain('.undo()')
    expect(modeDock).toContain('.redo()')
  })

  it('keeps the top-right actions focused and moves navigation beside the account', () => {
    expect(toolbar).not.toContain('Import document')
    expect(toolbar).not.toContain('Keyboard shortcuts')
    expect(toolbar).not.toContain('Quick capture')
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

  it('drags the minimap off a captured element and ends on a cancelled gesture', () => {
    const glide = navigator.slice(navigator.indexOf('const glideFromMap'), navigator.indexOf('\n  return ('))
    // React nulls the synthetic event's currentTarget once dispatch returns, so
    // the window listeners must never read it — the element is captured first.
    expect(glide).toContain('const map = event.currentTarget')
    expect(glide).toContain('map.getBoundingClientRect()')
    expect(glide).not.toContain('event.currentTarget.getBoundingClientRect()')
    // A gesture the browser claims fires pointercancel, not pointerup.
    expect(glide).toContain("window.addEventListener('pointercancel', onUp)")
    expect(glide).toContain("window.removeEventListener('pointercancel', onUp)")
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
    // Where the zoom row drops Undo/Redo, the tool dock carries them.
    expect(modeDock).toContain('useWidgetStore.getState().undo()')
    expect(modeDock).toContain('useWidgetStore.getState().redo()')
    expect(modeDock).toContain('modeDockShowsHistory(viewportClass)')
    expect(responsiveStyles).toContain(
      "html:is([data-viewport-class='phone'], [data-viewport-class='tablet']) .gp-desktop-zoom-step",
    )
    expect(toolbarStyles).toContain(
      "html:is([data-viewport-class='phone'], [data-viewport-class='tablet']) .gp-canvas-ui-scale",
    )
    expect(shortcuts).toContain('Touch & trackpad')
    expect(shortcuts).toContain('gp-shortcuts-panel')
  })

  it('accepts Grovepad canvas drops and never asks the user to resolve a sync conflict', () => {
    expect(viewport).toContain("endsWith('.grovepad')")
    expect(viewport).toContain('importBoardFileOntoCanvas')
    // Sync reconciles itself against the last-synced baseline; a prompt here
    // would mean that lineage was lost again. See boardThreeWayMerge.ts.
    expect(viewport).not.toContain('CloudConflictDialog')
  })

  it('exposes only .grovepad for user-facing board files', () => {
    expect(account).toContain('accept=".grovepad,application/vnd.grovepad.board+zip"')
    expect(account).toContain('Import')
    expect(account).toContain('Export')
    expect(account).not.toContain('Export JSON backup')
    expect(account).not.toContain('application/json')
    // A .json is never presented as a Grovepad board file.
    expect(documentImport).not.toContain('CSV · JSON')
  })

  // The document importer accepts .json for exactly one reason: a rival app's
  // board export arrives in that format. The refusal that used to live in the
  // canvas drop handler moved with it — an unrecognized .json still gets the
  // "use a .grovepad package" answer and must never reach the model as prose.
  it('accepts .json only as a foreign board export, never as a Grovepad board', () => {
    expect(documentImport).toContain("'.pdf,.md,.markdown,.txt,.csv,.json'")
    expect(documentImport).toContain('Trello board JSON')
    expect(documentImport).toContain('mapTrelloBoard')
    expect(documentImport).toContain('use a .grovepad package')
    // Unrecognized JSON goes to the rejected bucket, not into the model path.
    expect(documentImport).toContain('rejected.push(file)')
    expect(viewport).not.toContain('JSON files are no longer supported')
  })

  it('fits the account control to the toolbar as a squircle', () => {
    expect(account).toContain('h-9 w-9')
    expect(account).toContain('rounded-[11px]')
  })
})
