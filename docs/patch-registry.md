# Grovepad Patch Registry

_Phase 1 diagnostic registry — 2026-07-14. Registry entries are observations, not authorization to change code._

## Reading the registry

| Priority | Meaning |
|---|---|
| P0 | Safety or data-loss exposure; resolve before broad refactoring |
| P1 | High coupling or behavior risk; plan a bounded phase |
| P2 | Concrete cleanup/root-heal candidate |
| P3 | Low-risk hygiene |
| Keep | Timer or pattern has a legitimate semantic job; do not remove merely because a scanner found it |

The diagnostic question for every fix remains: **where is the bad state produced?** A successful root heal should make the downstream guard or delay deletable.

## Phase-level blockers

| ID | Priority | Location | Suspicious spot | Symptom currently suppressed / risk created | Root direction |
|---|---|---|---|---|---|
| S-001 | P0 | Workspace root | No `.git` repository | There is no trustworthy baseline, reviewable diff, commit gate, or bisect path for later phases | Complete Phase 0 before deletions or structural moves |
| S-002 | P1 | `useWidgetStore.ts` (3,501 lines) | One store owns nearly every board domain | Any board change requires loading and reasoning about unrelated history, layout, hierarchy, group, relation and widget logic | Split by domain with contract tests; move only in Phase 3 |
| S-003 | P1 | `spatial.ts` (1,881 lines; fan-in 123) | One file is the universal type and constants hub | Almost every feature imports the same catalogue, increasing edit blast radius and cycle pressure | Split neutral primitives, canvas hierarchy, widget-data families and persistence schema |
| S-004 | P1 | `fields.ts` / `registry.ts` | Root contracts and generated family implementations point at each other | Type-only cycles obscure the real runtime graph and make family extraction harder | Move `WidgetDefinition` and field contract types to dependency-neutral modules |
| S-005 | P1 | `CanvasViewport.tsx` | Composition root also starts persistence and circuit services at module scope | HMR/re-import can multiply listeners because persistence has no initialization guard; routing and runtime lifecycle are fused | Add an application runtime boundary with explicit init/dispose |
| S-006 | P1 | `persistence.ts` | Schema, validation, scheduling, IndexedDB, cloud reconciliation and UI status live together | Adapters import their contract back from the orchestrator; failures are hard to isolate | Extract persisted schema/validation, local adapter and cloud coordinator |
| S-007 | P1 | Three canvas line layers | Each repeats culling, descriptor LOD, SVG paths, markers, hit paths and menu plumbing | Visual fixes must be repeated and can drift; earlier dependency work already needed parallel relation-line logic | Extract shared edge-render primitives, preserving separate endpoint/semantic strategies |
| S-008 | P2 | `index.css` + `styles/product.css` (2,700 lines) | Two unlayered global stylesheets load in order | Cascade ownership is implicit; later rules can silently override earlier contracts | Introduce explicit CSS layers/tokens, then migrate by subsystem |
| S-009 | P1 | `WidgetRenderer.tsx` (fan-out 60) | Central exhaustive dispatcher knows every concrete renderer and data type | Adding or moving one widget touches a global switch; lazy imports help startup but not authorship coupling | Generate dispatch from per-family renderer maps after type split |
| S-010 | P1 | UI/widgets/hooks tests | No direct tests under `components/ui`, widget modules, or hooks | Visual and lifecycle refactors rely on manual testing; timeout/unmount races have no automated guard | Add focused interaction tests before Phase 4/5 changes |
| S-011 | P2 | `circuitEngine.ts:309` | Module-lifetime interval and visibility listener have no disposer | Safe in one production boot, but dev HMR/tests cannot clean the runtime up | Return/store a disposer from engine initialization |
| S-012 | P2 | `persistence.ts:473` | `initPersistence` has no one-shot guard or disposer | Re-import/HMR can create duplicate subscriptions and global listeners | Make initialization idempotent and expose teardown |

## Knip findings

### Unused file

| ID | Priority | Finding | Evidence | Phase 2 action |
|---|---|---|---|---|
| K-001 | P2 | `src/utils/i18n.ts` is unused | No import or reference in `src`; Knip's only unused-file result | Delete if localization is not an imminent committed feature; otherwise integrate deliberately, not as an orphan boundary |

### Unused exports

Knip reported these 13 exports. “Unused export” does not always mean “unused implementation”: values referenced inside their own file should become private rather than be deleted.

| ID | Location | Export | Internal use? | Candidate action |
|---|---|---|---|---|
| K-002 | `circuitEngine.ts` | `BURST_LIMIT` | Yes | Remove `export` |
| K-003 | `useCanvasWidgets.ts` | `useSubCanvasCount` | No | Delete after verifying no planned consumer |
| K-004 | `types/circuit.ts` | `isValidTransform` | Yes | Remove `export` |
| K-005 | `types/spatial.ts` | `clampInt` | No | Delete |
| K-006 | `types/spatial.ts` | `ghostColumnOffset` | Yes | Remove `export` |
| K-007 | `types/spatial.ts` | `ghostCellPosition` | No external consumer | Keep private if used by a sibling helper; otherwise delete |
| K-008 | `types/spatial.ts` | `ghostWidgetCount` | No | Delete |
| K-009 | `utils/curve.ts` | `curvedPoints` | No | Delete after curve tests |
| K-010 | `utils/curve.ts` | `flowCurvePoints` | No | Delete after curve tests |
| K-011 | `utils/portGeometry.ts` | `PORT_HIT_RADIUS` | Yes | Remove `export` |
| K-012 | `utils/portGeometry.ts` | `portSpacing` | Yes | Remove `export` unless retained as a unit-test seam |
| K-013 | `utils/structuralPlanner.ts` | `studyWidgetsForSubject` | Yes | Remove `export` |
| K-014 | `utils/structuralPlanner.ts` | `buildStructuralPlan` | Yes | Remove `export` |

### Unused exported types

| ID | Priority | Finding | Interpretation | Candidate action |
|---|---|---|---|---|
| K-015 | P3 | 107 exported types have no external consumer | Most are leaf widget-data records in `spatial.ts`; others are internal service/store result types. This is API bloat, not runtime dead code | Remove unnecessary `export` modifiers during the Phase 3 type split; do not delete shapes still used by composite types |

Concentrations include widget leaf records (`ChecklistItem`, `RiskItem`, `PieChartSegment`, Atlas/automation items), scenario resolver intermediate types, mind-map minified records, store status types, and local-AI/debug types.

### Package dependencies

Knip reported **no unused dependencies or devDependencies**. Do not remove packages based on this Phase 1 scan.

## Circular dependency registry

Madge reported 13 cycles. The “back edge” column identifies what closes each loop.

| ID | Reported path | Back edge | Runtime impact | Disposition |
|---|---|---|---|---|
| C-001 | `atlasCatalog → registry → registry/atlas` | `atlasCatalog` imports `WidgetCategory` as type | None after TS emit | Extract registry contract type |
| C-002 | `registry → registry/atlas` | `registry/atlas` imports `WidgetDefinition` as type | None after TS emit | Same contract extraction |
| C-003 | `registry → registry/automationCore → automationCoreCatalog` | Catalogue imports `WidgetCategory` as type | None after TS emit | Same contract extraction |
| C-004 | `registry → registry/automationCore` | Family imports `WidgetDefinition` as type | None after TS emit | Same contract extraction |
| C-005 | `registry → registry/expansion` | Family imports `WidgetDefinition` as type | None after TS emit | Same contract extraction |
| C-006 | `scenarioResolver → scenarios/catalogue` | Catalogue imports `ArchetypeSpec`/`ScenarioDomain` as types | None after TS emit | Move scenario contracts to a neutral type module |
| C-007 | `persistence → usePersistenceStatusStore` | Status store imports `PersistedBoard` as type | None after TS emit | Extract persisted schema contract |
| C-008 | `useWidgetStore → persistence` | Persistence imports `WidgetStoreState` as type | None after TS emit | Make load/schema independent of store API |
| C-009 | `persistence → boardDatabase` | Database imports `PersistedBoard` as type | None after TS emit | Extract persisted schema contract |
| C-010 | `persistence → cloudSync` | `cloudSync` imports runtime parser from persistence; persistence dynamically imports cloud adapter | Real but deferred and currently initialization-safe | Put parser/schema in neutral module so adapter is one-way |
| C-011 | `fields → fields/atlas` | Family imports root field contract types | None after TS emit | Extract field descriptor contracts |
| C-012 | `fields → fields/automationCore` | Family imports root field contract types | None after TS emit | Extract field descriptor contracts |
| C-013 | `fields → fields/expansion` | Family imports root field contract types | None after TS emit | Extract field descriptor contracts |

These are architectural coupling signals, not evidence that the current bundle executes partially initialized modules. Phase 2 should not “fix” them opportunistically; they belong with the Phase 3 contract split.

## Complete `setTimeout` audit

There are 23 call sites, not the earlier estimate of 26.

| ID | Verdict | Location | Purpose | Audit note / root direction |
|---|---|---|---|---|
| T-001 | Keep | `useToastStore.ts:26` | Auto-dismiss toast | Legitimate UI lifetime; id-based removal is idempotent |
| T-002 | Keep | `useWidgetStore.ts:1294` | Fresh-spawn animation TTL | Legitimate module-lifetime cache; no sequencing dependency |
| T-003 | P2 | `useWidgetStore.ts:1932` | Clear widget flash after 1.5s | Re-flashing the same id before the first timer fires lets the older timer clear the newer flash; use a token/deadline or owned timer |
| T-004 | Keep | `automationExecutor.ts:39` | Terminate runaway script worker | Required hard safety deadline; cleared on message/error |
| T-005 | Keep | `webLlmAdapter.ts:104` | Detect worker finalization stall | Required bounded failure path; cleared in `finally` |
| T-006 | Keep | `webLlmAdapter.ts:323` | Bound model generation | Required request deadline; interrupts engine and clears in `finally` |
| T-007 | Keep | `useCanvasEvents.ts:213` | Touch long-press recognition | Gesture threshold, not ordering patch; cancellation covers pointer end, blur and cleanup |
| T-008 | Keep | `persistence.ts:426` | Debounced board/view save | Legitimate coalescing scheduler with explicit flush |
| T-009 | Keep | `persistence.ts:434` | Idle-callback fallback | Zero-delay task scheduling, not a race workaround; owned by saver cancellation |
| T-010 | Keep | `useSharedClock.ts:27` | Schedule next shared subscriber tick | Efficient visibility-aware scheduler; timer is centrally owned |
| T-011 | Keep | `DecisionWidget.tsx:45` | Eased roulette animation | Presentation timeline with unmount cleanup |
| T-012 | P3 | `GhostTreeShaper.tsx:44` | Hold removed ghost nodes for exit animation | Previous timer is cleared, but component unmount has no cleanup; own timer in an effect cleanup |
| T-013 | Keep | `QuickAddPreviewLayer.tsx:178` | Hold departing preview chips | Presentation lifetime with effect cleanup |
| T-014 | P1 | `BulletsWidget.tsx:42` | Delay deletion until panel animation ends | Index identity can shift during the delay, concurrent removal resets all flags, and no timer is owned; give bullets stable ids and finalize by id/transition lifecycle |
| T-015 | Keep | `GroupPlate.tsx:64` | Hold group drop morph for CSS transition | Explicit animation lifetime with cleanup |
| T-016 | Keep | `ColorPaletteWidget.tsx:40` | Clear copy acknowledgement | Timer is owned, replaced, and cleaned on unmount |
| T-017 | Keep | `QuickAddSheet.tsx:235` | Debounce fast local-model enrichment | Intentional settled-text threshold; timer cleanup and AbortController prevent stale application |
| T-018 | Keep | `QuickAddSheet.tsx:342` | Debounce deep compose model | Intentional higher-cost threshold; timer cleanup and AbortController are present |
| T-019 | P2 | `ChecklistWidget.tsx:51` | Delay deletion until panel animation ends | Stable ids avoid the Bullets bug, but an unowned timer can call `onChange` after widget unmount; centralize panel-exit completion/cancellation |
| T-020 | P1 | `AiGeneratorWidget.tsx:45` | Pretend generation latency, then spawn canned notes | The delay is the implementation: it masks the absence of a real generator contract and can create output after context changed; replace with a real service/action or clearly reclassify as a template widget |
| T-021 | P3 | `EssentialWidgets.tsx:1379` | Clear converter copy acknowledgement | No timer ownership/cleanup; use shared copied-state hook or owned timer |
| T-022 | P3 | `CitationWidget.tsx:39` | Clear citation copy acknowledgement | Conditional state reset is stale-safe, but timer is not cleaned on unmount |
| T-023 | P3 | `CodeWidget.tsx:19` | Clear code-copy acknowledgement | Timer is not cleaned and repeated copies can clear the newest acknowledgement early |

Summary: **15 Keep, 8 follow-up**. Only T-003, T-014 and T-020 are credible state/behavior patches; the remaining follow-ups are lifecycle hygiene.

## Other suspicious guards and lifecycle spots

| ID | Priority | Location | Suspicious spot | Symptom currently suppressed | Root direction |
|---|---|---|---|---|---|
| G-001 | P2 | `QuickAddSheet.tsx:364`, `AddWidgetModal.tsx:314` | ESLint exhaustive-deps suppressions in an Oxlint project | Dependency decisions are undocumented and the named lint rule is not the active tool's contract | Replace suppression with a named stable callback/ref invariant or an Oxlint-supported rule configuration |
| G-002 | P2 | `persistence.ts:551`, auth/local-AI request paths | Token/Abort guards discard late async results | These are valid downstream guards, but repeated patterns indicate no shared “latest request wins” primitive | Extract a tested request-generation helper; retain semantic cancellation |
| G-003 | P2 | `RelationLines.tsx` pill geometry constants | Text width/pill bounds are estimated in drawing code | Routes avoid title pills through duplicated knowledge of title CSS dimensions | Publish shared title-pill geometry tokens or a pure layout contract |
| G-004 | P2 | Widget height estimators in `useWidgetStore.ts` plus DOM reporters in modules | Store predicts some content height while selected modules report measured height | Two producers can disagree, causing clamps/growth patches downstream | Give each widget one declared sizing policy: pure estimator or measured auto-height |
| G-005 | P2 | `useWidgetStore.ts` module-level undo arrays and gesture caches | Store state is partly outside Zustand | Board reload/tests can leave invisible process-lifetime state unless every path resets it | Encapsulate history/gesture session behind an explicit slice lifecycle |
| G-006 | P2 | `CanvasViewport.tsx` development `window.__grovepad` assignment | Global debug access exposes live mutable stores | Useful debugging seam can become an undocumented mutation API | Gate behind a typed dev adapter and keep it out of production contracts |
| G-007 | P3 | Silent `catch {}` sites in auth/persistence/import | Errors are intentionally swallowed without a common diagnostic channel | Operational failures can look like no-ops and are hard to reproduce | Route expected failures to typed statuses; unexpected failures to a dev diagnostic store |

## Recommended execution order after Phase 1

1. **Complete Phase 0 first:** initialize Git deliberately, review `.gitignore`, record the green baseline, and add the manual smoke checklist.
2. **Phase 2 deletion:** K-001 and truly unused implementations first; remove only export modifiers for internally used values. Re-run Knip after every cluster.
3. **Before Phase 3:** add tests around board hydration, history reset, persistence initialization, and widget removal animation races.
4. **Phase 3 contracts:** extract persisted schema, registry contracts, field contracts, and neutral spatial primitives before moving store slices.
5. **Phase 4 visuals:** share line renderer primitives and CSS layers without merging relation/dependency/wire semantics.
6. **Phase 5 root heals:** T-020, T-014, T-003, then lifecycle hygiene entries.

Every implementation phase should end with build, lint, tests, the manual smoke checklist, and a commit. That gate is currently unavailable until S-001 is resolved.

