#if canImport(AppKit)
import AppKit
import SwiftUI
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome

// ---------------------------------------------------------------------------
// The AppKit canvas host (moved from the preview shell): one flipped NSView
// that
//
// - hosts the Core Animation world (`CanvasHostLayer`) in a layer-hosting
//   child view, driven by the session's `CameraEngine` on a display link;
// - translates NSEvents into the gesture engine's `PointerEvent`/`WheelEvent`
//   (viewport coordinates, y-down);
// - mounts live cards and port rails as real views in `LiveCardsView`, whose
//   bounds ARE world coordinates (AppKit bounds scaling carries the camera);
// - feeds the edge layer through `CircuitOverlayCoordinator`, drives wire
//   drags through `LinkingController`, and opens the field picker and the
//   wire inspector as popovers; right-click shows the system context menu.
//
// Everything below the event layer is `CanvasInteraction`, shared with iOS.
// ---------------------------------------------------------------------------

/// A flipped, unscaled view over the canvas. Live cards and rails are its
/// subviews, placed in viewport points and scaling themselves (a hosting
/// view under a bounds-scaled parent gets no clicks); a press on a card's
/// title strip or outline is handled here.
final class LiveCardsView: NSView {
    weak var canvas: MacCanvasHostView?

    override var isFlipped: Bool { true }

    override func hitTest(_ point: NSPoint) -> NSView? {
        guard let canvas else { return nil }
        // A card's outline answers before its body: the resize band reaches
        // a little inside the border, where the hosted card would take it.
        let viewport = canvas.convert(point, from: superview)
        let screen = Vector2D(x: viewport.x, y: viewport.y)
        if canvas.interaction.resizeTarget(atScreen: screen) != nil { return self }
        if canvas.interaction.titleStripWidgetId(atWorld: canvas.toWorld(screen)) != nil { return self }
        // A folded group is one object: its icons belong to the canvas.
        if canvas.interaction.isFoldedMember(atWorld: canvas.toWorld(screen)) { return nil }
        let hit = super.hitTest(point)
        // Empty world under the pointer belongs to the canvas view.
        return hit === self ? nil : hit
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseDown(with event: NSEvent) { canvas?.titleMouseDown(event) }
    override func mouseDragged(with event: NSEvent) { canvas?.titleMouseDragged(event) }
    override func mouseUp(with event: NSEvent) { canvas?.titleMouseUp(event) }
    override func rightMouseDown(with event: NSEvent) { canvas?.rightMouseDown(with: event) }

}

/// The ⌥-drag previews (`GlueClusterLayerView`), in viewport points beneath
/// the cards. Pure paint: every press falls through.
final class GlueLayerHostView: NSHostingView<GlueClusterLayerView> {
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}

/// One group's title row (`GlueTitleRoot`), placed by the host on every
/// camera commit. Only the painted row takes presses.
final class GlueTitleHostView: NSHostingView<GlueTitleRoot> {
    weak var canvas: MacCanvasHostView?
    var model: GlueTitleModel?

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func hitTest(_ point: NSPoint) -> NSView? {
        guard let canvas else { return nil }
        let viewport = canvas.convert(point, from: superview)
        guard canvas.interaction.glueTitleRowHit(atWorld: canvas.toWorld(Vector2D(x: viewport.x, y: viewport.y))) else { return nil }
        return super.hitTest(point)
    }
}

/// A flipped container that is never itself a press target: only its
/// subviews answer.
final class FlippedPassView: NSView {
    override var isFlipped: Bool { true }

    override func hitTest(_ point: NSPoint) -> NSView? {
        let hit = super.hitTest(point)
        return hit === self ? nil : hit
    }
}

/// Hosts `CanvasHostLayer`. AppKit rewrites a hosted layer's
/// `isGeometryFlipped` once, at the view's first display; after that a value
/// set here sticks. The world is y-down (macOS `CanvasHostLayer` flips), so
/// the flag is re-asserted after that first display and guarded on every
/// sync — a y-up world would mirror every tile against the live views.
final class WorldHostView: NSView {
    override var isFlipped: Bool { true }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    /// Makes the world y-down ON SCREEN, whatever the hosting context.
    ///
    /// A fixed value cannot do this. Core Animation's root on macOS is y-up,
    /// and every ancestor layer with `isGeometryFlipped` toggles the
    /// orientation its descendants see; AppKit sets those flags differently in
    /// a bare window (the preview shell) and inside SwiftUI (the app). Forcing
    /// `true` here double-flipped the app: the whole board drew upside down,
    /// so dragging and scrolling both felt inverted. So the flag is derived:
    /// flip exactly when the ancestors, taken together, have not.
    func ensureWorldFlipped() {
        guard let layer else { return }
        var inherited = false
        var ancestor = layer.superlayer
        while let current = ancestor {
            if current.isGeometryFlipped { inherited.toggle() }
            ancestor = current.superlayer
        }
        let wanted = !inherited
        if layer.isGeometryFlipped != wanted { layer.isGeometryFlipped = wanted }
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        DispatchQueue.main.async { [weak self] in self?.ensureWorldFlipped() }
    }

    override func layout() {
        super.layout()
        ensureWorldFlipped()
    }
}

/// The marquee box, in viewport coordinates. Never hit-tested.
final class MarqueeBoxView: NSView {
    override var isFlipped: Bool { true }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override func draw(_ dirtyRect: NSRect) {
        NSColor.controlAccentColor.withAlphaComponent(0.12).setFill()
        bounds.fill()
        NSColor.controlAccentColor.setStroke()
        let path = NSBezierPath(rect: bounds.insetBy(dx: 0.5, dy: 0.5))
        path.lineWidth = 1
        path.stroke()
    }
}

public final class MacCanvasHostView: NSView, NSPopoverDelegate, NSMenuItemValidation {
    public let session: WindowSession
    public let interaction: CanvasInteraction

    /// Called after every sync so chrome outside SwiftUI can refresh.
    public var onSync: (() -> Void)?
    /// Cards wearing a port rail right now (smoke seam).
    public var mountedRailIds: Set<String> { Set(railViews.keys) }

    private let hostView = WorldHostView()
    private let cardsView = LiveCardsView()
    private let marqueeView = MarqueeBoxView()
    private var glueLayer: GlueLayerHostView?
    /// Every group's title row, by group id, beneath the cards.
    private(set) var glueTitles: [String: GlueTitleHostView] = [:]
    private let glueTitleContainer = FlippedPassView()
    private var focusedCardId: String?
    private var railViews: [String: NSHostingView<AnyView>] = [:]
    private var inspectorPopover: NSPopover?
    private var inspectorConnectionId: String?
    private var pickerPopover: NSPopover?
    private var pickerDrop: PendingWireDrop?
    private var trackingArea: NSTrackingArea?
    private var contextMenuRequest: ContextMenuRequest?

    public override var isFlipped: Bool { true }
    public override var acceptsFirstResponder: Bool { true }
    /// The first click on a card in a background window reaches the card
    /// (a canvas answers the click that brings it forward, like Finder).
    public override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    private var clickMonitor: Any?
    /// A card pressed a second time in quick succession: a double-click if
    /// it is let go without travelling.
    private var pendingDoubleClick: String?

    public init(session: WindowSession, screenScale: CGFloat) {
        self.session = session
        let liveHost = WidgetLiveCardHost(container: nil) { _ in nil }
        interaction = CanvasInteraction(session: session, liveHost: liveHost, screenScale: screenScale, isTouch: false, reducedMotion: { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion })
        super.init(frame: NSRect(x: 0, y: 0, width: 1280, height: 720))

        wantsLayer = true
        applyEffectiveAppearance()

        // Layer-hosting: the host layer is ours, AppKit only sizes it (and
        // keeps its flip, since the view is flipped too).
        hostView.layer = interaction.controller.hostLayer
        hostView.wantsLayer = true
        hostView.frame = bounds
        hostView.autoresizingMask = [.width, .height]
        addSubview(hostView)

        // Group chrome sits beneath the cards: an open card is never crossed
        // by its group's title row.
        glueTitleContainer.frame = bounds
        glueTitleContainer.autoresizingMask = [.width, .height]
        addSubview(glueTitleContainer)

        cardsView.canvas = self
        cardsView.frame = bounds
        cardsView.autoresizingMask = [.width, .height]
        cardsView.wantsLayer = true
        addSubview(cardsView)
        liveHost.container = cardsView

        let glue = GlueLayerHostView(rootView: interaction.glueLayerView())
        glue.sizingOptions = []
        glue.frame = bounds
        glue.autoresizingMask = [.width, .height]
        addSubview(glue, positioned: .below, relativeTo: glueTitleContainer)
        glueLayer = glue

        marqueeView.isHidden = true
        marqueeView.wantsLayer = true
        addSubview(marqueeView)

        interaction.onCameraFrame = { [weak self] frame in
            self?.hostView.ensureWorldFlipped()
            self?.applyCardsBounds(frame)
        }
        interaction.onSync = { [weak self] in self?.syncPlatform() }
        interaction.onGlueFramesMoved = { [weak self] frames in self?.moveGlueTitles(frames) }
        interaction.onMarquee = { [weak self] rect in
            guard let self else { return }
            guard let rect else { self.marqueeView.isHidden = true; return }
            self.marqueeView.isHidden = false
            self.marqueeView.frame = NSRect(x: rect.x, y: rect.y, width: rect.width, height: rect.height)
            self.marqueeView.needsDisplay = true
        }
        interaction.onCursor = { cursor in
            switch cursor {
            case .standard: NSCursor.arrow.set()
            case .grab: NSCursor.openHand.set()
            case .grabbing: NSCursor.closedHand.set()
            case .zoomIn: NSCursor.crosshair.set()
            }
        }
        interaction.onContextMenu = { [weak self] request in self?.presentContextMenu(request) }
        interaction.onLineMenu = { [weak self] model, point in self?.presentLineMenu(model, at: point) }
        interaction.onResizeCursor = { edge in MacCanvasHostView.resizeCursor(for: edge).set() }
        liveHost.onSkinTap = { [weak self] id in self?.presentSkinPicker(for: id) }

        interaction.viewportDidChange(Size(width: bounds.width, height: bounds.height))
        applyCardsBounds(session.camera.frame)
        interaction.start()
    }

    required init?(coder: NSCoder) { nil }

    /// The interaction runs while the view is in a window.
    public override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window == nil { interaction.stop() } else { interaction.start() }
        installClickMonitor(window != nil)
    }

    /// A press inside an open card goes to the card's own controls, which
    /// never tell the canvas. The web selects the card on that press too, so
    /// a monitor watches presses (without consuming them) and selects.
    private func installClickMonitor(_ install: Bool) {
        if let clickMonitor { NSEvent.removeMonitor(clickMonitor) }
        clickMonitor = nil
        guard install else { return }
        clickMonitor = NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { [weak self] event in
            self?.noteLiveCardPress(event)
            return event
        }
    }

    private func noteLiveCardPress(_ event: NSEvent) {
        guard event.window === window, let window else { return }
        let point = convert(event.locationInWindow, from: nil)
        guard bounds.contains(point) else { return }
        // Only presses the canvas itself will not see.
        let hit = window.contentView?.hitTest(event.locationInWindow)
        guard let hit, hit !== self, hit !== cardsView, hit.isDescendant(of: cardsView) else { return }
        let world = toWorld(Vector2D(x: point.x, y: point.y))
        guard let id = interaction.widgetId(atWorld: world), interaction.controller.liveCardIds.contains(id) else { return }
        interaction.chrome.activeInput = .mouse
        if event.modifierFlags.contains(.shift) {
            session.document.select(id, additive: true)
        } else if !session.document.isSelected(id) {
            session.document.select(id)
        }
    }

    // Forwarders the preview's smoke run and tests read.
    public var document: BoardDocument { session.document }
    public var camera: CameraEngine { session.camera }
    public var gesture: GestureEngine { interaction.gesture }
    public var controller: CanvasHostController { interaction.controller }
    public var liveHost: WidgetLiveCardHost { interaction.liveHost }
    public var coordinator: CircuitOverlayCoordinator { interaction.coordinator }
    public var linking: LinkingController { interaction.linking }
    public func restContext() -> RestContext { interaction.restContext() }
    public var viewportCentreWorld: Vector2D { interaction.viewportCentreWorld }
    public func expand(_ id: String, additive: Bool = false) { interaction.expand(id, additive: additive) }
    public func collapse() { interaction.collapse() }
    public func fitAll() { interaction.fitAll() }
    public func deleteSelection() { interaction.deleteSelection() }
    public func sync() { interaction.sync() }
    /// What a plain press on empty canvas does, without an NSEvent (smoke seam).
    public func mouseDownOnEmptyCanvasForSmoke() { interaction.pressEmptyCanvas() }
    public func windowDidResignKey() { interaction.windowDidResignKey() }

    // MARK: - Geometry

    private func viewportPoint(_ event: NSEvent) -> Vector2D {
        let point = convert(event.locationInWindow, from: nil)
        return Vector2D(x: point.x, y: point.y)
    }

    func toWorld(_ point: Vector2D) -> Vector2D { interaction.toWorld(point) }

    /// The camera moved: open cards (and rails) re-place themselves in
    /// viewport points; the container itself is never scaled.
    private func applyCardsBounds(_ frame: CameraFrame) {
        interaction.liveHost.setCamera(zoom: max(frame.zoom, 0.0001), pan: frame.pan)
        // Rails re-place with the camera; only while this view is on screen
        // (a detached host must not reach back into its session).
        if !railViews.isEmpty, window != nil, CircuitFeature.isEnabled { syncRails() }
        // A camera frame only moves the group chrome; the rows themselves are
        // rebuilt on a board sync (`syncGlueLayer`), never per frame.
        placeGlueTitles(frame)
    }

    /// A title row's box on screen: standing on its top line.
    private func placeGlueTitles(_ frame: CameraFrame) {
        guard !glueTitles.isEmpty else { return }
        let zoom = max(frame.zoom, 0.0001)
        for view in glueTitles.values {
            guard let glue = view.model?.frame else { continue }
            let bottom = glue.topLineY * zoom + frame.pan.y
            let height = GlueFrame.titleHeight * zoom
            view.frame = NSRect(x: glue.members.x * zoom + frame.pan.x, y: bottom - height, width: GlueTitleRoot.width * zoom, height: height)
        }
    }

    public override func layout() {
        super.layout()
        interaction.viewportDidChange(Size(width: bounds.width, height: bounds.height))
        applyCardsBounds(session.camera.frame)
    }

    public override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        applyEffectiveAppearance()
    }

    /// The window's appearance is the theme (the scene root sets it from
    /// Settings ▸ Appearance, or leaves it to the system).
    private func applyEffectiveAppearance() {
        let dark = effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        layer?.backgroundColor = CanvasInteraction.canvasGround(dark: dark)
        interaction.applyAppearance(dark: dark)
    }

    public override func viewDidChangeBackingProperties() {
        super.viewDidChangeBackingProperties()
        if let scale = window?.backingScaleFactor {
            interaction.controller.hostLayer.screenScale = scale
        }
    }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let trackingArea { removeTrackingArea(trackingArea) }
        let area = NSTrackingArea(rect: bounds, options: [.mouseMoved, .mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect], owner: self, userInfo: nil)
        addTrackingArea(area)
        trackingArea = area
    }

    // MARK: - Sync (rails, popovers, redraw)

    private func syncPlatform() {
        hostView.ensureWorldFlipped()
        syncRails()
        syncPopovers()
        syncGlueLayer()
        onSync?()
    }

    /// Group chrome rebuilds so far (test seam: a camera frame makes none).
    private(set) var glueSyncs = 0

    /// Re-draws the ⌥-drag previews, and keeps one title row per group.
    private func syncGlueLayer() {
        glueSyncs += 1
        let layer = interaction.glueLayerView()
        glueLayer?.rootView = layer
        var seen: Set<String> = []
        for glue in layer.frames {
            seen.insert(glue.id)
            if let view = glueTitles[glue.id], let model = view.model {
                if model.frame != glue { model.frame = glue }
                model.actions = layer.actions
            } else {
                let model = GlueTitleModel(frame: glue, actions: layer.actions)
                let view = GlueTitleHostView(rootView: GlueTitleRoot(model: model, camera: interaction.liveHost.camera))
                view.model = model
                view.canvas = self
                view.sizingOptions = []
                glueTitleContainer.addSubview(view)
                glueTitles[glue.id] = view
            }
        }
        for (id, view) in glueTitles where !seen.contains(id) {
            view.removeFromSuperview()
            glueTitles[id] = nil
        }
        placeGlueTitles(session.camera.frame)
        syncFocusBackdrop()
    }

    /// A drag frame: the rows keep their views and only take the new frames.
    private func moveGlueTitles(_ frames: [GlueFrame]) {
        for glue in frames {
            if let model = glueTitles[glue.id]?.model, model.frame != glue { model.frame = glue }
        }
        placeGlueTitles(session.camera.frame)
    }

    /// Every open card stands in a soft ring: the board within three cells
    /// of it blurs (fully to two, fading over the third) so its neighbours
    /// never compete with it, and the rest of the board is left as it is
    /// (owner's call, 19 Sep 2026; `CanvasHostLayer.setFocus`).
    private func syncFocusBackdrop() {
        let document = session.document
        if let open = document.expandedWidgetId { interaction.liveHost.bringToFront(open) }
        let id = document.expandedWidgetId
        let wanted = id.flatMap { interaction.liveHost.view(for: $0) } == nil ? nil : id
        let reduce = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        let animated = !reduce && interaction.controller.animatesOpenClose
        var ring: WorldRect?
        if let wanted, let widget = document.widget(wanted) {
            // The card as drawn, with the title row it wears above it.
            let box = displayedWidgetRect(widget, restContext: interaction.restContext())
            ring = WorldRect(x: box.x, y: box.y - widgetTitleRowHeight, width: box.width, height: box.height + widgetTitleRowHeight)
        }
        let changed = wanted != focusedCardId
        // The resting tile the rings grow out of (opening) or shrink back
        // into (closing): the card that is changing, as it rests.
        let tile = (wanted ?? focusedCardId).flatMap { document.widget($0) }.map { displayedWidgetRect($0, restContext: interaction.idleRestContext()) }
        interaction.controller.hostLayer.setFocus(
            ring, tile: changed ? tile : nil, dark: interaction.isDark,
            transition: changed && animated ? LayerTransition(duration: CardMotion.openDuration, controlPoints: CardMotion.layoutControlPoints) : nil
        )
        guard changed else { return }
        focusedCardId = wanted
        // The open card's own title row takes the place of its group's: the
        // group row steps aside rather than showing through behind it.
        let groupId = wanted.flatMap { id in document.board.glues.values.first { $0.widgetIds.contains(id) }?.id }
        let fades = glueTitles.map { ($0.value, CGFloat($0.key == groupId ? 0 : 1)) }
        if !animated {
            for (view, alpha) in fades { view.alphaValue = alpha }
        } else {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = CardMotion.openDuration
                context.timingFunction = CardMotion.layoutEase
                for (view, alpha) in fades { view.animator().alphaValue = alpha }
            }
        }
    }

    private func syncRails() {
        guard CircuitFeature.isEnabled else {
            for view in railViews.values { view.removeFromSuperview() }
            railViews.removeAll()
            return
        }
        let document = session.document
        let ui = document.circuitUI
        let context = interaction.restContext()
        let zoom = session.camera.frame.zoom
        var wanted: [String: (GrovepadCore.Widget, PortRail)] = [:]
        for widget in interaction.activeWidgets {
            let visible = PortRailModel.isVisible(widgetId: widget.id, hoverWidgetId: document.hoverWidgetId, circuitUI: ui) || widget.id == document.expandedWidgetId
            guard visible else { continue }
            let rail = PortRailModel.rail(for: widget, restContext: context)
            if rail.isEmpty { continue }
            wanted[widget.id] = (widget, rail)
        }
        for (id, view) in railViews where wanted[id] == nil {
            view.removeFromSuperview()
            railViews[id] = nil
        }
        for (id, entry) in wanted {
            let (widget, rail) = entry
            // The invisible 44 pt hit boxes hang past the card's edge; grow
            // the hosting view so AppKit hit-tests them.
            let pad = CGFloat(max(PortRailModel.dotDiameter, PortRailModel.touchTarget / max(zoom, 0.0001)) / 2 + 2)
            let frame = rail.frame
            let root = AnyView(
                PortRailView(
                    widget: widget, rail: rail, circuitUI: ui, zoom: zoom, controller: interaction.linking,
                    localToWorld: { point in Vector2D(x: frame.x + Double(point.x), y: frame.y + Double(point.y)) },
                    localToScreen: { [weak self] point in
                        self?.interaction.toScreen(Vector2D(x: frame.x + Double(point.x), y: frame.y + Double(point.y))) ?? .zero
                    }
                )
                .padding(pad)
                .scaleEffect(CGFloat(zoom), anchor: .topLeading)
                .frame(width: (CGFloat(frame.width) + pad * 2) * CGFloat(zoom), height: (CGFloat(frame.height) + pad * 2) * CGFloat(zoom), alignment: .topLeading)
            )
            let view: NSHostingView<AnyView>
            if let existing = railViews[id] {
                view = existing
                view.rootView = root
            } else {
                view = NSHostingView(rootView: root)
                view.sizingOptions = []
                railViews[id] = view
                cardsView.addSubview(view)
            }
            let origin = interaction.toScreen(Vector2D(x: frame.x - Double(pad), y: frame.y - Double(pad)))
            view.frame = NSRect(x: origin.x, y: origin.y, width: (CGFloat(frame.width) + pad * 2) * CGFloat(zoom), height: (CGFloat(frame.height) + pad * 2) * CGFloat(zoom))
            // Rails sit above the cards they belong to.
            cardsView.addSubview(view, positioned: .above, relativeTo: nil)
        }
    }

    private func syncPopovers() {
        let document = session.document
        let ui = document.circuitUI
        if let drop = ui.pendingDrop {
            if pickerDrop != drop {
                pickerPopover?.close()
                pickerDrop = drop
                let popover = NSPopover()
                popover.behavior = .transient
                popover.delegate = self
                popover.contentSize = NSSize(width: 280, height: 320)
                popover.contentViewController = NSHostingController(rootView: WireFieldPickerView(controller: interaction.linking, drop: drop))
                pickerPopover = popover
                popover.show(relativeTo: anchorRect(drop.screen), of: self, preferredEdge: .maxY)
            }
        } else if let popover = pickerPopover {
            pickerDrop = nil
            pickerPopover = nil
            popover.close()
        }

        if let target = ui.inspector {
            if inspectorConnectionId != target.connectionId {
                inspectorPopover?.close()
                inspectorConnectionId = target.connectionId
                let popover = NSPopover()
                popover.behavior = .transient
                popover.delegate = self
                popover.contentSize = NSSize(width: 300, height: 360)
                popover.contentViewController = NSHostingController(rootView: WireInspectorView(document: document, connectionId: target.connectionId))
                inspectorPopover = popover
                popover.show(relativeTo: anchorRect(Vector2D(x: target.x, y: target.y)), of: self, preferredEdge: .maxY)
            }
        } else if let popover = inspectorPopover {
            inspectorConnectionId = nil
            inspectorPopover = nil
            popover.close()
        }
    }

    private func anchorRect(_ screen: Vector2D) -> NSRect {
        let x = min(max(screen.x, 2), bounds.width - 2)
        let y = min(max(screen.y, 2), bounds.height - 2)
        return NSRect(x: x - 2, y: y - 2, width: 4, height: 4)
    }

    /// A transient popover the person dismissed by clicking elsewhere.
    public func popoverDidClose(_ notification: Notification) {
        guard let popover = notification.object as? NSPopover else { return }
        if popover === pickerPopover {
            pickerPopover = nil
            pickerDrop = nil
            interaction.linking.dismissPendingDrop()
        } else if popover === inspectorPopover {
            inspectorPopover = nil
            inspectorConnectionId = nil
            session.document.updateCircuitUI { $0.closeInspector() }
        }
    }

    // MARK: - Context menu

    private func presentContextMenu(_ request: ContextMenuRequest) {
        let document = session.document
        guard let model = session.contextMenuModel(for: request.widgetId) else { return }
        contextMenuRequest = request
        let menu = SystemContextMenu.menu(model: model, document: document, actions: session.contextMenuActions)
        menu.popUp(positioning: nil, at: NSPoint(x: request.x, y: request.y), in: self)
    }

    /// The skin roller (`WidgetSkinRoller.tsx`): the card's title grows in
    /// place into a drum of skins over the blurred board. Every detent that
    /// passes the lane clicks the Force Touch trackpad.
    func presentSkinPicker(for id: String) {
        let document = session.document
        let chrome = session.environment.chrome
        guard chrome.skinRoller == nil, let widget = document.widget(id) else { return }
        let box = displayedWidgetRect(widget, restContext: interaction.restContext())
        let zoom = session.camera.frame.zoom
        let titleTop = interaction.toScreen(Vector2D(x: box.x, y: box.y - widgetTitleRowHeight))
        let height = widgetTitleRowHeight * zoom
        let centreY = titleTop.y + height / 2
        // `WidgetTitleRow`: 2 pt of padding, then the 26 pt icon tile.
        let anchor = SkinRollerModel.Anchor(
            left: titleTop.x + 2 * zoom,
            centreY: centreY,
            height: height,
            iconCentre: Vector2D(x: titleTop.x + 15 * zoom, y: centreY),
            iconSize: 26 * zoom
        )
        let haptics = Haptics.shared
        chrome.skinRoller = SkinRollerModel(
            document: document,
            widgetId: id,
            anchor: anchor,
            reducedMotion: NSWorkspace.shared.accessibilityDisplayShouldReduceMotion,
            onTick: { tick in haptics.tap(HapticKind(rawValue: tick.rawValue) ?? .detent) },
            onFinish: { [weak chrome] in chrome?.skinRoller = nil }
        )
    }

    /// A relation or dependency line's menu, as a system menu at the press.
    private func presentLineMenu(_ model: RelationLineMenuModel, at point: Vector2D) {
        let document = session.document
        let menu = NSMenu(title: model.title)
        menu.autoenablesItems = false
        let runner = LineMenuRunner(model: model, document: document)
        let header = NSMenuItem(title: model.title, action: nil, keyEquivalent: "")
        header.isEnabled = false
        menu.addItem(header)
        if let subtitle = model.subtitle {
            let item = NSMenuItem(title: subtitle, action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
        }
        menu.addItem(.separator())
        for (index, row) in model.rows.enumerated() {
            if let section = row.header {
                if index > 0 { menu.addItem(.separator()) }
                menu.addItem(NSMenuItem.sectionHeader(title: section))
            } else if row.danger {
                menu.addItem(.separator())
            }
            let item = NSMenuItem(title: row.label, action: #selector(LineMenuRunner.run(_:)), keyEquivalent: "")
            item.target = runner
            item.tag = index
            item.state = row.checked ? .on : .off
            if row.danger {
                item.attributedTitle = NSAttributedString(string: row.label, attributes: [.foregroundColor: NSColor.systemRed])
            }
            menu.addItem(item)
        }
        // The runner lives as long as the menu is up.
        objc_setAssociatedObject(menu, &LineMenuRunner.key, runner, .OBJC_ASSOCIATION_RETAIN)
        menu.popUp(positioning: nil, at: NSPoint(x: point.x, y: point.y), in: self)
    }

    // MARK: - Selection outline

    // A resting tile wears its own ring (`CardLayer.setSelected`), so it
    // leans and lifts with the tile; an open card draws its own in SwiftUI.

    // MARK: - Event translation

    static func modifiers(_ flags: NSEvent.ModifierFlags) -> PointerModifiers {
        var result: PointerModifiers = []
        if flags.contains(.shift) { result.insert(.shift) }
        if flags.contains(.option) { result.insert(.alt) }
        if flags.contains(.control) { result.insert(.ctrl) }
        if flags.contains(.command) { result.insert(.cmd) }
        return result
    }

    /// AppKit numbers buttons 0/1/2 = left/right/middle; the engine uses the
    /// DOM's 0/1/2 = primary/middle/secondary.
    static func domButton(_ buttonNumber: Int) -> Int {
        switch buttonNumber {
        case 1: return 2
        case 2: return 1
        default: return buttonNumber
        }
    }

    private func pointerEvent(_ event: NSEvent, phase: PointerPhase) -> PointerEvent {
        PointerEvent(
            id: 1, kind: .mouse, phase: phase,
            point: viewportPoint(event),
            button: MacCanvasHostView.domButton(Int(event.buttonNumber)),
            timestamp: event.timestamp * 1000,
            modifiers: MacCanvasHostView.modifiers(event.modifierFlags),
            isEmptyCanvas: true
        )
    }

    public override func mouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)
        if interaction.resizeBegin(atScreen: viewportPoint(event)) { return }
        // A double-click on empty canvas starts the tree shaper right there,
        // as on the web (`CanvasViewport.handleDoubleClick`); ⌘N and the
        // palette add a single widget. Modifiers keep their own meanings.
        if event.clickCount == 2, event.modifierFlags.intersection([.command, .shift, .option, .control]).isEmpty {
            let world = toWorld(viewportPoint(event))
            switch interaction.pressTarget(atWorld: world) {
            case .empty:
                session.environment.chrome.treeShaper.start(at: world)
                return
            case .card(let id):
                // The first click already opened it; the second fills the
                // window with it (the web's full-screen sheet) — but only if
                // it is let go where it was pressed. A quick second press
                // that drags is a drag, so the sheet waits for `mouseUp`.
                pendingDoubleClick = id
            default:
                break
            }
        }
        interaction.pointerDown(pointerEvent(event, phase: .down))
    }

    /// The collaboration cursor follows the pointer, in world space.
    private func notePointer(_ event: NSEvent) {
        guard session.isAttached else { return }
        session.coordinator.notePointer(interaction.toWorld(viewportPoint(event)))
    }

    public override func mouseDragged(with event: NSEvent) {
        notePointer(event)
        if interaction.isResizing { interaction.resizeMove(toScreen: viewportPoint(event)); return }
        interaction.pointerMove(pointerEvent(event, phase: .move))
    }

    public override func mouseUp(with event: NSEvent) {
        if interaction.isResizing { interaction.resizeEnd(atScreen: viewportPoint(event)); return }
        let double = pendingDoubleClick
        pendingDoubleClick = nil
        // Read before the release clears it: nil once the press travelled.
        let stayed = double != nil && interaction.pressedCardId == double
        interaction.pointerUp(pointerEvent(event, phase: .up))
        if stayed, let double { interaction.doubleClickCard(double) }
    }

    /// The system's frame-resize cursor for an armed edge, the arrow when none.
    static func resizeCursor(for edge: ResizeEdge?) -> NSCursor {
        guard let edge else { return .arrow }
        let position: NSCursor.FrameResizePosition
        switch (edge.x, edge.y) {
        case (-1, -1): position = .topLeft
        case (1, -1): position = .topRight
        case (-1, 1): position = .bottomLeft
        case (1, 1): position = .bottomRight
        case (-1, _): position = .left
        case (1, _): position = .right
        case (_, -1): position = .top
        default: position = .bottom
        }
        return .frameResize(position: position, directions: .all)
    }

    public override func otherMouseDown(with event: NSEvent) {
        releaseFollow()
        interaction.gesture.pointer(pointerEvent(event, phase: .down))
    }

    /// `releaseFollowForManualGesture`: a deliberate camera gesture takes the
    /// view back from a followed collaborator.
    private func releaseFollow() {
        guard session.isAttached else { return }
        session.coordinator.releaseFollowForManualGesture()
    }
    public override func otherMouseDragged(with event: NSEvent) { interaction.gesture.pointer(pointerEvent(event, phase: .move)) }
    public override func otherMouseUp(with event: NSEvent) { interaction.gesture.pointer(pointerEvent(event, phase: .up)) }

    public override func rightMouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)
        let point = viewportPoint(event)
        if case .card(let id) = interaction.pressTarget(atWorld: toWorld(point)) {
            interaction.requestContextMenu(id, screen: point)
            return
        }
        interaction.gesture.pointer(pointerEvent(event, phase: .down))
    }

    public override func rightMouseUp(with event: NSEvent) { interaction.gesture.pointer(pointerEvent(event, phase: .up)) }

    public override func mouseMoved(with event: NSEvent) {
        notePointer(event)
        interaction.updateResizeHover(atScreen: viewportPoint(event))
        defer { interaction.updateLean(atScreen: viewportPoint(event)) }
        var moved = pointerEvent(event, phase: .move)
        moved.id = 0
        interaction.gesture.pointer(moved)
    }

    public override func mouseExited(with event: NSEvent) {
        if session.isAttached { session.coordinator.notePointer(nil) }
        interaction.updateResizeHover(atScreen: nil)
        interaction.updateLean(atScreen: nil)
        interaction.pointerExited()
    }

    public override func scrollWheel(with event: NSEvent) {
        releaseFollow()
        interaction.wheel(MacCanvasHostView.wheelEvent(event, point: viewportPoint(event)))
    }

    /// AppKit scroll deltas in the DOM's `WheelEvent` convention, which is what
    /// `GestureEngine` speaks (it is a port of `gestureEngine.ts`). AppKit's
    /// deltas are positive toward the top-left, the DOM's toward the
    /// bottom-right, so both axes are negated.
    ///
    /// Vertical once looked inverted here, and was briefly "fixed" by passing
    /// it through. That was wrong: the board was being DRAWN upside down (see
    /// `WorldHostView.ensureWorldFlipped`), which made every vertical movement
    /// look reversed — dragging included. With the picture the right way up,
    /// the symmetric conversion is correct, and `MacCanvasHostTests` pins it.
    enum MacWheelSign {
        static let horizontal: Double = -1
        static let vertical: Double = -1
    }

    static func wheelEvent(_ event: NSEvent, point: Vector2D) -> WheelEvent {
        let flags = event.modifierFlags
        return WheelEvent(
            delta: Vector2D(
                x: MacWheelSign.horizontal * event.scrollingDeltaX,
                y: MacWheelSign.vertical * event.scrollingDeltaY
            ),
            ctrlOrCmd: flags.contains(.control) || flags.contains(.command),
            lineMode: !event.hasPreciseScrollingDeltas,
            point: point
        )
    }

    /// Trackpad pinch: the same zoom-at-cursor a Ctrl+wheel gives.
    public override func magnify(with event: NSEvent) {
        releaseFollow()
        interaction.magnify(by: event.magnification, at: viewportPoint(event))
    }

    /// `CanvasKey` for an AppKit event, or nil for a key the canvas ignores.
    static func canvasKey(keyCode: UInt16, characters: String?) -> CanvasKey? {
        switch keyCode {
        case 49: return .space
        case 51, 117: return .delete
        case 53: return .escape
        case 123: return .arrow(.left)
        case 124: return .arrow(.right)
        case 125: return .arrow(.down)
        case 126: return .arrow(.up)
        case 120: return .f2
        default:
            switch characters?.lowercased() {
            case "z": return .z
            case "w": return .w
            case "h": return .h
            case "v": return .v
            case "f": return .f
            case "n": return .n
            case "x": return .x
            case "+", "=": return .plus
            case "-", "_": return .minus
            case "0": return .zero
            case "?", "/": return .question
            default: return nil
            }
        }
    }

    static func keyModifiers(_ flags: NSEvent.ModifierFlags) -> CanvasKeyModifiers {
        var result: CanvasKeyModifiers = []
        if flags.contains(.command) { result.insert(.command) }
        if flags.contains(.shift) { result.insert(.shift) }
        if flags.contains(.option) { result.insert(.option) }
        if flags.contains(.control) { result.insert(.control) }
        return result
    }

    /// Whether a text field owns the keyboard (the web's `isEditableTarget`).
    var editableTargetFocused: Bool { KeyboardTargetGuard.isEditable(window?.firstResponder) }

    public override func keyDown(with event: NSEvent) {
        guard let key = MacCanvasHostView.canvasKey(keyCode: event.keyCode, characters: event.charactersIgnoringModifiers),
              let action = CanvasKeyRouting.keyDown(key, modifiers: MacCanvasHostView.keyModifiers(event.modifierFlags), isRepeat: event.isARepeat, editableTargetFocused: editableTargetFocused)
        else { super.keyDown(with: event); return }
        perform(action)
    }

    public override func keyUp(with event: NSEvent) {
        guard let key = MacCanvasHostView.canvasKey(keyCode: event.keyCode, characters: event.charactersIgnoringModifiers),
              let action = CanvasKeyRouting.keyUp(key, editableTargetFocused: editableTargetFocused)
        else { super.keyUp(with: event); return }
        perform(action)
    }

    func perform(_ action: CanvasKeyAction) { interaction.perform(action) }

    // MARK: - Edit menu (first-responder actions)

    // The system Copy / Cut / Paste / Select All rows reach the canvas through
    // the responder chain while it holds the keyboard; a text field inside a
    // card is first responder instead whenever it is editing, so typing keeps
    // its own clipboard.
    @objc func copy(_ sender: Any?) { interaction.copySelection() }
    @objc func cut(_ sender: Any?) { interaction.cutSelection() }
    @objc func paste(_ sender: Any?) { interaction.paste() }
    public override func selectAll(_ sender: Any?) { interaction.selectAll() }

    public func validateMenuItem(_ item: NSMenuItem) -> Bool {
        switch item.action {
        case #selector(copy(_:)), #selector(cut(_:)): return !session.document.selection.isEmpty
        case #selector(paste(_:)): return interaction.canPaste
        case #selector(selectAll(_:)): return !interaction.activeWidgets.isEmpty
        default: return true
        }
    }

    // MARK: - Title-strip drags (move)

    func titleMouseDown(_ event: NSEvent) {
        window?.makeFirstResponder(self)
        if interaction.resizeBegin(atScreen: viewportPoint(event)) { return }
        let world = toWorld(viewportPoint(event))
        // A double-click on the name renames the card, as on the web.
        if event.clickCount == 2, let id = interaction.titleStripWidgetId(atWorld: world) {
            session.environment.chrome.renamingWidgetId = id
            return
        }
        interaction.titleDragBegin(atWorld: world, additive: event.modifierFlags.contains(.shift), glue: !event.modifierFlags.isDisjoint(with: [.option, .command]))
    }

    func titleMouseDragged(_ event: NSEvent) {
        if interaction.isResizing { interaction.resizeMove(toScreen: viewportPoint(event)); return }
        interaction.cardDragMove(toWorld: toWorld(viewportPoint(event)))
    }

    func titleMouseUp(_ event: NSEvent) {
        if interaction.isResizing { interaction.resizeEnd(atScreen: viewportPoint(event)); return }
        interaction.cardDragEnd()
    }
}

/// The scene's canvas slot on the Mac.
public struct MacCanvasSlot: NSViewRepresentable {
    public let session: WindowSession

    public init(session: WindowSession) {
        self.session = session
    }

    public func makeNSView(context: Context) -> MacCanvasHostView {
        MacCanvasHostView(session: session, screenScale: NSScreen.main?.backingScaleFactor ?? 2)
    }

    public func updateNSView(_ view: MacCanvasHostView, context: Context) {}
}
/// Runs a line menu row through its model.
@MainActor
final class LineMenuRunner: NSObject {
    nonisolated(unsafe) static var key: UInt8 = 0
    let model: RelationLineMenuModel
    let document: BoardDocument

    init(model: RelationLineMenuModel, document: BoardDocument) {
        self.model = model
        self.document = document
    }

    @objc func run(_ sender: NSMenuItem) {
        guard model.rows.indices.contains(sender.tag) else { return }
        model.run(model.rows[sender.tag].action, document: document)
    }
}
#endif
