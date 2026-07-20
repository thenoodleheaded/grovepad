import { describe, expect, it } from 'vitest'
import { persistenceStatusSummary } from './persistenceStatus'

const base = {
  localSave: 'saved' as const,
  cloudSync: 'off' as const,
  syncEnabled: false,
  signedIn: false,
  networkOnline: true,
  lastSyncedAt: null,
}

describe('persistence status summary', () => {
  it('keeps a local failure visible even when the browser is offline', () => {
    expect(persistenceStatusSummary({ ...base, localSave: 'error', networkOnline: false })).toEqual({
      shortLabel: 'Save failed',
      longLabel: 'Local save failed — export a backup',
      tone: 'error',
    })
  })

  it('explains that offline work remains safe locally', () => {
    expect(persistenceStatusSummary({ ...base, networkOnline: false }).longLabel)
      .toBe('Offline — changes are safe on this device')
  })

  it('reports cloud work and a deterministic last-sync age', () => {
    expect(persistenceStatusSummary({
      ...base,
      signedIn: true,
      syncEnabled: true,
      cloudSync: 'synced',
      lastSyncedAt: 1_000,
      now: 181_000,
    }).longLabel).toBe('Synced to your account 3m ago')
  })

  it('distinguishes a cloud pause from a local-save failure', () => {
    expect(persistenceStatusSummary({
      ...base,
      signedIn: true,
      syncEnabled: true,
      cloudSync: 'error',
    })).toMatchObject({ shortLabel: 'Sync paused', tone: 'offline' })
  })
})
