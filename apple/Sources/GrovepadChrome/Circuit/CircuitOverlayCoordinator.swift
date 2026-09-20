#if canImport(QuartzCore)
import Foundation
import QuartzCore
import CoreGraphics
import Observation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// Keeps the Canvas `EdgeLayer` fed with the wire layer (`WireLayer` in
// WireLayer.tsx as a subscription): every document commit, rest-state or
// circuit-UI change rebuilds the descriptors, the ghost wire and the chips
// and applies them in one transaction. Fire pulses are keyed by their
// timestamp, so a delivery replays the 900 ms sweep once; the coordinator
// re-arms itself at the end of the pulse window to drop the key again.
// Reduced motion hands the paint context the flag: no sweep, colour only.
// ---------------------------------------------------------------------------

public final class CircuitOverlayCoordinator {
    public let document: BoardDocument
    public let edgeLayer: EdgeLayer
    /// The footprint context wires and rails share (the app's factory).
    public var restContext: () -> RestContext
    /// `prefers-reduced-motion`.
    public var reducedMotion: () -> Bool
    public var lightTheme: () -> Bool
    public var clock: Clock
    /// Runs `block` after `seconds`; returns a cancel. Injected so tests
    /// drive the pulse window by hand. The default is the main queue.
    public var schedule: (TimeInterval, @escaping () -> Void) -> () -> Void
    /// Where the wire under the pointer is reported (`hoveredWireId`).
    public var hoveredWireId: String? {
        didSet { if hoveredWireId != oldValue { refresh() } }
    }
    public var visibleWorldRect = WorldRect(x: -1e9, y: -1e9, width: 2e9, height: 2e9)
    /// The camera's zoom, read from the edge layer the camera keeps current
    /// (`CanvasHostController` sets it on every committed frame). One owner:
    /// a second copy here fell behind the camera, and every refresh then
    /// restyled the lines for the wrong zoom — thick zoomed out, thin in.
    public var zoom: Double { edgeLayer.zoom }

    /// The ghost wire's own layers, mounted above the settled edges.
    public let ghostLayer = CALayer()
    private let ghostHalo = CAShapeLayer()
    private let ghostStroke = CAShapeLayer()
    private let ghostDot = CAShapeLayer()
    /// Midpoint chips (live values in Circuit Mode, `!` on damped wires).
    public let chipLayer = CALayer()
    private var chipLayers: [String: CALayer] = [:]

    public private(set) var lastFrame = WireLayerFrame()
    /// Relation and dependency lines from the last refresh (`RelationLineModel`).
    public private(set) var lineDescriptors: [EdgeDescriptor] = []
    /// Everything the edge layer draws: relation and dependency lines under
    /// the wires, as the web stacks its three layers.
    public var edgeDescriptors: [EdgeDescriptor] { lineDescriptors + lastFrame.descriptors }
    public private(set) var lastGhost: GhostWirePaint?
    public private(set) var refreshes = 0
    private var unsubscribe: (() -> Void)?
    private var cancelPulseRearm: (() -> Void)?
    private var observing = false

    public init(
        document: BoardDocument,
        edgeLayer: EdgeLayer,
        restContext: @escaping () -> RestContext,
        clock: Clock = .system,
        reducedMotion: @escaping () -> Bool = { false },
        lightTheme: @escaping () -> Bool = { false },
        schedule: ((TimeInterval, @escaping () -> Void) -> () -> Void)? = nil
    ) {
        self.document = document
        self.edgeLayer = edgeLayer
        self.restContext = restContext
        self.clock = clock
        self.reducedMotion = reducedMotion
        self.lightTheme = lightTheme
        self.schedule = schedule ?? { seconds, block in
            let item = DispatchWorkItem(block: block)
            DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: item)
            return { item.cancel() }
        }
        let silent: [String: CAAction] = ["path": NSNull(), "position": NSNull(), "hidden": NSNull(), "lineWidth": NSNull(), "lineDashPattern": NSNull(), "sublayers": NSNull(), "bounds": NSNull(), "contents": NSNull()]
        for shape in [ghostHalo, ghostStroke, ghostDot] {
            shape.fillColor = nil
            shape.lineCap = .round
            shape.actions = silent
            ghostLayer.addSublayer(shape)
        }
        ghostLayer.actions = silent
        ghostLayer.isHidden = true
        chipLayer.actions = silent
        edgeLayer.addSublayer(ghostLayer)
        edgeLayer.addSublayer(chipLayer)
    }

    /// Subscribe to document commits and observe the circuit UI; returns a
    /// disposer. Calling it twice returns the same disposer.
    @discardableResult
    public func start() -> () -> Void {
        if unsubscribe == nil {
            unsubscribe = document.subscribe { [weak self] in self?.refresh() }
            observeUI()
            refresh()
        }
        return { [weak self] in self?.stop() }
    }

    public func stop() {
        unsubscribe?()
        unsubscribe = nil
        cancelPulseRearm?()
        cancelPulseRearm = nil
        observing = false
    }

    /// Drag moves, Circuit Mode, fire pulses and hover are not commits; the
    /// observation tracker catches them. Changes land after `onChange`, so the
    /// refresh is deferred to the next main-queue turn.
    private func observeUI() {
        guard unsubscribe != nil, !observing else { return }
        observing = true
        withObservationTracking {
            _ = document.circuitUI
            _ = document.hoverWidgetId
            _ = document.expandedWidgetId
            _ = document.activeCanvasId
        } onChange: { [weak self] in
            DispatchQueue.main.async {
                guard let self, self.unsubscribe != nil else { return }
                self.observing = false
                self.refresh()
                self.observeUI()
            }
        }
    }

    /// Rebuild and apply everything. Safe to call from anywhere on the main
    /// thread; the app calls it on camera changes (`visibleWorldRect`, `zoom`).
    public func refresh() {
        refreshes += 1
        let now = clock.nowMs()
        let context = restContext()
        let ui = document.circuitUI
        // Wires are circuit: none drawn while the system is frozen.
        let frame = !CircuitFeature.isEnabled ? WireLayerFrame() : WireLayerModel.frame(
            board: document.board,
            canvasId: document.activeCanvasId,
            restContext: context,
            circuitUI: ui,
            now: now,
            hoverWidgetId: document.hoverWidgetId,
            hoveredWireId: hoveredWireId,
            visibleRect: visibleWorldRect
        )
        lastFrame = frame
        let board = document.board
        let hoverAccent = document.hoverWidgetId.flatMap { id in
            board.widgets[id].flatMap { widget in WidgetRegistry.definition(for: widget.type)?.accent(for: widget.data) }
        }
        var strictCarriers: Set<String> = []
        for relation in board.relations.values where relation.type == .parent && !strictCarriers.contains(relation.fromId) {
            if document.resolveStrictHold(relation.fromId).strict { strictCarriers.insert(relation.fromId) }
        }
        lineDescriptors = RelationLineModel.descriptors(
            board: board, canvasId: document.activeCanvasId, restContext: context,
            hoverWidgetId: document.hoverWidgetId, hoverAccent: hoverAccent, hoveredLineId: hoveredWireId,
            strictCarriers: strictCarriers, visibleRect: visibleWorldRect
        )
        edgeLayer.paintContext = EdgePaintContext(circuitMode: ui.circuitMode, reducedMotion: reducedMotion(), lightTheme: lightTheme())
        edgeLayer.apply(edgeDescriptors, visibleWorldRect: visibleWorldRect, zoom: zoom)

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        applyGhost(!CircuitFeature.isEnabled ? nil : ui.wireDrag.flatMap { WireLayerModel.ghostWire(drag: $0, board: document.board, restContext: context) })
        applyChips(frame.chips)
        // Keep the overlays above the settled edges the layer just mounted.
        ghostLayer.removeFromSuperlayer()
        chipLayer.removeFromSuperlayer()
        edgeLayer.addSublayer(chipLayer)
        edgeLayer.addSublayer(ghostLayer)
        CATransaction.commit()

        rearmPulseWindow(frame.descriptors, now: now)
    }

    // MARK: Pulses

    /// After the newest pulse leaves the window, refresh once more so its
    /// key is dropped from the descriptor (`pulseKey: null`).
    private func rearmPulseWindow(_ descriptors: [EdgeDescriptor], now: Double) {
        cancelPulseRearm?()
        cancelPulseRearm = nil
        let newest = descriptors.compactMap(\.pulseKey).max()
        guard let newest else { return }
        let remaining = max(0, WireLayerModel.pulseWindowMs - (now - newest)) / 1000 + 0.01
        cancelPulseRearm = schedule(remaining) { [weak self] in
            guard let self else { return }
            self.cancelPulseRearm = nil
            self.refresh()
        }
    }

    /// Whether a re-arm is scheduled (test seam).
    public var pulseRearmPending: Bool { cancelPulseRearm != nil }

    // MARK: Ghost

    private func applyGhost(_ ghost: GhostWirePaint?) {
        lastGhost = ghost
        guard let ghost else {
            ghostLayer.isHidden = true
            return
        }
        ghostLayer.isHidden = false
        let path = cgPath(ghost.curve)
        let color = cgColor(ghost.color)
        ghostHalo.path = path
        ghostHalo.strokeColor = color
        ghostHalo.opacity = Float(GhostWirePaint.haloOpacity)
        // In world units like every connector: it zooms with the board.
        ghostHalo.lineWidth = CGFloat(max(GhostWirePaint.haloWidth, 0.5 / zoom))
        ghostStroke.path = path
        ghostStroke.strokeColor = color
        ghostStroke.lineWidth = CGFloat(max(GhostWirePaint.strokeWidth, 0.5 / zoom))
        ghostStroke.lineDashPattern = GhostWirePaint.dash.map { NSNumber(value: $0) }
        let radius = CGFloat(GhostWirePaint.cursorRadius / zoom)
        ghostDot.path = CGPath(ellipseIn: CGRect(x: ghost.cursor.x - radius, y: ghost.cursor.y - radius, width: radius * 2, height: radius * 2), transform: nil)
        ghostDot.fillColor = color
        ghostDot.strokeColor = nil
        let marching = ghostStroke.animation(forKey: "gp-wire-ghost") != nil
        if reducedMotion() {
            if marching { ghostStroke.removeAnimation(forKey: "gp-wire-ghost") }
        } else if !marching {
            let march = CABasicAnimation(keyPath: "lineDashPhase")
            march.fromValue = 0
            // `@keyframes gp-wire-dash { to { stroke-dashoffset: -24 } }` —
            // the ghost's own march, not the edge layer's -18.
            march.toValue = -24
            march.duration = 0.6
            march.repeatCount = .infinity
            ghostStroke.add(march, forKey: "gp-wire-ghost")
        }
    }

    // MARK: Chips

    private func applyChips(_ chips: [WireChip]) {
        var seen = Set<String>()
        for chip in chips {
            seen.insert(chip.connectionId)
            let layer = chipLayers[chip.connectionId] ?? makeChipLayer()
            chipLayers[chip.connectionId] = layer
            if layer.superlayer == nil { chipLayer.addSublayer(layer) }
            CircuitOverlayCoordinator.style(layer, chip: chip, zoom: zoom, scale: edgeLayer.screenScale)
        }
        for (id, layer) in chipLayers where !seen.contains(id) {
            layer.removeFromSuperlayer()
            chipLayers[id] = nil
        }
    }

    private func makeChipLayer() -> CALayer {
        let layer = CALayer()
        let background = CAShapeLayer()
        background.name = "background"
        let text = CATextLayer()
        text.name = "text"
        text.alignmentMode = .center
        text.truncationMode = .none
        text.isWrapped = false
        let silent: [String: CAAction] = ["path": NSNull(), "position": NSNull(), "bounds": NSNull(), "string": NSNull(), "fontSize": NSNull(), "foregroundColor": NSNull()]
        layer.actions = silent
        background.actions = silent
        text.actions = silent
        layer.addSublayer(background)
        layer.addSublayer(text)
        return layer
    }

    /// The web chip: 18 px tall, 6.8 px per character plus 14, 10 px text,
    /// in screen pixels (`non-scaling-stroke`), so divide by zoom.
    static func style(_ layer: CALayer, chip: WireChip, zoom: Double, scale: CGFloat) {
        let units = Double(chip.text.utf16.count)
        let width = (chip.damped ? 18 : units * 6.8 + 14) / zoom
        let height = 18 / zoom
        layer.bounds = CGRect(x: 0, y: 0, width: width, height: height)
        layer.position = CGPoint(x: chip.position.x, y: chip.position.y)
        if let background = layer.sublayers?.first(where: { $0.name == "background" }) as? CAShapeLayer {
            let rect = CGRect(x: 0, y: 0, width: width, height: height)
            background.path = chip.damped ? CGPath(ellipseIn: rect, transform: nil) : CGPath(roundedRect: rect, cornerWidth: height / 2, cornerHeight: height / 2, transform: nil)
            background.fillColor = cgColor(chip.damped ? "#111827" : "#0c1017")
            background.strokeColor = cgColor(chip.color)
            background.opacity = 1
            background.lineWidth = CGFloat((chip.damped ? 1.4 : 1) / zoom)
        }
        if let text = layer.sublayers?.first(where: { $0.name == "text" }) as? CATextLayer {
            text.string = chip.text
            text.fontSize = CGFloat(10 / zoom)
            text.foregroundColor = cgColor(chip.color)
            text.contentsScale = scale
            text.frame = CGRect(x: 0, y: (height - 12 / zoom) / 2, width: width, height: 12 / zoom)
        }
    }

    /// The chip under a world point, if any (test/hit seam).
    public func chipHit(at world: Vector2D) -> WireChip? { chip(at: world) }

    /// The chip under a world point, if any.
    public func chip(at world: Vector2D) -> WireChip? {
        lastFrame.chips.first { chip in
            let width = (chip.damped ? 18 : Double(chip.text.utf16.count) * 6.8 + 14) / zoom
            let height = 18 / zoom
            return abs(chip.position.x - world.x) <= width / 2 && abs(chip.position.y - world.y) <= height / 2
        }
    }
}

/// `#rgb`, `#rrggbb` or `#rrggbbaa` in sRGB (the Canvas edge renderer keeps
/// its own copy internal).
func cgColor(_ hex: String) -> CGColor {
    var text = hex.trimmingCharacters(in: .whitespaces)
    if text.hasPrefix("#") { text.removeFirst() }
    if text.count == 3 { text = text.map { "\($0)\($0)" }.joined() }
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    guard text.count == 6 || text.count == 8, let value = UInt64(text, radix: 16) else {
        return CGColor(colorSpace: space, components: [0, 0, 0, 0])!
    }
    let hasAlpha = text.count == 8
    let r = Double((value >> (hasAlpha ? 24 : 16)) & 0xFF) / 255
    let g = Double((value >> (hasAlpha ? 16 : 8)) & 0xFF) / 255
    let b = Double((value >> (hasAlpha ? 8 : 0)) & 0xFF) / 255
    let a = hasAlpha ? Double(value & 0xFF) / 255 : 1
    return CGColor(colorSpace: space, components: [r, g, b, a])!
}

func cgPath(_ curve: CubicCurve) -> CGPath {
    let path = CGMutablePath()
    path.move(to: CGPoint(x: curve.start.x, y: curve.start.y))
    path.addCurve(to: CGPoint(x: curve.end.x, y: curve.end.y), control1: CGPoint(x: curve.c1.x, y: curve.c1.y), control2: CGPoint(x: curve.c2.x, y: curve.c2.y))
    return path
}
#endif
