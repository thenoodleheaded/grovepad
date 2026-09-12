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
const skinGallery = readFileSync(new URL('../../utils/skinGalleryLoad.ts', import.meta.url), 'utf8')
const packSettings = readFileSync(new URL('./DomainPackSettings.tsx', import.meta.url), 'utf8')
const addModal = readFileSync(new URL('./AddWidgetModal.tsx', import.meta.url), 'utf8')
const fileDelivery = readFileSync(new URL('../../utils/fileDelivery.ts', import.meta.url), 'utf8')

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
    // Frosted glass is declared through the quality-tier blur token, never as a
    // bare radius, so a visual quality mode can weaken or remove it.
    expect(styles).toContain('backdrop-filter: blur(calc(14px * var(--gp-blur-scale, 1)))')
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
    expect(general).toContain('<VisualQualityIsland')
    expect(general).not.toContain('GridVisibilityIsland')
    expect(canvas).toContain('Grovepad file')
    expect(canvas).toContain('<CanvasSettings canvas={activeCanvas} />')
    expect(canvas).toContain('<ActionIsland title="Import Grovepad file"')
    expect(canvas).toContain('<ActionIsland title="Export Grovepad file"')
    expect(accountSection).toContain('Cloud sync')
    expect(accountSection).toContain('<PreferenceIsland title="Cloud sync"')
    expect(data).toContain('<PreferenceIsland title="MCP connector"')
    expect(data).toContain('settings.mcpConnector')
    expect(data).toContain('<PreferenceIsland title="Usage counting"')
    expect(data).toContain('settings.usageAnalytics')
    expect(data).toContain('<DomainPackSettings />')
    expect(data).not.toContain('Grovepad file')
    expect(data).not.toContain('Cloud sync')
    expect(data).not.toContain('Reset settings')
  })

  it('sends every export through the one delivery route, hand-rolling none', () => {
    // Each of these used to build its own anchor, which does nothing at all in
    // the iOS webview — three buttons that looked like they worked. The route
    // is now shared so a platform fix lands in one place.
    for (const [name, source] of [['SettingsPanel', settings], ['AccountChip', account]] as const) {
      expect(source, name).toContain('deliverFile')
      expect(source, name).not.toContain('.download =')
      expect(source, name).not.toContain('createObjectURL')
    }
    // The confirmation has to name the route the file actually took: an iPhone
    // has no downloads folder to point at.
    for (const source of [settings, account]) {
      expect(source).toContain("route === 'shared' ? 'Grovepad package shared'")
    }
  })

  it('lets a download start before it frees the blob', () => {
    // Revoking on the line after click() beats the download in WebKit and
    // Firefox — including the Tauri macOS webview — and writes a zero-byte
    // file while the toast still says the export worked. The rule moved with
    // the implementation; this is now the only copy of it.
    expect(fileDelivery).toContain('setTimeout(() => URL.revokeObjectURL(url), 10_000)')
    expect(fileDelivery).not.toContain('anchor.click()\n  URL.revokeObjectURL(url)')
  })

  it('owns domain packs here, not as a detour inside the widget picker', () => {
    // Adding a widget is a hot path; choosing which libraries exist at all is a
    // setup decision. The picker must keep no route back into pack management.
    expect(packSettings).toContain('togglePack')
    expect(packSettings).toContain('toggleHiddenPackWidgetType')
    expect(addModal).not.toContain('DOMAIN_PACKS')
    expect(addModal).not.toContain('togglePack')
    expect(addModal).not.toContain("'packs'")
    // The picker still filters by the packs the board has switched on.
    expect(addModal).toContain('activePacks.includes(def.pack)')
  })

  it('counts usage anonymously, says so in words, and can be switched off', () => {
    // One event exists and the panel names it. Turning the switch off is not a
    // request to stop sending — the SDK behind it is never downloaded at all.
    expect(settingsStore).toContain('usageAnalytics: true')
    expect(settings).toContain('<PreferenceIsland title="Usage counting"')
    expect(settings).toContain('USAGE_ANALYTICS_HINT')
    expect(settings).toContain('browserRefuses: browserRefusesTracking()')
    // A build with no project key must not offer a switch that does nothing.
    expect(settings).toContain('disabled={!analyticsConfigured}')
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

  it('uses one dimmed modal backdrop and responsive settings panel', () => {
    expect(settings).toContain('gp-settings-backdrop')
    expect(settings).toContain('aria-modal="true"')
    expect(settings).toContain("data-state={settings.open ? 'open' : 'closed'}")
    expect(settings).toContain('onAnimationEnd={(event) =>')
    expect(styles).toContain('@keyframes gp-settings-backdrop-in')
    expect(styles).toContain('@keyframes gp-settings-backdrop-out')
    expect(styles).toContain('@keyframes gp-settings-shell-in')
    expect(styles).toContain('@keyframes gp-settings-shell-out')
    // The scrim blurs the entire board and chrome behind an open panel, so
    // settings is the only surface still legible. It is a full-viewport
    // composite, affordable only because the overlay unmounts once closed.
    expect(styles).toMatch(/\.gp-settings-backdrop \{[\s\S]*?backdrop-filter: blur\(/)
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
  it('adds the Skin Gallery workspace without disturbing the board already there', () => {
    // The button is the only supported way in — a console paste is not a
    // product surface, so the loader has to live behind Settings.
    expect(settings).toContain('title="Load Skin Gallery"')
    expect(settings).toContain('void loadSkinGallery()')
    // ...and only on the dev server. The gallery drops a whole reference
    // workspace beside the user's own work, which is a widget-building tool,
    // not a product feature. `import.meta.env.DEV` folds to false in every
    // production bundle, so the deployed build ships without the loader.
    expect(settings).toContain('const SKIN_GALLERY_ENABLED = import.meta.env.DEV')
    expect(settings).toContain('{SKIN_GALLERY_ENABLED && (')
    // Merge, never replace: the loader carries the existing records across and
    // only drops the gallery's own, so pressing it twice refreshes in place.
    expect(skinGallery).toContain("const GALLERY_PREFIX = 'skinlab-'")
    expect(skinGallery).toContain('...withoutGallery(state.workspaces)')
    expect(skinGallery).toContain('...withoutGallery(state.canvases)')
    expect(skinGallery).toContain('...withoutGallery(state.widgets)')
    expect(skinGallery).toContain('relations: withoutGallery(state.relations)')
    // A fetched fragment is untrusted, so it is validated before hydration and
    // a failure leaves the board untouched.
    expect(skinGallery).toContain('parsePersistedBoard(merged)')
    expect(skinGallery.indexOf('parsePersistedBoard(merged)')).toBeLessThan(
      skinGallery.indexOf('loadBoard(board)'),
    )
    expect(skinGallery).toContain("tone: 'danger'")
  })
})
