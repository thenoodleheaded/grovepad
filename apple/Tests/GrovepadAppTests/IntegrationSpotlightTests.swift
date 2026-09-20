import XCTest
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
@testable import GrovepadApp

/// Spotlight: the item builder (canvases with their path, cards with title,
/// first line and type label, stable identifiers), the debounced diffing
/// indexer, and the continuation that reveals a result.
@MainActor
final class IntegrationSpotlightTests: XCTestCase {
    private var directory: URL!

    override func setUp() {
        super.setUp()
        directory = AppFixtures.temporaryDirectory("spotlight")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: directory)
        super.tearDown()
    }

    func testIdentifiersRoundTripAndRefuseOtherShapes() {
        XCTAssertEqual(SpotlightIdentifier.canvas("c1").string, "canvas:c1")
        XCTAssertEqual(SpotlightIdentifier("canvas:c1"), .canvas("c1"))
        XCTAssertEqual(SpotlightIdentifier("widget:w-2"), .widget("w-2"))
        XCTAssertNil(SpotlightIdentifier("canvas:"))
        XCTAssertNil(SpotlightIdentifier("board:x"))
        XCTAssertNil(SpotlightIdentifier(""))
    }

    func testBuilderDescribesCanvasesByPathAndCardsByTitleLineAndKind() throws {
        let document = BoardDocument(board: AppCoordinator.emptyBoard(mint: .counting(prefix: "b-"), clock: .fixed(ms: 1)), mint: .counting(prefix: "m-"), clock: .fixed(ms: 1))
        let root = document.activeCanvasId
        document.renameCanvas(root, name: "Origin")
        let door = try XCTUnwrap(document.createWidget(type: "canvas_node", at: .zero, title: "Biology"))
        let inner = try XCTUnwrap(document.widget(door)?.data.string("canvasId"))
        let note = try XCTUnwrap(document.createWidget(type: "text", at: Vector2D(x: 400, y: 0), title: "   "))
        document.updateWidgetData(note) { $0["text"] = .string("  First line here\nSecond line") }
        let tally = try XCTUnwrap(document.createWidget(type: "counter", at: Vector2D(x: 800, y: 0), title: "Tally"))

        var board = document.board
        board.widgets["bare"] = Widget(id: "bare", type: "canvas_node", title: "", canvasId: root, position: .zero, size: Size(width: 100, height: 100), data: JSONObject())
        let items = SpotlightItemBuilder.items(for: board)
        let byId = Dictionary(uniqueKeysWithValues: items.map { ($0.identifier.string, $0) })
        XCTAssertEqual(items.count, 6)

        let origin = try XCTUnwrap(byId["canvas:\(root)"])
        XCTAssertEqual(origin.title, "Origin")
        XCTAssertEqual(origin.kind, "Canvas")
        XCTAssertEqual(origin.description, "Workspace", "a root shows its workspace")
        let bio = try XCTUnwrap(byId["canvas:\(inner)"])
        XCTAssertEqual(bio.description, "Origin › Biology")
        XCTAssertEqual(bio.keywords, ["Workspace", "Origin", "Biology"])

        let noteItem = try XCTUnwrap(byId["widget:\(note)"])
        XCTAssertEqual(noteItem.title, "Text", "an untitled card is named after its type")
        XCTAssertEqual(noteItem.description, "First line here")
        XCTAssertEqual(noteItem.kind, "Text")
        XCTAssertEqual(noteItem.canvasId, root)
        let tallyItem = try XCTUnwrap(byId["widget:\(tally)"])
        XCTAssertEqual(tallyItem.title, "Tally")
        XCTAssertEqual(tallyItem.kind, "Counter")
        XCTAssertEqual(tallyItem.description, "Tally", "the first words inside: the counter's label")
        XCTAssertEqual(byId["widget:\(door)"]?.kind, "Canvas")
        let bare = try XCTUnwrap(byId["widget:bare"])
        XCTAssertEqual(bare.title, "Canvas", "no title: the type label")
        XCTAssertEqual(bare.description, "Canvas on Origin", "no words inside: the label and the canvas")

        var data = JSONObject()
        data["text"] = .string(String(repeating: "word ", count: 60))
        XCTAssertEqual(SpotlightItemBuilder.firstLine(of: data).count, SpotlightItemBuilder.lineLimit + 1, "bounded, with an ellipsis")
        data["text"] = .string(String(repeating: "a", count: 300))
        XCTAssertEqual(SpotlightItemBuilder.firstLine(of: data), "", "a long spaceless token (an id, a blob) is not a line")
    }

    func testIndexerSendsOnlyWhatChangedAndRemovesWhatWasDeleted() throws {
        let timers = ManualTimerSource()
        let index = RecordingSearchableIndex()
        var deps = AppCoordinator.Dependencies(storeDirectory: directory)
        deps.timers = timers
        deps.clock = .fixed(ms: 1_789_000_000_000)
        deps.mint = .counting(prefix: "app-")
        deps.heartbeat = FakeHeartbeat()
        deps.settingsStore = InMemoryKeyValueStore()
        deps.toastScheduler = ManualToastScheduler()
        deps.frameScheduler = { ManualScheduler() }
        deps.noteWidgetFileURL = directory.appendingPathComponent("payload.json")
        deps.widgetReloader = RecordingWidgetReloader()
        deps.searchIndex = index
        deps.haptics = Haptics()
        let coordinator = AppCoordinator(dependencies: deps)
        coordinator.start()
        defer { coordinator.dispose() }
        let root = coordinator.document.activeCanvasId

        XCTAssertEqual(index.log, ["deleteAll", "index:canvas:\(root)"], "start replaces an older build's index with the board")

        let id = try XCTUnwrap(coordinator.document.createWidget(type: "text", at: .zero, title: "Plan"))
        coordinator.document.renameWidget(id, title: "Plan B")
        XCTAssertEqual(index.log.count, 2, "nothing until the debounce fires")
        timers.advance(byMs: 1_400)
        XCTAssertEqual(index.log.count, 2)
        timers.advance(byMs: 100)
        XCTAssertEqual(index.log.last, "index:widget:\(id)", "one pass for the burst, only the changed item")
        XCTAssertEqual(index.indexed["widget:\(id)"]?.title, "Plan B")

        coordinator.document.moveWidgets([id], by: Vector2D(x: 10, y: 0))
        timers.advance(byMs: 1_500)
        XCTAssertEqual(index.log.count, 3, "a move changes no text: nothing sent")

        _ = coordinator.document.deleteWidgets([id])
        coordinator.noteScenePhase(.background)
        XCTAssertEqual(index.log.last, "delete:widget:\(id)", "the flush on the way out removes the card")
        XCTAssertNil(index.indexed["widget:\(id)"])
        XCTAssertNotNil(index.indexed["canvas:\(root)"])
    }

    func testAChosenResultRevealsTheCanvasOrTheCard() throws {
        let coordinator = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource())
        coordinator.start()
        defer { coordinator.dispose() }
        let session = coordinator.makeSession()
        let door = try XCTUnwrap(coordinator.document.createWidget(type: "canvas_node", at: .zero, title: "Inner"))
        let inner = try XCTUnwrap(coordinator.document.widget(door)?.data.string("canvasId"))
        coordinator.document.navigate(to: inner)
        let card = try XCTUnwrap(coordinator.document.createWidget(type: "text", at: .zero, title: "Deep note"))
        coordinator.document.navigate(to: coordinator.document.board.workspaces.values.first!.rootCanvasId)

        XCTAssertTrue(coordinator.continueActivity(.spotlight(.widget(card)), in: session))
        XCTAssertEqual(coordinator.document.activeCanvasId, inner)
        XCTAssertEqual(coordinator.document.selection, [card], "the card is selected on its canvas")
        XCTAssertFalse(coordinator.continueActivity(.spotlight(.widget("gone")), in: session))
        XCTAssertTrue(coordinator.continueActivity(.spotlight(.canvas(inner)), in: session))

        #if canImport(CoreSpotlight)
        let activity = NSUserActivity(activityType: "com.apple.corespotlightitem")
        activity.userInfo = ["kCSSearchableItemActivityIdentifier": "widget:\(card)"]
        XCTAssertEqual(ActivityContinuation(activity), .spotlight(.widget(card)))
        #endif
        XCTAssertNil(ActivityContinuation(activityType: "com.example.other", userInfo: nil))
    }
}
