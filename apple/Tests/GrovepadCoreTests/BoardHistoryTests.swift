import XCTest
@testable import GrovepadCore

/// The undo seam: push/undo/redo over whole-board snapshots with a cap.
final class BoardHistoryTests: XCTestCase {
    private func board(_ title: String) -> Board {
        var board = Board()
        board.workspaces["w"] = Workspace(id: "w", name: "W", rootCanvasId: "c", createdAt: 1)
        board.canvases["c"] = CanvasMeta(id: "c", name: "C", workspaceId: "w", parentCanvasId: nil)
        board.widgets["a"] = Widget(id: "a", type: "text", title: title, canvasId: "c", position: .zero, size: Size(width: 320, height: 200), data: ["text": ""])
        return board
    }

    func testUndoAndRedoWalkTheStacks() {
        var history = BoardHistory()
        let first = board("one"), second = board("two"), third = board("three")
        XCTAssertFalse(history.canUndo)
        XCTAssertNil(history.undo(current: first))

        history.push(first)
        history.push(second)
        XCTAssertTrue(history.canUndo)
        XCTAssertEqual(history.undo(current: third), second)
        XCTAssertTrue(history.canRedo)
        XCTAssertEqual(history.undo(current: second), first)
        XCTAssertFalse(history.canUndo)
        XCTAssertEqual(history.redo(current: first), second)
        XCTAssertEqual(history.redo(current: second), third)
        XCTAssertNil(history.redo(current: third))
    }

    func testPushClearsRedo() {
        var history = BoardHistory()
        history.push(board("one"))
        _ = history.undo(current: board("two"))
        XCTAssertTrue(history.canRedo)
        history.push(board("branch"))
        XCTAssertFalse(history.canRedo)
        XCTAssertEqual(history.past.map { $0.widgets["a"]?.title }, ["branch"])
    }

    func testPastIsCappedAtTheLimit() {
        var history = BoardHistory(limit: 3)
        for index in 0..<5 { history.push(board("\(index)")) }
        XCTAssertEqual(history.past.map { $0.widgets["a"]?.title }, ["2", "3", "4"])
        var wide = BoardHistory()
        for index in 0..<(BoardHistory.defaultLimit + 10) { wide.push(board("\(index)")) }
        XCTAssertEqual(wide.past.count, BoardHistory.defaultLimit)
        XCTAssertEqual(wide.past.first?.widgets["a"]?.title, "10")
    }

    func testClearEmptiesBothStacks() {
        var history = BoardHistory()
        history.push(board("one"))
        _ = history.undo(current: board("two"))
        history.clear()
        XCTAssertFalse(history.canUndo)
        XCTAssertFalse(history.canRedo)
    }

    func testSnapshotsAreValueCopies() {
        var history = BoardHistory()
        var live = board("one")
        history.push(live)
        live.widgets["a"]!.title = "mutated"
        XCTAssertEqual(history.past.first?.widgets["a"]?.title, "one")
    }
}
