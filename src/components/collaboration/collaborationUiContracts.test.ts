/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ui = readFileSync(new URL('./CollaborationOverlays.tsx', import.meta.url), 'utf8')
const controller = readFileSync(new URL('../../collaboration/collaborationController.ts', import.meta.url), 'utf8')
const runtime = readFileSync(new URL('../../runtime/collaborationRuntime.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../../store/useCollaborationStore.ts', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../../styles/product/07-collaboration.css', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../canvas/CanvasViewport.tsx', import.meta.url), 'utf8')

describe('collaboration UI contracts', () => {
  it('exposes the complete collaboration surface in three clear sections', () => {
    for (const label of ['People', 'Share', 'Comments']) expect(ui).toContain(`'${label}'`)
    expect(ui).toContain('aria-label="Multiplayer sections"')
    expect(ui).toContain('>Multiplayer</h2>')
    expect(ui).not.toContain('>Collaboration</h2>')
    expect(ui).toContain('people online')
    expect(ui).toContain('gp-collaboration-people')
    expect(ui).toContain('Follow')
    expect(ui).toContain('Writing a reply')
  })

  it('states the real sharing and access boundaries', () => {
    expect(ui).toContain('Only “{canvasName}” is shared')
    expect(ui).toContain('Files stored only on this device are not uploaded by multiplayer.')
    expect(ui).toContain('The person needs an existing Grovepad account.')
    expect(ui).toContain('This does not send email')
    expect(ui).toContain('Entering the same email again changes that person’s role.')
  })

  it('makes every role and connection state understandable', () => {
    for (const status of ['Connecting', 'Live', 'Reconnecting', 'Offline', 'Realtime paused']) {
      expect(ui).toContain(`label: '${status}'`)
    }
    for (const role of ['Owner', 'Editor', 'Commenter', 'Viewer']) {
      expect(ui).toContain(`label: '${role}'`)
    }
    expect(ui).toContain('Viewers can read comments but cannot post.')
  })

  it('surfaces queued work and provides a real retry path', () => {
    expect(store).toContain('pendingUpdates: number')
    expect(ui).toContain('{pendingUpdates} queued')
    expect(ui).toContain('Local edits remain safe')
    expect(ui).toContain('aria-label="Retry multiplayer"')
    expect(ui).toContain('retryCollaboration')
    expect(controller).toContain('retry: () => Promise<void>')
    expect(runtime).toContain('retry: retryCurrentCollaboration')
    expect(runtime).toContain('publishPendingUpdateCount')
  })

  it('keeps the multiplayer popup narrow and composes the shared popup surfaces', () => {
    expect(ui).toContain('w-[min(92vw,340px)]')
    expect(ui).toContain('gp-popup-title-pill')
    expect(ui).toContain('gp-popup-nav-backplate')
    expect(ui).toContain('gp-popup-surface')
    expect(ui).toContain('gp-popup-close-naked')
    expect(ui).toContain('gp-collaboration-tab-indicator')
    expect(styles).toContain('.gp-collaboration-tab-lens')
    expect(styles).toContain('cubic-bezier(0.2, 1.34, 0.32, 1)')
    expect(styles).not.toContain('.gp-collaboration-tab-active')
  })

  it('expands out of the control chip and collapses back into it', () => {
    // The panel must outlive `open` or the close animation never plays.
    expect(ui).toContain('const [rendered, setRendered] = useState(false)')
    expect(ui).toContain('{(open || rendered) && (')
    expect(ui).toContain('onExited={() => setRendered(false)}')
    expect(ui).toContain("state={open ? 'open' : 'closed'}")
    expect(ui).toContain("if (event.target === event.currentTarget && state === 'closed') onExited()")
    // The concise cluster gets out of the way while the full surface grows.
    expect(ui).toContain("data-state={open ? 'hidden' : 'visible'}")
    expect(ui).toContain('inert={open ? true : undefined}')
    expect(styles).toContain(".gp-collaboration-compact[data-state='hidden']")
    expect(styles).toContain('opacity: 0')
    expect(ui).toContain("autoFocus={state === 'open'}")
    // Growth starts at the shared corner, not the panel's centre.
    expect(styles).toContain('transform-origin: top right')
    expect(styles).toContain('@keyframes gp-collaboration-expand')
    expect(styles).toContain('@keyframes gp-collaboration-collapse')
    // Staggered surfaces are what make it read as one liquid movement.
    expect(styles).toContain('@keyframes gp-collaboration-surface-in')
    expect(styles).toContain('@keyframes gp-collaboration-surface-out')
    expect(styles).toContain('animation-delay: 110ms')
    // A one-shot pop would fight the expansion and cannot animate out. Matched
    // exactly so the shared `gp-popup-*` surface classes still pass.
    expect(ui).not.toMatch(/gp-pop(?![\w-])/)
    // Reduced motion still has to finish so the panel can unmount.
    expect(styles).toContain('animation-duration: 0.01ms !important')
    expect(styles).toContain('transition-duration: 0.01ms !important')
  })

  it('hides multiplayer chrome for a private canvas', () => {
    expect(ui).toContain("state.canvases[state.activeCanvasId]?.shared === true")
    expect(ui).toContain('if (!canvasShared) return null')
    expect(ui).toContain('if (!canvasShared) setOpen(false)')
    expect(ui).not.toContain("if (!canvasShared || status === 'disabled') return null")
    expect(viewport).toContain('const canvasShared = activeCanvas?.shared === true')
    expect(viewport).toContain('{canvasShared && <Suspense fallback={null}><CollaborationWorldOverlay /></Suspense>}')
    expect(viewport).toContain('{canvasShared && <Suspense fallback={null}><RemoteCursorLayer /></Suspense>}')
    expect(viewport).toContain('{canvasShared && <Suspense fallback={null}><CollaborationChrome /></Suspense>}')
    expect(viewport).not.toContain('collaborationEnabled')
  })

  it('keeps shared-link startup and missed realtime messages self-repairing', () => {
    expect(runtime).toContain('function startCollaborationForSession(session: Session)')
    expect(runtime).toContain('if (state.session) startCollaborationForSession(state.session)')
    expect(runtime).toContain('DURABLE_REPAIR_INTERVAL_MS')
    expect(runtime).toContain('scheduleDurableRepair()')
    expect(runtime).toContain("if (response !== 'ok') throw new Error(`Realtime presence ${response}`)")
    expect(runtime).toContain('subscriptionError?.message ?? null')
  })

  it('uses Presence only for membership and Broadcast for changing awareness', () => {
    expect(runtime).toContain("const AWARENESS_EVENT = 'awareness'")
    expect(runtime).toContain('repository.awarenessChannel(canvasId, session.user.id)')
    expect(runtime).toContain('awarenessChannel.track({')
    expect(runtime).toContain('awarenessChannel.send({')
    expect(runtime).toContain('AWARENESS_BROADCAST_INTERVAL_MS')
    expect(runtime).toContain("awarenessChannel.on('broadcast', { event: AWARENESS_EVENT }")
    expect(runtime).not.toContain('void publishPresence().catch(reportRealtimeFailure)')
  })
})
