import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  Blocks,
  Cloud,
  Database,
  Download,
  Frame,
  GitBranch,
  Grid3X3,
  Keyboard,
  LockKeyhole,
  Moon,
  MousePointer2,
  Palette,
  Plug,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Upload,
  UserRound,
  Users,
  Waves,
  X,
  type LucideIcon,
} from 'lucide-react'
import { supabaseConfigured } from '../../lib/supabase'
import { setCollaborativeCanvasShared } from '../../collaboration/collaborationController'
import { canToggleCanvasSharing } from '../../collaboration/canvasSharing'
import { accountDisplayName, accountProfileColor, PROFILE_COLORS, useAuthStore } from '../../store/useAuthStore'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { usePersistenceStatusStore } from '../../store/usePersistenceStatusStore'
import { useMcpConnectorStore } from '../../store/useMcpConnectorStore'
import { useSettingsStore, type AppPreferences } from '../../store/useSettingsStore'
import { canEditCollaborativeCanvas, useCollaborationStore } from '../../store/useCollaborationStore'
import { useThemeStore } from '../../store/useThemeStore'
import { useToastStore } from '../../store/useToastStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { screenToWorld, type CanvasMeta } from '../../types/spatial'
import { importBoardFileOntoCanvas } from '../../utils/boardCanvasImport'
import { buildGrovepadPackage, readGrovepadPackage } from '../../utils/grovepadPackage'
import { localDayKey } from '../../utils/localDate'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { ShortcutReference } from './ShortcutsOverlay'
import { ConfirmDialog } from './ConfirmDialog'

const CATEGORIES = [
  { id: 'general' as const, label: 'General', icon: Palette },
  { id: 'controls' as const, label: 'Hotkeys', icon: Keyboard },
  { id: 'canvas' as const, label: 'Canvas', icon: Frame },
  { id: 'account' as const, label: 'Account', icon: UserRound },
  { id: 'data' as const, label: 'Data', icon: Database },
] satisfies Array<{ id: 'general' | 'controls' | 'canvas' | 'account' | 'data'; label: string; icon: LucideIcon }>

function PreferenceIsland({ title, icon: Icon, kind, checked, onChange, disabled = false, wide = false }: { title: string; icon: LucideIcon; kind: 'motion' | 'aura' | 'magnetic' | 'links' | 'sync' | 'shared' | 'mcp'; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; wide?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={title}
      data-kind={kind}
      data-checked={checked ? '' : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`gp-settings-preference-island gp-popup-island flex rounded-xl p-3 text-left disabled:cursor-not-allowed disabled:opacity-45 ${wide ? 'min-h-16 w-full flex-row items-center justify-start gap-3' : 'min-h-20 flex-col items-start justify-between'}`}
    >
      <Icon size={21} strokeWidth={1.75} className="gp-settings-preference-icon shrink-0 text-neutral-400" aria-hidden />
      <span className="min-w-0 text-[11px] font-semibold text-neutral-100">{title}</span>
    </button>
  )
}

function ActionIsland({ title, icon: Icon, onClick, disabled = false, wide = false, type = 'button' }: { title: string; icon: LucideIcon; onClick?: () => void; disabled?: boolean; wide?: boolean; type?: 'button' | 'submit' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`gp-settings-preference-island gp-popup-island gp-settings-action-island flex rounded-xl p-3 text-left disabled:cursor-not-allowed disabled:opacity-40 ${wide ? 'min-h-16 w-full flex-row items-center justify-start gap-3' : 'min-h-20 flex-col items-start justify-between'}`}
    >
      <Icon size={21} strokeWidth={1.75} className="gp-settings-preference-icon shrink-0 text-amber-300" aria-hidden />
      <span className="min-w-0 text-[11px] font-semibold text-neutral-100">{title}</span>
    </button>
  )
}

function GridVisibilityIsland({ value, onChange, label = 'Grid visibility', disabled = false }: { value: number; onChange: (value: number) => void; label?: string; disabled?: boolean }) {
  return (
    <label
      data-disabled={disabled ? '' : undefined}
      className="gp-settings-progress-island relative flex min-h-16 cursor-ew-resize items-center overflow-hidden rounded-xl"
      style={{ '--gp-settings-progress': `${value}%` } as CSSProperties}
    >
      <input
        aria-label={label}
        disabled={disabled}
        type="range"
        min="0"
        max="100"
        value={value}
        onInput={(event) => onChange(Number(event.currentTarget.value))}
        className="gp-settings-progress absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
      />
      <span className="gp-settings-progress-content pointer-events-none relative z-10 flex w-full items-center gap-3 px-3.5">
        <Grid3X3 size={21} strokeWidth={1.75} className="shrink-0 text-neutral-300" aria-hidden />
        <span className="min-w-0 flex-1 text-[11px] font-semibold text-neutral-100">{label}</span>
        <output className="w-9 text-right text-[10px] font-semibold tabular-nums text-neutral-300">{value}%</output>
      </span>
    </label>
  )
}

function AccountProfileSettings() {
  const session = useAuthStore((state) => state.session)
  const savedName = accountDisplayName(session)
  const savedColor = accountProfileColor(session)
  const [displayName, setDisplayName] = useState(savedName)
  const [profileColor, setProfileColor] = useState(savedColor)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDisplayName(savedName)
    setProfileColor(savedColor)
  }, [savedColor, savedName])

  if (!session) {
    return (
      <section className="gp-settings-profile flex items-center gap-3 rounded-xl p-3.5" aria-label="Profile sign in required">
        <span className="flex w-5 shrink-0 items-center justify-center text-neutral-500"><UserRound size={17} aria-hidden /></span>
        <p className="min-w-0 text-[11px] font-semibold text-neutral-300">Sign in to edit your profile</p>
      </section>
    )
  }

  const changed = displayName.trim() !== savedName || profileColor !== savedColor
  const save = async () => {
    setSaving(true)
    try {
      await useAuthStore.getState().updateProfile({ displayName, profileColor })
      useToastStore.getState().addToast('Profile updated')
    } catch (error) {
      useToastStore.getState().addToast(error instanceof Error ? error.message : 'Could not update profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="gp-settings-profile rounded-xl p-3.5" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] text-sm font-bold" style={{ color: profileColor, backgroundColor: `${profileColor}22`, boxShadow: `inset 0 0 0 1px ${profileColor}55` }} aria-hidden>
          {(displayName.trim()[0] ?? session.user.email?.[0] ?? '?').toUpperCase()}
        </span>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Display name</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={60}
            autoComplete="name"
            className="gp-settings-profile-name w-full"
          />
        </label>
      </div>

      <div>
        <label className="gp-settings-field">
          <span>Email</span>
          <input value={session.user.email ?? ''} readOnly type="email" className="cursor-default opacity-65" />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Profile color">
          {PROFILE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-label={`Profile color ${color}`}
              aria-checked={profileColor === color}
              onClick={() => setProfileColor(color)}
              className="h-6 w-6 rounded-lg"
              style={{ backgroundColor: color, boxShadow: profileColor === color ? `0 0 0 2px var(--gp-surface-panel), 0 0 0 3px ${color}` : 'inset 0 1px 0 rgb(255 255 255 / 0.35)' }}
            />
          ))}
        </div>
        <div className="w-36">
          <ActionIsland type="submit" wide disabled={!changed || saving || !displayName.trim()} title={saving ? 'Saving…' : 'Save profile'} icon={Save} />
        </div>
      </div>
    </form>
  )
}

function CanvasSettings({ canvas }: { canvas: CanvasMeta }) {
  const session = useAuthStore((state) => state.session)
  const collaborationRole = useCollaborationStore((state) => state.role)
  const [name, setName] = useState(canvas.name)
  const [sharingTarget, setSharingTarget] = useState<boolean | null>(null)
  const [confirmStopSharing, setConfirmStopSharing] = useState(false)
  const canEdit = collaborationRole === null || canEditCollaborativeCanvas(collaborationRole)
  const shared = canvas.shared === true
  // Sharing needs an account and a configured backend. Only the owner may stop
  // sharing, because doing so revokes everyone else's access.
  const canToggleSharing = canToggleCanvasSharing({
    shared,
    hasSession: Boolean(session),
    configured: supabaseConfigured,
    role: collaborationRole,
    busy: sharingTarget !== null,
  })

  useEffect(() => setName(canvas.name), [canvas.id, canvas.name])
  useEffect(() => { setConfirmStopSharing(false) }, [canvas.id])

  const applySharing = async (next: boolean) => {
    setSharingTarget(next)
    try {
      await setCollaborativeCanvasShared(next)
      useToastStore.getState().addToast(next ? 'Canvas shared with people you invite' : 'Canvas is private again')
    } catch (error) {
      useToastStore.getState().addToast(error instanceof Error ? error.message : 'Could not change canvas sharing')
    } finally {
      setSharingTarget(null)
    }
  }

  const saveName = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setName(canvas.name)
      return
    }
    useWidgetStore.getState().renameCanvas(canvas.id, trimmed)
  }

  return (
    <div className="space-y-2">
      <form
        className="gp-settings-canvas-card rounded-xl p-3"
        onSubmit={(event) => { event.preventDefault(); saveName() }}
      >
        <label className="gp-settings-field">
          <span>Canvas name</span>
          <span className="flex gap-2">
            <input
              value={name}
              maxLength={256}
              disabled={!canEdit}
              onChange={(event) => setName(event.target.value)}
              onBlur={saveName}
              className="min-w-0 flex-1"
            />
            <button type="submit" disabled={!canEdit || !name.trim() || name.trim() === canvas.name} className="gp-settings-preference-island gp-popup-island gp-settings-inline-island disabled:cursor-not-allowed disabled:opacity-35">
              <Save size={14} aria-hidden />Save
            </button>
          </span>
        </label>
      </form>

      <PreferenceIsland
        title={sharingTarget === true ? 'Sharing canvas…' : sharingTarget === false ? 'Making private…' : shared ? 'Shared canvas' : 'Private canvas'}
        icon={shared ? Users : LockKeyhole}
        kind="shared"
        checked={shared}
        disabled={!canToggleSharing}
        wide
        onChange={(next) => { if (next) void applySharing(true); else setConfirmStopSharing(true) }}
      />

      <ConfirmDialog
        open={confirmStopSharing}
        title="Make this canvas private?"
        description="Everyone you invited loses access, and the shared copy is deleted from the server along with its comments. This canvas stays on your device — nothing here is lost."
        confirmLabel="Make private"
        destructive
        onConfirm={() => { setConfirmStopSharing(false); void applySharing(false) }}
        onClose={() => setConfirmStopSharing(false)}
      />

      <GridVisibilityIsland
        label="Dot grid strength"
        value={canvas.gridIntensity ?? 100}
        disabled={!canEdit}
        onChange={(gridIntensity) => useWidgetStore.getState().updateCanvasSettings(canvas.id, { gridIntensity })}
      />

      <PreferenceIsland
        title="Link lines"
        icon={GitBranch}
        kind="links"
        checked={canvas.linksVisible ?? true}
        disabled={!canEdit}
        wide
        onChange={(linksVisible) => useWidgetStore.getState().updateCanvasSettings(canvas.id, { linksVisible })}
      />

    </div>
  )
}

function viewCenterWorld() {
  const { pan, zoom, viewportSize } = useCanvasStore.getState()
  return screenToWorld(
    { x: viewportSize.width / 2, y: viewportSize.height / 2 },
    { x: pan.x, y: pan.y, zoom },
  )
}

export function SettingsPanel() {
  const settings = useSettingsStore()
  const theme = useThemeStore((state) => state.theme)
  const session = useAuthStore((state) => state.session)
  const syncEnabled = usePersistenceStatusStore((state) => state.syncEnabled)
  const mcpStatus = useMcpConnectorStore((state) => state.status)
  const mcpClients = useMcpConnectorStore((state) => state.connectedClients)
  const activeCanvas = useWidgetStore((state) => state.canvases[state.activeCanvasId])
  const panelRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [bodyHeight, setBodyHeight] = useState<number>()
  const [bodyScrollable, setBodyScrollable] = useState(false)
  const [rendered, setRendered] = useState(settings.open)

  useOverlayLifecycle(settings.open)
  useFocusTrap(settings.open, panelRef, panelRef)

  useEffect(() => {
    if (settings.open) setRendered(true)
  }, [settings.open])

  useEffect(() => {
    if (!settings.open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useSettingsStore.getState().setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settings.open])

  useLayoutEffect(() => {
    if (!settings.open || !sectionRef.current) return
    const section = sectionRef.current
    let frame = 0
    const measure = () => {
      const categoryLimit = settings.section === 'controls' ? 640 : 512
      const availableHeight = Math.max(220, Math.min(categoryLimit, window.innerHeight - 162))
      const naturalHeight = section.scrollHeight + 36
      setBodyHeight(Math.min(naturalHeight, availableHeight))
      setBodyScrollable(naturalHeight > availableHeight + 1)
    }
    frame = window.requestAnimationFrame(measure)
    const observer = new ResizeObserver(measure)
    observer.observe(section)
    window.addEventListener('resize', measure)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [settings.open, settings.section, session])

  // Opening renders synchronously so the focus trap sees the mounted panel;
  // `rendered` only holds it in the DOM long enough to animate a close.
  if (!rendered && !settings.open) return null

  const update = (next: Partial<AppPreferences>) => settings.update(next)
  const exportPackage = async () => {
    try {
      const bytes = await buildGrovepadPackage(useWidgetStore.getState())
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.grovepad.board+zip' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `grovepad-${localDayKey()}.grovepad`
      link.click()
      URL.revokeObjectURL(url)
      useToastStore.getState().addToast('Grovepad package downloaded')
    } catch {
      useToastStore.getState().addToast('Could not build the Grovepad package')
    }
  }
  const importPackage = async (file: File | undefined) => {
    if (!file) return
    try {
      const imported = await readGrovepadPackage(new Uint8Array(await file.arrayBuffer()))
      await importBoardFileOntoCanvas({ ...imported, filename: file.name })
      useSettingsStore.getState().setOpen(false)
    } catch {
      useToastStore.getState().addToast('That file is not a valid .grovepad package')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const content = {
    general: (
      <div>
        <div className="gp-settings-preference-grid grid grid-cols-2 gap-2 sm:grid-cols-4">
          <PreferenceIsland title="Motion" icon={Waves} kind="motion" checked={!settings.reduceMotion} onChange={(motion) => update({ reduceMotion: !motion })} />
          <PreferenceIsland title="Ambient glow" icon={Sparkles} kind="aura" checked={settings.canvasAura} onChange={(canvasAura) => update({ canvasAura })} />
          <PreferenceIsland title="Magnetic hover" icon={MousePointer2} kind="magnetic" checked={settings.magneticHover} onChange={(magneticHover) => update({ magneticHover })} />
          <ActionIsland title="Reset settings" icon={RotateCcw} onClick={() => { settings.reset(); useToastStore.getState().addToast('Settings reset') }} />
        </div>
      </div>
    ),
    controls: (
      <div>
        <section className="gp-settings-shortcuts rounded-xl p-3" aria-label="Hotkeys">
          <ShortcutReference className="gp-settings-shortcut-list" />
        </section>
      </div>
    ),
    canvas: activeCanvas ? (
      <div className="space-y-2">
        <CanvasSettings canvas={activeCanvas} />
        <div className="grid grid-cols-2 gap-2">
          <ActionIsland title="Import Grovepad file" icon={Upload} onClick={() => fileRef.current?.click()} />
          <ActionIsland title="Export Grovepad file" icon={Download} onClick={() => void exportPackage()} />
        </div>
        <input ref={fileRef} type="file" accept=".grovepad,application/vnd.grovepad.board+zip" className="hidden" onChange={(event) => void importPackage(event.currentTarget.files?.[0])} />
      </div>
    ) : null,
    account: (
      <div className="space-y-2">
        <AccountProfileSettings />
        <PreferenceIsland title="Cloud sync" icon={Cloud} kind="sync" wide disabled={!session || !supabaseConfigured} checked={Boolean(session && supabaseConfigured && syncEnabled)} onChange={(enabled) => { if (session && supabaseConfigured) usePersistenceStatusStore.getState().setSyncEnabled(enabled) }} />
      </div>
    ),
    data: (
      <div className="space-y-2">
        <PreferenceIsland title="MCP connector" icon={Plug} kind="mcp" wide checked={settings.mcpConnector} onChange={(mcpConnector) => update({ mcpConnector })} />
        <p className="px-2 text-[11px] leading-relaxed text-neutral-500">
          {mcpStatus === 'connected'
            ? `Connected to ${mcpClients} AI ${mcpClients === 1 ? 'client' : 'clients'}. Proposed trees appear on the canvas for you to add or dismiss.`
            : settings.mcpConnector
              ? 'Waiting for a local MCP client. Your board stays on this device.'
              : 'Off by default. Turn on to let a local AI client read outlines and preview or add trees.'}
        </p>
        <ActionIsland title="Domain packs" icon={Blocks} wide onClick={() => { settings.setOpen(false); useWidgetStore.getState().openAddWidget(viewCenterWorld(), 'packs') }} />
      </div>
    ),
  }[settings.section]
  const activeCategoryIndex = CATEGORIES.findIndex((category) => category.id === settings.section)

  return createPortal(
    <div
      className="gp-settings-overlay fixed inset-0 z-[260] flex items-start justify-center px-4 pb-4 pt-[clamp(24px,12vh,96px)]"
      data-state={settings.open ? 'open' : 'closed'}
      role="dialog"
      aria-modal="true"
      aria-hidden={!settings.open}
      aria-labelledby="gp-settings-title"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && !settings.open) setRendered(false)
      }}
    >
      <button type="button" tabIndex={-1} disabled={!settings.open} aria-label="Close settings" onClick={() => settings.setOpen(false)} className="gp-settings-backdrop absolute inset-0 cursor-default" />
      <div ref={panelRef} tabIndex={-1} className="gp-settings-shell relative z-10 flex max-h-[calc(100dvh-24px)] w-[min(540px,calc(100vw-24px))] flex-col gap-2 outline-none">
        <header className="gp-settings-floating-header flex shrink-0 items-center justify-between px-1">
          <div className="gp-settings-title-pill gp-popup-title-pill gp-panel gp-pop flex h-9 items-center gap-2 rounded-full px-3.5">
            <span className="gp-settings-mark flex w-4 items-center justify-center text-emerald-300"><SlidersHorizontal size={15} /></span>
            <h1 id="gp-settings-title" className="text-[13px] font-semibold leading-none text-neutral-100">Settings</h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
              title={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
              onClick={() => useThemeStore.getState().setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="gp-settings-theme-naked gp-touch-target flex h-8 w-8 items-center justify-center text-neutral-500 hover:text-neutral-100"
            >
              {theme === 'dark' ? <Sun size={14} aria-hidden /> : <Moon size={14} aria-hidden />}
            </button>
            <button type="button" aria-label="Close settings" onClick={() => settings.setOpen(false)} className="gp-settings-close-naked gp-popup-close-naked gp-touch-target flex h-8 w-8 items-center justify-center text-neutral-500 hover:text-white"><X size={17} /></button>
          </div>
        </header>
        <div className="gp-settings-nav-backplate gp-popup-nav-backplate gp-panel gp-pop shrink-0 rounded-2xl p-1.5">
          <nav
            className="gp-settings-nav relative flex gap-1 rounded-xl p-1"
            aria-label="Settings categories"
            style={{
              '--gp-settings-category-shift': `${activeCategoryIndex * 100}%`,
              '--gp-settings-category-gap-shift': `${activeCategoryIndex * 4}px`,
            } as CSSProperties}
          >
            <span aria-hidden className="gp-settings-category-indicator">
              <span key={settings.section} className="gp-settings-category-lens" />
            </span>
            {CATEGORIES.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" data-active={settings.section === id ? '' : undefined} aria-current={settings.section === id ? 'page' : undefined} onClick={() => settings.setSection(id)} className={`gp-settings-category relative z-10 flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] px-2 text-[10px] font-semibold ${settings.section === id ? 'text-emerald-100' : 'text-neutral-500 hover:text-neutral-200'}`}>
                <Icon size={12} strokeWidth={settings.section === id ? 2.2 : 1.8} />
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="gp-settings-panel gp-popup-surface gp-panel gp-pop min-h-0 shrink-0 overflow-hidden rounded-[22px]">
          <main className="gp-settings-main min-h-0 shrink-0 px-4 py-3.5" style={{ height: bodyHeight ? `${bodyHeight}px` : undefined, overflowY: bodyScrollable ? 'auto' : 'hidden' }}>
            <div ref={sectionRef} key={settings.section} className="gp-settings-section">
              {content}
            </div>
          </main>
        </div>
      </div>
    </div>,
    document.body,
  )
}
