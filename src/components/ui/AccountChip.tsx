import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloudOff, History, LogIn, LogOut, Package, RefreshCw, Upload, UserRound } from 'lucide-react'
import { supabaseConfigured } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { belowAnchor } from '../../utils/popoverPosition'
import { useWidgetStore } from '../../store/useWidgetStore'
import { usePersistenceStatusStore } from '../../store/usePersistenceStatusStore'
import { useToastStore } from '../../store/useToastStore'
import { buildBoardSnapshot, parsePersistedBoard, requestCloudSync } from '../../utils/persistence'
import { buildGrovepadPackage, readGrovepadPackage } from '../../utils/grovepadPackage'
import { importBoardFileOntoCanvas } from '../../utils/boardCanvasImport'
import { listRollingSnapshots, saveRollingSnapshot, type LocalSnapshot } from '../../utils/boardDatabase'
import { ConfirmDialog } from './ConfirmDialog'
import { restoreWithProtectedSnapshot } from '../../utils/snapshotRestore'
import { localDayKey } from '../../utils/localDate'
import { persistenceStatusSummary } from '../../utils/persistenceStatus'

/** Top-bar account presence: avatar + menu when signed in, sign-in when not. */
export function AccountChip() {
  const session = useAuthStore((state) => state.session)
  const isGuest = useAuthStore((state) => state.isGuest)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState({ x: 0, y: 0 })
  const fileRef = useRef<HTMLInputElement>(null)
  const [snapshots, setSnapshots] = useState<LocalSnapshot[]>([])
  const [restoreSnapshot, setRestoreSnapshot] = useState<LocalSnapshot | null>(null)
  const localSave = usePersistenceStatusStore((state) => state.localSave)
  const cloudSync = usePersistenceStatusStore((state) => state.cloudSync)
  const syncEnabled = usePersistenceStatusStore((state) => state.syncEnabled)
  const lastSyncedAt = usePersistenceStatusStore((state) => state.lastSyncedAt)
  const networkOnline = usePersistenceStatusStore((state) => state.networkOnline)
  const serviceWorkerReady = usePersistenceStatusStore((state) => state.serviceWorkerReady)
  const widgetCount = useWidgetStore((state) => Object.keys(state.widgets).length)

  useOverlayLifecycle(open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const email = session?.user.email ?? ''
  const initial = email ? email[0]!.toUpperCase() : null

  const openMenu = () => {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (rect) {
      setAnchor(belowAnchor(rect, 248, 300))
    }
    void listRollingSnapshots().then((items) => setSnapshots(items.slice(0, 3))).catch(() => setSnapshots([]))
    setOpen(true)
  }

  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  const today = () => localDayKey()

  const exportPackage = async () => {
    try {
      const bytes = await buildGrovepadPackage(useWidgetStore.getState())
      download(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }), `grovepad-${today()}.grovepad`)
      useToastStore.getState().addToast('Grovepad package downloaded')
    } catch {
      useToastStore.getState().addToast('Could not build the Grovepad package')
    }
    setOpen(false)
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const { board, media } = await readGrovepadPackage(bytes)
      await importBoardFileOntoCanvas({ board, media, filename: file.name })
      setOpen(false)
    } catch {
      useToastStore.getState().addToast('That file is not a valid .grovepad package')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const status = persistenceStatusSummary({
    localSave,
    cloudSync,
    syncEnabled,
    signedIn: Boolean(session),
    networkOnline,
    lastSyncedAt,
  })
  const statusTone = {
    error: 'bg-red-400',
    working: 'bg-amber-300 animate-pulse',
    synced: 'bg-emerald-400',
    offline: 'bg-amber-400',
    local: 'bg-neutral-500',
  }[status.tone]

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={`Account — ${status.longLabel}`}
        title={status.longLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`gp-touch-target relative flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold transition-all hover:scale-105 active:scale-95 ${
          session
            ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300'
            : 'border-neutral-600 bg-neutral-800/80 text-neutral-400 hover:text-neutral-200'
        }`}
      >
        {initial ?? <UserRound size={13} aria-hidden />}
        <span aria-hidden className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-neutral-950 ${statusTone}`} />
      </button>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Storage status: {status.longLabel}
      </span>
      <input
        ref={fileRef}
        type="file"
        accept=".grovepad,application/vnd.grovepad.board+zip"
        className="hidden"
        onChange={(event) => void importFile(event.currentTarget.files?.[0])}
      />

      {open &&
        createPortal(
          <>
            <div
              role="presentation"
              className="fixed inset-0 z-[120]"
              onPointerDown={() => setOpen(false)}
            />
            <div
              role="menu"
              className="gp-account-menu gp-menu gp-pop gp-panel fixed z-[130] max-h-[80dvh] w-64 overflow-y-auto rounded-2xl p-1.5 shadow-2xl"
              style={{ left: anchor.x, top: anchor.y }}
            >
              <div className="px-3 py-2">
                {session ? (
                  <>
                    <p className="truncate text-xs font-medium text-neutral-200">{email}</p>
                    <p className={`mt-0.5 flex items-center gap-1 text-[10px] ${status.tone === 'error' ? 'text-red-300' : status.tone === 'offline' ? 'text-amber-300' : status.tone === 'synced' ? 'text-emerald-400/90' : 'text-neutral-500'}`}>
                      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${statusTone}`} />
                      {status.longLabel} · {widgetCount} cards
                    </p>
                    {serviceWorkerReady && (
                      <p className="mt-0.5 text-[9px] text-neutral-600">Available offline after this visit</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-xs font-medium text-neutral-200">
                      {isGuest ? 'Guest mode' : 'Not signed in'}
                    </p>
                    <p className={`mt-0.5 flex items-center gap-1 text-[10px] ${status.tone === 'offline' ? 'text-amber-300' : 'text-neutral-500'}`}>
                      <CloudOff size={10} aria-hidden />
                      {status.longLabel}
                    </p>
                    {serviceWorkerReady && (
                      <p className="mt-0.5 text-[9px] text-neutral-600">Available offline after this visit</p>
                    )}
                  </>
                )}
              </div>
              <div className="mx-2 border-t gp-hairline" />
              <button
                type="button"
                role="menuitem"
                onClick={() => void exportPackage()}
                className="mx-1.5 mt-1 flex h-8 w-[calc(100%-12px)] items-center gap-2 rounded-lg px-2 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                <Package size={12} aria-hidden />
                Export
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => fileRef.current?.click()}
                className="mx-1.5 flex h-8 w-[calc(100%-12px)] items-center gap-2 rounded-lg px-2 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                <Upload size={12} aria-hidden />
                Import
              </button>
              {snapshots[0] && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setRestoreSnapshot(snapshots[0]!)
                    setOpen(false)
                  }}
                  className="mx-1.5 flex h-8 w-[calc(100%-12px)] items-center gap-2 rounded-lg px-2 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
                >
                  <History size={12} aria-hidden />
                  Restore {snapshots[0].label ? `${snapshots[0].label} · ` : ''}{new Date(snapshots[0].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </button>
              )}
              {session && supabaseConfigured && (
                <label className="gp-touch-target mx-1.5 flex h-8 cursor-pointer items-center justify-between rounded-lg px-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200">
                  Cloud sync
                  <input
                    type="checkbox"
                    checked={syncEnabled}
                    onChange={(event) => usePersistenceStatusStore.getState().setSyncEnabled(event.target.checked)}
                    className="accent-emerald-400"
                  />
                </label>
              )}
              {session && supabaseConfigured && syncEnabled && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={cloudSync === 'saving' || !networkOnline}
                  title={!networkOnline ? 'Reconnect to sync with your account' : undefined}
                  onClick={() => requestCloudSync()}
                  className="mx-1.5 flex h-8 w-[calc(100%-12px)] items-center gap-2 rounded-lg px-2 text-xs text-neutral-300 transition-colors hover:bg-neutral-800 disabled:opacity-50"
                >
                  <RefreshCw size={12} aria-hidden className={cloudSync === 'saving' ? 'animate-spin' : undefined} />
                  {cloudSync === 'saving' ? 'Syncing…' : 'Sync now'}
                </button>
              )}
              <div className="mx-2 mt-1 border-t gp-hairline" />
              {session ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    void useAuthStore.getState().signOut()
                    setOpen(false)
                  }}
                  className="mx-1.5 mt-1 flex h-8 w-[calc(100%-12px)] items-center gap-2 rounded-lg px-2 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
                >
                  <LogOut size={12} aria-hidden />
                  Sign out
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    useAuthStore.getState().exitGuest()
                    setOpen(false)
                  }}
                  className="mx-1.5 mt-1 flex h-8 w-[calc(100%-12px)] items-center gap-2 rounded-lg px-2 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/10"
                >
                  <LogIn size={12} aria-hidden />
                  {supabaseConfigured ? 'Sign in' : 'Go to login page'}
                </button>
              )}
            </div>
          </>,
          document.body,
        )}
      <ConfirmDialog
        open={Boolean(restoreSnapshot)}
        title="Restore the latest local snapshot?"
        description={restoreSnapshot ? `This replaces every current workspace, canvas, widget, group, and connection with the board from ${new Date(restoreSnapshot.createdAt).toLocaleString()}. Grovepad will first save the board you have now as “Pre-restore recovery” with the current time, and the confirmation message can restore it immediately.` : ''}
        confirmLabel="Restore snapshot"
        destructive
        onClose={() => setRestoreSnapshot(null)}
        onConfirm={() => {
          if (restoreSnapshot) {
            const board = parsePersistedBoard(restoreSnapshot.board)
            if (board) {
              const currentBoard = buildBoardSnapshot(useWidgetStore.getState())
              const recoverableCurrentBoard = parsePersistedBoard(currentBoard)
              void (async () => {
                if (!recoverableCurrentBoard) {
                  useToastStore.getState().addToast('Restore stopped because the current board could not be protected')
                  return
                }
                let rollback: (() => void) | null = null
                try {
                  rollback = await restoreWithProtectedSnapshot({
                    currentBoard,
                    currentRecovery: recoverableCurrentBoard,
                    target: board,
                    protect: (current) => saveRollingSnapshot(current, 'Pre-restore recovery'),
                    load: (next) => useWidgetStore.getState().loadBoard(next),
                  })
                } catch {
                  useToastStore.getState().addToast('Restore stopped because the current board could not be protected')
                  return
                }
                useToastStore.getState().addToast('Local snapshot restored; your previous board is protected', {
                  duration: 12_000,
                  action: { label: 'Restore previous board', run: rollback },
                })
              })()
            } else {
              useToastStore.getState().addToast('That local snapshot is no longer readable')
            }
          }
        }}
      />
    </>
  )
}
