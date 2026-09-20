import XCTest
import GrovepadCore
@testable import GrovepadCanvas

/// The port-geometry scenarios from `engine/circuitEngine.test.ts`, over
/// port counts rather than field tables.
final class PortGeometryTests: XCTestCase {
    func testPortsSpreadAcrossTheEntireUsableSideNotACentreCluster() {
        // script_block has 11 input ports; on a tall card they must run from
        // the top corner padding to the bottom corner padding, evenly divided.
        let frame = rect(0, 0, 360, 480)
        let count = 11
        let first = PortGeometry.portWorldPosition(frame: frame, side: .input, index: 0, count: count)
        let last = PortGeometry.portWorldPosition(frame: frame, side: .input, index: count - 1, count: count)
        let padding = 26.0 // RAIL_PADDING — clear of the r0 corner radius
        XCTAssertEqual(first.y, frame.y + padding, accuracy: 1e-5)
        XCTAssertEqual(last.y, frame.y + frame.height - padding, accuracy: 1e-5)
        // Even division: consecutive gaps identical.
        let secondY = PortGeometry.portWorldPosition(frame: frame, side: .input, index: 1, count: count).y
        let thirdY = PortGeometry.portWorldPosition(frame: frame, side: .input, index: 2, count: count).y
        XCTAssertEqual(secondY - first.y, thirdY - secondY, accuracy: 1e-5)
        XCTAssertEqual(first.x, 0, "left rail")
        XCTAssertEqual(PortGeometry.portWorldPosition(frame: frame, side: .output, index: 0, count: 3).x, 360, "right rail")
    }

    func testCompressesDenseRailsInsideShortCardsInsteadOfPlacingPortsOutside() {
        let frame = rect(0, 0, 240, 80)
        let count = 11
        let positions = (0..<count).map { PortGeometry.portWorldPosition(frame: frame, side: .input, index: $0, count: count).y }
        XCTAssertGreaterThanOrEqual(positions.min()!, frame.y + 26)
        XCTAssertLessThanOrEqual(positions.max()!, frame.y + frame.height - 26)
    }

    func testACollapsedRailResolvesDropsToThePortItPaintsOnTop() {
        // A Clicker counter rests as a single 40px row, where portRailOffset
        // has no room to separate its four inputs and every dot lands on one
        // point. Drag resolves that point the way the painted rail does — the
        // last port.
        let frame = rect(2000, 2000, 80, 40)
        let count = 4
        let offsets = Set((0..<count).map { PortGeometry.portRailOffset(height: frame.height, index: $0, count: count) })
        XCTAssertEqual(offsets.count, 1) // the rail really is collapsed
        let aim = PortGeometry.portWorldPosition(frame: frame, side: .input, index: 0, count: count)
        let hit = findWireTarget(world: aim, candidates: [WireTargetCandidate(id: "counter", frame: frame, inputPortCount: count)], excludeId: "source")
        XCTAssertEqual(hit?.portIndex, count - 1)
    }

    func testPortGeometryIsDeterministicAndAgreesWithHitTesting() {
        let frame = rect(100, 100, 280, 200)
        let count = 3
        let at = PortGeometry.portWorldPosition(frame: frame, side: .input, index: 0, count: count)
        XCTAssertEqual(at.x, 100) // left rail
        XCTAssertEqual(PortGeometry.hitTestInputPort(frame: frame, portCount: count, world: at), 0)
        XCTAssertNil(PortGeometry.hitTestInputPort(frame: frame, portCount: count, world: Vector2D(x: at.x + 200, y: at.y)))
        let hit = findWireTarget(
            world: Vector2D(x: 140, y: 140),
            candidates: [WireTargetCandidate(id: "progress", frame: frame, inputPortCount: count)],
            excludeId: "someone-else"
        )
        XCTAssertEqual(hit?.widgetId, "progress")
        XCTAssertNil(hit?.portIndex)
    }

    func testPortsWinOverBodiesAndHigherBodiesWinOverLowerOnes() {
        let under = WireTargetCandidate(id: "under", frame: rect(0, 0, 300, 300), zIndex: 1, inputPortCount: 2)
        let over = WireTargetCandidate(id: "over", frame: rect(100, 100, 300, 300), zIndex: 5, inputPortCount: 2)
        let body = findWireTarget(world: Vector2D(x: 200, y: 200), candidates: [over, under])
        XCTAssertEqual(body?.widgetId, "over")
        // `under`'s port at (0, 26) is not covered by `over`; `over`'s left
        // rail port at (100, 126) lies inside `under`'s body: the port wins.
        let port = findWireTarget(world: Vector2D(x: 100, y: 126), candidates: [under, over])
        XCTAssertEqual(port?.widgetId, "over")
        XCTAssertEqual(port?.portIndex, 0)
        XCTAssertNil(findWireTarget(world: Vector2D(x: 200, y: 200), candidates: [over], excludeId: "over"))
        let portless = WireTargetCandidate(id: "sink", frame: rect(0, 0, 300, 300), inputPortCount: 0)
        XCTAssertNil(findWireTarget(world: Vector2D(x: 10, y: 10), candidates: [portless]), "a widget with no inputs is never a target")
    }

    func testSinglePortSitsAtTheVerticalCentre() {
        XCTAssertEqual(PortGeometry.portRailOffset(height: 200, index: 0, count: 1), 100)
        XCTAssertEqual(PortGeometry.portSpacing(height: 200, count: 1), 0)
        XCTAssertEqual(PortGeometry.portSpacing(height: 200, count: 3), 74)
    }
}
