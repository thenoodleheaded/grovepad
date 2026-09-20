import Foundation

// ---------------------------------------------------------------------------
// The undo seam the roadmap asks phase 1 to leave for the document model
// (decision 9): past and future stacks of whole-board snapshots. `Board` is a
// value type whose collections are copy-on-write, so a snapshot is a cheap
// copy until something mutates.
//
// Circuit law 3: engine wire deliveries write field values without touching
// history. Only user-initiated mutations call `push`; a value arriving over a
// wire must never create an undo step, or one keystroke on a source widget
// would bury the user's own edits under engine noise.
// ---------------------------------------------------------------------------

public struct BoardHistory: Equatable {
    public static let defaultLimit = 100

    public private(set) var past: [Board] = []
    public private(set) var future: [Board] = []
    public let limit: Int

    public init(limit: Int = BoardHistory.defaultLimit) {
        self.limit = max(1, limit)
    }

    public var canUndo: Bool { !past.isEmpty }
    public var canRedo: Bool { !future.isEmpty }

    /// Record the board as it was before a user mutation. Clears redo.
    public mutating func push(_ board: Board) {
        past.append(board)
        if past.count > limit { past.removeFirst(past.count - limit) }
        future.removeAll()
    }

    /// Step back: returns the board to restore, or nil when there is nothing to undo.
    public mutating func undo(current: Board) -> Board? {
        guard let previous = past.popLast() else { return nil }
        future.append(current)
        return previous
    }

    /// Step forward: returns the board to restore, or nil when there is nothing to redo.
    public mutating func redo(current: Board) -> Board? {
        guard let next = future.popLast() else { return nil }
        past.append(current)
        if past.count > limit { past.removeFirst(past.count - limit) }
        return next
    }

    public mutating func clear() {
        past.removeAll()
        future.removeAll()
    }
}
