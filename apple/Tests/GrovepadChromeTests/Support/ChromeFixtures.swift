import Foundation
import XCTest
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// The frozen pack under `apple/Conformance`, read by path (law 2).
enum ChromePack {
    static let root: URL = {
        // …/apple/Tests/GrovepadChromeTests/Support/ChromeFixtures.swift → …/apple/Conformance
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("Conformance")
    }()

    static func json(_ relativePath: String) throws -> JSONValue {
        try JSONParser.parse([UInt8](try Data(contentsOf: root.appendingPathComponent(relativePath))))
    }

    static func registry() throws -> JSONObject {
        guard let object = try json("registry.json").objectValue else {
            throw NSError(domain: "ChromePack", code: 1, userInfo: [NSLocalizedDescriptionKey: "registry.json is not an object"])
        }
        return object
    }
}

/// The eight phase-3 widgets, in registry order.
let phaseThreeTypes = ["canvas_node", "text", "bullets", "checklist", "flashcards", "counter", "toggle", "number_input"]

/// A blank board: one workspace, one root canvas.
func makeBoard() -> Board {
    var board = Board()
    board.workspaces["ws"] = Workspace(id: "ws", name: "Workspace", rootCanvasId: "root", createdAt: 1_789_000_000_000)
    board.canvases["root"] = CanvasMeta(id: "root", name: "Root", workspaceId: "ws", parentCanvasId: nil)
    board.activeWorkspaceId = "ws"
    board.activeCanvasId = "root"
    return board
}

/// A ticking test clock so same-tag edits can be pulled apart deliberately.
final class TestClock {
    var now: Double = 1_789_000_000_000
    var clock: Clock { Clock { self.now } }
    func advance(ms: Double) { now += ms }
}

/// A document over a blank board with a per-commit undo manager.
func makeDocument(board: Board = makeBoard(), clock: TestClock = TestClock()) -> (BoardDocument, UndoManager, TestClock) {
    let undo = UndoManager()
    undo.groupsByEvent = false
    let document = BoardDocument(board: board, undoManager: undo, mint: .counting(), clock: clock.clock)
    return (document, undo, clock)
}

/// A hand-driven heartbeat (no timers in tests).
final class FakeScheduler: HeartbeatScheduler {
    var isVisible = true
    var tick: (() -> Void)?
    func schedule(every interval: TimeInterval, _ tick: @escaping () -> Void) -> () -> Void {
        self.tick = tick
        return { [weak self] in self?.tick = nil }
    }
    func observeVisibility(_ handler: @escaping () -> Void) -> () -> Void { {} }
}
