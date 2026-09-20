import XCTest
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// `LinkingController` against `PortRail.tsx` and the field picker: drops on
/// ports, bodies and canvas, the single-writer rule, the suggested transform,
/// the tap-tap touch path, and drop resolution on the resting footprint.
final class CircuitLinkingControllerTests: XCTestCase {

    /// These tests exercise the circuit system, which the app ships frozen
    /// (`CircuitFeature`); each switches it on for itself only.
    override func invokeTest() {
        let previous = CircuitFeature.isEnabled
        CircuitFeature.isEnabled = true
        defer { CircuitFeature.isEnabled = previous }
        super.invokeTest()
    }
    struct Fixture {
        let document: BoardDocument
        let undo: UndoManager
        let controller: LinkingController
        let counter: String
        let goal: String
        let toggle: String
        let list: String
        var counterWidget: Widget { document.widget(counter)! }
        var goalWidget: Widget { document.widget(goal)! }
    }

    private func makeFixture(rest: RestContext = .none) -> Fixture {
        let (document, undo, _) = makeDocument()
        let counter = document.createWidget(type: "counter", at: Vector2D(x: 0, y: 0), title: "Tally")!
        let goal = document.createWidget(type: "goal_tracker", at: Vector2D(x: 400, y: 0), title: "Goal")!
        let toggle = document.createWidget(type: "toggle", at: Vector2D(x: 0, y: 400), title: "Switch")!
        let list = document.createWidget(type: "checklist", at: Vector2D(x: 400, y: 400), title: "Tasks")!
        let controller = LinkingController(document: document, restContext: { rest })
        return Fixture(document: document, undo: undo, controller: controller, counter: counter, goal: goal, toggle: toggle, list: list)
    }

    private func inputPort(_ widget: Widget, _ key: String, _ kind: PortKind) -> Vector2D {
        let ports = inputPortsFor(widget.type)
        let port = findInputPort(widget.type, key, kind)!
        return PortGeometry.portWorldPosition(frame: widget.frame, side: .input, index: port.index, count: ports.count)
    }

    func testDropOnAFieldPortDrawsAValueWireWithTheSuggestedTransform() throws {
        let f = makeFixture()
        XCTAssertTrue(f.controller.beginDrag(fromWidget: f.counter, field: "count", at: Vector2D(x: 280, y: 100)))
        XCTAssertEqual(f.controller.drag?.valueType, .number)
        let target = inputPort(f.goalWidget, "percent", .field)
        f.controller.moveDrag(toWorld: Vector2D(x: target.x + 5, y: target.y - 3))
        XCTAssertEqual(f.controller.drag?.hover, PortHover(widgetId: f.goal, portKey: "percent", portKind: .field), "compatible input glows")
        XCTAssertEqual(f.controller.drag?.cursorWorld, Vector2D(x: target.x + 5, y: target.y - 3))
        let outcome = f.controller.endDrag(atWorld: Vector2D(x: target.x + 5, y: target.y - 3))
        guard case .connected(let id) = outcome else { return XCTFail("expected a wire, got \(outcome)") }
        let wire = try XCTUnwrap(f.document.board.connections[id])
        XCTAssertEqual(wire.kind, .value)
        XCTAssertEqual(wire.fromId, f.counter)
        XCTAssertEqual(wire.fromField, "count")
        XCTAssertEqual(wire.toId, f.goal)
        XCTAssertEqual(wire.toField, "percent")
        XCTAssertEqual(wire.transform, .clamp(min: 0, max: 100), "count → percent prefills the semantic-unit suggestion")
        XCTAssertTrue(wire.enabled)
        XCTAssertNil(f.controller.drag, "the drag ends on a bind")
        XCTAssertTrue(f.undo.canUndo, "drawing a wire is one undo step")
        f.document.undo()
        XCTAssertTrue(f.document.board.connections.isEmpty)
    }

    func testSecondValueWireIntoTheSameFieldReplacesTheFirst() throws {
        let f = makeFixture()
        f.controller.beginDrag(fromWidget: f.counter, field: "count", at: .zero)
        let first = f.controller.endDrag(atWorld: inputPort(f.goalWidget, "percent", .field))
        f.controller.beginDrag(fromWidget: f.toggle, field: "value", at: .zero)
        let second = f.controller.endDrag(atWorld: inputPort(f.goalWidget, "percent", .field))
        guard case .connected(let firstId) = first, case .connected(let secondId) = second else { return XCTFail() }
        XCTAssertNil(f.document.board.connections[firstId], "single-writer rule")
        XCTAssertEqual(f.document.board.connections[secondId]?.fromId, f.toggle)
        XCTAssertEqual(f.document.board.connections.count, 1)
        XCTAssertNil(f.document.board.connections[secondId]?.transform, "a boolean has no unit: no suggestion")
    }

    func testDropOnACommandPortDrawsATriggerWireRisingForBooleanChangeOtherwise() throws {
        let f = makeFixture()
        f.controller.beginDrag(fromWidget: f.toggle, field: "value", at: .zero)
        let boolDrop = f.controller.endDrag(atWorld: inputPort(f.counterWidget, "increment", .command))
        guard case .connected(let risingId) = boolDrop else { return XCTFail() }
        let rising = try XCTUnwrap(f.document.board.connections[risingId])
        XCTAssertEqual(rising.kind, .trigger)
        XCTAssertEqual(rising.command, "increment")
        XCTAssertEqual(rising.edge, .rising)
        XCTAssertNil(rising.toField)

        f.controller.beginDrag(fromWidget: f.counter, field: "count", at: .zero)
        let numberDrop = f.controller.endDrag(atWorld: inputPort(f.document.widget(f.list)!, "add_item", .command))
        guard case .connected(let changeId) = numberDrop else { return XCTFail() }
        XCTAssertEqual(f.document.board.connections[changeId]?.edge, .change, "a non-boolean source triggers on any change, as the web draws it")

        // Re-drawing the identical trigger is a no-op that returns the same id.
        f.controller.beginDrag(fromWidget: f.toggle, field: "value", at: .zero)
        XCTAssertEqual(f.controller.endDrag(atWorld: inputPort(f.counterWidget, "increment", .command)), .connected(risingId))
        XCTAssertEqual(f.document.board.connections.count, 2)
    }

    func testDropOnACardBodyOpensTheFieldPickerAndThePickLandsTheWire() throws {
        let f = makeFixture()
        f.controller.beginDrag(fromWidget: f.counter, field: "count", at: .zero)
        let centre = f.goalWidget.frame.center
        f.controller.moveDrag(toWorld: centre)
        XCTAssertNil(f.controller.drag?.hover, "a body is not a port hover")
        let outcome = f.controller.endDrag(atWorld: centre, screen: Vector2D(x: 12, y: 34))
        XCTAssertEqual(outcome, .pendingDrop(f.goal))
        XCTAssertNil(f.controller.drag)
        let drop = try XCTUnwrap(f.controller.pendingDrop)
        XCTAssertEqual(drop.fromId, f.counter)
        XCTAssertEqual(drop.fromField, "count")
        XCTAssertEqual(drop.toId, f.goal)
        XCTAssertEqual(drop.screen, Vector2D(x: 12, y: 34))
        XCTAssertEqual(f.controller.pendingDropPorts.map(\.key), inputPortsFor("goal_tracker").map(\.key), "the picker lists the target's inputs")
        XCTAssertTrue(f.document.board.connections.isEmpty, "nothing drawn until the pick")

        let percent = try XCTUnwrap(findInputPort("goal_tracker", "percent", .field))
        let id = try XCTUnwrap(f.controller.resolvePendingDrop(port: percent))
        XCTAssertEqual(f.document.board.connections[id]?.toField, "percent")
        XCTAssertEqual(f.document.board.connections[id]?.transform, .clamp(min: 0, max: 100))
        XCTAssertNil(f.controller.pendingDrop)

        // Dismissing a pending drop draws nothing.
        f.controller.beginDrag(fromWidget: f.counter, field: "count", at: .zero)
        _ = f.controller.endDrag(atWorld: centre)
        f.controller.dismissPendingDrop()
        XCTAssertNil(f.controller.pendingDrop)
        XCTAssertEqual(f.document.board.connections.count, 1)
    }

    func testDropOnCanvasCancelsAndEscapeCancels() {
        let f = makeFixture()
        f.controller.beginDrag(fromWidget: f.counter, field: "count", at: .zero)
        XCTAssertEqual(f.controller.endDrag(atWorld: Vector2D(x: 2000, y: 2000)), .cancelled)
        XCTAssertNil(f.controller.drag)
        XCTAssertNil(f.controller.pendingDrop)
        XCTAssertTrue(f.document.board.connections.isEmpty)
        XCTAssertEqual(f.controller.endDrag(atWorld: .zero), .idle)

        f.controller.beginDrag(fromWidget: f.counter, field: "count", at: .zero)
        f.controller.cancelDrag()
        XCTAssertNil(f.controller.drag)
        XCTAssertFalse(f.controller.beginDrag(fromWidget: f.counter, field: "no_such_field", at: .zero))
        XCTAssertFalse(f.controller.beginDrag(fromWidget: "nobody", field: "count", at: .zero))
    }

    func testDropOnItsOwnCardIsNotAWire() {
        let f = makeFixture()
        f.controller.beginDrag(fromWidget: f.counter, field: "count", at: .zero)
        XCTAssertEqual(f.controller.endDrag(atWorld: inputPort(f.counterWidget, "count", .field)), .cancelled, "the source is excluded from its own drop")
        XCTAssertTrue(f.document.board.connections.isEmpty)
    }

    func testTouchPathTapAnOutputThenTapAnInput() throws {
        let f = makeFixture()
        XCTAssertTrue(f.controller.tapOutput(widget: f.counter, field: "count"))
        let armed = try XCTUnwrap(f.controller.armedSource)
        XCTAssertEqual(armed.widgetId, f.counter)
        XCTAssertEqual(armed.field, "count")
        let port = PortGeometry.portWorldPosition(frame: f.counterWidget.frame, side: .output, index: findOutputPort("counter", "count")!.index, count: outputPortsFor("counter").count)
        XCTAssertEqual(f.controller.drag?.cursorWorld, port, "the ghost parks on the dot")

        // A second tap on the same output disarms.
        XCTAssertFalse(f.controller.tapOutput(widget: f.counter, field: "count"))
        XCTAssertNil(f.controller.drag)
        XCTAssertNil(f.controller.tapInput(widget: f.goal, port: findInputPort("goal_tracker", "percent", .field)!), "nothing armed, nothing lands")

        // Arm, then tap an input: the wire lands.
        f.controller.tapOutput(widget: f.counter, field: "count")
        let id = try XCTUnwrap(f.controller.tapInput(widget: f.goal, port: findInputPort("goal_tracker", "percent", .field)!))
        XCTAssertEqual(f.document.board.connections[id]?.toId, f.goal)
        XCTAssertNil(f.controller.drag)

        // Tapping a different output re-arms with that one.
        f.controller.tapOutput(widget: f.counter, field: "count")
        f.controller.tapOutput(widget: f.toggle, field: "value")
        XCTAssertEqual(f.controller.armedSource?.widgetId, f.toggle)
    }

    func testResolvesAWireDropAgainstTheBoxThePortDotsAreDrawnOn() throws {
        // The rail paints its dots on the on-screen box, so drop resolution
        // hit-tests that same box: a card resting as a tile stacks its input
        // dots inside the tile, several ports away from where the dormant
        // stored box would put them.
        let rest = WidgetRestContextFactory.make()
        let f = makeFixture(rest: rest)
        let stored = f.counterWidget.frame
        let tile = displayedWidgetRect(f.counterWidget, restContext: rest)
        XCTAssertNotEqual(tile.height, stored.height, "the counter really rests smaller")
        let ins = inputPortsFor("counter")
        let aimedIndex = ins.count - 1
        let aim = PortGeometry.portWorldPosition(frame: tile, side: .input, index: aimedIndex, count: ins.count)

        let hit = try XCTUnwrap(f.controller.hitTest(world: aim, excluding: f.goal))
        XCTAssertEqual(hit.widgetId, f.counter)
        XCTAssertEqual(hit.portIndex, aimedIndex)

        // Not vacuous: against the stored box that point resolves elsewhere.
        let dormant = LinkingController(document: f.document, restContext: { .none })
        XCTAssertNotEqual(dormant.hitTest(world: aim, excluding: f.goal)?.portIndex, aimedIndex)

        // The dormant card must not swallow body drops the visible tile never covers.
        let ghost = Vector2D(x: stored.maxX - 10, y: stored.maxY - 10)
        XCTAssertGreaterThan(ghost.y, tile.maxY)
        XCTAssertNil(f.controller.hitTest(world: ghost, excluding: f.goal))
        XCTAssertEqual(dormant.hitTest(world: ghost, excluding: f.goal)?.widgetId, f.counter)

        // And a drag actually lands on the tile's port.
        f.controller.beginDrag(fromWidget: f.goal, field: "percent", at: .zero)
        guard case .connected(let id) = f.controller.endDrag(atWorld: aim) else { return XCTFail("expected a wire") }
        XCTAssertEqual(f.document.board.connections[id]?.command, ins[aimedIndex].key)
    }

    func testPortsWinOverBodiesAndCandidatesCoverTheActiveCanvas() {
        let f = makeFixture()
        let candidates = f.controller.candidates()
        XCTAssertEqual(Set(candidates.map(\.id)), [f.counter, f.goal, f.toggle, f.list])
        XCTAssertEqual(candidates.first { $0.id == f.counter }?.inputPortCount, inputPortsFor("counter").count)
        // A port point inside another card's body still resolves to the port.
        let port = inputPort(f.goalWidget, "percent", .field)
        XCTAssertEqual(f.controller.hitTest(world: port, excluding: f.counter)?.portIndex, findInputPort("goal_tracker", "percent", .field)?.index)
        XCTAssertNil(f.controller.hitTest(world: f.goalWidget.frame.center, excluding: f.counter)?.portIndex)
    }
}
