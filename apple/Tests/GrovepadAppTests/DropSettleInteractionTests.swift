#if canImport(AppKit)
import XCTest
import AppKit
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
@testable import GrovepadApp

/// Owner's rule (18 Sep 2026) on the Mac host: cards push each other away
/// only when a dragged card is let go — no live preview while it is held, the
/// drop settles in the drag's one undo step, a pointer-cancel pushes nobody.
@MainActor
final class DropSettleInteractionTests: XCTestCase {
    private var directory: URL!
    private var window: NSWindow!
    private var coordinator: AppCoordinator!
    private var host: MacCanvasHostView!

    override func setUp() {
        super.setUp()
        directory = AppFixtures.temporaryDirectory("reflow")
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 700), styleMask: [.titled], backing: .buffered, defer: false)
        coordinator = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource())
        coordinator.start()
        let session = coordinator.makeSession()
        host = MacCanvasHostView(session: session, screenScale: 2)
        host.frame = NSRect(x: 0, y: 0, width: 1000, height: 700)
        window.contentView = host
        host.layout()
    }

    override func tearDown() {
        coordinator.dispose()
        window.orderOut(nil)
        window = nil
        try? FileManager.default.removeItem(at: directory)
        super.tearDown()
    }

    private var document: BoardDocument { coordinator.document }
    private var interaction: CanvasInteraction { host.interaction }

    private func turn(_ seconds: Double = 0) {
        let expectation = expectation(description: "turn")
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { expectation.fulfill() }
        wait(for: [expectation], timeout: seconds + 2)
        host.layoutSubtreeIfNeeded()
        host.sync()
    }

    private func box(_ id: String) -> WorldRect {
        displayedWidgetRect(document.widget(id)!, restContext: interaction.restContext())
    }

    /// Two resting text cards; `b` sunk halfway into `a` from the right.
    private func makePair() throws -> (String, String) {
        let centre = host.viewportCentreWorld
        let a = try XCTUnwrap(document.createWidget(type: "text", at: centre, title: "A"))
        let b = try XCTUnwrap(document.createWidget(type: "text", at: Vector2D(x: centre.x + 1200, y: centre.y), title: "B"))
        let tile = box(a)
        let target = Vector2D(x: document.widget(a)!.position.x + CanvasGeometry.snapToGrid(tile.width / 2), y: document.widget(a)!.position.y)
        document.moveWidgets([b], by: Vector2D(x: target.x - document.widget(b)!.position.x, y: target.y - document.widget(b)!.position.y))
        document.clearSelection()
        turn()
        return (a, b)
    }

    /// Press on `a` and drag it right in two frames.
    private func dragRight(_ a: String) {
        let start = document.widget(a)!.position
        interaction.cardDragBegin(a, atWorld: start, additive: false)
        interaction.cardDragMove(toWorld: Vector2D(x: start.x + 20, y: start.y))
        interaction.cardDragMove(toWorld: Vector2D(x: start.x + 40, y: start.y))
    }

    func testNeighboursHoldStillDuringTheDragAndTheDropPushesThemInOneUndoStep() throws {
        let (a, b) = try makePair()
        let before = document.board
        let bBefore = document.widget(b)!.position
        let bFrame = interaction.controller.drawnRect(document.widget(b)!)
        dragRight(a)
        XCTAssertEqual(document.widget(b)?.position, bBefore, "nothing moves aside while the card is held")
        let layer = try XCTUnwrap(interaction.controller.hostLayer.cardLayers[b])
        XCTAssertEqual(Double(layer.position.x), bFrame.x, accuracy: 1e-9, "no live preview")

        XCTAssertTrue(interaction.cardDragEnd())
        XCTAssertGreaterThan(document.widget(b)!.position.x, bBefore.x, "the drop pushes the neighbour aside")
        XCTAssertFalse(box(a).overlaps(box(b)), "and clears it")
        document.undo()
        XCTAssertEqual(document.board.widgets, before.widgets, "the drag and its settle are one step")
    }

    func testAPointerCancelPushesNobody() throws {
        let (a, b) = try makePair()
        let bBefore = document.widget(b)!.position
        dragRight(a)
        XCTAssertTrue(interaction.cardDragEnd(cancelled: true))
        XCTAssertEqual(document.widget(b)?.position, bBefore)
    }

}
#endif
