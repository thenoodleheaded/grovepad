#if canImport(AppKit)
import XCTest
import AppKit
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
@testable import GrovepadApp

/// The moved preview smoke, as a test: the AppKit host over a session —
/// live and resting cards, the y-down flip under AppKit, the event
/// translation tables, wheel translation, a wire drawn through the linking
/// controller, the context menu as an NSMenu.
@MainActor
final class MacCanvasHostTests: XCTestCase {

    /// These tests exercise the circuit system, which the app ships frozen
    /// (`CircuitFeature`); each switches it on for itself only.
    override func invokeTest() {
        let previous = CircuitFeature.isEnabled
        CircuitFeature.isEnabled = true
        defer { CircuitFeature.isEnabled = previous }
        super.invokeTest()
    }
    private var directory: URL!
    private var window: NSWindow!

    override func setUp() {
        super.setUp()
        directory = AppFixtures.temporaryDirectory("machost")
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 700), styleMask: [.titled], backing: .buffered, defer: false)
    }

    override func tearDown() {
        window.orderOut(nil)
        window = nil
        try? FileManager.default.removeItem(at: directory)
        super.tearDown()
    }

    private func settle() {
        let expectation = expectation(description: "turn")
        DispatchQueue.main.async { expectation.fulfill() }
        wait(for: [expectation], timeout: 1)
    }

    private func makeHost() -> (AppCoordinator, WindowSession, MacCanvasHostView) {
        let coordinator = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource())
        coordinator.start()
        let session = coordinator.makeSession()
        let host = MacCanvasHostView(session: session, screenScale: 2)
        host.frame = NSRect(x: 0, y: 0, width: 1000, height: 700)
        window.contentView = host
        host.layout()
        return (coordinator, session, host)
    }

    func testOpenedCardIsLiveTheOtherRestsAndTheWorldStaysFlipped() throws {
        let (coordinator, session, host) = makeHost()
        defer { coordinator.dispose() }
        XCTAssertTrue(session.isViewportReady, "the host's first layout parks the camera")
        let document = coordinator.document
        let centre = host.viewportCentreWorld
        let source = try XCTUnwrap(document.createWidget(type: "number_input", at: Vector2D(x: centre.x - 400, y: centre.y), title: "Number"))
        let target = try XCTUnwrap(document.createWidget(type: "counter", at: Vector2D(x: centre.x + 200, y: centre.y), title: "Tally"))
        host.expand(target)
        settle()
        host.sync()
        XCTAssertTrue(host.controller.liveCardIds.contains(target), "the opened card is live")
        XCTAssertTrue(host.liveHost.mountedIds.contains(target), "its WidgetCardView is mounted")
        XCTAssertTrue(host.controller.restingCardIds.contains(source), "the other card rests as a tile")
        settle()
        // What matters is the ORIENTATION ON SCREEN, not any one flag: macOS
        // Core Animation's root is y-up and every flipped layer on the way
        // down toggles it. Asserting the host's own flag is how the app ended
        // up upside down — the flag was right in a bare window and doubled the
        // flip inside SwiftUI.
        var flips = 0
        var layer: CALayer? = host.controller.hostLayer
        while let current = layer {
            if current.isGeometryFlipped { flips += 1 }
            layer = current.superlayer
        }
        XCTAssertEqual(flips % 2, 1, "the world is y-down on screen: an odd number of flips from the root")

        // A wire through the linking controller, exactly as a rail drag does.
        let context = host.restContext()
        let inputs = inputPortsFor("counter")
        let countIndex = inputs.firstIndex { $0.key == "count" && $0.kind == .field } ?? 0
        let frame = displayedWidgetRect(try XCTUnwrap(document.widget(target)), restContext: context)
        let dot = PortGeometry.portWorldPosition(frame: frame, side: .input, index: countIndex, count: inputs.count)
        XCTAssertTrue(host.linking.beginDrag(fromWidget: source, field: "value", at: .zero))
        host.linking.moveDrag(toWorld: dot)
        guard case .connected(let wireId) = host.linking.endDrag(atWorld: dot) else { return XCTFail("dropping on the count port draws a wire") }
        settle()
        host.sync()
        XCTAssertEqual(host.coordinator.lastFrame.descriptors.map(\.id), [wireId])
        XCTAssertEqual(host.controller.hostLayer.edgeLayer.mountedEdgeIds, [wireId])

        document.setCircuitMode(true)
        settle()
        host.sync()
        XCTAssertEqual(host.mountedRailIds, [source, target], "Circuit Mode mounts a rail on both cards")
        document.setCircuitMode(false)

        host.mouseDownOnEmptyCanvasForSmoke()
        XCTAssertNil(document.expandedWidgetId)
        XCTAssertTrue(document.selection.isEmpty)
    }

    func testEventTranslationTables() throws {
        XCTAssertEqual(MacCanvasHostView.domButton(0), 0)
        XCTAssertEqual(MacCanvasHostView.domButton(1), 2, "AppKit's right button is the DOM's secondary")
        XCTAssertEqual(MacCanvasHostView.domButton(2), 1, "AppKit's middle button is the DOM's middle")
        XCTAssertEqual(MacCanvasHostView.modifiers([.shift, .command]), [.shift, .cmd])
        XCTAssertEqual(MacCanvasHostView.modifiers([.option, .control]), [.alt, .ctrl])

        let scroll = try XCTUnwrap(CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2, wheel1: -12, wheel2: 5, wheel3: 0))
        let event = try XCTUnwrap(NSEvent(cgEvent: scroll))
        let wheel = MacCanvasHostView.wheelEvent(event, point: Vector2D(x: 10, y: 20))
        // AppKit deltas point top-left, the DOM's bottom-right: both negate.
        XCTAssertEqual(wheel.delta.y, -event.scrollingDeltaY, "vertical is negated into the DOM convention")
        XCTAssertEqual(wheel.delta.x, -event.scrollingDeltaX, "horizontal is negated into the DOM convention")
        XCTAssertFalse(wheel.ctrlOrCmd)
        XCTAssertEqual(wheel.point, Vector2D(x: 10, y: 20))
    }

    func testPointerPipelineOpensCardsAndClosesOnEmptyCanvas() throws {
        let (coordinator, _, host) = makeHost()
        defer { coordinator.dispose() }
        let document = coordinator.document
        let id = try XCTUnwrap(document.createWidget(type: "counter", at: Vector2D(x: 100, y: 100), title: "Tally"))
        host.sync()
        let widget = try XCTUnwrap(document.widget(id))
        let box = displayedWidgetRect(widget, restContext: host.restContext())
        let onCard = host.interaction.toScreen(Vector2D(x: box.x + box.width / 2, y: box.y + box.height / 2))
        func press(_ point: Vector2D, phase: PointerPhase) -> PointerEvent {
            PointerEvent(id: 1, kind: .mouse, phase: phase, point: point, button: 0, timestamp: 0)
        }
        XCTAssertEqual(host.interaction.pointerDown(press(onCard, phase: .down)), .card(id))
        host.interaction.pointerUp(press(onCard, phase: .up))
        XCTAssertEqual(document.selection, [id], "a press and release on a tile selects and opens it")
        XCTAssertEqual(document.expandedWidgetId, id)
        XCTAssertEqual(coordinator.sessions[0].environment.chrome.activeInput, .mouse)

        let empty = Vector2D(x: 5, y: 5)
        XCTAssertEqual(host.interaction.pointerDown(press(empty, phase: .down)), .empty)
        host.interaction.pointerUp(press(empty, phase: .up))
        XCTAssertNil(document.expandedWidgetId)
        XCTAssertTrue(document.selection.isEmpty)

        // A pending relation from the selection bar completes on the next card tap.
        let other = try XCTUnwrap(document.createWidget(type: "text", at: Vector2D(x: 600, y: 100), title: "Note"))
        host.sync()
        coordinator.sessions[0].environment.chrome.pendingLink = PendingLink(fromId: other, type: .parent)
        host.interaction.tapCard(id)
        XCTAssertNil(coordinator.sessions[0].environment.chrome.pendingLink)
        XCTAssertEqual(document.board.relations.values.map { ($0.fromId, $0.toId) }.first.map { [$0.0, $0.1] }, [other, id])
    }

    func testContextMenuBecomesAnNSMenuWithTheModelsRows() throws {
        let (coordinator, session, _) = makeHost()
        defer { coordinator.dispose() }
        let document = coordinator.document
        let id = try XCTUnwrap(document.createWidget(type: "counter", at: .zero, title: "Tally"))
        let model = try XCTUnwrap(ContextMenuModel(widgetId: id, document: document))
        let menu = SystemContextMenu.menu(model: model, document: document, actions: session.environment.contextMenuActions)
        let titles = menu.items.filter { !$0.isSeparatorItem }.map(\.title)
        XCTAssertEqual(titles, model.rows.map(\.label))
        XCTAssertEqual(menu.items.filter(\.isSeparatorItem).count, model.rows.filter(\.separatorBefore).count)
        let delete = try XCTUnwrap(menu.items.last)
        XCTAssertEqual(delete.attributedTitle?.attribute(.foregroundColor, at: 0, effectiveRange: nil) as? NSColor, NSColor.systemRed, "Delete is the only red item")
    }

    // MARK: - Interaction mode reaches the gesture engine intact

    func testConnectModeReachesTheGestureEngine() {
        // Connect mode is not navigate. A press on empty canvas there belongs
        // to the wire being drawn, so the engine has to see `.connect` and
        // resolve the intent to none rather than panning the camera away.
        let (coordinator, session, host) = makeHost()
        defer { coordinator.dispose() }

        for mode in GrovepadChrome.InteractionMode.allCases {
            session.environment.chrome.interactionMode = mode
            host.interaction.sync()
            XCTAssertEqual(
                String(describing: host.interaction.gesture.interactionMode),
                mode.rawValue,
                "\(mode.rawValue) must reach the engine unchanged"
            )
        }
    }

    // MARK: - Scroll direction

    /// A synthetic AppKit scroll event with the given raw deltas.
    private func scrollEvent(deltaX: Double, deltaY: Double) -> NSEvent? {
        guard let cg = CGEvent(
            scrollWheelEvent2Source: nil, units: .pixel,
            wheelCount: 2, wheel1: Int32(deltaY), wheel2: Int32(deltaX), wheel3: 0
        ) else { return nil }
        return NSEvent(cgEvent: cg)
    }

    func testWheelTranslationNegatesBothAxesIntoTheDOMConvention() throws {
        // Symmetric on purpose. A vertical pass-through once "fixed" what was
        // really an upside-down board; see MacWheelSign.
        let event = try XCTUnwrap(scrollEvent(deltaX: 6, deltaY: 10), "synthetic scroll event")
        let wheel = MacCanvasHostView.wheelEvent(event, point: Vector2D(x: 100, y: 100))
        XCTAssertEqual(wheel.delta.y, -event.scrollingDeltaY, accuracy: 0.001)
        XCTAssertEqual(wheel.delta.x, -event.scrollingDeltaX, accuracy: 0.001)
    }

    func testVerticalScrollMovesTheCameraTheWayTheFingersGo() throws {
        let (coordinator, session, host) = makeHost()
        defer { coordinator.dispose() }
        let event = try XCTUnwrap(scrollEvent(deltaX: 0, deltaY: 10), "synthetic scroll event")

        session.camera.setView(Vector2D(x: 0, y: 0), 1)
        host.interaction.wheel(MacCanvasHostView.wheelEvent(event, point: Vector2D(x: 100, y: 100)))

        // A positive AppKit vertical delta (toward the top) becomes a negative
        // DOM deltaY, and the web's `panBy(-deltaY)` then raises pan.y: the
        // world slides down the y-down screen, revealing what is above.
        XCTAssertGreaterThan(session.camera.frame.pan.y, 0, "positive AppKit delta pans the world down")
        XCTAssertEqual(session.camera.frame.pan.x, 0, accuracy: 0.001, "a vertical scroll leaves x alone")
    }
}
#endif
