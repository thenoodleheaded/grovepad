import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Dependency line endpoints (`utils/dependencyGeometry.ts`).
// ---------------------------------------------------------------------------

public enum DependencyGeometry {
    /// Every line on the board keeps the same 0.3-cell gap from the card it
    /// touches, dependencies included.
    public static let portStandoff = EdgeRouting.lineStandoff
    public static let portInset = 24.0

    public static func statusLabel(dependentTitle: String, prerequisiteTitles: [String]) -> String {
        let names = prerequisiteTitles.filter { !$0.isEmpty }.joined(separator: ", ")
        return "\(dependentTitle) waiting on \(names.isEmpty ? "dependency" : names)"
    }

    /// Dependencies are directional, unlike family-style relations: a
    /// prerequisite always leaves the right rail and enters the dependent on
    /// its left rail. The y coordinate still slides toward the other
    /// endpoint so the route stays short and does not pile every line onto
    /// the card center.
    public static func anchors(prerequisite: EdgeNode, dependent: EdgeNode) -> (start: Vector2D, end: Vector2D) {
        let prerequisiteInset = min(portInset, max(0, prerequisite.halfH - 1))
        let dependentInset = min(portInset, max(0, dependent.halfH - 1))
        return (
            Vector2D(
                x: prerequisite.center.x + prerequisite.halfW + portStandoff,
                y: clamp(
                    dependent.center.y,
                    prerequisite.center.y - prerequisite.halfH + prerequisiteInset,
                    prerequisite.center.y + prerequisite.halfH - prerequisiteInset
                )
            ),
            Vector2D(
                x: dependent.center.x - dependent.halfW - portStandoff,
                y: clamp(
                    prerequisite.center.y,
                    dependent.center.y - dependent.halfH + dependentInset,
                    dependent.center.y + dependent.halfH - dependentInset
                )
            )
        )
    }

    /// The full dependency route. Dependencies keep their fixed rails: out of
    /// the prerequisite's right edge, into the dependent's left one, drawn
    /// with the shared edge cubic (`edgePath(start, 'right', end, 'left')`).
    public static func route(prerequisite: EdgeNode, dependent: EdgeNode) -> EdgeRoute {
        let (start, end) = anchors(prerequisite: prerequisite, dependent: dependent)
        return EdgeRoute(
            curve: EdgeRouting.edgeCurve(start: start, startSide: .right, end: end, endSide: .left),
            mid: EdgeRouting.edgeMidpoint(start: start, startSide: .right, end: end, endSide: .left),
            start: start,
            end: end,
            startSide: .right,
            endSide: .left
        )
    }

    /// The web shows the status chip only on a line at least this long.
    public static let statusChipMinLength = 72.0
}
