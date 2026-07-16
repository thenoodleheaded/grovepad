# Grovepad storage format and no-corruption contract

This document defines the compatibility rules for every persisted Grovepad board. It is a target architecture unless an item is explicitly marked implemented.

## Current shape and highest risks

The current `PersistedBoard` document contains every workspace, canvas, widget, relation, connection, group, and active pack. IndexedDB and JSON backup use that canonical shape. The cloud adapter splits it into one `board_indexes` row and gzip-compressed `canvas_docs`, while retaining the monolithic `boards` row during the compatibility window. Active location and saved canvas views live in a separate local-only device payload; older v2 boards with those fields embedded remain readable.

That creates three structural risks:

1. Cloud reconciliation works at whole-board granularity, so a small edit compares and uploads account-wide state.
2. Older payloads were identified only by the `grovepad:board:v2` localStorage key; IndexedDB, cloud rows, and exports had no embedded version.
3. Older readers historically allowlisted widget and graph semantics. The current v2 reader quarantines unsupported records and round-trips them opaquely so a stale client cannot silently erase data introduced by a newer deployment.

## Target storage architecture

### Per-canvas documents

Split the monolithic board into:

- one small board index containing workspaces, the canvas tree, names, and cross-canvas edges;
- one document per canvas containing its widgets and same-canvas edges;
- media objects referenced by content hash.

A same-canvas edge belongs to that canvas document. A cross-canvas edge belongs to the board index. Moving a widget between canvases writes the source and destination documents first, then the index. Loaders must tolerate an orphan during an interrupted multi-document write.

This changes sync cost from account-wide to the set of edited canvases and enables lazy loading, per-canvas revisions, and later per-canvas sharing.

### Device state is not document state

Implemented: `canvasViews`, `activeWorkspaceId`, and `activeCanvasId` live in the versioned `grovepad:device:v1` local payload. Camera and last-open location no longer enter IndexedDB board snapshots, exports, cloud comparison, or cloud writes. The reader migrates these fields from older embedded v2 boards and validates them against surviving canvases.

### Compression and canonical serialization

Canvas document bodies may be compressed with `CompressionStream` and stored as `bytea`, while a small readable jsonb metadata column retains format version, checksum, name, and counts. Do not introduce a custom binary schema or CRDT solely for size reduction.

Every transport must call one canonical serializer. It must:

- embed the format and version;
- exclude runtime-only state;
- normalize interrupted runtime operations to a restart-safe state;
- omit deprecated/default fields only when the matching parser restores their meaning;
- produce the same semantic document for IndexedDB, cloud, and export.

## Media policy

Binary media never belongs inline in the board JSON. Clamp or reject `data:` URLs in media URL fields. Until remote object storage exists, the UI must state that locally pasted images remain on the current device. The eventual synced representation should reference a content-hashed object in Supabase Storage.

## `.grovepad` package

The long-lived file format should be a ZIP package:

```text
Project.grovepad
├── manifest.json
├── index.json
├── canvases/<canvas-id>.json
└── media/<content-hash>.webp
```

`manifest.json` contains `format`, `formatVersion`, `minReader`, `kind`, root identifiers, app version, timestamps, and per-entry checksums. Canvas entries use the same schema as IndexedDB/cloud canvas documents. A `kind: "workspace"` package can contain multiple root canvases without introducing a second format.

ZIP keeps media with the document, remains inspectable with common tools, supports per-entry compression, and lets native clients register a real document type.

## No-corruption laws

### 1. Every payload self-describes

Every newly written current board contains:

```json
{ "format": "grovepad-board", "v": 2 }
```

The reader treats missing metadata as version 2 so payloads written before this contract remain valid. A recognized payload with `v` greater than the supported reader version must block writes rather than being replaced with seed/current state.

### 2. Preserve what the reader does not understand

Known objects are validated, but unknown widget types and unknown fields must round-trip as opaque data. Unknown widgets render as a placeholder explaining that they were made with a newer Grovepad. No save may silently strip them.

Implemented for valid v2 envelopes: future widget types are retained behind a symbol-backed runtime placeholder; unsupported relation kinds, connection variants/transforms, group colors, and domain-pack values are quarantined from runtime semantics; future fields on known records round-trip; and top-level future fields travel through serializer-owned sidecars. Placeholders are locked and cannot be duplicated by an older client. Opaque edges and groups are discarded only when an intentional widget deletion removes one of their required endpoints.

### 3. Old code never overwrites newer data

If `payload.v` is newer than the supported version, the client opens no writable representation of that payload, asks the user to refresh/update, and never rewrites local or cloud state. A lightweight deployment-hash check notifies long-lived tabs before they encounter a newer schema.

### 4. Migrations are append-only

Migrations are pure `vN -> vN+1` functions, retained forever and run in sequence. Never edit an old migration or reuse a version. Before migrating, write a rolling snapshot tagged with the source version.

The existing flat-board conversion is the legacy-to-v2 rung and is retained as a permanent compatibility fixture. Its first IndexedDB commit atomically stores the untouched v1 source as a version-tagged migration snapshot alongside the upgraded v2 board.

### 5. Schema evolution is additive

New fields are optional with defaults. A rename is a new field plus a migration and retained read support for the old name. Existing field types and meanings are not repurposed. Runtime/transient flags never serialize.

### 6. Compatibility is enforced by fixtures

Keep one frozen board fixture per released schema version plus adversarial fixtures for unknown widgets, unknown fields, a future version, and malformed/truncated input. CI must prove parse, migration, canonical serialization, reparse, and future-version refusal. Any change to canonical serialized bytes updates/adds a fixture and is reviewed as a format change.

### 7. Cloud storage keeps receipts

The target cloud schema retains approximately 20-30 append-only revisions per canvas/board. Server-side timestamps, checksums, and RLS provide recovery and trustworthy conflict metadata. Client clocks must not be authoritative for `updated_at`.

## Delivery sequence

### Pre-deploy foundation

- [x] Embed `format: "grovepad-board"` and `v: 2` in every newly serialized board.
- [x] Treat metadata-free current-shape payloads as version 2.
- [x] Refuse future-version payloads and lock IndexedDB writes before a read can race a save.
- [x] Add a frozen v2 round-trip fixture wired into the normal Vitest suite.
- [x] Strip `Widget.isHydrating` and normalize interrupted AI generation at the canonical write boundary.
- [x] Commit legacy-to-v2 upgrades atomically with a tagged snapshot of the untouched v1 source.
- [x] Apply the repository-owned Supabase migration and run the linked pgTAP suite against the live project. The migration replaces all legacy `boards` policies with owner-only RLS.

### Phase 1: forward compatibility

- [x] Preserve unknown widget types and unknown fields as opaque values.
- [x] Render a locked newer-client placeholder without mutating the payload.
- [x] Make the future-version gate visibly read-only with a refresh/update prompt.
- [x] Add deployment-hash refresh detection for long-lived tabs before they encounter newer data.
- [x] Add unknown-field, unknown-widget, future-version, and malformed fixtures.

### Phase 2: storage and sync split

- [x] Move active location and per-canvas device state out of synced documents.
- [x] Introduce board-index and per-canvas rows with checksum-diffed writes and revisions.
- [x] Add gzip compression and readable metadata/checksums.
- [x] Add server-managed timestamps, owner-only RLS migrations, and 30 rolling cloud revisions per document.
- [x] Migrate lazily while dual-writing the old monolithic row for at least one release window.

### Phase 3: portable documents

- Implement `.grovepad` ZIP import/export using the same parser and serializer.
- Include content-hashed media and checksums.
- Retain JSON export as a diagnostic/legacy path until package recovery is proven.

## Explicit non-goals for the current phases

- No MessagePack or short-key custom codec; compression captures most of the size benefit while JSON remains recoverable.
- No CRDT until realtime multi-writer collaboration exists.
- No patch/delta protocol before per-canvas granularity and compression are measured.

No system can promise the absence of all bugs. The enforceable guarantee is that incompatible data is not overwritten and that residual failures are recoverable from frozen fixtures, local snapshots, and cloud revisions.
