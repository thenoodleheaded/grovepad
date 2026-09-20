import XCTest
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
@testable import GrovepadApp

/// Coordinator wiring: autosave writes, device state round trip, flush on
/// the way out, quit rules, the open-package flow.
@MainActor
final class AppCoordinatorTests: XCTestCase {

    /// These tests exercise the circuit system, which the app ships frozen
    /// (`CircuitFeature`); each switches it on for itself only.
    override func invokeTest() {
        let previous = CircuitFeature.isEnabled
        CircuitFeature.isEnabled = true
        defer { CircuitFeature.isEnabled = previous }
        super.invokeTest()
    }
    private var directory: URL!

    override func setUp() {
        super.setUp()
        directory = AppFixtures.temporaryDirectory("coordinator")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: directory)
        super.tearDown()
    }

    func testAutosaveWritesHalfASecondAfterTheLastCommit() throws {
        let timers = ManualTimerSource()
        let coordinator = AppFixtures.coordinator(directory: directory, timers: timers)
        coordinator.start()
        defer { coordinator.dispose() }
        XCTAssertFalse(FileManager.default.fileExists(atPath: coordinator.store.indexURL.path), "an untouched empty board writes nothing")

        let id = try XCTUnwrap(coordinator.document.createWidget(type: "counter", at: .zero, title: "Tally"))
        XCTAssertEqual(coordinator.localSave, .saving, "a commit is a save in flight until the debounce fires")
        timers.advance(byMs: 400)
        XCTAssertFalse(FileManager.default.fileExists(atPath: coordinator.store.indexURL.path), "nothing lands before the delay")
        coordinator.document.renameWidget(id, title: "Tally 2")
        timers.advance(byMs: 400)
        XCTAssertFalse(FileManager.default.fileExists(atPath: coordinator.store.indexURL.path), "a second edit restarts the clock")
        timers.advance(byMs: 100)
        XCTAssertTrue(FileManager.default.fileExists(atPath: coordinator.store.indexURL.path))
        XCTAssertEqual(coordinator.localSave, .saved)

        let reloaded = try XCTUnwrap(try LocalBoardStore(directory: directory).loadBoard())
        XCTAssertEqual(reloaded.widgets[id]?.title, "Tally 2")
        XCTAssertEqual(coordinator.quitDecision(), .allow)
    }

    func testBackgroundFlushesWithoutWaitingForTheDebounce() throws {
        let timers = ManualTimerSource()
        let coordinator = AppFixtures.coordinator(directory: directory, timers: timers)
        coordinator.start()
        _ = coordinator.document.createWidget(type: "text", at: .zero, title: "Note")
        XCTAssertTrue(coordinator.isSavePending)
        coordinator.noteScenePhase(.background)
        XCTAssertFalse(coordinator.isSavePending)
        XCTAssertTrue(FileManager.default.fileExists(atPath: coordinator.store.indexURL.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: coordinator.store.deviceURL.path), "device state flushes with the board")
        coordinator.dispose()
    }

    func testDeviceStateRoundTripsTheCameraPerCanvas() throws {
        let timers = ManualTimerSource()
        let first = AppFixtures.coordinator(directory: directory, timers: timers)
        first.start()
        let session = first.makeSession()
        let root = first.document.activeCanvasId
        let door = try XCTUnwrap(first.document.createWidget(type: "canvas_node", at: .zero, title: "Inner"))
        let inner = try XCTUnwrap(first.document.widget(door)?.data.string("canvasId"))

        // The host reports a size; the camera parks per canvas as it moves.
        session.camera.setViewportSize(Size(width: 1000, height: 700))
        session.noteViewportReady()
        session.camera.setView(Vector2D(x: -120, y: 40), 0.8)
        XCTAssertEqual(first.canvasViews[root], CanvasView(pan: Vector2D(x: -120, y: 40), zoom: 0.8))

        session.environment.tabs.navigate(to: inner)
        try awaitObservation()
        session.camera.setView(Vector2D(x: 300, y: 300), 1.25)
        try awaitObservation()
        XCTAssertEqual(first.canvasViews[inner], CanvasView(pan: Vector2D(x: 300, y: 300), zoom: 1.25))
        XCTAssertEqual(first.canvasViews[root]?.zoom, 0.8, "the root's park survives the move")

        first.flushAll()
        let saved = LocalBoardStore(directory: directory).loadDeviceState(for: first.document.board)
        XCTAssertEqual(saved.activeCanvasId, inner)
        XCTAssertEqual(saved.canvasViews[root], CanvasView(pan: Vector2D(x: -120, y: 40), zoom: 0.8))
        XCTAssertEqual(saved.openTabs.map(\.canvasId), [inner], "navigate replaces the active tab (web `navigate`)")
        first.dispose()

        // A fresh launch restores where it was, and the window restores the view.
        let second = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource())
        second.start()
        XCTAssertEqual(second.document.activeCanvasId, inner)
        XCTAssertEqual(second.canvasViews[root], CanvasView(pan: Vector2D(x: -120, y: 40), zoom: 0.8))
        let restored = second.makeSession()
        restored.camera.setViewportSize(Size(width: 1000, height: 700))
        restored.noteViewportReady()
        XCTAssertEqual(restored.camera.frame, CameraFrame(pan: Vector2D(x: 300, y: 300), zoom: 1.25))
        second.dispose()
    }

    func testQuitRulesWarnOnlyWhenTheStoreRefusesToWrite() throws {
        // A newer client wrote the index: this build must not overwrite it.
        let store = LocalBoardStore(directory: directory)
        try store.saveBoard(AppCoordinator.emptyBoard(mint: .counting(prefix: "seed-"), clock: .conformance))
        var index = try XCTUnwrap(try JSONParser.parse(Data(contentsOf: store.indexURL)).objectValue)
        index["boardVersion"] = .number(99)
        try Data(JSONWriter.stringify(.object(index)).utf8).write(to: store.indexURL)

        let timers = ManualTimerSource()
        let coordinator = AppFixtures.coordinator(directory: directory, timers: timers)
        coordinator.start()
        XCTAssertNotNil(coordinator.startupFailure)
        XCTAssertEqual(coordinator.localSave, .error)
        XCTAssertTrue(coordinator.document.localWritesBlocked, "the sync host reports the lock")
        _ = coordinator.document.createWidget(type: "text", at: .zero, title: "Lost?")
        timers.advance(byMs: 600)
        XCTAssertEqual(coordinator.localSave, .error, "the failed save keeps the error state")
        guard case .warn(let reason) = coordinator.quitDecision() else { return XCTFail("a blocked store warns before quit") }
        XCTAssertTrue(reason.contains("paused"), reason)
        XCTAssertTrue(QuitRules.showsUnsavedIndicator(coordinator.quitContext))
        XCTAssertEqual(try JSONParser.parse(Data(contentsOf: store.indexURL)).objectValue?["boardVersion"], .number(99), "nothing on disk moved")
        coordinator.dispose()
    }

    func testDocumentEpochMovesOnEveryCommitNotJustWidgetChanges() throws {
        let coordinator = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource())
        coordinator.start()
        let before = coordinator.document.documentEpoch
        coordinator.document.renameWorkspace(coordinator.document.activeWorkspaceId, name: "Renamed")
        XCTAssertEqual(coordinator.document.documentEpoch, before + 1, "a workspace rename bumps no version stamp but is still an edit")
        coordinator.dispose()
    }

    func testOpenPackageAsANewWorkspaceKeepsTheCurrentBoard() throws {
        // Build a package from another board: one workspace, a door into a
        // nested canvas, a wire between two cards.
        var other = AppCoordinator.emptyBoard(mint: .counting(prefix: "pkg-"), clock: .conformance)
        let otherDocument = BoardDocument(board: other, mint: .counting(prefix: "pkgw-"), clock: .conformance)
        let source = try XCTUnwrap(otherDocument.createWidget(type: "number_input", at: .zero, title: "Number"))
        let target = try XCTUnwrap(otherDocument.createWidget(type: "counter", at: Vector2D(x: 400, y: 0), title: "Tally"))
        let door = try XCTUnwrap(otherDocument.createWidget(type: "canvas_node", at: Vector2D(x: 800, y: 0), title: "Inner"))
        _ = try XCTUnwrap(otherDocument.addValueConnection(from: source, field: "value", to: target, field: "count"))
        other = otherDocument.board
        let innerCanvas = try XCTUnwrap(other.widgets[door]?.data.string("canvasId"))
        let bytes = GrovepadPackage.build(other, appVersion: "test", clock: .conformance) { _ in nil }

        let timers = ManualTimerSource()
        let coordinator = AppFixtures.coordinator(directory: directory, timers: timers)
        coordinator.start()
        let session = coordinator.makeSession()
        let mine = try XCTUnwrap(coordinator.document.createWidget(type: "text", at: .zero, title: "Mine"))
        let homeWorkspace = coordinator.document.activeWorkspaceId

        let outcome = try coordinator.importPackage(bytes: bytes, fileName: "Study plan.grovepad", mode: .newWorkspace)
        XCTAssertEqual(outcome.title, "Study plan")
        XCTAssertEqual(outcome.workspaceIds.count, 1)
        XCTAssertEqual(outcome.widgetCount, 3)
        let board = coordinator.document.board
        XCTAssertNotNil(board.widgets[mine], "the current board's cards survive")
        XCTAssertEqual(board.workspaces.count, 2)
        let imported = try XCTUnwrap(board.workspaces[outcome.workspaceIds[0]])
        XCTAssertEqual(imported.name, "Study plan")
        XCTAssertNil(board.widgets[source], "archive ids are reminted")
        XCTAssertEqual(board.widgets(on: imported.rootCanvasId).count, 3)
        XCTAssertEqual(coordinator.document.activeCanvasId, imported.rootCanvasId, "the app lands on the imported root")
        XCTAssertEqual(coordinator.document.activeWorkspaceId, outcome.workspaceIds[0])
        XCTAssertEqual(session.environment.tabs.openTabs.map(\.canvasId), [imported.rootCanvasId])
        XCTAssertNotEqual(homeWorkspace, outcome.workspaceIds[0])

        // The wire and the door point at the reminted ids.
        let wire = try XCTUnwrap(board.connections.values.first)
        XCTAssertNotNil(board.widgets[wire.fromId])
        XCTAssertNotNil(board.widgets[wire.toId])
        XCTAssertEqual(board.widgets[wire.fromId]?.type, "number_input")
        let newDoor = try XCTUnwrap(board.widgets(on: imported.rootCanvasId).first { $0.type == "canvas_node" })
        let newInner = try XCTUnwrap(newDoor.data.string("canvasId"))
        XCTAssertNotEqual(newInner, innerCanvas)
        XCTAssertEqual(board.canvases[newInner]?.workspaceId, imported.id)
        XCTAssertEqual(board.canvases[newInner]?.parentCanvasId, imported.rootCanvasId)
        XCTAssertEqual(session.environment.toasts.toasts.last?.message, "Imported “Study plan” as a workspace")

        // Replace swaps the board wholesale.
        let replaced = try coordinator.importPackage(bytes: bytes, fileName: "Study plan.grovepad", mode: .replace)
        XCTAssertEqual(replaced.workspaceIds, [])
        XCTAssertNil(coordinator.document.board.widgets[mine])
        XCTAssertEqual(coordinator.document.board.widgets.count, 3)
        XCTAssertEqual(coordinator.document.board.workspaces.count, 1)

        // And the round trip back out is the same archive family.
        let exported = try GrovepadPackage.read(coordinator.exportPackageBytes())
        XCTAssertEqual(exported.board.widgets.count, 3)
        XCTAssertTrue(coordinator.exportFileName(now: Date(timeIntervalSince1970: 1_789_000_000)).hasSuffix(".grovepad"))
        coordinator.dispose()
    }

    func testFileURLsAndAuthURLsRoute() throws {
        let coordinator = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource())
        coordinator.start()
        XCTAssertTrue(coordinator.handle(url: URL(fileURLWithPath: "/tmp/x.grovepad")))
        XCTAssertEqual(coordinator.pendingImport?.lastPathComponent, "x.grovepad")
        XCTAssertFalse(coordinator.handle(url: URL(fileURLWithPath: "/tmp/x.txt")))
        XCTAssertFalse(coordinator.handle(url: URL(string: "grovepad://auth/callback?code=1")!), "no account service: nothing to hand the callback to")
        XCTAssertFalse(coordinator.needsLogin, "a guest-only build never shows the login page")
        coordinator.dispose()
    }

    /// Observation callbacks land on the next main-queue turn.
    private func awaitObservation() throws {
        let expectation = expectation(description: "turn")
        DispatchQueue.main.async { expectation.fulfill() }
        wait(for: [expectation], timeout: 1)
    }
}
