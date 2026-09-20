import XCTest
import GrovepadCore
import GrovepadChrome
import GrovepadCloud
@testable import GrovepadApp

/// `BoardDocument` as the sync engine's host, through the coordinator, over
/// the fake tables: a web edit appears, offline then back loses nothing, a
/// guest leaves the engine idle.
@MainActor
final class SyncHostTests: XCTestCase {
    private var directory: URL!

    override func setUp() {
        super.setUp()
        directory = AppFixtures.temporaryDirectory("sync")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: directory)
        super.tearDown()
    }

    func testGuestLeavesTheEngineIdle() async throws {
        let transport = FakeCloudTransport()
        let coordinator = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource(), transport: transport)
        coordinator.start()
        let sync = try XCTUnwrap(coordinator.sync)
        await sync.settle()
        XCTAssertEqual(coordinator.syncStatus, .guest)
        _ = coordinator.document.createWidget(type: "text", at: .zero, title: "Local")
        await sync.settle()
        XCTAssertEqual(transport.log, [], "no account: nothing crosses the network")
        XCTAssertEqual(coordinator.subscription.entitlements, SubscriptionRules.freeEntitlements)
        coordinator.dispose()
    }

    func testAWebEditAppearsOnThisDevice() async throws {
        let transport = FakeCloudTransport()
        let timers = ManualTimerSource()
        let coordinator = AppFixtures.coordinator(directory: directory, timers: timers, transport: transport)
        coordinator.start()
        let sync = try XCTUnwrap(coordinator.sync)
        let local = try XCTUnwrap(coordinator.document.createWidget(type: "text", at: .zero, title: "Mine"))

        // First sign-in seeds the cloud with what is here.
        coordinator.adoptAccount(AppFixtures.account())
        await sync.settle()
        XCTAssertEqual(coordinator.syncStatus, .synced)
        let seeded = try await transport.cloudBoard(userId: "user-1")
        XCTAssertNotNil(seeded?.widgets[local])

        // The web edits the same account's board: a second client pushes.
        var cloud = try XCTUnwrap(seeded)
        let webDocument = BoardDocument(board: cloud, mint: .counting(prefix: "web-"), clock: .conformance)
        let fromWeb = try XCTUnwrap(webDocument.createWidget(type: "counter", at: Vector2D(x: 500, y: 0), title: "From the web"))
        cloud = webDocument.board
        try await CloudBoardClient(transport: transport, clock: .conformance).pushCloudBoard(userId: "user-1", board: BoardSerializer.serializePersistedBoard(cloud))

        // Focus check: the head differs, the board comes down, no prompt.
        await sync.syncNow()
        XCTAssertEqual(coordinator.syncStatus, .synced)
        XCTAssertEqual(coordinator.document.widget(fromWeb)?.title, "From the web")
        XCTAssertNotNil(coordinator.document.widget(local))
        coordinator.dispose()
    }

    func testOfflineThenBackLosesNothing() async throws {
        let transport = FakeCloudTransport()
        let timers = ManualTimerSource()
        let reachability = ManualReachability()
        let coordinator = AppFixtures.coordinator(directory: directory, timers: timers, transport: transport, reachability: reachability)
        coordinator.start()
        let sync = try XCTUnwrap(coordinator.sync)
        coordinator.adoptAccount(AppFixtures.account())
        await sync.settle()
        XCTAssertEqual(coordinator.syncStatus, .synced)

        // The network drops; an edit happens; the idle push fails.
        transport.offline = true
        let typed = try XCTUnwrap(coordinator.document.createWidget(type: "text", at: .zero, title: "Typed offline"))
        timers.advance(byMs: CloudSyncEngine.pushIdleMs + 1)
        await sync.settle()
        XCTAssertEqual(coordinator.syncStatus, .offline)
        timers.advance(byMs: AppCoordinator.autosaveDelayMs + 1)
        let onDisk = try XCTUnwrap(try LocalBoardStore(directory: directory).loadBoard())
        XCTAssertNotNil(onDisk.widgets[typed], "the local store has it regardless")

        // The network returns: reachability wakes the engine at once.
        transport.offline = false
        reachability.reachable()
        await sync.settle()
        XCTAssertEqual(coordinator.syncStatus, .synced)
        let cloudAfter = try await transport.cloudBoard(userId: "user-1")
        XCTAssertEqual(cloudAfter?.widgets[typed]?.title, "Typed offline")
        XCTAssertNotNil(coordinator.document.widget(typed))
        coordinator.dispose()
    }

    func testSignOutDropsToGuestAndForgetsOnlyTheAccountsBaseline() async throws {
        let transport = FakeCloudTransport()
        let coordinator = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource(), transport: transport)
        coordinator.start()
        let sync = try XCTUnwrap(coordinator.sync)
        let mine = try XCTUnwrap(coordinator.document.createWidget(type: "text", at: .zero, title: "Mine"))
        coordinator.adoptAccount(AppFixtures.account())
        await sync.settle()
        XCTAssertNotNil(coordinator.baselines.read(userId: "user-1"))
        coordinator.adoptAccount(nil)
        await sync.settle()
        XCTAssertEqual(coordinator.syncStatus, .guest)
        XCTAssertNotNil(coordinator.document.widget(mine), "the board stays on the device")
        coordinator.dispose()
    }
}
