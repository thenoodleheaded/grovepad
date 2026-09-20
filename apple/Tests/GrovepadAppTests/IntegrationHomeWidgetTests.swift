import XCTest
import SwiftUI
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
import GrovepadHomeWidget
@testable import GrovepadApp
#if canImport(AppKit)
import AppKit
#endif

/// The "Grovepad Widget" home-screen widget: the mirror the app keeps in the
/// App Group (catalog + one card per widget), the incremental writer, the
/// tap-to-open link, and the drawing of every face at every size.
@MainActor
final class IntegrationHomeWidgetTests: XCTestCase {
    private var directory: URL!

    override func setUp() {
        super.setUp()
        directory = AppFixtures.temporaryDirectory("home-widget")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: directory)
        super.tearDown()
    }

    private struct Harness {
        let coordinator: AppCoordinator
        let timers: ManualTimerSource
        let reloader: RecordingWidgetReloader
        let folder: HomeWidgetFolder
    }

    private func harness() -> Harness {
        let timers = ManualTimerSource()
        let reloader = RecordingWidgetReloader()
        let folderURL = directory.appendingPathComponent("group/home-widgets", isDirectory: true)
        var deps = AppCoordinator.Dependencies(storeDirectory: directory.appendingPathComponent("store"))
        deps.timers = timers
        deps.clock = .fixed(ms: 1_789_000_000_000)
        deps.mint = .counting(prefix: "app-")
        deps.heartbeat = FakeHeartbeat()
        deps.settingsStore = InMemoryKeyValueStore()
        deps.toastScheduler = ManualToastScheduler()
        deps.frameScheduler = { ManualScheduler() }
        deps.noteWidgetFileURL = directory.appendingPathComponent("group/note.json")
        deps.homeWidgetFolder = folderURL
        deps.widgetReloader = reloader
        deps.searchIndex = RecordingSearchableIndex()
        deps.haptics = Haptics()
        return Harness(coordinator: AppCoordinator(dependencies: deps), timers: timers, reloader: reloader, folder: HomeWidgetFolder(url: folderURL))
    }

    private func checklistItems(_ count: Int, done: Int) -> JSONValue {
        .array((0..<count).map { index in
            var item = JSONObject()
            item["id"] = .string("i-\(index)")
            item["label"] = .string("Task \(index + 1)")
            item["done"] = .bool(index < done)
            return .object(item)
        })
    }

    // MARK: - Contract

    func testTheOpenLinkRoundTripsAndOtherLinksAreNotItsBusiness() {
        let url = HomeWidgetContract.openURL(widgetId: "w-123")
        XCTAssertEqual(url.absoluteString, "grovepad://widget/w-123")
        XCTAssertEqual(HomeWidgetContract.widgetId(from: url), "w-123")
        XCTAssertNil(HomeWidgetContract.widgetId(from: URL(string: "grovepad://auth/callback")!))
        XCTAssertNil(HomeWidgetContract.widgetId(from: URL(string: "grovepad://widget/")!))
        XCTAssertNil(HomeWidgetContract.widgetId(from: URL(string: "https://widget/w-1")!))
    }

    func testACardFileNameCanNeverLeaveTheFolder() {
        XCTAssertEqual(HomeWidgetContract.cardFileName(widgetId: "3F2A-b_9"), "3F2A-b_9.json")
        let hostile = HomeWidgetContract.cardFileName(widgetId: "../../etc")
        XCTAssertFalse(hostile.contains("/"))
        XCTAssertFalse(hostile.contains(".."))
        XCTAssertEqual(hostile, "x2e2e2f2e2e2f657463.json")
    }

    // MARK: - Snapshot builder

    func testAListCardTravelsWithTheRoomierHomeScreenLimitsAndTheCanvasKeepsItsOwn() throws {
        var board = AppCoordinator.emptyBoard(mint: .counting(prefix: "b-"), clock: .fixed(ms: 1))
        var data = JSONObject()
        data["items"] = checklistItems(20, done: 5)
        board.widgets["t-1"] = Widget(id: "t-1", type: "checklist", title: "Launch", canvasId: board.activeCanvasId, position: .zero, size: Size(width: 320, height: 240), data: data)

        let card = HomeWidgetSnapshotBuilder.card(for: try XCTUnwrap(board.widgets["t-1"]), in: board, nowMs: 0)
        guard case .rows(let eyebrow, let rows, let overflow, let meter) = card.face else { return XCTFail("a checklist rests as rows, got \(card.face)") }
        XCTAssertEqual(rows.count, RestingFaceMeasure.Limits.homeScreen.rows)
        XCTAssertEqual(overflow, 20 - RestingFaceMeasure.Limits.homeScreen.rows, "what does not fit is counted, never dropped silently")
        XCTAssertEqual(eyebrow?.note, "5/20")
        XCTAssertEqual(meter ?? 0, 0.25, accuracy: 0.0001)
        XCTAssertEqual(rows.first?.done, true)
        XCTAssertEqual(card.title, "Launch")
        XCTAssertEqual(card.kind, WidgetRegistry.definition(for: "checklist")?.label)
        XCTAssertEqual(HomeWidgetContract.openURL(widgetId: card.id).absoluteString, "grovepad://widget/t-1")

        // The canvas's own tile is untouched by the override.
        XCTAssertEqual(RestingFaceMeasure.rowLimit, 6)
        if case .rows(let tileRows, _, _, _) = WidgetRendererRegistry.renderer(for: "checklist").restingFace(try XCTUnwrap(board.widgets["t-1"])) {
            XCTAssertEqual(tileRows.count, 6)
        } else {
            XCTFail("the tile is rows too")
        }
    }

    func testANoteTravelsWholeAndAClockCarriesTheInstantItTicksTo() throws {
        var board = AppCoordinator.emptyBoard(mint: .counting(prefix: "b-"), clock: .fixed(ms: 1))
        let words = String(repeating: "word ", count: 300)
        var note = JSONObject()
        note["text"] = .string(words)
        board.widgets["n-1"] = Widget(id: "n-1", type: "text", title: "", canvasId: board.activeCanvasId, position: .zero, size: Size(width: 320, height: 200), data: note)
        let noteCard = HomeWidgetSnapshotBuilder.card(for: try XCTUnwrap(board.widgets["n-1"]), in: board, nowMs: 0)
        guard case .note(let text, _, _) = noteCard.face else { return XCTFail("a Text card is its page, got \(noteCard.face)") }
        XCTAssertEqual(text, words, "the Note's words are not clipped to the tile's 220 characters")
        XCTAssertEqual(noteCard.displayTitle, noteCard.kind, "an untitled card wears its type's name")
        XCTAssertNil(noteCard.live)

        let document = BoardDocument(board: board)
        let timer = try XCTUnwrap(document.createWidget(type: "timekeeper", at: Vector2D(x: 0, y: 400), title: "Focus"))
        document.updateWidgetData(timer) { data in
            data["mode"] = .string("countdown")
            var countdown = JSONObject()
            countdown["endAt"] = .number(1_789_000_060_000)
            countdown["durationSeconds"] = .number(300)
            data["countdown"] = .object(countdown)
        }
        let timerWidget = try XCTUnwrap(document.widget(timer))
        let clockCard = HomeWidgetSnapshotBuilder.card(for: timerWidget, in: document.board, nowMs: 1_789_000_000_000)
        if case .clock(_, let clock, _, _) = clockCard.face {
            XCTAssertEqual(clock?.running, true)
            XCTAssertEqual(clock?.readout, "01:00")
            XCTAssertEqual(clockCard.live?.countsDownToMs, 1_789_000_060_000, "the widget ticks to the card's own end instant")
        } else if TimekeeperClock.reading(timerWidget.data, nowMs: 0) != nil {
            XCTFail("a running countdown rests as a clock, got \(clockCard.face)")
        }
    }

    func testTheCatalogListsEveryCanvasByPathAndItsCardsInReadingOrder() throws {
        let document = BoardDocument(board: AppCoordinator.emptyBoard(mint: .counting(prefix: "b-"), clock: .fixed(ms: 1)))
        let low = try XCTUnwrap(document.createWidget(type: "counter", at: Vector2D(x: 0, y: 400), title: "Low"))
        let high = try XCTUnwrap(document.createWidget(type: "text", at: Vector2D(x: 400, y: 0), title: "High"))
        let catalog = HomeWidgetSnapshotBuilder.catalog(for: document.board)
        let canvas = try XCTUnwrap(catalog.canvas(id: document.activeCanvasId))
        XCTAssertEqual(canvas.widgets.map(\.id), [high, low], "top to bottom")
        XCTAssertFalse(canvas.path.isEmpty)
        XCTAssertEqual(catalog.entry(widgetId: low)?.canvas.id, canvas.id)
        XCTAssertEqual(catalog.entry(widgetId: low)?.entry.symbol, WidgetSymbols.symbol(for: "counter", skin: WidgetRegistry.definition(for: "counter")?.skinValue(in: try XCTUnwrap(document.widget(low)).data)))
    }

    // MARK: - The writer

    func testTheMirrorFollowsEditsOneFileAtATimeAndForgetsDeletedCards() throws {
        let h = harness()
        h.coordinator.start()
        defer { h.coordinator.dispose() }
        let document = h.coordinator.document
        let launchReloads = h.reloader.reloads.count
        let a = try XCTUnwrap(document.createWidget(type: "checklist", at: .zero, title: "Groceries"))
        let b = try XCTUnwrap(document.createWidget(type: "counter", at: Vector2D(x: 400, y: 0), title: "Cups"))
        h.timers.advance(byMs: HomeWidgetSync.debounceMs)

        let catalog = try XCTUnwrap(h.folder.readCatalog(), "the pickers have something to read")
        XCTAssertEqual(Set(catalog.canvases.flatMap(\.widgets).map(\.id)), [a, b])
        XCTAssertEqual(h.folder.readCard(widgetId: a)?.title, "Groceries")
        XCTAssertEqual(h.folder.readCard(widgetId: b)?.title, "Cups")
        XCTAssertEqual(h.reloader.reloads.count - launchReloads, 1, "one pass, one reload")

        // Editing one card rewrites that card only (the catalog is unchanged).
        let writes = h.coordinator.homeWidgets.fileWrites
        document.updateWidgetData(a) { $0["items"] = self.checklistItems(3, done: 1) }
        document.updateWidgetData(a) { $0["items"] = self.checklistItems(3, done: 2) }
        h.timers.advance(byMs: HomeWidgetSync.debounceMs - 1)
        XCTAssertEqual(h.coordinator.homeWidgets.fileWrites, writes, "debounced")
        h.timers.advance(byMs: 1)
        XCTAssertEqual(h.coordinator.homeWidgets.fileWrites, writes + 1)
        guard case .rows(let eyebrow, _, _, _) = try XCTUnwrap(h.folder.readCard(widgetId: a)).face else { return XCTFail("rows") }
        XCTAssertEqual(eyebrow?.note, "2/3")

        // Moving a card changes nothing a card shows: no card write, no reload
        // unless the reading order in the catalog moved.
        let reloads = h.reloader.reloads.count
        let writesBeforeMove = h.coordinator.homeWidgets.fileWrites
        document.moveWidgets([b], by: Vector2D(x: 40, y: 0))
        h.timers.advance(byMs: HomeWidgetSync.debounceMs)
        XCTAssertEqual(h.coordinator.homeWidgets.fileWrites, writesBeforeMove)
        XCTAssertEqual(h.reloader.reloads.count, reloads)

        // Renaming the canvas reaches every card on it.
        document.renameCanvas(document.activeCanvasId, name: "Kitchen")
        h.timers.advance(byMs: HomeWidgetSync.debounceMs)
        XCTAssertEqual(h.folder.readCard(widgetId: a)?.canvasName, "Kitchen")
        XCTAssertEqual(h.folder.readCard(widgetId: b)?.canvasName, "Kitchen")

        // A deleted card leaves the catalog and the folder.
        _ = document.deleteWidgets([b])
        h.timers.advance(byMs: HomeWidgetSync.debounceMs)
        XCTAssertNil(h.folder.readCard(widgetId: b))
        XCTAssertFalse(FileManager.default.fileExists(atPath: h.folder.cardURL(widgetId: b).path))
        XCTAssertNil(h.folder.readCatalog()?.entry(widgetId: b))

        // Going to the background writes a pending edit at once.
        document.renameWidget(a, title: "Shopping")
        h.coordinator.noteScenePhase(.background)
        XCTAssertEqual(h.folder.readCard(widgetId: a)?.title, "Shopping")
    }

    func testARelaunchAdoptsTheFolderAndSweepsCardsDeletedWhileClosed() throws {
        let folderURL = directory.appendingPathComponent("group/home-widgets", isDirectory: true)
        let folder = HomeWidgetFolder(url: folderURL)
        // A card file an earlier launch left for a card that no longer exists.
        try folder.write(Data("{}".utf8), to: folder.cardURL(widgetId: "ghost"))
        let document = BoardDocument(board: AppCoordinator.emptyBoard(mint: .counting(prefix: "b-"), clock: .fixed(ms: 1)))
        let kept = try XCTUnwrap(document.createWidget(type: "text", at: .zero, title: "Kept"))
        let reloader = RecordingWidgetReloader()
        let sync = HomeWidgetSync(document: document, folder: folder, reloader: reloader, timers: ManualTimerSource(), clock: .fixed(ms: 1))
        sync.start()
        XCTAssertFalse(FileManager.default.fileExists(atPath: folder.cardURL(widgetId: "ghost").path))
        XCTAssertEqual(folder.readCard(widgetId: kept)?.title, "Kept")

        // A second launch over the same folder and board writes nothing.
        let again = HomeWidgetSync(document: document, folder: folder, reloader: reloader, timers: ManualTimerSource(), clock: .fixed(ms: 1))
        let reloads = reloader.reloads.count
        again.start()
        XCTAssertEqual(again.fileWrites, 0)
        XCTAssertEqual(reloader.reloads.count, reloads)
    }

    func testTappingTheWidgetOpensItsCanvasWithTheCardSelected() throws {
        let h = harness()
        h.coordinator.start()
        defer { h.coordinator.dispose() }
        _ = h.coordinator.makeSession()
        let document = h.coordinator.document
        let home = document.activeCanvasId
        let card = try XCTUnwrap(document.createWidget(type: "text", at: .zero, title: "Plan"))
        XCTAssertTrue(h.coordinator.handle(url: HomeWidgetContract.openURL(widgetId: card)))
        XCTAssertEqual(document.activeCanvasId, home)
        XCTAssertEqual(document.selection, [card])
        XCTAssertTrue(h.coordinator.handle(url: HomeWidgetContract.openURL(widgetId: "gone")), "a stale widget's tap is still ours, answered with a toast")
    }

    // MARK: - Drawing

    /// Every grammar at every system size draws without trapping; with
    /// GROVEPAD_SNAPSHOT_DIR set, the PNGs land there for a look.
    func testEveryFaceDrawsAtEverySize() throws {
        let faces: [(String, HomeWidgetFace)] = [
            ("empty", .empty),
            ("note", .note(text: "Buy oat milk\nCall the plumber about the leak under the sink\nBook dentist", sticky: false, mono: false)),
            ("sticky", .note(text: "Remember: ship it Friday", sticky: true, mono: false)),
            ("rows", .rows(eyebrow: HomeEyebrow(label: "Tasks", note: "3/16"), rows: (1...14).map { HomeRow(label: "Task number \($0)", done: $0 <= 3) }, overflow: 2, meter: 3.0 / 16)),
            ("boolean", .boolean(label: "Porch light", active: true, shape: "switch", tone: nil)),
            ("metric", .metric(eyebrow: HomeEyebrow(label: "Water"), primary: "6", secondary: "of 8 glasses", progress: 0.75, tone: nil)),
            ("clock", .clock(eyebrow: HomeEyebrow(label: "Pomodoro"), clock: HomeClock(readout: "18:42", caption: "Focus", fraction: 0.7, tone: "work", running: false, urgent: false), chips: [HomeChip(text: "Round 2", filled: true)], rows: [HomeRow(label: "Today", value: "3 done")])),
            ("chart", .chart(stats: [HomeStat(label: "Now", value: "42"), HomeStat(label: "Change", value: "+8"), HomeStat(label: "Peak", value: "51")], series: [12, 18, 9, 30, 25, 51, 42], colors: [])),
            ("stars", .stars(value: 4)),
            ("columns", .columns(eyebrow: HomeEyebrow(label: "Board"), columns: ["To do", "Doing", "Done"].map { HomeColumn(label: $0, items: [HomeRow(label: "Card A"), HomeRow(label: "Card B")], overflow: 1) }, wrap: nil)),
            ("grid", .grid(eyebrow: HomeEyebrow(label: "September", note: "12 days"), cols: 7, cells: (1...30).map { HomeCell(text: "\($0)", fill: $0 % 3 == 0 ? 0.8 : nil, current: $0 == 19) }, header: ["M", "T", "W", "T", "F", "S", "S"], dense: true)),
            ("bars", .bars(eyebrow: HomeEyebrow(label: "Budget"), bars: [HomeBar(label: "Food", value: "$320", fraction: 0.64), HomeBar(label: "Rent", value: "$900", fraction: 1, tone: .warn), HomeBar(label: "Fun", value: "$80", fraction: 0.2)])),
            ("gauge", .gauge(eyebrow: HomeEyebrow(label: "Goal"), progress: 0.62, primary: "62%", secondary: "Read 12 books", caption: "7 of 12", tone: nil)),
            ("chips", .chips(eyebrow: HomeEyebrow(label: "Tags"), chips: ["design", "launch", "q4", "urgent", "copy", "legal"].map { HomeChip(text: $0, filled: $0 == "urgent") }, overflow: 3)),
            ("lines", .lines(eyebrow: HomeEyebrow(label: "Tape"), lines: [HomeLine(left: "12 × 4", right: "48"), HomeLine(left: "+ 7", right: "55")], mono: true, total: HomeLine(left: "Total", right: "55"))),
            ("chain", .chain(eyebrow: HomeEyebrow(label: "Pipeline"), nodes: ["Idea", "Draft", "Review", "Ship"].enumerated().map { HomeNode(label: $1, current: $0 == 2) }, shape: "linear", overflow: 0)),
            ("split", .split(eyebrow: nil, left: HomeReadout(primary: "72 kg", secondary: "Now"), right: HomeReadout(primary: "68 kg", secondary: "Goal", tone: .good), divider: "→")),
            ("canvas", .canvas(name: "Trip to Lisbon", subtitle: "Plans and bookings", cardCount: 14)),
        ]
        let sizes: [(HomeWidgetLayout, CGSize)] = [
            (.small, CGSize(width: 170, height: 170)),
            (.medium, CGSize(width: 364, height: 170)),
            (.large, CGSize(width: 364, height: 382)),
            (.extraLarge, CGSize(width: 764, height: 382)),
            (.rectangular, CGSize(width: 172, height: 76)),
        ]
        let snapshotDir = ProcessInfo.processInfo.environment["GROVEPAD_SNAPSHOT_DIR"]
        for (name, face) in faces {
            let card = HomeWidgetCard(id: name, canvasId: "c", canvasName: "Home", title: name.capitalized, kind: "Kind", skin: nil, symbol: "square.grid.2x2", accent: "#60a5fa", face: face)
            for (layout, size) in sizes {
                for scheme in [ColorScheme.dark, .light] where scheme == .dark || snapshotDir != nil {
                    let view = HomeWidgetView(content: .card(card), layout: layout, now: Date(timeIntervalSince1970: 1_789_000_000))
                        .padding(16)
                        .frame(width: size.width, height: size.height)
                        .background(HomeWidgetBackground(accent: card.accent))
                        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                        .environment(\.colorScheme, scheme)
                    let renderer = ImageRenderer(content: view)
                    renderer.scale = 2
                    #if canImport(AppKit)
                    let image = try XCTUnwrap(renderer.nsImage, "\(name) at \(layout)")
                    if let snapshotDir, let tiff = image.tiffRepresentation, let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
                        try png.write(to: URL(fileURLWithPath: snapshotDir).appendingPathComponent("home-\(name)-\(layout.rawValue)-\(scheme == .dark ? "dark" : "light").png"))
                    }
                    #endif
                }
            }
        }
        for content in [HomeWidgetContent.unconfigured, .missing(title: "Plan"), .unavailable] {
            XCTAssertNotNil(ImageRenderer(content: HomeWidgetView(content: content, layout: .small).frame(width: 170, height: 170)).cgImage)
        }
    }
}
