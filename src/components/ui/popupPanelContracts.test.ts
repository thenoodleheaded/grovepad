/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

const chrome = source('../../styles/product/03-glass-chrome.css')
const settings = source('./SettingsPanel.tsx')
const multiplayer = source('../collaboration/CollaborationOverlays.tsx')
const command = source('./CommandPalette.tsx')
const confirm = source('./ConfirmDialog.tsx')
const documentImport = source('./ImportDocumentModal.tsx')
const quickAdd = source('./QuickAddSheet.tsx')
const widgetLibrary = source('./AddWidgetModal.tsx')
const shortcuts = source('./ShortcutsOverlay.tsx')
const canvasTree = source('./CanvasTreeDrawer.tsx')
const excalidraw = source('../widgets/modules/excalidraw/ExcalidrawFullscreen.tsx')

describe('popup panel design contracts', () => {
  it('defines one neutral popup material and control vocabulary', () => {
    for (const className of [
      '.gp-popup-surface',
      '.gp-popup-title-pill',
      '.gp-popup-nav-backplate',
      '.gp-popup-close-naked',
      '.gp-popup-island',
      '.gp-popup-action',
      '.gp-popup-menu',
    ]) {
      expect(chrome).toContain(className)
    }
    expect(chrome).toContain(".gp-popup-action[data-tone='primary']")
    expect(chrome).toContain(".gp-popup-action[data-tone='destructive']")
    expect(chrome).toContain('.gp-popup-surface :is(button')
  })

  it('uses the neutral primitives in Settings instead of leaving the recipe Settings-only', () => {
    expect(settings).toContain('gp-popup-title-pill')
    expect(settings).toContain('gp-popup-nav-backplate')
    expect(settings).toContain('gp-popup-surface')
    expect(settings).toContain('gp-popup-island')
    expect(settings).toContain('gp-popup-close-naked')
  })

  it('gives Multiplayer separate identity, navigation, and content glass', () => {
    expect(multiplayer).toContain('gp-popup-title-pill')
    expect(multiplayer).toContain('gp-popup-nav-backplate')
    expect(multiplayer).toContain('gp-popup-surface')
    expect(multiplayer).toContain('gp-popup-close-naked')
    expect(multiplayer).toContain('gp-collaboration-tab-indicator')
    expect(multiplayer).not.toContain('gp-collaboration-tab-active')
  })

  it('adapts every substantial modal form without forcing one anatomy on all of them', () => {
    for (const modal of [command, confirm, documentImport, quickAdd, shortcuts, canvasTree, excalidraw]) {
      expect(modal).toContain('gp-popup-surface')
    }
    expect(command).toContain('gp-command-tab-indicator')
    expect(confirm).toContain('gp-popup-action')
    expect(documentImport).toContain('gp-popup-title-pill')
    expect(documentImport).toContain('gp-popup-island')
    expect(quickAdd).toContain('gp-popup-action')
    expect(widgetLibrary).toContain('gp-popup-title-pill')
    expect(widgetLibrary).toContain('gp-popup-island')
  })

  it('applies the compact popup menu material to every menu owner', () => {
    for (const path of [
      './AccountChip.tsx',
      './CanvasContextMenu.tsx',
      './CanvasToolbar.tsx',
      './WidgetContextMenu.tsx',
      '../canvas/DependencyLines.tsx',
      '../canvas/RelationLines.tsx',
      '../canvas/WireLayer.tsx',
    ]) {
      const menuOwner = source(path)
      const menuSurfaces = menuOwner.match(/className="[^"]*gp-menu gp-[^"]*"/g) ?? []
      expect(menuSurfaces.length).toBeGreaterThan(0)
      for (const menuSurface of menuSurfaces) expect(menuSurface).toContain('gp-popup-menu')
    }
  })
})
