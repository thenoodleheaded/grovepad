import XCTest
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// The document seams realtime collaboration drives: a remote merge is not
/// an undo step, a read-only role makes every mutation inert, and Undo/Redo
/// go to collaborative history while a shared canvas is connected.
final class BoardDocumentCollaborationTests: XCTestCase {
    private final class FakeHistory: BoardHistoryOverride {
        var undos = 0
        var redos = 0
        var canUndo = true
        var canRedo = false
        func undo() { undos += 1 }
        func redo() { redos += 1 }
    }

    func testRemoteMergeIsNotAnUndoStepAndPrunesSelection() {
        let (document, undo, _) = makeDocument()
        let id = document.createWidget(type: "text", at: .zero, title: "Mine")!
        document.select(id)
        undo.removeAllActions()
        var notified = 0
        let stop = document.subscribe { notified += 1 }
        defer { stop() }

        var remote = document.board
        remote.widgets.removeValue(forKey: id)
        document.applyCollaborativeBoard(remote)
        XCTAssertNil(document.widget(id))
        XCTAssertEqual(document.selection, [], "a selection whose card is gone is dropped")
        XCTAssertFalse(undo.canUndo, "someone else's change is never on this person's undo stack")
        XCTAssertEqual(notified, 1, "autosave and sync follow like any change")
    }

    func testEditingLockMakesMutationsInert() {
        let (document, undo, _) = makeDocument()
        let id = document.createWidget(type: "text", at: .zero, title: "Kept")!
        let before = document.board
        document.setEditingLocked(true)
        XCTAssertNotNil(document.createWidget(type: "text", at: Vector2D(x: 400, y: 0), title: "Blocked"), "callers still get a value")
        document.renameWidget(id, title: "Changed")
        _ = document.deleteWidgets([id])
        document.applyWireWrites([id: ["text": .string("wired")]])
        XCTAssertEqual(document.board, before)
        document.setEditingLocked(false)
        document.renameWidget(id, title: "Changed")
        XCTAssertEqual(document.widget(id)?.title, "Changed")
        XCTAssertTrue(undo.canUndo)
    }

    func testHistoryOverrideOwnsUndoWhileConnected() {
        let (document, undo, _) = makeDocument()
        _ = document.createWidget(type: "text", at: .zero, title: "Before")
        XCTAssertTrue(undo.canUndo)
        let history = FakeHistory()
        document.setHistoryOverride(history)
        XCTAssertFalse(undo.canUndo, "local history is cleared on the way in")
        _ = document.createWidget(type: "text", at: Vector2D(x: 400, y: 0), title: "During")
        XCTAssertFalse(undo.canUndo, "and records nothing while connected")
        XCTAssertTrue(document.canUndo)
        XCTAssertFalse(document.canRedo)
        document.undo()
        document.redo()
        XCTAssertEqual(history.undos, 1)
        XCTAssertEqual(history.redos, 1)
        document.setEditingLocked(true)
        XCTAssertFalse(document.canUndo, "a read-only role cannot undo")
        document.setEditingLocked(false)
        document.setHistoryOverride(nil)
        XCTAssertFalse(document.canUndo, "and cleared again on the way out")
    }

    func testSharingFlagAndAdoptingAnInvite() {
        let (document, undo, _) = makeDocument()
        let canvasId = document.activeCanvasId
        undo.removeAllActions()
        document.setCanvasShared(canvasId, shared: true)
        XCTAssertTrue(document.canvas(canvasId)?.shared ?? false)
        XCTAssertFalse(undo.canUndo, "sharing is a server fact, not an undo step")

        XCTAssertTrue(document.adoptSharedCanvas("remote-canvas", name: "From Ada"))
        let adopted = document.canvas("remote-canvas")
        XCTAssertEqual(adopted?.name, "From Ada")
        XCTAssertTrue(adopted?.shared ?? false)
        XCTAssertEqual(adopted?.workspaceId, document.activeWorkspaceId)
    }
}
