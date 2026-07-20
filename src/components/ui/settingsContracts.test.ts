/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const settings = readFileSync(new URL('./SettingsPanel.tsx', import.meta.url), 'utf8')
const settingsStore = readFileSync(new URL('../../store/useSettingsStore.ts', import.meta.url), 'utf8')
const account = readFileSync(new URL('./AccountChip.tsx', import.meta.url), 'utf8')
const toolbar = readFileSync(new URL('./CanvasToolbar.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../../styles/product/03-glass-chrome.css', import.meta.url), 'utf8')

describe('settings and chrome contracts', () => {
  it('opens one categorized settings center from the toolbar', () => {
    for (const category of ['appearance', 'canvas', 'input', 'performance', 'data']) {
      expect(settings).toContain(`id: '${category}' as const`)
    }
    expect(toolbar).toContain('useSettingsStore.getState().setOpen(true)')
    expect(settings).toContain('aria-label="Settings categories"')
  })

  it('defaults application panels to 130 percent without changing widgets', () => {
    expect(settingsStore).toContain('interfaceScale: 1.3')
    expect(styles).toContain('calc(44px * var(--gp-ui-scale))')
    expect(styles).toContain('calc(42rem * var(--gp-ui-scale))')
    expect(styles).toContain('Widget dimensions')
  })

  it('uses one blurred modal backdrop and responsive settings panel', () => {
    expect(settings).toContain('gp-settings-backdrop')
    expect(settings).toContain('aria-modal="true"')
    expect(styles).toContain('backdrop-filter: blur(18px)')
    expect(styles).toContain('.gp-settings-panel')
  })

  it('keeps account chrome concise and has no completion sound control', () => {
    expect(account).not.toContain('status.shortLabel')
    expect(account).toContain('Export')
    expect(account).toContain('Import')
    expect(account).not.toContain('Completion sounds')
    expect(account).not.toContain('grovepad:sound')
  })
})
