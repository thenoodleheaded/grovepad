import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Card-to-card line geometry (`utils/edgeRoute.ts`) — the single owner of
// where a relation or dependency line touches a widget and how it travels
// between two of them.
//
// Three rules define every route:
//
// 1. **The standoff.** A line stops exactly 0.3 of a grid cell short of the
//    card it points at — the same seam a glue weld carves — so the stroke
//    never merges into the glass edge.
// 2. **The closest facing pair.** Each end slides along its own border to the
//    point nearest the other card, on a side that actually faces it. Lines
//    never all sprout from one card's middle, and never leave a card heading
//    away from their destination.
// 3. **One cubic, tangent to both borders.** A route is a single curve whose
//    ends leave straight out of the borders they touch. When the two landing
//    points line up — which the anchor solver actively prefers — the control
//    points are colinear and the "curve" renders as a dead-straight line.
// ---------------------------------------------------------------------------

@inlinable func clamp(_ value: Double, _ lower: Double, _ upper: Double) -> Double {
    min(upper, max(lower, value))
}

/// One cubic Bézier: `M start C c1 c2 end`.
public struct CubicCurve: Equatable, Sendable {
    public var start: Vector2D
    public var c1: Vector2D
    public var c2: Vector2D
    public var end: Vector2D

    public init(start: Vector2D, c1: Vector2D, c2: Vector2D, end: Vector2D) {
        self.start = start
        self.c1 = c1
        self.c2 = c2
        self.end = end
    }

    public func point(at t: Double) -> Vector2D {
        let mt = 1 - t
        let mt2 = mt * mt
        let t2 = t * t
        return Vector2D(
            x: start.x * mt2 * mt + 3 * c1.x * mt2 * t + 3 * c2.x * mt * t2 + end.x * t2 * t,
            y: start.y * mt2 * mt + 3 * c1.y * mt2 * t + 3 * c2.y * mt * t2 + end.y * t2 * t
        )
    }

    /// The SVG path `d` the web writes, for parity checks.
    public var svgPath: String {
        "M \(JSNumberFormatter.string(start.x)) \(JSNumberFormatter.string(start.y)) C \(JSNumberFormatter.string(c1.x)) \(JSNumberFormatter.string(c1.y)) \(JSNumberFormatter.string(c2.x)) \(JSNumberFormatter.string(c2.y)) \(JSNumberFormatter.string(end.x)) \(JSNumberFormatter.string(end.y))"
    }

    /// Control polygon bounds: a cheap superset of the curve's extent.
    public var controlBounds: WorldRect {
        let minX = min(start.x, c1.x, c2.x, end.x)
        let maxX = max(start.x, c1.x, c2.x, end.x)
        let minY = min(start.y, c1.y, c2.y, end.y)
        let maxY = max(start.y, c1.y, c2.y, end.y)
        return WorldRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
    }

    /// Approximate arc length by flattening into `segments` chords.
    public func approximateLength(segments: Int = 24) -> Double {
        var length = 0.0
        var previous = start
        for index in 1...max(1, segments) {
            let next = point(at: Double(index) / Double(segments))
            let dx = next.x - previous.x
            let dy = next.y - previous.y
            length += (dx * dx + dy * dy).squareRoot()
            previous = next
        }
        return length
    }
}

public enum EdgeRouting {
    /// Gap between a card's border and any line touching it: 0.3 cell.
    public static let lineStandoff = CanvasGeometry.gridSize * 0.3
    /// How far a landing point stays clear of a card's rounded corner.
    static let cornerInset = CanvasGeometry.gridSize * 0.6
    /// Breathing room left around a floating name capsule a line has to dodge.
    static let pillClearance = lineStandoff
    /// Tangent lengths. Half the forward run keeps an offset pair reading as
    /// one gentle S; the floor keeps a very short hop from looking snapped
    /// straight, the ceiling keeps a long haul from ballooning.
    static let minReach = CanvasGeometry.gridSize * 0.4
    static let maxReach = CanvasGeometry.gridSize * 3.5
    /// A side that would send the line backwards is effectively disqualified.
    static let backtrackCost = 1_000_000.0
    /// Mild preference for two facing sides over a corner turn...
    static let turnCost = CanvasGeometry.gridSize * 1.5
    /// ...and a stronger one for a landing pair that renders perfectly straight.
    static let straightBonus = CanvasGeometry.gridSize * 2
    /// Below this the two anchors count as aligned on the perpendicular axis.
    static let straightEps = 0.5
}

public enum EdgeSide: String, Sendable, CaseIterable {
    case top
    case bottom
    case left
    case right

    var normal: Vector2D {
        switch self {
        case .top: return Vector2D(x: 0, y: -1)
        case .bottom: return Vector2D(x: 0, y: 1)
        case .left: return Vector2D(x: -1, y: 0)
        case .right: return Vector2D(x: 1, y: 0)
        }
    }

    var opposite: EdgeSide {
        switch self {
        case .top: return .bottom
        case .bottom: return .top
        case .left: return .right
        case .right: return .left
        }
    }

    var isVertical: Bool { self == .top || self == .bottom }
}

/// Which half of a node's border an endpoint may attach to. `lower`/`upper`
/// carry the strict-hold reading: a strict parent hands the line off from its
/// bottom half and the child takes it into its upper half, so a held family
/// reads top-down at a glance.
public enum EdgeAttach: Sendable {
    case free
    case lower
    case upper

    var sides: [EdgeSide] {
        switch self {
        case .free: return [.top, .bottom, .left, .right]
        case .lower: return [.bottom, .left, .right]
        case .upper: return [.top, .left, .right]
        }
    }
}

/// A floating name capsule, in world coordinates, that a line must not land
/// underneath.
public struct EdgePill: Equatable, Sendable {
    public var cx: Double
    public var cy: Double
    public var rx: Double
    public var ry: Double

    public init(cx: Double, cy: Double, rx: Double, ry: Double) {
        self.cx = cx
        self.cy = cy
        self.rx = rx
        self.ry = ry
    }
}

public struct EdgeNode: Equatable, Sendable {
    public var center: Vector2D
    public var halfW: Double
    public var halfH: Double
    public var pill: EdgePill?

    public init(center: Vector2D, halfW: Double, halfH: Double, pill: EdgePill? = nil) {
        self.center = center
        self.halfW = halfW
        self.halfH = halfH
        self.pill = pill
    }

    public init(frame: WorldRect, pill: EdgePill? = nil) {
        self.init(center: frame.center, halfW: frame.width / 2, halfH: frame.height / 2, pill: pill)
    }
}

public struct EdgeRoute: Equatable, Sendable {
    /// Always exactly one cubic.
    public var curve: CubicCurve
    /// The curve point at t = 0.5, where chips pin.
    public var mid: Vector2D
    public var start: Vector2D
    public var end: Vector2D
    public var startSide: EdgeSide
    public var endSide: EdgeSide

    /// The SVG `d` the web renders.
    public var svgPath: String { curve.svgPath }
}

/// A node's border pushed out by the standoff — every landing point lives on
/// this box, so the gap to the card is the same on all four sides.
struct StandoffBox {
    var left: Double
    var right: Double
    var top: Double
    var bottom: Double
    var cx: Double
    var cy: Double

    init(_ node: EdgeNode) {
        left = node.center.x - node.halfW - EdgeRouting.lineStandoff
        right = node.center.x + node.halfW + EdgeRouting.lineStandoff
        top = node.center.y - node.halfH - EdgeRouting.lineStandoff
        bottom = node.center.y + node.halfH + EdgeRouting.lineStandoff
        cx = node.center.x
        cy = node.center.y
    }

    func coord(_ side: EdgeSide) -> Double {
        switch side {
        case .top: return top
        case .bottom: return bottom
        case .left: return left
        case .right: return right
        }
    }

    /// The stretch of one side a line may land on: held back from both
    /// corners, and halved again when a strict hold pins the endpoint to the
    /// bottom or the top half of the card.
    func landingRange(_ side: EdgeSide, _ attach: EdgeAttach) -> (Double, Double) {
        let halfW = (right - left) / 2
        let halfH = (bottom - top) / 2
        let inset = max(0, min(EdgeRouting.cornerInset, halfW - 1, halfH - 1))
        if side.isVertical { return (left + inset, right - inset) }
        var lower = top + inset
        var upper = bottom - inset
        if attach == .lower { lower = max(lower, cy) }
        if attach == .upper { upper = min(upper, cy) }
        // A card small enough for its corner insets to swallow the allowed
        // half still needs somewhere to land: the halfway line itself.
        if lower > upper { return (cy, cy) }
        return (lower, upper)
    }
}

extension EdgeRouting {
    /// Both landing points at once, rather than each chasing the other's
    /// center. When the two sides slide on the SAME axis and their ranges
    /// overlap, both land on one shared coordinate — that is what makes a
    /// child sitting under its parent draw a perfectly straight line instead
    /// of a slight lean.
    static func pairAnchors(
        _ a: StandoffBox, _ sideA: EdgeSide, _ attachA: EdgeAttach,
        _ b: StandoffBox, _ sideB: EdgeSide, _ attachB: EdgeAttach
    ) -> (start: Vector2D, end: Vector2D) {
        let verticalA = sideA.isVertical
        let verticalB = sideB.isVertical
        let (aMin, aMax) = a.landingRange(sideA, attachA)
        let (bMin, bMax) = b.landingRange(sideB, attachB)
        let aFixed = a.coord(sideA)
        let bFixed = b.coord(sideB)

        if verticalA == verticalB {
            let aTarget = verticalA ? b.cx : b.cy
            let bTarget = verticalA ? a.cx : a.cy
            let low = max(aMin, bMin)
            let high = min(aMax, bMax)
            let aFree: Double
            let bFree: Double
            if low <= high {
                let shared = clamp((aTarget + bTarget) / 2, low, high)
                aFree = shared
                bFree = shared
            } else {
                aFree = clamp(aTarget, aMin, aMax)
                bFree = clamp(bTarget, bMin, bMax)
            }
            return verticalA
                ? (Vector2D(x: aFree, y: aFixed), Vector2D(x: bFree, y: bFixed))
                : (Vector2D(x: aFixed, y: aFree), Vector2D(x: bFixed, y: bFree))
        }

        // Mixed axes (a corner turn): each end simply slides toward the other card.
        return (
            verticalA ? Vector2D(x: clamp(b.cx, aMin, aMax), y: aFixed) : Vector2D(x: aFixed, y: clamp(b.cy, aMin, aMax)),
            verticalB ? Vector2D(x: clamp(a.cx, bMin, bMax), y: bFixed) : Vector2D(x: bFixed, y: clamp(a.cy, bMin, bMax))
        )
    }

    /// A widget's name capsule floats clear of its box, so a line landing on
    /// the top border would otherwise stop underneath it. Slide the landing
    /// point along its own border until it clears the capsule — the capsule
    /// is left-aligned with the card, so there is nearly always room on the
    /// far side. Only when the capsule covers the whole border does the point
    /// step outward past it instead.
    static func dodgePill(_ point: Vector2D, _ side: EdgeSide, _ range: (Double, Double), _ pill: EdgePill?) -> Vector2D {
        guard let pill else { return point }
        let rx = pill.rx + pillClearance
        let ry = pill.ry + pillClearance
        if abs(point.x - pill.cx) > rx || abs(point.y - pill.cy) > ry { return point }

        let (lower, upper) = range
        if side.isVertical {
            let past = pill.cx + rx
            let before = pill.cx - rx
            if past <= upper { return Vector2D(x: past, y: point.y) }
            if before >= lower { return Vector2D(x: before, y: point.y) }
            return Vector2D(
                x: point.x,
                y: side == .top ? min(point.y, pill.cy - ry) : max(point.y, pill.cy + ry)
            )
        }
        let below = pill.cy + ry
        let above = pill.cy - ry
        if below <= upper { return Vector2D(x: point.x, y: below) }
        if above >= lower { return Vector2D(x: point.x, y: above) }
        return Vector2D(
            x: side == .left ? min(point.x, pill.cx - rx) : max(point.x, pill.cx + rx),
            y: point.y
        )
    }

    static func dot(_ a: Vector2D, _ b: Vector2D) -> Double {
        a.x * b.x + a.y * b.y
    }

    static func routeCost(_ start: Vector2D, _ sideA: EdgeSide, _ end: Vector2D, _ sideB: EdgeSide) -> Double {
        let span = Vector2D(x: end.x - start.x, y: end.y - start.y)
        var cost = (span.x * span.x + span.y * span.y).squareRoot()
        if dot(span, sideA.normal) <= 0 { cost += backtrackCost }
        if dot(Vector2D(x: -span.x, y: -span.y), sideB.normal) <= 0 { cost += backtrackCost }
        if sideB != sideA.opposite {
            cost += turnCost
        } else {
            let drift = sideA.isVertical ? abs(span.x) : abs(span.y)
            if drift < straightEps { cost -= straightBonus }
        }
        return cost
    }

    /// How far a control point reaches out of its border.
    static func tangentReach(_ span: Vector2D, _ normal: Vector2D) -> Double {
        let forward = dot(span, normal)
        let lateral = abs(span.x * normal.y - span.y * normal.x)
        // Half the forward run and nothing else: two facing ends meet in the
        // middle, a pair that lines up renders dead straight, and a steep
        // climb keeps its turn close to the card. Padding this with a share
        // of the sideways run was tried and reads worse.
        if forward > 0 { return clamp(forward * 0.5, minReach, maxReach) }
        // The other end sits behind this border — only reachable when a
        // strict hold or a fixed rail pins the side. Bow out by a fraction of
        // the sideways run rather than looping.
        return clamp(lateral * 0.22, minReach, maxReach)
    }

    static func controlPoints(_ start: Vector2D, _ startSide: EdgeSide, _ end: Vector2D, _ endSide: EdgeSide) -> (c1: Vector2D, c2: Vector2D) {
        let span = Vector2D(x: end.x - start.x, y: end.y - start.y)
        let back = Vector2D(x: -span.x, y: -span.y)
        let startNormal = startSide.normal
        let endNormal = endSide.normal
        let startReach = tangentReach(span, startNormal)
        let endReach = tangentReach(back, endNormal)
        return (
            Vector2D(x: start.x + startNormal.x * startReach, y: start.y + startNormal.y * startReach),
            Vector2D(x: end.x + endNormal.x * endReach, y: end.y + endNormal.y * endReach)
        )
    }

    /// The cubic for a line that leaves `startSide` and enters `endSide`.
    public static func edgeCurve(start: Vector2D, startSide: EdgeSide, end: Vector2D, endSide: EdgeSide) -> CubicCurve {
        let (c1, c2) = controlPoints(start, startSide, end, endSide)
        return CubicCurve(start: start, c1: c1, c2: c2, end: end)
    }

    /// The same line's exact halfway point — where a status chip pins.
    public static func edgeMidpoint(start: Vector2D, startSide: EdgeSide, end: Vector2D, endSide: EdgeSide) -> Vector2D {
        let (c1, c2) = controlPoints(start, startSide, end, endSide)
        // A cubic at t = 0.5 reduces to the endpoints plus 3× each control
        // point, over 8.
        return Vector2D(
            x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8,
            y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8
        )
    }
}

/// The whole route between two cards: pick the cheapest facing pair of
/// sides, land both ends a standoff clear of the borders, and connect them
/// with one cubic. `attach` applies the strict-hold halves.
public func routeEdge(from: EdgeNode, to: EdgeNode, attachFrom: EdgeAttach = .free, attachTo: EdgeAttach = .free) -> EdgeRoute {
    let a = StandoffBox(from)
    let b = StandoffBox(to)

    var best: (cost: Double, start: Vector2D, end: Vector2D, startSide: EdgeSide, endSide: EdgeSide)?
    for sideA in attachFrom.sides {
        for sideB in attachTo.sides {
            let raw = EdgeRouting.pairAnchors(a, sideA, attachFrom, b, sideB, attachTo)
            let start = EdgeRouting.dodgePill(raw.start, sideA, a.landingRange(sideA, attachFrom), from.pill)
            let end = EdgeRouting.dodgePill(raw.end, sideB, b.landingRange(sideB, attachTo), to.pill)
            let cost = EdgeRouting.routeCost(start, sideA, end, sideB)
            if best == nil || cost < best!.cost {
                best = (cost, start, end, sideA, sideB)
            }
        }
    }
    // Every attach rule offers at least three sides per end, so a best route
    // always exists; the fallback only satisfies the type.
    let route = best ?? (0, from.center, to.center, .bottom, .top)
    return EdgeRoute(
        curve: EdgeRouting.edgeCurve(start: route.start, startSide: route.startSide, end: route.end, endSide: route.endSide),
        mid: EdgeRouting.edgeMidpoint(start: route.start, startSide: route.startSide, end: route.end, endSide: route.endSide),
        start: route.start,
        end: route.end,
        startSide: route.startSide,
        endSide: route.endSide
    )
}

/// A line from a card to a loose point — the cmd-drag link preview. It
/// leaves the card's border by the same rules a committed relation does, so
/// the preview starts where the real line will, and runs straight into the
/// cursor.
public func routeEdgeToPoint(from: EdgeNode, point: Vector2D) -> CubicCurve {
    let box = StandoffBox(from)
    var best: (cost: Double, start: Vector2D, side: EdgeSide)?
    for side in EdgeAttach.free.sides {
        let (lower, upper) = box.landingRange(side, .free)
        let fixed = box.coord(side)
        let raw = side.isVertical
            ? Vector2D(x: clamp(point.x, lower, upper), y: fixed)
            : Vector2D(x: fixed, y: clamp(point.y, lower, upper))
        let start = EdgeRouting.dodgePill(raw, side, (lower, upper), from.pill)
        let span = Vector2D(x: point.x - start.x, y: point.y - start.y)
        let cost = (span.x * span.x + span.y * span.y).squareRoot()
            + (EdgeRouting.dot(span, side.normal) <= 0 ? EdgeRouting.backtrackCost : 0)
        if best == nil || cost < best!.cost { best = (cost, start, side) }
    }
    let (start, side) = best.map { ($0.start, $0.side) } ?? (from.center, .bottom)
    let span = Vector2D(x: point.x - start.x, y: point.y - start.y)
    let normal = side.normal
    let reach = EdgeRouting.tangentReach(span, normal)
    let c1 = Vector2D(x: start.x + normal.x * reach, y: start.y + normal.y * reach)
    var length = (span.x * span.x + span.y * span.y).squareRoot()
    if length == 0 { length = 1 }
    let trail = clamp(length * 0.35, EdgeRouting.minReach, EdgeRouting.maxReach)
    let c2 = Vector2D(x: point.x - (span.x / length) * trail, y: point.y - (span.y / length) * trail)
    return CubicCurve(start: start, c1: c1, c2: c2, end: point)
}
