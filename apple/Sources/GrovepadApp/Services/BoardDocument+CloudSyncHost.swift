import Foundation
import GrovepadCore
import GrovepadChrome

// ---------------------------------------------------------------------------
// `BoardDocument` as the sync engine's host. The document already has the
// two members the protocol shares with it (`board`, `loadBoard`); the other
// two are state the document does not carry — an edit counter that moves on
// EVERY commit (the version stamps only move when widgets or wires change,
// and a workspace rename must still invalidate an in-flight reconcile), and
// the store's write lock (storage law 3). An extension cannot store either,
// so they live in a per-document record the coordinator attaches
// (`SyncHostRegistry.attach`) and bumps from its document subscription. A
// document nobody attached reports epoch 0 and unblocked writes.
// ---------------------------------------------------------------------------

public final class DocumentSyncState {
    /// Bumped by the coordinator on every document commit and load.
    public var epoch = 0
    /// Reads the store's `writesLocked` (a future-version or unreadable index).
    public var writesBlocked: () -> Bool

    public init(writesBlocked: @escaping () -> Bool = { false }) {
        self.writesBlocked = writesBlocked
    }
}

public enum SyncHostRegistry {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var states: [ObjectIdentifier: DocumentSyncState] = [:]

    /// Attach (or replace) the record for a document. The coordinator owns
    /// the document for the process lifetime, so the identifier never
    /// outlives its record.
    @discardableResult
    public static func attach(_ document: BoardDocument, writesBlocked: @escaping () -> Bool) -> DocumentSyncState {
        let state = DocumentSyncState(writesBlocked: writesBlocked)
        lock.lock()
        states[ObjectIdentifier(document)] = state
        lock.unlock()
        return state
    }

    public static func detach(_ document: BoardDocument) {
        lock.lock()
        states[ObjectIdentifier(document)] = nil
        lock.unlock()
    }

    public static func state(for document: BoardDocument) -> DocumentSyncState? {
        lock.lock()
        defer { lock.unlock() }
        return states[ObjectIdentifier(document)]
    }
}

extension BoardDocument: CloudSyncHost {
    public var documentEpoch: Int { SyncHostRegistry.state(for: self)?.epoch ?? 0 }
    public var localWritesBlocked: Bool { SyncHostRegistry.state(for: self)?.writesBlocked() ?? false }
}
