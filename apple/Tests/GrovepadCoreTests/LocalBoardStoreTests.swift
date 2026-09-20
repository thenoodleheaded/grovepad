import XCTest
@testable import GrovepadCore

/// The on-disk store against a temporary directory: split layout, atomic
/// round trip, tolerance of an interrupted multi-document write, the
/// snapshot cap, device state kept apart from document state, checksum-
/// diffed writes, and the future-version write lock.
final class LocalBoardStoreTests: XCTestCase {
    private var directory: URL!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("grovepad-store-\(UUID().uuidString)", isDirectory: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    private func fixtureBoard(_ name: String = "edges") throws -> Board {
        let parsed = try JSONParser.parse(try ConformancePack.text("boards/\(name).json"))
        return try XCTUnwrap(BoardParser.parsePersistedBoard(parsed), "boards/\(name)")
    }

    private func text(_ url: URL) throws -> String {
        try String(contentsOf: url, encoding: .utf8)
    }

    func testEmptyDirectoryLoadsNothing() throws {
        let store = LocalBoardStore(directory: directory, clock: .conformance)
        XCTAssertNil(try store.loadBoard())
        XCTAssertFalse(store.writesLocked)
    }

    func testSaveThenLoadRoundTripsByteForByte() throws {
        let store = LocalBoardStore(directory: directory, clock: .conformance)
        let board = try fixtureBoard()
        let report = try store.saveBoard(board)
        XCTAssertTrue(report.wroteIndex)
        XCTAssertEqual(report.wroteCanvases, ["canvas", "second"])
        XCTAssertEqual(store.storedCanvasIds(), ["canvas", "second"])

        // The files are the split documents, pretty-printed the way the package writes them.
        let split = CloudDocuments.splitCloudBoard(BoardSerializer.serializePersistedBoard(board))
        assertSameText(try text(store.indexURL), JSONWriter.stringify(.object(split.index), indent: 2), "index.json")
        assertSameText(try text(store.canvasURL("second")), JSONWriter.stringify(.object(split.canvases["second"]!), indent: 2), "canvases/second.json")

        // A split and join regroups widgets by canvas, exactly as the web's
        // `joinCloudBoard` does for cloud and package documents; the store
        // round-trips that joined form byte for byte.
        let joined = try XCTUnwrap(BoardParser.parsePersistedBoard(.object(CloudDocuments.joinCloudBoard(index: split.index, canvases: split.canvases.values))))
        let fresh = LocalBoardStore(directory: directory, clock: .conformance)
        let loaded = try XCTUnwrap(try fresh.loadBoard())
        assertSameText(BoardSerializer.serializedText(loaded), BoardSerializer.serializedText(joined), "round trip")
        XCTAssertEqual(loaded.widgets.keys.sorted(), board.widgets.keys.sorted(), "every widget survives")
        XCTAssertEqual(loaded.canvases.keys, board.canvases.keys)
        XCTAssertEqual(loaded.relations.keys.sorted(), board.relations.keys.sorted())
        XCTAssertEqual(loaded.connections.keys.sorted(), board.connections.keys.sorted())
        // Saving the joined form again changes nothing on disk.
        let settled = try fresh.saveBoard(loaded)
        XCTAssertFalse(settled.wroteIndex)
        XCTAssertEqual(settled.wroteCanvases, [])
    }

    func testLoaderToleratesAMissingCanvasFileAndAnOrphan() throws {
        let store = LocalBoardStore(directory: directory, clock: .conformance)
        let board = try fixtureBoard()
        try store.saveBoard(board)

        // Interrupted write: the index lists `second` but its file is gone.
        try FileManager.default.removeItem(at: store.canvasURL("second"))
        // And a canvas file survives for a canvas the index no longer names.
        var orphan = CloudDocuments.splitCloudBoard(BoardSerializer.serializePersistedBoard(board)).canvases["canvas"]!
        orphan["canvasId"] = .string("ghost")
        try Data(JSONWriter.stringify(.object(orphan)).utf8).write(to: store.canvasURL("ghost"))

        let fresh = LocalBoardStore(directory: directory, clock: .conformance)
        let loaded = try XCTUnwrap(try fresh.loadBoard())
        XCTAssertEqual(loaded.canvases.keys, board.canvases.keys, "the canvas tree comes from the index")
        XCTAssertEqual(loaded.widgets(on: "second"), [], "widgets of the missing document are gone")
        XCTAssertEqual(loaded.widgets(on: "canvas").map(\.id), board.widgets(on: "canvas").map(\.id))
        XCTAssertFalse(loaded.widgets.contains("ghost"))

        // The next save rewrites the missing canvas and removes the orphan.
        let report = try fresh.saveBoard(loaded)
        XCTAssertEqual(report.wroteCanvases, ["second"])
        XCTAssertEqual(report.skippedCanvases, ["canvas"])
        XCTAssertEqual(report.removedCanvases, ["ghost"])
        XCTAssertEqual(fresh.storedCanvasIds(), ["canvas", "second"])
    }

    func testUnchangedDocumentsAreNotRewritten() throws {
        let store = LocalBoardStore(directory: directory, clock: .conformance)
        var board = try fixtureBoard()
        try store.saveBoard(board)

        let unchanged = try store.saveBoard(board)
        XCTAssertFalse(unchanged.wroteIndex)
        XCTAssertEqual(unchanged.wroteCanvases, [])
        XCTAssertEqual(unchanged.skippedCanvases, ["canvas", "second"])

        // Moving a widget on `second` touches that document only.
        let id = try XCTUnwrap(board.widgets(on: "second").first?.id)
        board.widgets[id]!.position = Vector2D(x: 1234, y: 5678)
        let moved = try store.saveBoard(board)
        XCTAssertFalse(moved.wroteIndex)
        XCTAssertEqual(moved.wroteCanvases, ["second"])
        XCTAssertEqual(moved.skippedCanvases, ["canvas"])

        // A fresh store learns the checksums from disk and still skips.
        let fresh = LocalBoardStore(directory: directory, clock: .conformance)
        _ = try fresh.loadBoard()
        let again = try fresh.saveBoard(board)
        XCTAssertFalse(again.wroteIndex)
        XCTAssertEqual(again.wroteCanvases, [])
    }

    func testDeviceStateLivesInItsOwnFile() throws {
        let store = LocalBoardStore(directory: directory, clock: .conformance)
        let board = try fixtureBoard()
        try store.saveBoard(board)
        let state = DeviceState(
            activeWorkspaceId: "workspace", activeCanvasId: "second",
            canvasViews: ["second": CanvasView(pan: Vector2D(x: 3, y: 4), zoom: 0.5)],
            openTabs: [CanvasTab(id: "t1", canvasId: "second")], activeTabId: "t1"
        )
        try store.saveDeviceState(state)
        assertSameText(try text(store.deviceURL), DeviceStateCodec.serializedText(state), "device.json")
        XCTAssertEqual(store.loadDeviceState(for: board, mint: .counting()), state)

        // No document file carries navigation.
        for url in [store.indexURL, store.canvasURL("canvas"), store.canvasURL("second")] {
            let keys = try XCTUnwrap(try JSONParser.parse(try text(url)).objectValue).keys
            XCTAssertFalse(keys.contains("activeCanvasId"), url.lastPathComponent)
            XCTAssertFalse(keys.contains("canvasViews"), url.lastPathComponent)
            XCTAssertFalse(keys.contains("openTabs"), url.lastPathComponent)
        }

        // Without a device file the resolver falls back to the board's own navigation.
        try FileManager.default.removeItem(at: store.deviceURL)
        let resolved = store.loadDeviceState(for: board, legacyFallback: DeviceStateCodec.legacyFallback(from: board), mint: .counting())
        XCTAssertEqual(resolved.activeCanvasId, board.activeCanvasId)
        XCTAssertEqual(resolved.openTabs, [CanvasTab(id: "uuid-0001", canvasId: board.activeCanvasId)])
    }

    func testRollingSnapshotsKeepTheNewestTwenty() throws {
        var now = 1_789_000_000_000.0
        let store = LocalBoardStore(directory: directory, clock: Clock { now })
        let board = try fixtureBoard()
        for _ in 0..<25 {
            now += 1000
            try store.saveSnapshot(board)
        }
        let snapshots = store.listSnapshots()
        XCTAssertEqual(snapshots.count, LocalBoardStore.snapshotLimit)
        XCTAssertEqual(snapshots.first?.id, "1789000025000")
        XCTAssertEqual(snapshots.last?.id, "1789000006000")
        XCTAssertEqual(snapshots.map(\.createdAt), snapshots.map(\.createdAt).sorted(by: >))
        let restored = try XCTUnwrap(store.loadSnapshot(snapshots[0]))
        assertSameText(BoardSerializer.serializedText(restored), BoardSerializer.serializedText(board), "snapshot board")

        now += 1000
        let labelled = try store.saveSnapshot(board, label: "before import")
        XCTAssertEqual(store.listSnapshots().first?.label, "before import")
        XCTAssertEqual(labelled.kind, "board")
    }

    func testMigrationSourceIsPreservedBeforeTheBoardIsCommitted() throws {
        let store = LocalBoardStore(directory: directory, clock: .conformance)
        let legacy = try JSONParser.parse(try ConformancePack.text("boards/legacy-v1.json"))
        let migrated = try XCTUnwrap(BoardParser.migrateLegacyBoard(legacy, mint: .counting(), clock: .conformance))
        let report = try store.saveMigrationSource(legacy, sourceVersion: 1, board: migrated)
        XCTAssertTrue(report.wroteIndex)

        let files = try FileManager.default.contentsOfDirectory(atPath: store.snapshotsDirectory.path)
        let name = try XCTUnwrap(files.first)
        XCTAssertTrue(name.hasPrefix("migration-v1-v2-"), name)
        let snapshot = try XCTUnwrap(try JSONParser.parse(try text(store.snapshotsDirectory.appendingPathComponent(name))).objectValue)
        XCTAssertEqual(snapshot.string("kind"), "migration-source")
        XCTAssertEqual(snapshot["payload"], legacy, "the source is stored untouched")
        XCTAssertEqual(store.listSnapshots(), [], "migration sources are not rolling snapshots")

        let loaded = try XCTUnwrap(try store.loadBoard())
        assertSameText(BoardSerializer.serializedText(loaded), BoardSerializer.serializedText(migrated), "migrated board")
    }

    func testStablePayloadHashMatchesTheWeb() throws {
        // Pinned from the web's stablePayloadHash (FNV-1a over UTF-16, base 36).
        XCTAssertEqual(LocalBoardStore.stablePayloadHash(try JSONParser.parse(#"{"a":1}"#)), "12qlvkh")
        XCTAssertEqual(LocalBoardStore.stablePayloadHash(try JSONParser.parse(#""x😀""#)), "15ztba0")
        XCTAssertEqual(LocalBoardStore.stablePayloadHash(try JSONParser.parse(#"{"widgets":{}}"#)), "1rcwm3k")
    }

    func testFutureVersionLocksEveryWrite() throws {
        let store = LocalBoardStore(directory: directory, clock: .conformance)
        let board = try fixtureBoard()
        try store.saveBoard(board)
        // A newer client rewrites the index with a board version this build does not know.
        var index = try XCTUnwrap(try JSONParser.parse(try text(store.indexURL)).objectValue)
        index["boardVersion"] = .number(3)
        try Data(JSONWriter.stringify(.object(index)).utf8).write(to: store.indexURL)

        let fresh = LocalBoardStore(directory: directory, clock: .conformance)
        XCTAssertThrowsError(try fresh.loadBoard()) { error in
            XCTAssertEqual(error as? FuturePersistedBoardVersionError, FuturePersistedBoardVersionError(foundVersion: 3))
        }
        XCTAssertTrue(fresh.writesLocked)
        XCTAssertEqual(fresh.futureVersion, 3)
        XCTAssertThrowsError(try fresh.saveBoard(board)) { error in
            XCTAssertEqual(error as? LocalBoardStore.StoreError, .writesLocked(foundVersion: 3))
        }
        XCTAssertThrowsError(try fresh.saveDeviceState(DeviceState(activeWorkspaceId: "", activeCanvasId: "", canvasViews: [:], openTabs: [], activeTabId: "")))
        XCTAssertThrowsError(try fresh.saveSnapshot(board))
        XCTAssertThrowsError(try fresh.saveMigrationSource(.null, sourceVersion: 1, board: board))
        // Nothing on disk moved.
        XCTAssertEqual(try JSONParser.parse(try text(fresh.indexURL)).objectValue?["boardVersion"], .number(3))
        XCTAssertFalse(FileManager.default.fileExists(atPath: fresh.deviceURL.path))
    }

    func testUnreadableIndexLocksWrites() throws {
        let store = LocalBoardStore(directory: directory, clock: .conformance)
        try store.saveBoard(try fixtureBoard())
        try Data("{ not json".utf8).write(to: store.indexURL)
        let fresh = LocalBoardStore(directory: directory, clock: .conformance)
        XCTAssertThrowsError(try fresh.loadBoard()) { error in
            XCTAssertEqual(error as? LocalBoardStore.StoreError, .unreadableIndex)
        }
        XCTAssertTrue(fresh.writesLocked)
    }
}
