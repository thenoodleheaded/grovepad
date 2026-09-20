import XCTest
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// `WireInspectorModel` against `WireInspector` in WireLayer.tsx: the title,
/// the transform picker (op switch resets params, param edits persist), the
/// edge picker, enable/disable, delete, the damping notice with re-arm, and
/// the semantic-unit suggestion.
final class CircuitWireInspectorModelTests: XCTestCase {

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
        let counter: String
        let goal: String
        let toggle: String
        let list: String
        func model(_ id: String) -> WireInspectorModel { WireInspectorModel(document: document, connectionId: id)! }
    }

    private func makeFixture() -> Fixture {
        let (document, _, _) = makeDocument()
        let counter = document.createWidget(type: "counter", at: .zero, title: "Tally counter of things")!
        let goal = document.createWidget(type: "goal_tracker", at: Vector2D(x: 400, y: 0), title: "Goal")!
        let toggle = document.createWidget(type: "toggle", at: Vector2D(x: 0, y: 400), title: "Switch")!
        let list = document.createWidget(type: "checklist", at: Vector2D(x: 400, y: 400), title: "Tasks")!
        return Fixture(document: document, counter: counter, goal: goal, toggle: toggle, list: list)
    }

    func testTitleKindAndAccent() throws {
        let f = makeFixture()
        let id = try XCTUnwrap(f.document.addValueConnection(from: f.counter, field: "count", to: f.goal, field: "percent"))
        let model = f.model(id)
        XCTAssertEqual(model.kindLabel, "Value wire")
        XCTAssertEqual(model.sourceLabel, "Tally counter …·Count", "titles truncate at 15 like the web")
        XCTAssertEqual(model.targetLabel, "Goal·Progress %")
        XCTAssertEqual(model.title, "Tally counter …·Count → Goal·Progress %")
        XCTAssertEqual(model.accent, WireColors.hex(for: .number))
        XCTAssertTrue(model.showsTransform)
        XCTAssertEqual(model.transformHeading, "Transform")
        XCTAssertEqual(model.op, "identity")
        XCTAssertEqual(model.ops, WireTransform.ops)
        XCTAssertEqual(model.label(for: "map_range"), "Map range")
        XCTAssertEqual(model.hint, WireTransform.hint(for: "identity"))
        XCTAssertTrue(model.params.isEmpty)
        XCTAssertNil(model.edge)
        XCTAssertTrue(model.enabled)
        XCTAssertFalse(model.damped)
        XCTAssertNil(WireInspectorModel(document: f.document, connectionId: "missing"))
    }

    func testOpSwitchResetsParamsToDefaultsAndParamEditsPersist() throws {
        let f = makeFixture()
        let id = try XCTUnwrap(f.document.addValueConnection(from: f.counter, field: "count", to: f.goal, field: "percent"))
        f.model(id).setOp("scale")
        XCTAssertEqual(f.document.board.connections[id]?.transform, .scale(factor: 2))
        XCTAssertEqual(f.model(id).params, [TransformParam(key: "factor", label: "Factor", value: 2)])
        f.model(id).setParam("factor", 5)
        XCTAssertEqual(f.document.board.connections[id]?.transform, .scale(factor: 5))
        f.model(id).setParam("bogus", 1)
        XCTAssertEqual(f.document.board.connections[id]?.transform, .scale(factor: 5), "unknown keys are ignored")

        f.model(id).setOp("clamp")
        XCTAssertEqual(f.document.board.connections[id]?.transform, .clamp(min: 0, max: 100), "switching resets to defaults")
        f.model(id).setParam("max", 40)
        XCTAssertEqual(f.document.board.connections[id]?.transform, .clamp(min: 0, max: 40))
        XCTAssertEqual(f.model(id).params.map(\.label), ["Min", "Max"])

        f.model(id).setOp("map_range")
        f.model(id).setParam("outMax", 10)
        f.model(id).setParam("inMin", -1)
        XCTAssertEqual(f.document.board.connections[id]?.transform, .mapRange(inMin: -1, inMax: 100, outMin: 0, outMax: 10))
        XCTAssertEqual(f.model(id).params.map(\.key), ["inMin", "inMax", "outMin", "outMax"])

        f.model(id).setOp("threshold")
        f.model(id).setParam("value", 3)
        XCTAssertEqual(f.document.board.connections[id]?.transform, .threshold(value: 3))

        f.model(id).setOp("format")
        XCTAssertEqual(f.model(id).template, "{value}")
        f.model(id).setTemplate("[wired] {value}")
        XCTAssertEqual(f.document.board.connections[id]?.transform, .format(template: "[wired] {value}"))
        XCTAssertTrue(f.model(id).params.isEmpty)
        f.model(id).setOp("nonsense")
        XCTAssertEqual(f.document.board.connections[id]?.transform, .format(template: "[wired] {value}"), "an unknown op changes nothing")

        // The edits are one undo step per wire, coalesced within the window.
        XCTAssertTrue(f.document.canUndo)
    }

    func testTriggerWiresPickAnEdgeAndOnlyPayloadCommandsShowATransform() throws {
        let f = makeFixture()
        let increment = try XCTUnwrap(f.document.addTriggerConnection(from: f.toggle, field: "value", to: f.counter, command: "increment", edge: .rising))
        var model = f.model(increment)
        XCTAssertEqual(model.kindLabel, "Trigger wire")
        XCTAssertEqual(model.accent, WireColors.trigger)
        XCTAssertEqual(model.targetLabel, "Tally counter …·Increment counter")
        XCTAssertEqual(model.edge, .rising)
        XCTAssertEqual(model.edges, [.rising, .falling, .change])
        XCTAssertFalse(model.showsTransform, "increment ignores the payload")
        XCTAssertNil(model.suggestion)
        model.setEdge(.change)
        XCTAssertEqual(f.document.board.connections[increment]?.edge, .change)
        XCTAssertEqual(f.model(increment).edge, .change)

        let addItem = try XCTUnwrap(f.document.addTriggerConnection(from: f.toggle, field: "value", to: f.list, command: "add_item", edge: .rising))
        model = f.model(addItem)
        XCTAssertTrue(model.showsTransform, "add_item reads the payload")
        XCTAssertEqual(model.transformHeading, "Payload transform")

        // A value wire never takes an edge.
        let value = try XCTUnwrap(f.document.addValueConnection(from: f.counter, field: "count", to: f.goal, field: "percent"))
        f.model(value).setEdge(.falling)
        XCTAssertNil(f.document.board.connections[value]?.edge)
    }

    func testEnableToggleAndDelete() throws {
        let f = makeFixture()
        let id = try XCTUnwrap(f.document.addValueConnection(from: f.counter, field: "count", to: f.goal, field: "percent"))
        XCTAssertEqual(f.model(id).enabledLabel, "Disable wire")
        f.model(id).toggleEnabled()
        XCTAssertFalse(f.document.board.connections[id]?.enabled ?? true)
        XCTAssertEqual(f.model(id).enabledLabel, "Enable wire")
        f.model(id).toggleEnabled()
        XCTAssertTrue(f.document.board.connections[id]?.enabled ?? false)

        f.document.updateCircuitUI { $0.openInspector(connectionId: id, x: 1, y: 2) }
        f.model(id).delete()
        XCTAssertNil(f.document.board.connections[id])
        XCTAssertNil(f.document.circuitUI.inspector, "delete closes the inspector")
        f.document.undo()
        XCTAssertNotNil(f.document.board.connections[id], "and it is one undo step")
    }

    func testDampedNoticeAndReArm() throws {
        let f = makeFixture()
        let id = try XCTUnwrap(f.document.addValueConnection(from: f.counter, field: "count", to: f.goal, field: "percent"))
        f.document.dampConnections([id])
        let model = f.model(id)
        XCTAssertTrue(model.damped)
        XCTAssertEqual(WireInspectorModel.dampedNotice, "Loop breaker tripped — this wire was oscillating and is paused.")
        model.rearm()
        XCTAssertFalse(f.model(id).damped)
        XCTAssertTrue(f.document.circuitUI.dampedIds.isEmpty)

        // The driver rule: any wire edit lifts damping as well, and re-delivers.
        let driver = CircuitDriver(host: f.document, scheduler: FakeScheduler(), clock: .conformance, minter: .counting())
        let dispose = driver.start()
        defer { dispose() }
        f.document.dampConnections([id])
        let before = f.document.widget(f.goal)?.data["simple"]?["percent"]
        f.document.setField(f.counter, "count", .number(7))
        XCTAssertEqual(f.document.widget(f.goal)?.data["simple"]?["percent"], before, "damped: silent")
        XCTAssertNotEqual(before, .number(14))
        f.model(id).setOp("scale")
        XCTAssertTrue(f.document.circuitUI.dampedIds.isEmpty, "editing the wire re-arms")
        XCTAssertEqual(f.document.widget(f.goal)?.data["simple"]?["percent"], .number(14), "and the edited wire delivers now")
    }

    func testSemanticUnitSuggestionIsAOneTapPrefill() throws {
        let f = makeFixture()
        let id = try XCTUnwrap(f.document.addValueConnection(from: f.counter, field: "count", to: f.goal, field: "percent"))
        XCTAssertEqual(f.model(id).suggestion, .clamp(min: 0, max: 100), "count → percent")
        XCTAssertEqual(f.model(id).suggestionLabel, "Clamp 0–100")
        f.model(id).applySuggestion()
        XCTAssertEqual(f.document.board.connections[id]?.transform, .clamp(min: 0, max: 100))
        XCTAssertNil(f.model(id).suggestion, "already applied: nothing to offer")
        f.model(id).setOp("scale")
        XCTAssertEqual(f.model(id).suggestion, .clamp(min: 0, max: 100), "offered again once the transform differs")

        // ratio → percent is the other obvious conversion the tables can express.
        XCTAssertEqual(WireTransform.suggested(from: .ratio, to: .percent), .scale(factor: 100))
        let plain = try XCTUnwrap(f.document.addValueConnection(from: f.toggle, field: "value", to: f.counter, field: "count"))
        XCTAssertNil(f.model(plain).suggestion, "no units, no suggestion")
        XCTAssertNil(f.model(plain).suggestionLabel)
    }
}
