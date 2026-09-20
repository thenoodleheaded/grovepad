#if canImport(AppKit)
import XCTest
import AppKit
import SwiftUI
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
@testable import GrovepadApp

/// The open card's header buttons against the web's (`WidgetCard.tsx`
/// `handleButtonClick`), one test per button, each through a real click sent
/// to the window: Full screen opens the sheet, Pin toggles
/// `toggleWidgetPinned`, Completed (checklists only) and Favorite flip their
/// flag, Delete goes through `requestWidgetDeletion`.
@MainActor
final class WidgetTitleRowActionTests: XCTestCase {
    private var directory: URL!
    private var window: NSWindow!
    private var coordinator: AppCoordinator!
    private var host: MacCanvasHostView!

    override func setUp() {
        super.setUp()
        directory = AppFixtures.temporaryDirectory("titlerow")
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 700), styleMask: [.titled], backing: .buffered, defer: false)
        coordinator = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource())
        coordinator.start()
        let session = coordinator.makeSession()
        host = MacCanvasHostView(session: session, screenScale: 2)
        host.frame = NSRect(x: 0, y: 0, width: 1000, height: 700)
        window.contentView = host
        window.makeKeyAndOrderFront(nil)
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

    /// A card of `type`, opened and selected, so its header shows.
    private func openCard(_ type: String) throws -> String {
        let centre = host.viewportCentreWorld
        let id = try XCTUnwrap(document.createWidget(type: type, at: Vector2D(x: centre.x - 80, y: centre.y - 40), title: "Card"))
        document.clearSelection()
        turn()
        interaction.expand(id)
        document.select(id)
        turn(0.5)
        turn()
        return id
    }

    /// The header buttons this card shows, leading to trailing.
    private func buttons(_ id: String) -> [WidgetTitleRow.Action] {
        WidgetTitleRow.buttons(for: document.widget(id)!.type)
    }

    /// A real click (down, up) sent through the window at the middle of the
    /// header button `button`.
    private func click(_ button: WidgetTitleRow.Action, on id: String) {
        let list = buttons(id)
        guard let index = list.firstIndex(of: button) else { return XCTFail("\(button) is not on this card") }
        let fromEnd = Double(list.count - 1 - index)
        let card = box(id)
        let x = card.x + card.width - Double(WidgetTitleRow.trailingPadding) - Double(WidgetTitleRow.buttonSide) / 2 - fromEnd * Double(WidgetTitleRow.buttonSide + WidgetTitleRow.buttonSpacing)
        let y = card.y - widgetTitleRowHeight / 2
        let screen = interaction.toScreen(Vector2D(x: x, y: y))
        XCTAssertNil(interaction.resizeTarget(atScreen: screen), "\(button): the resize band never takes the press")
        XCTAssertNil(interaction.titleStripWidgetId(atWorld: Vector2D(x: x, y: y)), "\(button): the move handle never takes the press")
        let location = host.convert(NSPoint(x: screen.x, y: screen.y), to: nil)
        for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
            window.sendEvent(NSEvent.mouseEvent(with: type, location: location, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 1)!)
        }
        RunLoop.main.run(until: Date().addingTimeInterval(0.15))
    }

    // MARK: - The button set

    func testTheButtonSetMatchesTheWeb() {
        // `isButtonActive`: Pin everywhere but Canvas cards, Completed on
        // checklists only, Full screen / Favorite / Delete on every card.
        XCTAssertEqual(WidgetTitleRow.buttons(for: "counter"), [.expand, .pin, .favorite, .delete])
        XCTAssertEqual(WidgetTitleRow.buttons(for: "checklist"), [.expand, .pin, .completed, .favorite, .delete])
        XCTAssertEqual(WidgetTitleRow.buttons(for: "canvas_node"), [.expand, .favorite, .delete])
        XCTAssertEqual(WidgetTitleRow.Action.expand.label(type: "counter"), "Full screen")
        XCTAssertEqual(WidgetTitleRow.Action.expand.label(type: "text"), "Full screen", "the writing view is not ported: the button opens the sheet and says so")
        XCTAssertEqual(WidgetTitleRow.Action.pin.label(type: "counter"), "Pin")
        XCTAssertEqual(WidgetTitleRow.Action.completed.label(type: "checklist"), "Completed")
        XCTAssertEqual(WidgetTitleRow.Action.favorite.label(type: "counter"), "Favorite")
        XCTAssertEqual(WidgetTitleRow.Action.delete.label(type: "counter"), "Delete")
    }

    // MARK: - One real click per button

    func testFullScreenOpensTheSheet() throws {
        let id = try openCard("counter")
        click(.expand, on: id)
        XCTAssertEqual(interaction.chrome.fullscreen?.widgetId, id, "`openFullscreen`: the card lifts into the sheet")
    }

    func testACanvasCardWearsNoHeaderButtons() {
        // `titleChrome: false`: the door states its own name, so the web
        // mounts no name row and no buttons over it.
        XCTAssertEqual(WidgetRegistry.definition(for: "canvas_node")?.titleChrome, false)
    }

    func testPinTogglesPinnedAsOneUndoStepAndUnpinRoundTrips() throws {
        let id = try openCard("counter")
        let before = document.widget(id)!.position
        click(.pin, on: id)
        XCTAssertTrue(document.widget(id)!.metadata.pinned, "`toggleWidgetPinned`")
        XCTAssertEqual(document.widget(id)!.metadata.pinnedFrom?.objectValue?.string("kind"), "rest")
        turn()
        click(.pin, on: id)
        XCTAssertFalse(document.widget(id)!.metadata.pinned, "the second click unpins")
        XCTAssertNil(document.widget(id)!.metadata.pinnedFrom)
        XCTAssertEqual(document.widget(id)!.position, before, "pinning and unpinning leaves the card where it was")
        document.undo()
        XCTAssertTrue(document.widget(id)!.metadata.pinned, "each click is one undo step")
    }

    func testCompletedTogglesTheFlagOnAChecklist() throws {
        let id = try openCard("checklist")
        click(.completed, on: id)
        XCTAssertTrue(document.widget(id)!.metadata.completed, "`updateWidgetMetadata({ completed })`")
        turn()
        click(.completed, on: id)
        XCTAssertFalse(document.widget(id)!.metadata.completed)
        XCTAssertEqual(document.widget(id)!.metadata.record["completed"], .bool(false), "the web spreads an explicit false")
    }

    func testFavoriteTogglesTheStar() throws {
        let id = try openCard("counter")
        click(.favorite, on: id)
        XCTAssertTrue(document.widget(id)!.metadata.favorite, "`toggleWidgetFavorite`")
        turn()
        click(.favorite, on: id)
        XCTAssertFalse(document.widget(id)!.metadata.favorite)
    }

    func testDeleteRequestsTheDeletion() throws {
        let id = try openCard("counter")
        click(.delete, on: id)
        XCTAssertNil(document.widget(id), "`requestWidgetDeletion`: a plain card goes at once")
        document.undo()
        XCTAssertNotNil(document.widget(id), "and comes back with one undo")
    }

    func testDeleteOnALockedCardDoesNothing() throws {
        let id = try openCard("counter")
        document.setLocked([id], true)
        turn()
        click(.delete, on: id)
        XCTAssertNotNil(document.widget(id), "`analyzeWidgetDeletion` skips locked cards")
    }
}
#endif
