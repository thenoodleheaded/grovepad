import XCTest
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// `PortRailModel` against `PortRail.tsx`: rail order, positions from
/// `PortGeometry`, the visibility rule, compatibility and the 44 pt hit box.
final class CircuitPortRailModelTests: XCTestCase {

    /// These tests exercise the circuit system, which the app ships frozen
    /// (`CircuitFeature`); each switches it on for itself only.
    override func invokeTest() {
        let previous = CircuitFeature.isEnabled
        CircuitFeature.isEnabled = true
        defer { CircuitFeature.isEnabled = previous }
        super.invokeTest()
    }
    private func counterDocument() -> (BoardDocument, Widget) {
        let (document, _, _) = makeDocument()
        let id = document.createWidget(type: "counter", at: Vector2D(x: 100, y: 50), title: "Tally")!
        return (document, document.widget(id)!)
    }

    func testOutputsFollowFieldOrderAndInputsAreSettableFieldsThenCommands() {
        let (_, widget) = counterDocument()
        let rail = PortRailModel.rail(for: widget, restContext: .none)
        XCTAssertEqual(rail.outputs.map(\.key), fieldsFor("counter").map(\.key))
        XCTAssertEqual(rail.outputs.map(\.side), rail.outputs.map { _ in .output })
        XCTAssertEqual(rail.inputs.map { "\($0.kind.rawValue):\($0.key)" }, ["field:count", "command:increment", "command:decrement", "command:reset"])
        XCTAssertEqual(rail.inputs.map(\.index), [0, 1, 2, 3], "index is the rail slot")
        XCTAssertEqual(rail.frame, widget.frame)
        XCTAssertFalse(rail.isEmpty)
    }

    func testPositionsComeFromPortGeometryOverTheFootprint() {
        let (_, widget) = counterDocument()
        let rail = PortRailModel.rail(for: widget, restContext: .none)
        for handle in rail.outputs {
            XCTAssertEqual(handle.world, PortGeometry.portWorldPosition(frame: widget.frame, side: .output, index: handle.index, count: rail.outputs.count))
            XCTAssertEqual(handle.local, Vector2D(x: handle.world.x - widget.frame.x, y: handle.world.y - widget.frame.y))
            XCTAssertEqual(handle.world.x, widget.frame.maxX)
        }
        for handle in rail.inputs {
            XCTAssertEqual(handle.world, PortGeometry.portWorldPosition(frame: widget.frame, side: .input, index: handle.index, count: rail.inputs.count))
            XCTAssertEqual(handle.world.x, widget.frame.minX)
        }
        // A resting card's rail sits on the tile it is drawn as.
        let rest = WidgetRestContextFactory.make()
        let resting = PortRailModel.rail(for: widget, restContext: rest)
        XCTAssertEqual(resting.frame, displayedWidgetRect(widget, restContext: rest))
        XCTAssertNotEqual(resting.frame, widget.frame)
        XCTAssertEqual(resting.outputs[0].world.x, resting.frame.maxX)
    }

    func testColoursSpeakTheWireLanguage() {
        let (_, widget) = counterDocument()
        let rail = PortRailModel.rail(for: widget, restContext: .none)
        XCTAssertEqual(rail.inputs[0].color, WireColors.hex(for: .number))
        XCTAssertEqual(rail.inputs[1].color, WireColors.trigger)
        XCTAssertEqual(rail.inputs[0].spec, findInputPort("counter", "count", .field))
        XCTAssertEqual(rail.inputs[1].hover(on: widget.id), PortHover(widgetId: widget.id, portKey: "increment", portKind: .command))
    }

    func testRestIsZeroPixelsAndHoverDragOrCircuitModeShowTheRail() {
        var ui = CircuitUIState()
        XCTAssertFalse(PortRailModel.isVisible(widgetId: "a", hoverWidgetId: nil, circuitUI: ui))
        XCTAssertFalse(PortRailModel.isVisible(widgetId: "a", hoverWidgetId: "b", circuitUI: ui))
        XCTAssertTrue(PortRailModel.isVisible(widgetId: "a", hoverWidgetId: "a", circuitUI: ui))
        ui.startWireDrag(fromId: "b", fromField: "count", valueType: .number, cursorWorld: .zero)
        XCTAssertTrue(PortRailModel.isVisible(widgetId: "a", hoverWidgetId: nil, circuitUI: ui), "every card shows its inputs during a drag")
        XCTAssertFalse(PortRailModel.showsLabels(circuitUI: ui))
        ui.endWireDrag()
        ui.setCircuitMode(true)
        XCTAssertTrue(PortRailModel.isVisible(widgetId: "a", hoverWidgetId: nil, circuitUI: ui))
        XCTAssertTrue(PortRailModel.showsLabels(circuitUI: ui), "labels extend in Circuit Mode")
    }

    func testOnlyTheDragSourceKeepsItsOutputsMidDrag() {
        XCTAssertTrue(PortRailModel.showsOutputs(widgetId: "a", drag: nil))
        let drag = WireDrag(fromId: "a", fromField: "count", valueType: .number, cursorWorld: .zero)
        XCTAssertTrue(PortRailModel.showsOutputs(widgetId: "a", drag: drag))
        XCTAssertFalse(PortRailModel.showsOutputs(widgetId: "b", drag: drag))
    }

    func testCompatibilityIsPromiscuousForFieldsAndEveryDragCanTrigger() {
        let (_, widget) = counterDocument()
        let rail = PortRailModel.rail(for: widget, restContext: .none)
        let field = rail.inputs[0]
        let command = rail.inputs[1]
        XCTAssertFalse(field.isCompatible(with: nil, on: widget.id), "no drag, nothing lights")
        let own = WireDrag(fromId: widget.id, fromField: "count", valueType: .number, cursorWorld: .zero)
        XCTAssertFalse(field.isCompatible(with: own, on: widget.id), "never into itself")
        let text = WireDrag(fromId: "other", fromField: "text", valueType: .text, cursorWorld: .zero)
        XCTAssertTrue(field.isCompatible(with: text, on: widget.id), "the patchbay stays promiscuous")
        XCTAssertTrue(command.isCompatible(with: text, on: widget.id), "a text source still has a boolean reading")
        XCTAssertFalse(rail.outputs[0].isCompatible(with: text, on: widget.id), "outputs are never drop targets")
        var hot = text
        hot.hover = PortHover(widgetId: widget.id, portKey: "increment", portKind: .command)
        XCTAssertTrue(command.isHot(in: hot, on: widget.id))
        XCTAssertFalse(field.isHot(in: hot, on: widget.id))
        XCTAssertFalse(command.isHot(in: text, on: widget.id))
    }

    func testHitBoxIs44ScreenPointsAroundTheDotAndNeverMovesIt() {
        let (_, widget) = counterDocument()
        let handle = PortRailModel.rail(for: widget, restContext: .none).inputs[0]
        let unit = PortRailModel.hitRect(for: handle, zoom: 1)
        XCTAssertEqual(unit.width, 44)
        XCTAssertEqual(unit.center, handle.world)
        let zoomed = PortRailModel.hitRect(for: handle, zoom: 2)
        XCTAssertEqual(zoomed.width, 22, "44 screen points are 22 world units at 2×")
        XCTAssertEqual(zoomed.center, handle.world, "the drawn dot stays put")
        XCTAssertEqual(PortRailModel.hitRect(for: handle, zoom: 10).width, PortRailModel.dotDiameter, "never smaller than the dot")
    }

    func testACardWithoutPortsHasAnEmptyRail() {
        let (document, _, _) = makeDocument()
        let door = document.createWidget(type: "canvas_node", at: .zero, title: "Door")!
        let rail = PortRailModel.rail(for: document.widget(door)!, restContext: .none)
        XCTAssertTrue(rail.isEmpty)
    }
}
