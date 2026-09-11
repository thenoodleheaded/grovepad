import { useCollaborationStore } from '../../store/useCollaborationStore'
import { ConfirmDialog } from './ConfirmDialog'

/**
 * The gate on a `?collaborate=` link.
 *
 * Opening one used to join immediately: it marked a local canvas shared and
 * replaced its contents with the sender's document, all on page load. A link
 * could therefore blank somebody's board, and the emptied board then synced to
 * their cloud copy. Accepting is a decision now, and the copy says plainly what
 * the decision costs.
 */
export function CanvasInviteDialog() {
  const invite = useCollaborationStore((state) => state.pendingInvite)

  return (
    <ConfirmDialog
      open={invite !== null}
      title={invite ? `Open “${invite.name}”?` : 'Open shared canvas?'}
      description={
        'This canvas is shared with you. Opening it adds it to your board and keeps it in sync '
        + 'with everyone else on it, so their changes replace what this canvas holds on this '
        + 'device. Only open canvases from people you trust.'
      }
      confirmLabel="Open canvas"
      cancelLabel="Not now"
      onConfirm={() => {
        void import('../../runtime/collaborationRuntime')
          .then(({ acceptPendingCanvasInvite }) => acceptPendingCanvasInvite())
      }}
      onClose={() => {
        void import('../../runtime/collaborationRuntime')
          .then(({ dismissPendingCanvasInvite }) => { dismissPendingCanvasInvite() })
      }}
    />
  )
}
