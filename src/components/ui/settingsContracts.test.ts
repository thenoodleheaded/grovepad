/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const settings = readFileSync(new URL('./SettingsPanel.tsx', import.meta.url), 'utf8')
const settingsStore = readFileSync(new URL('../../store/useSettingsStore.ts', import.meta.url), 'utf8')
const account = readFileSync(new URL('./AccountChip.tsx', import.meta.url), 'utf8')
const toolbar = readFileSync(new URL('./CanvasToolbar.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../../styles/product/03-glass-chrome.css', import.meta.url), 'utf8')
const tokens = readFileSync(new URL('../../styles/product/01-tokens-base.css', import.meta.url), 'utf8')
const authStore = readFileSync(new URL('../../store/useAuthStore.ts', import.meta.url), 'utf8')
const confirmDialog = readFileSync(new URL('./ConfirmDialog.tsx', import.meta.url), 'utf8')

describe('settings and chrome contracts', () => {
  it('uses five concise sections and keeps shortcuts inside settings', () => {
    for (const category of ['general', 'controls', 'canvas', 'account', 'data']) {
      expect(settings).toContain(`id: '${category}' as const`)
    }
    expect(toolbar).toContain('useSettingsStore.getState().setOpen(true)')
    expect(settings).toContain('aria-label="Settings categories"')
    expect(settings).toContain('<ShortcutReference')
    expect(settings).toContain("label: 'Hotkeys'")
    expect(settings).not.toContain('This device')
    expect(settings).not.toContain('summary:')
    const categories = settings.slice(settings.indexOf('const CATEGORIES'), settings.indexOf('function PreferenceIsland'))
    expect(categories).not.toContain('description')
  })

  it('uses a narrow split-glass shell and one linear shortcut index', () => {
    expect(settings).toContain('w-[min(540px,calc(100vw-24px))]')
    expect(settings).toContain('useLayoutEffect')
    expect(settings).toContain('style={{ height: bodyHeight')
    expect(settings).toContain('key={settings.section}')
    expect(settings).toContain('gp-settings-shortcut-list')
    expect(settings).toContain('gp-settings-title-pill')
    expect(settings).toContain('gp-settings-nav-backplate')
    expect(settings).toContain('gp-settings-close-naked')
    expect(settings).toContain('items-start justify-center')
    expect(settings).toContain("overflowY: bodyScrollable ? 'auto' : 'hidden'")
    expect(settings).not.toContain('gp-settings-section-heading')
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) !important')
    expect(styles).not.toContain('transition: height 340ms')
    expect(styles).toContain('@keyframes gp-settings-section-enter')
  })

  it('uses full-surface preference islands, one theme button, and a glass progress island', () => {
    expect(settings).not.toContain('Color theme')
    expect(settings).toContain("theme === 'dark' ? 'Use light theme' : 'Use dark theme'")
    expect(settings).toContain('gp-settings-preference-island')
    expect(settings).toContain('gp-settings-progress-island')
    expect(settings).toContain('onInput={(event) => onChange(Number(event.currentTarget.value))}')
    expect(settings).not.toContain('gp-settings-progress-hole')
    expect(settings).not.toContain('gp-settings-island-state')
    expect(settings).toContain('PreferenceIsland title="Motion"')
    expect(settings).toContain('checked={!settings.reduceMotion}')
    expect(settings).toContain('onChange={(motion) => update({ reduceMotion: !motion })}')
    expect(settings).toContain('PreferenceIsland title="Magnetic hover"')
    expect(settings).toContain('size={21}')
    expect(settings).toContain("settings.section === 'controls' ? 640 : 512")
    expect(styles).toContain(':is(.gp-settings-preference-island, .gp-popup-island)[data-checked]')
    expect(styles).toContain("[data-kind='aura'][data-checked]")
    expect(styles).not.toContain('@keyframes gp-settings-motion-icon')
    expect(styles).not.toContain('@keyframes gp-settings-aura-icon')
    expect(settings).not.toContain('magneticWidgetOffset')
    expect(styles).toContain('--gp-settings-progress')
    expect(styles).toContain('width: var(--gp-settings-progress)')
    expect(styles).toContain('.gp-settings-progress-island:has(input:active)::after')
    expect(styles).toMatch(/\.gp-settings-progress-island::before[\s\S]*?transition: none;/)
    expect(styles).toContain('scaleX(1.32) skewX(-5deg)')
    expect(styles).toContain('backdrop-filter: blur(14px)')
    expect(settings).not.toContain('gp-settings-row-icon')
    expect(settingsStore).toContain("SettingsSection = 'general' | 'controls' | 'canvas' | 'account' | 'data'")
    expect(settingsStore).toContain('reduceMotion: false')
  })

  it('uses one elastic glass lens for category switching and static setting buttons', () => {
    expect(settings).toContain('gp-settings-category-indicator')
    expect(settings).toContain('gp-settings-category-lens')
    expect(settings).toContain('--gp-settings-category-shift')
    expect(styles).toContain('@keyframes gp-settings-category-lens-arrive')
    expect(styles).toContain('cubic-bezier(0.2, 1.34, 0.32, 1)')
    expect(styles).toContain('.gp-settings-category[data-active]')
    expect(styles).toContain('transition: none')
    expect(styles).not.toContain('.gp-settings-preference-island:active')
  })

  it('places settings with the category that owns them', () => {
    const general = settings.slice(settings.indexOf('general: ('), settings.indexOf('controls: ('))
    const canvas = settings.slice(settings.indexOf('canvas: activeCanvas'), settings.indexOf('account: ('))
    const accountSection = settings.slice(settings.indexOf('account: ('), settings.indexOf('data: ('))
    const data = settings.slice(settings.indexOf('data: ('), settings.indexOf('}[settings.section]'))

    expect(general).toContain('Reset settings')
    expect(general).not.toContain('GridVisibilityIsland')
    expect(canvas).toContain('Grovepad file')
    expect(canvas).toContain('<CanvasSettings canvas={activeCanvas} />')
    expect(canvas).toContain('<ActionIsland title="Import Grovepad file"')
    expect(canvas).toContain('<ActionIsland title="Export Grovepad file"')
    expect(accountSection).toContain('Cloud sync')
    expect(accountSection).toContain('<PreferenceIsland title="Cloud sync"')
    expect(data).toContain('<PreferenceIsland title="MCP connector"')
    expect(data).toContain('settings.mcpConnector')
    expect(data).toContain('<ActionIsland title="Domain packs"')
    expect(data).not.toContain('Grovepad file')
    expect(data).not.toContain('Cloud sync')
    expect(data).not.toContain('Reset settings')
  })

  it('keeps local Claude access explicit and off by default', () => {
    expect(settingsStore).toContain('mcpConnector: false')
    expect(settings).toContain('Waiting for a local MCP client. Your board stays on this device.')
    expect(settings).toContain("state.connectedClients")
  })

  it('offers useful settings that persist with the current canvas', () => {
    expect(settings).toContain('Canvas name')
    expect(settings).toContain('Dot grid strength')
    expect(settings).toContain('title="Link lines"')
    expect(settings).not.toContain('title="Relation strictness"')
    expect(settings).not.toContain('kind="relation-strictness"')
    expect(settings).toContain('updateCanvasSettings(canvas.id')
  })

  it('toggles canvas sharing between private and invited-members-only', () => {
    expect(settings).toContain("shared ? 'Shared canvas' : 'Private canvas'")
    expect(settings).toContain('kind="shared"')
    expect(settings).toContain('setCollaborativeCanvasShared')
    expect(settings).toContain("'Sharing canvas…'")
    expect(settings).toContain("'Making private…'")
    // Turning sharing off revokes other people's access, so it is confirmed.
    expect(settings).toContain('Make this canvas private?')
    expect(settings).toContain('setConfirmStopSharing(true)')
    // Only the owner may revoke, and sharing needs an account plus a backend.
    expect(settings).toContain('canToggleCanvasSharing')
    expect(settings).toContain('hasSession: Boolean(session)')
    expect(settings).toContain('configured: supabaseConfigured')
    expect(confirmDialog).toContain('z-[300]')
    expect(settings).toContain('z-[260]')
  })

  it('offers no way to make a canvas publicly readable', () => {
    // Sharing means invited members only. There is deliberately no public or
    // link-for-anyone tier, so a canvas can never be opened by someone who was
    // not invited to it.
    for (const removed of ['Public canvas', 'Anyone with the link', 'setCollaborativeCanvasVisibility', 'canvas.visibility']) {
      expect(settings).not.toContain(removed)
    }
  })

  it('leaves interface scaling to the browser and removes retired controls', () => {
    for (const retired of ['interfaceScale', 'highContrast', 'auraIntensity', 'showMinimap']) {
      expect(settingsStore).not.toContain(`${retired}:`)
    }
    expect(tokens).not.toContain('--gp-ui-scale')
    for (const label of ['Interface size', 'High contrast', 'Glow strength', 'Canvas minimap', 'Performance monitor']) {
      expect(settings).not.toContain(label)
    }
  })

  it('uses one blurred modal backdrop and responsive settings panel', () => {
    expect(settings).toContain('gp-settings-backdrop')
    expect(settings).toContain('aria-modal="true"')
    expect(settings).toContain("data-state={settings.open ? 'open' : 'closed'}")
    expect(settings).toContain('onAnimationEnd={(event) =>')
    expect(styles).toContain('@keyframes gp-settings-backdrop-in')
    expect(styles).toContain('@keyframes gp-settings-backdrop-out')
    expect(styles).toContain('@keyframes gp-settings-shell-in')
    expect(styles).toContain('@keyframes gp-settings-shell-out')
    expect(styles).toContain('backdrop-filter: blur(18px)')
    expect(styles).toContain('.gp-settings-panel')
  })

  it('keeps account chrome concise and has no completion sound control', () => {
    expect(account).not.toContain('status.shortLabel')
    expect(account).toContain('Export')
    expect(account).toContain('Import')
    expect(account).not.toContain('Completion sounds')
    expect(account).not.toContain('grovepad:sound')
    expect(account).not.toContain('type="checkbox"')
    expect(account).toContain('{profileName}</p>')
    expect(settings).toContain('setSyncEnabled(enabled)')
  })

  it('offers a concise account profile without collecting personal details', () => {
    expect(settings).not.toContain('Account profile')
    expect(settings).not.toContain('Shown in Multiplayer')
    expect(settings).toContain('<span className="sr-only">Display name</span>')
    expect(settings).not.toContain('<span>Display name</span>')
    expect(settings).toContain('className="gp-settings-profile-name w-full"')
    expect(settings).toContain('role="radiogroup" aria-label="Profile color"')
    expect(settings).not.toContain('>Profile color</p>')
    expect(settings).toContain('readOnly type="email"')
    expect(settings).toContain('Save profile')
    expect(authStore).toContain('updateProfile:')
    expect(authStore).toContain("'#818cf8'")
    for (const unnecessary of ['Address', 'Phone number', 'Date of birth', 'Company']) {
      expect(settings).not.toContain(unnecessary)
    }
  })
})
