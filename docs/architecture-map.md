# Grovepad Architecture Map

Fresh AI tasks should begin with the root [agent guide](../AGENTS.md) and the compact [codebase map](codebase-map.md), which routes user language to entrypoints, owners, contracts, and targeted verification. This document is the deeper reference for cross-system flow and architectural invariants. When ownership or an entrypoint changes, update the compact map in the same commit and run `npm run docs:check`. Use stable symbols and paths, never line numbers.

## Runtime map

```mermaid
flowchart TD
  Main["main.tsx\nReact root + global CSS"] --> App["App.tsx\nauth + compatibility route boundary"]
  App --> Login["LoginPage"]
  App --> Canvas["CanvasViewport\ncomposition root"]

  Canvas --> Layers["Canvas layers\ngrid, glue welds, widgets, relations, dependencies, wires"]
  Canvas --> UI["UI overlays\ntoolbar, quick add, picker, search, import"]
  Canvas --> Events["gestureEngine\npan, zoom, select, touch"]
  Canvas --> Runtime["appRuntime boundary\npersistence + collaboration + circuit engine"]

  Layers --> WidgetCard["WidgetCard\ninteraction shell"]
  WidgetCard --> Renderer["WidgetRenderer\nsuspense + responsive shell"]
  Renderer --> Families["Renderer families\ncore, education, workflow, catalogues"]
  Families --> Modules["Widget modules\nindividual + essential + atlas + expansion"]

  UI --> WidgetStore["useWidgetStore facade\ncanonical board state"]
  Layers --> WidgetStore
  Events --> CanvasStore["useCanvasStore\ncamera state"]
  Runtime --> WidgetStore
  Runtime --> CircuitStore["useCircuitStore\ntransient wire runtime"]
  Runtime --> Collaboration["collaborationRuntime\nYjs + presence + reconnect"]
  Runtime --> MCPApp["mcpBridgeRuntime\nvalidated browser tool boundary"]
  MCPApp --> MCPServer["grovepad-mcp.mjs\nlocal stdio + loopback broker"]
  MCPServer --> Claude["Claude MCP host\nuser-owned AI account"]
  MCPApp --> WidgetStore

  WidgetStore --> Slices["domain slices\nnavigation, layout, circuit, glue, selection"]
  WidgetStore --> Registry["widget registry\nmetadata + defaults"]
  WidgetStore --> Fields["field registry\nports + commands"]
  Registry --> Contracts["neutral registry/field contracts"]
  Fields --> Contracts
  Slices --> Types["domain types\ncanvas, modules, widget data, relations"]

  Runtime --> Persistence["persistence.ts"]
  Persistence --> IndexedDB["boardDatabase.ts\nIndexedDB + rolling snapshots"]
  Persistence --> Cloud["cloudSync.ts + cloudDocuments.ts\nindex/canvas sync + legacy recovery"]
  Persistence --> LocalStorage["localStorage\nview + legacy/fallback data"]
  Collaboration --> Realtime["Supabase Realtime\nprivate broadcast + presence"]
  Collaboration --> DurableLog["Supabase Postgres\nCRDT snapshot + update log"]
  Collaboration --> OfflineQueue["IndexedDB\npending Yjs updates"]

  UI --> Thought["thoughtInterpreter + scenarioResolver"]
  Thought --> LocalAI["localAiService\ndeterministic first, optional local model"]
  LocalAI --> WebLLM["WebLLM worker/native adapters"]
```

## Boot and ownership sequence

1. `main.tsx` loads `index.css`, then `styles/product.css`, mounts the root error boundary, and renders `App`.
2. `App.tsx` first honors any persistence compatibility block, then waits for `useAuthStore` and lazily selects either login or canvas.
3. Mounting `CanvasViewport` starts `runtime/appRuntime.ts`; unmount, StrictMode replay, and HMR dispose persistence subscriptions, deploy checks, and circuit listeners explicitly.
4. `useWidgetStore` constructs its initial state from `loadPersistedBoard()`; `initPersistence` can later replace it with IndexedDB/cloud state.
5. `CanvasViewport` composes every canvas layer, global overlay, and runtime helper.
6. `WidgetLayer` mounts every widget on the active canvas; each `WidgetCard` owns drag, bounded resizing, title chrome, and ports.
7. `WidgetRenderer` owns suspense and the responsive content shell. Family maps under `components/widgets/renderers/` own typed dispatch, while their lazy-component files keep concrete implementations out of the startup chunk.

## Subsystem contracts

| Subsystem | Primary files | Owns | Must not own |
|---|---|---|---|
| Authentication | `useAuthStore.ts`, `LoginPage.tsx`, `lib/supabase.ts` | Session/guest route state | Board mutations |
| Camera | `cameraEngine.ts`, `gestureEngine.ts`, `useCanvasStore.ts`, `canvasView.ts` | Pan, zoom, viewport size, camera history | Widget geometry persistence |
| Canonical board | `useWidgetStore.ts`, `store/slices/*Slice.ts` | Widgets, relations, connections, glue clusters, hierarchy, selection, undo | Render-only animation state |
| Circuit runtime | `circuitEngine.ts`, `useCircuitStore.ts`, `transforms.ts` | Deterministic propagation, delivery memory, wire-drag/runtime feedback | Widget renderer details |
| Application runtime | `runtime/appRuntime.ts`, `runtime/deployVersionMonitor.ts` | Idempotent start/stop ownership for persistence, stale-deploy checks, and circuit services | Domain behavior or visual rendering |
| Claude MCP connector | `scripts/grovepad-mcp.mjs`, `scripts/mcp/grovepadBridge.mjs`, `runtime/mcpBridgeRuntime.ts`, `mcp/treeContract.ts` | Local stdio tools, origin/token-guarded loopback delivery, bounded reads, preview validation | Direct IndexedDB access, raw board replacement, or mutation outside canonical store actions |
| Widget definition | `registry.ts`, `registry/*`, `widgets/contracts/registry.ts` | Metadata, defaults, sizing, packs | Live widget state |
| Widget sizing | `widgets/sizingProfiles.ts`, `utils/widgetContentFloor.ts`, `store/liveWidgetSizing.ts`, `store/slices/widgetLayoutSlice.ts` | Registry fallback windows, ephemeral mounted floors, grow-only adjustment, scale states, and resize clamping | Persisting browser-only measurements |
| Field definition | `fields.ts`, `fields/*`, `widgets/contracts/fields.ts` | Read/write fields, commands, semantic units | Canvas drawing |
| Widget rendering | `WidgetCard.tsx`, `WidgetRenderer.tsx`, `renderers/*`, `modules/*` | Card interaction shell, family-owned typed dispatch, and content | Persistence orchestration |
| Spatial graph drawing | `RelationLines.tsx`, `DependencyLines.tsx`, `WireLayer.tsx` | SVG descriptors, hit paths and menus | Graph mutation rules |
| Persistence | `persistence.ts`, `persistedBoardSchema.ts`, `types/persistence.ts`, adapters | Validation, atomic migration snapshots, debounced saves, optional cloud reconciliation | UI component lifecycle |
| Realtime collaboration | `runtime/collaborationRuntime.ts`, `collaboration/*`, `useCollaborationStore.ts` | Active-canvas CRDT transport, validated store projection, awareness, role guards, offline replay, compaction | Replacing the canonical board store or weakening server authorization |
| Thought interpretation | `thoughtInterpreter.ts`, `scenarioResolver.ts`, `scenarios/catalogue.ts` | Deterministic parsing, scenario candidates, local preference learning | Direct board rendering |
| Optional local AI | `localAiService.ts`, `services/local-ai/*` | Model lifecycle, request cancellation/deadlines, curated plan protocol | Unvalidated graph writes |
| UI orchestration | `components/ui/*` | Pickers, command surfaces, dialogs, import, quick capture | Canonical domain logic |

## State ownership

| Store | Persistent? | Main consumers | Notes |
|---|---|---|---|
| `useWidgetStore` | Yes | Almost every canvas/UI subsystem | Stable facade; action implementations are routed by domain slice |
| `useCanvasStore` | View only | Canvas events, layers, zoom controls | Camera saves separately from board |
| `useCircuitStore` | No | Port rail, wire layer, engine | Transient drag/firing/damped presentation |
| `useCanvasTreeStore` | UI state | Tree drawer/navigation | Hierarchy data itself remains in widget store |
| `useOverlayStore` | No | Dialogs, menus, canvas keyboard guards | Central overlay lifecycle counter |
| `usePersistenceStatusStore` | No | App compatibility gate and account/conflict/save UI | Imports the persisted board type back from persistence |
| `useAuthStore` | Session | App, persistence, account UI | Cloud sync observes it directly |
| `useCollaborationStore` | No | Collaboration chrome, overlays, note edit indicators | Presentation state only; shared board data remains in `useWidgetStore` |
| `useMcpConnectorStore` | No | Settings connector status, `McpPreviewLayer`, `mcpBridgeRuntime` | Connection display plus pending AI tree previews with a consume-once commit shared by the AI client and the on-canvas Add button; the opt-in preference remains device-local in `useSettingsStore` |
| Toast/theme/debug/preview stores | No | Narrow UI/runtime consumers | Appropriate small stores |

## Shared edge rendering with three semantic systems

All three systems keep their own model, endpoint policy, geometry, menus, and accessories. They converge only at `CanvasEdge`, which owns the SVG paint order, hit path, viewport shell, detail thresholds, and shared interaction CSS.

| Layer | Source model | Endpoint policy | Route helper | Unique behavior |
|---|---|---|---|---|
| `RelationLines` | General `Relation` records | Closest legal card border, title-pill avoidance | `anchoredCurvePath`, `curvedPath` | Five relation types, relation editor, critical path |
| `DependencyLines` | `blocker` relations only | Dedicated right-to-left dependency anchors | `dependencyAnchors` + `anchoredCurvePath` | Directional arrow, resolved state, dependency status chip |
| `WireLayer` | Typed `Connection` records | Exact left/right I/O port rails | `portWorldPosition` + `flowCurve` | Typed values, transforms, trigger state, pulse/execution inspector |

`CanvasEdge.tsx` renders the shared highlight → track → halo → main → flow → accessory → hit-target stack. Marker definitions, portal menus, status chips, value labels, firing pulses, and endpoint calculation remain in the semantic layer that understands them.

## Widget pipeline

```mermaid
flowchart LR
  Type["ModuleType + ModuleData\nmoduleTypes + widgetData families"] --> Definition["WidgetDefinition\nregistry contracts + families"]
  Type --> Field["Field/command descriptors\nfields.ts"]
  Definition --> Create["createWidget\nwidgetCreationSlice"]
  Create --> Card["WidgetCard"]
  Card --> Render["WidgetRenderer"]
  Render --> Module["Typed widget module"]
  Field --> Ports["PortRail"]
  Ports --> Wires["WireLayer"]
  Field --> Engine["circuitEngine"]
  Engine --> Store["applyWireWrites"]
  Store --> Card
```

Three catalogue families layer onto the base registry: base widgets declared directly in `registry.ts`/`fields.ts`; expansion widgets in `registry/expansion.ts`/`fields/expansion.ts`; Atlas and automation-core families generated from compact catalogues. Family modules import neutral contracts from `widgets/contracts/`; no family points back to its root implementation. The source dependency graph has zero cycles — keep it that way (`npx --yes madge --circular --extensions ts,tsx src`).

## Persistence flow

```mermaid
sequenceDiagram
  participant UI as Widget/Canvas stores
  participant P as persistence.ts
  participant DB as IndexedDB
  participant LS as localStorage
  participant C as cloudSync.ts

  UI->>P: Zustand subscription reports canonical change
  P->>LS: device document for active location + canvas views
  P->>LS: active camera view
  P->>LS: mark dirty exit for document changes
  P-->>P: debounce, then requestIdleCallback
  P->>DB: write document-only current board
  P->>DB: rolling snapshot every 10 minutes
  opt signed-in user
    P->>C: lazy import and reconcile/push changed checksums
    C-->>P: split documents or legacy recovery board
  end
  Note over P: pagehide/hidden flushes; runtime disposal removes subscriptions and listeners
```

`PersistedBoard`, `PersistedDeviceState`, and their runtime state contracts live in `types/persistence.ts`. Board validation/migration lives in `persistedBoardSchema.ts`; local navigation validation lives in `persistedDeviceState.ts`; cloud index/canvas splitting, compression, and checksums live in `cloudDocuments.ts`. `cloudSync.ts` performs checksum-diffed dual writes and lazy legacy recovery. `initPersistence` owns and disposes every subscription, DOM listener, and pending saver it creates. The format rules live in the [storage contract](storage-format-plan.md).

## Realtime collaboration flow

```mermaid
sequenceDiagram
  participant UI as Widget store
  participant Y as Active-canvas Y.Doc
  participant Q as IndexedDB queue
  participant R as Supabase Realtime
  participant P as Postgres CRDT log

  UI->>Y: Reconcile changed canvas entities
  Y->>R: Broadcast update immediately
  Y->>Q: Durably queue the same idempotent update
  Q->>P: Batch append after auth/RLS checks
  P-->>Q: Acknowledge, then remove queued ids
  R-->>Y: Apply peer updates in any order
  Y->>UI: Validate and replace only the active canvas
  Note over Y,P: Cold start = compact snapshot + ordered tail; reconnect replays the queue and fetches missed tail rows
```

`useWidgetStore` remains the app's canonical model. The active canvas is projected into nested Yjs maps; note bodies live in `Y.Text`. Incoming state crosses the existing persisted-board validator before it can update Zustand. Yjs updates are commutative and idempotent, so Realtime duplication, offline replay, and out-of-order delivery converge. Presence carries encoded Yjs awareness through a private Supabase Presence channel and never enters board persistence. Collaborative undo uses a Yjs undo manager that tracks only local-origin transactions. Full operational and security details live in the [realtime collaboration runbook](realtime-collaboration.md).

## Architectural invariants worth protecting

1. `useWidgetStore.widgets`, `relations`, `connections`, `glues`, and canvas hierarchy are the canonical board model.
2. Engine-derived writes use `applyWireWrites` and belong to the originating undo step, not a new history entry.
3. Widget definitions and field descriptors are exhaustive over `ModuleType`.
4. Persistence validates unknown data before it enters the store.
5. Render layers derive geometry from canonical world state; DOM measurement is reserved for interaction chrome that cannot be pure.
6. Quick Add always has a deterministic result; optional model work may enrich but cannot block creation.
7. Optional cloud/local-AI failures must leave local board work functional.
8. Canvas camera state is separate from board content and is restored independently.
9. Line semantics remain distinct even if their SVG renderer primitives are unified.
10. Widget modules should not acquire direct persistence, auth, or canvas-global orchestration.
11. Collaborative input is validated before Zustand, remote transactions never enter local undo, and non-edit roles are enforced by both client guards and database/Realtime RLS.
