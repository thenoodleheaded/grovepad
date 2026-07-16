import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloudOff, Download, History, LogIn, LogOut, RefreshCw, Upload, UserRound } from 'lucide-react'
import { supabaseConfigured } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { belowAnchor } from '../../utils/popoverPosition'
import { useWidgetStore } from '../../store/useWidgetStore'
import { usePersistenceStatusStore } from '../../store/usePersistenceStatusStore'
import { useToastStore } from '../../store/useToastStore'
import { buildBoardSnapshot, parsePersistedBoard, requestCloudSync } from '../../utils/persistence'
import { listRollingSnapshots, type LocalSnapshot } from '../../utils/boardDatabase'
import { ConfirmDialog } from './ConfirmDialog'

/** Top-bar account presence: avatar + menu when signed in, sign-in when not. */
export function AccountChip() {
  const session = useAuthStore((state) => state.session)
  const isGuest = useAuthStore((state) => state.isGuest)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState({ x: 0, y: 0 })
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<ReturnType<typeof parsePersistedBoard>>(null)
  const [snapshots, setSnapshots] = useState<LocalSnapshot[]>([])
  const [restoreSnapshot, setRestoreSnapshot] = useState<LocalSnapshot | null>(null)
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('grovepad:sound') === 'on')
  const localSave = usePersistenceStatusStore((state) => state.localSave)
  const cloudSync = usePersistenceStatusStore((state) => state.cloudSync)
  const syncEnabled = usePersistenceStatusStore((state) => state.syncEnabled)
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

  const exportBoard = () => {
    const board = buildBoardSnapshot(useWidgetStore.getState())
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `grovepad-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    useToastStore.getState().addToast('Board backup downloaded')
    setOpen(false)
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const parsed = parsePersistedBoard(JSON.parse(await file.text()))
      if (!parsed) throw new Error('Invalid board')
      setPendingImport(parsed)
      setOpen(false)
    } catch {
      useToastStore.getState().addToast('That file is not a valid Grovepad backup')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const statusTone = localSave === 'error' || (syncEnabled && cloudSync === 'error')
    ? 'bg-red-400'
    : localSave === 'saving' || cloudSync === 'saving'
      ? 'bg-amber-300 animate-pulse'
      : session && syncEnabled && cloudSync === 'synced'
        ? 'bg-emerald-400'
        : 'bg-neutral-500'

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`relative flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold transition-all hover:scale-105 active:scale-95 ${
          session
            ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300'
            : 'border-neutral-600 bg-neutral-800/80 text-neutral-400 hover:text-neutral-200'
        }`}
      >
        {initial ?? <UserRound size={13} aria-hidden />}
        <span aria-hidden className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-neutral-950 ${statusTone}`} />
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
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
              className="gp-menu gp-pop gp-panel fixed z-[130] w-64 rounded-2xl p-1.5 shadow-2xl"
              style={{ left: anchor.x, top: anchor.y }}
            >
              <div className="px-3 py-2">
                {session ? (
                  <>
                    <p className="truncate text-xs font-medium text-neutral-200">{email}</p>
                    <p className={`mt-0.5 flex items-center gap-1 text-[10px] ${syncEnabled && cloudSync === 'error' ? 'text-amber-300' : syncEnabled ? 'text-emerald-400/90' : 'text-neutral-500'}`}>
                      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${statusTone}`} />
                      {!syncEnabled
                        ? `Saving to this browser · ${widgetCount} cards`
                        : cloudSync === 'saving'
                          ? 'Syncing…'
                          : cloudSync === 'error'
                            ? 'Cloud offline · local copy safe'
                            : `Cloud sync on · ${widgetCount} cards`}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-medium text-neutral-200">
                      {isGuest ? 'Guest mode' : 'Not signed in'}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-neutral-500">
                      <CloudOff size={10} aria-hidden />
                      Saving to this browser only
                    </p>
                  </>
                )}
              </div>
              <div className="mx-2 border-t gp-hairline" />
              <button
                type="button"
                role="menuitem"
                onClick={exportBoard}
                className="mx-1.5 mt-1 flex h-8 w-[calc(100%-12px)] items-center gap-2 rounded-lg px-2 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                <Download size={12} aria-hidden />
                Export JSON backup
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => fileRef.current?.click()}
                className="mx-1.5 flex h-8 w-[calc(100%-12px)] items-center gap-2 rounded-lg px-2 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                <Upload size={12} aria-hidden />
                Restore from backup
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
                  Restore {new Date(snapshots[0].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} snapshot
                </button>
              )}
              <label className="mx-1.5 flex h-8 cursor-pointer items-center justify-between rounded-lg px-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200">
                Completion sounds
                <input type="checkbox" checked={soundOn} onChange={(event) => { setSoundOn(event.target.checked); localStorage.setItem('grovepad:sound', event.target.checked ? 'on' : 'off') }} className="accent-emerald-400" />
              </label>
              {session && supabaseConfigured && (
                <label className="mx-1.5 flex h-8 cursor-pointer items-center justify-between rounded-lg px-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200">
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
                  disabled={cloudSync === 'saving'}
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
        open={Boolean(pendingImport)}
        title="Replace the current board?"
        description="The imported backup will replace every workspace, canvas, widget, group, and connection currently open. A new local snapshot will be kept automatically after the change."
        confirmLabel="Restore backup"
        destructive
        onClose={() => setPendingImport(null)}
        onConfirm={() => {
          if (pendingImport) {
            useWidgetStore.getState().loadBoard(pendingImport)
            useToastStore.getState().addToast('Board restored from backup')
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(restoreSnapshot)}
        title="Restore the latest local snapshot?"
        description={restoreSnapshot ? `Return the board to its state from ${new Date(restoreSnapshot.createdAt).toLocaleString()}.` : ''}
        confirmLabel="Restore snapshot"
        destructive
        onClose={() => setRestoreSnapshot(null)}
        onConfirm={() => {
          if (restoreSnapshot) {
            const board = parsePersistedBoard(restoreSnapshot.board)
            if (board) {
              useWidgetStore.getState().loadBoard(board)
              useToastStore.getState().addToast('Local snapshot restored')
            } else {
              useToastStore.getState().addToast('That local snapshot is no longer readable')
            }
          }
        }}
      />
    </>
  )
}
