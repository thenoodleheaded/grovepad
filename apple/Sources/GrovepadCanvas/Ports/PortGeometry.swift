import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Port geometry (`utils/portGeometry.ts`, the rail math) — the single source
// of truth for where a widget's circuit ports live. Pure math over frames
// and port COUNTS: the port lists themselves (which fields, which commands)
// are owned by GrovepadCore/Fields, so callers pass counts and indices.
// The wire layer, the port rail overlay, and drop hit-testing all call these
// functions, so they agree on coordinates.
//
// Layout: output ports (every readable field) stack on the RIGHT rail;
// input ports (settable fields first, then commands) stack on the LEFT rail.
// ---------------------------------------------------------------------------

public enum PortSide: Sendable {
    case input
    case output
}

public enum PortGeometry {
    /// Vertical padding each rail keeps from the card's top/bottom edge —
    /// clear of the rounded corner (r0 = 26) so no port ever sits on the curve.
    public static let railPadding = 26.0
    /// How far a drop may land from a port and still latch onto it (world px).
    public static let portHitRadius = 22.0

    /// Rail spacing for `count` ports on a card of the given height. Ports
    /// occupy the ENTIRE usable side (corner padding to corner padding),
    /// evenly divided — not clustered around the vertical center — so each
    /// port gets the maximum possible hit target and the rail reads as the
    /// card's full connective edge. Dense rails compress their spacing
    /// instead of overflowing beyond the card.
    public static func portSpacing(height: Double, count: Int) -> Double {
        if count <= 1 { return 0 }
        let padding = min(railPadding, max(0, height / 2))
        return max(0, height - padding * 2) / Double(count - 1)
    }

    /// Card-local y coordinate for a port. Shared by the painted rail and
    /// world-space wire geometry so a visible dot, its hover target, and its
    /// wire endpoint are always the same point.
    public static func portRailOffset(height: Double, index: Int, count: Int) -> Double {
        if count <= 1 { return height / 2 }
        let padding = min(railPadding, max(0, height / 2))
        return padding + Double(index) * portSpacing(height: height, count: count)
    }

    /// World position of one port on a widget's rail.
    public static func portWorldPosition(frame: WorldRect, side: PortSide, index: Int, count: Int) -> Vector2D {
        Vector2D(
            x: side == .output ? frame.x + frame.width : frame.x,
            y: frame.y + portRailOffset(height: frame.height, index: index, count: count)
        )
    }

    /// The input port nearest a world point, if within the hit radius. On a
    /// collapsed rail (every dot on one point) the LAST port wins, matching
    /// the dot painted on top.
    public static func hitTestInputPort(frame: WorldRect, portCount: Int, world: Vector2D) -> Int? {
        var best: Int?
        var bestDistance = portHitRadius
        for index in 0..<max(0, portCount) {
            let at = portWorldPosition(frame: frame, side: .input, index: index, count: portCount)
            let dx = at.x - world.x
            let dy = at.y - world.y
            let distance = (dx * dx + dy * dy).squareRoot()
            if distance <= bestDistance {
                best = index
                bestDistance = distance
            }
        }
        return best
    }
}

/// One card a wire drop can resolve against. `frame` is whatever box the
/// rail paints on (the resting tile, the expanded card, or the stored box).
public struct WireTargetCandidate: Equatable, Sendable {
    public var id: String
    public var frame: WorldRect
    public var zIndex: Double
    public var inputPortCount: Int

    public init(id: String, frame: WorldRect, zIndex: Double = 0, inputPortCount: Int) {
        self.id = id
        self.frame = frame
        self.zIndex = zIndex
        self.inputPortCount = inputPortCount
    }
}

public struct WireTargetHit: Equatable, Sendable {
    public var widgetId: String
    /// Nil for a body hit.
    public var portIndex: Int?
}

/// The widget/port under a world point — ports win over card bodies, and
/// among bodies the highest z-index wins (ties go to the later candidate,
/// as the web's `>=` does).
public func findWireTarget(world: Vector2D, candidates: [WireTargetCandidate], excludeId: String? = nil) -> WireTargetHit? {
    var portHit: WireTargetHit?
    var bodyHit: WireTargetHit?
    var bodyZ = -Double.infinity
    for candidate in candidates {
        if candidate.id == excludeId { continue }
        if candidate.inputPortCount == 0 { continue }
        if let port = PortGeometry.hitTestInputPort(frame: candidate.frame, portCount: candidate.inputPortCount, world: world) {
            portHit = WireTargetHit(widgetId: candidate.id, portIndex: port)
        }
        if candidate.frame.contains(world) {
            if candidate.zIndex >= bodyZ {
                bodyZ = candidate.zIndex
                bodyHit = WireTargetHit(widgetId: candidate.id, portIndex: nil)
            }
        }
    }
    return portHit ?? bodyHit
}
