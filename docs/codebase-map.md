# Grovepad codebase map

This is the compact navigation layer for fresh AI tasks. It routes user language to the smallest useful source surface. For system diagrams, fan-in/fan-out, cycles, and deep invariants, continue to the [architecture map](architecture-map.md).

## How to use this map

1. Search task words here before opening source: `rg -n -i "focus|panel|dependency|quick add" docs/codebase-map.md`.
2. Start with the first file in the matching route.
3. Search the listed symbols/classes inside those files and read narrow ranges.
4. Inspect direct consumers only when the requested behavior crosses the stated owner.
5. Run the route's targeted check before escalating to the full suite or browser.

Paths and headings are checked by `npm run docs:check`. Use symbol names rather than line numbers because lines drift.

## Task router

| User language / task | Start here | State or contract owner | Styles / UX law | Nearest verification |
|---|---|---|---|---|
| App boot, login, guest route | [App.tsx](../src/App.tsx), [LoginPage.tsx](../src/components/auth/LoginPage.tsx) | [useAuthStore.ts](../src/store/useAuthStore.ts) | [index.css](../src/index.css) | Build plus guest/signed-in smoke |
| Canvas composition, global shortcuts, overlay mounting | [CanvasViewport.tsx](../src/components/canvas/CanvasViewport.tsx) | Runtime start/stop: [appRuntime.ts](../src/runtime/appRuntime.ts); canvas/store owners below | [product.css](../src/styles/product.css) | Build, lint, applicable smoke |
| Pan, zoom, camera history, pointer selection | [useCanvasEvents.ts](../src/hooks/useCanvasEvents.ts), [useCanvasStore.ts](../src/store/useCanvasStore.ts) | [canvasView.ts](../src/utils/canvasView.ts) | Canvas interaction invariants in [architecture map](architecture-map.md) | Typecheck plus pan/zoom smoke |
| Widget shell drag, resize, collapse, selection, ports | [WidgetCard.tsx](../src/components/widgets/WidgetCard.tsx) | [useWidgetStore.ts](../src/store/useWidgetStore.ts) | Search `gp-widget-card` in [index.css](../src/index.css) and [product.css](../src/styles/product.css) | Build plus widget shell smoke |
| Focus mode, movable panels/islands, panel sizing | [FocusModeLayer.tsx](../src/components/widgets/FocusModeLayer.tsx), [WidgetPanel.tsx](../src/components/widgets/WidgetPanel.tsx) | [useFocusStore.ts](../src/store/useFocusStore.ts), `WidgetMetadata.islandLayout` in [spatial.ts](../src/types/spatial.ts) | Article XVIII in [glass constitution](widget-glass-constitution.md); search `gp-focus` and `gp-island` in [product.css](../src/styles/product.css) | `npm run test:focus`, typecheck, lint, focus smoke |
| Widget contents or one specific widget | [WidgetRenderer.tsx](../src/components/widgets/WidgetRenderer.tsx), then the matching file in [modules](../src/components/widgets/modules) | Search the type in [widgetData.ts](../src/types/widgetData.ts), then open its exported family file | Both constitutions; shared island vocabulary in [WidgetPanel.tsx](../src/components/widgets/WidgetPanel.tsx) | Closest widget/registry test plus build |
| Add-widget picker, catalogue grouping, widget defaults | [AddWidgetModal.tsx](../src/components/ui/AddWidgetModal.tsx) | [registry.ts](../src/widgets/registry.ts) and registry families | Search `gp-widget-picker` in [product.css](../src/styles/product.css) | Build, lint, picker keyboard/pointer smoke |
| Light/dark mode, glass, global widget color system | [useThemeStore.ts](../src/store/useThemeStore.ts), [index.css](../src/index.css), [product.css](../src/styles/product.css) | CSS theme tokens and registry accents | [glass constitution](widget-glass-constitution.md) | `npm run check:full` plus both-theme visual smoke |
| Board mutations, undo/redo, groups, hierarchy, untangle, auto-scale | [useWidgetStore.ts](../src/store/useWidgetStore.ts), then the named domain in [slices](../src/store/slices) | [widgetStoreTypes.ts](../src/store/widgetStoreTypes.ts); action bodies live in domain slices | [architecture map](architecture-map.md) invariants | Closest store test, then `npm run check` |
| Relations and semantic relation editing | [RelationLines.tsx](../src/components/canvas/RelationLines.tsx) | Relation records in [useWidgetStore.ts](../src/store/useWidgetStore.ts) | Geometry: [curve.ts](../src/utils/curve.ts); shared paint: [CanvasEdge.tsx](../src/components/canvas/CanvasEdge.tsx) | [CanvasEdge.test.tsx](../src/components/canvas/CanvasEdge.test.tsx), [curve.test.ts](../src/utils/curve.test.ts), relation smoke |
| Dependencies, blocker direction, dependency chips | [DependencyLines.tsx](../src/components/canvas/DependencyLines.tsx) | Blocker relations in [useWidgetStore.ts](../src/store/useWidgetStore.ts) | Geometry: [dependencyGeometry.ts](../src/utils/dependencyGeometry.ts); shared paint: [CanvasEdge.tsx](../src/components/canvas/CanvasEdge.tsx) | Shared-edge and dependency geometry tests plus dependency smoke |
| Input/output ports, wires, connection propagation | [PortRail.tsx](../src/components/widgets/PortRail.tsx), [WireLayer.tsx](../src/components/canvas/WireLayer.tsx) | [fields.ts](../src/widgets/fields.ts), [circuitEngine.ts](../src/engine/circuitEngine.ts), [useCircuitStore.ts](../src/store/useCircuitStore.ts) | Geometry: [portGeometry.ts](../src/utils/portGeometry.ts); paint: [CanvasEdge.tsx](../src/components/canvas/CanvasEdge.tsx); [circuit-engine.md](circuit-engine.md) | Shared-edge, circuit, and connection lifecycle tests plus wire smoke |
| Persistence, device state, reload, migration snapshots, IndexedDB, cloud sync, stale deploys | [persistence.ts](../src/utils/persistence.ts) | Board schema: [persistedBoardSchema.ts](../src/utils/persistedBoardSchema.ts); local navigation: [persistedDeviceState.ts](../src/utils/persistedDeviceState.ts); cloud split/compression: [cloudDocuments.ts](../src/utils/cloudDocuments.ts); cloud reconciliation: [cloudSync.ts](../src/utils/cloudSync.ts); IndexedDB: [boardDatabase.ts](../src/utils/boardDatabase.ts); Supabase migration/tests: [database deployment](database-deployment.md); deploy monitor: [deployVersionMonitor.ts](../src/runtime/deployVersionMonitor.ts) | [Storage format plan](storage-format-plan.md) and persistence flow in [architecture map](architecture-map.md) | board/device/cloud tests, `npm run check`, linked pgTAP, navigation/reload smoke |
| AI Generator widget, generated canvas output | [AiGeneratorWidget.tsx](../src/components/widgets/modules/AiGeneratorWidget.tsx) | [widgetGeneration.ts](../src/services/widgetGeneration.ts), then [localAiService.ts](../src/services/localAiService.ts) | Widget status UI locally; plan validation stays in the AI service | [widgetGeneration.test.ts](../src/services/widgetGeneration.test.ts), local-AI tests, generation/cancel smoke |
| Panel/list removal animation or copied acknowledgement | [WidgetPanel.tsx](../src/components/widgets/WidgetPanel.tsx), [useTransientValue.ts](../src/hooks/useTransientValue.ts) | Stable item ids in widget data; timeout ownership in [ownedTimeout.ts](../src/utils/ownedTimeout.ts) | `gp-subpanel-exit` in [product.css](../src/styles/product.css) | Panel-removal and owned-timeout tests plus reduced-motion smoke |
| Quick Add, thought interpretation, scenario prediction | [QuickAddSheet.tsx](../src/components/ui/QuickAddSheet.tsx) | [thoughtInterpreter.ts](../src/utils/thoughtInterpreter.ts), [scenarioResolver.ts](../src/utils/scenarioResolver.ts) | [scenario-intelligence.md](scenario-intelligence.md) | Scenario/scaffold/structural planner tests |
| Optional local AI, model profiles, deterministic/model handshake | [localAiService.ts](../src/services/localAiService.ts), [local-ai](../src/services/local-ai) | [planProtocol.ts](../src/services/local-ai/planProtocol.ts), runtime adapters | [local-ai-runtime.md](local-ai-runtime.md) | Local-AI, plan protocol, profile, and adapter tests |
| Canvas density, culling, proxy rendering, performance | [WidgetLayer.tsx](../src/components/widgets/WidgetLayer.tsx), [useQuantizedView.ts](../src/hooks/useQuantizedView.ts) | [canvasDensity.ts](../src/utils/canvasDensity.ts) | Proxy styles in [WidgetProxy.css](../src/components/widgets/WidgetProxy.css) | Build plus far-zoom smoke and performance check |
| Imports, PDF/document parsing, media blobs | [ImportDocumentModal.tsx](../src/components/ui/ImportDocumentModal.tsx) | [documentReader.ts](../src/utils/documentReader.ts), [pendingImport.ts](../src/utils/pendingImport.ts), [boardDatabase.ts](../src/utils/boardDatabase.ts) | Import UI locally | Build plus import/cancel/reload smoke |

## Domain routes introduced in Phase 3

| Domain | Implementation route | Contract / pure helpers |
|---|---|---|
| Workspace and canvas hierarchy | [navigationSlice.ts](../src/store/slices/navigationSlice.ts) | [workspaces.ts](../src/types/workspaces.ts) |
| Widget creation and thought plans | [widgetCreationSlice.ts](../src/store/slices/widgetCreationSlice.ts) | [widgetSizing.ts](../src/store/widgetSizing.ts), [widgetSeeds.ts](../src/store/widgetSeeds.ts) |
| Move, resize, auto-scale, untangle | [widgetLayoutSlice.ts](../src/store/slices/widgetLayoutSlice.ts) | [widgetCollection.ts](../src/store/widgetCollection.ts), [widgetSettling.ts](../src/store/widgetSettling.ts), [widgetUntangle.ts](../src/store/widgetUntangle.ts) |
| Relations and circuit connections | [circuitSlice.ts](../src/store/slices/circuitSlice.ts) | [relations.ts](../src/types/relations.ts), [fields.ts](../src/widgets/contracts/fields.ts) |
| Groups | [groupSlice.ts](../src/store/slices/groupSlice.ts) | [widgetGraph.ts](../src/store/widgetGraph.ts) |
| Selection, deletion, duplication | [selectionSlice.ts](../src/store/slices/selectionSlice.ts) | [widgetStoreTypes.ts](../src/store/widgetStoreTypes.ts) |
| Overlays, linking, ghost shaper | [uiLinkingSlice.ts](../src/store/slices/uiLinkingSlice.ts) | [widgetGhostLayout.ts](../src/store/widgetGhostLayout.ts) |
| Undo/redo lifecycle | [widgetHistory.ts](../src/store/widgetHistory.ts) | [boardHydration.test.ts](../src/store/boardHydration.test.ts), [widgetHistory.test.ts](../src/store/widgetHistory.test.ts) |

## High-cost files: search before reading

| File | Search first for | Why it is expensive |
|---|---|---|
| [fields.ts](../src/widgets/fields.ts) | Widget type, field name, command name | Port/command descriptors span the catalogue |
| [registry.ts](../src/widgets/registry.ts) | Widget type or `WidgetDefinition` | Metadata, defaults, sizing, packs, and generated families meet here |
| [EssentialWidgets.tsx](../src/components/widgets/modules/EssentialWidgets.tsx) | Exported widget component name | Twenty renderers share one module |
| [WidgetRenderer.tsx](../src/components/widgets/WidgetRenderer.tsx) | Widget type or lazy component name | Exhaustive dispatch has high fan-out |
| [WidgetCard.tsx](../src/components/widgets/WidgetCard.tsx) | Interaction name, data attribute, or child component | Shell gestures, focus, ports, scale state, and chrome meet here |
| [CanvasViewport.tsx](../src/components/canvas/CanvasViewport.tsx) | Overlay/component name or shortcut | Composition root imports most application surfaces |
| [scenarioResolver.ts](../src/utils/scenarioResolver.ts) | Scenario/archetype name or exported resolver | Classification, routing, preferences, and resolution share one file |
| [product.css](../src/styles/product.css) | Stable `gp-` class or `data-*` selector | Global subsystem styles and theme overrides share the cascade |

## Recurring route: focus-mode panel work

1. Read Article XVIII of [the glass constitution](widget-glass-constitution.md).
2. Search `beginReorder`, `moveReorder`, `endReorder`, `beginResize`, and `applyLayout` in [FocusModeLayer.tsx](../src/components/widgets/FocusModeLayer.tsx).
3. Search `data-island` and sizing attributes in [WidgetPanel.tsx](../src/components/widgets/WidgetPanel.tsx) and the affected renderer only.
4. Search `gp-focus`, `gp-island-lift`, and `data-focus-reordering` in [product.css](../src/styles/product.css).
5. Run `npm run test:focus`, then typecheck and lint.
6. Manually exercise pointer down, move, release, pointer cancel, reduced motion, an interactive child, zoomed camera, exit/re-entry, and reload persistence.

Never write partial camera/store objects through a dev hook to make this test reachable. Use public actions and a clean guest state. A browser failure caused by test setup is not evidence of a product failure.

## Recurring route: canvas line work

Start with the semantic layer named by the user. Relation, dependency, and wire visuals share [CanvasEdge.tsx](../src/components/canvas/CanvasEdge.tsx), [canvasEdgePolicy.ts](../src/components/canvas/canvasEdgePolicy.ts), and the `Shared canvas edge paint system` section of [index.css](../src/index.css). Their endpoint geometry and state models remain separate. Inspect [curve.ts](../src/utils/curve.ts), [dependencyGeometry.ts](../src/utils/dependencyGeometry.ts), or [portGeometry.ts](../src/utils/portGeometry.ts) only after identifying the owning semantic layer.

At minimum verify finite SVG geometry, zoom alignment, endpoint side, culling/LOD, selection hit target, deletion, and no `NaN`/`Infinity` attributes.

## Code review route

1. `git diff --stat` and `git diff --name-only`.
2. Read changed hunks before full files.
3. Find direct callers/importers with `rg -n "from ['\"]<module>|<symbol>" src`.
4. Map each changed behavior to its owner and invariant above.
5. Review interrupted gestures, unmounts, deletion, empty data, reload, reduced motion, and far zoom where relevant.
6. Run the smallest proving test, then expand according to blast radius.

## Verification routes

| Scope | Required command / check |
|---|---|
| Navigation docs only | `npm run docs:check` |
| Focus reorder algorithm | `npm run test:focus` |
| One pure helper | `npm test -- <nearest-test-file>` plus typecheck and lint |
| Store, persistence, shared types, registry, fields, routing | `npm run check` |
| Production bundle or global CSS | `npm run check:full` plus applicable [manual smoke checklist](manual-smoke-checklist.md) items |

## Keeping the map trustworthy

Update this file in the same commit when:

- An entrypoint moves or is renamed.
- State or contract ownership changes.
- A new recurring subsystem or verification command is introduced.
- A route repeatedly requires opening an unlisted file.

Do not paste implementation into this map. Keep routes, symbols, contracts, and verification only. `npm run docs:check` must remain green.
