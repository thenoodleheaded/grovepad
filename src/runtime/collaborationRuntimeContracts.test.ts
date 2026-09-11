/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const runtime = readFileSync(new URL('./collaborationRuntime.ts', import.meta.url), 'utf8')

describe('collaboration runtime promise contracts', () => {
  // The `online` event fires before the network is actually usable, so the
  // reconnect fetch fails routinely. Left unterminated, that rejection is an
  // unhandled promise rejection AND it skips the `flushPending` that this
  // trigger exists to run — the edits made while offline sit in the queue
  // waiting for some other path to notice them. Every sibling chain in this
  // file already terminates; this one is the exception the bug lived in.
  it('terminates the reconnect sync so a failed catch-up cannot skip the flush', () => {
    const start = runtime.indexOf('const onOnline = ')
    expect(start).toBeGreaterThan(-1)
    const handler = runtime.slice(start, runtime.indexOf('const onOffline = ', start))
    expect(handler).toContain('syncDurableUpdates(currentSession)')
    expect(handler).toContain('flushPending(currentSession)')
    expect(handler).toContain('.catch(reportRealtimeFailure)')
  })
})
