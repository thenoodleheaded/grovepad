# Grovepad Patch Registry

_Live technical-debt observations. Entries are observations, not authorization to change code. The diagnostic question for every fix: **where is the bad state produced?** A successful root heal makes the downstream guard or delay deletable._

Phases 0–6 of the original repair program are complete: the store is sliced by domain, contracts and schemas are dependency-neutral, Madge reports zero cycles, Knip reports zero unused files/exports (`knip.json` scopes the scan), runtime services return idempotent disposers, and renderer dispatch is family-owned. Historical detail lives in git history.

## Live items

| ID | Priority | Location | Observation | Root direction |
|---|---|---|---|---|
| S-008 | P2 | `index.css` + `styles/product.css` | Two unlayered global stylesheets load in order; cascade ownership is implicit | Introduce explicit CSS layers/tokens, then migrate by subsystem — only with a dedicated visual regression pass in both themes |
| G-002 | P3 | auth/persistence/local-AI request paths | Token/Abort "latest request wins" guards are correct but repeated | Extract a tested request-generation helper only when a new consumer appears; do not churn persistence for symmetry |
| G-003 | P3 | `RelationLines.tsx` pill geometry constants | Title-pill bounds are estimated in drawing code, documented against the pill's CSS | Sharing real geometry means the pill component consuming layout tokens; revisit if the pill design changes |
| G-007 | P3 | Silent `catch {}` sites in auth/persistence/import | Expected browser-API failures (private-mode storage, parse errors) are intentionally swallowed | Route to typed statuses if a debugging session is ever hampered; most sites are deliberate guards |

## Deliberate keepers

These patterns were audited and have a legitimate semantic job. Do not remove them because a scanner flags them:

- **Timers** — toast auto-dismiss (`useToastStore`), fresh-spawn animation TTL (`useWidgetStore`), script-worker/model hard deadlines (`automationExecutor`, `webLlmAdapter`), touch long-press (`useCanvasEvents`), debounced saves with explicit flush (`persistence`), the shared visibility-aware clock (`useSharedClock`), presentation lifetimes with unmount cleanup (`DecisionWidget`, `QuickAddPreviewLayer`, `GroupPlate`, `ColorPaletteWidget`), and Quick Add's enrichment debounces with AbortController cleanup.
- **Module-lifetime caches** — `recentlySpawnedIds` (spawn-animation window) and the in-memory widget clipboard in `CanvasViewport` are deliberately process-scoped.
- **Dev hook** — `window.__grovepad` is gated behind `import.meta.env.DEV` and tree-shaken from production builds.

Every implementation phase ends with build, lint, tests, the manual smoke checklist, and a commit.
