import XCTest
import GrovepadCore
@testable import GrovepadCanvas

final class EdgeRouteTests: XCTestCase {
    func node(_ x: Double, _ y: Double, _ w: Double, _ h: Double, pill: EdgePill? = nil) -> EdgeNode {
        EdgeNode(frame: rect(x, y, w, h), pill: pill)
    }

    func testAlignedPairRendersStraightWithColinearControlPoints() {
        // A child sitting directly under its parent: both land on the shared
        // centre x, the control points sit on that same vertical, and the
        // route leaves the bottom into the top.
        let parent = node(100, 0, 200, 100)
        let child = node(100, 300, 200, 100)
        let route = routeEdge(from: parent, to: child)
        XCTAssertEqual(route.startSide, .bottom)
        XCTAssertEqual(route.endSide, .top)
        XCTAssertEqual(route.start.x, 200)
        XCTAssertEqual(route.end.x, 200)
        XCTAssertEqual(route.curve.c1.x, 200)
        XCTAssertEqual(route.curve.c2.x, 200)
        XCTAssertEqual(route.mid.x, 200)
        // Tangents reach half the forward run: (288 - 112) / 2 = 88 each.
        XCTAssertEqual(route.curve.c1.y, route.start.y + 88, accuracy: 1e-9)
        XCTAssertEqual(route.curve.c2.y, route.end.y - 88, accuracy: 1e-9)
    }

    func testStandoffDistanceIsExactlyPointThreeCells() {
        let parent = node(100, 0, 200, 100)
        let child = node(100, 300, 200, 100)
        let route = routeEdge(from: parent, to: child)
        XCTAssertEqual(EdgeRouting.lineStandoff, 12)
        XCTAssertEqual(route.start.y, 100 + 12)
        XCTAssertEqual(route.end.y, 300 - 12)
        // Side by side: the same gap on the horizontal borders.
        let left = node(0, 0, 100, 100)
        let right = node(400, 0, 100, 100)
        let sideways = routeEdge(from: left, to: right)
        XCTAssertEqual(sideways.startSide, .right)
        XCTAssertEqual(sideways.endSide, .left)
        XCTAssertEqual(sideways.start.x, 112)
        XCTAssertEqual(sideways.end.x, 388)
        XCTAssertEqual(sideways.start.y, 50)
        XCTAssertEqual(sideways.end.y, 50)
    }

    func testAttachLowerAndUpperPinTheStrictHoldHalves() {
        // The child sits beside and slightly above the parent: free routing
        // would use the facing horizontal sides; a strict hold keeps the line
        // in the parent's lower half and the child's upper half.
        let parent = node(0, 0, 200, 200)
        let child = node(400, -100, 200, 200)
        let free = routeEdge(from: parent, to: child)
        XCTAssertEqual(free.startSide, .right)
        XCTAssertEqual(free.endSide, .left)
        let strict = routeEdge(from: parent, to: child, attachFrom: .lower, attachTo: .upper)
        XCTAssertGreaterThanOrEqual(strict.start.y, parent.center.y, "leaves from the lower half")
        XCTAssertLessThanOrEqual(strict.end.y, child.center.y, "enters the upper half")
        XCTAssertNotEqual(strict.startSide, .top)
        XCTAssertNotEqual(strict.endSide, .bottom)
    }

    func testStrictHalvesStillRouteTopDownIntoAShortCard() {
        // A 40-tall card keeps its standoff on the bottom border even when
        // the strict halves narrow every horizontal landing range.
        let tiny = node(0, 0, 200, 40)
        let below = node(0, 300, 200, 100)
        let route = routeEdge(from: below, to: tiny, attachFrom: .upper, attachTo: .lower)
        XCTAssertEqual(route.startSide, .top)
        XCTAssertEqual(route.endSide, .bottom)
        XCTAssertEqual(route.end.y, 40 + 12)
    }

    func testMidpointIsTheCubicAtHalf() {
        let route = routeEdge(from: node(0, 0, 100, 100), to: node(300, 200, 100, 100))
        let half = route.curve.point(at: 0.5)
        XCTAssertEqual(route.mid.x, half.x, accuracy: 1e-9)
        XCTAssertEqual(route.mid.y, half.y, accuracy: 1e-9)
    }

    func testPillIsDodgedAlongTheTopBorder() {
        let child = node(0, 0, 200, 100, pill: EdgePill(cx: 40, cy: -20, rx: 40, ry: 16))
        let parent = node(0, -300, 100, 100)
        let route = routeEdge(from: parent, to: child)
        XCTAssertEqual(route.endSide, .top)
        // The landing point slid right past the capsule (+ clearance).
        XCTAssertGreaterThanOrEqual(route.end.x, 40 + 40 + 12 - 1e-9)
    }

    func testSvgPathMatchesTheWebFormat() {
        let curve = CubicCurve(start: Vector2D(x: 0, y: 0), c1: Vector2D(x: 10.5, y: 0), c2: Vector2D(x: 20, y: 30), end: Vector2D(x: 30, y: 30))
        XCTAssertEqual(curve.svgPath, "M 0 0 C 10.5 0 20 30 30 30")
    }

    func testRouteToPointLeavesTheFacingBorder() {
        let source = node(0, 0, 100, 100)
        let curve = routeEdgeToPoint(from: source, point: Vector2D(x: 400, y: 50))
        XCTAssertEqual(curve.start.x, 112)
        XCTAssertEqual(curve.start.y, 50)
        XCTAssertEqual(curve.end, Vector2D(x: 400, y: 50))
    }

    func testFlowCurveExitsRightAndEntersLeft() {
        let forward = flowCurve(start: Vector2D(x: 0, y: 0), end: Vector2D(x: 200, y: 40))
        XCTAssertEqual(forward.curve.c1.y, 0)
        XCTAssertEqual(forward.curve.c2.y, 40)
        XCTAssertEqual(forward.curve.c1.x, 100 + 40 * 0.08, accuracy: 1e-9)
        XCTAssertEqual(forward.curve.c2.x, 200 - (100 + 40 * 0.08), accuracy: 1e-9)
        let backward = flowCurve(start: Vector2D(x: 200, y: 0), end: Vector2D(x: 0, y: 0))
        XCTAssertEqual(backward.curve.c1.x, 200 + 158, accuracy: 1e-9)
        XCTAssertEqual(backward.curve.c2.x, -158, accuracy: 1e-9)
        let tight = flowCurve(start: .zero, end: Vector2D(x: 10, y: 0))
        XCTAssertEqual(tight.curve.c1.x, 24)
    }

    func testDependencyAnchorsUseFixedRails() {
        let prerequisite = node(0, 0, 100, 100)
        let dependent = node(300, 150, 100, 100)
        let anchors = DependencyGeometry.anchors(prerequisite: prerequisite, dependent: dependent)
        XCTAssertEqual(anchors.start.x, 112)
        XCTAssertEqual(anchors.end.x, 288)
        // y slides toward the other endpoint, inset 24 from the corners.
        XCTAssertEqual(anchors.start.y, 76)
        XCTAssertEqual(anchors.end.y, 174)
        let route = DependencyGeometry.route(prerequisite: prerequisite, dependent: dependent)
        XCTAssertEqual(route.startSide, .right)
        XCTAssertEqual(route.endSide, .left)
        XCTAssertEqual(DependencyGeometry.statusLabel(dependentTitle: "Essay", prerequisiteTitles: ["Notes", ""]), "Essay waiting on Notes")
        XCTAssertEqual(DependencyGeometry.statusLabel(dependentTitle: "Essay", prerequisiteTitles: []), "Essay waiting on dependency")
    }

    func testEdgePaintFollowsTheSharedPolicy() {
        let curve = CubicCurve(start: .zero, c1: .zero, c2: .zero, end: .zero)
        let parent = edgePaint(for: EdgeDescriptor(id: "r", route: curve, mid: .zero, semantics: .relation(type: .parent, strict: true, hoverAccent: nil)))
        XCTAssertEqual(parent.main.color, EdgeColors.relationOutlineDark)
        XCTAssertEqual(parent.main.width, 3, "strict parent draws a point heavier")
        XCTAssertEqual(parent.halo?.opacity, 0)
        XCTAssertEqual(parent.flow?.opacity, 0)
        XCTAssertEqual(parent.hitWidth, 14)
        XCTAssertNil(parent.highlight)

        let resolvedBlocker = edgePaint(for: EdgeDescriptor(id: "b", route: curve, mid: .zero, semantics: .relation(type: .blocker, strict: false, hoverAccent: nil), resolved: true, highlighted: true))
        XCTAssertEqual(resolvedBlocker.main.color, EdgeColors.relationMuted)
        XCTAssertEqual(resolvedBlocker.main.dash, [6, 4])
        XCTAssertEqual(resolvedBlocker.highlight?.color, EdgeColors.criticalPath)

        let hoveredCousin = edgePaint(for: EdgeDescriptor(id: "c", route: curve, mid: .zero, semantics: .relation(type: .cousin, strict: false, hoverAccent: "#123456"), connected: true))
        XCTAssertEqual(hoveredCousin.main.opacity, 0.2)
        XCTAssertEqual(hoveredCousin.main.color, "#123456")
        XCTAssertEqual(hoveredCousin.flow?.opacity, 1)
        XCTAssertTrue(hoveredCousin.flow!.animated)
        XCTAssertFalse(edgePaint(for: EdgeDescriptor(id: "c", route: curve, mid: .zero, semantics: .relation(type: .cousin, strict: false, hoverAccent: nil), connected: true), context: EdgePaintContext(reducedMotion: true)).flow!.animated)

        let dependency = edgePaint(for: EdgeDescriptor(id: "d", route: curve, mid: .zero, semantics: .dependency))
        XCTAssertEqual(dependency.track?.opacity, 0.12)
        XCTAssertEqual(dependency.main.width, 2.2)
        XCTAssertEqual(dependency.hitWidth, 16)
        XCTAssertEqual(dependency.endArrowColor, EdgeColors.dependency)
        let resolvedDependency = edgePaint(for: EdgeDescriptor(id: "d", route: curve, mid: .zero, semantics: .dependency, resolved: true))
        XCTAssertEqual(resolvedDependency.main.dash, [4, 6])
        XCTAssertEqual(resolvedDependency.main.width, 1.5)
        XCTAssertEqual(resolvedDependency.track?.opacity, 0.06)

        let wire = edgePaint(for: EdgeDescriptor(id: "w", route: curve, mid: .zero, semantics: .wire(valueType: .number, isTrigger: false, enabled: true, damped: false), pulseKey: 42))
        XCTAssertEqual(wire.main.color, WireColors.hex(for: .number))
        XCTAssertEqual(wire.main.opacity, 0.6)
        XCTAssertEqual(wire.main.width, 2.1)
        XCTAssertEqual(wire.pulse?.durationMs, 900)
        XCTAssertEqual(wire.pulse?.dashFractions, [0.35, 1])
        let trigger = edgePaint(for: EdgeDescriptor(id: "t", route: curve, mid: .zero, semantics: .wire(valueType: nil, isTrigger: true, enabled: true, damped: false)))
        XCTAssertEqual(trigger.main.color, WireColors.trigger)
        XCTAssertEqual(trigger.main.dash, [5, 5])
        XCTAssertEqual(trigger.main.width, 1.8)
        let disabled = edgePaint(for: EdgeDescriptor(id: "x", route: curve, mid: .zero, semantics: .wire(valueType: .text, isTrigger: false, enabled: false, damped: false), pulseKey: 1))
        XCTAssertEqual(disabled.main.color, EdgeColors.wireDisabled)
        XCTAssertEqual(disabled.main.dash, [2, 5])
        XCTAssertNil(disabled.pulse, "a disabled wire never pulses")
        let damped = edgePaint(for: EdgeDescriptor(id: "y", route: curve, mid: .zero, semantics: .wire(valueType: .text, isTrigger: false, enabled: true, damped: true)))
        XCTAssertEqual(damped.main.color, EdgeColors.wireDamped)
        let circuitMode = edgePaint(for: EdgeDescriptor(id: "w", route: curve, mid: .zero, semantics: .wire(valueType: .boolean, isTrigger: false, enabled: true, damped: false)), context: EdgePaintContext(circuitMode: true))
        XCTAssertEqual(circuitMode.main.opacity, 0.95)
        XCTAssertEqual(circuitMode.halo?.opacity, 0.1)

        // Cascade order, not statement order. `body[data-circuit-mode]
        // .gp-canvas-edge-wire .gp-canvas-edge-main` is (0,3,1);
        // `.gp-canvas-edge-wire:hover .gp-canvas-edge-main` is (0,3,0). So
        // circuit mode holds the opacity while hover still widens the stroke.
        func wirePaintUnder(circuit: Bool, hovered: Bool = false, warning: Bool = false) -> EdgePaintStack {
            edgePaint(
                for: EdgeDescriptor(id: "w", route: curve, mid: .zero, semantics: .wire(valueType: .boolean, isTrigger: false, enabled: true, damped: false), warning: warning, hovered: hovered),
                context: EdgePaintContext(circuitMode: circuit)
            )
        }
        let hoveredInCircuit = wirePaintUnder(circuit: true, hovered: true)
        XCTAssertEqual(hoveredInCircuit.main.opacity, 0.95, "circuit mode outscores hover on opacity")
        XCTAssertEqual(hoveredInCircuit.main.width, 2.4, "hover is the only rule that sets stroke-width")
        XCTAssertEqual(hoveredInCircuit.halo?.opacity, 0.1, "and on the halo too")
        let hoveredOnly = wirePaintUnder(circuit: false, hovered: true)
        XCTAssertEqual(hoveredOnly.main.opacity, 1)
        XCTAssertEqual(hoveredOnly.halo?.opacity, 0.14)
        // The warning rule sits later in the sheet at equal specificity, so
        // it takes the opacity from hover — and still loses to circuit mode.
        XCTAssertEqual(wirePaintUnder(circuit: false, hovered: true, warning: true).main.opacity, 0.9)
        XCTAssertEqual(wirePaintUnder(circuit: false, warning: true).main.color, "#f87171")
        XCTAssertEqual(wirePaintUnder(circuit: true, warning: true).main.opacity, 0.95)
        XCTAssertEqual(wirePaintUnder(circuit: true, warning: true).main.color, "#f87171", "only the warning rule sets stroke")
    }
}
