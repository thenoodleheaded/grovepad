# Grovepad storage format and no-corruption contract

Compatibility rules for every persisted Grovepad board. The architecture described here is implemented; treat this as the binding contract for any persistence change.

## Storage architecture

- **Split documents.** One small board index (workspaces, canvas tree, names, cross-canvas edges) plus one document per canvas (its widgets and same-canvas edges). Moving a widget between canvases writes source and destination documents first, then the index; loaders tolerate an orphan during an interrupted multi-document write. Cloud sync (`cloudDocuments.ts`, `cloudSync.ts`) uses checksum-diffed writes at this granularity.
- **Device state is not document state.** `canvasViews`, `activeWorkspaceId`, and `activeCanvasId` live in the versioned `grovepad:device:v1` local payload and never enter board snapshots, exports, or cloud writes.
- **Canvas settings are document state.** Optional `CanvasMeta` fields carry per-canvas `gridIntensity` (`100` by default) and `linksVisible` (`true` by default). The retired `relationStrict` field may still round-trip from older boards but has no runtime effect; relations preserve the direction the user drew, move neither widget, and may attach to any side. Canvas access is never document state: it is owner-plus-invited-members only, enforced solely by database membership, and there is no public/link-sharing setting to serialize. These settings travel with snapshots, cloud documents, `.grovepad` exports, and realtime canvas documents.
- **One canonical serializer** for every transport (IndexedDB, cloud, export). It embeds the format version, excludes runtime-only state, normalizes interrupted operations to a restart-safe state, and produces the same semantic document everywhere.
- **Media never inlines** in board JSON. `data:` URLs in media fields are clamped/rejected; a pasted or dropped image is written to the device's own blob store and the board keeps only its key. `mediaSyncService.ts` then carries a copy to the private `board-media` bucket at `<canvasId>/<blobKey>`, and a device that holds the key but not the bytes downloads it once and caches it locally. Access mirrors the canvas — owner or invited member, never public — and every cloud step is best-effort: signed out, offline, oversized, or refused, the media stays device-local and the board keeps working.
- **`.grovepad` package** is the only user-facing board file: a ZIP containing `manifest.json` (format, version, `minReader`, checksums), `index.json`, `canvases/<id>.json`, and de-duplicated `media/<content-hash>.<ext>` entries. Implemented by `grovepadPackage.ts` over the dependency-free `zipArchive.ts`; it shares the same parser/serializer and fixture corpus as every other transport. Raw JSON board export/import is intentionally unsupported.

## No-corruption laws

1. **Every payload self-describes.** Newly written boards embed `{ "format": "grovepad-board", "v": 2 }`. Metadata-free current-shape payloads read as v2. A recognized payload with a newer `v` blocks writes rather than being replaced.
2. **Preserve what the reader does not understand.** Unknown widget types and fields round-trip as opaque data; future widgets render as a locked newer-client placeholder. No save may silently strip them. Opaque edges/glues are discarded only when an intentional widget deletion removes a required endpoint.
3. **Old code never overwrites newer data.** A future-version payload opens no writable representation; the user is asked to refresh/update. A deployment-hash check notifies long-lived tabs before they encounter a newer schema.
4. **Migrations are append-only.** Pure `vN → vN+1` functions, retained forever, run in sequence, never edited or reused. Before migrating, write a rolling snapshot tagged with the source version. The legacy-to-v2 conversion is a permanent compatibility fixture; its first IndexedDB commit atomically stores the untouched v1 source.
5. **Schema evolution is additive.** New fields are optional with defaults. A rename is a new field plus a migration plus retained read support. Types and meanings are never repurposed. Runtime/transient flags never serialize.
6. **Compatibility is enforced by fixtures.** One frozen fixture per released schema version, plus adversarial fixtures (unknown widgets/fields, future version, malformed input). Any change to canonical serialized bytes is reviewed as a format change.
7. **Cloud storage keeps receipts.** ~30 append-only revisions per document, server-side timestamps and checksums, owner-only RLS. Client clocks are never authoritative for `updated_at`.

## Sync reconciliation law

Reconciling two boards is a three-way problem, never a two-way one. After every
successful sync, `syncBaseline.ts` records the exact board both sides agreed on,
per account, in its own IndexedDB database. The next reconcile compares this
device and the cloud **to that baseline**, never to each other.

8. **Never ask a question the baseline can answer.** `local == base` means the
   other device moved; `cloud == base` means this one did. Only a record that
   moved on both sides, in different ways, is a conflict. A byte comparison
   between the two live boards cannot tell these apart, and asking the user was
   the symptom of not having the baseline.
9. **A conflict is resolved, not escalated.** Widgets carry content, so both
   versions are kept: the cloud copy holds the shared id and this device's copy
   lands beside it as a new card. Every other record (names, canvas metadata,
   links, glue) takes this device's version — nothing renames itself in front of
   the person looking at it. A deletion racing an edit loses; the edit survives.
   The merge is total, lossless, and silent. There is no conflict dialog.
10. **No lineage means union, not choice.** With no baseline (first sync on a
    device, or a lost record) both sides are unioned by id. That cannot detect a
    deletion, which is the acceptable direction to be wrong in.
11. **Check cheaply, transfer rarely.** `board_indexes.checksum` and
    `canvas_docs.checksum` hash the same canonical JSON `fingerprintBoard`
    produces locally, so `fetchCloudHead` answers "did anything move?" from two
    small metadata reads. A board crosses the network only when the answer is
    yes, and an upload still re-sends only the canvases whose checksums changed.
12. **Sync often enough that merges stay rare.** Drift is what manufactures
    conflicts: a board edited all day and uploaded once a day is guaranteed to
    diverge. This device uploads once its edits go quiet and checks on focus,
    both throttled, both no-ops when the fingerprints already agree.

## Explicit non-goals

- No MessagePack or short-key custom codec; gzip captures most of the size benefit while JSON stays recoverable.
- No CRDT until realtime multi-writer collaboration exists.
- No patch/delta protocol before per-canvas granularity and compression are measured.

No system can promise the absence of all bugs. The enforceable guarantee is that incompatible data is not overwritten and residual failures are recoverable from frozen fixtures, local snapshots, and cloud revisions.
