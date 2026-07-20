# Grovepad storage format and no-corruption contract

Compatibility rules for every persisted Grovepad board. The architecture described here is implemented; treat this as the binding contract for any persistence change.

## Storage architecture

- **Split documents.** One small board index (workspaces, canvas tree, names, cross-canvas edges) plus one document per canvas (its widgets and same-canvas edges). Moving a widget between canvases writes source and destination documents first, then the index; loaders tolerate an orphan during an interrupted multi-document write. Cloud sync (`cloudDocuments.ts`, `cloudSync.ts`) uses checksum-diffed writes at this granularity.
- **Device state is not document state.** `canvasViews`, `activeWorkspaceId`, and `activeCanvasId` live in the versioned `grovepad:device:v1` local payload and never enter board snapshots, exports, or cloud writes.
- **One canonical serializer** for every transport (IndexedDB, cloud, export). It embeds the format version, excludes runtime-only state, normalizes interrupted operations to a restart-safe state, and produces the same semantic document everywhere.
- **Media never inlines** in board JSON. `data:` URLs in media fields are clamped/rejected; locally pasted images stay on the device until remote object storage exists.
- **`.grovepad` package** is the only user-facing board file: a ZIP containing `manifest.json` (format, version, `minReader`, checksums), `index.json`, `canvases/<id>.json`, and de-duplicated `media/<content-hash>.<ext>` entries. Implemented by `grovepadPackage.ts` over the dependency-free `zipArchive.ts`; it shares the same parser/serializer and fixture corpus as every other transport. Raw JSON board export/import is intentionally unsupported.

## No-corruption laws

1. **Every payload self-describes.** Newly written boards embed `{ "format": "grovepad-board", "v": 2 }`. Metadata-free current-shape payloads read as v2. A recognized payload with a newer `v` blocks writes rather than being replaced.
2. **Preserve what the reader does not understand.** Unknown widget types and fields round-trip as opaque data; future widgets render as a locked newer-client placeholder. No save may silently strip them. Opaque edges/groups are discarded only when an intentional widget deletion removes a required endpoint.
3. **Old code never overwrites newer data.** A future-version payload opens no writable representation; the user is asked to refresh/update. A deployment-hash check notifies long-lived tabs before they encounter a newer schema.
4. **Migrations are append-only.** Pure `vN → vN+1` functions, retained forever, run in sequence, never edited or reused. Before migrating, write a rolling snapshot tagged with the source version. The legacy-to-v2 conversion is a permanent compatibility fixture; its first IndexedDB commit atomically stores the untouched v1 source.
5. **Schema evolution is additive.** New fields are optional with defaults. A rename is a new field plus a migration plus retained read support. Types and meanings are never repurposed. Runtime/transient flags never serialize.
6. **Compatibility is enforced by fixtures.** One frozen fixture per released schema version, plus adversarial fixtures (unknown widgets/fields, future version, malformed input). Any change to canonical serialized bytes is reviewed as a format change.
7. **Cloud storage keeps receipts.** ~30 append-only revisions per document, server-side timestamps and checksums, owner-only RLS. Client clocks are never authoritative for `updated_at`.

## Explicit non-goals

- No MessagePack or short-key custom codec; gzip captures most of the size benefit while JSON stays recoverable.
- No CRDT until realtime multi-writer collaboration exists.
- No patch/delta protocol before per-canvas granularity and compression are measured.

No system can promise the absence of all bugs. The enforceable guarantee is that incompatible data is not overwritten and residual failures are recoverable from frozen fixtures, local snapshots, and cloud revisions.
