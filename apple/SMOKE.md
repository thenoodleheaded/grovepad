# Native smoke checklist (phase 5 gate)

Every line of [docs/manual-smoke-checklist.md](../docs/manual-smoke-checklist.md)
mapped to the Swift surface that owns it and to the test that judges it. A
test is the gate wherever one can exist; a line marked **manual** must be
walked on a real iPhone, a real iPad and a Mac before phase 5 is called done.
"Not in this build" names lines the roadmap puts outside the first native
release (Quick Add) or the web view (pinch-to-zoom the page,
web fonts) — they have nothing to test here and are listed so nobody assumes
coverage that is not there.

Run the automated half from `apple/`:

```
swift test --filter GrovepadChromeTests
```

## Checklist mapping

| # | Checklist line (short) | Native surface | Test | On a device |
|---|---|---|---|---|
| 1 | Create a widget from the add-widget surface; default size and content | `AddWidgetSheet` / `AddWidgetModel` → `BoardDocument.createWidget` | `SurfacesAddWidgetTests.testChoosingCreatesThroughTheDocumentAtASnappedPoint` (registry default size, selected, handed to rename); `WidgetGateTests` (default data) | manual: confirm the new card looks right on each screen |
| 2 | Drag; sides and corners thicken; cursor matches the axis | canvas host (phase 2, `GrovepadCanvas/Selection`) | `DragResizeTests` (edge law) | **manual**: outline and cursor are drawn by the app target's host |
| 3 | Resize from a side/corner; opposite side pinned; band past a limit snaps back | canvas host | `DragResizeTests` (clamps, pinned opposite edge) | **manual**: the elastic band |
| 4 | Crush a tile to an icon; an icon is a fixed 2×2 — its edge shows no resize cursor and dragging it does nothing | canvas host + `BoardDocument.setIconified` | `DragResizeTests` (an icon never resizes), `WidgetGateTests` (icon floor) | **manual**: crush feel |
| 5 | Hover lean stays put when a resize starts | live-card host | none | **manual** (Mac and iPad pointer) |
| 6 | Open a tile, drag one side out, close: only that side moved; tile lands where it opened | `BoardDocument` rest state (`expandedWidgetId`) | `WidgetGateTests` (open/close geometry) | **manual** |
| 7 | Icon inside a glued group opens over neighbours; Escape closes; Undo reverses the earlier edit; Pin makes space in one undo step | `BoardDocument.setPinned` | `BoardDocumentTests` / `WidgetGateTests` (pin commits the peek, one undo step) | **manual**; note: "the group makes space" is glue folding, deferred with the layout engine (`AGENTS.md` deferred list) |
| 8 | Phone: tap once grows in place, twice takes the screen; chevron / pull-down folds back; double-tap an icon stays an icon; laptop click / double-click do the same | tap vocabulary (`TapVocabulary`) + the card takeover sheet (canvas host) | `SurfacesChromeAdaptationTests.testTapVocabularyThresholdsAndClassification` (tap / double tap / moved, the one copy of the thresholds) | **manual**: the takeover sheet and the pull-down live in the app target's card host; Escape has a visible chevron beside it |
| 9 | Phone: dock shows Navigate, Select, Undo, Redo and overlaps nothing; Select more → "2 selected"; Glue then Undo undoes only the weld; ⋯ Shape a tree | `CanvasModeDockView`, `SelectionActionBarView`, toolbar overflow `Menu` | `SurfacesToolbarTests.testModesAndCircuitToggleAgree` (dock rows and visibility), `SurfacesSelectionBarTests` (Select more is touch-only, Glue is one undo step), `SurfacesRenderSmokeTests` (dock renders at 390 pt) | **manual**: overlap on a real phone. "Shape a tree" (the ghost shaper) is not in this build |
| 10 | iPhone: pinch outside the board scales nothing; pinch on the board zooms the camera; double-tap a card opens it without page zoom; keyboard does not lurch; no loupe on labels | native views — there is no web page to scale | `GestureEngineTests`, `PinchZoomAnchorTests` (camera pinch) | **manual** for the keyboard rise and the loupe (text fields keep their selection UI by design) |
| 11 | iPhone long-press a card: ONE menu, the system action sheet; Delete red; dismiss changes nothing; Duplicate duplicates once; iPad anchors the sheet near the card | `ContextMenuModel` + `NativeActionSheetPresenter` (iOS) / `.widgetContextMenu` (Mac) | `SurfacesContextMenuTests` (rows per state, Delete is the only red item, `row(atSheetIndex: nil)` is nothing, Duplicate runs once per row) | **manual**: one sheet only, the iPad anchor rect, no crash |
| 12 | Export from Settings and the account menu opens the share sheet; save to Files; iPad popover; says "shared" | not in this build (share-sheet export is roadmap phase 7) | none | deferred — record in the phase-7 handoff |
| 13 | Cold launch: straight to the dark ground, no white flash | app target launch screen | none | **manual** |
| 14 | Airplane mode: every label in Clash Display from first paint | native text uses the bundled/system face (`GlassType`); no web font to fetch | none | not applicable to the native build |
| 15 | Phone widget library: two-up grid of blocks, drawn face, star reachable on every block, no row clipped | `AddWidgetSheet` (tile mode under `isPhone`) | `SurfacesRenderSmokeTests.testEverySurfaceRendersAtPhoneAndDesktopWidth` (390 pt render); the star is a `.touchTarget()` button on every block, never hover-revealed | **manual**: clipping at 360 pt; note the face is the family glyph in the widget's accent, not the web's drawn miniature |
| 16 | Connect compatible ports; value propagates | phase 4 circuit UI | `CircuitStepForStepTests`, `CircuitLinkingControllerTests` | manual on device (tap-tap path) |
| 17 | Dependency and relation: distinct visuals, routing, selection, deletion | edge layer (phase 2) + selection bar entry points | `EdgeRouteTests`, `CanvasHostTests`; `SurfacesSelectionBarTests.testRunMutatesTheDocumentWithUndo` (Connect → parent link, Add dependency → blocker link as `ChromeState.pendingLink`) | **manual**: the second tap that completes the link is the canvas host's |
| 18 | Pan and zoom including far-zoom proxy; widgets and lines aligned | camera + residency (phase 2) | `CameraEngineTests`, `ResidencyPlannerTests`, `SyntheticBoardBenchmarkTests` | **manual** on the oldest device (120 Hz target still unmeasured) |
| 19 | Undo/redo creation, movement, resizing, connections; selection and history intact | `BoardDocument` | `BoardDocumentTests`, `WidgetGateTests`; `SurfacesSelectionBarTests` (align is one step), `SurfacesLibraryTests` (workspace edits undo), `SurfacesCanvasTabsTests` (undo brings a canvas and its tab back) | — |
| 20 | Relaunch restores active canvas, widgets, connections, relations, glue, camera | `LocalBoardStore` + `DeviceState` + `CanvasTabsModel.deviceState` | `LocalBoardStoreTests`, `DeviceStateConformanceTests`, `SurfacesCanvasTabsTests.testReorderAndRowVisibilityAndDeviceState` | **manual**: the camera park on device |
| 21 | Open a nested canvas and return; breadcrumbs and contents correct | `CanvasToolbarView` breadcrumbs, `CanvasTreeDrawerView`, `CanvasTabsView` | `SurfacesToolbarTests.testBreadcrumbsCollapseDeepPaths`, `SurfacesCanvasTreeTests`, `SurfacesCommandPaletteTests.testNavigationResultsJumpCanvasesAndActionsRun` | — |
| 22 | Quick Add | not in this build (second release) | none | not applicable |
| 23–26 | Collaboration, roles, public link, follow | `GrovepadCollaboration` (session, runtime), `SupabaseCollaborationRepository`, `Chrome/Collaboration` | `CollaborationConformanceTests`, `CollaborationSessionTests` (two editors, offline queue, viewer lock, own-only undo, private canvases, guests, invite consent, follow and cursors), `BoardDocumentCollaborationTests`, `CollaborationViewsRenderTests` | **manual**: needs `Config/Supabase.local.xcconfig` and two signed-in accounts — a Mac and a browser on one shared canvas (live edits both ways, cursors, follow, public link as Viewer, offline edit then reconnect) |
| C1 | Drag-pan, wheel-pan, ctrl/pinch zoom track the pointer exactly | camera (phase 2) | `GestureEngineTests`, `PinchZoomAnchorTests` | **manual** feel check |
| C2 | Marquee selects exactly the enclosed widgets; the camera does not move | selection (phase 2) | `MarqueeRestingFootprintTests` | **manual**: camera stillness |
| C3 | Drag, resize, glue (⌥-drag), undo behave the same on small and large boards; no errors | canvas host, `BoardDocument.addGlue` | `DragResizeTests`, `BoardDocumentTests`, `SyntheticBoardBenchmarkTests` | **manual**; the ⌥-drag glue gesture is not ported — Glue is the selection bar's button (the touch route the web also has) |

## Chrome surfaces with no checklist line

These ship in phase 5 and are judged by their own suites: settings
(`SurfacesSettingsTests`), the command palette (`SurfacesCommandPaletteTests`),
the library (`SurfacesLibraryTests`), the tree drawer (`SurfacesCanvasTreeTests`),
tabs (`SurfacesCanvasTabsTests`), dialogs and toasts
(`SurfacesDialogsAndToastsTests`), quit rules and the shortcut table
(`SurfacesQuitAndShortcutsTests`), the adaptation rules
(`SurfacesChromeAdaptationTests`), and every view's render at phone and
desktop width plus the composed scene at 390 / 800 / 1400 pt
(`SurfacesRenderSmokeTests`).

## What to walk on devices (plain words)

1. **iPhone.** Open the app. The bottom dock shows a hand, an arrow, undo and
   redo. Tap two cards with "Select more" between them: the bar reads
   "2 selected". Tap Glue, then undo in the dock: only the weld comes undone.
   Hold a card: one system sheet, Delete in red; tap outside: nothing changes.
   Open the widget library from the + button: two blocks per row, a star on
   every block, nothing cut off at the right edge. Every panel (library,
   search, settings, shortcuts, the canvas tree) rises from the bottom and can
   be pulled down or closed with its ✕.
2. **iPad.** Same as the phone, plus: the sidebar (library and tree) can be
   hidden and shown; the held-press sheet points at the card; panels open as
   centred dialogs or popovers, not full-height sheets.
3. **Mac.** Right-click a card: a system menu with the same rows. ⌘Z undoes
   an alignment in one step. Close the window while a save is in flight:
   the app asks first (the quit rule). The tab row appears only with two or
   more tabs.

Record any failure in the phase-5 handoff before calling the gate passed.

## Phase 7 device tick-list (OS integration)

The roadmap's phase-7 gate is "each item exercised on a physical device and
ticked here". The build Mac exercised what it can (the package tests below,
`xcodebuild` for macOS and the iOS Simulator with both extensions, a
simulator launch); every line below stays unticked until walked on a real
iPhone, a real iPad and a Mac signed with a real profile (the App Group and
Sign in with Apple entitlements need one — see `App/README.md`). Tick a line
by replacing `[ ]` with `[x]` and the device it was walked on.

Automated half, from `apple/`: `swift test --scratch-path .build/os --filter GrovepadAppTests`
(`IntegrationNoteWidgetTests`, `IntegrationIntentsTests`, `IntegrationSpotlightTests`,
`IntegrationHandoffTests`, `IntegrationQuickLookTests`, `IntegrationMenusAndFeedbackTests`).

| # | Item | Exact device step | Judge on the Mac | Device |
|---|---|---|---|---|
| P7-1 | WidgetKit Note widget | iPhone: hold a Text card → "Show in widget"; go Home → hold the wallpaper → + → Grovepad Note → add small and medium. Type in the card; after a pause the widget shows the new words. Hold the card again → "Remove from widget": the widget shows its empty line. Mac: same from the desktop widget gallery (Edit Widgets). | `IntegrationNoteWidgetTests` (bounds, key order, debounce, skip, flush, the menu row, the extension's constants) | [ ] |
| P7-2 | Siri / Shortcuts: Open Canvas | Shortcuts app → Grovepad → Open Canvas; pick a nested canvas; run: the app opens on it. Say "Open Biology in Grovepad". | `IntegrationIntentsTests.testOpenCanvasMovesTheWindowAndTheDocument`, `…FindCanvasPrefersAnExactName` | [ ] |
| P7-3 | Siri / Shortcuts: Add Note | Shortcuts → Add Note with "Buy milk"; open the app: a Text card "Buy milk" sits under the lowest card of the open canvas; ⌘Z / dock undo removes it in one step. | `IntegrationIntentsTests.testAddNoteMakesATextCardOnTheOpenCanvasAndIsUndoable` | [ ] |
| P7-4 | Siri / Shortcuts: Add Flashcard | Shortcuts → Add Flashcard front "Mitochondria" back "Powerhouse", deck blank: a Study Deck appears (or the open canvas's deck grows). Run again with deck "French": a second deck. | `IntegrationIntentsTests.testAddFlashcardFillsAFreshDecksBlankCardThenAppends` | [ ] |
| P7-5 | Spotlight | Rename a card "Photosynthesis notes"; wait two seconds; search Spotlight (Mac ⌘Space, iPhone pull-down) for "Photosynthesis": the card appears with its kind; choose it: the app opens on that canvas with the card selected. Delete the card; the result disappears. | `IntegrationSpotlightTests` (builder, diffing indexer, removal, continuation) | [ ] |
| P7-6 | Handoff | Same iCloud account on iPhone and Mac, Handoff on. Open a nested canvas on the iPhone; on the Mac the Grovepad Handoff icon appears in the Dock; click it: the Mac window lands on that canvas with the same camera. And back. | `IntegrationHandoffTests` (payload round trip, advertise, continue, refuse unknown) | [ ] |
| P7-7 | Files: Open With | Export a `.grovepad` to Files / Finder. iPhone: Files → tap the file → it opens Grovepad with the "Add as a new workspace / Replace" question. Mac: double-click, or right-click → Open With → Grovepad. | `AppCoordinatorTests` (the import flow), `PackageConformanceTests` | [ ] |
| P7-8 | Files: Save As / Export | Mac: File ▸ Save As… and File ▸ Export as .grovepad… both open the save panel with `Grovepad — <workspace> <date>.grovepad`; iPhone/iPad: Settings ▸ Data ▸ Export opens the share sheet (says "shared"). | `AppServicesTests` (file name), `ShareExport` | [ ] |
| P7-9 | Quick Look | Select the exported file in Finder and press Space (iPhone: long-press → Quick Look): a summary with the file name, "N workspaces · N canvases · N cards", each workspace's counts and each canvas's first card titles. A non-package renamed `.grovepad` shows "could not be read". | `IntegrationQuickLookTests` (`PackageSummary`) | [ ] |
| P7-10 | Mac menu bar | Walk File (New Window, Add Widget…, Open…, Import into Workspace…, Save As…, Export…, Share…), Edit (Undo/Redo, the system Cut/Copy/Paste/Delete/Select All in a text field, Duplicate ⌘D, Lock ⌘L, Delete Selected Cards ⌘⌫, Select All Cards ⇧⌘A), View (Fit ⇧⌘F, Zoom ⌘= ⌘−, Actual Size ⌘0, Circuit Mode ⇧⌘W, Show Sidebar ⌃⌘S, Show Canvas Tree ⌥⌘T, Back/Forward, tab ⌥⌘←/→, Close Tab ⌥⌘W, Search ⌘K, Settings), Window (Minimize, Zoom, Show Tab Bar, Merge All Windows), Help (Keyboard Shortcuts ⌘/, Grovepad Help). Every enabled item does what it says; nothing is greyed with a window open and a card selected. | `IntegrationMenusAndFeedbackTests.testMenuTableHasEveryMenuUniqueShortcutsAndKnownOverlayRows` | [ ] |
| P7-11 | Mac multiple windows + tabs | File ▸ New Window twice; edit in one, the others show the edit; each window keeps its own camera and canvas; Window ▸ Merge All Windows makes tabs; the tab bar's + makes another. | `AppCoordinatorTests` (sessions share the document, cameras park per window) | [ ] |
| P7-12 | Mac window restoration / Stage Manager | Quit with two windows on two canvases at two zooms; relaunch: both windows return at their frames, canvases and cameras. Stage Manager: drag a window into a stage and back; nothing is lost. | `IntegrationHandoffTests` (the restoration activity is the Handoff one) | [ ] |
| P7-13 | iPad multi-window | Drag the app icon from the Dock beside the running app (or Stage Manager +): a second Grovepad scene with its own canvas and camera; edits show in both; close one; relaunch after swiping the app away: each scene returns to its canvas. | `IntegrationHandoffTests` (per-scene activity payload) | [ ] |
| P7-14 | iPad Scribble | Apple Pencil: write into a Text card with the Pencil directly; the words appear; scratch out a word to delete it. | `IntegrationMenusAndFeedbackTests.testTheTextKitEditorIsARealSystemTextInput` (Mac half: NSTextView, editable, text-area role; the iOS half is a UITextView / `UITextInput`) | [ ] |
| P7-15 | Share sheet | iPhone: Settings ▸ Data ▸ Export → the share sheet with AirDrop / Save to Files; iPad: anchored popover; Mac: File ▸ Share… → the sharing picker. | `AppServicesTests`, `ShareExport` | [ ] |
| P7-16 | Taptic feedback | iPhone, sound off: connect two ports (tap-tap) → one tick; delete a card → one tick; the ⚡ toggle → a lighter tick; hold a card → a tick with the sheet; hold empty canvas → a tick with the library. | `IntegrationMenusAndFeedbackTests.testHapticsTickOnDeleteConnectAndCircuitToggle` | [ ] |
| P7-17 | System context menus | iPhone: hold a card → one action sheet with "Show in widget" on Text cards, Delete red; iPad trackpad: secondary click → `UIMenu` with the same rows; Mac: right-click → `NSMenu` with the same rows. | `SurfacesContextMenuTests`, `MacCanvasHostTests.testContextMenuBecomesAnNSMenuWithTheModelsRows`, `IntegrationNoteWidgetTests` (the row) | [ ] |

Recorded, not built (phase 7): Pencil hover and pressure wait for the sketch
surfaces (no Sketchpad in the first build); Cut / Copy / Paste of cards
(no clipboard seam — the Edit menu's rows are the system's, for text);
the `.grovepad` "open as a Canvas card" placement (layout engine).
