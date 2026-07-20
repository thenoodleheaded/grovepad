import { useEffect, useMemo, useState } from 'react'
import { Copy, MessageCircle, RefreshCw, Send, Share2, Users, X } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useCanvasStore } from '../../store/useCanvasStore'
import {
  canCommentOnCollaborativeCanvas,
  canEditCollaborativeCanvas,
  useCollaborationStore,
} from '../../store/useCollaborationStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import {
  collaborationShareUrl,
  followCollaborator,
  inviteCollaborator,
  postCollaborationComment,
  refreshCollaborationComments,
} from '../../collaboration/collaborationController'
import type { CollaborationRole } from '../../collaboration/types'

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'
}

export function CollaborationWorldOverlay() {
  const participants = useCollaborationStore((state) => state.participants)
  const localClientId = useCollaborationStore((state) => state.localClientId)
  const widgets = useWidgetStore((state) => state.widgets)
  const activeCanvasId = useWidgetStore((state) => state.activeCanvasId)
  const remote = participants.filter((participant) => participant.clientId !== localClientId)

  return (
    <div className="pointer-events-none absolute inset-0 z-[19]" aria-hidden>
      {remote.flatMap((participant) => participant.selectedWidgetIds.map((widgetId) => {
        const widget = widgets[widgetId]
        if (!widget || widget.canvasId !== activeCanvasId) return null
        return (
          <div
            key={`${participant.clientId}:${widgetId}`}
            className="absolute rounded-[24px] border-2"
            style={{
              left: widget.position.x - 4,
              top: widget.position.y - 4,
              width: widget.size.width + 8,
              height: widget.size.height + 8,
              borderColor: participant.color,
              boxShadow: `0 0 0 2px color-mix(in srgb, ${participant.color} 24%, transparent)`,
            }}
          >
            <span
              className="absolute -top-6 left-2 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
              style={{ backgroundColor: participant.color }}
            >
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
  const pan = useCanvasStore((state) => state.pan)
  const zoom = useCanvasStore((state) => state.zoom)
  return (
    <div className="pointer-events-none absolute inset-0 z-[80] overflow-hidden" aria-hidden>
      {participants.map((participant) => {
        if (participant.clientId === localClientId || !participant.cursor) return null
        const left = participant.cursor.x * zoom + pan.x
        const top = participant.cursor.y * zoom + pan.y
        return (
          <div
            key={participant.clientId}
            className="absolute transition-transform duration-75 ease-linear will-change-transform"
            style={{ transform: `translate3d(${left}px, ${top}px, 0)` }}
          >
            <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
              <path d="M2 1.5L16 11.1l-7.1 1.2-3.7 7.1L2 1.5z" fill={participant.color} stroke="white" strokeWidth="1.5" />
            </svg>
            <span
              className="absolute left-3 top-4 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white shadow-lg"
              style={{ backgroundColor: participant.color }}
            >
              {participant.name}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function CollaborationPanel({ close }: { close: () => void }) {
  const canvasId = useCollaborationStore((state) => state.canvasId)
  const role = useCollaborationStore((state) => state.role)
  const comments = useCollaborationStore((state) => state.comments)
  const participants = useCollaborationStore((state) => state.participants)
  const session = useAuthStore((state) => state.session)
  const authorName = (authorId: string): string => {
    if (authorId === session?.user.id) return 'You'
    return participants.find((participant) => participant.userId === authorId)?.name ?? 'Collaborator'
  }
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<CollaborationRole>('editor')
  const [comment, setComment] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (operation: () => Promise<void>, success: string) => {
    setBusy(true)
    setMessage(null)
    try {
      await operation()
      setMessage(success)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => void refreshCollaborationComments().catch(() => {}), 10_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div data-canvas-ui role="dialog" aria-label="Canvas collaboration" className="gp-panel gp-safe-canvas-top-right-row3 absolute z-[150] flex max-h-[min(78vh,640px)] w-[min(92vw,360px)] flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-white">Collaboration</p>
          <p className="text-[11px] capitalize text-neutral-500">{role ?? 'connecting'} access</p>
        </div>
        <button type="button" onClick={close} aria-label="Close collaboration panel" className="gp-touch-target rounded-lg p-2 text-neutral-400 hover:bg-white/5 hover:text-white"><X size={15} /></button>
      </div>

      <div className="overflow-y-auto p-4">
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(
            collaborationShareUrl(canvasId ?? useWidgetStore.getState().activeCanvasId),
          ).then(() => setMessage('Share link copied'))}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-200 hover:bg-white/10"
        >
          <Copy size={13} /> Copy canvas link
        </button>

        {role === 'owner' && (
          <form
            className="mt-4 space-y-2 border-t border-white/8 pt-4"
            onSubmit={(event) => {
              event.preventDefault()
              void run(() => inviteCollaborator(email, inviteRole), 'Access updated').then(() => setEmail(''))
            }}
          >
            <label className="block text-[11px] font-medium text-neutral-400" htmlFor="collaboration-email">Invite by account email</label>
            <input id="collaboration-email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com" className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50" />
            <div className="flex gap-2">
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as CollaborationRole)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-neutral-900 px-2 py-2 text-xs text-neutral-200">
                <option value="editor">Editor</option>
                <option value="commenter">Commenter</option>
                <option value="viewer">Viewer</option>
              </select>
              <button disabled={busy} type="submit" className="rounded-lg bg-emerald-500/90 px-3 py-2 text-xs font-medium text-emerald-950 disabled:opacity-50">Invite</button>
            </div>
          </form>
        )}

        <div className="mt-4 border-t border-white/8 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-300"><MessageCircle size={13} /> Comments</p>
            <button type="button" aria-label="Refresh comments" onClick={() => void run(refreshCollaborationComments, 'Comments refreshed')} className="rounded-md p-1 text-neutral-500 hover:text-white"><RefreshCw size={12} /></button>
          </div>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {comments.length === 0 && <p className="py-4 text-center text-[11px] text-neutral-600">No comments yet.</p>}
            {comments.map((entry) => (
              <div key={entry.id} className={`rounded-lg bg-white/[0.04] p-2.5 ${entry.parentId ? 'ml-4 border-l border-white/10' : ''}`}>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">{entry.body}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-[9px] text-neutral-600">{authorName(entry.authorId)} · {new Date(entry.createdAt).toLocaleString()}</p>
                  {canCommentOnCollaborativeCanvas(role) && !entry.parentId && (
                    <button type="button" onClick={() => setReplyTo(entry.id)} className="text-[9px] text-neutral-500 hover:text-neutral-200">Reply</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {canCommentOnCollaborativeCanvas(role) && (
            <form className="mt-2 flex gap-2" onSubmit={(event) => {
              event.preventDefault()
              if (!comment.trim()) return
              void run(() => postCollaborationComment(comment, replyTo ?? undefined), 'Comment posted').then(() => {
                setComment('')
                setReplyTo(null)
              })
            }}>
              <div className="min-w-0 flex-1">
                {replyTo && <button type="button" onClick={() => setReplyTo(null)} className="mb-1 text-[9px] text-sky-300">Replying · cancel</button>}
                <input value={comment} onChange={(event) => setComment(event.target.value)} maxLength={4000} placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50" />
              </div>
              <button disabled={busy || !comment.trim()} type="submit" aria-label="Post comment" className="rounded-lg bg-white/8 p-2 text-neutral-300 hover:bg-white/12 disabled:opacity-40"><Send size={14} /></button>
            </form>
          )}
        </div>
        {message && <p role="status" className="mt-3 text-[10px] text-emerald-300">{message}</p>}
      </div>
    </div>
  )
}

export function CollaborationChrome() {
  const status = useCollaborationStore((state) => state.status)
  const role = useCollaborationStore((state) => state.role)
  const participants = useCollaborationStore((state) => state.participants)
  const localClientId = useCollaborationStore((state) => state.localClientId)
  const followingClientId = useCollaborationStore((state) => state.followingClientId)
  const error = useCollaborationStore((state) => state.error)
  const [open, setOpen] = useState(false)
  const remoteCount = useMemo(
    () => participants.filter((participant) => participant.clientId !== localClientId).length,
    [participants, localClientId],
  )
  if (status === 'disabled') return null
  const readOnly = role !== null && !canEditCollaborativeCanvas(role)

  return (
    <>
      {/* Docks below CanvasToolbar's right-hand button cluster instead of
          sharing its corner — both anchored top-right independently, and a
          flush top-3/right-3 collided directly with the toolbar's icons. */}
      <div data-canvas-ui className="gp-safe-canvas-top-right-row2 absolute z-[90] flex items-center gap-2">
        {participants.slice(0, 5).map((participant) => (
          <button
            type="button"
            key={participant.clientId}
            onClick={() => followCollaborator(
              participant.clientId === localClientId || followingClientId === participant.clientId
                ? null : participant.clientId,
            )}
            title={participant.clientId === localClientId ? `${participant.name} (you)` : `Follow ${participant.name}`}
            aria-pressed={followingClientId === participant.clientId}
            className={`-ml-3 flex h-8 w-8 items-center justify-center rounded-full border-2 text-[10px] font-semibold text-white shadow-lg first:ml-0 ${followingClientId === participant.clientId ? 'ring-2 ring-white/70' : ''}`}
            style={{ backgroundColor: participant.color, borderColor: '#171717' }}
          >
            {initials(participant.name)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="gp-panel flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-[11px] text-neutral-300 shadow-lg hover:bg-white/8"
          title={error ?? `Collaboration ${status}`}
        >
          <span className={`h-2 w-2 rounded-full ${status === 'connected' ? 'bg-emerald-400' : status === 'error' ? 'bg-rose-400' : 'bg-amber-400'}`} />
          <Users size={13} /> {remoteCount}
          {readOnly && <span className="capitalize text-amber-300">{role}</span>}
          <Share2 size={12} />
        </button>
      </div>
      {followingClientId !== null && (
        // Both this pill and the presence bar can be visible at once, and
        // the pill is centered while the presence bar is right-anchored —
        // sharing a row risks a horizontal collision at narrow widths, so
        // the pill sits a full row lower instead, clear in every case.
        <button data-canvas-ui type="button" onClick={() => followCollaborator(null)} className="gp-panel absolute left-1/2 z-[90] -translate-x-1/2 rounded-full border border-sky-400/30 px-3 py-1.5 text-[11px] text-sky-200 shadow-xl" style={{ top: 'var(--gp-toolbar-row3-top)' }}>
          Following collaborator · click to stop
        </button>
      )}
      {open && <CollaborationPanel close={() => setOpen(false)} />}
    </>
  )
}
