import XCTest
@testable import GrovepadCore

/// The reconcile engine against a scripted board service — the scenarios of
/// `persistenceCloudReconcile.test.ts` and `persistenceCloudStartup.test.ts`,
/// plus the phase-6 gate's own: a web edit appears here and goes back with no
/// prompt, going offline mid-edit loses nothing, a guest leaves the engine idle.
final class SyncEngineTests: XCTestCase {
    private var directory: URL!
    private var baselines: SyncBaselineStore!
    private var timers: ManualTimerSource!
    private var clockMs: Double = 1_789_000_000_000
    private var statuses: [CloudSyncStatus] = []
    private var notices: [CloudSyncNotice] = []

    override func setUpWithError() throws {
        directory = SyncFixtures.temporaryDirectory("sync-engine")
        baselines = SyncBaselineStore(storeDirectory: directory)
        timers = ManualTimerSource()
        statuses = []
        notices = []
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    private func engine(host: FakeSyncHost, service: CloudBoardService, userId: String? = "user-1", syncEnabled: Bool = true) -> CloudSyncEngine {
        let engine = CloudSyncEngine(
            host: host, service: service, baselines: baselines, timers: timers,
            clock: Clock { [unowned self] in self.clockMs }, mint: .counting(), userId: userId, syncEnabled: syncEnabled
        )
        engine.onStatusChange = { [unowned self] in self.statuses.append($0) }
        engine.onNotice = { [unowned self] in self.notices.append($0) }
        return engine
    }

    private func remember(_ board: JSONObject, userId: String = "user-1", fingerprint: CloudDocuments.BoardFingerprint? = nil) {
        baselines.write(SyncBaseline(userId: userId, board: board, fingerprint: fingerprint ?? CloudDocuments.fingerprintBoard(board), cloudUpdatedAt: nil, at: 1))
    }

    // MARK: - The cheap check

    func testTransfersNoBoardWhenNeitherSideMoved() async throws {
        let host = FakeSyncHost(board: try SyncFixtures.board("base"))
        let local = host.serialized
        remember(local)
        let service = FakeBoardService()
        service.headResult = .head(CloudHead(indexChecksum: CloudDocuments.fingerprintBoard(local).indexChecksum, canvasChecksums: CloudDocuments.fingerprintBoard(local).canvasChecksums, updatedAt: nil))

        let engine = engine(host: host, service: service)
        await engine.reconcile(force: true)

        XCTAssertEqual(service.calls, [.head])
        XCTAssertEqual(engine.status, .synced)
        XCTAssertEqual(engine.lastSyncedAt, clockMs)
    }

    func testUploadsWithoutFetchingWhenOnlyThisDeviceMoved() async throws {
        let host = FakeSyncHost(board: try SyncFixtures.board("local"))
        // The baseline is a board this device has since moved past; the cloud
        // still stands exactly where the baseline left it.
        let base = SyncFixtures.serialized(try SyncFixtures.board("base"))
        remember(base)
        let service = FakeBoardService()
        let basePrint = CloudDocuments.fingerprintBoard(base)
        service.headResult = .head(CloudHead(indexChecksum: basePrint.indexChecksum, canvasChecksums: basePrint.canvasChecksums, updatedAt: nil))

        let engine = engine(host: host, service: service)
        await engine.reconcile(force: true)

        // The case that used to raise the prompt: no board came down to compare.
        XCTAssertEqual(service.calls, [.head, .push])
        XCTAssertEqual(service.pushedBoards, [host.serialized])
        XCTAssertEqual(engine.status, .synced)
        XCTAssertEqual(baselines.read(userId: "user-1")?.board, host.serialized)
    }

    func testSeedsAnAccountThatHasNoCloudBoardYet() async throws {
        let host = FakeSyncHost(board: try SyncFixtures.board("local"))
        let service = FakeBoardService()
        service.headResult = .none

        let engine = engine(host: host, service: service)
        await engine.reconcile(force: true)

        XCTAssertEqual(service.calls, [.head, .push])
        XCTAssertNotNil(baselines.read(userId: "user-1"))
    }

    // MARK: - The full path

    func testFetchesTheBoardOnlyOnceTheCloudHasMoved() async throws {
        let host = FakeSyncHost(board: try SyncFixtures.board("base"))
        remember(host.serialized)
        let service = FakeBoardService()
        service.headResult = .head(CloudHead(indexChecksum: "somebody-else-wrote", canvasChecksums: ["canvas": "moved"], updatedAt: "2026-08-21T00:00:00.000Z"))
        let cloud = SyncFixtures.serialized(try SyncFixtures.board("cloud"))
        service.boardResult = CloudBoardResult(board: cloud, updatedAt: "2026-08-21T00:00:00.000Z", source: .documents)

        let engine = engine(host: host, service: service)
        await engine.reconcile(force: true)

        // Only the cloud moved: adopt it outright, push nothing.
        XCTAssertEqual(service.calls, [.head, .fetch])
        XCTAssertEqual(host.loadedBoards.count, 1)
        XCTAssertEqual(host.serialized, cloud)
        XCTAssertEqual(baselines.read(userId: "user-1")?.cloudUpdatedAt, "2026-08-21T00:00:00.000Z")
        XCTAssertTrue(notices.isEmpty)
    }

    func testDoesNotAdoptTheCloudBoardOverAnEditMadeWhileItWasInFlight() async throws {
        let host = FakeSyncHost(board: try SyncFixtures.board("base"))
        remember(host.serialized)
        let service = FakeBoardService()
        service.headResult = .head(CloudHead(indexChecksum: "somebody-else-wrote", canvasChecksums: ["canvas": "moved"], updatedAt: nil))
        service.boardResult = CloudBoardResult(board: SyncFixtures.serialized(try SyncFixtures.board("cloud")), updatedAt: nil, source: .documents)
        // The user types while the board is still crossing the network.
        service.duringFetch = { host.add(widgetId: "typed", text: "Buy milk") }

        let engine = engine(host: host, service: service)
        await engine.reconcile(force: true)

        XCTAssertEqual(service.calls, [.head, .fetch])
        XCTAssertTrue(host.loadedBoards.isEmpty)
        XCTAssertNotNil(host.board.widgets["typed"])
    }

    func testFallsBackToAFullFetchWhenTheCheapAnswerCannotBeTrusted() async throws {
        let host = FakeSyncHost(board: try SyncFixtures.board("local"))
        let service = FakeBoardService()
        service.headResult = .inconclusive
        service.boardResult = nil

        let engine = engine(host: host, service: service)
        await engine.reconcile(force: true)

        XCTAssertEqual(service.calls, [.head, .fetch, .push])
    }

    func testMergesWhenBothSidesMovedAndSaysSoOnce() async throws {
        let host = FakeSyncHost(board: try SyncFixtures.board("local"))
        remember(SyncFixtures.serialized(try SyncFixtures.board("base")))
        let service = FakeBoardService()
        service.headResult = .head(CloudHead(indexChecksum: "moved", canvasChecksums: ["canvas": "moved"], updatedAt: nil))
        service.boardResult = CloudBoardResult(board: SyncFixtures.serialized(try SyncFixtures.board("cloud")), updatedAt: nil, source: .documents)

        let engine = engine(host: host, service: service)
        await engine.reconcile(force: true)

        XCTAssertEqual(service.calls, [.head, .fetch, .push])
        let pack = try ConformancePack.object("reconcile/with-baseline.json")
        XCTAssertEqual(host.serialized, pack.object("merged"))
        XCTAssertEqual(service.pushedBoards.last, pack.object("merged"))
        XCTAssertEqual(notices, [.keptBoth(["a (this device)"])])
        XCTAssertEqual(engine.status, .synced)
    }

    func testRewritesALegacyRowAsSplitDocumentsOnTheWayPast() async throws {
        let host = FakeSyncHost(board: try SyncFixtures.board("base"))
        remember(host.serialized)
        let service = FakeBoardService()
        service.headResult = .inconclusive
        let cloud = SyncFixtures.serialized(try SyncFixtures.board("cloud"))
        service.boardResult = CloudBoardResult(board: cloud, updatedAt: nil, source: .legacy)

        let engine = engine(host: host, service: service)
        await engine.reconcile(force: true)

        XCTAssertEqual(service.calls, [.head, .fetch, .push])
        XCTAssertEqual(service.pushedBoards, [cloud])
    }

    // MARK: - Protection

    func testRefusesToSyncWhenTheLocalRecordCouldNotBeRead() async throws {
        let host = FakeSyncHost(board: try SyncFixtures.board("base"))
        host.localWritesBlocked = true
        let service = FakeBoardService()

        let engine = engine(host: host, service: service)
        engine.start()
        await engine.settle()

        XCTAssertTrue(service.calls.isEmpty)
        guard case .error = engine.status else { return XCTFail("expected error, got \(engine.status)") }
    }

    func testACloudBoardFromANewerBuildBlocksInsteadOfMerging() async throws {
        let host = FakeSyncHost(board: try SyncFixtures.board("base"))
        let service = FakeBoardService()
        service.headError = FuturePersistedBoardVersionError(foundVersion: 9)

        let engine = engine(host: host, service: service)
        await engine.reconcile(force: true)

        XCTAssertEqual(engine.status, .compatibilityBlock(foundVersion: 9))
        XCTAssertTrue(notices.isEmpty)
    }

    func testAnErrorIsAnnouncedOnceAndKeepsTheDeviceCopy() async throws {
        let host = FakeSyncHost(board: try SyncFixtures.board("local"))
        let service = FakeBoardService()
        service.headError = CloudTransportError.refused("sync is an Air feature")

        let engine = engine(host: host, service: service)
        await engine.reconcile(force: true)
        await engine.reconcile(force: true)

        XCTAssertEqual(engine.status, .error("sync is an Air feature"))
        XCTAssertEqual(notices, [.syncProblem])
        XCTAssertEqual(host.serialized, SyncFixtures.serialized(try SyncFixtures.board("local")))
    }

    // MARK: - The gate

    func testAGuestLeavesTheEngineIdle() async throws {
        let host = FakeSyncHost(board: try SyncFixtures.board("local"))
        let service = FakeBoardService()

        let engine = engine(host: host, service: service, userId: nil)
        engine.start()
        await engine.settle()
        host.edit(widgetId: "a", text: "still editing as a guest")
        engine.noteDocumentEdited()
        engine.noteBecameActive()
        timers.advance(byMs: 60_000)
        await engine.settle()

        XCTAssertTrue(service.calls.isEmpty)
        XCTAssertEqual(engine.status, .guest)
        XCTAssertEqual(timers.scheduledCount, 0)
        XCTAssertEqual(host.board.widgets["a"]?.record.object("data")?["text"], .string("still editing as a guest"))
    }

    func testSyncSwitchedOffMakesNoCalls() async throws {
        let host = FakeSyncHost(board: try SyncFixtures.board("local"))
        let service = FakeBoardService()
        let engine = engine(host: host, service: service, syncEnabled: false)
        engine.start()
        await engine.settle()
        engine.noteDocumentEdited()
        timers.advance(byMs: 60_000)
        await engine.settle()
        XCTAssertTrue(service.calls.isEmpty)
        XCTAssertEqual(engine.status, .off)
    }

    func testAWebEditAppearsHereAndGoesBackWithNoPrompt() async throws {
        // Both sides agree on `base`; the web then edits card a.
        let host = FakeSyncHost(board: try SyncFixtures.board("base"))
        remember(host.serialized)
        let transport = FakeCloudTransport()
        let client = CloudBoardClient(transport: transport)
        try await client.pushCloudBoard(userId: "user-1", board: host.serialized)
        var webBoard = host.serialized
        var widgets = webBoard.object("widgets")!
        var a = widgets.object("a")!
        a["data"] = .object(["text": "typed on the web"])
        widgets["a"] = .object(a)
        webBoard["widgets"] = .object(widgets)
        try await client.pushCloudBoard(userId: "user-1", board: webBoard)

        let engine = engine(host: host, service: client)
        engine.start()
        await engine.settle()

        XCTAssertEqual(host.board.widgets["a"]?.record.object("data")?["text"], .string("typed on the web"))
        XCTAssertTrue(notices.isEmpty)
        XCTAssertEqual(engine.status, .synced)

        // Now this device edits; the idle timer uploads once the edits go quiet.
        host.edit(widgetId: "b", text: "typed on the Mac")
        engine.noteDocumentEdited()
        host.edit(widgetId: "b", text: "typed on the Mac, more")
        engine.noteDocumentEdited()
        timers.advance(byMs: CloudSyncEngine.pushIdleMs - 1)
        await engine.settle()
        XCTAssertEqual(transport.log.filter { $0 == "upsertIndex" }.count, 2, "nothing uploads before the edits go quiet")
        timers.advance(byMs: 1)
        await engine.settle()

        XCTAssertEqual(transport.log.filter { $0 == "upsertIndex" }.count, 3)
        let cloud = try await client.fetchCloudBoard(userId: "user-1")
        XCTAssertEqual(cloud.map { CloudDocuments.canonicalJson(.object($0.board)) }, CloudDocuments.canonicalJson(.object(host.serialized)))
        XCTAssertEqual(cloud?.board.object("widgets")?.object("b")?.object("data")?["text"], .string("typed on the Mac, more"))
        XCTAssertEqual(cloud?.board.object("widgets")?.object("a")?.object("data")?["text"], .string("typed on the web"))
        XCTAssertTrue(notices.isEmpty, "no conflict prompt, no kept-both notice")
    }

    func testGoingOfflineMidEditAndReturningLosesNothing() async throws {
        let host = FakeSyncHost(board: try SyncFixtures.board("base"))
        let transport = FakeCloudTransport()
        let client = CloudBoardClient(transport: transport)
        let engine = engine(host: host, service: client)
        engine.start()
        await engine.settle()
        XCTAssertEqual(engine.status, .synced)
        let untouched = transport.canvases["user-1"]?["canvas"]?.checksum

        // The network drops while typing.
        transport.offline = true
        host.edit(widgetId: "a", text: "first edit offline")
        engine.noteDocumentEdited()
        timers.advance(byMs: CloudSyncEngine.pushIdleMs)
        await engine.settle()
        XCTAssertEqual(engine.status, .offline)
        XCTAssertTrue(notices.isEmpty, "offline is not an error")

        // More edits while a retry is queued, then the retry itself fails.
        host.add(widgetId: "offline-card", text: "written on the plane")
        engine.noteDocumentEdited()
        timers.advance(byMs: CloudSyncEngine.retryBaseMs + CloudSyncEngine.pushIdleMs)
        await engine.settle()
        XCTAssertEqual(engine.status, .offline)
        XCTAssertEqual(transport.canvases["user-1"]?["canvas"]?.checksum, untouched, "nothing reached the cloud yet")

        // Back online: the queued retry carries the whole board.
        transport.offline = false
        engine.noteNetworkReachable()
        await engine.settle()

        XCTAssertEqual(engine.status, .synced)
        let cloud = try await client.fetchCloudBoard(userId: "user-1")
        XCTAssertEqual(cloud.map { CloudDocuments.canonicalJson(.object($0.board)) }, CloudDocuments.canonicalJson(.object(host.serialized)))
        XCTAssertEqual(cloud?.board.object("widgets")?.object("offline-card")?.object("data")?["text"], .string("written on the plane"))
        XCTAssertEqual(cloud?.board.object("widgets")?.object("a")?.object("data")?["text"], .string("first edit offline"))
        XCTAssertTrue(notices.isEmpty)
        XCTAssertEqual(timers.scheduledCount, 0, "no retry left behind")
    }

    // MARK: - Cadence

    func testFocusIsThrottledPerAccount() async throws {
        let host = FakeSyncHost(board: try SyncFixtures.board("base"))
        remember(host.serialized)
        let service = FakeBoardService()
        let print = CloudDocuments.fingerprintBoard(host.serialized)
        service.headResult = .head(CloudHead(indexChecksum: print.indexChecksum, canvasChecksums: print.canvasChecksums, updatedAt: nil))

        let engine = engine(host: host, service: service)
        engine.start()
        await engine.settle()
        XCTAssertEqual(service.calls, [.head])

        clockMs += 60_000
        engine.noteBecameActive()
        await engine.settle()
        XCTAssertEqual(service.calls, [.head], "checked moments ago: answered from the stamp")
        XCTAssertEqual(engine.status, .synced)

        clockMs += CloudSyncEngine.checkIntervalMs
        engine.noteBecameActive()
        await engine.settle()
        XCTAssertEqual(service.calls, [.head, .head])

        // A fresh sign-in always checks.
        engine.setAccount("user-2")
        await engine.settle()
        XCTAssertEqual(service.calls, [.head, .head, .head])
    }

    func testDisablingSyncCancelsThePendingUpload() async throws {
        let host = FakeSyncHost(board: try SyncFixtures.board("base"))
        let service = FakeBoardService()
        let engine = engine(host: host, service: service)
        engine.noteDocumentEdited()
        XCTAssertEqual(timers.scheduledCount, 1)
        engine.setSyncEnabled(false)
        await engine.settle()
        XCTAssertEqual(timers.scheduledCount, 0)
        XCTAssertEqual(engine.status, .off)
        engine.setSyncEnabled(true)
        await engine.settle()
        XCTAssertEqual(service.calls, [.head, .push], "enabling the toggle syncs immediately")
    }
}
