# Grovepad agent guide

Route every task with [the compact codebase map](docs/codebase-map.md), then inspect only the relevant symbols and their direct consumers. Do not ask the user to explain the repository layout.

## Explaining work to the project owner

The project owner is not a professional software engineer. Explain code, architecture, and changes in plain language first — lead with what changed and why it matters in everyday terms, prefer concrete analogies over jargon, and introduce any technical term with a one-sentence gloss. Never assume familiarity with git, the terminal, file formats, or dev tooling. Technical detail can follow underneath, but the plain-language explanation must stand on its own. Go deeper whenever they ask.

## First 90 seconds

1. Run `git status --short` and preserve all pre-existing changes. Never overwrite or revert work you did not create.
2. Search the map: `rg -n -i "<task terms>" docs/codebase-map.md`, then read the matching route. Use [the architecture map](docs/architecture-map.md) only when ownership or cross-system flow is still unclear.
3. Search symbols before opening source (`rg -n "<symbol>"`) and read narrow ranges. For reviews, inspect the diff before surrounding implementation.

## Sources of truth

- Runtime behavior and types: source code.
- Product and interaction rules: [widget constitution](docs/widget-constitution.md), [glass constitution](docs/widget-glass-constitution.md), [circuit engine](docs/circuit-engine.md), [storage contract](docs/storage-format-plan.md).
- Task routing: [codebase map](docs/codebase-map.md). Cross-system architecture: [architecture map](docs/architecture-map.md).
- Known live debt: [patch registry](docs/patch-registry.md) — observations, not authorization for unrelated cleanup.
- Phase gate: [manual smoke checklist](docs/manual-smoke-checklist.md).

If a constitution describes behavior the source does not implement, report the mismatch; do not silently reinterpret the constitution to match the code.

## Context discipline

Coordination surfaces (`src/store/slices/*Slice.ts`, `src/widgets/fields.ts`, `src/widgets/registry.ts`, `EssentialWidgets.tsx`, `WidgetCard.tsx`, `CanvasViewport.tsx`, `scenarioResolver.ts`, `src/styles/product.css`) are searched by symbol, never dumped whole into context. Trace one importer/consumer hop at a time; widen only when evidence shows the change crosses another owner.

## Ownership rules

- `useWidgetStore` owns the canonical board model; domain actions live in `src/store/slices/`.
- `useCanvasStore`/`useCanvasEvents` own camera and viewport interaction. Never mutate a partial camera object in a browser test; use public actions such as `setView`.
- `useCircuitStore` and the circuit engine own transient wire execution state.
- Registry files own widget metadata/defaults/sizing; field files own ports/commands; renderer modules own visual content; neutral types live in `src/widgets/contracts/`.
- Relation, dependency, and wire layers keep separate geometry/semantics and share paint through `CanvasEdge.tsx`/`canvasEdgePolicy.ts`.
- Persistence validates unknown data before hydration; cloud or local-AI failure must not break local board work.
- `runtime/appRuntime.ts` owns persistence and circuit startup/teardown; runtime services return idempotent disposers and never start listeners at component-module scope.
- Animated list removal uses stable item ids and the panel transition lifecycle; short UI acknowledgements use `useTransientValue`, never loose component timers.

## Change workflow

1. State the acceptance criteria in observable terms, then identify the state, render, and style owners from the route map.
2. Make the smallest coherent change; no opportunistic cleanup mixed into feature work.
3. Add or update a deterministic test seam for behavior or geometry changes before relying on manual browser testing.
4. Update `docs/codebase-map.md` in the same change when a file moves, an owner changes, or a new recurring subsystem appears.

For UI testing, start from a known state, use public UI/store actions, and leave no scratch widgets, dev globals, or storage artifacts behind.

## Verification ladder

- Documentation/navigation only: `npm run docs:check`.
- Narrow TypeScript behavior: the closest Vitest file, then `npm run typecheck` and `npm run lint`.
- Store, persistence, shared type, registry, field, or routing changes: `npm run check`.
- Production bundling, global CSS, or phase completion: `npm run check:full`, then applicable manual smoke items.

Do not claim browser verification unless the interaction was actually exercised; record any skipped manual gate.

## Review protocol

Review changed behavior, not just changed lines: canonical state and undo/persistence ownership; direct callers and render consumers; empty/deleted/interrupted/reduced-motion states; zoom/culling/LOD for canvas visuals; keyboard, focus, and pointer-cancel behavior for gestures. Prioritize concrete correctness, data-loss, lifecycle, performance, and accessibility findings over speculative style comments.
