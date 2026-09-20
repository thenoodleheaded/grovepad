import XCTest
import SwiftUI
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// The SwiftUI circuit surfaces render (ImageRenderer on macOS) and the
/// Core Animation coordinator keeps the edge layer, the ghost and the chips
/// in step with the document and the circuit UI.
final class CircuitViewsRenderTests: XCTestCase {

    /// These tests exercise the circuit system, which the app ships frozen
    /// (`CircuitFeature`); each switches it on for itself only.
    override func invokeTest() {
        let previous = CircuitFeature.isEnabled
        CircuitFeature.isEnabled = true
        defer { CircuitFeature.isEnabled = previous }
        super.invokeTest()
    }
    private func fixture() -> (BoardDocument, LinkingController, counter: String, goal: String) {
        let (document, _, _) = makeDocument()
        let counter = document.createWidget(type: "counter", at: .zero, title: "Tally")!
        let goal = document.createWidget(type: "goal_tracker", at: Vector2D(x: 400, y: 0), title: "Goal")!
        let controller = LinkingController(document: document, restContext: { .none })
        return (document, controller, counter, goal)
    }

    #if canImport(AppKit)
    func testPortRailViewRendersAtTheCardsFootprint() throws {
        let (document, controller, counter, _) = fixture()
        document.setCircuitMode(true)
        let widget = document.widget(counter)!
        let rail = PortRailModel.rail(for: widget, restContext: .none)
        let view = PortRailView(widget: widget, rail: rail, circuitUI: document.circuitUI, zoom: 1, controller: controller)
        let image = try XCTUnwrap(WidgetBitmapProvider.render(view, scale: 1))
        XCTAssertGreaterThanOrEqual(image.width, Int(widget.size.width), "labels may extend past the box, never shrink it")
        XCTAssertGreaterThanOrEqual(image.height, Int(widget.size.height))

        // Mid-drag the rail renders too (inputs lit, outputs hidden on other cards).
        controller.beginDrag(fromWidget: counter, field: "count", at: .zero)
        let dragging = PortRailView(widget: widget, rail: rail, circuitUI: document.circuitUI, zoom: 2, controller: controller)
        XCTAssertNotNil(WidgetBitmapProvider.render(dragging, scale: 1))
    }

    func testFieldPickerInspectorAndToggleRender() throws {
        let (document, controller, counter, goal) = fixture()
        let id = try XCTUnwrap(document.addValueConnection(from: counter, field: "count", to: goal, field: "percent", transform: .clamp(min: 0, max: 100)))
        document.dampConnections([id])
        let inspector = WireInspectorView(document: document, connectionId: id)
        let inspectorImage = try XCTUnwrap(WidgetBitmapProvider.render(inspector.environment(\.touchChrome, true), scale: 1))
        XCTAssertGreaterThanOrEqual(inspectorImage.width, 256)

        let trigger = try XCTUnwrap(document.addTriggerConnection(from: counter, field: "count", to: goal, command: "reset", edge: .change))
        XCTAssertNotNil(WidgetBitmapProvider.render(WireInspectorView(document: document, connectionId: trigger), scale: 1))
        XCTAssertNotNil(WidgetBitmapProvider.render(WireInspectorView(document: document, connectionId: "gone"), scale: 1))

        let drop = PendingWireDrop(fromId: counter, fromField: "count", valueType: .number, toId: goal, screen: .zero)
        document.updateCircuitUI { $0.setPendingDrop(drop) }
        let picker = WireFieldPickerView(controller: controller, drop: drop)
        let pickerImage = try XCTUnwrap(WidgetBitmapProvider.render(picker, scale: 1))
        XCTAssertGreaterThanOrEqual(pickerImage.width, 224)
        XCTAssertGreaterThanOrEqual(pickerImage.height, 44 * inputPortsFor("goal_tracker").count, "every row wears the 44 pt floor")

        let toggle = CircuitModeToggle(document: document)
        let toggleImage = try XCTUnwrap(WidgetBitmapProvider.render(toggle, scale: 1))
        XCTAssertGreaterThanOrEqual(toggleImage.width, 44)
        XCTAssertGreaterThanOrEqual(toggleImage.height, 44)
    }
    #endif

    #if canImport(QuartzCore)
    func testCoordinatorFeedsTheEdgeLayerGhostAndChips() throws {
        let (document, controller, counter, goal) = fixture()
        let layer = EdgeLayer()
        let clock = TestClock()
        var scheduled: [(seconds: TimeInterval, block: () -> Void)] = []
        let coordinator = CircuitOverlayCoordinator(
            document: document, edgeLayer: layer, restContext: { .none }, clock: clock.clock,
            schedule: { seconds, block in
                scheduled.append((seconds, block))
                return {}
            }
        )
        let dispose = coordinator.start()
        XCTAssertTrue(layer.mountedEdgeIds.isEmpty)

        // A drawn wire mounts on the next commit.
        let id = try XCTUnwrap(document.addValueConnection(from: counter, field: "count", to: goal, field: "percent"))
        XCTAssertEqual(layer.mountedEdgeIds, [id])
        XCTAssertEqual(coordinator.lastFrame.descriptors.map(\.id), [id])
        XCTAssertNotNil(layer.hitTest(world: coordinator.lastFrame.descriptors[0].mid), "the wire answers the pointer")

        // The ghost follows a drag.
        XCTAssertTrue(coordinator.ghostLayer.isHidden)
        controller.beginDrag(fromWidget: counter, field: "count", at: Vector2D(x: 300, y: 100))
        coordinator.refresh()
        XCTAssertFalse(coordinator.ghostLayer.isHidden)
        XCTAssertEqual(coordinator.lastGhost?.cursor, Vector2D(x: 300, y: 100))
        controller.cancelDrag()
        coordinator.refresh()
        XCTAssertTrue(coordinator.ghostLayer.isHidden)

        // Circuit Mode: value chips at the midpoints, cards step back.
        document.setCircuitMode(true)
        coordinator.refresh()
        XCTAssertEqual(coordinator.lastFrame.chips.count, 1)
        XCTAssertEqual(coordinator.chipLayer.sublayers?.count, 1)
        XCTAssertEqual(coordinator.chip(at: coordinator.lastFrame.chips[0].position)?.text, "0")
        XCTAssertTrue(layer.paintContext.circuitMode)

        // A delivery pulses once and the coordinator re-arms at the window's end.
        document.recordFires([id], at: clock.now)
        coordinator.refresh()
        XCTAssertEqual(coordinator.lastFrame.descriptors[0].pulseKey, clock.now)
        XCTAssertTrue(coordinator.pulseRearmPending)
        let rearm = try XCTUnwrap(scheduled.last)
        XCTAssertEqual(rearm.seconds, WireLayerModel.pulseWindowMs / 1000 + 0.01, accuracy: 0.001)
        clock.advance(ms: WireLayerModel.pulseWindowMs + 1)
        rearm.block()
        XCTAssertNil(coordinator.lastFrame.descriptors[0].pulseKey, "the key drops once the window closes")
        XCTAssertFalse(coordinator.pulseRearmPending)

        // Reduced motion: the paint context carries it and no pulse is styled.
        coordinator.reducedMotion = { true }
        document.recordFires([id], at: clock.now)
        coordinator.refresh()
        XCTAssertTrue(layer.paintContext.reducedMotion)
        XCTAssertNil(edgePaint(for: coordinator.lastFrame.descriptors[0], context: layer.paintContext).pulse)

        // Deleting the wire unmounts it; disposing stops the feed.
        document.removeConnection(id)
        XCTAssertTrue(layer.mountedEdgeIds.isEmpty)
        dispose()
        let refreshes = coordinator.refreshes
        _ = document.addValueConnection(from: counter, field: "count", to: goal, field: "percent")
        XCTAssertEqual(coordinator.refreshes, refreshes, "disposed: no more refreshes on commits")
    }
    #endif
}
