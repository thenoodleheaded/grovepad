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
| S-001 | Resolved | Workspace root | Git baseline and phase gate | The project is tracked on `main`; build, lint, tests, and the manual smoke checklist form the phase gate | Keep the gate green and commit each phase independently |
| S-002 | Resolved | `useWidgetStore.ts` + `store/slices/` | Store actions are split by navigation, creation, layout, circuit, groups, selection and UI/linking | The facade is 318 lines and each slice is below 400 lines | Keep new actions in their owning slice |
| S-003 | Resolved | `types/spatial.ts` + domain type modules | Canvas, relation, workspace, module and widget-data domains are separate | The compatibility facade is 156 lines; every new type file is below 400 lines | Import neutral domain contracts directly in new infrastructure |
| S-004 | Resolved | `widgets/contracts/` | Registry and field contracts are dependency-neutral | Family modules no longer import their root implementation for types | Keep contracts free of family implementation imports |
| S-005 | P1 | `CanvasViewport.tsx` | Composition root also starts persistence and circuit services at module scope | HMR/re-import can multiply listeners because persistence has no initialization guard; routing and runtime lifecycle are fused | Add an application runtime boundary with explicit init/dispose |
| S-006 | In progress | `persistence.ts`, `persistedBoardSchema.ts`, `types/persistence.ts` | Schema and validation are now neutral; scheduling and reconciliation remain together | Adapter back-edges are gone, while runtime lifecycle work remains for Phase 5 | Split runtime lifecycle only with initialization/disposal tests |
| S-007 | Resolved | `CanvasEdge.tsx`, `canvasEdgePolicy.ts`, three semantic layers | SVG paint order, viewport shell, hit path, detail thresholds, corridor culling and interaction CSS are shared | Relation, dependency and wire geometry/semantics remain independent while visual infrastructure changes once | Keep endpoint policy and menus in each semantic owner |
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
| C-001 | Resolved | Registry contract extracted | None | `widgets/contracts/registry.ts` |
| C-002–C-005 | Resolved | Registry family contract back-edges removed | None | `widgets/contracts/registry.ts` |
| C-006 | Resolved | Scenario catalogue contract back-edge removed | None | `utils/scenarios/contracts.ts` |
| C-007–C-010 | Resolved | Persistence schema/parser and board type back-edges removed | Runtime graph is now one-way | `types/persistence.ts`, `utils/persistedBoardSchema.ts` |
| C-011–C-013 | Resolved | Field family contract back-edges removed | None | `widgets/contracts/fields.ts` |

Phase 3 removed every registered cycle. Madge now reports no circular dependencies.

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

1. **Phase 0 complete:** Git baseline, reviewed ignore rules, green automated checks, and the manual smoke checklist are in place.
2. **Phase 2 deletion:** K-001 and truly unused implementations first; remove only export modifiers for internally used values. Re-run Knip after every cluster.
3. **Before Phase 3:** add tests around board hydration, history reset, persistence initialization, and widget removal animation races.
4. **Phase 3 contracts:** extract persisted schema, registry contracts, field contracts, and neutral spatial primitives before moving store slices.
5. **Phase 4 visuals:** share line renderer primitives and CSS layers without merging relation/dependency/wire semantics.
6. **Phase 5 root heals:** T-020, T-014, T-003, then lifecycle hygiene entries.

Every implementation phase should end with build, lint, tests, the manual smoke checklist, and a commit.
