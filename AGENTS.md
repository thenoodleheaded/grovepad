# Grovepad agent guide

This is the automatically loaded entrypoint for AI-assisted work in Grovepad. Do not ask the user to explain the repository layout again. Route the task with [the compact codebase map](docs/codebase-map.md), then inspect only the relevant symbols and their direct consumers.

## First 90 seconds

1. Run `git status --short` and preserve all pre-existing changes. Never overwrite or revert work you did not create.
2. Search the compact map first: `rg -n -i "<task terms>" docs/codebase-map.md`.
3. Read the matching route, contract, and verification row. Use [the deep architecture map](docs/architecture-map.md) only when ownership or cross-system flow is still unclear.
4. Search symbols before opening source: `rg -n "<symbol|class|data-attribute>" <listed files>`.
5. Read narrow ranges around matches. Do not dump a large coordination file into context.
6. For reviews, inspect the diff before surrounding implementation: `git diff --stat`, `git diff --name-only`, then the relevant hunks.

## Sources of truth

- Current runtime behavior and types: source code.
- Product and interaction rules: [widget constitution](docs/widget-constitution.md) and [glass/focus constitution](docs/widget-glass-constitution.md).
- Fast ownership and task routing: [codebase map](docs/codebase-map.md).
- Cross-system architecture and invariants: [architecture map](docs/architecture-map.md).
- Known debt and phased repair boundaries: [patch registry](docs/patch-registry.md). Registry observations are not automatic authorization for unrelated cleanup.
- Phase gate: [manual smoke checklist](docs/manual-smoke-checklist.md).

If the constitution describes intended behavior that the source does not implement, report the mismatch and follow the user's requested direction. Do not silently reinterpret the constitution to match current code.

## Context discipline

The following files are coordination surfaces. Search them by symbol and read only the relevant neighborhood unless a full-file audit is explicitly required:

- `src/store/useWidgetStore.ts`
- `src/types/spatial.ts`
- `src/widgets/fields.ts`
- `src/widgets/registry.ts`
- `src/components/widgets/modules/EssentialWidgets.tsx`
- `src/components/widgets/WidgetCard.tsx`
- `src/components/canvas/CanvasViewport.tsx`
- `src/utils/scenarioResolver.ts`
- `src/styles/product.css`

Prefer `rg --files` and `rg -n`. Trace at most one importer/consumer hop at a time, then widen only when evidence shows the change crosses another owner. Summarize findings instead of retaining long raw file output.

## Ownership rules

- `useWidgetStore` owns the canonical board model, history, widgets, relations, connections, groups, and hierarchy.
- `useCanvasStore` and `useCanvasEvents` own camera and viewport interaction. Never mutate a partial camera object in a browser test; use public actions such as `setView`.
- `useCircuitStore` and the circuit engine own transient wire execution state.
- `useFocusStore` owns focus entry/exit and camera locking; persisted island order and size live in widget metadata.
- Registry files own widget metadata/defaults/sizing. Field files own ports, commands, and typed circuit behavior. Renderer modules own visual content.
- Relation, dependency, and wire layers share drawing ideas but retain separate semantic and endpoint policies.
- Persistence validates unknown data before store hydration. Optional cloud or local-AI failure must not break local board work.

## Change workflow

1. State the acceptance criteria in observable terms.
2. Identify the state owner, render owner, style owner, contract, and nearest test from the route map.
3. Make the smallest coherent change. Do not mix opportunistic cleanup into feature work.
4. Add or update a deterministic test seam for behavior or geometry changes before relying on manual browser testing.
5. Use the verification ladder below.
6. Update `docs/codebase-map.md` in the same change whenever a file moves, a responsibility changes owners, or a new recurring subsystem is introduced.

For UI testing, start from a known state and use public UI/store actions. Do not leave scratch widgets, dev globals, altered camera persistence, or local-storage artifacts behind. Coordinate browser input from current screenshots/DOM measurements rather than assumed scale factors.

## Verification ladder

- Documentation/navigation only: `npm run docs:check`.
- Focus-mode reorder logic: `npm run test:focus`.
- Narrow TypeScript behavior: run the closest Vitest file, then `npm run typecheck` and `npm run lint`.
- Store, persistence, shared type, registry, field, or routing changes: `npm run check`.
- Production bundling, global CSS, or phase completion: `npm run check:full`, then all applicable manual smoke items.

Do not claim browser verification unless the interaction was actually exercised. Record any skipped manual gate and why.

## Review protocol

Review changed behavior, not just changed lines. For every touched subsystem, check:

1. Canonical state and undo/persistence ownership.
2. Direct callers and render consumers.
3. Empty, deleted, interrupted, and reduced-motion states where applicable.
4. Zoom/culling/LOD effects for canvas visuals.
5. Keyboard, focus, pointer-cancel, and interactive-child behavior for gestures.
6. Relevant automated checks and a concise manual verification recipe.

Prioritize concrete correctness, data-loss, lifecycle, performance, and accessibility findings. Avoid speculative style comments without a violated contract.
