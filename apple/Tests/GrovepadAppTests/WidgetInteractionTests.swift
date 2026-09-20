#if canImport(AppKit)
import XCTest
import CoreImage
import AppKit
import SwiftUI
import GrovepadCore
@testable import GrovepadCanvas
import GrovepadChrome
@testable import GrovepadApp

/// The widget interaction contract on the Mac, one test per promise:
///
/// - a card's own buttons always win over the resize band, at every zoom;
/// - a neighbour never takes a press inside another card;
/// - a card's content never spills out of it: the card grows to fit, on the
///   grid (content-fit types shrink back too);
/// - an open card sits on the grid;
/// - opening and closing never leave a view behind, however fast;
/// - hover lights a tile up and never changes its face;
/// - moving the pointer measures nothing.
@MainActor
final class WidgetInteractionTests: XCTestCase {
    private var directory: URL!
    private var window: NSWindow!
    private var coordinator: AppCoordinator!
    private var host: MacCanvasHostView!

    override func setUp() {
        super.setUp()
        directory = AppFixtures.temporaryDirectory("interaction")
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
    private let grid = CanvasGeometry.gridSize

    /// Let the run loop turn for `seconds`, lay the views out, and sync.
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

    private func cardViews() -> [NSView] {
        var found: [NSView] = []
        func walk(_ view: NSView) {
            if String(describing: type(of: view)).contains("LiveCardHostingView") { found.append(view) }
            view.subviews.forEach(walk)
        }
        walk(host)
        return found
    }

    private func makeTasks(_ count: Int, dx: Double = 0) throws -> String {
        let centre = host.viewportCentreWorld
        let id = try XCTUnwrap(document.createWidget(type: "checklist", at: Vector2D(x: centre.x + dx, y: centre.y), title: "Tasks"))
        while (document.widget(id)!.data.array("items") ?? []).count < count { document.runCommand(id, "add_item") }
        document.clearSelection()
        turn()
        return id
    }

    private func makeText(dx: Double = 0) throws -> String {
        let centre = host.viewportCentreWorld
        let id = try XCTUnwrap(document.createWidget(type: "text", at: Vector2D(x: centre.x + dx, y: centre.y), title: "Text"))
        document.updateWidgetData(id) { $0["text"] = .string("hello") }
        document.clearSelection()
        turn()
        return id
    }

    // MARK: - Presses

    func testTheTitleRowButtonsAreNeverTakenByTheResizeBand() throws {
        let id = try makeText()
        // A note is as tall as its text: enough of it for a tall card.
        document.updateWidgetData(id) { $0["text"] = .string(Array(repeating: "line", count: 12).joined(separator: "\n")) }
        interaction.expand(id)
        turn(0.4)
        for zoom in [1.5, 1.0, 0.75, 0.5, 0.3] {
            host.session.camera.zoomAtPoint(zoom, focal: Vector2D(x: 500, y: 350))
            turn(0.05)
            let card = box(id)
            // Every point of the name row: the strip above the box.
            for x in stride(from: card.x + 1, to: card.x + card.width, by: 7) {
                for y in stride(from: card.y - widgetTitleRowHeight + 0.5, to: card.y, by: 3) {
                    let screen = interaction.toScreen(Vector2D(x: x, y: y))
                    XCTAssertNil(interaction.resizeTarget(atScreen: screen), "zoom \(zoom): the name row at (\(x - card.x), \(y - card.y)) must stay the card's")
                }
            }
            // The card can still be resized: its sides, its bottom, and the
            // few points just inside its top border.
            let right = interaction.toScreen(Vector2D(x: card.x + card.width, y: card.y + card.height / 2))
            XCTAssertEqual(interaction.resizeTarget(atScreen: Vector2D(x: right.x + 4, y: right.y))?.edge, ResizeEdge(x: 1, y: 0))
            let top = interaction.toScreen(Vector2D(x: card.x + card.width / 2, y: card.y))
            XCTAssertEqual(interaction.resizeTarget(atScreen: Vector2D(x: top.x, y: top.y + 3))?.edge, ResizeEdge(x: 0, y: -1))
        }
    }

    func testANeighbourNeverTakesAPressInsideAnotherCard() throws {
        let left = try makeText()
        let leftBox = box(left)
        // Flush against the first card's right edge, and later in board order
        // (so it is "on top" and used to be asked first).
        let right = try XCTUnwrap(document.createWidget(type: "text", at: Vector2D(x: leftBox.x + leftBox.width, y: leftBox.y), title: "Neighbour"))
        document.updateWidgetData(right) { $0["text"] = .string("hi") }
        // Pinned cards never rest: both are open cards with name rows.
        document.setPinned(left, true)
        document.setPinned(right, true)
        turn()
        document.moveWidgets([right], by: Vector2D(x: box(left).x + box(left).width - box(right).x, y: box(left).y - box(right).y))
        turn()
        let a = box(left)
        XCTAssertEqual(box(right).x, a.x + a.width, accuracy: 0.5, "the two cards share an edge")
        // Ten points inside the first card, beside the shared edge: well
        // within the neighbour's 14 pt outer band.
        let inside = interaction.toScreen(Vector2D(x: a.x + a.width - 10, y: a.y + a.height / 2))
        XCTAssertNil(interaction.resizeTarget(atScreen: inside), "the point belongs to the card it is inside")
    }

    // MARK: - Content never spills

    func testATasksCardGrowsAndShrinksToItsListOnTheGrid() throws {
        let id = try makeTasks(8)
        interaction.expand(id)
        turn(0.5)
        turn(0.1)
        let needed = try XCTUnwrap(interaction.liveHost.fittedHeights[id], "the open card reported what its body needs")
        let grown = document.widget(id)!.size.height
        XCTAssertEqual(grown, needed, "a content-fit card is exactly as tall as its list")
        XCTAssertGreaterThan(grown, 160, "eight tasks do not fit the stock 160 pt box")
        XCTAssertEqual(grown.truncatingRemainder(dividingBy: grid), 0, "and the height is a whole number of cells")

        // Fewer tasks: it gives the room back.
        let items = document.widget(id)!.data.array("items") ?? []
        document.updateWidgetData(id) { $0["items"] = .array(Array(items.prefix(2))) }
        turn(0.2)
        turn(0.2)
        XCTAssertLessThan(document.widget(id)!.size.height, grown)
        XCTAssertEqual(document.widget(id)!.size.height.truncatingRemainder(dividingBy: grid), 0)
    }

    func testFittingACardIsNotAnUndoStep() throws {
        let id = try makeTasks(1)
        let before = document.widget(id)!.size.height
        document.fitWidgetHeight(id, fitted: before + grid * 3)
        XCTAssertEqual(document.widget(id)!.size.height, before + grid * 3)
        document.undo()
        // Undo went past the fit to the step before it (adding the task or
        // creating the card) — the fit itself never claimed a step.
        XCTAssertNotEqual(document.widget(id)?.size.height, before + grid * 3)
    }

    func testACardSizedByHandOnlyEverGrows() throws {
        // A counter is not a content-fit type: its size is the person's.
        let centre = host.viewportCentreWorld
        let id = try XCTUnwrap(document.createWidget(type: "counter", at: centre, title: "Counter"))
        turn()
        let start = document.widget(id)!.size.height
        document.fitWidgetHeight(id, fitted: start - grid)
        XCTAssertEqual(document.widget(id)!.size.height, start, "a hand-sized card is never shrunk by its content")
        document.fitWidgetHeight(id, fitted: start + grid)
        XCTAssertEqual(document.widget(id)!.size.height, start + grid)
    }

    // MARK: - The grid

    func testAnOpenCardSitsOnTheGrid() throws {
        let id = try makeTasks(3)
        interaction.expand(id)
        turn(0.5)
        let open = box(id)
        for value in [open.x, open.y, open.width, open.height] {
            XCTAssertEqual(value.truncatingRemainder(dividingBy: grid), 0, accuracy: 0.001, "\(open) is off the grid")
        }
    }

    // MARK: - Nothing left behind

    func testAPressBuildsTheCardSoTheReleaseOpensItAtOnce() throws {
        let id = try makeTasks(2)
        let tile = interaction.controller.drawnRect(document.widget(id)!)
        let point = interaction.toScreen(Vector2D(x: tile.x + tile.width / 2, y: tile.y + tile.height / 2))
        func event(_ phase: PointerPhase) -> PointerEvent {
            PointerEvent(id: 1, kind: .mouse, phase: phase, point: point, button: 0, timestamp: 0, modifiers: [], isEmptyCanvas: false)
        }
        interaction.pointerDown(event(.down))
        XCTAssertEqual(interaction.liveHost.warmIds, [id], "the press builds the card out of sight")
        XCTAssertTrue(cardViews().allSatisfy { $0.alphaValue == 0 }, "nothing shows before the release")
        let built = try XCTUnwrap(cardViews().first)
        interaction.pointerUp(event(.up))
        XCTAssertTrue(interaction.liveHost.warmIds.isEmpty)
        XCTAssertEqual(cardViews().count, 1, "the release opens the card it built — no second view")
        XCTAssertTrue(cardViews().first === built)
        XCTAssertEqual(built.alphaValue, 1)
        XCTAssertNotNil(interaction.liveHost.openingSource(id), "and it glides out of its tile")

        interaction.collapse()
        interaction.sync()
        let tile2 = interaction.controller.drawnRect(document.widget(id)!)
        let start = interaction.toScreen(Vector2D(x: tile2.x + tile2.width / 2, y: tile2.y + tile2.height / 2))
        turn(0.5)
        interaction.pointerDown(PointerEvent(id: 1, kind: .mouse, phase: .down, point: start, button: 0, timestamp: 0, modifiers: [], isEmptyCanvas: false))
        XCTAssertEqual(interaction.liveHost.warmIds, [id])
        interaction.pointerMove(PointerEvent(id: 1, kind: .mouse, phase: .move, point: Vector2D(x: start.x + 40, y: start.y), button: 0, timestamp: 0, modifiers: [], isEmptyCanvas: false))
        XCTAssertTrue(interaction.liveHost.warmIds.isEmpty, "a press that becomes a drag drops what it built")
        interaction.pointerUp(PointerEvent(id: 1, kind: .mouse, phase: .up, point: Vector2D(x: start.x + 40, y: start.y), button: 0, timestamp: 0, modifiers: [], isEmptyCanvas: false))
        XCTAssertNil(document.expandedWidgetId)
        XCTAssertEqual(cardViews().count, 0)
    }

    /// A card whose body needs more than its stored height opens at that
    /// height on the release — measured while the press built it — rather
    /// than opening short and then growing, a second animated motion that
    /// stalled the open by ~250 ms on a table.
    func testTheReleaseOpensACardAtTheHeightItsBodyNeeds() throws {
        let centre = host.viewportCentreWorld
        let id = try XCTUnwrap(document.createWidget(type: "table", at: Vector2D(x: centre.x, y: centre.y), title: "Table"))
        document.clearSelection()
        turn()
        let stored = document.widget(id)!.size.height
        let tile = interaction.controller.drawnRect(document.widget(id)!)
        let point = interaction.toScreen(Vector2D(x: tile.x + tile.width / 2, y: tile.y + tile.height / 2))
        func event(_ phase: PointerPhase) -> PointerEvent {
            PointerEvent(id: 1, kind: .mouse, phase: phase, point: point, button: 0, timestamp: 0, modifiers: [], isEmptyCanvas: false)
        }
        interaction.pointerDown(event(.down))
        turn(0.1)
        let fitted = try XCTUnwrap(interaction.liveHost.warmFittedHeight(id), "the press measured the body")
        XCTAssertGreaterThan(fitted, stored, "the fixture needs a table that outgrows its stored box")
        interaction.pointerUp(event(.up))
        XCTAssertEqual(document.widget(id)!.size.height, fitted, "the card opens at its body's height, not short of it")
        let opened = document.widget(id)!.size
        turn(0.5)
        XCTAssertEqual(document.widget(id)!.size, opened, "and never grows again once open")
    }

    func testACardNeverScrollsItGrowsToHoldEverything() throws {
        let id = try makeTasks(40)
        interaction.expand(id)
        turn(0.4)
        turn(0.4)
        let height = try XCTUnwrap(document.widget(id)?.size.height)
        XCTAssertGreaterThan(height, SizingRules.defaultMaxHeight, "past the old ceiling: the whole list shows")
        var scrolls: [NSScrollView] = []
        func walk(_ view: NSView) {
            if let scroll = view as? NSScrollView { scrolls.append(scroll) }
            view.subviews.forEach(walk)
        }
        cardViews().forEach(walk)
        XCTAssertTrue(scrolls.allSatisfy { ($0.documentView?.frame.height ?? 0) <= $0.contentView.bounds.height + 1 }, "nothing inside the card has more to scroll to")
    }

    func testAnIconsEdgeAnswersAsAScalableSquareNeverAnOpenCard() throws {
        let id = try makeText()
        document.setIconified(id, true)
        turn(0.4)
        let icon = box(id)
        let corner = interaction.toScreen(Vector2D(x: icon.x + icon.width - 1, y: icon.y + icon.height - 1))
        XCTAssertNotNil(interaction.resizeTarget(atScreen: corner), "an icon's edge scales it")
        XCTAssertEqual(document.widget(id)?.size, CanvasGeometry.iconifiedSize, "just looking changes nothing")
        XCTAssertEqual(document.widget(id)?.iconified, true)
    }

    func testAGroupsLinesAndTitleRowMoveInTheSameFrameAsItsMembers() throws {
        let a = try makeText()
        let b = try makeText(dx: 400)
        let glueId = try XCTUnwrap(document.addGlue([a, b]))
        turn(0.4)
        let start = document.widget(a)!.position
        let before = interaction.controller.hostLayer.glueLines
        interaction.cardDragBegin(a, atWorld: start, additive: false)
        interaction.cardDragMove(toWorld: Vector2D(x: start.x + 300, y: start.y + 200))
        // No sync, no run-loop turn: the drag frame alone.
        let lines = interaction.controller.hostLayer.glueLines
        XCTAssertEqual(lines.count, 2)
        XCTAssertEqual(lines[0].x - before[0].x, 300, accuracy: 1e-9)
        XCTAssertEqual(lines[0].y - before[0].y, 200, accuracy: 1e-9)
        let title = try XCTUnwrap(host.glueTitles[glueId])
        let lineTop = interaction.toScreen(Vector2D(x: lines[0].x, y: lines[0].y))
        let inCanvas = host.convert(title.frame, from: title.superview)
        XCTAssertEqual(inCanvas.maxY, lineTop.y, accuracy: 0.01, "the title row rides the top line mid-drag")
        XCTAssertEqual(inCanvas.minX, lineTop.x, accuracy: 0.01)
        interaction.cardDragEnd()
    }

    func testOpeningAndClosingFastLeavesNoViewBehind() throws {
        let a = try makeTasks(2)
        let b = try makeTasks(2, dx: 400)
        for round in 0..<8 {
            interaction.expand(round % 2 == 0 ? a : b)
            turn(0.03)
            let tracked = interaction.liveHost.mountedIds.count + interaction.liveHost.closingIds.count
            XCTAssertEqual(cardViews().count, tracked, "every card view on the board is one the host is tracking")
            XCTAssertLessThanOrEqual(cardViews().count, 2, "one view per card, however fast it is reopened")
        }
        interaction.collapse()
        document.clearSelection()
        turn(0.6)
        XCTAssertTrue(cardViews().isEmpty, "closed means gone")
        XCTAssertTrue(interaction.liveHost.closingIds.isEmpty)
    }

    func testReopeningAClosingCardTurnsTheSameViewRound() throws {
        let id = try makeTasks(2)
        interaction.expand(id)
        turn(0.5)
        let first = try XCTUnwrap(cardViews().first)
        interaction.collapse()
        host.sync()
        XCTAssertEqual(interaction.liveHost.closingIds, [id])
        interaction.expand(id)
        host.sync()
        XCTAssertEqual(interaction.liveHost.mountedIds, [id])
        XCTAssertTrue(interaction.liveHost.closingIds.isEmpty)
        XCTAssertTrue(cardViews().first === first, "the closing view reopened; no second card was stacked on it")
        turn(0.6)
        XCTAssertEqual(cardViews().count, 1, "and the close that was under way did not remove it")
    }

    func testAClosingCardShrinksExactlyOntoItsTile() throws {
        let id = try makeTasks(2)
        interaction.expand(id)
        turn(0.5)
        let widget = try XCTUnwrap(document.widget(id))
        let open = interaction.controller.drawnRect(widget)
        interaction.collapse()
        host.sync()
        let tile = interaction.controller.drawnRect(try XCTUnwrap(document.widget(id)))
        let target = try XCTUnwrap(interaction.liveHost.closingTarget(id))
        XCTAssertFalse(target.open)
        XCTAssertEqual(target.tile, Size(width: tile.width, height: tile.height))
        // The glass starts at the open card's box; the tile is where it ends,
        // not the middle of the card (the open card was snapped to the grid).
        XCTAssertEqual(target.offset, CGPoint(x: tile.x - open.x, y: tile.y - open.y))
        turn(0.6)
    }

    // MARK: - Click opens, drag moves

    private func mouse(_ phase: PointerPhase, _ point: Vector2D) -> PointerEvent {
        PointerEvent(id: 1, kind: .mouse, phase: phase, point: point, button: 0, timestamp: 0)
    }

    func testOnlyAClickThatLetsGoOpensACardNeverADragOrAPress() throws {
        let id = try makeTasks(2)
        turn()
        let tile = box(id)
        let start = interaction.toScreen(Vector2D(x: tile.x + tile.width / 2, y: tile.y + tile.height / 2))
        interaction.pointerDown(mouse(.down, start))
        turn()
        XCTAssertNil(document.expandedWidgetId, "a press alone does not open it")
        XCTAssertTrue(cardViews().allSatisfy { $0.alphaValue == 0 && $0.hitTest(NSPoint(x: 5, y: 5)) == nil }, "not even a resting card goes live under a press (the one built for the release is out of sight and out of reach)")
        for step in 1...6 { interaction.pointerMove(mouse(.move, Vector2D(x: start.x + Double(step) * 12, y: start.y))) }
        interaction.pointerUp(mouse(.up, Vector2D(x: start.x + 72, y: start.y)))
        turn()
        XCTAssertNil(document.expandedWidgetId, "a drag moves the card and leaves it resting")
        XCTAssertNotEqual(box(id).x, tile.x)
        let moved = box(id)
        let centre = interaction.toScreen(Vector2D(x: moved.x + moved.width / 2, y: moved.y + moved.height / 2))
        interaction.pointerDown(mouse(.down, centre))
        interaction.pointerUp(mouse(.up, centre))
        turn()
        XCTAssertEqual(document.expandedWidgetId, id, "a click, let go, opens it")
    }

    /// Real AppKit mouse events, through the host view's own handlers.
    private func nsMouse(_ type: NSEvent.EventType, _ viewport: Vector2D, clickCount: Int = 1, flags: NSEvent.ModifierFlags = []) -> NSEvent {
        let inWindow = host.convert(NSPoint(x: viewport.x, y: viewport.y), to: nil)
        return NSEvent.mouseEvent(with: type, location: inWindow, modifierFlags: flags, timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: clickCount, pressure: 1)!
    }

    private func realDrag(_ id: String, by dx: Double, steps: Int = 8, flags: NSEvent.ModifierFlags = []) {
        let tile = box(id)
        let start = interaction.toScreen(Vector2D(x: tile.x + tile.width / 2, y: tile.y + tile.height / 2))
        host.mouseDown(with: nsMouse(.leftMouseDown, start, flags: flags))
        for step in 1...steps {
            host.mouseDragged(with: nsMouse(.leftMouseDragged, Vector2D(x: start.x + dx * Double(step) / Double(steps), y: start.y), flags: flags))
        }
        host.mouseUp(with: nsMouse(.leftMouseUp, Vector2D(x: start.x + dx, y: start.y), flags: flags))
        turn(0.1)
    }

    func testRealMouseDragsNeverOpenACard() throws {
        for type in ["checklist", "text", "toggle", "calculator", "bullets", "counter"] {
            let centre = host.viewportCentreWorld
            let id = try XCTUnwrap(document.createWidget(type: type, at: Vector2D(x: centre.x - 100, y: centre.y - 60), title: type))
            document.clearSelection()
            turn()
            let before = box(id)
            realDrag(id, by: 120)
            XCTAssertNil(document.expandedWidgetId, "\(type): a plain drag")
            XCTAssertTrue(cardViews().isEmpty, "\(type): nothing live after a plain drag")
            XCTAssertNotEqual(box(id).x, before.x, "\(type) moved")
            // Dragging it again while it is selected.
            realDrag(id, by: -80)
            XCTAssertNil(document.expandedWidgetId, "\(type): a drag of the selected card")
            // A quick second press that drags (clickCount 2 from AppKit).
            let tile = box(id)
            let p = interaction.toScreen(Vector2D(x: tile.x + tile.width / 2, y: tile.y + tile.height / 2))
            host.mouseDown(with: nsMouse(.leftMouseDown, p, clickCount: 2))
            for step in 1...6 { host.mouseDragged(with: nsMouse(.leftMouseDragged, Vector2D(x: p.x + Double(step) * 10, y: p.y), clickCount: 2)) }
            host.mouseUp(with: nsMouse(.leftMouseUp, Vector2D(x: p.x + 60, y: p.y), clickCount: 2))
            turn(0.1)
            XCTAssertNil(document.expandedWidgetId, "\(type): a double-press that drags")
            XCTAssertNil(interaction.chrome.fullscreen, "\(type): a double-press that drags opens no sheet")
            // A real double-click, let go in place, still opens the sheet.
            let still = box(id)
            let q = interaction.toScreen(Vector2D(x: still.x + still.width / 2, y: still.y + still.height / 2))
            host.mouseDown(with: nsMouse(.leftMouseDown, q, clickCount: 1))
            host.mouseUp(with: nsMouse(.leftMouseUp, q, clickCount: 1))
            host.mouseDown(with: nsMouse(.leftMouseDown, q, clickCount: 2))
            host.mouseUp(with: nsMouse(.leftMouseUp, q, clickCount: 2))
            XCTAssertEqual(interaction.chrome.fullscreen?.widgetId, id, "\(type): a double-click let go in place opens the sheet")
            interaction.chrome.fullscreen = nil
            interaction.collapse()
            _ = document.deleteWidgets([id])
            turn()
        }
    }

    // MARK: - Icons and layering

    func testASelectedIconStaysAPictureAndOpensGlidingOutOfIt() throws {
        let a = try makeTasks(2)
        let b = try makeText(dx: 400)
        document.setIconified(b, true)
        _ = try XCTUnwrap(document.addGlue([a, b]))
        turn(0.2)
        document.select(a)
        turn()
        XCTAssertTrue(document.isSelected(b), "the group is selected together")
        XCTAssertFalse(interaction.liveHost.mountedIds.contains(b), "a selected icon stays a picture")
        let icon = interaction.controller.drawnRect(document.widget(b)!)
        interaction.expand(b)
        host.sync()
        let card = try XCTUnwrap(interaction.liveHost.view(for: b))
        let lives = card.superview?.subviews.filter { String(describing: type(of: $0)).contains("LiveCardHostingView") } ?? []
        XCTAssertTrue(lives.last === card, "the open card is on top")
        let source = try XCTUnwrap(interaction.liveHost.openingSource(b), "the card glides out of something")
        XCTAssertEqual(source.tile, Size(width: icon.width, height: icon.height), "out of the icon's square")
    }

    func testTheOpenCardIsAboveEveryOtherLiveCard() throws {
        let a = try makeTasks(2)
        let b = try makeText(dx: 120)
        document.selectWidgets([b, a])
        turn()
        interaction.expand(a)
        turn(0.4)
        let card = try XCTUnwrap(interaction.liveHost.view(for: a))
        let lives = try XCTUnwrap(card.superview?.subviews.filter { String(describing: type(of: $0)).contains("LiveCardHostingView") })
        XCTAssertTrue(lives.last === card)
    }

    func testAScaleDragStretchesATileLikeRubberAndCrushingItBecomesAnIconOnTheSpot() throws {
        let id = try makeTasks(2)
        let tile = box(id)
        let corner = interaction.toScreen(Vector2D(x: tile.x + tile.width - 1, y: tile.y + tile.height - 1))
        XCTAssertTrue(interaction.resizeBegin(atScreen: corner), "a resting tile's edge answers: it is a scale drag")
        let zoom = host.session.camera.frame.zoom
        interaction.resizeMove(toScreen: Vector2D(x: corner.x - 20 * zoom, y: corner.y - 20 * zoom))
        let layer = try XCTUnwrap(interaction.controller.hostLayer.cardLayers[id])
        XCTAssertEqual(layer.bounds.size, CGSize(width: tile.width, height: tile.height), "the face keeps its size: no stretch")
        XCTAssertLessThan(layer.transform.m11, 1, "the band shrinks with the pull")
        XCTAssertGreaterThanOrEqual(layer.transform.m11, 0.78, "and never past the rail")
        XCTAssertNotEqual(document.widget(id)?.iconified, true, "not far enough yet")
        let crushed = Vector2D(x: corner.x - 70 * zoom, y: corner.y - 70 * zoom)
        interaction.resizeMove(toScreen: crushed)
        XCTAssertEqual(document.widget(id)?.iconified, true, "across the line the state changes mid-drag, with no destination outline")
        interaction.resizeEnd(atScreen: crushed)
        XCTAssertEqual(document.widget(id)?.iconified, true)
        turn(0.4)

        let icon = box(id)
        let edge = interaction.toScreen(Vector2D(x: icon.x + icon.width - 1, y: icon.y + icon.height - 1))
        XCTAssertTrue(interaction.resizeBegin(atScreen: edge), "an icon's edge scales it")
        let pulled = Vector2D(x: edge.x + 22 * zoom, y: edge.y + 22 * zoom)
        interaction.resizeMove(toScreen: pulled)
        XCTAssertEqual(document.widget(id)?.size, Size(width: 102, height: 102), "held: the exact pull")
        let held = try XCTUnwrap(interaction.controller.hostLayer.cardLayers[id])
        let drawn = try XCTUnwrap(held.contents as! CGImage?)
        XCTAssertEqual(CGFloat(drawn.width) / held.contentsScale, 102, accuracy: 1, "the face is redrawn at the size it wears: corners never stretch")
        XCTAssertEqual(held.cornerRadius, CGFloat(CanvasHostLayer.cardCornerRadius), "the same corner radius at every size")
        let past = Vector2D(x: edge.x + 60 * zoom, y: edge.y + 60 * zoom)
        interaction.resizeMove(toScreen: past)
        XCTAssertEqual(document.widget(id)?.size, Size(width: 120, height: 120), "the box stops at 3×3")
        XCTAssertGreaterThan(held.transform.m11, 1, "but the jelly stretches past it")
        XCTAssertLessThanOrEqual(held.transform.m11, 1.22)
        let tooFar = Vector2D(x: edge.x + 300 * zoom, y: edge.y + 300 * zoom)
        interaction.resizeMove(toScreen: tooFar)
        XCTAssertNotEqual(document.widget(id)?.iconified, true, "dragged wayyy past 3×3: the icon turns back into its resting face")
        interaction.resizeEnd(atScreen: tooFar)
        turn(0.4)
        XCTAssertNotEqual(document.widget(id)?.iconified, true)
        XCTAssertNil(document.expandedWidgetId, "a resting tile, never an open card")
        try {
            document.setIconified(id, true)
            turn(0.4)
            let again = box(id)
            let corner = interaction.toScreen(Vector2D(x: again.x + again.width - 1, y: again.y + again.height - 1))
            XCTAssertTrue(interaction.resizeBegin(atScreen: corner))
            let nudge = Vector2D(x: corner.x + 22 * zoom, y: corner.y + 22 * zoom)
            interaction.resizeMove(toScreen: nudge)
            interaction.resizeEnd(atScreen: nudge)
        }()
        XCTAssertEqual(document.widget(id)?.size, Size(width: 120, height: 120), "let go: the nearest cell")
        XCTAssertEqual(document.widget(id)?.iconified, true, "still the same icon")
        XCTAssertNil(document.expandedWidgetId, "a scale drag never opens the card")
    }

    // MARK: - Groups

    func testAGroupsLinesHugItsTilesAndItsTitleRowStandsOnTheTopLineAtEveryZoom() throws {
        let a = try makeText()
        let b = try makeText(dx: 400)
        let glueId = try XCTUnwrap(document.addGlue([a, b]))
        turn(0.4)
        let frame = try XCTUnwrap(interaction.glueFrames.first { $0.id == glueId })
        let tiles = [a, b].map { interaction.controller.drawnRect(document.widget($0)!) }
        XCTAssertEqual(frame.members.y, tiles.map(\.y).min()!, accuracy: 1e-9)
        XCTAssertEqual(frame.members.y + frame.members.height, tiles.map { $0.y + $0.height }.max()!, accuracy: 1e-9)
        let lines = interaction.controller.hostLayer.glueLines
        XCTAssertEqual(lines.count, 2)
        XCTAssertEqual(frame.members.y - (lines[0].y + lines[0].height), grid * 0.2, accuracy: 1e-9, "0.2 of a cell above the highest tile")
        XCTAssertEqual(lines[1].y - (frame.members.y + frame.members.height), grid * 0.2, accuracy: 1e-9, "0.2 of a cell below the lowest tile")
        for zoom in [1.6, 1.0, 0.6, 0.35] {
            host.session.camera.zoomAtPoint(zoom, focal: Vector2D(x: 300, y: 200))
            host.layoutSubtreeIfNeeded()
            let title = try XCTUnwrap(host.glueTitles[glueId])
            let lineTop = interaction.toScreen(Vector2D(x: frame.members.x, y: lines[0].y))
            let inCanvas = host.convert(title.frame, from: title.superview)
            XCTAssertEqual(inCanvas.maxY, lineTop.y, accuracy: 0.01, "zoom \(zoom): the title row stands on the top line")
            XCTAssertEqual(inCanvas.minX, lineTop.x, accuracy: 0.01)
        }
        if let dir = ProcessInfo.processInfo.environment["GROVEPAD_SNAPSHOT_DIR"] {
            host.session.camera.zoomAtPoint(1.4, focal: Vector2D(x: 300, y: 200))
            window.orderFrontRegardless()
            turn(0.3)
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
            task.arguments = ["-x", "-o", "-l\(window.windowNumber)", dir + "/group-rest.png"]
            try task.run()
            task.waitUntilExit()
        }
    }

    func testAnOpenGroupedCardBlursItsSurroundingsAndSitsAboveTheGroupChrome() throws {
        let a = try makeText()
        let b = try makeText(dx: 400)
        _ = try XCTUnwrap(document.addGlue([a, b]))
        turn(0.2)
        interaction.expand(a)
        turn(0.5)
        let card = try XCTUnwrap(interaction.liveHost.view(for: a))
        let hostLayer = interaction.controller.hostLayer
        let open = box(a)
        let ring = try XCTUnwrap(hostLayer.focusRect, "the board round the open card blurs")
        XCTAssertEqual(ring.x, open.x, accuracy: 0.5)
        XCTAssertEqual(ring.y + ring.height, open.y + open.height, accuracy: 0.5)
        let reach = CanvasHostLayer.focusReach
        XCTAssertEqual(Double(hostLayer.focusLayer.frame.minX), ring.x - reach, accuracy: 0.5, "three cells out, no further")
        XCTAssertEqual(Double(hostLayer.focusLayer.frame.width), ring.width + reach * 2, accuracy: 0.5)
        XCTAssertNotNil(hostLayer.focusLayer.contents, "a blurred picture of the board round the card")
        XCTAssertNil(hostLayer.focusLayer.backgroundFilters, "never a live blur the compositor redoes every frame")
        XCTAssertNotNil(hostLayer.focusLayer.mask, "fading into the live board at the rim")
        let title = try XCTUnwrap(host.glueTitles.values.first)
        let titleIndex = host.subviews.firstIndex { $0 === title.superview }!
        let cardsIndex = host.subviews.firstIndex { $0 === card.superview }!
        XCTAssertLessThan(titleIndex, cardsIndex, "the group's title row is beneath the cards")
        XCTAssertEqual(title.alphaValue, 0, accuracy: 0.01, "and steps aside for the open card's own")
        if let dir = ProcessInfo.processInfo.environment["GROVEPAD_SNAPSHOT_DIR"] {
            window.orderFrontRegardless()
            turn(0.3)
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
            task.arguments = ["-x", "-o", "-l\(window.windowNumber)", dir + "/group-open.png"]
            try task.run()
            task.waitUntilExit()
        }
        interaction.collapse()
        turn(0.5)
        XCTAssertNil(hostLayer.focusRect, "closing lifts the blur")
        XCTAssertEqual(title.alphaValue, 1, accuracy: 0.01)
    }

    func testALineKeepsItsThicknessNextToItsCardsAtEveryZoom() throws {
        let a = try makeText()
        let b = try makeText(dx: 400)
        _ = try XCTUnwrap(document.addRelation(from: a, to: b, type: .parent))
        turn(0.2)
        let edges = interaction.controller.hostLayer.edgeLayer
        var inWorld: [String: Double] = [:]
        for zoom in [0.4, 0.6, 1.8] {
            host.session.camera.zoomAtPoint(zoom, focal: Vector2D(x: 300, y: 200))
            turn(0.05)
            // A board change redraws the lines through the overlay, not the
            // camera: it must style them for the zoom on screen too.
            document.select(a)
            turn(0.1)
            let actual = host.session.camera.frame.zoom
            XCTAssertEqual(edges.zoom, actual, accuracy: 1e-9)
            for id in edges.mountedEdgeIds {
                let main = try XCTUnwrap(edges.group(for: id)?.shape(.main))
                // In world units, so zooming scales it exactly like the cards.
                let width = Double(main.lineWidth)
                if let first = inWorld[id] {
                    XCTAssertEqual(width, first, accuracy: 0.01, "\(id) keeps its thickness next to its cards at zoom \(actual)")
                } else {
                    inWorld[id] = width
                }
            }
            document.clearSelection()
            turn(0.05)
        }
        XCTAssertFalse(inWorld.isEmpty)
    }

    func testAnyOpenCardBlursItsSurroundings() throws {
        let id = try makeText()
        interaction.expand(id)
        turn(0.5)
        XCTAssertNotNil(interaction.liveHost.view(for: id))
        XCTAssertNotNil(interaction.controller.hostLayer.focusRect, "a card outside any group gets the soft ring too")
        interaction.collapse()
        turn(0.5)
        XCTAssertNil(interaction.controller.hostLayer.focusRect)
    }

    private func snapshot(_ name: String) throws {
        guard let dir = ProcessInfo.processInfo.environment["GROVEPAD_SNAPSHOT_DIR"] else { return }
        window.orderFrontRegardless()
        turn(0.3)
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        task.arguments = ["-x", "-o", "-l\(window.windowNumber)", dir + "/\(name).png"]
        try task.run()
        task.waitUntilExit()
    }

    func testCommandDragPreviewsTheSlotItWillJoinOrTheGroupItWillLeave() throws {
        let a = try makeText()
        let b = try makeText(dx: 400)
        let c = try makeText(dx: -600)
        _ = try XCTUnwrap(document.addGlue([a, b]))
        turn(0.2)
        let hostLayer = interaction.controller.hostLayer
        // ⌘-drag b far from a: it would leave the group.
        let tileB = box(b)
        let start = interaction.toScreen(Vector2D(x: tileB.x + tileB.width / 2, y: tileB.y + tileB.height / 2))
        var down = mouse(.down, start)
        down.modifiers = .cmd
        interaction.pointerDown(down)
        var point = start
        for _ in 0..<8 {
            point.y += 40
            var move = mouse(.move, point)
            move.modifiers = .cmd
            interaction.pointerMove(move)
        }
        XCTAssertNotNil(hostLayer.glueIntent?.pulling, "a card dragged out of reach shows it is leaving")
        XCTAssertNil(hostLayer.glueIntent?.slot)
        try snapshot("glue-pull")
        // Bring it next to c: a slot beside c, and a ring on c.
        let tileC = box(c)
        let target = interaction.toScreen(Vector2D(x: tileC.x + tileC.width + tileB.width / 2 + 10, y: tileC.y + tileC.height / 2))
        for step in 1...10 {
            let t = Double(step) / 10
            var move = mouse(.move, Vector2D(x: point.x + (target.x - point.x) * t, y: point.y + (target.y - point.y) * t))
            move.modifiers = .cmd
            interaction.pointerMove(move)
        }
        let paint = try XCTUnwrap(hostLayer.glueIntent)
        XCTAssertEqual(paint.target, interaction.controller.drawnRect(document.widget(c)!))
        let slot = try XCTUnwrap(paint.slot)
        XCTAssertEqual(slot.x, tileC.x + tileC.width, accuracy: 0.5, "the slot sits right against c's side")
        try snapshot("glue-slot")
        interaction.pointerUp(mouse(.up, target))
        turn()
        XCTAssertNil(hostLayer.glueIntent, "the preview leaves with the drop")
        XCTAssertNotNil(document.glue(containing: c), "and the drop does what it showed")
        XCTAssertEqual(box(b).x, slot.x, accuracy: 0.5)
    }

    // MARK: - Frame budget

    /// One camera frame on a board with groups and an open grouped card must
    /// do only placement work: no group rebuild, no filter rebuild.
    func testACameraFrameStaysInsideTheFrameBudget() throws {
        var ids: [String] = []
        for row in 0..<4 {
            for col in 0..<6 {
                let centre = host.viewportCentreWorld
                let id = try XCTUnwrap(document.createWidget(type: col % 2 == 0 ? "text" : "checklist", at: Vector2D(x: centre.x - 1200 + Double(col) * 400, y: centre.y - 600 + Double(row) * 400), title: "W"))
                ids.append(id)
            }
        }
        for pair in stride(from: 0, to: 12, by: 2) { _ = document.addGlue([ids[pair], ids[pair + 1]]) }
        document.clearSelection()
        turn(0.2)
        interaction.expand(ids[0])
        turn(0.5)
        let camera = host.session.camera
        let rebuilds = host.glueSyncs
        let frames = 240
        let start = CFAbsoluteTimeGetCurrent()
        for i in 0..<frames {
            camera.setView(Vector2D(x: camera.frame.pan.x + 3, y: camera.frame.pan.y + 1), camera.frame.zoom * (i % 2 == 0 ? 1.004 : 0.997))
        }
        let perFrame = (CFAbsoluteTimeGetCurrent() - start) / Double(frames) * 1000
        print("FRAME-BUDGET ms per camera frame: \(perFrame)")
        XCTAssertEqual(host.glueSyncs, rebuilds, "camera frames move the group chrome, never rebuild it")
        // 120 Hz leaves 8.3 ms for everything; the canvas's own share, in a
        // debug build, stays well under it.
        XCTAssertLessThan(perFrame, 4)
    }

    // MARK: - Hover and the pointer

    func testHoverLightsATileWithoutChangingItsFace() throws {
        let id = try makeTasks(2)
        let layer = try XCTUnwrap(interaction.controller.hostLayer.cardLayers[id])
        let picture = layer.contents as AnyObject?
        XCTAssertFalse(layer.isLit)
        document.hoverWidgetId = id
        turn(0.05)
        XCTAssertTrue(layer.isLit, "the tile under the pointer lights up")
        XCTAssertTrue(layer.isLifted)
        XCTAssertTrue(interaction.controller.restingCardIds.contains(id), "and stays a resting tile")
        XCTAssertTrue((layer.contents as AnyObject?) === picture, "with the very same picture")
        document.hoverWidgetId = nil
        turn(0.05)
        XCTAssertFalse(layer.isLit)
    }

    func testMovingThePointerMeasuresNothing() throws {
        for index in 0..<12 { _ = try makeTasks(3, dx: Double(index % 4) * 280 - 400) }
        turn()
        let before = interaction.tileMeasurements
        for step in 0..<200 {
            let point = Vector2D(x: Double(step * 5 % 1000), y: Double(step * 3 % 700))
            _ = interaction.resizeTarget(atScreen: point)
            _ = interaction.widgetId(atWorld: interaction.toWorld(point))
            interaction.hover(at: point)
        }
        XCTAssertEqual(interaction.tileMeasurements, before, "tile sizes are remembered until the board changes")
    }
}
#endif
