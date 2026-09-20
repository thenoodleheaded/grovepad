#if canImport(QuartzCore)
import Foundation
import Observation
import QuartzCore
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome

// ---------------------------------------------------------------------------
// The platform-neutral half of the canvas host, shared by the AppKit and
// UIKit views: it owns the gesture engine, the Core Animation controller,
// the live-card host, the circuit overlay coordinator and the linking
// controller, translates already-translated pointer events into document
// actions (press on a tile opens it, press on empty canvas closes and
// deselects, press on a wire opens the inspector, a title-strip drag moves
// cards), coalesces observation into one sync per turn, and hands the
// platform view what only it can do (rails, popovers, redraws, the marquee
// box, cursors) through closures.
//
// Everything mutates the board through `BoardDocument`; nothing here
// bypasses undo or the circuit driver. Moved from the preview shell.
// ---------------------------------------------------------------------------

/// What a press landed on, decided once at pointer-down.
public enum PressTarget: Equatable, Sendable {
    case empty
    case card(String)
    case wire(String)
    /// A relation or dependency line (a `Relation` id).
    case line(String)
}

@MainActor
public final class CanvasInteraction {
    public let session: WindowSession
    public let gesture: GestureEngine
    public let controller: CanvasHostController
    public let bitmaps: WidgetBitmapProvider
    public let liveHost: WidgetLiveCardHost
    public let coordinator: CircuitOverlayCoordinator
    public let linking: LinkingController
    /// A finger or Pencil drives this host (card contexts wear touch chrome).
    public let isTouch: Bool

    // Platform hooks.
    /// After every sync: rails, popovers, redraws.
    public var onSync: (() -> Void)?
    /// Every camera commit: move the live-card container.
    public var onCameraFrame: ((CameraFrame) -> Void)?
    /// The marquee / zoom-region box in viewport points, nil to hide.
    public var onMarquee: ((WorldRect?) -> Void)?
    public var onCursor: ((CanvasCursor) -> Void)?
    /// A still finger on empty canvas: the web opens the widget library there.
    public var onLongPress: ((Vector2D) -> Void)?
    /// A held press or secondary click on a card: the platform shows the menu.
    public var onContextMenu: ((ContextMenuRequest) -> Void)?
    /// A press on a relation or dependency line: the platform shows its menu
    /// at this viewport point.
    public var onLineMenu: ((RelationLineMenuModel, Vector2D) -> Void)?
    /// The pointer is over (or dragging) a card's resize band; nil when not.
    public var onResizeCursor: ((ResizeEdge?) -> Void)?

    public var document: BoardDocument { session.document }
    public var camera: CameraEngine { session.camera }
    public var chrome: ChromeState { session.environment.chrome }

    /// Whether the canvas is painted in the dark theme right now.
    public private(set) var isDark = true

    /// `--gp-surface-canvas` and `--gp-grid-fine` for each theme. The board's
    /// ground on dark is the app's near-black; on light it is the web's paper.
    public static func canvasGround(dark: Bool) -> CGColor {
        dark ? CGColor(srgbRed: 0.031, green: 0.039, blue: 0.035, alpha: 1) : CGColor(srgbRed: 244 / 255, green: 245 / 255, blue: 246 / 255, alpha: 1)
    }

    public static func gridLines(dark: Bool) -> CGColor {
        dark ? GridLayer.defaultLineColor : CGColor(srgbRed: 92 / 255, green: 98 / 255, blue: 104 / 255, alpha: 0.22)
    }

    /// The host's effective appearance changed (the user's theme choice or
    /// the system's): repaint the grid and every resting tile once. Live
    /// cards are SwiftUI and follow the window on their own.
    public func applyAppearance(dark: Bool) {
        guard dark != isDark || bitmaps.colorScheme != (dark ? .dark : .light) else { return }
        isDark = dark
        bitmaps.colorScheme = dark ? .dark : .light
        controller.hostLayer.gridLayer.lineColor = CanvasInteraction.gridLines(dark: dark)
        controller.hostLayer.auraLayer.isDark = dark
        controller.hostLayer.auraLayer.ground = CanvasInteraction.canvasGround(dark: dark)
        controller.hostLayer.setCardShadows(dark: dark, lifted: document.hoverWidgetId)
        controller.hostLayer.setGlueLines(controller.hostLayer.glueLines, dark: dark)
        controller.refreshRestingBitmaps()
    }

    /// Tile sizes and the active canvas's cards, remembered per board
    /// revision: a mouse move asks for both several times over.
    private let tileCache = RestingTileCache()
    /// Tile measurements made so far (test seam).
    public var tileMeasurements: Int { tileCache.measurements }
    private var activeWidgetsMemo: (version: UInt64, canvasId: String, widgets: [Widget])?

    /// The expansion offset frozen when the expanded card opened (web:
    /// `expansionOffsetFor`, captured once and never re-derived).
    private var expandedId: String?
    private var expandedOffset: Vector2D?
    private var pressedTile: (id: String, point: Vector2D)?
    private var tileMoved = false
    private var titleDrag: (ids: [String], last: Vector2D, moved: Bool, glue: Bool)?
    /// The card under the press of the current drag (`activeDragWidgetId`).
    private var dragGrabbedId: String?
    /// What an outline drag is working on: a full card's size, a resting
    /// tile being crushed toward an icon, or an icon's square.
    public enum ResizeKind: Equatable, Sendable { case card, rest }
    private var resize: (id: String, edge: ResizeEdge, startSize: Size, startPoint: Vector2D, began: Bool, kind: ResizeKind, startBox: WorldRect)?
    private var armedResizeEdge: ResizeEdge?
    /// A scale drag that has already changed the widget's state: terminal, like
    /// the web's (`commitScaleState`), so the rest of the drag does nothing.
    private var resizeCommitted = false
    private var syncScheduled = false
    private var observing = false
    private var observingHover = false
    private var unsubscribeFrame: (() -> Void)?
    private var stopCoordinator: (() -> Void)?
    private var started = false
    private let reducedMotion: () -> Bool

    public init(session: WindowSession, liveHost: WidgetLiveCardHost, screenScale: CGFloat, isTouch: Bool, timeouts: TimeoutScheduler = DispatchTimeoutScheduler(), reducedMotion: @escaping () -> Bool = { false }) {
        self.session = session
        self.isTouch = isTouch
        self.reducedMotion = reducedMotion
        let document = session.document
        let camera = session.camera
        gesture = GestureEngine(camera: camera, timeouts: timeouts)
        controller = CanvasHostController(camera: camera, restContext: WidgetRestContextFactory.make(), screenScale: screenScale)
        bitmaps = WidgetBitmapProvider(canvasName: { [weak document] id in document?.canvasName(id) })
        self.liveHost = liveHost
        let placeholder: () -> RestContext = { [weak document] in WidgetRestContextFactory.make(expandedWidgetId: document?.expandedWidgetId) }
        coordinator = CircuitOverlayCoordinator(document: document, edgeLayer: controller.hostLayer.edgeLayer, restContext: placeholder, reducedMotion: reducedMotion)
        linking = LinkingController(document: document, restContext: placeholder)

        liveHost.makeContext = { [weak document] widget in
            // Open cards are few (the one open, the selected), so every one
            // wears real Liquid Glass; resting tiles are pictures and use
            // the frosted tile instead.
            // A peeked icon is shown as the card it opens into (`expandFromIcon`):
            // the record stays an icon, the view is the full card.
            var shown = widget
            if widget.iconified == true, document?.expandedWidgetId == widget.id {
                shown.size = WidgetRestContextFactory.make(expandedWidgetId: widget.id).expandedIconSize(widget)
                shown.iconified = nil
            }
            guard let document, var context = document.cardContext(for: shown, isTouch: isTouch, glassAllowed: true) else { return nil }
            let id = widget.id
            context.actions = WidgetCardActions(
                isSelected: document.isSelected(id),
                widgetType: widget.type,
                // `openFullscreen`: the full-screen sheet, grown out of the
                // card's box.
                expand: { [weak self] in self?.openFullscreen(id) },
                togglePinned: { [weak document] in
                    guard let document, let widget = document.widget(id) else { return }
                    document.setPinned(id, !widget.metadata.pinned)
                },
                toggleFavorite: { [weak document] in document?.toggleFavorite(id) },
                delete: { [weak session] in session?.environment.deletion.request([id]) },
                isCompleted: widget.metadata.completed,
                toggleCompleted: { [weak document] in document?.toggleCompleted(id) },
                isRenaming: session.environment.chrome.renamingWidgetId == id,
                finishRename: { [weak session] title in
                    guard let session else { return }
                    if session.environment.chrome.renamingWidgetId == id { session.environment.chrome.renamingWidgetId = nil }
                    if let title { session.document.renameWidget(id, title: title) }
                }
            )
            return context
        }
        bitmaps.revision = { [weak document] in document?.widgetsVersion ?? 0 }
        liveHost.onFittedHeight = { [weak self] id, fitted in self?.fitCard(id, fitted: fitted) }
        liveHost.isGestureActive = { [weak self] in
            guard let self else { return false }
            return self.isResizing || self.isCardDragging
        }
        controller.bitmapProvider = bitmaps
        controller.liveHost = liveHost
        controller.accentColor = CardAccent.accent(for:)
        coordinator.restContext = { [weak self] in self?.restContext() ?? .none }
        linking.restContext = { [weak self] in self?.restContext() ?? .none }
        gesture.delegate = self
        gesture.marqueeHitTest = { [weak self] rect in
            guard let self else { return [] }
            let context = self.restContext()
            return marqueeBoxedIds(in: rect, widgets: self.activeWidgets, canvasId: self.document.activeCanvasId, footprint: context.restingFootprint)
        }
        session.bridge.fitAllHandler = { [weak self] in self?.fitAll() }
    }

    // MARK: - Lifecycle

    public func start() {
        guard !started else { return }
        started = true
        unsubscribeFrame = camera.onFrame { [weak self] frame in self?.cameraDidCommit(frame) }
        stopCoordinator = coordinator.start()
        observe()
        observeHover()
        sync()
    }

    public func stop() {
        guard started else { return }
        started = false
        unsubscribeFrame?()
        unsubscribeFrame = nil
        stopCoordinator?()
        stopCoordinator = nil
    }

    /// The host has a size; the camera follows the viewport and the parked view.
    public func viewportDidChange(_ size: Size) {
        camera.setViewportSize(size)
        controller.viewportSizeDidChange()
        if size.width > 0, size.height > 0 { session.noteViewportReady() }
        onCameraFrame?(camera.frame)
    }

    // MARK: - Geometry

    public func restContext() -> RestContext {
        WidgetRestContextFactory.make(expandedWidgetId: document.expandedWidgetId, expandedOffset: expandedOffset, cache: tileCache, version: document.widgetsVersion)
    }

    /// The same, with nothing expanded: the board at rest.
    func idleRestContext() -> RestContext {
        WidgetRestContextFactory.make(cache: tileCache, version: document.widgetsVersion)
    }

    public func toWorld(_ point: Vector2D) -> Vector2D {
        CanvasGeometry.screenToWorld(point, transform: camera.frame.transform)
    }

    public func toScreen(_ world: Vector2D) -> Vector2D {
        CanvasGeometry.worldToScreen(world, transform: camera.frame.transform)
    }

    public var activeWidgets: [Widget] {
        let version = document.widgetsVersion
        let canvasId = document.activeCanvasId
        if let memo = activeWidgetsMemo, memo.version == version, memo.canvasId == canvasId { return memo.widgets }
        let widgets = document.board.widgets(on: canvasId)
        activeWidgetsMemo = (version, canvasId, widgets)
        return widgets
    }

    /// The topmost card whose displayed box contains `world` (board order,
    /// later cards on top).
    public func widgetId(atWorld world: Vector2D) -> String? {
        let context = restContext()
        for widget in activeWidgets.reversed() where displayedWidgetRect(widget, restContext: context).contains(world) {
            return widget.id
        }
        return nil
    }

    /// The live card whose title strip (the cell above its box) holds `world`.
    public func titleStripWidgetId(atWorld world: Vector2D) -> String? {
        let context = restContext()
        // A card being renamed gives its strip to the name field.
        for id in controller.liveCardIds where id != chrome.renamingWidgetId {
            guard let widget = document.widget(id), widget.canvasId == document.activeCanvasId,
                  let definition = WidgetRegistry.definition(for: widget.type), definition.titleChrome, widget.iconified != true else { continue }
            let box = displayedWidgetRect(widget, restContext: context)
            // The icon cell at the leading end is the skin button, the
            // trailing span the actions: the move handle is what lies between.
            let lead = Double(WidgetTitleRow.iconCellWidth)
            let handle = max(0, box.width - Double(WidgetTitleRow.actionsWidth(for: widget.type)) - lead)
            let strip = WorldRect(x: box.x + lead, y: box.y - widgetTitleRowHeight, width: handle, height: widgetTitleRowHeight)
            if strip.contains(world) { return id }
        }
        return nil
    }

    /// The world point at the middle of the viewport.
    public var viewportCentreWorld: Vector2D {
        toWorld(Vector2D(x: camera.viewportSize.width / 2, y: camera.viewportSize.height / 2))
    }

    /// What a press at `world` would land on.
    public func pressTarget(atWorld world: Vector2D) -> PressTarget {
        if !gesture.isSpacePressed, !gesture.isZPressed {
            if let edgeId = controller.hostLayer.edgeLayer.hitTest(world: world) ?? coordinator.chip(at: world)?.connectionId {
                return document.board.relations.contains(edgeId) ? .line(edgeId) : .wire(edgeId)
            }
            if let id = widgetId(atWorld: world) { return .card(id) }
        }
        return .empty
    }

    // MARK: - Camera frames

    /// The zoom the circuit overlay (ghost wire, chips) was last laid out at.
    private var lastOverlayZoom: Double?

    private func cameraDidCommit(_ frame: CameraFrame) {
        onCameraFrame?(frame)
        // A zoom only restyles the edges (their widths are screen points).
        // It used to schedule a whole board sync per frame as well, which
        // re-read every card while pinching.
        if lastOverlayZoom != frame.zoom {
            lastOverlayZoom = frame.zoom
            coordinator.refresh()
        }
    }

    // MARK: - Observation and sync

    /// Selection, hover, expansion, circuit UI, the interaction mode and the
    /// board itself all land here; the sync is coalesced to one per turn.
    private func observe() {
        guard !observing else { return }
        observing = true
        withObservationTracking { [document, chrome] in
            _ = document.board
            _ = document.selection
            _ = document.activeCanvasId
            _ = document.expandedWidgetId
            _ = document.circuitUI
            _ = document.glueIntent
            _ = document.unglueIntentWidgetId
            _ = chrome.interactionMode
            _ = chrome.renamingWidgetId
            _ = session.environment.settings.preferences
        } onChange: { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.observing = false
                // The app this window belonged to is gone: nothing to draw.
                guard self.session.isAttached else { return }
                self.sync()
                self.observe()
            }
        }
    }

    /// Hover is the one state that changes constantly and changes nothing on
    /// the board: it lights the card under the pointer and that is all. It
    /// used to run the whole board sync on every card the pointer crossed.
    private func observeHover() {
        guard !observingHover else { return }
        observingHover = true
        withObservationTracking { [document] in
            _ = document.hoverWidgetId
        } onChange: { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.observingHover = false
                guard self.session.isAttached else { return }
                self.syncHover()
                self.observeHover()
            }
        }
    }

    private func syncHover() {
        let hover = document.hoverWidgetId
        // A card that never rests and is not mounted yet needs the planner
        // (hover makes it urgent); everything else only needs the light.
        if let hover, let widget = document.widget(hover), !restContext().isResting(widget), !controller.liveCardIds.contains(hover) {
            sync()
            return
        }
        controller.setHover(hover)
        onSync?()
    }

    public func scheduleSync() {
        guard !syncScheduled else { return }
        syncScheduled = true
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.syncScheduled = false
            guard self.session.isAttached else { return }
            self.sync()
        }
    }

    private func reconcileExpanded() {
        guard document.expandedWidgetId != expandedId else { return }
        expandedId = document.expandedWidgetId
        expandedOffset = nil
        guard let id = expandedId, let widget = document.widget(id) else { return }
        expandedOffset = openingOffset(widget)
    }

    /// The card opens out of the middle of its tile, then takes the nearest
    /// grid line: an open card sits on the grid like everything else on the
    /// board (the web leaves it on the half cell).
    private func openingOffset(_ widget: Widget) -> Vector2D {
        let idle = idleRestContext()
        let tile = widget.iconified == true ? widget.size : idle.restingTileSize(widget)
        let full = idle.expandedIconSize(widget)
        return Vector2D(
            x: CanvasGeometry.snapToGrid((tile.width - full.width) / 2),
            y: CanvasGeometry.snapToGrid((tile.height - full.height) / 2)
        )
    }

    /// A press on a resting tile builds its open card out of sight at once,
    /// so the release only has to show it: the first SwiftUI layout of a
    /// card is the whole cost of opening one, and the press covers it.
    private func prewarmOpen(_ id: String) {
        guard chrome.pendingLink == nil, document.expandedWidgetId != id, !document.isInFoldedCluster(id),
              let widget = document.widget(id) else { return }
        let idle = idleRestContext()
        guard idle.isResting(widget), idle.isRestEligible(widget) || idle.iconPeeksOpen(widget) else { return }
        let opened = WidgetRestContextFactory.make(expandedWidgetId: id, expandedOffset: openingOffset(widget), cache: tileCache, version: document.widgetsVersion)
        let tile = controller.hostLayer.cardLayers[id].map { WorldRect(x: $0.position.x, y: $0.position.y, width: $0.bounds.width, height: $0.bounds.height) }
        liveHost.prewarm(widget, frame: displayedWidgetRect(widget, restContext: opened), tile: controller.animatesOpenClose ? tile : nil)
    }

    /// An open card's body asked for a height (`useContentFloor`). A pointer
    /// gesture owns the size while it runs; `refitOpenCards` asks again after.
    private func fitCard(_ id: String, fitted: Double) {
        // The report arrives a turn late: the window may have closed since.
        guard session.isAttached, !isResizing, !isCardDragging else { return }
        document.fitWidgetHeight(id, fitted: fitted)
    }

    private func refitOpenCards() {
        for (id, fitted) in liveHost.fittedHeights { fitCard(id, fitted: fitted) }
    }

    public func sync() {
        // A rename asked for on a resting tile opens the card first: the name
        // is edited in the open card's title row.
        if let id = chrome.renamingWidgetId, let widget = document.widget(id) {
            if widget.canvasId != document.activeCanvasId { chrome.renamingWidgetId = nil }
            else if restContext().isResting(widget) { expand(id) }
        }
        reconcileExpanded()
        // All three modes pass through. Connect mode is not navigate: a press
        // on empty canvas there belongs to the wire being drawn, so the engine
        // must see `.connect` and resolve the intent to none rather than pan.
        switch chrome.interactionMode {
        case .navigate: gesture.interactionMode = .navigate
        case .select: gesture.interactionMode = .select
        case .connect: gesture.interactionMode = .connect
        }
        controller.restContext = restContext()
        controller.hostLayer.reducedMotion = reducedMotion()
        // A card opening or closing: the lines to it and its glow glide on
        // the card's own curve rather than jumping to the new size.
        let transition = openCloseTransition()
        controller.hostLayer.edgeLayer.transition = transition
        defer { controller.hostLayer.edgeLayer.transition = nil }
        coordinator.refresh()
        var editing: Set<String> = []
        if let expanded = document.expandedWidgetId { editing.insert(expanded) }
        var input = CanvasHostInput(
            widgets: activeWidgets,
            edges: coordinator.edgeDescriptors,
            selection: Set(document.selection),
            hover: document.hoverWidgetId,
            editing: editing,
            gridIntensity: document.canvas(document.activeCanvasId)?.gridIntensity ?? 100
        ).withInsets(GlueGeometry.renderInsets(glues: document.board.glues, widgets: document.board.widgets, canvasId: document.activeCanvasId))
        input.transition = transition
        controller.apply(input)
        syncAura()
        controller.hostLayer.setGlueLines(glueFrames.flatMap(\.boundaryLines), dark: isDark)
        paintGlueIntent()
        onSync?()
    }

    /// Settings ▸ Ambient glow and the visual quality tier drive the aura;
    /// glued members always rank in, as on the web.
    /// The card open at the last sync, to tell an open or close apart.
    private var lastExpandedId: String?

    /// The glide for this sync, when it opens or closes a card (and motion
    /// is allowed): the card's own length and curve (`CardMotion`).
    private func openCloseTransition() -> LayerTransition? {
        let expanded = document.expandedWidgetId
        defer { lastExpandedId = expanded }
        guard expanded != lastExpandedId, controller.animatesOpenClose, !reducedMotion() else { return nil }
        return LayerTransition(duration: CardMotion.openDuration, controlPoints: CardMotion.layoutControlPoints)
    }

    private func syncAura() {
        let aura = controller.hostLayer.auraLayer
        let preferences = session.environment.settings.preferences
        aura.isEnabled = preferences.canvasAura
        switch preferences.visualQuality {
        case .high: aura.budget = .high
        case .balanced: aura.budget = .balanced
        case .low: aura.budget = .low
        }
        aura.gluedIds = Set(document.board.glues.values.flatMap(\.widgetIds))
    }

    // MARK: - Actions

    /// Select a card and open it out of its resting tile (or its icon).
    public func expand(_ id: String, additive: Bool = false) {
        guard let widget = document.widget(id) else { return }
        document.select(id, additive: additive)
        let idle = idleRestContext()
        if idle.isRestEligible(widget) || idle.iconPeeksOpen(widget) {
            // Built on the press and measured: open at the height the body
            // needs rather than growing to it once open.
            if let fitted = liveHost.warmFittedHeight(id) { fitCard(id, fitted: fitted) }
            document.expandedWidgetId = id
        }
    }

    public func collapse() {
        document.expandedWidgetId = nil
    }

    /// Frame every card on the active canvas.
    public func fitAll() {
        let context = restContext()
        camera.fitWidgets(activeWidgets, footprint: { displayedWidgetRect($0, restContext: context) })
    }

    public func deleteSelection() {
        guard !document.selection.isEmpty else { return }
        document.deleteWidgets(document.selection)
    }

    /// A plain press on empty canvas closes what was open.
    public func pressEmptyCanvas(keepSelection: Bool = false) {
        collapse()
        if !keepSelection { document.clearSelection() }
        document.updateCircuitUI { $0.closeInspector() }
        chrome.closeContextMenu()
    }

    /// A tap on a card: completes a pending relation from the selection bar,
    /// else opens the card.
    public func tapCard(_ id: String, additive: Bool = false) {
        // A collapsed group is ONE object: any press on it unfolds the whole
        // group rather than opening the icon under the pointer.
        if chrome.pendingLink == nil, let glue = document.glue(containing: id), glue.collapsed {
            document.setClusterCollapsed(glue.id, false)
            return
        }
        if let link = chrome.pendingLink {
            chrome.pendingLink = nil
            if link.fromId != id, document.widget(link.fromId) != nil {
                _ = document.addRelation(from: link.fromId, to: id, type: link.type)
                return
            }
        }
        expand(id, additive: additive)
    }

    /// Escape: the innermost thing open goes first — the web's ladder in
    /// `CanvasViewport.tsx`: a wire drag, a pending link, the tree shaper
    /// (`ShaperHUD.tsx`), the open card, the selection, and last circuit mode
    /// (back to the navigate tool).
    public func escape() {
        if linking.isDragging { linking.cancelDrag() }
        else if document.circuitUI.pendingDrop != nil { linking.dismissPendingDrop() }
        else if document.circuitUI.inspector != nil { document.updateCircuitUI { $0.closeInspector() } }
        else if chrome.contextMenu != nil { chrome.closeContextMenu() }
        else if chrome.pendingLink != nil { chrome.pendingLink = nil }
        else if chrome.treeShaper.isPickerOpen { chrome.treeShaper.closePicker() }
        else if chrome.treeShaper.isActive { chrome.treeShaper.cancel() }
        else if document.expandedWidgetId != nil { collapse() }
        else if !document.selection.isEmpty { document.clearSelection() }
        else if document.circuitUI.circuitMode { session.environment.toolbar.setMode(.navigate) }
    }

    /// One hardware key, already routed (`CanvasKeyRouting`). Both hosts
    /// land here so the Mac and an iPad keyboard can never disagree.
    public func perform(_ action: CanvasKeyAction) {
        let environment = session.environment
        switch action {
        case .spaceDown(let isRepeat): gesture.keyDown(.space, repeat: isRepeat)
        case .spaceUp: gesture.keyUp(.space)
        case .zDown(let isRepeat): gesture.keyDown(.z, repeat: isRepeat)
        case .zUp: gesture.keyUp(.z)
        // The web asks before deleting (`requestWidgetDeletion`).
        case .deleteSelection:
            if !document.selection.isEmpty { environment.deletion.request(document.selection) }
        case .escape: escape()
        case .toggleCircuitMode: environment.toolbar.toggleCircuitMode()
        case .navigateTool: environment.toolbar.setMode(.navigate)
        case .selectTool: environment.toolbar.setMode(.select)
        case .frameSelectionOrBoard: environment.zoom.frameSelectionOrBoard()
        case .zoomIn: environment.zoom.zoomIn()
        case .zoomOut: environment.zoom.zoomOut()
        case .resetZoom: environment.zoom.resetZoom()
        case .nudge(let dx, let dy):
            // `nudgeSelection`: locked cards stay put; a fine (1 pt) nudge is
            // not snapped back onto the grid.
            let ids = document.selection.filter { document.widget($0)?.metadata.locked == false }
            guard !ids.isEmpty else { return }
            document.nudgeWidgets(ids, by: Vector2D(x: dx, y: dy), snap: abs(dx) + abs(dy) >= CanvasKeyRouting.nudgeStep)
        case .dependencyLink:
            if chrome.pendingLink != nil { chrome.pendingLink = nil }
            else if document.selection.count == 1, let id = document.selection.first { chrome.pendingLink = PendingLink(fromId: id, type: .blocker) }
        case .addWidget: environment.toolbar.openAddWidget()
        case .showShortcuts: chrome.shortcutsOpen = true
        case .rename:
            if document.selection.count == 1, let id = document.selection.first { chrome.renamingWidgetId = id }
        }
    }

    /// A held press or secondary click on a card.
    public func requestContextMenu(_ id: String, screen: Vector2D) {
        // The menu acts on the pressed card, not the cluster its press
        // would otherwise select (`WidgetCard.onContextMenu`).
        document.selectForContextMenu(id)
        chrome.openContextMenu(id, x: screen.x, y: screen.y, in: document)
        if let request = chrome.contextMenu { onContextMenu?(request) }
    }

    // MARK: - Pointer pipeline (viewport points, already translated)

    /// Pointer-down. Decides the target, feeds the engine, and applies the
    /// empty-canvas rule. Returns the target so the platform can react.
    @discardableResult
    public func pointerDown(_ event: PointerEvent) -> PressTarget {
        chrome.activeInput = event.kind == .mouse ? .mouse : (event.kind == .pen ? .pen : .touch)
        let world = toWorld(event.point)
        pressedTile = nil
        tileMoved = false
        let target = pressTarget(atWorld: world)
        if case .line(let relationId) = target {
            if let menu = RelationLineMenuModel(document: document, relationId: relationId) { onLineMenu?(menu, event.point) }
            return target
        }
        if case .wire(let wireId) = target {
            document.updateCircuitUI { $0.openInspector(connectionId: wireId, x: event.point.x, y: event.point.y) }
            return target
        }
        var press = event
        press.isEmptyCanvas = target == .empty
        if case .card(let id) = target {
            pressedTile = (id, event.point)
            // The web selects at pointer-down (`WidgetCard` → `selectWidget`),
            // so the ring answers the press, not the release; Shift waits
            // for the release to toggle.
            if event.kind == .mouse, !event.modifiers.contains(.shift), !document.isSelected(id), chrome.pendingLink == nil {
                document.select(id)
            }
            // Built after the select, so it is built selected: a selection
            // arriving later rode the ring's animation into the open glide.
            if event.kind == .mouse, event.button == 0 { prewarmOpen(id) }
        }
        gesture.pointer(press)
        if target == .empty, !gesture.isSpacePressed, !gesture.isZPressed {
            pressEmptyCanvas(keepSelection: event.modifiers.contains(.shift))
        }
        // The ring and a closing card answer this press, not the next turn
        // of the run loop.
        sync()
        return target
    }

    public func pointerMove(_ event: PointerEvent) {
        if let pressed = pressedTile {
            if !tileMoved, CanvasInteraction.cardPressMoved(from: pressed.point, to: event.point, kind: event.kind) {
                tileMoved = true
                liveHost.discardWarm(pressed.id)
                // A mouse press that travels off a card moves it, as a drag on
                // the web card does (touch hosts run their own hold-to-drag).
                // A locked card stays put.
                if event.kind == .mouse, let widget = document.widget(pressed.id), !widget.metadata.locked {
                    // ⌘ or ⌥ held: rearrange inside a group (weld / pull off).
                    cardDragBegin(pressed.id, atWorld: toWorld(pressed.point), additive: event.modifiers.contains(.shift), glue: !event.modifiers.isDisjoint(with: [.alt, .cmd]))
                }
            }
            if isCardDragging {
                cardDragMove(toWorld: toWorld(event.point))
                return
            }
        }
        gesture.pointer(event)
    }

    public func pointerUp(_ event: PointerEvent) {
        if pressedTile != nil, isCardDragging {
            cardDragEnd(cancelled: event.phase == .cancel)
            pressedTile = nil
            var release = event
            release.phase = .cancel
            gesture.pointer(release)
            return
        }
        // The card first: a plain click on a card built on the press puts
        // its glide on screen before the engine, the board or the sync hear
        // of it; they catch up behind that first frame.
        if let pressed = pressedTile, !tileMoved, event.phase == .up, !event.modifiers.contains(.shift), openPressedCardFirst(pressed.id) {
            gesture.pointer(event)
            pressedTile = nil
            document.select(pressed.id)
            document.expandedWidgetId = pressed.id
            sync()
            return
        }
        gesture.pointer(event)
        if let pressed = pressedTile, !tileMoved, event.phase == .up {
            tapCard(pressed.id, additive: event.modifiers.contains(.shift))
            // The card starts opening on this release.
            sync()
        }
        // Built on the press but not opened (a drag, a link, a fold): gone.
        if let pressed = pressedTile { liveHost.discardWarm(pressed.id) }
        pressedTile = nil
    }

    /// Open the card a press built, ahead of everything else, and put its
    /// first frame on screen. False when this release does not simply open
    /// that card (a link, a group, a card that never rests, nothing built):
    /// the ordinary path takes it.
    private func openPressedCardFirst(_ id: String) -> Bool {
        guard chrome.pendingLink == nil, document.glue(containing: id)?.collapsed != true,
              liveHost.warmIds.contains(id), document.expandedWidgetId != id, let widget = document.widget(id) else { return false }
        let idle = idleRestContext()
        guard idle.isRestEligible(widget) || idle.iconPeeksOpen(widget) else { return false }
        // The height the body measured on the press: a board edit, no sync.
        if let fitted = liveHost.warmFittedHeight(id) { fitCard(id, fitted: fitted) }
        guard let sized = document.widget(id) else { return false }
        let opened = WidgetRestContextFactory.make(expandedWidgetId: id, expandedOffset: openingOffset(sized), cache: tileCache, version: document.widgetsVersion)
        let tile = controller.hostLayer.cardLayers[id].map { WorldRect(x: $0.position.x, y: $0.position.y, width: $0.bounds.width, height: $0.bounds.height) }
        guard liveHost.openWarm(sized, frame: displayedWidgetRect(sized, restContext: opened), openingFrom: controller.animatesOpenClose ? tile : nil) else { return false }
        controller.fadeOutTile(id)
        // This frame goes out now, before the board's bookkeeping.
        CATransaction.flush()
        return true
    }

    /// A mouse leaves a card press after 3 points (`DRAG_THRESHOLD`); a
    /// finger keeps the canvas's wider slop.
    static func cardPressMoved(from start: Vector2D, to current: Vector2D, kind: PointerKind) -> Bool {
        guard kind == .mouse else { return CanvasGesturePolicy.pressMoved(from: start, to: current) }
        return abs(current.x - start.x) >= CardMotion.dragThreshold || abs(current.y - start.y) >= CardMotion.dragThreshold
    }

    /// A double-click on a card: the web's full-screen sheet, grown out of
    /// the card's box on screen. A canvas card opens its canvas instead.
    public func doubleClickCard(_ id: String) {
        openFullscreen(id)
    }

    public func openFullscreen(_ id: String) {
        guard let widget = document.widget(id), widget.type != "canvas_node" else { return }
        let box = displayedWidgetRect(widget, restContext: restContext())
        let origin = toScreen(Vector2D(x: box.x, y: box.y))
        let zoom = camera.frame.zoom
        chrome.fullscreen = FullscreenRequest(widgetId: id, origin: WorldRect(x: origin.x, y: origin.y, width: box.width * zoom, height: box.height * zoom))
    }

    /// The hovered resting tile leans toward the pointer (`widgetMagnetism`).
    /// Frozen while a card is being dragged or resized.
    public func updateLean(atScreen point: Vector2D?) {
        guard !isCardDragging, !isResizing else { return }
        guard let point, let id = document.hoverWidgetId, let widget = document.widget(id), restContext().isResting(widget) else {
            controller.hostLayer.setHoverLean(nil, nx: 0, ny: 0)
            return
        }
        let box = displayedWidgetRect(widget, restContext: restContext())
        let world = toWorld(point)
        let nx = box.width > 0 ? (world.x - (box.x + box.width / 2)) / (box.width / 2) : 0
        let ny = box.height > 0 ? (world.y - (box.y + box.height / 2)) / (box.height / 2) : 0
        controller.hostLayer.setHoverLean(id, nx: nx, ny: ny)
    }

    /// The card a press started on, if it has not travelled.
    public var pressedCardId: String? { tileMoved ? nil : pressedTile?.id }

    public func wheel(_ event: WheelEvent) { gesture.wheel(event) }

    /// Trackpad pinch: the same zoom-at-cursor a Ctrl+wheel gives.
    public func magnify(by magnification: Double, at point: Vector2D) {
        camera.zoomAtPoint(camera.frame.zoom * (1 + magnification), focal: point)
    }

    public func pointerExited() {
        if document.hoverWidgetId != nil { document.hoverWidgetId = nil }
    }

    public func windowDidResignKey() {
        gesture.windowBlur()
    }

    // MARK: - Title-strip drags (move)

    /// Returns false when the world point is not on a live card's title strip.
    @discardableResult
    public func titleDragBegin(atWorld world: Vector2D, additive: Bool, glue: Bool = false) -> Bool {
        guard let id = titleStripWidgetId(atWorld: world) else { return false }
        cardDragBegin(id, atWorld: world, additive: additive, glue: glue)
        return true
    }

    /// A drag that moves the card under the press (title strip on a pointer,
    /// the whole tile under a finger).
    ///
    /// `glue` is the ⌥-drag: the press decides it once (letting go of the key
    /// mid-drag must not flip a weld into a whole-group move). It moves only
    /// the grabbed card and previews what a release would do — weld onto the
    /// nearest facing card, or pull free of its group. A folded group is one
    /// object, so ⌥ there moves it whole like any other drag.
    public func cardDragBegin(_ id: String, atWorld world: Vector2D, additive: Bool, glue: Bool = false) {
        let welding = glue && !document.isInFoldedCluster(id)
        if additive {
            document.select(id, additive: true)
        } else if !document.isSelected(id) {
            document.select(id)
        }
        let ids = welding ? [id] : (document.isSelected(id) ? document.selection : [id])
        titleDrag = (ids, world, false, welding)
        dragGrabbedId = id
        // Tiles hold their pictures until the drop (no re-render per frame).
        controller.isMovingCards = true
    }

    public func cardDragMove(toWorld world: Vector2D) {
        guard var drag = titleDrag else { return }
        if !drag.moved {
            drag.moved = true
            document.beginGesture(named: "Move")
        }
        document.moveWidgets(drag.ids, by: Vector2D(x: world.x - drag.last.x, y: world.y - drag.last.y), soloGlued: drag.glue)
        drag.last = world
        titleDrag = drag
        // The cards follow the pointer this frame, not after the next sync
        // (a plain drag carries every group it touches).
        let moving = drag.glue ? drag.ids : document.expandedThroughClusters(drag.ids)
        controller.moveCards(moving.compactMap { document.widget($0) })
        moveGlueChrome()
        if drag.glue, let id = drag.ids.first { updateGlueIntent(for: id) }
    }

    /// Group lines and title rows ride every drag frame with their members,
    /// in the same commit, instead of catching up on the next board sync.
    private func moveGlueChrome() {
        guard !document.board.glues.isEmpty else { return }
        let frames = glueFrames
        controller.hostLayer.setGlueLines(frames.flatMap(\.boundaryLines), dark: isDark)
        onGlueFramesMoved?(frames)
    }

    /// The ⌥-drag continuously answers "what would release do?": weld to
    /// the nearest facing card within a cell, else — for a member — pull it
    /// out. The preview must equal the drop, so the pull-off is armed on
    /// exactly "welds nothing".
    private func updateGlueIntent(for id: String) {
        guard let dragged = document.widget(id) else { return }
        let snap = GlueGeometry.findSnap(dragged, widgets: document.board.widgets)
        document.setGlueIntent(snap.map { GlueIntent(draggedId: id, targetId: $0.targetId, position: $0.position, axis: $0.axis) })
        document.setUnglueIntentWidgetId(snap == nil && document.glue(containing: id) != nil ? id : nil)
        paintGlueIntent()
    }

    /// The preview on the canvas, in the same commit as the dragged card:
    /// the slot the card will land in plus a ring on the card it joins, or
    /// a dashed outline round a card about to leave its group.
    private func paintGlueIntent() {
        var paint: GlueIntentPaint?
        if let intent = document.glueIntent, let dragged = document.widget(intent.draggedId), let target = document.widget(intent.targetId) {
            let size = displayedWidgetRect(dragged, restContext: restContext())
            paint = GlueIntentPaint(
                slot: WorldRect(x: intent.position.x, y: intent.position.y, width: size.width, height: size.height),
                target: controller.drawnRect(target),
                accent: CardAccent.accent(for: target),
                draggedId: intent.draggedId
            )
        } else if let id = document.unglueIntentWidgetId, let dragged = document.widget(id) {
            paint = GlueIntentPaint(pulling: controller.drawnRect(dragged), accent: CardAccent.accent(for: dragged))
        }
        controller.hostLayer.setGlueIntent(paint)
    }

    /// Resolves a ⌥-drag exactly as the web's release (and pointer-cancel)
    /// does: the weld the preview promised, or the pull-off. Both ride the
    /// drag's undo step.
    private func resolveGlueDrag(_ id: String) {
        if document.glueIntent?.draggedId == id {
            document.commitGlue()
        } else if document.glue(containing: id) != nil {
            document.unglueWidget(id, heldByPointer: true)
        }
        document.setGlueIntent(nil)
        document.setUnglueIntentWidgetId(nil)
    }

    /// Returns true when the drag moved something (the platform then does
    /// not treat the release as a tap).
    @discardableResult
    public func cardDragEnd(cancelled: Bool = false) -> Bool {
        guard let drag = titleDrag else { return false }
        titleDrag = nil
        let grabbed = dragGrabbedId ?? drag.ids.first ?? ""
        dragGrabbedId = nil
        controller.isMovingCards = false
        guard drag.moved else {
            document.setGlueIntent(nil)
            document.setUnglueIntentWidgetId(nil)
            return false
        }
        let before = document.board.widgets
        let wasIcon = document.widget(grabbed)?.iconified == true
        if drag.glue, let id = drag.ids.first { resolveGlueDrag(id) }
        if cancelled {
            // Owner's rule: cards push each other only when a drag is let
            // go. A cancelled drag just lands on the grid.
            document.snapWidgetsToGrid(drag.ids)
        } else {
            // The drop: dropped cards push their neighbours aside
            // (`settleWidgets`, the web's release settle, generation floor
            // included). No live preview during the drag (owner's rule).
            let ids = !drag.glue && document.isSelected(grabbed) && document.selection.count > 1 ? document.selection : [grabbed]
            // A dropped icon lands on the grid (the settle never snaps an icon).
            if wasIcon, document.glue(containing: grabbed) == nil { document.snapWidgetToGrid(grabbed) }
            document.settleWidgets(ids)
        }
        // The drop and every card it made room with glide (300 ms, the
        // layout curve) instead of jumping.
        let after = document.board.widgets
        var gliding = document.expandedThroughClusters(drag.ids)
        for (id, widget) in after.entries where widget.canvasId == document.activeCanvasId && before[id]?.position != widget.position {
            gliding.append(id)
        }
        controller.settle(gliding)
        document.endGesture()
        refitOpenCards()
        return true
    }

    public var isCardDragging: Bool { titleDrag != nil }

    /// The platform host re-places its group title rows (set by the Mac host).
    public var onGlueFramesMoved: (([GlueFrame]) -> Void)?

    // MARK: - Widget groups (the frame layer and folded groups)

    /// Every group frame on the active canvas, in world units.
    public var glueFrames: [GlueFrame] {
        // Measured from the members as they rest (an open member does not
        // push its group's lines about), glue insets applied.
        let idle = idleRestContext()
        let insets = GlueGeometry.renderInsets(glues: document.board.glues, widgets: document.board.widgets, canvasId: document.activeCanvasId)
        return GlueFrameModel.frames(board: document.board, canvasId: document.activeCanvasId) { widget in
            let rect = displayedWidgetRect(widget, restContext: idle)
            return insets[widget.id].map { $0.apply(to: rect) } ?? rect
        }
    }

    /// The group frame layer as the camera sees it right now. Both hosts
    /// mount it in viewport points over the cards.
    public func glueLayerView() -> GlueClusterLayerView {
        let frame = camera.frame
        let environment = session.environment
        let document = self.document
        return GlueClusterLayerView(
            frames: glueFrames,
            // The ⌘/⌥-drag preview is painted in the world layer
            // (`paintGlueIntent`), in step with the dragged card.
            intents: [],
            zoom: frame.zoom, pan: frame.pan,
            actions: GlueFrameActions(
                rename: { id, name in document.renameGlue(id, name: name) },
                toggleCompleted: { frame in document.setMetadataFlag("completed", !frame.allCompleted, on: frame.memberIds) },
                toggleFavorite: { frame in document.setMetadataFlag("favorite", !frame.allFavorite, on: frame.memberIds) },
                delete: { frame in environment.deletion.request(frame.memberIds) },
                setCollapsed: { id, collapsed in document.setClusterCollapsed(id, collapsed) },
                ungroup: { id in document.unglueCluster(id) }
            )
        )
    }

    /// A group's title row lies under this world point (it takes the press).
    public func glueTitleRowHit(atWorld world: Vector2D) -> Bool {
        glueFrames.contains { $0.titleRect.contains(world) }
    }

    /// A folded group's member lies under this point: the whole block is one
    /// target the canvas handles (tap unfolds, drag moves it whole), so the
    /// hosted icon must not swallow the press.
    public func isFoldedMember(atWorld world: Vector2D) -> Bool {
        guard let id = widgetId(atWorld: world) else { return false }
        return document.isInFoldedCluster(id)
    }

    // MARK: - Clipboard and select all (the Edit menu's system rows)

    public func copySelection() {
        let count = document.copyWidgets(document.selection)
        if count > 0 { _ = session.environment.toasts.add(count == 1 ? "Copied 1 widget" : "Copied \(count) widgets") }
    }

    public func cutSelection() {
        document.cutWidgets(document.selection)
    }

    /// Pastes two cells off the source; with nothing copied, says so.
    public func paste() {
        let pasted = document.pasteWidgets()
        if !pasted.isEmpty { _ = session.environment.toasts.add(pasted.count == 1 ? "Pasted 1 widget" : "Pasted \(pasted.count) widgets") }
    }

    public var canPaste: Bool { document.clipboard != nil }

    /// ⌘A: every card on the canvas.
    public func selectAll() {
        document.selectWidgets(activeWidgets.map(\.id))
    }

    // MARK: - Edge resize (`useWidgetResize.ts`, `widgetResizeEdge.ts`)

    /// The card whose outline answers a pointer at `point` (viewport points),
    /// topmost first. Only a card showing its full body resizes: a resting
    /// tile is sized by its content and opens on a click instead, and a
    /// locked, fixed-size or iconified card has no box to drag.
    public func resizeTarget(atScreen point: Vector2D) -> (id: String, edge: ResizeEdge)? {
        guard !gesture.isSpacePressed, !gesture.isZPressed, chrome.interactionMode != .connect else { return nil }
        let context = restContext()
        let zoom = camera.frame.zoom
        let world = toWorld(point)
        let widgets = activeWidgets
        // Rule one: a card owns every point inside it. The topmost card whose
        // box (its name row included) holds the pointer is the only one that
        // may answer, so a neighbour's band can never reach across and take a
        // press meant for this card's own buttons.
        var owner: Widget?
        for widget in widgets.reversed() where ownedRect(widget, context: context).contains(world) {
            owner = widget
            break
        }
        for widget in widgets.reversed() {
            if let owner, owner.id != widget.id { continue }
            // `gestureAllowed`: a fixed-size card still answers as a tile
            // (crush to an icon); an icon scales as a square, 2×2 to 3×3.
            guard !widget.metadata.locked, let definition = WidgetRegistry.definition(for: widget.type) else { continue }
            guard let kind = resizeKind(widget, context: context) else { continue }
            if kind == .card, widget.iconified != true, definition.sizingRules(for: widget.data).fixed { continue }
            let box = displayedWidgetRect(widget, restContext: context)
            let origin = toScreen(Vector2D(x: box.x, y: box.y))
            let local = Vector2D(x: point.x - origin.x, y: point.y - origin.y)
            let size = Size(width: box.width * zoom, height: box.height * zoom)
            // Rule two: the name row is the card's, all of it. The band used
            // to reach 14 pt above the box, straight across the expand, pin,
            // star and delete buttons — a quarter of each at 100 %, most of
            // each zoomed out. A card wearing a name row is resized from
            // above through the few points just inside its top border.
            if kind == .card, local.y < 0, wearsTitleRow(widget, definition: definition) { continue }
            if let edge = ResizeEdge.at(local, size: size, inside: CanvasInteraction.resizeReachInside) { return (widget.id, edge) }
        }
        return nil
    }

    private func wearsTitleRow(_ widget: Widget, definition: WidgetDefinition) -> Bool {
        definition.titleChrome && (widget.iconified != true || document.expandedWidgetId == widget.id)
    }

    /// Everything on screen that belongs to one card: its box, plus the name
    /// row above it when it is open.
    private func ownedRect(_ widget: Widget, context: RestContext) -> WorldRect {
        let box = displayedWidgetRect(widget, restContext: context)
        guard !context.isResting(widget), let definition = WidgetRegistry.definition(for: widget.type), wearsTitleRow(widget, definition: definition) else { return box }
        return WorldRect(x: box.x, y: box.y - widgetTitleRowHeight, width: box.width, height: box.height + widgetTitleRowHeight)
    }

    func resizeKind(_ widget: Widget, context: RestContext) -> ResizeKind? {
        // An icon is a scalable square: the ordinary card gesture, held to
        // 2×2–3×3. A peeked-open icon is a card on screen but an icon in the
        // record, so it has no honest box to resize.
        if widget.iconified == true { return document.expandedWidgetId == widget.id ? nil : .card }
        // A resting face is never resized: its edge is a scale drag that
        // only moves between the scale states (tile ↔ icon), owner's call.
        if context.isResting(widget) { return .rest }
        return .card
    }

    /// `ICONIFY_CRUSH_PX`: a tile pushed in this far on both axes becomes an
    /// icon.
    public static let iconifyCrush = 48.0

    /// Hover: arm (or disarm) the resize cursor.
    public func updateResizeHover(atScreen point: Vector2D?) {
        guard resize == nil else { return }
        let edge = point.flatMap { resizeTarget(atScreen: $0)?.edge }
        guard edge != armedResizeEdge else { return }
        armedResizeEdge = edge
        onResizeCursor?(edge)
    }

    /// Returns false when the point is not on a resize band.
    @discardableResult
    public func resizeBegin(atScreen point: Vector2D) -> Bool {
        guard let target = resizeTarget(atScreen: point), let widget = document.widget(target.id),
              let kind = resizeKind(widget, context: restContext()) else { return false }
        let box = displayedWidgetRect(widget, restContext: restContext())
        resize = (target.id, target.edge, kind == .rest ? Size(width: box.width, height: box.height) : widget.size, point, false, kind, box)
        resizeCommitted = false
        controller.isMovingCards = true
        onResizeCursor?(target.edge)
        return true
    }

    public func resizeMove(toScreen point: Vector2D) {
        guard var current = resize else { return }
        if !current.began {
            current.began = true
            document.beginGesture(named: "Resize")
        }
        resize = current
        let delta = Vector2D(x: point.x - current.startPoint.x, y: point.y - current.startPoint.y)
        let size = DragResize.intendedSize(start: current.startSize, edge: current.edge, screenDelta: delta, zoom: camera.frame.zoom)
        if current.kind != .card {
            // A scale drag only decides the widget's state (`useWidgetResize`,
            // rest mode): the tile stretches like rubber, and the moment the
            // crush passes the line it becomes an icon, with the stretch
            // recoiling while the box glides down.
            guard !resizeCommitted else { return }
            if CanvasInteraction.scaleDragArmed(current.kind, start: current.startSize, size: size, edge: current.edge) {
                resizeCommitted = true
                controller.releaseElastic(current.id)
                controller.settle([current.id])
                document.setIconified(current.id, true)
                return
            }
            previewScaleDrag(current, size: size)
            return
        }
        guard !resizeCommitted else { return }
        if let icon = document.widget(current.id), icon.iconified == true,
           CanvasInteraction.iconEscapes(size, edge: current.edge) {
            // Pulled wayyy past 3×3: the icon lets go and the widget is a
            // resting tile again, on the spot, with the jelly recoiling.
            resizeCommitted = true
            controller.releaseElastic(current.id)
            controller.settle([current.id])
            document.setIconified(current.id, false)
            return
        }
        document.resizeWidgetFromEdge(current.id, to: size, edge: current.edge, snap: false)
        if let icon = document.widget(current.id), icon.iconified == true {
            previewIconDrag(icon, intended: size, edge: current.edge)
        }
    }

    /// An icon held past 2×2–3×3 stops there while its band stretches like
    /// jelly (`paintElastic`, the same damped travel as a card at its bounds),
    /// and its face is redrawn at the size it wears so the corners never grow.
    private func previewIconDrag(_ icon: Widget, intended: Size, edge: ResizeEdge) {
        controller.previewIconFrame(icon, displayedWidgetRect(icon, restContext: restContext()))
        let lower = CanvasGeometry.iconMinEdge, upper = CanvasGeometry.iconMaxEdge
        let base = max(1, icon.size.width)
        func band(_ raw: Double, _ pulled: Int) -> Double {
            guard pulled != 0, raw < lower || raw > upper else { return 1 }
            let over = raw < lower ? lower - raw : raw - upper
            let travel = DragResize.elasticOvershoot(over, limit: DragResize.elasticLimit)
            return (base + (raw < lower ? -1 : 1) * travel) / base
        }
        let pinned = CGPoint(x: edge.x == -1 ? 1 : edge.x == 1 ? 0 : 0.5, y: edge.y == -1 ? 1 : edge.y == 1 ? 0 : 0.5)
        controller.previewElastic(icon.id, x: band(intended.width, edge.x), y: band(intended.height, edge.y), pinned: pinned)
    }

    public func resizeEnd(atScreen point: Vector2D?) {
        guard let current = resize else { return }
        resize = nil
        controller.isMovingCards = false
        if current.began {
            controller.settle([current.id])
            let before = Dictionary(activeWidgets.map { ($0.id, $0.position) }, uniquingKeysWith: { a, _ in a })
            defer {
                // Neighbours the release pushed aside glide there.
                controller.settle(activeWidgets.filter { before[$0.id] != $0.position }.map(\.id))
            }
            var size: Size?
            if let point {
                let delta = Vector2D(x: point.x - current.startPoint.x, y: point.y - current.startPoint.y)
                size = DragResize.intendedSize(start: current.startSize, edge: current.edge, screenDelta: delta, zoom: camera.frame.zoom)
            }
            switch current.kind {
            case .card:
                // An icon's jelly recoils as it settles on its cell.
                controller.releaseElastic(current.id)
                if let size, !resizeCommitted { document.resizeWidgetFromEdge(current.id, to: size, edge: current.edge, snap: true) }
                document.endGesture()
            case .rest:
                document.endGesture()
                // Not across the line: the tile springs back. (Across it, the
                // drag already changed the state and released the band.)
                if !resizeCommitted {
                    controller.releaseElastic(current.id)
                    scheduleSync()
                }
            }
        }
        armedResizeEdge = nil
        refitOpenCards()
        updateResizeHover(atScreen: point)
    }

    public var isResizing: Bool { resize != nil }

    /// `ICON_ESCAPE_PX`: how far past 3×3 an icon is pulled before it lets go.
    public static let iconEscape = 40.0

    /// Whether an icon pulled to `intended` has grown far enough past its
    /// ceiling to stop being an icon (`iconEscapesToFull`). Only growth
    /// escapes; shrinking clamps at 2×2.
    static func iconEscapes(_ intended: Size, edge: ResizeEdge) -> Bool {
        var pulled: [Double] = []
        if edge.x != 0 { pulled.append(intended.width) }
        if edge.y != 0 { pulled.append(intended.height) }
        guard !pulled.isEmpty else { return false }
        return pulled.reduce(0, +) / Double(pulled.count) >= CanvasGeometry.iconMaxEdge + iconEscape
    }

    /// Whether a scale drag has gone far enough to change state
    /// (`crushesToIcon`): a tile pushed in `iconifyCrush` on BOTH axes, which
    /// only a corner can do. A side pull never turns a tile into an icon.
    static func scaleDragArmed(_ kind: ResizeKind, start: Size, size: Size, edge: ResizeEdge) -> Bool {
        switch kind {
        case .rest:
            edge.x != 0 && edge.y != 0
                && start.width - size.width >= iconifyCrush
                && start.height - size.height >= iconifyCrush
        case .card:
            false
        }
    }

    /// The scale drag's feedback (`paintElastic`): each pulled axis stretches
    /// against its own dimension by a damped travel (`REST_ELASTIC_PX`), a
    /// pinned axis stays flat, and the band stretches away from the pinned
    /// sides.
    private func previewScaleDrag(_ drag: (id: String, edge: ResizeEdge, startSize: Size, startPoint: Vector2D, began: Bool, kind: ResizeKind, startBox: WorldRect), size: Size) {
        func stretch(_ intended: Double, _ start: Double, _ edge: Int) -> Double {
            guard edge != 0 else { return 1 }
            let pull = intended - start
            let base = max(1, start)
            let travel = DragResize.elasticOvershoot(abs(pull), limit: DragResize.elasticLimit)
            return (base + (pull < 0 ? -1 : 1) * travel) / base
        }
        let pinned = CGPoint(x: drag.edge.x == -1 ? 1 : drag.edge.x == 1 ? 0 : 0.5, y: drag.edge.y == -1 ? 1 : drag.edge.y == 1 ? 0 : 0.5)
        controller.previewElastic(
            drag.id,
            x: stretch(size.width, drag.startSize.width, drag.edge.x),
            y: stretch(size.height, drag.startSize.height, drag.edge.y),
            pinned: pinned
        )
    }

    /// Screen points the resize band reaches inside an open card's border.
    public static let resizeReachInside = 6.0
}

// MARK: - GestureDelegate

extension CanvasInteraction: GestureDelegate {
    nonisolated public func gestureMarqueeStarted(kind: ActiveGesture, mode: MarqueeMode) {
        MainActor.assumeIsolated { onMarquee?(WorldRect(x: 0, y: 0, width: 0, height: 0)) }
    }

    nonisolated public func gestureMarqueeUpdated(screenRect: WorldRect, worldRect: WorldRect, boxedCount: Int) {
        MainActor.assumeIsolated { onMarquee?(screenRect) }
    }

    nonisolated public func gestureMarqueeFinished(worldRect: WorldRect, boxedIds: [String], mode: MarqueeMode) {
        MainActor.assumeIsolated {
            onMarquee?(nil)
            document.selectWidgets(mergeMarqueeSelection(current: document.selection, boxed: boxedIds, mode: mode))
            // The web's marquee also gathers tree-shaper points.
            if chrome.treeShaper.isActive { chrome.treeShaper.addToSelection(chrome.treeShaper.nodeIds(intersecting: worldRect)) }
        }
    }

    nonisolated public func gestureZoomRegionFinished(worldRect: WorldRect) {
        MainActor.assumeIsolated { onMarquee?(nil) }
    }

    nonisolated public func gestureMarqueeCancelled() {
        MainActor.assumeIsolated { onMarquee?(nil) }
    }

    nonisolated public func gestureLongPress(at point: Vector2D) {
        MainActor.assumeIsolated { onLongPress?(point) }
    }

    nonisolated public func gestureIsPanningChanged(_ isPanning: Bool) {}

    nonisolated public func gestureCursorChanged(_ cursor: CanvasCursor) {
        MainActor.assumeIsolated { onCursor?(cursor) }
    }

    nonisolated public func gestureHover(at point: Vector2D?) {
        MainActor.assumeIsolated { hover(at: point) }
    }

    nonisolated public func gestureWillBeginPress() {}

    /// Keep the hovered card while the pointer is on its rail (the dots hang
    /// past the edge by the port hit radius).
    public func hover(at point: Vector2D?) {
        guard let point else {
            if document.hoverWidgetId != nil { document.hoverWidgetId = nil }
            return
        }
        let world = toWorld(point)
        let context = restContext()
        if let current = document.hoverWidgetId, let widget = document.widget(current) {
            let box = displayedWidgetRect(widget, restContext: context)
            let reach = PortGeometry.portHitRadius
            let grown = WorldRect(x: box.x - reach, y: box.y - widgetTitleRowHeight, width: box.width + reach * 2, height: box.height + widgetTitleRowHeight + reach)
            if grown.contains(world) { return }
        }
        let next = widgetId(atWorld: world)
        if next != document.hoverWidgetId { document.hoverWidgetId = next }
        coordinator.hoveredWireId = controller.hostLayer.edgeLayer.hitTest(world: world)
    }
}
#endif
