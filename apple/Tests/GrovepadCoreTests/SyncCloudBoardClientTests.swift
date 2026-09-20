import XCTest
@testable import GrovepadCore

/// `CloudBoardClient` over the in-memory tables: the checksum-diffed push
/// (`cloudSync.test.ts` planning cases), the cheap head read, legacy
/// precedence and the schema-missing fallback.
final class SyncCloudBoardClientTests: XCTestCase {
    private func client(_ transport: FakeCloudTransport = FakeCloudTransport()) -> (CloudBoardClient, FakeCloudTransport) {
        (CloudBoardClient(transport: transport), transport)
    }

    func testPlanUploadsOnlyChangedCanvasesAndRemovesRowsAbsentFromTheIndex() {
        let plan = CloudDocumentChangePlan.plan(
            localIndexChecksum: "same-index",
            localCanvasChecksums: ["a": "same-a", "b": "new-b", "c": "new-c"],
            remoteIndexChecksum: "same-index",
            remoteCanvasChecksums: ["a": "same-a", "b": "old-b", "deleted": "old-deleted"]
        )
        XCTAssertEqual(plan, CloudDocumentChangePlan(changedCanvasIds: ["b", "c"], deletedCanvasIds: ["deleted"], hasChanges: true))
    }

    func testPlanDoesNoCloudWriteWhenAllChecksumsMatch() {
        let plan = CloudDocumentChangePlan.plan(localIndexChecksum: "index", localCanvasChecksums: ["a": "canvas"], remoteIndexChecksum: "index", remoteCanvasChecksums: ["a": "canvas"])
        XCTAssertEqual(plan, CloudDocumentChangePlan(changedCanvasIds: [], deletedCanvasIds: [], hasChanges: false))
    }

    func testRecognizesThePostgresCodesUsedForMigrationFallback() {
        XCTAssertTrue(CloudTransportError.isMissingSchemaCode("42P01"))
        XCTAssertTrue(CloudTransportError.isMissingSchemaCode("PGRST205"))
        XCTAssertTrue(CloudTransportError.isMissingSchemaCode("PGRST204"))
        XCTAssertFalse(CloudTransportError.isMissingSchemaCode("42501"))
        XCTAssertFalse(CloudTransportError.isMissingSchemaCode(nil))
    }

    func testPushWritesCanvasesFirstAndTheIndexLastThenResendsOnlyWhatChanged() async throws {
        let (client, transport) = client()
        let board = SyncFixtures.serialized(try SyncFixtures.board("base"))
        let first = try await client.pushCloudBoard(userId: "u", board: board)
        XCTAssertEqual(first, CloudPushResult(mode: .documents, changedCanvases: 1, deletedCanvases: 0))
        XCTAssertEqual(transport.log, ["index:meta", "canvases:meta", "upsertCanvases:canvas", "upsertIndex"])
        XCTAssertEqual(transport.indexes["u"]?.checksum, CloudDocuments.fingerprintBoard(board).indexChecksum)
        XCTAssertEqual(transport.canvases["u"]?["canvas"]?.checksum, CloudDocuments.fingerprintBoard(board).canvasChecksums["canvas"])
        XCTAssertEqual(transport.canvases["u"]?["canvas"]?.meta["encoding"], .string("gzip"))
        XCTAssertEqual(transport.canvases["u"]?["canvas"]?.meta["widgetCount"], .number(3))
        XCTAssertEqual(transport.revisions["u"]?.map(\.rev), [1, 1])

        transport.log = []
        let again = try await client.pushCloudBoard(userId: "u", board: board)
        XCTAssertEqual(again, CloudPushResult(mode: .documents, changedCanvases: 0, deletedCanvases: 0))
        XCTAssertEqual(transport.log, ["index:meta", "canvases:meta"], "no write when every checksum matches")

        // A second canvas appears and the first is untouched: only the new one goes up.
        var grown = board
        var canvases = grown.object("canvases")!
        canvases["second"] = .object(["id": "second", "name": "Second", "workspaceId": "workspace", "parentCanvasId": .null])
        grown["canvases"] = .object(canvases)
        transport.log = []
        let third = try await client.pushCloudBoard(userId: "u", board: grown)
        XCTAssertEqual(third.changedCanvases, 1)
        XCTAssertEqual(transport.log, ["index:meta", "canvases:meta", "upsertCanvases:second", "upsertIndex"])
        XCTAssertEqual(transport.indexes["u"]?.rev, 2)

        // Removing it again deletes the row after the changed canvases and before the index.
        transport.log = []
        let fourth = try await client.pushCloudBoard(userId: "u", board: board)
        XCTAssertEqual(fourth.deletedCanvases, 1)
        XCTAssertEqual(transport.log, ["index:meta", "canvases:meta", "deleteCanvases:second", "upsertIndex"])
    }

    func testPushFallsBackToTheLegacyRowWhenTheSchemaIsMissing() async throws {
        let (client, transport) = client()
        transport.schemaMissing = true
        let board = SyncFixtures.serialized(try SyncFixtures.board("base"))
        let result = try await client.pushCloudBoard(userId: "u", board: board)
        XCTAssertEqual(result.mode, .legacyFallback)
        XCTAssertEqual(transport.legacy["u"]?.data, board)
    }

    func testHeadIsNoneInconclusiveOrTheStoredChecksums() async throws {
        let (client, transport) = client()
        var head = try await client.fetchCloudHead(userId: "u")
        XCTAssertEqual(head, CloudHeadResult.none)

        let board = SyncFixtures.serialized(try SyncFixtures.board("base"))
        try await client.pushCloudBoard(userId: "u", board: board)
        head = try await client.fetchCloudHead(userId: "u")
        let print = CloudDocuments.fingerprintBoard(board)
        guard case .head(let stored) = head else { return XCTFail("expected a head") }
        XCTAssertTrue(stored.fingerprint.matches(print))
        XCTAssertEqual(stored.updatedAt, transport.indexes["u"]?.updatedAt)

        // A legacy row stamped after the index: a stale client wrote past us.
        transport.writeLegacy(userId: "u", board: board)
        head = try await client.fetchCloudHead(userId: "u")
        XCTAssertEqual(head, .inconclusive)

        // No split generation but a legacy row: only the full fetch can read it.
        transport.indexes = [:]
        transport.canvases = [:]
        head = try await client.fetchCloudHead(userId: "u")
        XCTAssertEqual(head, .inconclusive)

        // The documents schema itself missing.
        transport.schemaMissing = true
        head = try await client.fetchCloudHead(userId: "u")
        XCTAssertEqual(head, .inconclusive)
    }

    func testHeadToleratesAMissingLegacyTable() async throws {
        let (client, transport) = client()
        transport.legacyTableMissing = true
        // No index and no legacy table: the web answers 'inconclusive' (only
        // the full fetch can tell); with an index the head is trusted.
        let empty = try await client.fetchCloudHead(userId: "u")
        XCTAssertEqual(empty, .inconclusive)
        let board = SyncFixtures.serialized(try SyncFixtures.board("base"))
        try await client.pushCloudBoard(userId: "u", board: board)
        guard case .head = try await client.fetchCloudHead(userId: "u") else { return XCTFail("expected a head") }
    }

    func testFetchRoundTripsThroughGzipAndParsesTheBoard() async throws {
        let (client, _) = client()
        let board = SyncFixtures.serialized(try SyncFixtures.board("cloud"))
        try await client.pushCloudBoard(userId: "u", board: board)
        let fetched = try await client.fetchCloudBoard(userId: "u")
        XCTAssertEqual(fetched?.source, .documents)
        // Canonical JSON crosses the wire, so keys come back sorted (the web
        // behaves the same); the document is the same board.
        XCTAssertEqual(fetched.map { CloudDocuments.canonicalJson(.object($0.board)) }, CloudDocuments.canonicalJson(.object(board)))
        XCTAssertEqual(fetched?.board.object("widgets")?.keys, ["a", "b", "c", "e"])
        XCTAssertNotNil(fetched?.updatedAt)
    }

    func testFetchPrefersANewerLegacyRowAndRecoversFromAnIncompleteGeneration() async throws {
        let (client, transport) = client()
        let board = SyncFixtures.serialized(try SyncFixtures.board("base"))
        let older = SyncFixtures.serialized(try SyncFixtures.board("cloud"))
        try await client.pushCloudBoard(userId: "u", board: board)
        transport.writeLegacy(userId: "u", board: older)
        var fetched = try await client.fetchCloudBoard(userId: "u")
        XCTAssertEqual(fetched?.source, .legacy)
        XCTAssertEqual(fetched?.board, older)

        // Index newer again, but a canvas row is missing: the legacy row is the receipt.
        try await client.pushCloudBoard(userId: "u", board: older)
        try await client.pushCloudBoard(userId: "u", board: board)
        transport.canvases["u"] = [:]
        fetched = try await client.fetchCloudBoard(userId: "u")
        XCTAssertEqual(fetched?.source, .legacy)

        // …and with no receipt, an incomplete generation is an error, not a blank board.
        transport.legacy = [:]
        do {
            _ = try await client.fetchCloudBoard(userId: "u")
            XCTFail("expected a throw")
        } catch let error as CloudBoardError {
            XCTAssertTrue(error.description.contains("incomplete"))
        }
    }

    func testFetchRefusesADamagedIndexOrCanvas() async throws {
        let (client, transport) = client()
        let board = SyncFixtures.serialized(try SyncFixtures.board("base"))
        try await client.pushCloudBoard(userId: "u", board: board)
        transport.canvases["u"]?["canvas"]?.checksum = String(repeating: "0", count: 64)
        do {
            _ = try await client.fetchCloudBoard(userId: "u")
            XCTFail("expected a throw")
        } catch is CloudDocumentCodecError {
        }
        transport.canvases["u"]?["canvas"]?.checksum = CloudDocuments.fingerprintBoard(board).canvasChecksums["canvas"]!
        transport.indexes["u"]?.checksum = String(repeating: "0", count: 64)
        do {
            _ = try await client.fetchCloudBoard(userId: "u")
            XCTFail("expected a throw")
        } catch let error as CloudBoardError {
            XCTAssertTrue(error.description.contains("checksum"))
        }
    }

    func testFetchBlocksOnAFutureBoardVersion() async throws {
        let (client, transport) = client()
        let board = SyncFixtures.serialized(try SyncFixtures.board("base"))
        try await client.pushCloudBoard(userId: "u", board: board)
        var document = transport.indexes["u"]!.document
        document["boardVersion"] = .number(3)
        transport.indexes["u"]?.document = document
        transport.indexes["u"]?.checksum = CloudDocuments.sha256Hex(CloudDocuments.canonicalJson(.object(document)))
        do {
            _ = try await client.fetchCloudBoard(userId: "u")
            XCTFail("expected a throw")
        } catch let error as FuturePersistedBoardVersionError {
            XCTAssertEqual(error.foundVersion, 3)
        }
    }

    func testTimestampsParseTheFormsPostgrestEmits() {
        XCTAssertNotNil(CloudBoardClient.parseTime("2026-08-21T00:00:00.000Z"))
        XCTAssertNotNil(CloudBoardClient.parseTime("2026-08-21T00:00:00+00:00"))
        XCTAssertNotNil(CloudBoardClient.parseTime("2026-08-21T00:00:00.123456+00:00"))
        XCTAssertNil(CloudBoardClient.parseTime("not a date"))
        XCTAssertTrue(CloudBoardClient.isLater("2026-08-21T00:00:01Z", "2026-08-21T00:00:00Z"))
        XCTAssertFalse(CloudBoardClient.isLater(nil, "2026-08-21T00:00:00Z"))
        XCTAssertTrue(CloudBoardClient.isLater("2026-08-21T00:00:00Z", nil))
    }
}
