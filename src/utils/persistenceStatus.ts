import type { SaveState, SyncState } from '../store/usePersistenceStatusStore'

export type PersistenceStatusTone = 'error' | 'working' | 'synced' | 'offline' | 'local'

export interface PersistenceStatusSummary {
  shortLabel: string
  longLabel: string
  tone: PersistenceStatusTone
}

export interface PersistenceStatusInput {
  localSave: SaveState
  cloudSync: SyncState
  syncEnabled: boolean
  signedIn: boolean
  networkOnline: boolean
  lastSyncedAt: number | null
  now?: number
}

function syncAge(lastSyncedAt: number, now: number): string {
  const elapsedMinutes = Math.max(0, Math.floor((now - lastSyncedAt) / 60_000))
  if (elapsedMinutes < 1) return 'just now'
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours}h ago`
  return `${Math.floor(elapsedHours / 24)}d ago`
}

/** One truthful label for the toolbar, account menu, and screen-reader live
 * region. Connectivity never obscures a local-save failure. */
export function persistenceStatusSummary(input: PersistenceStatusInput): PersistenceStatusSummary {
  if (input.localSave === 'error') {
    return { shortLabel: 'Save failed', longLabel: 'Local save failed — export a backup', tone: 'error' }
  }
  if (input.localSave === 'saving') {
    return { shortLabel: 'Saving…', longLabel: 'Saving changes to this device', tone: 'working' }
  }
  if (!input.networkOnline) {
    return { shortLabel: 'Offline', longLabel: 'Offline — changes are safe on this device', tone: 'offline' }
  }
  if (input.signedIn && input.syncEnabled && input.cloudSync === 'error') {
    return { shortLabel: 'Sync paused', longLabel: 'Cloud sync paused — local copy is safe', tone: 'offline' }
  }
  if (input.signedIn && input.syncEnabled && input.cloudSync === 'saving') {
    return { shortLabel: 'Syncing…', longLabel: 'Saving changes to your account', tone: 'working' }
  }
  if (input.signedIn && input.syncEnabled && input.cloudSync === 'synced') {
    const suffix = input.lastSyncedAt === null
      ? ''
      : ` ${syncAge(input.lastSyncedAt, input.now ?? Date.now())}`
    return { shortLabel: 'Synced', longLabel: `Synced to your account${suffix}`, tone: 'synced' }
  }
  if (input.localSave === 'saved') {
    return { shortLabel: 'Saved', longLabel: 'Saved on this device', tone: 'local' }
  }
  return { shortLabel: 'Local only', longLabel: 'Changes stay on this device', tone: 'local' }
}
