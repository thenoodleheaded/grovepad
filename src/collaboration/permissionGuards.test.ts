import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { makeRelation, makeWidget } from '../test/factories'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { useCollaborationStore } from '../store/useCollaborationStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { installCollaborationPermissionGuards } from './permissionGuards'

// ---------------------------------------------------------------------------
// The permission guards make prohibited writes SILENT no-ops: a blocked action
// returns undefined and touches nothing, with no throw and no toast. Callers
// that spend real money before writing (the document importer pays for one
// OpenAI call per card) must therefore refuse up front — they cannot detect
// the refusal afterwards from a return value.
//
// This file pins that trapdoor. If importMindmap is ever removed from
// MUTATING_ACTIONS, the "viewer" case fails loudly — which is right, because
// that change would let read-only roles write to a shared board locally.
// ---------------------------------------------------------------------------

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

let disposeGuards: (() => void) | null = null

afterEach(() => {
  disposeGuards?.()
  disposeGuards = null
  useCollaborationStore.setState({ role: null })
  useWidgetStore.getState().loadBoard(baseline)
})

function installGuards(): void {
  const doc = new Y.Doc()
  disposeGuards = installCollaborationPermissionGuards(new Y.UndoManager(doc.getMap('widgets')))
}

/** The payload shape ImportDocumentModal hands to importMindmap. */
function importPayload(canvasId: string) {
  const gate = makeWidget({ id: 'guard-gate', canvasId, position: { x: 30_000, y: 30_000 } })
  const blocked = makeWidget({ id: 'guard-blocked', canvasId, position: { x: 30_800, y: 30_000 } })
  return {
    widgets: Object.fromEntries([gate, blocked].map((widget) => [widget.id, widget])),
    relations: [
      makeRelation({ id: 'guard-rel', fromId: gate.id, toId: blocked.id, type: 'blocker', isResolved: false }),
    ],
  }
}

describe('collaboration permission guards on the import path', () => {
  it('swallows importMindmap silently for a read-only role', () => {
    installGuards()
    useCollaborationStore.setState({ role: 'viewer' })
    const { widgets, relations } = importPayload(useWidgetStore.getState().activeCanvasId)

    const result = useWidgetStore.getState().importMindmap(widgets, relations)

    // The two halves of the defect: nothing lands, and nothing says so.
    expect(result).toBeUndefined()
    expect('guard-gate' in useWidgetStore.getState().widgets).toBe(false)
    // The per-card hydration writes are equally inert for a viewer.
    useWidgetStore.getState().updateWidgetData('guard-gate', { text: 'paid for, discarded' } as never)
    expect('guard-gate' in useWidgetStore.getState().widgets).toBe(false)
  })

  it('lets an editor import through the same installed guards', () => {
    // The control: the guard discriminates by role, it does not just block.
    installGuards()
    useCollaborationStore.setState({ role: 'editor' })
    const { widgets, relations } = importPayload(useWidgetStore.getState().activeCanvasId)

    useWidgetStore.getState().importMindmap(widgets, relations)

    expect('guard-gate' in useWidgetStore.getState().widgets).toBe(true)
    expect(useWidgetStore.getState().blockedWidgetIds.has('guard-blocked')).toBe(true)
  })

  it('writes normally on a solo board once the guards are disposed', () => {
    // role === null is ordinary solo use: guards are not installed and writes
    // land. This is the state the importer's entry guard must keep allowing.
    installGuards()
    useCollaborationStore.setState({ role: 'viewer' })
    disposeGuards?.()
    disposeGuards = null
    useCollaborationStore.setState({ role: null })

    const { widgets, relations } = importPayload(useWidgetStore.getState().activeCanvasId)
    useWidgetStore.getState().importMindmap(widgets, relations)

    expect('guard-gate' in useWidgetStore.getState().widgets).toBe(true)
  })
})
