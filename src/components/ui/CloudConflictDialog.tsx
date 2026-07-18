import { ConfirmDialog } from './ConfirmDialog'
import { usePersistenceStatusStore } from '../../store/usePersistenceStatusStore'
import { resolveCloudConflict } from '../../utils/persistence'

function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'widget' : 'widgets'}`
}

function workspaceLabel(count: number): string {
  return `${count} ${count === 1 ? 'workspace' : 'workspaces'}`
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
      description={`This browser has ${workspaceLabel(Object.keys(conflict.local.workspaces).length)} with ${countLabel(Object.keys(conflict.local.widgets).length)}. Your cloud board has ${workspaceLabel(Object.keys(conflict.cloud.workspaces).length)} with ${countLabel(Object.keys(conflict.cloud.widgets).length)} and was saved ${updated}. Merge keeps the cloud board and adds your local workspaces to the workspace dropdown.`}
      cancelLabel="Keep this browser"
      secondaryLabel="Merge workspaces"
      confirmLabel="Use cloud board"
      onClose={() => resolveCloudConflict('local')}
      onSecondary={() => resolveCloudConflict('merge')}
      onConfirm={() => resolveCloudConflict('cloud')}
    />
  )
}
