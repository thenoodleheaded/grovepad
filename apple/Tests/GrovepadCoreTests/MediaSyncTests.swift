import XCTest
@testable import GrovepadCore

/// Best-effort media: local first, upload after, download on a miss, never a
/// throw at the caller.
final class MediaSyncTests: XCTestCase {
    private var directory: URL!
    private var local: LocalMediaStore!
    private var transport: FakeMediaTransport!
    private var timers: ManualTimerSource!
    private var widgets: [JSONObject] = []

    override func setUpWithError() throws {
        directory = SyncFixtures.temporaryDirectory("media")
        local = LocalMediaStore(storeDirectory: directory)
        transport = FakeMediaTransport()
        transport.userId = "3f1c9b2e-0000-4000-8000-000000000000"
        timers = ManualTimerSource()
        widgets = [mediaWidget(id: "w1", canvasId: "canvas", key: "media:one"), mediaWidget(id: "w2", canvasId: "other", key: "media:two")]
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    private func mediaWidget(id: String, canvasId: String, key: String) -> JSONObject {
        var widget = JSONObject()
        widget["id"] = .string(id)
        widget["type"] = .string("media")
        widget["canvasId"] = .string(canvasId)
        widget["data"] = .object(["localBlobKey": .string(key)])
        return widget
    }

    private func service() -> MediaSyncService {
        MediaSyncService(local: local, transport: transport, timers: timers, listWidgets: { [unowned self] in self.widgets })
    }

    private let picture = MediaBlob(bytes: [1, 2, 3, 4], type: "image/webp")

    func testLocalStoreRoundTripsBytesAndType() throws {
        try local.write("media:one", picture)
        XCTAssertEqual(local.read("media:one"), picture)
        XCTAssertTrue(local.contains("media:one"))
        XCTAssertEqual(local.storedFileNames(), [LocalMediaStore.fileName("media:one")])
        local.remove("media:one")
        XCTAssertNil(local.read("media:one"))
        XCTAssertEqual(LocalBoardStore(directory: directory).mediaStore.directory, local.directory)
    }

    func testStoreWritesLocallyThenUploadsUnderTheCanvasAndUploader() async throws {
        let service = service()
        try service.store("media:one", picture)
        XCTAssertEqual(local.read("media:one"), picture, "the local write lands before any upload")
        XCTAssertTrue(transport.uploads.isEmpty)
        XCTAssertEqual(service.pendingKeys, ["media:one"])
        timers.advance(byMs: MediaSyncPolicy.drainDelayMs)
        await service.drain()
        XCTAssertEqual(transport.uploads, ["canvas/3f1c9b2e-0000-4000-8000-000000000000/media:one"])
        XCTAssertEqual(transport.objects.count, 1)
        XCTAssertTrue(service.pendingKeys.isEmpty)
    }

    func testSignedOutHoldsTheQueueRatherThanDroppingIt() async throws {
        transport.userId = nil
        let service = service()
        try service.store("media:one", picture)
        await service.drain()
        XCTAssertTrue(transport.uploads.isEmpty)
        XCTAssertEqual(service.pendingKeys, ["media:one"])
        transport.userId = "3f1c9b2e-0000-4000-8000-000000000000"
        await service.drain()
        XCTAssertEqual(transport.uploads.count, 1)
    }

    func testOversizedAndAlreadyUploadedBlobsAreNotFailures() async throws {
        let service = service()
        try service.store("media:one", MediaBlob(bytes: [UInt8](repeating: 0, count: MediaSyncPolicy.uploadLimitBytes + 1), type: "video/mp4"))
        XCTAssertTrue(service.pendingKeys.isEmpty, "refused here saves a doomed upload")
        transport.objects["canvas/3f1c9b2e-0000-4000-8000-000000000000/media:one"] = picture
        try service.store("media:one", picture)
        await service.drain()
        XCTAssertTrue(service.pendingKeys.isEmpty)
    }

    func testARefusedUploadRetriesThenGivesUpToTheSweep() async throws {
        transport.refuseUploads = true
        let service = service()
        try service.store("media:one", picture)
        await service.drain()
        XCTAssertEqual(transport.uploads.count, 1)
        XCTAssertEqual(service.pendingKeys, ["media:one"])
        for _ in 1..<MediaSyncPolicy.maxAttempts {
            timers.advance(byMs: 60_000)
            await service.drain()
        }
        XCTAssertEqual(transport.uploads.count, MediaSyncPolicy.maxAttempts)
        XCTAssertTrue(service.pendingKeys.isEmpty)
        XCTAssertEqual(timers.scheduledCount, 0)
        XCTAssertEqual(local.read("media:one"), picture, "the device keeps its copy regardless")
    }

    func testAKeyNoWidgetOwnsIsNotUploaded() async throws {
        let service = service()
        try service.store("media:orphan", picture)
        await service.drain()
        XCTAssertTrue(transport.uploads.isEmpty)
    }

    func testLoadPrefersLocalThenOwnUploadThenACollaborators() async throws {
        let service = service()
        try local.write("media:one", picture)
        let first = await service.load("media:one")
        XCTAssertEqual(first, picture)
        XCTAssertTrue(transport.downloads.isEmpty)

        let theirs = MediaBlob(bytes: [9, 9], type: "image/png")
        transport.objects["other/8b7a6c5d-0000-4000-8000-000000000000/media:two"] = theirs
        transport.objects["other/not-a-uuid/media:two"] = MediaBlob(bytes: [0], type: "x")
        let second = await service.load("media:two")
        XCTAssertEqual(second, theirs)
        XCTAssertEqual(transport.downloads, [
            "other/3f1c9b2e-0000-4000-8000-000000000000/media:two",
            "other/8b7a6c5d-0000-4000-8000-000000000000/media:two",
        ])
        XCTAssertEqual(local.read("media:two"), theirs, "cached once for next time")

        let missing = await service.load("media:missing")
        XCTAssertNil(missing)
        transport.userId = nil
        local.remove("media:two")
        let signedOut = await service.load("media:two")
        XCTAssertNil(signedOut, "signed out: no cloud read")
    }

    func testReconcileUploadsOnlyWhatTheCloudIsMissing() async throws {
        try local.write("media:one", picture)
        try local.write("media:two", picture)
        transport.objects["other/3f1c9b2e-0000-4000-8000-000000000000/media:two"] = picture
        let service = service()
        await service.reconcile()
        XCTAssertEqual(service.pendingKeys, ["media:one"])
        await service.drain()
        XCTAssertEqual(transport.uploads, ["canvas/3f1c9b2e-0000-4000-8000-000000000000/media:one"])
    }

    func testReconcileSkipsACanvasWhoseListingWasRefused() async throws {
        try local.write("media:one", picture)
        transport.refuseListings = true
        let service = service()
        await service.reconcile()
        XCTAssertTrue(service.pendingKeys.isEmpty)
    }

    func testDisposeClearsTheQueueAndStartReopens() async throws {
        let service = service()
        try service.store("media:one", picture)
        service.dispose()
        XCTAssertTrue(service.pendingKeys.isEmpty)
        XCTAssertEqual(timers.scheduledCount, 0)
        try service.store("media:two", picture)
        XCTAssertTrue(service.pendingKeys.isEmpty, "disposed: local write only")
        service.start()
        try service.store("media:two", picture)
        XCTAssertEqual(service.pendingKeys, ["media:two"])
    }

    func testObjectPathAndUUIDSegment() {
        XCTAssertEqual(MediaSyncPolicy.objectPath(canvasId: "c", userId: "u", key: "k"), "c/u/k")
        XCTAssertTrue(MediaSyncPolicy.isUUIDSegment("3f1c9b2e-0000-4000-8000-000000000000"))
        XCTAssertTrue(MediaSyncPolicy.isUUIDSegment("3F1C9B2E-0000-4000-8000-000000000000"))
        XCTAssertFalse(MediaSyncPolicy.isUUIDSegment("media:one"))
        XCTAssertFalse(MediaSyncPolicy.isUUIDSegment("3f1c9b2e-0000-4000-8000-00000000000g"))
    }
}
