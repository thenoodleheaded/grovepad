import { useWidgetDeletionDialogStore } from '../../store/useWidgetDeletionDialogStore'
import { ConfirmDialog } from './ConfirmDialog'

export function WidgetDeletionDialog() {
  const pending = useWidgetDeletionDialogStore((state) => state.pending)
  const widgets = pending?.impact.removedWidgetIds.size ?? 0
  const canvases = pending?.impact.removedCanvasIds.size ?? 0
  return (
    <ConfirmDialog
      open={Boolean(pending)}
      title="Delete this nested canvas and its contents?"
      description={`This removes ${widgets} widget${widgets === 1 ? '' : 's'} across ${canvases} nested canvas${canvases === 1 ? '' : 'es'}. You can immediately restore the entire deletion with Undo.`}
      confirmLabel="Delete subtree"
      destructive
      onClose={() => useWidgetDeletionDialogStore.getState().close()}
      onConfirm={() => useWidgetDeletionDialogStore.getState().confirm()}
    />
  )
}
