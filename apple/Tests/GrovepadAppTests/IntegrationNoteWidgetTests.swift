import XCTest
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
@testable import GrovepadApp

/// The WidgetKit Note payload (`nativeNoteWidget.ts` bounds), the write on
/// commit (`nativeNoteWidgetSync.ts` debounce and skip), the context-menu
/// row, and the contract the extension reads.
@MainActor
final class IntegrationNoteWidgetTests: XCTestCase {
    private var directory: URL!

    override func setUp() {
        super.setUp()
        directory = AppFixtures.temporaryDirectory("note-widget")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: directory)
        super.tearDown()
    }

    private func board(text: String, title: String = "Note", color: String = "yellow", mode: String = "plain") -> (Board, String) {
        var board = AppCoordinator.emptyBoard(mint: .counting(prefix: "b-"), clock: .fixed(ms: 1))
        var data = JSONObject()
        data["text"] = .string(text)
        data["mode"] = .string(mode)
        data["color"] = .string(color)
        let widget = Widget(id: "w-1", type: "text", title: title, canvasId: board.activeCanvasId, position: .zero, size: Size(width: 320, height: 200), data: data)
        board.widgets["w-1"] = widget
        return (board, "w-1")
    }

    func testPayloadBoundsTitleTextColourAndMode() {
        let longTitle = String(repeating: "t", count: 500)
        let longText = String(repeating: "x", count: NoteWidgetPayload.textMax + 10)
        let (board, id) = board(text: longText, title: longTitle, color: "teal", mode: "sticky")
        let payload = NoteWidgetPayload.derive(selectedWidgetId: id, board: board)
        let note = try! XCTUnwrap(payload.note)
        XCTAssertEqual(note.title.count, NoteWidgetPayload.titleMax)
        XCTAssertEqual(note.text.count, NoteWidgetPayload.textMax)
        XCTAssertEqual(note.color, "green", "teal folds to green as the TypeScript fold table says")
        XCTAssertEqual(note.mode, "sticky")
        XCTAssertEqual(note.id, id)

        XCTAssertEqual(NoteWidgetPayload.nativeColor("red"), "pink")
        XCTAssertEqual(NoteWidgetPayload.nativeColor("orange"), "yellow")
        XCTAssertEqual(NoteWidgetPayload.nativeColor("lime"), "green")
        XCTAssertEqual(NoteWidgetPayload.nativeColor("chartreuse"), "yellow", "an unknown colour lands on yellow")
        XCTAssertEqual(NoteWidgetPayload.nativeColor(nil), "yellow")
        XCTAssertEqual(NoteWidgetPayload.derive(selectedWidgetId: "w-1", board: board).note?.mode, "sticky")
        let (plainBoard, _) = self.board(text: "a", mode: "typewriter")
        XCTAssertEqual(NoteWidgetPayload.derive(selectedWidgetId: "w-1", board: plainBoard).note?.mode, "plain", "only sticky is sticky")
    }

    func testBoundedCutsOnUTF16UnitsAndDropsALoneHighSurrogate() {
        // "ab" + 😀 (two UTF-16 units): a cut at 3 would leave half the emoji.
        let text = "ab😀cd"
        XCTAssertEqual(NoteWidgetPayload.bounded(text, 3), "ab")
        XCTAssertEqual(NoteWidgetPayload.bounded(text, 4), "ab😀")
        XCTAssertEqual(NoteWidgetPayload.bounded(text, 100), text)
    }

    func testNothingSelectedOrNotATextCardIsANullNote() {
        var (board, _) = board(text: "hello")
        XCTAssertNil(NoteWidgetPayload.derive(selectedWidgetId: nil, board: board).note)
        XCTAssertNil(NoteWidgetPayload.derive(selectedWidgetId: "missing", board: board).note)
        board.widgets["c-1"] = Widget(id: "c-1", type: "counter", title: "Tally", canvasId: board.activeCanvasId, position: .zero, size: Size(width: 200, height: 120), data: JSONObject())
        XCTAssertNil(NoteWidgetPayload.derive(selectedWidgetId: "c-1", board: board).note)
    }

    func testSerializedKeyOrderMatchesJSONStringifyAndRoundTrips() {
        let (board, id) = board(text: "Milk\nEggs", title: "Shop", color: "blue")
        let payload = NoteWidgetPayload.derive(selectedWidgetId: id, board: board)
        XCTAssertEqual(payload.serialized, #"{"schemaVersion":1,"note":{"id":"w-1","title":"Shop","text":"Milk\nEggs","color":"blue","mode":"plain"}}"#)
        XCTAssertEqual(NoteWidgetPayload(note: nil).serialized, #"{"schemaVersion":1,"note":null}"#)
        XCTAssertEqual(NoteWidgetPayload.parse(payload.serialized), payload)
        XCTAssertEqual(NoteWidgetPayload.parse(#"{"schemaVersion":1,"note":null}"#), NoteWidgetPayload(note: nil))
        XCTAssertNil(NoteWidgetPayload.parse(#"{"schemaVersion":2,"note":null}"#), "a schema the reader does not know is refused")
    }

    /// The extension decodes the file with its own constants: pin them to
    /// the app's so a rename on one side cannot silently break the other.
    func testExtensionReaderSharesTheContract() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let reader = try String(contentsOf: root.appendingPathComponent("App/NoteWidget/NoteWidgetPayloadReader.swift"), encoding: .utf8)
        XCTAssertTrue(reader.contains("static let appGroup = \"\(NoteWidgetPayload.appGroup)\""))
        XCTAssertTrue(reader.contains("static let fileName = \"\(NoteWidgetPayload.fileName)\""))
        XCTAssertTrue(reader.contains("static let widgetKind = \"\(NoteWidgetPayload.widgetKind)\""))
        XCTAssertTrue(reader.contains("static let schemaVersion = \(NoteWidgetPayload.schemaVersion)"))
        let payload = NoteWidgetPayload.derive(selectedWidgetId: "w-1", board: board(text: "hi").0).serialized
        // Codable on the extension side reads the same keys.
        struct Note: Decodable { let id: String; let title: String; let text: String; let color: String; let mode: String }
        struct Payload: Decodable { let schemaVersion: Int; let note: Note? }
        let decoded = try JSONDecoder().decode(Payload.self, from: Data(payload.utf8))
        XCTAssertEqual(decoded.schemaVersion, 1)
        XCTAssertEqual(decoded.note?.text, "hi")
    }

    func testSelectingWritesAtOnceAndEditsWriteAfterTheDebounce() throws {
        let timers = ManualTimerSource()
        let reloader = RecordingWidgetReloader()
        let file = directory.appendingPathComponent("group/payload.json")
        var deps = AppCoordinator.Dependencies(storeDirectory: directory.appendingPathComponent("store"))
        deps.timers = timers
        deps.clock = .fixed(ms: 1_789_000_000_000)
        deps.mint = .counting(prefix: "app-")
        deps.heartbeat = FakeHeartbeat()
        deps.settingsStore = InMemoryKeyValueStore()
        deps.toastScheduler = ManualToastScheduler()
        deps.frameScheduler = { ManualScheduler() }
        deps.noteWidgetFileURL = file
        deps.widgetReloader = reloader
        deps.searchIndex = RecordingSearchableIndex()
        deps.haptics = Haptics()
        let coordinator = AppCoordinator(dependencies: deps)
        coordinator.start()
        defer { coordinator.dispose() }
        let session = coordinator.makeSession()

        let id = try XCTUnwrap(coordinator.document.createWidget(type: "text", at: .zero, title: "Plan"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: file.path), "nothing chosen, nothing written")
        XCTAssertEqual(coordinator.noteWidget.menuState(for: id), .available)

        // The context-menu row: a Text card offers it, another type does not.
        let model = try XCTUnwrap(session.contextMenuModel(for: id))
        XCTAssertEqual(model.rows.map(\.id).contains(.noteWidget), true)
        XCTAssertEqual(model.rows.first { $0.id == .noteWidget }?.label, "Show in widget")
        let counter = try XCTUnwrap(coordinator.document.createWidget(type: "counter", at: Vector2D(x: 400, y: 0), title: "Tally"))
        XCTAssertFalse(try XCTUnwrap(session.contextMenuModel(for: counter)).rows.map(\.id).contains(.noteWidget))

        // Choosing through the row writes now and asks WidgetKit to reload.
        model.run(.noteWidget, document: coordinator.document, actions: session.contextMenuActions)
        XCTAssertEqual(coordinator.noteWidget.selectedWidgetId, id)
        XCTAssertEqual(coordinator.noteWidget.writeCount, 1)
        // The shared reloader also carries the Grovepad Widget's reloads; count the Note's.
        let noteReloads = { reloader.reloads.filter { $0 == NoteWidgetPayload.widgetKind } }
        XCTAssertEqual(noteReloads(), [NoteWidgetPayload.widgetKind])
        XCTAssertEqual(NoteWidgetPayload.parse(try String(contentsOf: file, encoding: .utf8))?.note?.title, "Plan")
        XCTAssertEqual(deps.settingsStore.string(forKey: NoteWidgetSync.selectionKey), id, "the choice is device state")
        XCTAssertEqual(session.contextMenuModel(for: id)?.rows.first { $0.id == .noteWidget }?.label, "Remove from widget")

        // Typing: debounced 240 ms, one write for a burst.
        coordinator.document.updateWidgetData(id) { $0["text"] = .string("Buy milk") }
        coordinator.document.updateWidgetData(id) { $0["text"] = .string("Buy milk and eggs") }
        XCTAssertEqual(coordinator.noteWidget.writeCount, 1)
        timers.advance(byMs: 200)
        XCTAssertEqual(coordinator.noteWidget.writeCount, 1)
        timers.advance(byMs: 40)
        XCTAssertEqual(coordinator.noteWidget.writeCount, 2)
        XCTAssertEqual(NoteWidgetPayload.parse(try String(contentsOf: file, encoding: .utf8))?.note?.text, "Buy milk and eggs")
        XCTAssertEqual(noteReloads().count, 2)

        // A move cannot change the snapshot: no write, no reload.
        coordinator.document.moveWidgets([id], by: Vector2D(x: 20, y: 20))
        timers.advance(byMs: 300)
        XCTAssertEqual(coordinator.noteWidget.writeCount, 2)

        // Going to the background flushes a pending write.
        coordinator.document.renameWidget(id, title: "Plan B")
        coordinator.noteScenePhase(.background)
        XCTAssertEqual(coordinator.noteWidget.writeCount, 3)
        XCTAssertEqual(NoteWidgetPayload.parse(try String(contentsOf: file, encoding: .utf8))?.note?.title, "Plan B")

        // Removing writes the empty snapshot at once.
        session.contextMenuActions.toggleNoteWidget(id)
        XCTAssertNil(coordinator.noteWidget.selectedWidgetId)
        XCTAssertEqual(NoteWidgetPayload.parse(try String(contentsOf: file, encoding: .utf8)), NoteWidgetPayload(note: nil))
        XCTAssertNil(deps.settingsStore.string(forKey: NoteWidgetSync.selectionKey))
    }

    func testTheChoiceSurvivesARelaunch() throws {
        let settings = InMemoryKeyValueStore()
        settings.set("w-9", forKey: NoteWidgetSync.selectionKey)
        let timers = ManualTimerSource()
        let file = directory.appendingPathComponent("payload.json")
        let sync = NoteWidgetSync(document: BoardDocument(board: AppCoordinator.emptyBoard()), fileURL: file, settings: settings, reloader: RecordingWidgetReloader(), timers: timers)
        XCTAssertEqual(sync.selectedWidgetId, "w-9")
        XCTAssertNil(sync.payload.note, "a card the board no longer holds is an empty snapshot")
    }
}
