import XCTest
@testable import GrovepadCore

/// One baseline file per account under the store directory.
final class SyncBaselineTests: XCTestCase {
    private var directory: URL!
    private var store: SyncBaselineStore!

    override func setUpWithError() throws {
        directory = SyncFixtures.temporaryDirectory("baseline")
        store = SyncBaselineStore(storeDirectory: directory)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    private func baseline(_ userId: String = "user-1") throws -> SyncBaseline {
        let board = SyncFixtures.serialized(try SyncFixtures.board("base"))
        return SyncBaseline(userId: userId, board: board, fingerprint: CloudDocuments.fingerprintBoard(board), cloudUpdatedAt: "2026-08-21T00:00:00.000Z", at: 1_789_000_000_000)
    }

    func testWriteThenReadRoundTrips() throws {
        XCTAssertNil(store.read(userId: "user-1"))
        let written = try baseline()
        store.write(written)
        XCTAssertEqual(store.read(userId: "user-1"), written)
        XCTAssertTrue(store.fileURL(userId: "user-1").path.hasSuffix("/sync/baselines/user-1.json"))
        // The record shape the web writes: userId, board, checksums, cloudUpdatedAt, at.
        let stored = try JSONParser.parse(try Data(contentsOf: store.fileURL(userId: "user-1"))).objectValue!
        XCTAssertEqual(stored.keys, ["userId", "board", "indexChecksum", "canvasChecksums", "cloudUpdatedAt", "at"])
    }

    func testEachAccountHasItsOwnFileAndNeverReadsAnothers() throws {
        store.write(try baseline("user-1"))
        store.write(try baseline("user-2"))
        XCTAssertEqual(store.read(userId: "user-1")?.userId, "user-1")
        XCTAssertEqual(store.read(userId: "user-2")?.userId, "user-2")
        store.clear(userId: "user-1")
        XCTAssertNil(store.read(userId: "user-1"))
        XCTAssertNotNil(store.read(userId: "user-2"))
        store.clearAll()
        XCTAssertNil(store.read(userId: "user-2"))
    }

    func testAFileWrittenForAnotherAccountReadsAsNoLineage() throws {
        let other = try baseline("user-2")
        try FileManager.default.createDirectory(at: store.directory, withIntermediateDirectories: true)
        try Data(JSONWriter.stringify(.object(other.serialized())).utf8).write(to: store.fileURL(userId: "user-1"))
        XCTAssertNil(store.read(userId: "user-1"))
    }

    func testDamagedOrIncompleteFilesReadAsNoLineage() throws {
        try FileManager.default.createDirectory(at: store.directory, withIntermediateDirectories: true)
        try Data("{not json".utf8).write(to: store.fileURL(userId: "user-1"))
        XCTAssertNil(store.read(userId: "user-1"))
        try Data(#"{"userId":"user-1","indexChecksum":"x"}"#.utf8).write(to: store.fileURL(userId: "user-1"))
        XCTAssertNil(store.read(userId: "user-1"))
    }

    func testFileNamesStayInsideTheDirectory() {
        XCTAssertEqual(SyncBaselineStore.fileName("3f1c9b2e-0000-4000-8000-000000000000"), "3f1c9b2e-0000-4000-8000-000000000000")
        XCTAssertTrue(SyncBaselineStore.fileName("../escape").hasPrefix("h-"))
        XCTAssertTrue(SyncBaselineStore.fileName("").hasPrefix("h-"))
    }

    func testFingerprintMatchesTheCloudChecksums() throws {
        let board = SyncFixtures.serialized(try SyncFixtures.board("base"))
        let print = CloudDocuments.fingerprintBoard(board)
        let split = CloudDocuments.splitCloudBoard(board)
        XCTAssertEqual(print.indexChecksum, SHA256.hex(CloudDocuments.canonicalJson(.object(split.index))))
        XCTAssertEqual(print.canvasChecksums["canvas"], CloudDocumentCodec.encode(.object(split.canvases["canvas"]!)).checksum)
        XCTAssertTrue(print.matches(print))
        XCTAssertFalse(print.matches(CloudDocuments.BoardFingerprint(indexChecksum: print.indexChecksum, canvasChecksums: [:])))
    }
}
