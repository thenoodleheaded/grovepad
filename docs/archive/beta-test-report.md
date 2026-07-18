# Grovepad Adversarial Beta Test Report

> Source of truth for the four-hour, browser-based beta audit requested on 2026-07-16. Product code is not modified by this audit. Findings are based on observed interactions unless explicitly labeled **reasoned analysis** or **hypothesis**.

## Test charter and acceptance criteria

- Every reachable global surface and every implemented widget receives at least one assessment.
- High-risk workflows receive deeper passes: creation, editing, movement, resize, focus mode, selection, duplication, deletion, undo/redo, connection, navigation, reload, import/export, failure handling, responsive behavior, keyboard accessibility, and stress.
- A finding is only recorded when it has reproducible browser evidence, a precise observation, or clearly labeled analysis.
- Evidence is stored under `docs/beta-test-evidence/` when a screenshot or exported artifact materially helps.

## Environment and baseline

- Audit started: 2026-07-16 19:35 (Asia/Tashkent)
- Audit ended: 2026-07-16 23:34 (Asia/Tashkent); four-hour budget completed
- Browser surface: Codex in-app browser
- App server under test: Vite development server at `http://127.0.0.1:5174/`; continued on an identical fresh-storage origin at `http://127.0.0.1:5175/` after `GP-014` made the first origin permanently unbootable.
- Source state: pre-existing uncommitted changes across widget UI and store files; preserved untouched and treated as the beta build under test.
- Product-code fixes: none authorized; none made.

## Coverage tracker

Legend: `[ ]` untested, `[~]` partial, `[x]` completed, `[B]` blocked.

### Global and lifecycle

- [x] First run / empty canvas / onboarding cues
- [~] Toolbar, account menu, workspace menu, overflow menu, canvas tree (workspace HTML drag reorder inconclusive)
- [~] Add-widget picker: search, categories, favorites, packs, keyboard flow (Tab traversal blocked by automation; pointer favorite defect verified)
- [x] Command palette and shortcut reference
- [x] Quick Add and manual tree shaper
- [x] Canvas context menu and widget context menu
- [~] Selection, multi-selection, marquee, move, resize, collapse, lock (marquee/touch cancellation only partial)
- [~] Duplicate, copy/paste, delete, undo/redo, rename, group/ungroup (system clipboard unavailable)
- [x] Pan, zoom, presets, fit, 100%, far-zoom proxy, directional recovery
- [~] Relations, dependencies, ports, wires, circuit mode (pointer wire delivery inconclusive; semantic and accessibility paths covered)
- [x] Focus mode entry, panel reorder/resize, exit, persistence
- [x] Nested canvases, breadcrumbs, cross-canvas search, canvas tree, cascade delete/restore
- [x] Theme switching, reload persistence, and both-theme visual review
- [~] Export package, export JSON, import confirmation, invalid import (toasts exercised; downloads/upload unavailable to inspect)
- [x] Reload, persistence, restoration, malformed input, safe network-failure behavior
- [~] Long/empty/Unicode/pasted text covered; viewport resize and browser zoom unavailable
- [~] Keyboard shortcuts, labels/semantics, Escape, source-level reduced-motion; Tab traversal and screen-reader audio unavailable
- [x] Rapid/repeated actions and realistic 202-widget stress

### Widget families

- [x] Base catalogue widgets
- [x] Expansion catalogue widgets
- [x] Atlas catalogue widgets
- [x] Automation-core widgets
- [x] Specialist pack widgets
- [~] Cross-widget combinations and compatible/incompatible connections (relations/dependencies covered; pointer wire delivery inconclusive)

## Pass log

### Pass 0 — documentation, intended behavior, and coverage setup

Status: completed.

Reviewed the compact codebase map and manual smoke gate. Identified the main product surfaces, canonical keyboard behaviors, persistence contract, focus-mode contract, circuit-mode contract, and catalogue ownership. The app advertises at least 50 Atlas widgets in addition to base, expansion, automation-core, and specialist families, so widget coverage will be systematic and breadth-first before targeted depth.

Next priorities: capture the clean first-run browser state; inventory the live accessible surface and console; test empty-state calls to action, toolbar/menu overlays, add picker, shortcuts, command palette, canvas navigation, and baseline keyboard focus behavior.

## 1. Executive summary

Grovepad is unusually ambitious and often delightful, but this beta is not safe enough for irreplaceable work. The audit found **36 active issues**: **2 Blockers, 26 High, 7 Medium, and 1 Low**. `GP-001` and `GP-032` are retracted automation/audit false positives.

The strongest part of the product is breadth: all **202** catalogue widgets could be found, created, rendered under load, and restored after reload. Core direct-manipulation ideas—nested canvases, semantic relations, Focus mode, typed widgets, local persistence—are real and compelling. The weakest part is trust. History can delete a new workspace or restore cards at the wrong coordinates; snapshot recovery can replace the entire board while clearing Undo without saying so; output-producing automation fragments one run across multiple Undo entries; deleting one small Canvas card silently removes its entire populated subtree; malformed automation configuration can still cross a network side-effect boundary; a supposedly sandboxed Script Block retains network and persistent-storage capabilities; Secret Reference persists its raw value; and multiple finished-looking state widgets do not enforce the semantics promised by their names.

The experience also excludes keyboard and assistive-technology users from central systems. Circuit ports are deliberately hidden from the accessibility tree, Focus mode leaves background controls exposed, Kanban actions exist only on hover, Inventory and Synthesizer ship unnamed primary controls, and essential 8–10px microcopy frequently sits near 1.9:1 contrast. This is not a final-coat problem. Accessibility and transaction safety need to be treated as product architecture.

## 2. Coverage completed and notable areas not testable

Completed coverage includes first-run/empty states; isolated scratch workspaces; nested canvases; all global menus and overlays; creation/edit/move/resize/scale/lock/collapse/group/detach/delete/duplicate; toolbar and keyboard Undo/Redo; Quick Add; tree shaping; relations and dependencies; Focus and Circuit surfaces; themes; reload and persistence; unusual numeric/text/Unicode data; safe automation failures; the full 202-widget Atlas creation/reload stress; and targeted interaction passes on 33 representative widgets.

Not fully testable in this environment:

- Native Tab/Shift+Tab focus traversal: the automation layer did not move focus even on ordinary controls, so `GP-001` was retracted.
- System clipboard copy/paste; file upload for malformed import; exported file contents after success toasts.
- Physical trackpad pinch/inertia, touch hardware, real coarse-pointer cancellation, workspace HTML drag/drop reordering, browser UI zoom, and responsive viewport resizing.
- A complete pointer wire delivery—the tiny port drag was inconclusive. Circuit semantics and accessibility were still inspected.
- Runtime reduced-motion emulation and screen-reader speech output. CSS/source handling and the accessibility tree were inspected.
- Signed-in cloud sync, multi-device conflict, email/calendar integrations, and real offline recovery. Guest/local failure paths were covered.

## 3. Findings ordered by severity

`GP-001` and `GP-032` are excluded below because they are retracted. Full reproduction details and evidence live in the chronological pass log.

### Blocker

- `GP-014` — Guest backup nudge covers tree-shaper Cancel and can leave the app permanently stuck on `Preparing your canvas`.
- `GP-005` — Redo can erase a newly created workspace and jump to an older whole-board snapshot.

### High

- `GP-006` — Notes scale-state round trips inflate height and clip content.
- `GP-007` — Dormant scale states expose the wrong accessibility surface.
- `GP-008` — Frame Selection leaves the selected card partly off-screen.
- `GP-009` — Undo/Redo corrupts vertical geometry after move/resize/group operations.
- `GP-010` — Grouping can move a visible group mostly above the viewport.
- `GP-012` — Frame Board becomes selection-dependent and zooms away from most content.
- `GP-013` — Quick Add replaces an explicit launch plan with an unrelated music project.
- `GP-015` — Empty-state onboarding blocks the tree shaper offered on that empty canvas.
- `GP-016` — Circuit ports are unavailable to keyboard and assistive technology.
- `GP-017` — Focus mode leaves background widgets accessible and offers pointer-only reorder controls.
- `GP-022` — AI Generator expands one requested checklist into six unrelated cards.
- `GP-023` — AI Generator's toast Undo leaves all generated cards behind.
- `GP-024` — Sketchpad is publicly addable but has no drawing engine.
- `GP-025` — Kanban move/delete controls do not exist until pointer hover.
- `GP-026` — Inventory and Synthesizer primary controls have no accessible names.
- `GP-027` — Malformed HTTP configuration is ignored and a fallback request executes.
- `GP-028` — “Sandboxed” Script Block retains network and IndexedDB/WebSocket capabilities.
- `GP-029` — Commission Queue Slot cap displays and edits different properties.
- `GP-030` — Essential microcopy is commonly 8–10px at about 1.9:1 contrast.
- `GP-031` — Deleting one Canvas card silently deletes its populated nested subtree.
- `GP-033` — A hanging HTTP request persists a permanently disabled Running state across reload.
- `GP-035` — Stack, Set Store, State Machine, and Idempotency Store do not implement their advertised semantics.
- `GP-036` — Secret Reference displays and persists the raw secret it claims not to expose.
- `GP-037` — Widget Creator splits one batch across Undo and can restore a permanently Running card.
- `GP-038` — Snapshot restore replaces the whole board and clears history without warning or rollback.
- `GP-002` — Pointer access to favorite and related hover-only widget chrome is broken; keyboard reachability was not testable.

### Medium

- `GP-003` — Command Palette presents unavailable Undo/Redo as actionable.
- `GP-004` — Widget context menu lacks menu semantics and focus management.
- `GP-018` — Dependency routes/chips cross unrelated cards and imply the wrong target.
- `GP-019` — Quick Add says the local model is available while its log says it was skipped.
- `GP-020` — Table averages count blank cells as zero.
- `GP-021` — Budget silently clamps or zeroes invalid/out-of-range amounts.
- `GP-034` — Circuit mode does not expose its on/off state to assistive technology.

### Low

- `GP-011` — Counter accepts unreadable, precision-risking step values.

## 4. Widget-by-widget findings

The catalogue breadth matrix later in this report lists all 202 names and their creation/reload result. Widget-specific defects found during deeper interaction:

| Widget / surface | Result |
| --- | --- |
| Canvas | Nested navigation/persistence passed; silent descendant deletion is `GP-031`. |
| Notes | Unicode/editing passed; scale round-trip inflation is `GP-006`. |
| Counter | Basic tally passed; extreme step handling is `GP-011`. |
| Number Input / Checklist | Editing and persistence passed; shared Circuit accessibility is `GP-016`. |
| Table | Row/column, Unicode, Enter navigation, and structural Undo passed; blank-average math is `GP-020`. |
| Budget | Add/edit/total passed; silent clamp/overflow normalization is `GP-021`. |
| AI Generator | Generation/reload/batch history exercised; intent expansion `GP-022`, broken toast Undo `GP-023`. |
| Kanban | Add/edit passed; keyboard/screen-reader move/delete failure is `GP-025`. |
| Timer / Stopwatch | Start, pause, lap, reset, bounds, accessibility names, and persistence passed. |
| Calculator | Typed/tapped parser, parentheses/decimals, clear, and divide-by-zero error passed. |
| Media | Broken URL, recovery, alt text, caption, Unicode, and persistence passed. |
| Calendar | Month navigation, pressed date, and reload persistence passed. |
| Goal Tracker | Goal/milestone editing, Enter-add, completion, progress, and reload passed. |
| Sketchpad | Non-functional placeholder: `GP-024`. |
| Inventory | State and summaries render; unnamed quantity controls are part of `GP-026`. |
| Synthesizer & Audio Player | Fields render; unnamed primary play/pause is part of `GP-026`. |
| Game Mechanics Tuner | Named sliders and live values rendered; no verified defect. |
| Line Chart | Pointer sampling, chart semantics, and latest/average/max updates passed. |
| Quiz | Edit, correct-answer selection, wrong/correct verdict, retry passed. |
| Risk Register | Add, resolve structure, rapid coalesced history, Undo/Redo passed. |
| Recipe | Servings/ingredient structure and numeric bounds rendered; no verified defect. |
| Commission Queue | Workflow commands and capacity field conflict: `GP-029`. |
| HTTP Request | Safe failure surfaced, but invalid config still executes (`GP-027`) and a hung request deadlocks permanently across reload (`GP-033`). |
| Script Block | Execution works; trust-boundary mismatch is `GP-028`. |
| Variable Store / Queue / Workflow Lock / Recorder / Comparator | Direct execution and reload passed for the sampled state/lock/record/compare paths. |
| Stack / Set Store / State Machine | Advertised LIFO, uniqueness, and transition enforcement fail in `GP-035`. |
| Idempotency Store / Secret Reference | Duplicate processing joins `GP-035`; raw credential exposure is `GP-036`. |
| Widget Creator | Two-line creation passed, but transactional Undo/recovery fails in `GP-037`. |
| Account / local snapshot restore | Confirmation and recovery contract fail in `GP-038`; destructive execution was intentionally source-verified rather than run on the clean board. |
| Remaining 169 catalogue entries | Picker discovery, creation, live render/culling, 202-widget stress, and full reload persistence passed; this is breadth rather than deep control-state certification. |

## 5. Cross-cutting design/system issues

- **History is not a dependable transaction boundary.** Workspace creation (`GP-005`), geometry (`GP-009`), generator output/status (`GP-023`), and Widget Creator batches (`GP-037`) fragment or restore the wrong state.
- **Overlays do not share priority/hit-testing ownership.** The guest nudge defeats active tree shaping (`GP-014`), and the empty-state panel defeats the empty-canvas shaper (`GP-015`).
- **Camera framing has multiple conflicting meanings.** Selection framing, board framing, off-screen recovery, and large-board fitting produce partial/offscreen views (`GP-008`, `GP-012`).
- **Hover is repeatedly used as existence, not decoration.** Favorites, lock chrome, row removal, Kanban movement, and other actions disappear from pointer hit-testing or the accessibility tree (`GP-002`, `GP-025`).
- **Generic catalogue abstractions leak incorrect semantics.** Atlas getter/setter inference (`GP-029`) and generic unlabeled controls (`GP-026`) show that breadth is outpacing per-widget contract tests.
- **Finished-looking automation cards can be semantic shells.** One shared executor gives Queue, Stack, Set Store, State Machine, and many other catalogue types nearly identical behavior despite incompatible promises (`GP-035`).
- **Security-labelled tools are presentation, not boundaries.** Script Block's “sandbox” retains ambient capabilities (`GP-028`), while Secret Reference is a generic clear-text passthrough (`GP-036`).
- **AI truth and intent are unreliable.** Status copy misstates the active engine (`GP-019`), direct prompts are replaced (`GP-013`), and singular generation over-expands (`GP-022`).
- **Destructive scope is hidden.** Canvas cascade deletion (`GP-031`), snapshot replacement with cleared history (`GP-038`), and non-atomic AI Undo (`GP-023`) make small-looking actions have large, unclear consequences.

## 6. Accessibility findings

- `GP-016`: Circuit mode is structurally pointer-only.
- `GP-017`: Focus mode is visually modal but not semantically inert; reorder is pointer-only.
- `GP-025`: Kanban cannot be reorganized or cleaned up without hover/pointer.
- `GP-026`: Inventory and Synthesizer expose unnamed state-changing controls.
- `GP-030`: Essential text contrast/size is systematically inadequate.
- `GP-004`: Context-menu semantics and focus entry/return are missing.
- `GP-007`: Scale-state visibility and accessibility state diverge.
- `GP-002`: Shared favorite chrome remains pointer-unreachable; keyboard reachability could not be certified in this environment.
- `GP-034`: Circuit mode visually toggles the entire board without exposing any pressed/on/off state.

Keyboard focus-order certification remains blocked by the automation limitation described above; this does **not** downgrade the independently verified structural failures.

## 7. “Death by a thousand cuts” polish issues

These are verified observations or explicitly subjective recommendations, not promoted to separate defects unless referenced by ID:

- Budget renders negative currency as `$-10.00` instead of conventional `-$10.00`.
- Table shows `Σ 0 · avg 0.0` for a blank selected column, implying data that does not exist (`GP-020` contains the substantive math defect).
- Exact command-palette searches for a widget type prioritize `New Sketchpad` over the existing `Sketchpad`, increasing accidental duplicates.
- Shortcut-reference rows are implemented as a mixture of enabled and disabled buttons without explaining that some rows execute immediately and close the dialog.
- Specialist commands are exposed as tiny lowercase mechanical labels such as `advance stage` and `deliver`, with almost no explanation of the state transition.
- Repeated 8–10px uppercase labels and near-black secondary copy make active controls look disabled (`GP-030`).
- Light theme changes the canvas/chrome but keeps dark cards, creating a high-contrast visual split rather than a fully light working surface. This is a subjective cohesion concern, not a verified functional defect.
- The workspace menu's rename/delete affordances, table removals, Budget removals, Goal removals, and Color Palette removals repeat the hover-only-action pattern even where the specific action was not separately filed.
- `Frame`, directional off-screen recovery, and search navigation can leave zoom at surprising values such as 145%, creating visual whiplash even when the destination is found.
- The singular `Deleted widget` toast understates nested-canvas deletion (`GP-031`).

## 8. Top 10 highest-impact fixes

1. Fix `GP-014`: active gestures must outrank passive nudges, and boot recovery must never strand a local board.
2. Fix `GP-005`: make workspace creation and history snapshots transactionally safe.
3. Fix `GP-009`: preserve exact widget geometry and camera state through Undo/Redo across move, resize, and grouping.
4. Fix `GP-023` and `GP-037`: make every output-producing run and its status one atomic, transaction-addressed Undo.
5. Fix `GP-031` and `GP-038`: disclose destructive scope and guarantee a named rollback point before subtree or whole-board replacement.
6. Fix `GP-028` and `GP-036`: define real capability/credential boundaries before shared or imported automations are trusted.
7. Fix `GP-027` and `GP-033`: validate, time out, cancel, and recover every network automation; never persist stale Running state.
8. Fix `GP-016` and `GP-017`: design keyboard/screen-reader equivalents for Circuit and Focus, not patches around pointer workflows.
9. Fix `GP-029` and `GP-035`: add semantic contract tests for every Atlas field and automation type; hide generic shells until their promises are real.
10. Fix `GP-012` and `GP-008`: unify framing semantics and guarantee visible padded bounds.

## 9. Follow-up test ideas

- Re-run the entire manual smoke checklist with a physical mouse, trackpad, touch screen, and keyboard after fixes.
- Use VoiceOver and NVDA for Circuit creation/deletion, Focus mode isolation, Kanban movement, widget scale states, and context menus.
- Add deterministic property tests for every Atlas field: set/get round trip, command orthogonality, numeric bounds, and persistence.
- Add black-box automation contracts for FIFO/LIFO, uniqueness, legal state transitions, idempotency, transactions, locks, reload, and wire-triggered execution.
- Fuzz history with randomized create/move/resize/group/canvas/workspace/generate transactions, then assert exact board equality after Undo/Redo cycles.
- Test imported boards containing Script Blocks and trigger wires under a formal permission model; verify no code runs before explicit review.
- Test signed-in cloud sync under disconnect/reconnect, stale-tab conflict, quota failure, duplicate device, and account switching.
- Exercise real file import/export round trips: valid package, malformed JSON, oversized media, future schema, duplicate IDs, cyclic canvases, and partial corruption.
- On a disposable profile, verify snapshot restore creates a recoverable pre-restore checkpoint and preserves exact board equality through rollback.
- Stress 1,000+ widgets across nested canvases with long text, images, live timers, circuit rails, Focus mode, and repeated framing.
- Run responsive layouts at phone, tablet, laptop, ultrawide, 200% browser zoom, and OS text scaling.
- Measure input latency, frame time, memory, IndexedDB growth, and reload time during a multi-hour session with history and automation activity.
- Capture a production cold-load network waterfall and coverage trace to determine whether the ~6 MB WebLLM worker and ~6 MB library chunk are deferred correctly or inflate startup/memory.

## Chronological pass log and full finding records

---

## Pass 1 checkpoint — empty state, picker, selection history, overlays

Completed or partially covered in this checkpoint:

- [x] Isolated workspace creation and empty-canvas state
- [x] Empty-state Add widget entry point
- [x] Widget-library zero results, Unicode search, clear search, pack activation, and catalogue count
- [x] Base creation, rename, long/Unicode content, duplicate, delete, undo, and redo using a Notes widget
- [x] Widget context menu open/close and Escape behavior
- [x] Shortcut overlay open by pointer and `?`, Escape close, and focus-order probe
- [x] Command palette open by `Ctrl+K`, no-match fallback, unavailable-action behavior, Escape close, and focus-order probe
- [~] Toolbar, selection bar, favorites, keyboard-only behavior, and all 202 catalogue entries

Observed catalogue breadth after enabling every pack: **202 widgets**. No console warnings or errors were recorded during this checkpoint.

### GP-001 — Modal focus traps pin Tab to the initial control

- **Severity:** High
- **Category:** accessibility / UX
- **Where:** Add Widget dialog, Keyboard Shortcuts dialog, Command Palette dialog
- **Steps to reproduce:**
  1. Open any of the three dialogs.
  2. Confirm initial focus lands on Search (picker/palette) or Close (shortcuts).
  3. Press Tab repeatedly.
- **Expected:** Focus advances through the dialog’s visible controls and wraps only after reaching the last control.
- **Actual:** Focus never leaves the initial control. In the Add Widget dialog it remains on Search; in Command Palette it remains on Search; in Keyboard Shortcuts it remains on Close.
- **Why it harms flow:** Keyboard users cannot reach picker favorites, pack/close buttons, palette filters, shortcut actions, or any other dialog controls through normal focus navigation. This turns three core overlays into partial keyboard traps.
- **Evidence:** Reproduced with direct active-element inspection after two consecutive Tab presses in each overlay. Visual context: [`03-shortcuts-dialog.png`](beta-test-evidence/03-shortcuts-dialog.png).
- **Hypothesis:** The shared focus-trap hook is calculating only the initial element as tabbable or intercepting Tab before native focus movement.
- **Suggested direction:** Repair the shared tabbable-element discovery and add deterministic Tab/Shift+Tab tests for every dialog using the hook.
- **Reproduction:** 3/3 affected overlays, repeated twice per overlay.

### GP-002 — Widget favorites are unreachable by pointer

- **Severity:** High
- **Category:** bug / UX
- **Where:** Widget Library tiles
- **Steps to reproduce:**
  1. Open Widget Library and isolate a tile (tested with Notes).
  2. Move the pointer over the tile.
  3. Try to click the star.
- **Expected:** Hover reveals a clickable star with a stable hit target.
- **Actual:** The star remains `opacity: 0` and `pointer-events: none` before and after tile hover. A click at the hidden star’s location lands on the underlying Add tile and creates the widget instead. Keyboard reachability is deliberately not claimed because native Tab traversal was not testable in this automation surface.
- **Why it harms flow:** The product advertises favorites as persistent picker organization, but real users have no reachable way to set one. Attempting the apparent star location creates unwanted content.
- **Evidence:** Computed style before hover: `opacity: 0; pointer-events: none`; after hover: unchanged. Notes tile creation occurred when the hidden star location was clicked.
- **Hypothesis:** The named `group-hover` class is applied to a sibling button, while the favorite button expects to be a descendant of that group; the selector can never match.
- **Suggested direction:** Put hover ownership on a common ancestor, keep the favorite control pointer-reachable, and separately verify mouse, keyboard, touch-like, and screen-reader activation.
- **Reproduction:** 2/2 pointer attempts on Notes; keyboard path not testable here.

### GP-003 — Command Palette offers unavailable Undo/Redo actions as if they will work

- **Severity:** Medium
- **Category:** UX / consistency / resilience
- **Where:** Command Palette action list
- **Steps to reproduce:**
  1. Reach a state where Redo is unavailable; the toolbar correctly disables Redo.
  2. Open Command Palette.
  3. Select Redo.
- **Expected:** Redo is disabled/omitted, or selection explains that nothing can be redone.
- **Actual:** Redo appears as a normal selectable option. Selecting it closes the palette, performs no change, and gives no feedback.
- **Why it harms flow:** The palette contradicts the toolbar and consumes an action while silently doing nothing, forcing the user to question whether history or their input failed.
- **Evidence:** Toolbar `Redo (⇧⌘Z)` remained disabled immediately before and after the enabled palette Redo option was selected; widget count and state were unchanged.
- **Hypothesis:** Palette actions are static and do not subscribe to history availability.
- **Suggested direction:** Make command availability state-aware and keep disabled commands visibly explained if they must remain searchable.
- **Reproduction:** 1/1.

### GP-004 — Widget context menu does not expose menu semantics or move focus

- **Severity:** Medium
- **Category:** accessibility
- **Where:** Right-click menu on a widget
- **Steps to reproduce:**
  1. Right-click a selected widget.
  2. Inspect the accessibility tree and active element.
- **Expected:** A labeled `menu` receives focus, its actions are `menuitem` controls, arrow-key movement is available, and Escape restores focus.
- **Actual:** The overlay is exposed as an unlabelled collection of ordinary buttons with no menu role. Focus remains on an unlabelled canvas `div`. Escape does close it, but there is no coherent keyboard entry point.
- **Why it harms flow:** Screen-reader and keyboard users are not told that a context menu opened and cannot predictably navigate its actions.
- **Evidence:** Browser accessibility snapshot contained the menu’s paragraph/buttons but no `menu`/`menuitem`; active element was `DIV` with no role or accessible name.
- **Hypothesis:** The context-menu container and actions lack ARIA menu roles and a roving-focus implementation.
- **Suggested direction:** Implement a labeled menu pattern, focus its first action on open, support arrows/Home/End, and restore focus to the invoking widget on close.
- **Reproduction:** 1/1; Escape close separately passed.

### Pass 1 handoff

Current environment: `Beta Audit` workspace, Origin canvas, one selected Notes widget named `Audit note 🧪 Ω` containing long multiline Unicode content; all 10 domain packs are enabled. The picker is closed, zoom is 100%, and the console is clean. Next: finish global toolbar/account/workspace/canvas-tree, zoom/selection/move/resize/collapse/lock, Quick Add/tree shaper, nested canvas, relation/dependency/wire/focus workflows, then create the systematic widget-family canvases for breadth coverage.

## Follow-up test ideas

To be finalized after coverage passes.

---

## Pass 1 correction note

`GP-001` is **retracted as a product finding**. The in-app browser automation surface used for this audit does not move focus on `Tab` even in the account menu, whose source and live semantics use an ordinary menu pattern rather than the shared modal focus trap. Because the same failure occurs outside the allegedly affected implementation, this is an automation limitation, not valid evidence against Grovepad. Keyboard focus traversal remains **not testable in this environment**; Escape and direct shortcut behavior remain testable.

`GP-002` remains verified for the pointer path only. Its keyboard claim is removed because of the same automation limitation. Revised reproduction: 2/2 pointer hover/click attempts; keyboard reachability not testable here.

## Pass 2 checkpoint — scaling, geometry, camera history, grouping, and workspace history

Completed or partially covered in this checkpoint:

- [x] Theme switching and both-theme surface review
- [x] Notes full/pill/icon transitions and repeated round trips
- [x] Counter content controls, long numeric input, title drag, resize, lock, duplicate, delete, and multi-selection
- [x] Zoom buttons, presets, minimum zoom, far-zoom proxy, off-screen indicator, Frame, and view-history controls
- [x] Two-widget grouping and undo
- [x] Workspace creation/switching while board history contains a redo branch
- [~] Package/JSON export: success feedback observed; downloaded artifacts could not be captured by the in-app browser environment

### GP-005 — Redo can erase a newly created workspace

- **Severity:** Blocker
- **Category:** bug / resilience / data loss
- **Where:** Global Undo/Redo history combined with workspace creation
- **Steps to reproduce:**
  1. Create two widgets, group them, then Undo the grouping so Redo is available.
  2. Open the workspace menu and create a new workspace named `Debug Atlas`.
  3. Observe that Redo remains enabled in the new, empty workspace.
  4. Click Redo.
  5. Open the workspace menu again.
- **Expected:** Creating a workspace starts a new history branch or history is scoped safely; Redo is unavailable and the new workspace remains intact.
- **Actual:** Redo rehydrates an older whole-board snapshot, jumps the user to `My Workspace`, and removes `Debug Atlas` from the workspace list. Any content created in that workspace would be at risk of silent loss.
- **Why it harms flow:** This violates the most basic trust contract of a workspace product. A familiar history action can destroy a newly created organizational container without warning or recovery affordance.
- **Evidence:** [`10-redo-deletes-new-workspace.png`](beta-test-evidence/10-redo-deletes-new-workspace.png) shows the post-Redo workspace list containing only `My Workspace` and `Beta Audit`; `Debug Atlas` had been created and loaded immediately before the action.
- **Hypothesis:** Board history snapshots include the entire workspace tree, while workspace creation/switching neither scopes nor invalidates the existing redo stack.
- **Suggested direction:** Separate board-content history from workspace lifecycle state, invalidate redo on divergent workspace mutations, and add a regression test that creates a workspace from an undone state.
- **Reproduction:** 1/1. Not repeated because repetition risks destroying real workspace content.

### GP-006 — Notes scale-state round trips inflate the card and clip its text

- **Severity:** High
- **Category:** bug / UX / UI
- **Where:** Notes widget, full → pill → icon → full and repeated pill/full transitions
- **Steps to reproduce:**
  1. Create Notes and enter several lines of long Unicode text.
  2. Collapse to pill, shrink to icon, then expand back to full.
  3. Repeat the full/pill round trip.
- **Expected:** The widget returns to its previous usable full size, the textarea fits its content, and each transition moves through the neighboring scale state without decorative size growth.
- **Actual:** Full height grew from about 237 px to 440 px, then 644 px, then 777 px. The textarea stayed about 48 px tall despite a 113 px scroll height, leaving a huge empty glass surface while text remained clipped/scrolling. Expanding from icon also jumped directly to the oversized full state.
- **Why it harms flow:** Collapsing a note—a routine organization action—permanently damages its layout and consumes most of the canvas. The control feels unsafe because each use makes the result worse.
- **Evidence:** [`06-notes-expand-size-inflation.png`](beta-test-evidence/06-notes-expand-size-inflation.png); measured article heights across the same widget: ~237 → 440 → 644 → 777 px.
- **Hypothesis:** Autosizing the textarea and restoring a dormant widget size form a layout feedback loop, with the flex child then shrinking below its assigned content height.
- **Suggested direction:** Preserve one stable full-state size, make state reversal adjacent and symmetric, and resolve textarea auto-height without feeding content measurement back into outer-card inflation.
- **Reproduction:** 3/3 expansion cycles, monotonically worse until near the size ceiling.

### GP-007 — Visually collapsed widgets expose hidden full-state controls to assistive technology

- **Severity:** High
- **Category:** accessibility / consistency
- **Where:** Notes in pill and icon states; likely shared scale-state shell
- **Steps to reproduce:**
  1. Collapse a populated Notes widget to pill or icon.
  2. Inspect the accessibility tree.
- **Expected:** Only controls and content visible in the current compact state are exposed; dormant full-state UI is inert and hidden from assistive technology.
- **Actual:** The accessibility tree still exposes Favorite, Lock, the full Notes textarea and all its text, word count, and Connect controls while the screen shows only the compact pill/icon.
- **Why it harms flow:** Screen-reader users navigate and activate controls that sighted users cannot see, creating a misleading parallel interface and unpredictable focus jumps.
- **Evidence:** [`05-collapsed-pill-hidden-controls.png`](beta-test-evidence/05-collapsed-pill-hidden-controls.png) shows the pill-only visual state; the simultaneous accessibility snapshot contained the full hidden control set.
- **Hypothesis:** Compact states visually hide the full renderer through opacity/transform without applying `inert`, `aria-hidden`, or conditional mounting.
- **Suggested direction:** Make dormant renderers genuinely inert/hidden and add an accessibility regression test for every scale state.
- **Reproduction:** 2/2 compact states on Notes.

### GP-008 — Frame Selection places the selected widget partly off-screen

- **Severity:** High
- **Category:** bug / UX
- **Where:** Selection action bar → Frame; camera history around the same action
- **Steps to reproduce:**
  1. Select a Counter widget.
  2. Click `Frame` in the selection action bar.
- **Expected:** The whole target is centered with comfortable viewport padding.
- **Actual:** Zoom changed to roughly 145%, but the widget was positioned at approximately y = -77 px, leaving most of it above the visible canvas. The action bar remained centered while the framed content was not.
- **Why it harms flow:** A command whose sole promise is to reveal and frame content instead hides it, forcing recovery through the off-screen indicator or manual panning.
- **Evidence:** [`08-frame-selection-offscreen.png`](beta-test-evidence/08-frame-selection-offscreen.png).
- **Hypothesis:** Camera centering applies an incorrect vertical viewport or toolbar offset, or a later settle/history update overwrites the computed camera.
- **Suggested direction:** Derive framing from the actual canvas viewport rectangle and assert that the final widget bounds are wholly inside a padded visible region.
- **Reproduction:** 1/1 controlled Frame action; related camera-history vertical drift observed repeatedly.

### GP-009 — Undo/Redo corrupts the vertical position of moved, resized, and grouped widgets

- **Severity:** High
- **Category:** bug / resilience
- **Where:** Widget drag, resize, grouping, Undo/Redo
- **Steps to reproduce:**
  1. Move a visible Counter by its title capsule and note its screen position.
  2. Undo, then Redo.
  3. Repeat with a resize or a two-widget grouping action.
- **Expected:** Undo restores the exact pre-action geometry and Redo restores the exact post-action geometry.
- **Actual:** Horizontal position/size often returned approximately, but vertical position jumped hundreds of pixels. One move at y ≈ 482 px undid to y ≈ 38 px and redid to y ≈ 164 px rather than y ≈ 609 px. Resize Undo restored size but moved the widget to y ≈ -78 px. Group Undo likewise scattered widgets vertically. A later isolated Notes test reproduced the same failure on an otherwise clean two-widget board: a roughly `+150,+80` drag undid by shifting the visible board about 590 px upward, and Redo restored only about 81 px of that displacement rather than the dragged state.
- **Why it harms flow:** History cannot be trusted for spatial work. Attempting to recover one edit loses where the content was, often pushing it out of view.
- **Evidence:** Precise before/after observations; the resulting states are visible in [`08-frame-selection-offscreen.png`](beta-test-evidence/08-frame-selection-offscreen.png), [`09-grouped-counters.png`](beta-test-evidence/09-grouped-counters.png), and the isolated precise-drag sequence [`54-exact-move-after.png`](beta-test-evidence/54-exact-move-after.png) → [`55-precise-title-drag.png`](beta-test-evidence/55-precise-title-drag.png) → [`56-precise-drag-undo.png`](beta-test-evidence/56-precise-drag-undo.png). In the last sequence, the comparison Notes stayed fixed during the drag, then both cards jumped upward after Undo.
- **Hypothesis:** Geometry history mixes world coordinates with a changing camera/viewport coordinate or reapplies a vertical offset during hydration.
- **Suggested direction:** Store geometry exclusively in world coordinates, verify camera independence, and regression-test exact x/y/width/height round trips for each spatial history action.
- **Reproduction:** 5/5 history paths across two isolated moves, resize, and group/ungroup-related state.

### GP-010 — Grouping visible widgets relocates the new group mostly above the viewport

- **Severity:** High
- **Category:** bug / UX
- **Where:** Multi-selection action bar → Group
- **Steps to reproduce:**
  1. Place two Counter widgets visibly on the canvas.
  2. Shift-click to select both.
  3. Click Group.
- **Expected:** The group preserves the children’s visible world positions and draws its plate around them.
- **Actual:** Both widgets and the group plate moved to around y = -139 px, leaving only their lower edges visible at the top of the canvas.
- **Why it harms flow:** Organizing related content makes it disappear, immediately imposing a find-and-recover task and making grouping feel destructive.
- **Evidence:** [`09-grouped-counters.png`](beta-test-evidence/09-grouped-counters.png).
- **Hypothesis:** Group bounds are converted or normalized against the wrong vertical origin when the group is created.
- **Suggested direction:** Preserve child world coordinates during grouping and test that the union of visible child bounds remains unchanged.
- **Reproduction:** 1/1.

### GP-011 — Counter accepts unreadable, precision-risking step values

- **Severity:** Low
- **Category:** resilience / UI
- **Where:** Counter widget Step field
- **Steps to reproduce:**
  1. Enter `999999999999999` as the step.
  2. Increment repeatedly.
- **Expected:** The control constrains values to a meaningful safe range or expands/abbreviates so the chosen value remains reviewable.
- **Actual:** The value is accepted; the count reaches `1000000000000002`, while the narrow Step field visibly shows only the first digit behind browser spinner controls.
- **Why it harms flow:** Users can accidentally create numbers beyond comfortable JavaScript integer precision and cannot visually confirm the step they configured.
- **Evidence:** [`07-counter-huge-number.png`](beta-test-evidence/07-counter-huge-number.png).
- **Hypothesis:** The numeric input has only a lower bound and fixed width, with no safe-integer or display constraint.
- **Suggested direction:** Apply a product-meaningful maximum, validate safe integers, and make long configured values inspectable.
- **Reproduction:** 1/1.

### Pass 2 handoff

Current environment: `Debug Atlas` was deliberately created for systematic catalogue coverage, then destroyed by `GP-005`; the app is now on `My Workspace` and the workspace menu is open. `Beta Audit` remains with two Counter widgets. Next: recreate `Debug Atlas` only after the redo stack is safe, then cover the 202-widget catalogue breadth-first in renderer-family batches; separately finish Quick Add/tree shaper, focus, nested canvases, relation/dependency/wire/circuit, persistence/reload, responsive, reduced-motion, and stress passes.

---

## Pass 3 checkpoint — complete catalogue instantiation and 202-widget stress

`Debug Atlas` was recreated only after both history controls were disabled. Every one of the **202 live catalogue entries** was then created through the real Widget Library, in catalogue order, with a fresh live locator before every placement. The workspace menu independently reported `Debug Atlas 202`. No creation attempt failed, the app did not crash, and no explicit renderer error fallback appeared during instantiation.

This is breadth coverage, not a claim that all 202 widgets have received deep behavioral coverage. Each entry has passed picker discovery, creation, persistence, and shared-canvas rendering/culling; representative renderers and high-risk controls still require individual interaction passes.

Stress-state observations:

- At 100 widgets and 100% zoom, 22 full/proxy articles were exposed in the rendered accessibility surface; directional recovery reported 1 left, 3 right, 31 up, and 52 down.
- At 202 widgets and 100% zoom, directional recovery reported 3 left, 38 right, 59 up, and 105 down.
- The app remained interactive at 202 widgets. At a settled 10% zoom, 136 article/proxy nodes were rendered and 48 widgets were reported above plus 50 below.
- A full browser reload restored `Debug Atlas`, the exact 202-widget count, and the 10% camera state. This persistence/stress path passed.

### Catalogue breadth matrix

Status for every name below: **created through picker; survived 202-widget reload; no immediate error fallback observed**.

- **Structure (3):** Bool Gate; Canvas; Divider.
- **Notes & Content (9):** Bullets; Code Snippet; Flashcards; Logbook; Meeting Notes; Notes; Outline; Quote; Sticky Note.
- **Tasks & Planning (18):** Calendar; Checklist; Content Pipeline; Countdown; Daily Agenda; Date & Time; Decision Matrix; Decision Picker; Kanban; Poll; Priority Matrix; Process / SOP; Progress; Pros & Cons; Risk Register; SWOT Analysis; Timeline; Week Planner.
- **Study & Learning (15):** Assignments; Citations; Cornell Notes; Experiments; Formula Sheet; GPA Tracker; Grade Calculator; Memorization; Mistake Bank; Past Papers; Pomodoro Timer; Quiz; Skill Tree; Study Goal; Vocabulary.
- **Data & Views (24):** Bar Chart; Budget; Calculator; Donut Chart; Form; Formula; Idempotency Store; Key Value Store; Line Chart; Metrics; Mutex; Number Input; Queue; Rating; Session Store; Set Store; Stack; State Machine; Table; Text Input; Toggle; Unit Converter; Variable Store; World Clock.
- **Media & Creative (5):** AI Generator; Color Palette; Dialog; Media; Sketchpad.
- **Tracking (26):** Automation Console; Automation Recorder; Contact Card; Counter; Crit Room; Estimate; Failure Inbox; Goal Tracker; Habit Tracker; Handover; Inventory; Link List; Meeting Meter; Mood Tracker; On Call; Overlap Finder; Reading List; Run Ledger; Scope Meter; Status; Stopwatch; Test Data Generator; Timer; Timesheet; Waiting On; Workflow Test Suite.
- **Automation & Logic (44):** Aggregator; Approval Gate; Archive Action; Auto Grouper; Auto Layout Action; Batch Processor; Branch Builder; Canvas Lifecycle; Canvas Router; Clone Branch; Comparator; Data Join; Environment Config; Event Correlator; Event Merger; Focus Action; HTTP Request; Local Function; Loop; Manual Trigger; Multi Source Aggregator; Notifier; Object Builder; Parallel Runner; Race; Random Picker; Range Mapper; Recorder; Relation Builder; Schedule Pulse; Script Block; Secret Reference; Sequencer; Snapshot Latch; Subroutine; Template Instantiator; Text Composer; Transaction; Webhook Receiver; Webhook Sender; Widget Creator; Widget Deleter; Widget Updater; Workflow Lock.
- **Life Systems (55):** Applause Meter; Bin Night; Borrow Ledger; Care Plan; Cash Pockets; Chore Rotation; Cycle; Debt Payoff; Decision Journal; Expense Split; Fasting; Fuel Log; Gift Ledger; Gifts & Occasions; Go Bag; Gratitude Jar; Guest List; Home Maintenance; Hydration; Income Streams; Invoices; Jet Lag Plan; Job Applications; Keep in Touch; Meal Planner; Medications; Moving Boxes; OKRs; Packing; Pet Card; Plant Shelf; Potluck Board; Power Schedule; Prayer Times; Prayer Wall; Price Book; Recipe; Remittance; Renewals Vault; Savings Circle; Scripture Plan; Sleep Ledger; Snippet Library; Star Chart; Stretch Deck; Subscriptions; Sun Window; Trip Itinerary; Utility Runway; Visa Runway; Vitals; Weekly Review; Wishlist; Workout Plan; Zakat & Giving.
- **Specialist (3):** Commission Queue; Game Mechanics Tuner; Synthesizer & Audio Player.

### GP-012 — Frame Board becomes selection-dependent and can zoom away from almost all content

- **Severity:** High
- **Category:** bug / UX / consistency
- **Where:** Bottom-right `Frame board (F)` control on a large canvas
- **Steps to reproduce:**
  1. Create a large board and leave one widget selected.
  2. Click the explicitly labeled `Frame board (F)` control.
  3. Clear selection and invoke the same control again for comparison.
- **Expected:** The control frames all widgets on the active canvas regardless of selection; the separate selection action bar owns `Frame` for selected content.
- **Actual:** With a selection present, one invocation settled near 14% while still reporting 5 left, 48 up, and 65 down. A later invocation zoomed to **145%** and reported **200 widgets off-screen left**, 69 up, and 95 down. Immediately after clearing selection, the same control settled at the 10% minimum with a roughly centered 48-up/50-down distribution.
- **Why it harms flow:** The emergency recovery control becomes least reliable when the board is hardest to navigate. It can transform a broad map into a near-empty close-up and strand almost the entire board to one side.
- **Evidence:** [`15-frame-board-202-widgets.png`](beta-test-evidence/15-frame-board-202-widgets.png) shows the first incomplete fit; [`16-frame-board-zooms-away.png`](beta-test-evidence/16-frame-board-zooms-away.png) shows the 145% result with the `200` left indicator. Source inspection confirms this toolbar handler is intended to bound every widget on the active canvas, not the selection.
- **Hypothesis:** Selection/pinned-render state or a competing camera animation overwrites the full-board fit target. The exact mechanism is unverified.
- **Suggested direction:** Make board fitting atomic and independent of selection/render LOD; add a regression test asserting the final active-canvas bounds and maximum feasible zoom with and without selection.
- **Reproduction:** 2/2 selected-state failures; 1/1 no-selection comparison materially passed (subject to the 10% minimum making the extraordinarily tall board impossible to show in full).

### Pass 3 handoff

Current environment: `Debug Atlas`, Origin, 202 widgets persisted after reload, no selection, 10% zoom. The board is intentionally an extreme stress surface; use smaller isolated workspaces/canvases for precise widget interaction. Next: validate Quick Add and tree shaping; nested canvas navigation; relation/dependency/wire/circuit workflows; focus mode; then perform risk-based deep passes across the shared renderer families and responsive/accessibility/failure states.

---

## Pass 4 checkpoint — Quick Add and manual tree-shaper entry/cancellation

### GP-013 — Quick Add confidently replaces a launch plan with an unrelated music project

- **Severity:** High
- **Category:** UX / resilience
- **Where:** Quick Add local interpretation and proposal preview
- **Steps to reproduce:**
  1. Open Quick Capture on an empty workspace.
  2. Enter exactly: `Project launch`, `- Write brief`, `- Design assets`, `- QA 🧪` on separate lines.
  3. Wait for the local proposal and cycle through all three alternatives.
- **Expected:** Preserve the explicit launch topic and tasks, ideally as a launch outline/checklist; if confidence is low, fall back to literal user text rather than inventing a new domain.
- **Actual:** The “Best fit” proposal was `Music project workspace`, creating `Music project outline`, `Music project next steps`, and `Music project media`. The second alternative remained music-oriented; the third became a generic writing desk. Choosing `The full picture` reset the proposal to the same music project. None retained launch, brief, design, QA, or the emoji.
- **Why it harms flow:** Quick Capture is positioned as the lowest-friction path from thought to structure. Confidently substituting a different project forces the user to audit and repair every generated card—the opposite of capture speed—and can pollute a board with plausible-looking wrong content.
- **Evidence:** [`17-quick-add-wrong-intent.png`](beta-test-evidence/17-quick-add-wrong-intent.png) shows the literal launch input above the unrelated “Music project workspace” preview.
- **Hypothesis:** A local intent/template selector overweights the generic word “project,” or stale example/template state leaks into generation. The specific model cause is unverified.
- **Suggested direction:** Preserve explicit nouns and list items as hard constraints; use confidence-gated literal fallbacks; make proposed titles/cards editable before creation; add deterministic intent fixtures that reject cross-domain substitutions.
- **Reproduction:** 1/1 input; 3/3 alternatives failed to preserve the stated project. Creating the proposal, batch Undo, and batch Redo otherwise passed.

### GP-014 — Guest backup nudge covers the tree-shaper controls and can lock the entire app on boot

- **Severity:** Blocker
- **Category:** bug / resilience / UI
- **Where:** Guest mode with 15+ widgets, manual Shape mode, bottom-center overlays
- **Steps to reproduce:**
  1. In guest mode, create at least 15 widgets so the “This board lives only on this device” backup nudge appears.
  2. Click `Shape a tree directly on the canvas`.
  3. Attempt to click the tree shaper’s `Cancel` control at the bottom center.
- **Expected:** The shaper HUD remains the active top layer and Cancel returns to the unchanged board.
- **Actual:** The backup nudge is layered above the shaper HUD in the same bottom-center region. The pointer action routes into the nudge’s sign-in path instead of safely cancelling. First reproduction landed on the sign-in page; after `Continue as guest`, data remained but history was cleared. Second reproduction left the app indefinitely on `Preparing your canvas`; waiting and a full reload did not recover it. Escape cancelled the shaper normally.
- **Why it harms flow:** A user trying to abandon a zero-change gesture can be ejected from their board or lose access to the entire app. The only successful audit workaround was moving to a different local origin; an ordinary user has no such recovery path.
- **Evidence:** [`18-tree-cancel-signout.png`](beta-test-evidence/18-tree-cancel-signout.png) shows the first forced sign-in; [`19-tree-cancel-loading-lock.png`](beta-test-evidence/19-tree-cancel-loading-lock.png) records the unrecoverable boot state. Source inspection confirms the guest nudge uses `z-40` while the shaper HUD beneath it uses `z-30`, at nearly identical fixed bottom-center coordinates.
- **Hypothesis:** This is an overlay-priority and hit-testing collision, not a fault in `cancelGhostShaper` itself; Escape bypasses the collision and passes.
- **Suggested direction:** Make mutually exclusive bottom-center surfaces coordinate through one overlay owner, place active-gesture HUDs above passive nudges, suspend the nudge during shaping, and add pointer hit-target tests with every persistent banner visible.
- **Reproduction:** 2/2 pointer attempts failed catastrophically; 1/1 Escape cancellation passed. The original `5174` audit origin remains stuck at the boot screen.

### Pass 4 handoff

The `5174` origin is no longer usable because of `GP-014`. Testing continues against the same live build on a fresh local origin at `http://127.0.0.1:5175/`; its storage is intentionally separate. The `5174` report/evidence and local workspace data remain untouched. Next: create a small interaction workspace on `5175`, finish tree-shaper gesture/commit without the 15-widget nudge, then cover nested canvas, relation/dependency/wire/circuit, focus, responsive, and high-risk representative widget controls.

---

## Pass 5 checkpoint — tree shaping, nested canvases, relations, dependencies, circuits, and Focus mode

Verified passes in this checkpoint:

- Manual tree shaping on a non-empty canvas: vertical child growth, horizontal sibling growth, 7-node preview, commit, single-step batch Undo, and Redo.
- Nested Canvas creation, naming, entry, breadcrumb return, canvas-tree counts, nested Checklist editing, checked state, Unicode, active-canvas restoration, and full reload persistence.
- Semantic `Link as child of…` creation through the context workflow.
- Dependency creation, visible blocked state, context menu, `Mark satisfied`, and removal of the blocked state.
- Focus mode entry, outside/Escape exit, exact prior-camera restoration, two-panel reordering, re-entry restoration, and full reload persistence of the saved panel order.
- Completion-sound preference toggle and full reload persistence.

Pointer wire delivery remains **inconclusive** in this browser automation surface: circuit rails rendered and pointer hit targets were exercised, but the very small captured drag could not be completed reliably. No product defect is claimed for wire propagation from that result. The accessibility defect below is independently observable in the live tree and source.

### GP-015 — Shape mode is unusable on the empty canvas it is offered on

- **Severity:** High
- **Category:** bug / UX / UI
- **Where:** Empty workspace → top toolbar `Shape a tree directly on the canvas`
- **Steps to reproduce:**
  1. Create an empty workspace.
  2. Enter Shape mode from the visible toolbar action.
  3. Attempt to drag the single `Tree point` vertically or horizontally.
  4. Cancel with Escape, add one Notes widget, and repeat the same gesture for comparison.
- **Expected:** The empty-state panel yields to the active tree tool; its first node is visible and draggable.
- **Actual:** The green empty-state onboarding card remains above the ghost-tree layer and covers the node. Four pointer drags produced no change from `Tree layout: 1 Nodes`. After adding one Notes widget (which removes the empty panel), the ghost cell became visible and one equivalent vertical drag immediately produced 4 nodes; a horizontal drag grew the preview to 7.
- **Why it harms flow:** The tool is most valuable on an empty canvas, yet that is the one state where its only required handle is hidden and inert. The user is forced to know an undocumented workaround: create unrelated content first.
- **Evidence:** [`21-tree-shaper-hidden-by-empty-state.jpg`](beta-test-evidence/21-tree-shaper-hidden-by-empty-state.jpg) shows Shape mode with the onboarding card but no reachable ghost cell; [`20-tree-shaper-preview.png`](beta-test-evidence/20-tree-shaper-preview.png) records the working multi-node preview after one widget exists. Source confirms the empty state is a pointer-active `z-10` panel while the ghost-tree layer has no competing z-order.
- **Hypothesis:** Straightforward stacking/hit-testing conflict between `EmptyCanvasState` and `GhostTreeShaper`.
- **Suggested direction:** Suspend the empty-state panel while shaping or lift the active gesture layer above it; add an empty-canvas pointer regression test.
- **Reproduction:** 4/4 empty-state drags failed; 2/2 non-empty comparison gestures worked.

### GP-016 — Circuit mode intentionally hides every port from keyboard and assistive technology

- **Severity:** High
- **Category:** accessibility / UX
- **Where:** Circuit mode port rails on Number Input, Checklist, and by shared implementation every widget with fields/commands
- **Steps to reproduce:**
  1. Enter Circuit mode.
  2. Inspect the accessibility tree and attempt to discover output/input/command ports without a pointer.
- **Expected:** Typed ports have meaningful names, focusability, compatibility feedback, and a keyboard connection workflow.
- **Actual:** The entire rail is `aria-hidden`; output ports are buttons with `tabIndex=-1` and no accessible name; input and command ports are non-focusable spans. The live snapshot rendered unnamed buttons/generic text such as `Number value`, `Increase by step`, and `Reset to minimum`, with no operable semantic relationship.
- **Why it harms flow:** Wires are a core product system, but keyboard and screen-reader users cannot discover, start, target, inspect, or delete one. Circuit mode is pointer-exclusive by construction.
- **Evidence:** Live accessibility snapshots on Source Value, Target Value, and Checklist; direct source verification in shared `PortRail` confirms `aria-hidden`, `tabIndex={-1}`, and span-based inputs.
- **Hypothesis:** Ports were treated as visual chrome rather than first-class controls.
- **Suggested direction:** Expose named output/input controls, support keyboard source/target selection and cancellation, announce type compatibility, and keep the visual drag path as one option rather than the only option.
- **Reproduction:** 3/3 sampled widgets; shared renderer makes the limitation systemic.

### GP-017 — Focus mode violates its own inertness contract for non-subject widgets

- **Severity:** High
- **Category:** accessibility / consistency
- **Where:** Focus mode on Target Value with Source Value and Checklist visible behind it
- **Steps to reproduce:**
  1. Double-click an expanded card to enter Focus mode.
  2. Inspect the accessibility tree.
  3. Inspect the panel reorder controls.
- **Expected:** Per the Focus-mode constitution, everything except the subject is dimmed **and inert**; reorder/resize controls are real keyboard-operable controls.
- **Actual:** The dimmed Source Value and Checklist remain fully exposed with textboxes, spinbuttons, checkboxes, and buttons. Panel rearrangement is represented by `role=button` divs without `tabIndex` or keyboard handlers; it is pointer-drag only despite appearing as buttons to assistive technology.
- **Why it harms flow:** Screen-reader users do not get the same focused workspace sighted users see, and keyboard users are promised rearrange buttons that cannot be reached or operated. This is a misleading modal boundary.
- **Evidence:** [`25-focus-mode.png`](beta-test-evidence/25-focus-mode.png) shows the visual dimming; the simultaneous accessibility snapshot exposed all background controls plus `Drag to rearrange panel…` pseudo-buttons. Source confirms no inert/ARIA hiding on non-subject cards and no keyboard mechanics on the reorder divs.
- **Hypothesis:** Visual focus treatment and pointer capture were implemented without a parallel accessibility-state model.
- **Suggested direction:** Apply true inertness/ARIA isolation to non-subject content, move focus into the subject, restore it on exit, and implement keyboard reorder/resize commands with announcements.
- **Reproduction:** 2/2 Focus entries on the same widget, including after a full reload.

### GP-018 — Dependency routing crosses unrelated content and mislabels the visual target

- **Severity:** Medium
- **Category:** UI / UX
- **Where:** Notes prerequisite → Root, with a Canvas widget positioned between them
- **Steps to reproduce:**
  1. Place a third unrelated widget between two vertically separated cards.
  2. Make the lower Notes widget a prerequisite for the upper Root widget.
- **Expected:** The dependency remains attributable to its true endpoints; route/status placement avoids unrelated cards or otherwise makes ownership unmistakable.
- **Actual:** The amber curve and `WAITING ON DEPENDENCY` chip cross/overlap the intervening `Nested Lab` Canvas card and its title region. The chip visually reads as though Nested Lab—not Root—is waiting. Moving geometry also caused the dependency and existing parent edges to bunch into an unreadable knot.
- **Why it harms flow:** On a connected canvas, users read topology spatially. A status chip attached to the wrong-looking card destroys trust in which item is blocked.
- **Evidence:** [`23-active-dependency.png`](beta-test-evidence/23-active-dependency.png).
- **Hypothesis:** Edge geometry has endpoint anchoring but no obstacle avoidance or collision-aware chip placement.
- **Suggested direction:** Route around card bounds, reserve a clear endpoint-adjacent status zone, and test dependency readability with intervening widgets and multiple edge types.
- **Reproduction:** 1/1 controlled dependency; the overlap remained until geometry was moved.

### GP-019 — Quick Add claims the local model is available while its own log says it was skipped

- **Severity:** Medium
- **Category:** copy / consistency / resilience
- **Where:** Quick Add status chip and AI debug panel
- **Steps to reproduce:**
  1. Open Quick Add without downloading/enabling the local model.
  2. Observe the chip `Qwen 3.5 0.8B available` / `Local`.
  3. Submit `Trip to Tashkent in October` and inspect the provided debug view.
- **Expected:** Status plainly distinguishes runtime capability, downloaded model, enabled model, and deterministic fallback; the visible result identifies which engine produced it.
- **Actual:** The user-facing chip says `Local` and `available`, while the same screen offers `download model`, says comparison is waiting for a download, and logs `Local model — Skipped · model is not enabled`. The actual proposal came from the heuristic engine.
- **Why it harms flow:** Users reasonably attribute result quality and privacy behavior to the model badge. The product currently implies an AI model ran when it did not.
- **Evidence:** [`26-quick-add-model-status.png`](beta-test-evidence/26-quick-add-model-status.png).
- **Hypothesis:** “Available” describes WebGPU/runtime compatibility, but the copy presents it as model readiness.
- **Suggested direction:** Use explicit states such as `Compatible`, `Not downloaded`, `Ready`, and `Using deterministic fallback`; show the active engine next to each proposal.
- **Reproduction:** 1/1 traced prompt; debug log recorded both the skipped model attempt and heuristic result.

### Pass 5 handoff

Current environment: `5175`, `Interaction Lab`, nested `Nested Lab` canvas. It contains Checklist, Source Value, and Target Value; Quick Add and debug overlays are closed, Focus and Circuit modes are off, completion sounds restored off. Next: responsive/browser zoom, selection and shortcut edge cases, malformed/unusual widget data, representative deep widget-family controls, templates/demo, stress undo/redo, and final accessibility/polish consolidation.

---

## Pass 6 checkpoint — selection shortcuts, grouping, deletion, duplication, and table data

Verified in this checkpoint:

- `⌘D` duplicated the selected widget; toolbar Undo removed it and Redo restored it.
- Backspace deleted a selected widget; both toolbar Undo and `⌘Z` restored the exact card.
- `⌘A` selected all three test widgets. ArrowRight moved the selection by 40 world pixels; Shift+ArrowDown moved it by 160. One Undo restored the coalesced keyboard move exactly.
- `⌘G` grouped a controlled three-widget selection without losing the visible cards; Undo and Redo were exact in this simple geometry. This pass does not retract `GP-010`, whose offscreen displacement remains reproducible in the more complex prior board state.
- The selection bar's `Detach` action separated a grouped widget, and toolbar Undo restored the group.
- Table Row/Col actions, four-cell editing, Unicode/emoji input, Enter-to-add-row, automatic focus advance, arrow-key cell navigation, and structural Undo were exercised.

Clipboard copy/paste could not be evaluated because the browser automation session virtualizes the system clipboard. This is recorded as a test limitation, not a product defect. A single `⌘Z` issued while a numeric field retained focus followed the field's native editing context rather than board history; because this behavior is consistent with browser form controls, it is not reported as a grouping defect.

### GP-020 — Table averages silently count blank cells as zero

- **Severity:** Medium
- **Category:** bug / UX / data integrity
- **Where:** Table widget summary beneath the currently selected column
- **Steps to reproduce:**
  1. Start with a four-row Table.
  2. Enter `123` in row 2, column 1 and leave rows 3 and 4 blank.
  3. Select the `123` cell.
- **Expected:** The summary excludes blank cells and reports `Σ 123 · avg 123.0`; a column with no numeric values should show a row/column count or an explicit no-numeric-data state.
- **Actual:** The summary reports `Σ 123 · avg 41.0`, dividing by three because both blank cells are coerced to numeric zero. Selecting a text-only column reports `Σ 0 · avg 0.0`, falsely suggesting two entered zeroes.
- **Why it harms flow:** An apparently authoritative calculation is materially wrong. Budgeting, scoring, and lightweight analysis are exactly why users reach for a table; silent zero-coercion makes the result untrustworthy.
- **Evidence:** [`29-table-blank-average.png`](beta-test-evidence/29-table-blank-average.png). Live source inspection confirms the numeric list applies `Number(value)` before filtering finite values; JavaScript converts an empty string to zero.
- **Hypothesis:** The summary pipeline lacks an explicit empty-string/null guard before numeric conversion.
- **Suggested direction:** Treat trimmed blanks as missing, parse only genuinely numeric strings, state which cells are included, and add mixed blank/text/number summary tests.
- **Reproduction:** 3/3 selected-column checks; the exact incorrect `123 / 3 = 41.0` result was reproduced once after the broader mixed-data test.

### Pass 6 handoff

Current environment: `5175`, `My Workspace` seeded demo. The Table has been restored to its original 3×3 structure and blank content through public Undo controls. Next: Budget and AI Generator failure/boundary inputs, template/domain-pack flows, a deep representative widget-family sample, then responsive/accessibility and report consolidation.

---

## Pass 7 checkpoint — core and specialist widget depth

Core widgets exercised beyond catalogue creation: Budget, AI Generator, Kanban, Timer, Stopwatch, Calculator, Media, Calendar, Sketchpad, Goal Tracker, and Table. Specialist/pack widgets exercised: Game Mechanics Tuner, Synthesizer & Audio Player, HTTP Request, Script Block, Line Chart, Color Palette, Commission Queue, Inventory, Risk Register, Quiz, and Recipe. Domain-pack enablement and reload persistence passed. The representative workspace survived a full reload with Goal text/check state, Timer duration, Calendar selection, Kanban cards, and Media URL/alt/caption preserved.

Clean passes included: Timer start/pause/reset and disabled duration controls while running; Stopwatch start/lap/pause/reset; Calculator parentheses/decimal evaluation and division-by-zero error; Media broken-URL fallback and recovery to a valid image with alt text; Calendar month navigation and pressed-date persistence; Goal Tracker milestone completion, Enter-to-add, and calculated progress; Quiz wrong/correct/retry lifecycle; Line Chart sampling and summary updates; Game Tuner labelled range semantics; Domain Pack preference persistence.

### GP-021 — Budget silently rewrites out-of-range amounts without validation feedback

- **Severity:** Medium
- **Category:** resilience / UX / data integrity
- **Where:** Budget line-item amount inputs
- **Steps to reproduce:** Enter `9999999999999` into a Budget amount, then enter `1e309`.
- **Expected:** The field validates the stated limit, explains the allowed range, and preserves the user's draft until they correct or explicitly accept normalization.
- **Actual:** The first value silently becomes `1000000000000`; the overflowing exponential silently becomes `0`. No error, limit, or normalization message appears. Negative totals are also formatted as `$-10.00` rather than the conventional `-$10.00`.
- **Why it harms flow:** A large pasted financial value can be changed by an order of magnitude—or erased to zero—while the interface looks successful.
- **Evidence:** [`30-budget-silent-clamp.png`](beta-test-evidence/30-budget-silent-clamp.png); live source confirms finite values are clamped to `1e12` while non-finite parsing falls through to zero.
- **Hypothesis:** Defensive numeric normalization was implemented without a user-visible validation state.
- **Suggested direction:** Show the range, preserve invalid drafts, validate on commit, and make any clamp an explicit confirmation.
- **Reproduction:** 3/3 boundary inputs normalized silently; original values were restored through public editing.

### GP-022 — AI Generator turns a singular checklist request into six unrelated cards

- **Severity:** High
- **Category:** UX / consistency / resilience
- **Where:** Seeded `AI Generator` widget
- **Steps to reproduce:** Enter `Create a checklist for launch: test Unicode 🚀, verify backups, ship.` and click Generate.
- **Expected:** Create one checklist matching the explicit request, or preview/ask before expanding the scope.
- **Actual:** The app reports `Generated 6 cards` and creates a Sticky Note, Checklist, Timeline, Budget, Kanban, and SWOT Analysis with invented titles such as `The business position` and `Runway`.
- **Why it harms flow:** A direct object-level instruction becomes a board-wide opinionated template, forcing cleanup and making the generator unsafe on a curated board.
- **Evidence:** [`31-generator-overgeneration.png`](beta-test-evidence/31-generator-overgeneration.png); the live accessibility tree enumerated all six outputs.
- **Hypothesis:** The deterministic project-pack heuristic overrides requested cardinality and widget type.
- **Suggested direction:** Obey explicit type/count first; preview multi-card expansions with a precise diff and selectable outputs.
- **Reproduction:** 3/3 generations of the same controlled prompt produced the same six-card expansion.

### GP-023 — AI Generator's own Undo action leaves every generated card behind

- **Severity:** High
- **Category:** bug / resilience / data integrity
- **Where:** `Generated 6 cards` toast → `Undo`
- **Steps to reproduce:**
  1. Generate the six-card result above.
  2. Immediately click the toast's exact `Undo` action.
- **Expected:** The six-card batch is removed in one atomic reversal and the original generator prompt remains available.
- **Actual:** Only `Widget spawned on canvas` is cleared; all six generated cards remain. A second, separate toolbar Undo is required to remove them.
- **Why it harms flow:** The product explicitly promises a safety exit after a high-impact action, but that exit does not undo the impact. Users can unknowingly keep unwanted generated content.
- **Evidence:** [`32-generator-toast-undo-fails.png`](beta-test-evidence/32-generator-toast-undo-fails.png); automated live check after the toast action recorded `generatedRemain: true` and `spawnStatus: false`.
- **Hypothesis:** The generated batch is committed first, then the generator's `status: done` update creates a newer history entry; the toast blindly undoes only that status entry.
- **Suggested direction:** Commit output creation and generator status as one transaction, and bind the toast to that transaction ID rather than generic single-step Undo.
- **Reproduction:** 1/1 exact toast action; toolbar Undo showed the same two-step history ordering in 2/2 prior generations.

### GP-024 — Sketchpad is an addable drawing tool with no drawing engine

- **Severity:** High
- **Category:** bug / UX / copy
- **Where:** Widget Library → `Sketchpad` (`Rough drawing surface`)
- **Steps to reproduce:** Add Sketchpad, select Pen or Eraser, and attempt to draw on its surface.
- **Expected:** Pointer strokes appear, persist, erase, and participate in Undo/Redo.
- **Actual:** The surface displays `Drawing engine pending`. Pointer movement only shows coordinates/crosshairs; a real press-and-drag across the drawing surface moved the entire Sketchpad card and produced no stroke. The component has no pointer-down, stroke storage, drawing, erase, or persistence path. Pen and Eraser merely change local button state/cursor.
- **Why it harms flow:** This is not a rough implementation of drawing; it is a non-feature presented as a production widget. Users invest layout and intent into a card that cannot perform its sole advertised job.
- **Evidence:** [`36-sketchpad-placeholder.png`](beta-test-evidence/36-sketchpad-placeholder.png), plus before/after pointer-drag evidence [`43-sketchpad-before-drag.png`](beta-test-evidence/43-sketchpad-before-drag.png) and [`44-sketchpad-after-drag.png`](beta-test-evidence/44-sketchpad-after-drag.png). Direct source verification confirms only pointer-coordinate tracking and tool-state toggling exist; the non-interactive surface also allows the shared card-drag handler to own pointer-down.
- **Hypothesis:** A development placeholder was left in the public picker.
- **Suggested direction:** Hide the widget until minimally complete, or ship persistent strokes, erasing, clear, Undo/Redo, pointer capture/cancel, touch, and keyboard-accessible alternatives.
- **Reproduction:** 1/1 live pointer drag moved the card and drew nothing; deterministic by implementation.

### GP-025 — Kanban move and delete commands do not exist until pointer hover

- **Severity:** High
- **Category:** accessibility / UX
- **Where:** Kanban cards
- **Steps to reproduce:** Add a Kanban, inspect its card with keyboard or accessibility tree, then add another card.
- **Expected:** Every card exposes named move-left, move-right, and remove actions independent of hover; drag is an optional shortcut.
- **Actual:** `Move left`, `Move right`, and `Remove card` use `display: none` until `group-hover`. The accessibility tree contains no move/remove controls for either card, leaving only text editing and the column-level Add buttons.
- **Why it harms flow:** Keyboard and screen-reader users can add and rename cards but cannot move or delete them. A basic board becomes an append-only trap.
- **Evidence:** Live tree returned zero move/remove controls with two cards; shared source confirms hover-only `hidden`/`group-hover:flex|block` controls. [`36-sketchpad-placeholder.png`](beta-test-evidence/36-sketchpad-placeholder.png) also shows the adjacent Kanban with no visible card actions at rest.
- **Hypothesis:** Desktop pointer cleanliness took precedence over persistent operability.
- **Suggested direction:** Keep commands focusable and accessibility-visible at rest, reveal them visually on hover **or focus-within**, and add keyboard reorder/move commands.
- **Reproduction:** 2/2 cards; source pattern is shared across every Kanban card.

### GP-026 — Primary Inventory and Synthesizer controls have no accessible names

- **Severity:** High
- **Category:** accessibility
- **Where:** Inventory quantity stepper; Synthesizer & Audio Player play/pause
- **Steps to reproduce:** Add both widgets and inspect their accessibility trees.
- **Expected:** Controls announce action and target, such as `Decrease Item quantity`, `Increase Item quantity`, and `Play`/`Pause`; number inputs announce Quantity and Minimum.
- **Actual:** Inventory exposes two bare `button` nodes and two unnamed `spinbutton` nodes. The Synthesizer's primary circular play/pause control is also a bare unnamed button; its icon has no alternative name and the pressed/playing state is not exposed.
- **Why it harms flow:** A screen-reader user encounters indistinguishable controls at the exact points where inventory and audio are operated. Trial and error changes real state.
- **Evidence:** [`38-inventory-unlabeled-controls.png`](beta-test-evidence/38-inventory-unlabeled-controls.png); exact live segment recorded two unnamed buttons and two unnamed spinbuttons. Synthesizer snapshot independently recorded a bare button before the labelled BPM control; source contains no `aria-label` or visible text.
- **Hypothesis:** Visual table headings/icons were assumed to label adjacent native controls, but no programmatic association was provided.
- **Suggested direction:** Label every control with action + item context, associate column headers, expose play state with a changing name and `aria-pressed`, and audit the catalogue for empty accessible names.
- **Reproduction:** 1/1 instance of each widget; deterministic by shared markup.

### GP-027 — Malformed HTTP configuration is ignored and a fallback network request executes

- **Severity:** High
- **Category:** resilience / bug
- **Where:** HTTP Request automation widget
- **Steps to reproduce:** Set Input to `https://example.invalid/`, set Configuration JSON to `{ definitely-not-json`, and click Execute.
- **Expected:** Execution is blocked with a JSON parse error; no network request occurs.
- **Actual:** Status changes to `Needs attention` with `Failed to fetch`, proving the malformed configuration was discarded and a request was attempted using Input as the fallback URL. Source confirms parse errors return `{}` and execution proceeds; the same path covers Webhook Sender.
- **Why it harms flow:** A typo in method, URL, headers, or body does not fail safely. For a webhook, malformed configuration can send the wrong method/body to the wrong fallback URL.
- **Evidence:** [`39-http-invalid-config-executes.png`](beta-test-evidence/39-http-invalid-config-executes.png); controlled target used the non-resolving `.invalid` domain so no external system changed.
- **Hypothesis:** `parseConfig` was made permissive for convenience but sits before a side-effect boundary.
- **Suggested direction:** Parse and validate configuration before enabling Execute, show field-level errors, and never substitute side-effecting defaults after invalid input.
- **Reproduction:** 1/1 safe GET attempt; source establishes identical parse behavior for HTTP Request and Webhook Sender.

### GP-028 — “Sandboxed” Script Block can access network and persistent browser storage

- **Severity:** High
- **Category:** resilience / security analysis
- **Where:** Script Block automation widget, advertised in the picker as `Run sandboxed code against explicit ports`
- **Steps to reproduce:** Set Function body to `return [typeof fetch, typeof indexedDB, typeof WebSocket, typeof navigator].join(',')` and Execute.
- **Expected:** A sandbox described as operating against explicit ports cannot access ambient network or origin storage capabilities.
- **Actual:** Output is `function,object,function,object`: the worker has `fetch`, IndexedDB, WebSocket, and navigator access. Source creates a same-origin Blob Worker and evaluates arbitrary code with `new Function`; there is no capability membrane.
- **Why it harms flow:** Imported or shared automation code can potentially read same-origin IndexedDB and transmit data without using declared ports. Calling this sandboxed creates a false security boundary.
- **Evidence:** [`40-script-worker-network-storage.png`](beta-test-evidence/40-script-worker-network-storage.png). No network or storage mutation was performed; this finding stops at capability enumeration.
- **Hypothesis:** “Sandboxed” was intended to mean “off the UI thread/no DOM access,” not isolated from sensitive browser capabilities.
- **Suggested direction:** Define the trust model, remove the sandbox claim unless true, run untrusted code in a capability-restricted environment, require explicit permission for network/storage, and never auto-run imported code before review.
- **Reproduction:** 1/1 controlled capability probe; source makes the result deterministic.

### GP-029 — Commission Queue's Slot cap edits one property while displaying another

- **Severity:** High
- **Category:** bug / data integrity / consistency
- **Where:** Commission Queue and potentially other shared Atlas widgets with writable fields
- **Steps to reproduce:**
  1. Add Commission Queue; note `Slot cap` displays `2` even though its catalogue default target is `4`.
  2. Enter `10` in Slot cap.
  3. Click `advance stage`, then `deliver`.
- **Expected:** Slot cap displays and edits the configured cap; workflow commands change stage/delivery only.
- **Actual:** The typed `10` is ignored visually. `advance stage` changes Slot cap from `2` to `3`; `deliver` changes it to `4`. The shared setter writes `target`, but the getter for `slot_cap` falls through to `primary`; the commands increment `primary`.
- **Why it harms flow:** A labelled configuration field lies about the value it controls, rejects edits without explanation, and changes in response to unrelated actions. Capacity planning cannot be trusted.
- **Evidence:** [`41-commission-slot-cap-binding.png`](beta-test-evidence/41-commission-slot-cap-binding.png); live sequence captured `2 → 3 → 4` from workflow commands and `10 → 4` after editing. Source trace confirms the getter/setter property mismatch.
- **Hypothesis:** The generic Atlas inference maps semantic key names to display values but does not prioritize each field's declared writable storage slot. Other Atlas writable fields may share this defect and require a systematic audit.
- **Suggested direction:** Make every descriptor's getter and setter target the same declared slot, add round-trip tests (`set(x)` then `get() === x`) for all Atlas fields, and test command orthogonality.
- **Reproduction:** 4/4 state transitions in the original instance; shared code path verified.

### Pass 7 handoff

Current environment: `5175`, `Pack Lab`, with all ten domain packs enabled and 13 specialist test widgets (including a duplicate Commission Queue and one Script Block). No external endpoint was mutated; the HTTP test used `example.invalid`, and the Script Block probe only returned capability types. Next: console/error review, reduced-motion/responsive limitations, accessibility/system consistency sweep, stress/reload of Pack Lab, then final consolidation into the requested report structure and top-ten list.

---

## Pass 8 checkpoint — recovery, navigation, contrast, and destructive cascades

Verified in this checkpoint:

- Browser warning/error log remained empty after the core/specialist interaction passes, safe HTTP failure, rapid history operations, workspace switches, and reloads.
- Command Palette found `Source Value` inside the nested `Nested Lab` canvas from Origin and navigated directly to it.
- Widget context-menu Lock protected a selected card from Backspace deletion; Unlock restored normal state.
- Collapse-to-pill and context-menu Expand both worked and restored the full Number Input.
- Theme preference survived a full reload and was restored to dark afterward.
- Eight rapid Risk Register additions were coalesced by history without a crash; a controlled single Add → Undo → Redo restored counts `1 → 2` correctly.
- A populated nested canvas deletion and Undo restoration were performed twice. Undo restored the Canvas card and all three nested widgets exactly; the missing pre-delete warning is recorded below.
- Reduced-motion coverage could not be activated in this browser surface. Source inspection found a global `prefers-reduced-motion: reduce` rule that forces animation/transition duration to `0.01ms`, plus component-specific overrides; no mismatch is claimed without runtime emulation.

### GP-030 — Essential microcopy is rendered at roughly 1.9:1 contrast and 8–10px

- **Severity:** High
- **Category:** accessibility / UI
- **Where:** Widget helper text, labels, empty/pending messages, secondary controls, and catalogue/specialist panels in dark mode
- **Steps to reproduce:** Open representative widgets such as Sketchpad, Kanban, Automation Core, Budget, Risk Register, or Commission Queue and inspect helper/action text at 100–145% canvas zoom.
- **Expected:** Essential normal-size text meets at least WCAG AA's 4.5:1 contrast target and remains legible without canvas zoom.
- **Actual:** Repeated styles use `text-neutral-700` (`#404040`) on/near `neutral-950` (`#0a0a0a`), approximately **1.91:1**, often at `8px`, `9px`, or `10px`. `text-neutral-600` is also used for controls/instructions and remains far below 4.5:1. In screenshots, commands such as Add, field labels, and `Drawing engine pending` visually disappear.
- **Why it harms flow:** Users cannot distinguish disabled, secondary, and simply unreadable controls. This forces zooming, hunting, and trial clicks; low-vision users lose core status and action information entirely.
- **Evidence:** [`36-sketchpad-placeholder.png`](beta-test-evidence/36-sketchpad-placeholder.png), [`40-script-worker-network-storage.png`](beta-test-evidence/40-script-worker-network-storage.png), and [`42-light-theme-specialist.png`](beta-test-evidence/42-light-theme-specialist.png). Contrast ratio was calculated from the exact Tailwind colors used by the live source.
- **Hypothesis:** The visual system treats low contrast as hierarchy even when the text carries unique operational meaning.
- **Suggested direction:** Establish semantic text tokens with verified contrast in both themes, prohibit sub-11px essential copy, and run automated contrast checks on every widget state.
- **Reproduction:** Systemic across every sampled family; exact count not meaningful because the same utility classes recur throughout shared renderers.

### GP-031 — Deleting one Canvas card silently deletes its entire populated subtree

- **Severity:** High
- **Category:** resilience / UX / data integrity
- **Where:** Widget context menu → Delete on a Canvas widget containing a nested canvas
- **Steps to reproduce:**
  1. Create a Canvas widget and put several edited widgets inside it.
  2. Return to the parent canvas, right-click the Canvas card, and choose Delete.
- **Expected:** Warn that the nested canvas and all descendant widgets will be removed, state the item count, and require explicit confirmation; the success message should describe the cascade and offer Undo.
- **Actual:** The card and its entire three-widget nested canvas disappear immediately. The only feedback is `Deleted widget`, singular, with no warning that a subtree was destroyed. Toolbar Undo restores everything, but only while that history remains available.
- **Why it harms flow:** A visually small parent card can contain an arbitrarily large body of work. The UI hides the blast radius at both decision and acknowledgement time.
- **Evidence:** [`45-nested-cascade-no-warning.png`](beta-test-evidence/45-nested-cascade-no-warning.png). Two immediate Undo checks restored Canvas, Checklist, Source Value, and Target Value.
- **Hypothesis:** The canonical delete cascade is correct at the data layer, but the context action and toast receive only the selected-card count rather than descendant impact.
- **Suggested direction:** Precompute descendant counts, confirm destructive cascades, name affected canvases/widgets, and provide a transaction-bound Undo action.
- **Reproduction:** 2/2 controlled deletions; 2/2 Undo restorations passed.

### Pass 8 handoff

Current environment: `5175`, `Interaction Lab`, Origin, with the populated `Nested Lab` fully restored after the cascade test. All test workspaces remain available. Next: finalize remaining coverage limitations, severity/top-ten ordering, widget-family synthesis, and the owner-facing executive report; continue spot checks until the four-hour goal expires.

---

## Pass 9 checkpoint — exact pointer geometry and automation deadlocks

- A direct drag on Sketchpad's visible drawing surface produced no stroke and allowed card/camera movement, consistent with the source-level absence of any stroke engine (`GP-024`).
- A precisely targeted Notes title-capsule drag moved the selected card while leaving the comparison card in place. Immediate Undo shifted the visible board roughly 590 px vertically instead of restoring the pre-drag view, giving a fifth clean reproduction of `GP-009` on an isolated two-widget board.
- A precisely targeted Notes resize path changed the card size/state without crashing; the already-recorded Notes scale/history defects remain the actionable result.
- Shift-marquee selection could not be certified because the automation surface did not preserve the modifier through its low-level drag. No product defect is claimed.
- Workspace deletion showed an appropriate destructive confirmation, and its immediate toast Undo restored the workspace.
- A controlled localhost server accepted an HTTP request and never responded. The app had no timeout or Cancel, and a full reload persisted an unrecoverable Running state, recorded as `GP-033`. The local server was then terminated.

### GP-032 — Retracted: workspace deletion Undo works

This candidate is **retracted**. The first automated assertion searched a closed-menu snapshot for the workspace name and returned a false negative. Visual inspection of [`61-workspace-toast-undo-misses.png`](beta-test-evidence/61-workspace-toast-undo-misses.png) clearly shows `Gesture Lab` restored in the open workspace menu after the toast Undo. The destructive confirmation copy and immediate recovery path pass.

### GP-033 — A hanging HTTP request permanently bricks the widget across reload

- **Severity:** High
- **Category:** resilience / performance / bug
- **Where:** HTTP Request automation widget
- **Steps to reproduce:**
  1. Point a valid GET configuration at a local endpoint that accepts the connection but never responds.
  2. Click Execute and wait.
  3. Reload the app and navigate back to the same HTTP Request widget.
- **Expected:** A bounded timeout and Cancel action are available. Reload aborts stale work and resets the widget to a recoverable error/Ready state.
- **Actual:** The widget remains `Running` with Execute disabled and no Cancel indefinitely. After full reload, the same persisted configuration still shows `Running`; the old network task no longer exists, but the control remains disabled with no recovery action.
- **Why it harms flow:** One slow or broken endpoint permanently disables the automation card. Wired workflows can deadlock offscreen, and reload—the universal recovery action—cements the dead state.
- **Evidence:** [`62-http-hangs-running.png`](beta-test-evidence/62-http-hangs-running.png) before reload and [`63-http-running-after-reload.png`](beta-test-evidence/63-http-running-after-reload.png) after reload. The endpoint was a local no-response server and was terminated after the test.
- **Hypothesis:** Fetch has no AbortController/timeout, and transient `running` is persisted without startup reconciliation against the in-memory `inFlight` set.
- **Suggested direction:** Add per-request timeout/cancel, persist durable job state separately from transient UI state, and reconcile any orphaned Running state to an explicit interrupted error on startup.
- **Reproduction:** 1/1 controlled hanging request; state remained dead after full reload.

### Pass 9 handoff

Current environment: `5175`, `Pack Lab`; `Gesture Lab` was restored by the workspace toast Undo. `Gesture Lab`, `Pack Lab`, `Widget Depth`, and `Interaction Lab` remain available for cleanup after final spot checks. The local hanging HTTP server is stopped. Next: update exact evidence links/counts, clean scratch workspaces through the UI, run final document verification, and close only after the requested time budget.

---

## Pass 10 checkpoint — global shortcuts and stateful automation semantics

- Restored the original five-widget workspace, removed the four earlier scratch workspaces through the public confirmation flow, restored all domain packs to off, cleared the AI prompt, and verified the clean state survived reload.
- On a canvas-focused board, `N` opened Quick Add with its prompt focused, `W` toggled Circuit rails, `+` moved zoom from 100% to 125%, and `0` restored 100%. Escape closed Quick Add. These direct shortcut paths passed.
- Circuit mode's visual on/off state is not programmatically exposed (`GP-034`).
- Created an isolated `Automation Lab`, enabled only the Software Engineering pack, and exercised Variable Store, Queue, Stack, Set Store, State Machine, Transaction, Workflow Lock, Webhook Sender, Manual Trigger, Comparator, Event Merger, and Recorder. Variable Store passthrough/persistence, Queue FIFO order, Workflow Lock acquire/release, Recorder sampling, and Comparator evaluation passed.
- Stack, Set Store, and State Machine all violated the core semantics stated in their catalogue descriptions (`GP-035`). Their incorrect state survived a full reload.
- Browser warning/error logs remained empty; these are silent product-logic failures rather than surfaced runtime exceptions.

### GP-034 — Circuit mode exposes no on/off state to assistive technology

- **Severity:** Medium
- **Category:** accessibility / consistency
- **Where:** Toolbar `Circuit mode (W)` toggle
- **Steps to reproduce:** Focus the canvas, press `W` to show Circuit rails, inspect the toolbar button's accessible state, press `W` again to hide the rails, and inspect it again.
- **Expected:** The control exposes a toggle state such as `aria-pressed=true/false`, or changes its accessible name to `Enter/Exit Circuit mode`.
- **Actual:** The board visibly switches between normal cards and colored input/output rails, but the accessibility surface remains the identical `button "Circuit mode (W)"`. `aria-pressed` was `null` before, during, and after the mode, and no live announcement identified the change.
- **Why it harms flow:** A screen-reader user cannot tell whether the entire board is in its special wiring mode. That uncertainty is especially costly because the mode changes what every card edge means and which pointer targets appear.
- **Evidence:** [`71-circuit-mode-no-state-semantics.png`](beta-test-evidence/71-circuit-mode-no-state-semantics.png) shows the visually active rail state; live attribute checks recorded `off: null`, `on: null`, `offAgain: null` for `aria-pressed`.
- **Hypothesis:** The toolbar treats the title/tooltip as sufficient labelling and styles the icon visually without wiring the mode boolean into button semantics.
- **Suggested direction:** Use a true toggle button with `aria-pressed`, provide Enter/Exit wording or a concise status announcement, and keep focus stable across the mode change.
- **Reproduction:** 3/3 state inspections across two complete toggle cycles.

### GP-035 — Stateful automation widgets do not implement their advertised data semantics

- **Severity:** High
- **Category:** bug / consistency / data integrity
- **Where:** Software Engineering pack → Stack, Set Store, State Machine, and Idempotency Store
- **Steps to reproduce:**
  1. On Stack, Execute `first`, then `second`, then choose `Release next`; repeat with `third` and `fourth`.
  2. On Set Store, Execute the exact value `duplicate` twice.
  3. On State Machine, Execute `totally-invalid-transition` without defining any states or transitions.
  4. On Idempotency Store, Execute the exact event key `event-42` twice.
  5. Reload the app.
- **Expected:** Stack releases the newest value first (LIFO); Set Store retains one unique member; State Machine requires a defined transition graph and rejects illegal moves; Idempotency Store prevents the second processing of the same event.
- **Actual:** Stack released `first` before `second`, then `third` before `fourth`—the same FIFO behavior as Queue. Set Store reported `2 runs` and retained two items for the duplicate value. State Machine accepted and echoed the arbitrary transition as successful. Idempotency Store also reported `2 runs` and echoed the same event twice. Every incorrect result survived reload.
- **Why it harms flow:** These names are operational guarantees, not decoration. A workflow using Stack order, set/idempotency deduplication, or transition enforcement can silently run the wrong job, double-process an event, or enter an impossible state while the UI reports success.
- **Evidence:** [`67-stack-releases-fifo.png`](beta-test-evidence/67-stack-releases-fifo.png), [`68-set-store-allows-duplicates.png`](beta-test-evidence/68-set-store-allows-duplicates.png), [`69-state-machine-echo.png`](beta-test-evidence/69-state-machine-echo.png), [`70-automation-state-reload.png`](beta-test-evidence/70-automation-state-reload.png), [`73-idempotency-secret-failures.png`](beta-test-evidence/73-idempotency-secret-failures.png), and [`74-secret-persists-in-board.png`](beta-test-evidence/74-secret-persists-in-board.png). Exact live outputs included `Stack … Output first`, `Set Store … 2 runs`, `State Machine … Output totally-invalid-transition`, and `Idempotency Store … 2 runs … Output event-42`. Direct source inspection confirms all automation types share one command table: dequeue always removes the head, Queue/Stack/Set all map Execute to the same enqueue command, and State Machine/Idempotency Store fall through to a generic input echo.
- **Hypothesis:** **Confirmed mechanism:** catalogue labels and descriptions were added before type-specific state engines; the shared automation renderer makes incomplete types look equally finished. A broader source audit found **31 of 49** Automation Core types have no explicit executor branch and therefore fall through to generic `output = input`. Some simple sources may legitimately pass data through, but complex promises such as Loop, Transaction, Data Join, Object Builder, Race, and Workflow Test Suite have no type-specific behavior on the canonical button/wire execution path. That broader scope is reasoned analysis, not a claim that all 31 were individually reproduced live.
- **Suggested direction:** Give each state widget its own validated data model and commands, hide types that are still generic passthroughs, and add black-box contract tests for ordering, uniqueness, idempotency, legal transitions, reload, Undo, and wire-triggered execution.
- **Reproduction:** Stack failed 2/2 independent two-item batches; Set Store failed 1/1 duplicate cycle; State Machine accepted 1/1 undefined transition; Idempotency Store processed 2/2 identical submissions; reload preserved every sampled result.

### Pass 10 handoff

Current environment: `5175`, isolated `Automation Lab`, Software Engineering pack enabled for the final state-widget pass. Circuit mode is off and no external endpoint was contacted. Next: remove this scratch workspace, restore the pack preference, verify the original workspace once more, then run report/evidence/document checks and final severity consolidation.

---

## Pass 11 checkpoint — automation trust boundaries and transactional Undo

- Removed `Automation Lab`, disabled the Software Engineering pack, reloaded, and verified the original `My Workspace` had exactly five widgets and the core picker had 25 entries.
- Created a second isolated `Contract Lab` to probe the automation catalogue's strongest promises: Idempotency Store, Secret Reference, Widget Creator, Loop, Transaction, and Key Value Store.
- Widget Creator successfully created two Notes cards from two input lines; this basic creation path passed.
- Idempotency Store processed the same key twice, extending the generic state-widget failure in `GP-035`.
- Secret Reference displayed and persisted the raw secret in two places (`GP-036`).
- A second Widget Creator run demonstrated that a two-card automation is split across independent history entries; Undo also restored a stale transient Running state that remained dead after reload (`GP-037`).
- Source-routing audit: all 49 Automation Core catalogue types enter the same canonical executor from both their button and Circuit trigger. Only 18 have explicit branches; 31 fall through to a generic input echo. This is recorded as a reasoned-analysis scope expansion under `GP-035`, not 31 invented live defects.

### GP-036 — Secret Reference displays and persists the raw secret it claims not to expose

- **Severity:** High
- **Category:** resilience / security analysis / copy
- **Where:** Software Engineering pack → Secret Reference
- **Steps to reproduce:** Add Secret Reference, enter `SENSITIVE_TEST_TOKEN` in Input, click Execute, and reload the app.
- **Expected:** The widget accepts an opaque credential reference or vault key, masks any sensitive display, and never stores the raw credential in ordinary board/export data or publishes it through a normal Output field.
- **Actual:** The raw token is immediately shown once in Input and again in Output. A full reload restores both clear-text copies. The shared field registry also advertises Output as a connectable field, so the value is treated as ordinary workflow data rather than a protected reference.
- **Why it harms flow:** The product invites users to place credentials into a security-labelled tool, then duplicates those credentials into persistent board state. That value can be exposed during screen sharing, export, sync, or ordinary circuit wiring.
- **Evidence:** [`73-idempotency-secret-failures.png`](beta-test-evidence/73-idempotency-secret-failures.png) and [`74-secret-persists-in-board.png`](beta-test-evidence/74-secret-persists-in-board.png). The live tree contained `SENSITIVE_TEST_TOKEN` exactly twice after reload. Direct source inspection confirms Secret Reference falls through to the generic `output = input` executor and uses the same persisted `AutomationCoreData` fields as non-secret widgets.
- **Hypothesis:** **Confirmed mechanism:** Secret Reference currently has a security-themed catalogue entry but no credential-vault or opaque-reference implementation.
- **Suggested direction:** Hide this widget until a real secret store exists. Use opaque handles, explicit scoped permissions, masked/reveal-on-demand UI, export/sync redaction, and never expose secret material through generic fields.
- **Reproduction:** 1/1 execution exposed two clear-text copies; 1/1 reload persisted both.

### GP-037 — Widget Creator fragments one batch across Undo and can restore a permanently Running card

- **Severity:** High
- **Category:** bug / resilience / data integrity
- **Where:** Software Engineering pack → Widget Creator, toolbar Undo/Redo, reload
- **Steps to reproduce:**
  1. Enter two lines, `Created C` and `Created D`, in Widget Creator and click Execute.
  2. Confirm both Notes cards appear.
  3. Click toolbar Undo once, then Undo a second time; click Redo once.
  4. Reload the app.
- **Expected:** The automation run is one transaction. One Undo removes both outputs and restores the creator to its pre-run Ready state; one Redo restores both and a completed status. Reload reconciles any transient execution state.
- **Actual:** First Undo removed only `Created D`; `Created C` remained and the creator reverted to `Running` with stale output IDs from an earlier run. Second Undo removed `Created C`. One Redo restored only `Created C`, still leaving the creator Running. Reload persisted that orphaned Running state with Execute disabled and no recovery action.
- **Why it harms flow:** A user cannot reverse or replay an automation as one intent. Partial outputs and stale execution state make the board disagree with the creator's own result, and normal recovery permanently disables the automation.
- **Evidence:** [`75-widget-creator-undo-fails.png`](beta-test-evidence/75-widget-creator-undo-fails.png) after the first Undo and [`76-widget-creator-running-after-reload.png`](beta-test-evidence/76-widget-creator-running-after-reload.png) after reload. Live assertions recorded `{C:true,D:false}` after Undo 1, `{C:false,D:false}` after Undo 2, `{C:true,D:false}` after Redo 1, followed by `Running` and a present `disabled` attribute after reload.
- **Hypothesis:** Each internal `createWidget` call pushes its own history snapshot, while executor status writes create or restore additional snapshots. Transient `running` is persisted without startup reconciliation, the same orphan-state failure family as `GP-033`.
- **Suggested direction:** Wrap every automation run and all of its outputs/status in one transaction ID; make Undo/Redo operate on that transaction; never persist `running` as durable truth; reconcile interrupted runs to a recoverable error on startup.
- **Reproduction:** 1/1 two-output batch fragmented over two Undos; 1/1 partial Redo; 1/1 reload preserved the dead Running state.

### Pass 11 handoff

Cleanup completed: `Contract Lab` was deleted through the public confirmation flow, Software Engineering was disabled, and a full reload restored the original `My Workspace` with exactly five widgets. The picker again reports 25 core widgets, Circuit mode is off, and no external request was made; the test secret was synthetic. Next: finish report integrity/documentation checks and close only after the requested four-hour budget.

---

## Pass 12 checkpoint — final compatible-wire attempt and cleanup

A minimal `Wire Lab` with only Number Input and Counter was created to retry the one unresolved manual-smoke gate. Circuit mode exposed the Number value output and writable Counter count input at 145% zoom. A direct port drag produced a persistent dashed blue path, but its free endpoint routed above the viewport rather than visibly snapping to Counter. Changing Number Input from `0` to `7` left Counter at `0`; Escape did not remove the path.

This is **not promoted to a product finding**. The low-level browser pointer layer had already failed to preserve modifiers and exact hover coordinates elsewhere, and the evidence cannot distinguish a Grovepad dangling-wire defect from an automation delivery miss. The honest result remains: compatible pointer wire delivery/value propagation is inconclusive in this environment. Screenshots [`78-wire-lab-before.png`](beta-test-evidence/78-wire-lab-before.png) through [`86-wire-target-click.png`](beta-test-evidence/86-wire-target-click.png) preserve the attempted sequence for a physical-device retest.

`Wire Lab` was deleted through the public confirmation flow. A full reload again shows only the original `My Workspace` with five widgets; Circuit mode is off and no scratch workspace remains.

---

## Pass 13 checkpoint — workspace rename, ordering, reload, and cleanup

Two empty workspaces were created to cover the remaining workspace-menu lifecycle paths. Renaming `Order A` to `Order Alpha` by editing and blurring the inline field worked and survived a full reload. The source-defined drag reorder was attempted from `Order B` onto `Order A`, but the low-level browser drag did not produce an HTML drag/drop event or order change; as with modifier-preserving marquee and tiny port delivery, this is **inconclusive and not a product finding**.

Both temporary workspaces were deleted through the confirmation flow, followed by a full reload. The menu again contains only `My Workspace 5` and `New workspace`; the original board remains untouched.

---

## Pass 14 checkpoint — minimap and camera view history

- Minimap Collapse changed the surface to one named `Open minimap` control; reopening restored the board map and its descriptive image label. This path passed.
- A minimap click inside the current all-content viewport produced no meaningful camera delta, so click/drag navigation was not overclaimed as certified.
- Zooming from 100% to 125% correctly enabled Previous View. Previous restored 100% and enabled Next View; Next restored 125%. The disabled/enabled button states tracked the history stack correctly. The advertised `Alt+Left` / `Alt+Right` shortcuts independently reproduced the same `125% → 100% → 125%` sequence.
- With no selection, Frame Board centered the five-widget board at 129%; the camera was returned to 100% afterward. The selected/large-board framing defects remain separately recorded in `GP-008` and `GP-012`.

---

## Pass 15 checkpoint — production phase gate

`npm run check:full` passed on the exact audited source state: production TypeScript/Vite build, lint, all **46 test files / 571 tests**, documentation guidance, and Supabase migration/database-test syntax.

The production build emitted Vite's large-chunk warning. The largest reported outputs were a ~6.03 MB WebLLM worker and a ~6.04 MB library chunk (~2.17 MB gzip). Static inspection of the built `index.html` shows neither is directly referenced on the cold-start path: its directly referenced JS/CSS assets total roughly **410 KB raw / 101 KB gzip**. The large outputs therefore remain a deferred-load/memory follow-up, not a defect; a real network coverage trace is still needed to verify when they load.

---

## Pass 16 checkpoint — granular domain-pack visibility

Software Engineering's per-widget chooser exposed named switch semantics for the full pack. Turning only `Loop` off removed it from Widget Library search while `Queue` remained discoverable, proving the preference is granular rather than all-or-nothing. `Loop` was restored to checked, the Software Engineering pack was disabled again, and the picker returned to the 25-widget core state. This path passed.

---

## Pass 17 checkpoint — local-snapshot restore safety

The Account menu's latest-snapshot restore confirmation was opened and safely cancelled. Unlike the adjacent import/backup confirmation, it does not disclose that every workspace/canvas/widget will be replaced or state how the current board can be recovered. A direct handler/store trace found that this path calls `loadBoard`, which clears Undo/Redo history and does not create a pre-restore history checkpoint (`GP-038`). The destructive restore itself was intentionally not executed against the user's clean board.

### GP-038 — Snapshot restore replaces the whole board and clears history without warning or rollback

- **Severity:** High
- **Category:** resilience / copy / data integrity
- **Where:** Account menu → `Restore [time] snapshot` → confirmation dialog
- **Steps to reproduce:** Open the Account menu on a board with work newer than the latest local snapshot, choose Restore snapshot, and inspect the confirmation. For a disposable board, confirm and inspect Undo/Redo afterward.
- **Expected:** State plainly that every current workspace, canvas, widget, group, and connection will be replaced; create and name a protected pre-restore recovery snapshot; explain the rollback path before confirmation.
- **Actual:** The dialog says only `Return the board to its state from [timestamp]`. The confirm handler directly loads the older board. The canonical `loadBoard` implementation begins with `history.clear()` and sets both `canUndo` and `canRedo` false; this handler does not first capture the current board or promise any alternate recovery. Rolling snapshots are written at most once per ten minutes after ordinary saves, so recent current work is not guaranteed to have any snapshot at all.
- **Why it harms flow:** A user seeking recovery can destroy all work created after the snapshot with one under-explained confirmation, then discover that the normal Undo safety net has been deliberately erased.
- **Evidence:** [`90-snapshot-restore-underwarns.png`](beta-test-evidence/90-snapshot-restore-underwarns.png). Direct source trace: AccountChip's snapshot handler calls `loadBoard(board)`; `useWidgetStore.loadBoard` clears history. Persistence only calls `saveRollingSnapshot` when at least ten minutes have elapsed since the last one. The adjacent file-import dialog demonstrates the missing standard by explicitly describing full replacement and automatic snapshot retention.
- **Hypothesis:** **Confirmed mechanism:** snapshot restore reuses the hydration path, whose correct startup/import behavior is to reset history, but adds no restore-specific preflight transaction or recovery checkpoint.
- **Suggested direction:** Match the import dialog's scope language, automatically preserve the entire current board before replacement, surface that recovery point by name/time, and offer transaction-bound rollback after restore.
- **Reproduction:** Confirmation copy reproduced 1/1. Destructive execution was not performed on the user's board; replacement/history behavior is deterministic from the sole live handler and store implementation, so that portion is explicitly source-backed reasoned analysis.

---

## Final audit closure

The requested four-hour audit budget was completed. The final idle-monitoring interval produced no browser warnings/errors, spontaneous dialogs, or state drift. The last clean-state inspection shows only the original `My Workspace` with five seeded widgets, blank AI prompt, 100% zoom, dark theme, Circuit mode off, 25 core picker entries, disabled Undo/Redo, and no scratch workspace. The newest local recovery snapshot was refreshed from this clean state. Visual evidence: [`91-final-clean-board.png`](beta-test-evidence/91-final-clean-board.png) and [`92-final-idle-clean-board.png`](beta-test-evidence/92-final-idle-clean-board.png).

Final verification passed: `npm run check:full` (production build, lint, 46 test files / 571 tests, docs, and database syntax), a second documentation check, all 36 active finding records contain every requested field, and every linked evidence file exists. No product source file was changed by this audit.
