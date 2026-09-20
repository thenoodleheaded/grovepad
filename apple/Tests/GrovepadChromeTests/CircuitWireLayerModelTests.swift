import XCTest
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// `WireLayerModel` against `WireLayer.tsx`: endpoints on the rails, colour
/// by the source field's flavour, trigger dash, disabled dots, damped red
/// with its `!` chip, the ghost wire, chip text, pulses and culling.
final class CircuitWireLayerModelTests: XCTestCase {

    /// These tests exercise the circuit system, which the app ships frozen
    /// (`CircuitFeature`); each switches it on for itself only.
    override func invokeTest() {
        let previous = CircuitFeature.isEnabled
        CircuitFeature.isEnabled = true
        defer { CircuitFeature.isEnabled = previous }
        super.invokeTest()
    }
    private func wiredDocument() -> (BoardDocument, counter: String, goal: String, toggle: String) {
        let (document, _, _) = makeDocument()
        let counter = document.createWidget(type: "counter", at: Vector2D(x: 0, y: 0), title: "Tally")!
        let goal = document.createWidget(type: "goal_tracker", at: Vector2D(x: 400, y: 0), title: "Goal")!
        let toggle = document.createWidget(type: "toggle", at: Vector2D(x: 0, y: 400), title: "Switch")!
        return (document, counter, goal, toggle)
    }

    private func frame(_ document: BoardDocument, _ id: String) -> WorldRect { document.widget(id)!.frame }

    func testEndpointsSitOnTheRailsAndTheCurveIsTheFlowCurve() throws {
        let (document, counter, goal, _) = wiredDocument()
        let id = try XCTUnwrap(document.addValueConnection(from: counter, field: "count", to: goal, field: "percent"))
        let descriptors = WireLayerModel.wireDescriptors(document: document, restContext: .none, now: 0)
        let wire = try XCTUnwrap(descriptors.first { $0.id == id })
        let outs = outputPortsFor("counter")
        let ins = inputPortsFor("goal_tracker")
        let start = PortGeometry.portWorldPosition(frame: frame(document, counter), side: .output, index: findOutputPort("counter", "count")!.index, count: outs.count)
        let end = PortGeometry.portWorldPosition(frame: frame(document, goal), side: .input, index: findInputPort("goal_tracker", "percent", .field)!.index, count: ins.count)
        XCTAssertEqual(wire.route.start, start)
        XCTAssertEqual(wire.route.end, end)
        XCTAssertEqual(wire.route, flowCurve(start: start, end: end).curve)
        XCTAssertEqual(wire.mid, flowCurve(start: start, end: end).mid)
        XCTAssertEqual(start.x, 280, "output rail is the right edge")
        XCTAssertEqual(end.x, 400, "input rail is the left edge")
        XCTAssertEqual(wire.variant, .wire)
    }

    func testWiresLandOnTheOnScreenFootprint() throws {
        let (document, counter, goal, _) = wiredDocument()
        _ = document.addValueConnection(from: counter, field: "count", to: goal, field: "percent")
        let rest = WidgetRestContextFactory.make()
        let resting = displayedWidgetRect(document.widget(counter)!, restContext: rest)
        XCTAssertNotEqual(resting, frame(document, counter), "a counter rests as a smaller tile")
        let wire = try XCTUnwrap(WireLayerModel.wireDescriptors(document: document, restContext: rest, now: 0).first)
        XCTAssertEqual(wire.route.start.x, resting.maxX, "the wire leaves the tile's edge, not the dormant card's")
    }

    func testColourFollowsTheSourceFlavourAndTriggersAreRoseDashed() throws {
        let (document, counter, goal, toggle) = wiredDocument()
        let value = try XCTUnwrap(document.addValueConnection(from: counter, field: "count", to: goal, field: "percent"))
        let bool = try XCTUnwrap(document.addValueConnection(from: toggle, field: "value", to: counter, field: "count"))
        let trigger = try XCTUnwrap(document.addTriggerConnection(from: toggle, field: "value", to: counter, command: "increment", edge: .rising))
        let descriptors = WireLayerModel.wireDescriptors(document: document, restContext: .none, now: 0)
        let byId = Dictionary(uniqueKeysWithValues: descriptors.map { ($0.id, $0) })
        XCTAssertEqual(byId[value]?.semantics, .wire(valueType: .number, isTrigger: false, enabled: true, damped: false))
        XCTAssertEqual(edgePaint(for: byId[value]!).main.color, WireColors.hex(for: .number))
        XCTAssertEqual(byId[bool]?.semantics, .wire(valueType: .boolean, isTrigger: false, enabled: true, damped: false))
        XCTAssertEqual(edgePaint(for: byId[bool]!).main.color, WireColors.hex(for: .boolean))
        XCTAssertEqual(byId[trigger]?.semantics, .wire(valueType: nil, isTrigger: true, enabled: true, damped: false))
        let triggerPaint = edgePaint(for: byId[trigger]!)
        XCTAssertEqual(triggerPaint.main.color, WireColors.trigger)
        XCTAssertEqual(triggerPaint.main.dash, [5, 5])
        XCTAssertEqual(WireLayerModel.color(for: document.board.connections[trigger]!, source: document.widget(toggle)!), WireColors.trigger)
    }

    func testDisabledIsGreyDottedAndDampedIsRedWithABangChip() throws {
        let (document, counter, goal, _) = wiredDocument()
        let id = try XCTUnwrap(document.addValueConnection(from: counter, field: "count", to: goal, field: "percent"))
        document.setConnectionEnabled(id, false)
        var frame = WireLayerModel.frame(board: document.board, canvasId: document.activeCanvasId, restContext: .none, circuitUI: document.circuitUI, now: 0)
        var paint = edgePaint(for: frame.descriptors[0])
        XCTAssertEqual(paint.main.color, EdgeColors.wireDisabled)
        XCTAssertEqual(paint.main.dash, [2, 5])
        XCTAssertTrue(frame.chips.isEmpty)

        document.setConnectionEnabled(id, true)
        document.dampConnections([id])
        frame = WireLayerModel.frame(board: document.board, canvasId: document.activeCanvasId, restContext: .none, circuitUI: document.circuitUI, now: 0)
        paint = edgePaint(for: frame.descriptors[0])
        XCTAssertEqual(paint.main.color, EdgeColors.wireDamped)
        XCTAssertEqual(frame.chips.count, 1)
        XCTAssertEqual(frame.chips[0].text, "!")
        XCTAssertTrue(frame.chips[0].damped)
        XCTAssertEqual(frame.chips[0].position, frame.descriptors[0].mid)
        XCTAssertNil(paint.pulse, "a damped wire never pulses")
    }

    func testValueChipsAppearInCircuitModeOnlyAndCarryTheTransformedValue() throws {
        let (document, counter, goal, _) = wiredDocument()
        document.setField(counter, "count", .number(4))
        let id = try XCTUnwrap(document.addValueConnection(from: counter, field: "count", to: goal, field: "percent", transform: .scale(factor: 10)))
        var frame = WireLayerModel.frame(board: document.board, canvasId: document.activeCanvasId, restContext: .none, circuitUI: document.circuitUI, now: 0)
        XCTAssertTrue(frame.chips.isEmpty, "quiet by default")
        document.setCircuitMode(true)
        frame = WireLayerModel.frame(board: document.board, canvasId: document.activeCanvasId, restContext: .none, circuitUI: document.circuitUI, now: 0)
        XCTAssertEqual(frame.chips.map(\.text), ["40"])
        XCTAssertEqual(frame.chips[0].color, WireColors.hex(for: .number))
        XCTAssertEqual(WireLayerModel.valueChip(for: document.board.connections[id]!, board: document.board), "40")
        XCTAssertNil(WireLayerModel.valueChip(for: .trigger(id: "t", fromId: counter, fromField: "count", toId: goal, command: "reset", edge: .rising), board: document.board))
    }

    func testShortValueMatchesTheWebFormatting() {
        XCTAssertEqual(WireLayerModel.shortValue(.number(1234.5)), "1235")
        XCTAssertEqual(WireLayerModel.shortValue(.number(-1234.5)), "-1235")
        XCTAssertEqual(WireLayerModel.shortValue(.number(0.126)), "0.13")
        XCTAssertEqual(WireLayerModel.shortValue(.number(7)), "7")
        XCTAssertEqual(WireLayerModel.shortValue(.bool(true)), "on")
        XCTAssertEqual(WireLayerModel.shortValue(.bool(false)), "off")
        XCTAssertEqual(WireLayerModel.shortValue(.text("  hi  ")), "hi")
        XCTAssertEqual(WireLayerModel.shortValue(.text("")), "\"\"")
        XCTAssertEqual(WireLayerModel.shortValue(.text("abcdefghijklmnop")), "abcdefghijklm…")
        XCTAssertEqual(WireLayerModel.shortValue(.series([SeriesPoint(t: 0, v: 1), SeriesPoint(t: 1, v: 2)])), "2 pts")
    }

    func testPulseKeyIsTheFireTimestampWithinTheWindow() throws {
        let (document, counter, goal, _) = wiredDocument()
        let id = try XCTUnwrap(document.addValueConnection(from: counter, field: "count", to: goal, field: "percent"))
        document.recordFires([id], at: 10_000)
        let fresh = WireLayerModel.wireDescriptors(document: document, restContext: .none, now: 10_500)
        XCTAssertEqual(fresh[0].pulseKey, 10_000)
        XCTAssertNotNil(edgePaint(for: fresh[0]).pulse)
        XCTAssertEqual(edgePaint(for: fresh[0]).pulse?.durationMs, 900)
        XCTAssertNil(edgePaint(for: fresh[0], context: EdgePaintContext(reducedMotion: true)).pulse, "reduced motion: colour only")
        let stale = WireLayerModel.wireDescriptors(document: document, restContext: .none, now: 10_000 + WireLayerModel.pulseWindowMs)
        XCTAssertNil(stale[0].pulseKey)
    }

    func testGhostWireLeavesTheGrabbedDotInTheDragsColour() throws {
        let (document, counter, _, _) = wiredDocument()
        let drag = WireDrag(fromId: counter, fromField: "count", valueType: .number, cursorWorld: Vector2D(x: 600, y: 300))
        let ghost = try XCTUnwrap(WireLayerModel.ghostWire(drag: drag, board: document.board, restContext: .none))
        let start = PortGeometry.portWorldPosition(frame: frame(document, counter), side: .output, index: findOutputPort("counter", "count")!.index, count: outputPortsFor("counter").count)
        XCTAssertEqual(ghost.curve.start, start)
        XCTAssertEqual(ghost.curve.end, Vector2D(x: 600, y: 300))
        XCTAssertEqual(ghost.cursor, Vector2D(x: 600, y: 300))
        XCTAssertEqual(ghost.color, WireColors.hex(for: .number))
        let descriptor = try XCTUnwrap(WireLayerModel.ghostWireDescriptor(drag: drag, board: document.board, restContext: .none))
        XCTAssertEqual(descriptor.id, WireLayerModel.ghostId)
        XCTAssertTrue(descriptor.hovered)
        XCTAssertEqual(descriptor.route, ghost.curve)
        XCTAssertNil(WireLayerModel.ghostWire(drag: WireDrag(fromId: "nobody", fromField: "count", valueType: .number, cursorWorld: .zero), board: document.board, restContext: .none))
    }

    func testCullingAndCanvasScope() throws {
        let (document, counter, goal, _) = wiredDocument()
        _ = document.addValueConnection(from: counter, field: "count", to: goal, field: "percent")
        XCTAssertEqual(WireLayerModel.wireDescriptors(document: document, restContext: .none, now: 0, visibleRect: WorldRect(x: 0, y: 0, width: 800, height: 400)).count, 1)
        XCTAssertTrue(WireLayerModel.wireDescriptors(document: document, restContext: .none, now: 0, visibleRect: WorldRect(x: 5000, y: 5000, width: 10, height: 10)).isEmpty)
        XCTAssertTrue(WireLayerModel.wireDescriptors(document: document, canvasId: "elsewhere", restContext: .none, now: 0).isEmpty, "only the active canvas's wires")
    }

    func testHoveredEndpointMarksTheWireConnected() throws {
        let (document, counter, goal, _) = wiredDocument()
        let id = try XCTUnwrap(document.addValueConnection(from: counter, field: "count", to: goal, field: "percent"))
        document.hoverWidgetId = goal
        let wire = WireLayerModel.wireDescriptors(document: document, restContext: .none, now: 0, hoveredWireId: id)[0]
        XCTAssertTrue(wire.connected)
        XCTAssertTrue(wire.hovered)
        XCTAssertEqual(edgePaint(for: wire).main.width, 2.4, "hover strengthens the stroke")
    }
}
