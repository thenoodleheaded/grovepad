import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Circuit wire geometry (`utils/curve.ts`). Card-to-card relation and
// dependency lines are NOT here — they belong to EdgeRoute, which anchors
// them on real borders. A wire is different in kind: it runs port to port,
// always exiting right and entering left like a circuit trace, so it keeps
// its own curve.
// ---------------------------------------------------------------------------

public struct FlowCurve: Equatable, Sendable {
    /// Full cubic: M P0 C P1, P2, P3.
    public var curve: CubicCurve
    /// Exact curve point at t = 0.5 — where the mapping chip pins.
    public var mid: Vector2D

    public var svgPath: String { curve.svgPath }
}

/// Port-oriented cubic for field wires: the curve always EXITS the source
/// port horizontally to the right and ENTERS the target port horizontally
/// from the left, like a circuit trace.
///
/// Tangent reach adapts to the endpoints' actual layout:
/// - Cards side by side → reach shrinks toward a tight, short bow.
/// - Far apart → reach grows (capped) so the curve stretches gracefully.
/// - Target BEHIND the source (dx < 0) → reach grows with the overlap plus
///   a share of the vertical gap, producing a clean S-loop around the cards
///   instead of a pinched hairpin.
///
/// Pure math over two points — callers feed world coordinates, so the
/// result is zoom/pan-invariant by construction.
public func flowCurve(start: Vector2D, end: Vector2D) -> FlowCurve {
    let curve = flowCurveGeometry(start: start, end: end)
    return FlowCurve(curve: curve, mid: curve.point(at: 0.5))
}

func flowCurveGeometry(start: Vector2D, end: Vector2D) -> CubicCurve {
    let dx = end.x - start.x
    let dy = end.y - start.y

    let reach: Double
    if dx >= 0 {
        // Forward run: mostly proportional to distance, tight when adjacent.
        reach = clamp(dx * 0.5 + abs(dy) * 0.08, 24, 220)
    } else {
        // Backward run: push the tangents out past both cards to loop around.
        reach = clamp(-dx * 0.55 + abs(dy) * 0.22 + 48, 72, 320)
    }

    return CubicCurve(
        start: start,
        c1: Vector2D(x: start.x + reach, y: start.y),
        c2: Vector2D(x: end.x - reach, y: end.y),
        end: end
    )
}
