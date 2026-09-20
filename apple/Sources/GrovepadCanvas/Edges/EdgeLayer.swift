#if canImport(QuartzCore)
import Foundation
import QuartzCore
import CoreGraphics
import GrovepadCore

// ---------------------------------------------------------------------------
// The edge renderer: one CAShapeLayer per stroke in the paint stack, grouped
// per edge and keyed by edge id. The layer sits inside the world layer, so
// paths are in world units and so are stroke widths: a line zooms with the
// board like the cards it joins, keeping one thickness relative to them
// (owner's rule, 19 Sep 2026 — a screen-constant stroke looked heavy zoomed
// out and thin zoomed in). Only a hairline floor holds it on screen far out. Descriptors outside the visible
// world rect are culled — their groups are removed, not hidden, so a huge
// board never holds thousands of idle shape layers.
// ---------------------------------------------------------------------------

extension CGColor {
    /// `#rgb`, `#rrggbb` or `#rrggbbaa` in sRGB. Unparseable input is clear.
    static func fromHex(_ hex: String) -> CGColor {
        var text = hex.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("#") { text.removeFirst() }
        if text.count == 3 { text = text.map { "\($0)\($0)" }.joined() }
        guard text.count == 6 || text.count == 8, let value = UInt64(text, radix: 16) else {
            return CGColor(colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, components: [0, 0, 0, 0])!
        }
        let hasAlpha = text.count == 8
        let r = Double((value >> (hasAlpha ? 24 : 16)) & 0xFF) / 255
        let g = Double((value >> (hasAlpha ? 16 : 8)) & 0xFF) / 255
        let b = Double((value >> (hasAlpha ? 8 : 0)) & 0xFF) / 255
        let a = hasAlpha ? Double(value & 0xFF) / 255 : 1
        return CGColor(colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, components: [r, g, b, a])!
    }
}

extension CubicCurve {
    var cgPath: CGPath {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: start.x, y: start.y))
        path.addCurve(
            to: CGPoint(x: end.x, y: end.y),
            control1: CGPoint(x: c1.x, y: c1.y),
            control2: CGPoint(x: c2.x, y: c2.y)
        )
        return path
    }
}

/// One edge's stack of shape layers.
final class EdgeGroupLayer: CALayer {
    enum Stroke: CaseIterable {
        case highlight, track, halo, main, flow, pulse, hit
    }

    private var shapes: [Stroke: CAShapeLayer] = [:]
    private(set) var descriptor: EdgeDescriptor?
    private(set) var stack: EdgePaintStack?
    private var appliedPulseKey: Double?
    private var pathLength = 0.0
    /// The route every shape in this group draws, kept so a stroke that
    /// mounts between route changes is born with it.
    private var currentPath: CGPath?

    override init() {
        super.init()
    }

    override init(layer: Any) {
        super.init(layer: layer)
    }

    required init?(coder: NSCoder) {
        nil
    }

    func shape(_ stroke: Stroke) -> CAShapeLayer? { shapes[stroke] }

    private func ensureShape(_ stroke: Stroke) -> CAShapeLayer {
        if let existing = shapes[stroke] { return existing }
        let layer = CAShapeLayer()
        layer.fillColor = nil
        // A stroke can appear long after the group mounted — a delivery
        // pulse, a critical-path highlight, a dependency's track — without
        // the route changing, so there is no path update coming to give it
        // one. Every `<EdgePath>` on the web is always handed its `d`; so is
        // every shape here, at birth.
        layer.path = currentPath
        layer.actions = ["path": NSNull(), "lineWidth": NSNull(), "strokeColor": NSNull(), "opacity": NSNull(), "lineDashPattern": NSNull(), "hidden": NSNull()]
        // Paint order is the stack order; insert by rank so a late-added
        // highlight still sits under the main stroke.
        let rank = Stroke.allCases.firstIndex(of: stroke)!
        let below = shapes.keys.filter { Stroke.allCases.firstIndex(of: $0)! < rank }.count
        shapes[stroke] = layer
        insertSublayer(layer, at: UInt32(below))
        return layer
    }

    private func removeShape(_ stroke: Stroke) {
        shapes[stroke]?.removeFromSuperlayer()
        shapes[stroke] = nil
    }

    func apply(_ descriptor: EdgeDescriptor, stack: EdgePaintStack, zoom: Double, scale: CGFloat, transition: LayerTransition? = nil) {
        let pathChanged = self.descriptor?.route != descriptor.route
        let path = pathChanged || shapes.isEmpty ? descriptor.route.cgPath : nil
        if pathChanged || shapes.isEmpty { pathLength = descriptor.route.approximateLength() }
        if let path { currentPath = path }
        self.descriptor = descriptor
        self.stack = stack

        func applyStroke(_ stroke: Stroke, _ style: EdgeLayerStyle?) {
            guard let style else {
                removeShape(stroke)
                return
            }
            let layer = ensureShape(stroke)
            layer.contentsScale = scale
            if let path { EdgeGroupLayer.setPath(layer, path, transition: transition) }
            EdgeGroupLayer.style(layer, style, zoom: zoom)
        }
        applyStroke(.highlight, stack.highlight)
        applyStroke(.track, stack.track)
        applyStroke(.halo, stack.halo)
        applyStroke(.main, stack.main)
        applyStroke(.flow, stack.flow)

        // The hit target: transparent, wide, always present.
        let hit = ensureShape(.hit)
        hit.contentsScale = scale
        if let path { EdgeGroupLayer.setPath(hit, path, transition: transition) }
        hit.strokeColor = CGColor(colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, components: [0, 0, 0, 0])
        hit.lineWidth = CGFloat(stack.hitWidth / zoom)
        hit.lineCap = .round

        applyPulse(stack.pulse, zoom: zoom, scale: scale, path: path)
    }

    private func applyPulse(_ pulse: EdgePulseStyle?, zoom: Double, scale: CGFloat, path: CGPath?) {
        guard let pulse else {
            removeShape(.pulse)
            appliedPulseKey = nil
            return
        }
        let layer = ensureShape(.pulse)
        layer.contentsScale = scale
        if let path { layer.path = path }
        layer.strokeColor = CGColor.fromHex(pulse.color)
        layer.lineWidth = EdgeGroupLayer.strokeWidth(pulse.width, zoom: zoom)
        layer.lineCap = .round
        // `pathLength={1}` normalises the dash to the path; emulate it with
        // the measured world length.
        let length = max(1, pathLength)
        layer.lineDashPattern = pulse.dashFractions.map { NSNumber(value: $0 * length) }
        guard appliedPulseKey != pulse.key else { return }
        appliedPulseKey = pulse.key
        layer.removeAllAnimations()
        let sweep = CABasicAnimation(keyPath: "lineDashPhase")
        sweep.fromValue = pulse.phaseFrom * length
        sweep.toValue = pulse.phaseTo * length
        let fade = CAKeyframeAnimation(keyPath: "opacity")
        fade.values = [1, 1, 0]
        fade.keyTimes = [0, 0.7, 1]
        let group = CAAnimationGroup()
        group.animations = [sweep, fade]
        group.duration = pulse.durationMs / 1000
        group.timingFunction = CAMediaTimingFunction(name: .easeOut)
        group.fillMode = .forwards
        group.isRemovedOnCompletion = false
        layer.opacity = 0
        layer.add(group, forKey: "gp-wire-fire")
    }

    /// A new route: with a `transition` (a card opening or closing at one
    /// end) the line bends to it on the card's curve instead of snapping.
    static func setPath(_ layer: CAShapeLayer, _ path: CGPath, transition: LayerTransition?) {
        let shown = (layer.presentation() ?? layer).path
        layer.path = path
        if let transition, let shown, shown != path { transition.animate(layer, "path", from: shown) }
    }

    /// A line's thickness in world units: its own width, scaling with the
    /// board, never thinner on screen than `hairline` points. The hit target
    /// (`hitWidth`) stays in screen points — it is for the pointer, not the eye.
    public static let hairline = 0.5
    static func strokeWidth(_ width: Double, zoom: Double) -> CGFloat {
        CGFloat(max(width, hairline / max(zoom, 0.0001)))
    }

    static func style(_ layer: CAShapeLayer, _ style: EdgeLayerStyle, zoom: Double) {
        layer.strokeColor = CGColor.fromHex(style.color)
        layer.lineWidth = EdgeGroupLayer.strokeWidth(style.width, zoom: zoom)
        layer.opacity = Float(style.opacity)
        layer.lineCap = style.lineCap == .round ? .round : .butt
        if let dash = style.dash {
            layer.lineDashPattern = dash.map { NSNumber(value: $0) }
        } else {
            layer.lineDashPattern = nil
        }
        let marching = layer.animation(forKey: "gp-edge-dash-march") != nil
        if style.animated, style.opacity > 0 {
            if !marching {
                let march = CABasicAnimation(keyPath: "lineDashPhase")
                march.fromValue = 0
                march.toValue = -18
                march.duration = 0.45
                march.repeatCount = .infinity
                layer.add(march, forKey: "gp-edge-dash-march")
            }
        } else if marching {
            layer.removeAnimation(forKey: "gp-edge-dash-march")
        }
    }

    /// Only the zoom changed: rescale every stroke, touch nothing else.
    func rescale(zoom: Double) {
        guard let stack else { return }
        func rescaleStroke(_ stroke: Stroke, _ style: EdgeLayerStyle?) {
            guard let style, let layer = shapes[stroke] else { return }
            layer.lineWidth = EdgeGroupLayer.strokeWidth(style.width, zoom: zoom)
        }
        rescaleStroke(.highlight, stack.highlight)
        rescaleStroke(.track, stack.track)
        rescaleStroke(.halo, stack.halo)
        rescaleStroke(.main, stack.main)
        rescaleStroke(.flow, stack.flow)
        shapes[.hit]?.lineWidth = CGFloat(stack.hitWidth / zoom)
        if let pulse = stack.pulse { shapes[.pulse]?.lineWidth = EdgeGroupLayer.strokeWidth(pulse.width, zoom: zoom) }
    }
}

/// The edge layer for one canvas: relations, dependencies and wires share it.
public final class EdgeLayer: CALayer {
    private var groups: [String: EdgeGroupLayer] = [:]
    /// Edge ids currently mounted, for tests and the host.
    public var mountedEdgeIds: Set<String> { Set(groups.keys) }
    public private(set) var zoom = 1.0
    /// Set for the one refresh in which a card opens or closes, so every
    /// route that moves because of it glides (`LayerTransition`).
    public var transition: LayerTransition?
    public var screenScale: CGFloat = 1
    public var paintContext = EdgePaintContext()

    public override init() {
        super.init()
        actions = ["sublayers": NSNull(), "contents": NSNull()]
    }

    public override init(layer: Any) {
        super.init(layer: layer)
    }

    public required init?(coder: NSCoder) {
        nil
    }

    /// Diff `descriptors` against the mounted groups: new edges mount,
    /// missing edges unmount, the rest update in place. Edges whose control
    /// bounds miss `visibleWorldRect` are culled.
    public func apply(_ descriptors: [EdgeDescriptor], visibleWorldRect: WorldRect, zoom: Double) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        self.zoom = zoom
        var seen = Set<String>()
        seen.reserveCapacity(descriptors.count)
        for descriptor in descriptors {
            guard descriptor.route.controlBounds.intersects(visibleWorldRect) else { continue }
            seen.insert(descriptor.id)
            let group: EdgeGroupLayer
            if let existing = groups[descriptor.id] {
                group = existing
            } else {
                group = EdgeGroupLayer()
                group.actions = ["sublayers": NSNull()]
                groups[descriptor.id] = group
                addSublayer(group)
            }
            group.apply(descriptor, stack: edgePaint(for: descriptor, context: paintContext), zoom: zoom, scale: screenScale, transition: transition)
        }
        for (id, group) in groups where !seen.contains(id) {
            group.removeFromSuperlayer()
            groups[id] = nil
        }
    }

    /// Zoom changed without any edge changing: stroke widths follow.
    public func setZoom(_ zoom: Double) {
        guard zoom != self.zoom else { return }
        self.zoom = zoom
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for group in groups.values { group.rescale(zoom: zoom) }
        CATransaction.commit()
    }

    /// The edge whose hit stroke contains `world`, if any (topmost wins).
    public func hitTest(world: Vector2D) -> String? {
        let point = CGPoint(x: world.x, y: world.y)
        for group in (sublayers ?? []).reversed() {
            guard let group = group as? EdgeGroupLayer, let hit = group.shape(.hit), let path = hit.path else { continue }
            let stroked = path.copy(strokingWithWidth: hit.lineWidth, lineCap: .round, lineJoin: .round, miterLimit: 10)
            if stroked.contains(point), let id = group.descriptor?.id { return id }
        }
        return nil
    }

    // Test seams.
    func group(for id: String) -> EdgeGroupLayer? { groups[id] }
}
#endif
