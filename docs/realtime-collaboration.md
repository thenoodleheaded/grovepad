# Grovepad realtime collaboration

## What ships

Signed-in users automatically connect the active canvas to a local-first Yjs document. Board edits remain immediate and usable when the network disappears. Supabase Realtime carries the low-latency hot path, while an append-only Postgres update log plus compact snapshots provides reliable cold starts and missed-message recovery.

The collaboration button in the canvas's upper-right corner shows connection state and online people. Clicking another person's avatar follows their camera; clicking the follow banner stops. The panel copies an exact canvas link, lets an Owner grant access by an existing account email, and exposes comments/replies. A recipient must be granted a role before opening the link.

Roles are intentionally narrow:

| Role | Board edits | Comments/replies | Invite or change roles | Presence/follow |
|---|---:|---:|---:|---:|
| Owner | Yes | Yes | Yes | Yes |
| Editor | Yes | Yes | No | Yes |
| Commenter | No | Yes | No | Yes |
| Viewer | No | No | No | Yes |

Guests remain fully local and never start collaboration transport.

## Data and merge contract

- One active canvas maps to one `Y.Doc`; other local canvases remain untouched.
- Widgets, relations, circuit connections, and groups are nested Yjs maps, so unrelated properties merge independently.
- Every widget with a string `text` field (including Notes, Sticky Note, Quote, and Code) stores that field as `Y.Text`, preserving concurrent character edits. Other widget data remains validated JSON with deterministic last-writer resolution for the same property.
- Every incoming document is bounded (10,000 records per entity kind, 2,000,000 note characters, 8,000,000 JSON characters) and passed through Grovepad's persisted-board parser before entering the canonical store.
- Collaborative undo/redo tracks only local Yjs transactions. Remote work is never removed by another person's Undo.
- Awareness contains cursor, selection, active editor, camera, display name, role, and color. It is ephemeral and not written to the board or CRDT log.

## Delivery and recovery

Each local Yjs update receives one UUID. The runtime broadcasts it immediately, stores it in the dedicated `grovepad-collaboration` IndexedDB queue, and batch-appends queued rows to `canvas_crdt_updates`. Acknowledged IDs are removed locally. Duplicate delivery is harmless because Yjs updates and the `(canvas_id, update_id)` database key are idempotent.

Cold start restores the browser's cached Yjs document (including its original CRDT history), then applies `canvas_crdt_documents.snapshot` and every update after `last_seq`. Reconnect repeats the durable tail query and drains the local queue. Preserving that local document history prevents reload-while-offline from duplicating a note's existing text when it later meets the server copy. Offline bursts over 100 queue records are merged into one equivalent Yjs update. Editors compact after 200 durable updates or 512 KiB: a transaction-level advisory lock atomically installs a full snapshot and deletes only log rows at or below its sequence.

Local board persistence continues independently. A Supabase outage can change the collaboration indicator to offline/error, but it cannot stop local editing or local saves.

## Database deployment

Apply migrations in timestamp order, including `20260719050000_realtime_collaboration.sql`. The migration creates:

- `canvas_collaborations` and `canvas_members`;
- `canvas_crdt_documents` and `canvas_crdt_updates`;
- `canvas_comments`;
- owner-only invitation and editor-only compaction functions;
- private-channel policies on `realtime.messages`.

The channel topic is exactly `canvas:<canvas-id>` and clients set `private: true`. Members may receive messages and publish Presence. Only Owners and Editors may publish Broadcast updates. Table RLS separately prevents Commenters/Viewers from appending CRDT rows, prevents non-members from reading cold-start data, and limits comments to Owner/Editor/Commenter.

Run the SQL policy tests against a disposable Supabase database after applying migrations:

```sh
supabase db reset
supabase test db
```

The repository's `npm run db:check` is a fast parser/invariant gate; it does not replace executing pgTAP against PostgreSQL.

## Pressure verification

`src/collaboration/collaborationPressure.test.ts` simulates ten offline clients, 1,000 editing transactions, intentionally different update orders, and at-least-once duplicate replay. Every client must produce the same binary document and validated board snapshot. The suite also proves compact-snapshot-plus-tail recovery. `offlineUpdateQueue.test.ts` proves per-canvas isolation, acknowledgement deletion, burst compaction, and duplicate replay.

Run the focused and whole-app gates:

```sh
npx vitest run src/collaboration
npm run check:full
```

Then run the collaboration entries in `docs/manual-smoke-checklist.md` with separate signed-in browser profiles. Live RLS, Presence, reconnect, and multi-user UI behavior require a migrated Supabase project and at least two accounts; automated local tests cannot truthfully substitute for that external integration gate.

## Operational signals and limits

- `connected`: private channel subscribed and presence publishing.
- `reconnecting`: browser is online but the channel timed out or errored.
- `offline`: browser network signal is offline; updates stay queued.
- `error`: authentication, RLS, payload validation, or durable transport failed. The error is visible from the collaboration control tooltip/panel while the local board remains available.

Investigate a growing update table by checking whether clients can execute `compact_canvas_crdt`, whether their role is still Owner/Editor, and whether the durable sequence advances. Do not delete update rows manually unless a verified snapshot containing those rows is already stored. For a client-specific replay issue, preserve the browser's `grovepad-collaboration` IndexedDB database until its pending updates have been exported or successfully flushed.
