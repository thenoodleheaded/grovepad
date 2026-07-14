import { ConfirmDialog } from './ConfirmDialog'
import { usePersistenceStatusStore } from '../../store/usePersistenceStatusStore'
import { resolveCloudConflict } from '../../utils/persistence'

function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'widget' : 'widgets'}`
}

export function CloudConflictDialog() {
  const conflict = usePersistenceStatusStore((state) => state.conflict)
  if (!conflict) return null

  const updated = conflict.cloudUpdatedAt
    ? new Date(conflict.cloudUpdatedAt).toLocaleString()
    : 'an unknown time'

  return (
    <ConfirmDialog
      open
      title="Choose which board to keep"
      description={`This browser has ${countLabel(Object.keys(conflict.local.widgets).length)}, while your cloud board has ${countLabel(Object.keys(conflict.cloud.widgets).length)} and was saved ${updated}. Nothing will be overwritten until you choose.`}
      cancelLabel="Keep this browser"
      confirmLabel="Use cloud board"
      onClose={() => resolveCloudConflict('local')}
      onConfirm={() => resolveCloudConflict('cloud')}
    />
  )
}
