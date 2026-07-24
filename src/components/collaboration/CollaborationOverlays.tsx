import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  Copy,
  Crosshair,
  Eye,
  Link2,
  MessageCircle,
  Pencil,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import {
  canCommentOnCollaborativeCanvas,
  useCollaborationStore,
  type CollaborationStatus,
} from '../../store/useCollaborationStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useWidgetRestStore } from '../../store/useWidgetRestStore'
import { isWidgetResting, widgetWithEffectiveSize } from '../../utils/widgetRest'
import { cameraEngine } from '../../engine/camera/cameraEngine'
import {
  collaborationShareUrl,
  followCollaborator,
  inviteCollaborator,
  postCollaborationComment,
  refreshCollaborationComments,
  retryCollaboration,
} from '../../collaboration/collaborationController'
import type { CollaborationPresence, CollaborationRole } from '../../collaboration/types'

type CollaborationTab = 'people' | 'share' | 'comments'

const COLLABORATION_TABS = [
  ['people', 'People', Users],
  ['share', 'Share', Share2],
  ['comments', 'Comments', MessageCircle],
] as const

const STATUS_META: Record<CollaborationStatus, { label: string; detail: string; dot: string }> = {
  disabled: { label: 'Unavailable', detail: 'Multiplayer is not running.', dot: 'bg-neutral-500' },
  connecting: { label: 'Connecting', detail: 'Opening the shared canvas…', dot: 'bg-amber-300 animate-pulse' },
  connected: { label: 'Live', detail: 'Changes and presence are updating live.', dot: 'bg-emerald-400' },
  reconnecting: { label: 'Reconnecting', detail: 'Local changes are safe while Grovepad reconnects.', dot: 'bg-amber-300 animate-pulse' },
  offline: { label: 'Offline', detail: 'Changes stay on this device and will send when you reconnect.', dot: 'bg-amber-400' },
  error: { label: 'Realtime paused', detail: 'Grovepad could not open the multiplayer connection.', dot: 'bg-rose-400' },
}

const ROLE_META: Record<CollaborationRole, { label: string; short: string; detail: string }> = {
  owner: { label: 'Owner', short: 'Full access', detail: 'Edit, comment, and manage access.' },
  editor: { label: 'Editor', short: 'Can edit', detail: 'Edit the canvas and join comments.' },
  commenter: { label: 'Commenter', short: 'Comments only', detail: 'View the canvas and join comments.' },
  viewer: { label: 'Viewer', short: 'View only', detail: 'View and follow people without changing the canvas.' },
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'
}

function Avatar({ participant, size = 'normal', local = false }: { participant: CollaborationPresence; size?: 'small' | 'normal'; local?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full border-2 border-neutral-950 font-semibold text-white shadow-lg ${size === 'small' ? 'h-7 w-7 text-[9px]' : 'h-8 w-8 text-[9px]'} ${local ? 'ring-2 ring-emerald-300/35 ring-offset-1 ring-offset-neutral-950' : ''}`}
      style={{ backgroundColor: participant.color }}
    >
      {initials(participant.name)}
    </span>
  )
}

function RoleIcon({ role }: { role: CollaborationRole }) {
  const Icon = role === 'owner'
    ? ShieldCheck
    : role === 'editor'
      ? Pencil
      : role === 'commenter'
        ? MessageCircle
        : Eye
  return <Icon size={13} aria-hidden />
}

export function CollaborationWorldOverlay() {
  const participants = useCollaborationStore((state) => state.participants)
  const localClientId = useCollaborationStore((state) => state.localClientId)
  const widgets = useWidgetStore((state) => state.widgets)
  const activeCanvasId = useWidgetStore((state) => state.activeCanvasId)
  const expandedWidgetId = useWidgetRestStore((state) => state.expandedWidgetId)
  const expandedOffset = useWidgetRestStore((state) => state.expandedOffset)
  const remote = participants.filter((participant) => participant.clientId !== localClientId)

  return (
    <div className="pointer-events-none absolute inset-0 z-[19]" aria-hidden>
      {remote.flatMap((participant) => participant.selectedWidgetIds.map((widgetId) => {
        const stored = widgets[widgetId]
        if (!stored || stored.canvasId !== activeCanvasId) return null
        // Outline the footprint actually on screen: a resting widget draws as
        // a small tile, so its stored full-card size would ring empty canvas.
        const restCtx = {
          expandedWidgetId,
          expandedOffset,
        }
        const resting = isWidgetResting(stored, restCtx)
        // Effective footprint, position included: an expanded card is offset
        // off its stored spot so it grows from its own centre.
        const widget = widgetWithEffectiveSize(stored, restCtx)
        const size = widget.size
        return (
          <div
            key={`${participant.clientId}:${widgetId}`}
            className={`absolute border-2 ${resting ? 'rounded-[20px]' : 'rounded-[24px]'}`}
            style={{
              left: widget.position.x - 4,
              top: widget.position.y - 4,
              width: size.width + 8,
              height: size.height + 8,
              borderColor: participant.color,
              boxShadow: `0 0 0 2px color-mix(in srgb, ${participant.color} 24%, transparent)`,
            }}
          >
            <span className="absolute -top-6 left-2 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white shadow" style={{ backgroundColor: participant.color }}>
              {participant.name}
            </span>
          </div>
        )
      }))}
    </div>
  )
}

export function RemoteCursorLayer() {
  const participants = useCollaborationStore((state) => state.participants)
  const localClientId = useCollaborationStore((state) => state.localClientId)
  const worldRef = useRef<HTMLDivElement>(null)

  // Cursors live in world space and ride one camera-driven transform, written
  // imperatively per frame. Deriving screen positions from the pan/zoom store
  // instead would re-render every cursor through React on every pan frame —
  // the same defect already fixed for the world-space SVG edge layers.
  useEffect(() => {
    const apply = (frame: { pan: { x: number; y: number }; zoom: number }) => {
      const element = worldRef.current
      if (!element) return
      element.style.transform = `translate3d(${frame.pan.x}px, ${frame.pan.y}px, 0) scale(${frame.zoom})`
      // Cursors counter-scale by this so they stay a constant on-screen size.
      element.style.setProperty('--gp-cursor-inverse-scale', String(1 / (frame.zoom || 1)))
    }
    apply(cameraEngine.getFrame())
    return cameraEngine.onFrame(apply)
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 z-[80] overflow-hidden" aria-hidden>
      <div ref={worldRef} className="absolute left-0 top-0 origin-top-left will-change-transform">
        {participants.map((participant) => {
          if (participant.clientId === localClientId || !participant.cursor) return null
          return (
            <div
              key={participant.clientId}
              className="absolute left-0 top-0 origin-top-left"
              style={{
                transform: `translate3d(${participant.cursor.x}px, ${participant.cursor.y}px, 0)`,
                // Glides between successive presence updates instead of
                // snapping to each one — deliberately trades exact live
                // position for a cursor that reads as smooth motion rather
                // than a draggy stepped catch-up. Reuses the app's own
                // "layout glide" motion token rather than a one-off value.
                transition: 'transform var(--gp-motion-layout) var(--gp-ease-layout)',
              }}
            >
              {/* Separate element for the zoom counter-scale: it changes every
                  frame during a zoom and must never inherit the cursor's own
                  position transition, or the pointer would lag the camera. */}
              <div className="origin-top-left" style={{ transform: 'scale(var(--gp-cursor-inverse-scale, 1))' }}>
                <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
                  <path d="M2 1.5L16 11.1l-7.1 1.2-3.7 7.1L2 1.5z" fill={participant.color} stroke="white" strokeWidth="1.5" />
                </svg>
                <span className="absolute left-3 top-4 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white shadow-lg" style={{ backgroundColor: participant.color }}>
                  {participant.name}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ConnectionSummary({ onRetry }: { onRetry: () => void }) {
  const status = useCollaborationStore((state) => state.status)
  const error = useCollaborationStore((state) => state.error)
  const pendingUpdates = useCollaborationStore((state) => state.pendingUpdates)
  const meta = STATUS_META[status]
  const retryable = status === 'error' || status === 'offline' || status === 'reconnecting'

  if (status === 'connected' && pendingUpdates === 0) return null

  return (
    <section
      className={`gp-collaboration-summary flex min-h-9 items-center gap-2 rounded-lg px-2.5 py-1.5 ${status === 'error' ? 'gp-collaboration-summary-error' : ''}`}
      aria-label={`Multiplayer connection: ${meta.label}. ${error || meta.detail} Local edits remain safe.`}
      title={error || meta.detail}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
      <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-neutral-200">{meta.label}</p>
      <span title="Local edits remain safe" className="flex text-emerald-300/70">
        <ShieldCheck size={12} aria-hidden />
        <span className="sr-only">Local edits remain safe</span>
      </span>
      {pendingUpdates > 0 && <span className="rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-200">{pendingUpdates} queued</span>}
      {retryable && (
        <button type="button" onClick={onRetry} aria-label="Retry multiplayer" title="Retry multiplayer" className="gp-collaboration-icon-action"><RefreshCw size={12} aria-hidden /></button>
      )}
    </section>
  )
}

function PeopleTab() {
  const participants = useCollaborationStore((state) => state.participants)
  const localClientId = useCollaborationStore((state) => state.localClientId)
  const followingClientId = useCollaborationStore((state) => state.followingClientId)
  const widgets = useWidgetStore((state) => state.widgets)

  return (
    <section aria-label={`${participants.length} people online`} className="gp-collaboration-people overflow-hidden rounded-xl">
      {participants.length === 0 && (
        <div className="px-3 py-5 text-center text-[11px] text-neutral-600">Connecting your presence…</div>
      )}
      {participants.map((participant) => {
        const local = participant.clientId === localClientId
        const following = participant.clientId === followingClientId
        const editingTitle = participant.editingWidgetId ? widgets[participant.editingWidgetId]?.title : null
        return (
          <div key={participant.clientId} className="gp-collaboration-person flex min-h-12 items-center gap-2.5 px-2.5 py-1.5">
            <Avatar participant={participant} local={local} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-neutral-200">{participant.name}</p>
              <p className="mt-0.5 flex items-center gap-1 truncate text-[9px] text-neutral-600">
                {editingTitle && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" aria-hidden />}
                {editingTitle ? `Editing ${editingTitle}` : ROLE_META[participant.role].label}
              </p>
            </div>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-500" aria-label={`${ROLE_META[participant.role].label}: ${ROLE_META[participant.role].detail}`} title={`${ROLE_META[participant.role].label} · ${ROLE_META[participant.role].short}`}>
              <RoleIcon role={participant.role} />
            </span>
            {!local && (
              <button type="button" aria-label={following ? `Stop following ${participant.name}` : `Follow ${participant.name}`} title={following ? 'Stop following' : 'Follow'} aria-pressed={following} onClick={() => followCollaborator(following ? null : participant.clientId)} className={`gp-collaboration-icon-action ${following ? 'gp-collaboration-icon-action-active' : ''}`}>
                <Crosshair size={12} aria-hidden />
              </button>
            )}
          </div>
        )
      })}
    </section>
  )
}

function ShareTab({ run, message }: {
  run: (operation: () => Promise<void>, success: string) => Promise<boolean>
  message: { text: string; tone: 'success' | 'error' } | null
}) {
  const canvasId = useCollaborationStore((state) => state.canvasId)
  const role = useCollaborationStore((state) => state.role)
  const activeCanvasId = useWidgetStore((state) => state.activeCanvasId)
  const canvasName = useWidgetStore((state) => state.canvases[state.activeCanvasId]?.name ?? 'Current canvas')
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Exclude<CollaborationRole, 'owner'>>('editor')
  const [busy, setBusy] = useState(false)

  const copyLink = async () => {
    await navigator.clipboard.writeText(collaborationShareUrl(canvasId ?? activeCanvasId))
  }

  return (
    <div className="space-y-3">
      <section className="gp-collaboration-card rounded-xl p-3">
        <div className="flex items-start gap-2.5">
          <Link2 size={14} className="mt-0.5 shrink-0 text-emerald-300" />
          <div>
            <p className="text-xs font-semibold text-neutral-200">Only “{canvasName}” is shared</p>
            <p className="mt-1 text-[10px] leading-4 text-neutral-500">Other canvases stay private. Files stored only on this device are not uploaded by multiplayer.</p>
          </div>
        </div>
      </section>

      <button type="button" onClick={() => void run(copyLink, 'Canvas link copied')} className="gp-collaboration-primary-action w-full">
        <Copy size={13} />Copy canvas link
      </button>

      {role === 'owner' ? (
        <form className="gp-collaboration-card space-y-3 rounded-xl p-3" onSubmit={(event) => {
          event.preventDefault()
          setBusy(true)
          void run(() => inviteCollaborator(email, inviteRole), `Access granted to ${email}`)
            .then((ok) => { if (ok) setEmail('') })
            .finally(() => setBusy(false))
        }}>
          <div className="flex items-start gap-2.5">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-sky-300" />
            <div>
              <p className="text-xs font-semibold text-neutral-200">Grant or update access</p>
              <p className="mt-1 text-[10px] leading-4 text-neutral-500">The person needs an existing Grovepad account. This does not send email—copy the link above and send it separately.</p>
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-medium text-neutral-500">Account email</span>
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com" className="gp-collaboration-input" />
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label>
              <span className="sr-only">Access role</span>
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Exclude<CollaborationRole, 'owner'>)} className="gp-collaboration-input">
                <option value="editor">Editor · can edit</option>
                <option value="commenter">Commenter · comments only</option>
                <option value="viewer">Viewer · view only</option>
              </select>
            </label>
            <button disabled={busy} type="submit" className="gp-collaboration-primary-action">{busy ? 'Saving…' : 'Grant access'}</button>
          </div>
          <p className="text-[9px] leading-4 text-neutral-600">Entering the same email again changes that person’s role.</p>
        </form>
      ) : (
        <section className="gp-collaboration-card rounded-xl p-3 text-[10px] leading-4 text-neutral-500">
          Only the canvas owner can grant or change access. You can still copy and send the link to someone who already has access.
        </section>
      )}

      {message && <p role="status" className={`text-[10px] ${message.tone === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>{message.text}</p>}
    </div>
  )
}

function CommentsTab({ run, message }: {
  run: (operation: () => Promise<void>, success: string) => Promise<boolean>
  message: { text: string; tone: 'success' | 'error' } | null
}) {
  const comments = useCollaborationStore((state) => state.comments)
  const role = useCollaborationStore((state) => state.role)
  const participants = useCollaborationStore((state) => state.participants)
  const session = useAuthStore((state) => state.session)
  const [comment, setComment] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const authorName = (authorId: string): string => {
    if (authorId === session?.user.id) return 'You'
    return participants.find((participant) => participant.userId === authorId)?.name ?? 'Collaborator'
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-neutral-600">Updates automatically while this panel is open.</p>
        <button type="button" aria-label="Refresh comments" onClick={() => void run(refreshCollaborationComments, 'Comments refreshed')} className="gp-collaboration-small-action"><RefreshCw size={11} />Refresh</button>
      </div>
      <section className="max-h-64 space-y-2 overflow-y-auto pr-1" aria-label="Canvas comments">
        {comments.length === 0 && <div className="gp-collaboration-card rounded-xl px-3 py-8 text-center text-[11px] text-neutral-600">No comments yet.</div>}
        {comments.map((entry) => (
          <article key={entry.id} className={`gp-collaboration-comment rounded-xl p-3 ${entry.parentId ? 'ml-5' : ''}`}>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">{entry.body}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[9px] text-neutral-600">{authorName(entry.authorId)} · {new Date(entry.createdAt).toLocaleString()}</p>
              {canCommentOnCollaborativeCanvas(role) && !entry.parentId && <button type="button" onClick={() => setReplyTo(entry.id)} className="text-[9px] text-sky-300 hover:text-sky-200">Reply</button>}
            </div>
          </article>
        ))}
      </section>
      {canCommentOnCollaborativeCanvas(role) ? (
        <form className="gp-collaboration-card rounded-xl p-2" onSubmit={(event) => {
          event.preventDefault()
          if (!comment.trim()) return
          setBusy(true)
          void run(() => postCollaborationComment(comment, replyTo ?? undefined), replyTo ? 'Reply posted' : 'Comment posted')
            .then((ok) => {
              if (!ok) return
              setComment('')
              setReplyTo(null)
            })
            .finally(() => setBusy(false))
        }}>
          {replyTo && <div className="mb-1 flex items-center justify-between px-1 text-[9px] text-sky-300"><span>Writing a reply</span><button type="button" onClick={() => setReplyTo(null)}>Cancel</button></div>}
          <div className="flex items-end gap-2">
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={4000} rows={2} placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'} className="gp-collaboration-input min-h-16 resize-none" />
            <button disabled={busy || !comment.trim()} type="submit" aria-label={replyTo ? 'Post reply' : 'Post comment'} className="gp-collaboration-send"><Send size={14} /></button>
          </div>
        </form>
      ) : (
        <div className="gp-collaboration-card rounded-xl p-3 text-[10px] text-neutral-500">Viewers can read comments but cannot post.</div>
      )}
      {message && <p role="status" className={`text-[10px] ${message.tone === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>{message.text}</p>}
    </div>
  )
}

function CollaborationPanel({ close, state, onExited }: { close: () => void; state: 'open' | 'closed'; onExited: () => void }) {
  const status = useCollaborationStore((state) => state.status)
  const comments = useCollaborationStore((state) => state.comments)
  const participants = useCollaborationStore((state) => state.participants)
  const [tab, setTab] = useState<CollaborationTab>('people')
  const [message, setMessage] = useState<{ text: string; tone: 'success' | 'error' } | null>(null)

  const run = async (operation: () => Promise<void>, success: string): Promise<boolean> => {
    setMessage(null)
    try {
      await operation()
      setMessage({ text: success, tone: 'success' })
      return true
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), tone: 'error' })
      return false
    }
  }

  const retry = () => void run(retryCollaboration, 'Reconnecting…')

  useEffect(() => {
    const timer = window.setInterval(() => void refreshCollaborationComments().catch(() => {}), 10_000)
    return () => window.clearInterval(timer)
  }, [])

  const activeTabIndex = COLLABORATION_TABS.findIndex(([id]) => id === tab)

  return (
    <div
      data-canvas-ui
      role="dialog"
      aria-label="Canvas multiplayer"
      data-state={state}
      aria-hidden={state === 'closed'}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && state === 'closed') onExited()
      }}
      className="gp-collaboration-panel absolute z-[150] flex max-h-[min(68vh,500px)] w-[min(92vw,340px)] flex-col gap-2"
    >
      <header className="gp-collaboration-floating-header flex min-h-9 shrink-0 items-center justify-between px-1">
        <div className="gp-popup-title-pill gp-panel flex h-9 min-w-0 items-center gap-2 rounded-full px-3.5">
          <span className={`h-2 w-2 rounded-full ${STATUS_META[status].dot}`} />
          <h2 className="truncate text-[13px] font-semibold text-white">Multiplayer</h2>
          <span className="text-[9px] text-neutral-600">{participants.length} online</span>
        </div>
        <button type="button" autoFocus={state === 'open'} onClick={close} aria-label="Close multiplayer panel" className="gp-popup-close-naked gp-touch-target h-8 w-8"><X size={15} /></button>
      </header>

      <div className="gp-popup-nav-backplate gp-panel shrink-0 rounded-2xl p-1.5">
        <nav
          className="gp-collaboration-nav relative flex gap-1 rounded-xl p-1"
          aria-label="Multiplayer sections"
          style={{ '--gp-collaboration-tab-index': activeTabIndex } as CSSProperties}
        >
          <span aria-hidden className="gp-collaboration-tab-indicator"><span className="gp-collaboration-tab-lens" /></span>
          {COLLABORATION_TABS.map(([id, label, Icon]) => (
            <button key={id} type="button" aria-label={label} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setMessage(null) }} className="gp-collaboration-tab relative z-10 flex-1">
              <Icon size={12} />{label}{id === 'people' && <span aria-hidden className="text-[9px] opacity-60">{participants.length}</span>}{id === 'comments' && comments.length > 0 && <span aria-hidden className="text-[9px] opacity-60">{comments.length}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="gp-collaboration-content gp-popup-surface gp-panel min-h-0 flex-1 overflow-hidden rounded-[22px]">
        <div className="h-full space-y-2.5 overflow-y-auto p-2.5">
          <ConnectionSummary onRetry={retry} />
          <div>
            {tab === 'people' && <PeopleTab />}
            {tab === 'share' && <ShareTab run={run} message={message} />}
            {tab === 'comments' && <CommentsTab run={run} message={message} />}
            {tab === 'people' && message && <p role="status" className={`mt-2 text-[10px] ${message.tone === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>{message.text}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

export function CollaborationChrome() {
  const canvasShared = useWidgetStore((state) => state.canvases[state.activeCanvasId]?.shared === true)
  const status = useCollaborationStore((state) => state.status)
  const role = useCollaborationStore((state) => state.role)
  const participants = useCollaborationStore((state) => state.participants)
  const localClientId = useCollaborationStore((state) => state.localClientId)
  const followingClientId = useCollaborationStore((state) => state.followingClientId)
  const pendingUpdates = useCollaborationStore((state) => state.pendingUpdates)
  const error = useCollaborationStore((state) => state.error)
  const [open, setOpen] = useState(false)
  // The panel animates closed, so it outlives `open` by one exit animation.
  // `rendered` holds it in the DOM until that animation reports it is done.
  const [rendered, setRendered] = useState(false)
  const remote = useMemo(() => participants.filter((participant) => participant.clientId !== localClientId), [participants, localClientId])
  const visibleParticipants = participants.slice(0, 4)
  const hiddenParticipantCount = Math.max(0, participants.length - visibleParticipants.length)
  const followed = participants.find((participant) => participant.clientId === followingClientId)
  const statusMeta = STATUS_META[status]

  useOverlayLifecycle(open)

  useEffect(() => {
    if (open) setRendered(true)
  }, [open])

  useEffect(() => {
    if (!canvasShared) setOpen(false)
  }, [canvasShared])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!canvasShared) return null

  const roleLabel = role ? ROLE_META[role].short : null
  // Count everyone present, including this client. Reporting only remote peers
  // told a solo but fully-connected user "0 online", which reads as broken —
  // and contradicted the People list, which has always counted everyone.
  const controlLabel = status !== 'connected'
    ? statusMeta.label
    : remote.length === 0
      ? 'Only you'
      : `${participants.length} here`

  return (
    <>
      <div
        data-canvas-ui
        data-state={open ? 'hidden' : 'visible'}
        inert={open ? true : undefined}
        className="gp-collaboration-compact gp-canvas-ui-scale gp-safe-canvas-top-right-row2 absolute z-[90] flex items-center gap-2"
      >
        <div className="flex items-center" aria-label={`${participants.length} people online`}>
          {visibleParticipants.map((participant) => (
            <button type="button" key={participant.clientId} onClick={() => followCollaborator(participant.clientId === localClientId || followingClientId === participant.clientId ? null : participant.clientId)} title={participant.clientId === localClientId ? `${participant.name} (you)` : `Follow ${participant.name}`} aria-pressed={followingClientId === participant.clientId} className={`-ml-2.5 rounded-full first:ml-0 ${followingClientId === participant.clientId ? 'ring-2 ring-sky-300/80' : ''}`}>
              <Avatar participant={participant} size="small" />
            </button>
          ))}
          {hiddenParticipantCount > 0 && <span className="-ml-2.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-neutral-950 bg-neutral-700 text-[9px] font-semibold text-neutral-200">+{hiddenParticipantCount}</span>}
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`Multiplayer: ${controlLabel}${roleLabel ? `, ${roleLabel}` : ''}`} className="gp-collaboration-control gp-panel flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-[11px] text-neutral-300 shadow-lg" title={error ?? statusMeta.detail}>
          <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
          <Users size={13} />
          <span>{controlLabel}</span>
          {pendingUpdates > 0 && <span className="text-[9px] text-amber-200">{pendingUpdates} queued</span>}
          {roleLabel && <span className={`hidden border-l border-white/10 pl-2 sm:inline ${role === 'commenter' || role === 'viewer' ? 'text-amber-200' : 'text-neutral-500'}`}>{roleLabel}</span>}
        </button>
      </div>

      {followingClientId !== null && (
        <button data-canvas-ui type="button" onClick={() => followCollaborator(null)} className="gp-panel absolute left-1/2 z-[90] -translate-x-1/2 rounded-full border border-sky-400/30 px-3 py-1.5 text-[11px] text-sky-200 shadow-xl" style={{ top: 'var(--gp-toolbar-row3-top)' }}>
          Following {followed?.name ?? 'collaborator'} · Stop
        </button>
      )}

      {(open || rendered) && (
        <>
          <button data-canvas-ui type="button" disabled={!open} aria-label="Close multiplayer panel" onClick={() => setOpen(false)} data-state={open ? 'open' : 'closed'} className="gp-collaboration-backdrop fixed inset-0 z-[149]" />
          <CollaborationPanel close={() => setOpen(false)} state={open ? 'open' : 'closed'} onExited={() => setRendered(false)} />
        </>
      )}
    </>
  )
}
