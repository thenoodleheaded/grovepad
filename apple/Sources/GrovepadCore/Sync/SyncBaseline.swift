import Foundation

// ---------------------------------------------------------------------------
// Port of `src/utils/syncBaseline.ts`: the last-synced copy, what makes a
// silent reconcile possible.
//
// After every successful sync this records, per account, the exact board both
// sides agreed on. The next reconcile compares this device and the cloud to
// THAT copy instead of to each other, which is the difference between knowing
// who edited what and having to ask the user.
//
// The web keeps it in its own IndexedDB database so a wiped localStorage
// cannot destroy the lineage. Here it is its own file under the store
// directory, one per account: `<store>/sync/baselines/<account>.json`.
// `fingerprintBoard` itself lives in `Persistence/CloudDocuments.swift`.
// ---------------------------------------------------------------------------

public struct SyncBaseline: Equatable {
    public var userId: String
    /// The agreed board itself — the base side of the three-way merge — as a
    /// serialized persisted board document.
    public var board: JSONObject
    /// Matches `board_indexes.checksum` for the same board, byte for byte.
    public var indexChecksum: String
    /// canvasId -> the checksum `canvas_docs.checksum` holds for that canvas.
    public var canvasChecksums: OrderedMap<String>
    public var cloudUpdatedAt: String?
    /// Milliseconds since the epoch, as `Date.now()` writes it.
    public var at: Double

    public init(userId: String, board: JSONObject, fingerprint: CloudDocuments.BoardFingerprint, cloudUpdatedAt: String?, at: Double) {
        self.userId = userId
        self.board = board
        self.indexChecksum = fingerprint.indexChecksum
        self.canvasChecksums = fingerprint.canvasChecksums
        self.cloudUpdatedAt = cloudUpdatedAt
        self.at = at
    }

    public var fingerprint: CloudDocuments.BoardFingerprint {
        CloudDocuments.BoardFingerprint(indexChecksum: indexChecksum, canvasChecksums: canvasChecksums)
    }

    // MARK: - Codec

    /// The stored record, in the web's key order.
    public func serialized() -> JSONObject {
        var object = JSONObject()
        object["userId"] = .string(userId)
        object["board"] = .object(board)
        object["indexChecksum"] = .string(indexChecksum)
        var checksums = JSONObject()
        for (canvasId, checksum) in canvasChecksums.entries { checksums[canvasId] = .string(checksum) }
        object["canvasChecksums"] = .object(checksums)
        object["cloudUpdatedAt"] = cloudUpdatedAt.map { .string($0) } ?? .null
        object["at"] = .number(at)
        return object
    }

    /// `isBaseline`: a stored value is trusted only with every required field
    /// in the right shape; anything else reads as "no lineage".
    public static func parse(_ value: JSONValue) -> SyncBaseline? {
        guard let object = value.objectValue,
              let userId = object.string("userId"), object.isString("userId"),
              let indexChecksum = object.string("indexChecksum"), object.isString("indexChecksum"),
              let checksums = object.object("canvasChecksums"),
              let board = object.object("board") else { return nil }
        var canvasChecksums = OrderedMap<String>()
        for (canvasId, checksum) in checksums.entries {
            guard let text = checksum.stringValue else { continue }
            canvasChecksums[canvasId] = text
        }
        return SyncBaseline(
            userId: userId,
            board: board,
            fingerprint: CloudDocuments.BoardFingerprint(indexChecksum: indexChecksum, canvasChecksums: canvasChecksums),
            cloudUpdatedAt: object.string("cloudUpdatedAt"),
            at: object.number("at") ?? 0
        )
    }
}

/// Reads and writes one baseline file per account. Every failure reads as
/// "no lineage" and every write is best-effort: a failure only costs the next
/// merge its baseline (it then unions, which is lossless) and must never fail
/// a sync that already succeeded.
public final class SyncBaselineStore {
    public let directory: URL

    /// - Parameter storeDirectory: the `LocalBoardStore` directory; baselines
    ///   live beside the board in `sync/baselines/`.
    public init(storeDirectory: URL) {
        directory = storeDirectory
            .appendingPathComponent("sync", isDirectory: true)
            .appendingPathComponent("baselines", isDirectory: true)
    }

    public func fileURL(userId: String) -> URL {
        directory.appendingPathComponent("\(Self.fileName(userId)).json")
    }

    /// Account ids are UUIDs, which are file-name safe; anything else is
    /// hashed so a stray separator can never escape the directory.
    public static func fileName(_ userId: String) -> String {
        let safe = userId.unicodeScalars.allSatisfy { scalar in
            ("a"..."z").contains(scalar) || ("A"..."Z").contains(scalar) || ("0"..."9").contains(scalar) || scalar == "-" || scalar == "_"
        }
        return safe && !userId.isEmpty ? userId : "h-" + SHA256.hex(userId)
    }

    /// `readSyncBaseline`: the baseline for one account, or nil when there is
    /// none to reconcile against (or it belongs to somebody else, or it cannot
    /// be read).
    public func read(userId: String) -> SyncBaseline? {
        guard let data = try? Data(contentsOf: fileURL(userId: userId)),
              let value = try? JSONParser.parse(data),
              let baseline = SyncBaseline.parse(value),
              baseline.userId == userId else { return nil }
        return baseline
    }

    /// `writeSyncBaseline`: record the agreed board. Never throws.
    public func write(_ baseline: SyncBaseline) {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try Data(JSONWriter.stringify(.object(baseline.serialized())).utf8)
                .write(to: fileURL(userId: baseline.userId), options: .atomic)
        } catch {
            // Nothing to recover: the next reconcile simply merges without lineage.
        }
    }

    /// Forget one account's lineage (sign-out teardown).
    public func clear(userId: String) {
        try? FileManager.default.removeItem(at: fileURL(userId: userId))
    }

    /// Forget every account's lineage.
    public func clearAll() {
        try? FileManager.default.removeItem(at: directory)
    }
}
