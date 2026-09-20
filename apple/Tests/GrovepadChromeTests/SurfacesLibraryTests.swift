import XCTest
import GrovepadCore
@testable import GrovepadChrome

/// Workspaces and canvases through the document: create, rename, reorder,
/// delete (never the last), switch with memory, and undo for each.
final class SurfacesLibraryTests: XCTestCase {

    /// These tests exercise the circuit system, which the app ships frozen
    /// (`CircuitFeature`); each switches it on for itself only.
    override func invokeTest() {
        let previous = CircuitFeature.isEnabled
        CircuitFeature.isEnabled = true
        defer { CircuitFeature.isEnabled = previous }
        super.invokeTest()
    }
    private func fixture() -> (BoardDocument, LibraryModel, ChromeState, CanvasTabsModel) {
        var board = makeBoard()
        board.workspaces["ws"]?.sortIndex = 0
        let (document, _, _) = makeDocument(board: board)
        let chrome = ChromeState()
        let tabs = CanvasTabsModel(document: document, mint: .counting(prefix: "tab-"))
        let library = LibraryModel(document: document, tabs: tabs, chrome: chrome, mint: .counting(prefix: "lib-"), clock: .fixed(ms: 1_789_000_000_500))
        return (document, library, chrome, tabs)
    }

    func testCreateWorkspaceMintsAnOriginAndNavigatesThere() {
        let (document, library, _, tabs) = fixture()
        var toasts: [String] = []
        library.toast = { toasts.append($0) }
        let id = library.createWorkspace(named: "  Studies ")
        let workspace = document.board.workspaces[id]!
        XCTAssertEqual(workspace.name, "Studies")
        XCTAssertEqual(workspace.sortIndex, 1)
        XCTAssertEqual(workspace.tint, "#60a5fa")
        XCTAssertEqual(workspace.createdAt, 1_789_000_000_500)
        XCTAssertEqual(document.canvas(workspace.rootCanvasId)?.name, "Origin")
        XCTAssertEqual(document.activeCanvasId, workspace.rootCanvasId)
        XCTAssertEqual(document.activeWorkspaceId, id)
        XCTAssertEqual(tabs.openTabs.first { $0.id == tabs.activeTabId }?.canvasId, workspace.rootCanvasId)
        XCTAssertEqual(toasts, ["Workspace “Studies” created"])
        XCTAssertEqual(library.workspaces.map(\.name), ["Workspace", "Studies"])
        XCTAssertEqual(library.workspaces[1].isActive, true)

        XCTAssertEqual(document.createWorkspace(name: "   ", mint: .counting(prefix: "u-")), "u-0001")
        XCTAssertEqual(document.board.workspaces["u-0001"]?.name, "Untitled")

        document.undo()
        document.undo()
        XCTAssertEqual(document.board.workspaces.count, 1, "both creations undo")
    }

    func testRenameReorderAndSort() {
        let (document, library, _, _) = fixture()
        let second = library.createWorkspace(named: "Second")
        let third = library.createWorkspace(named: "Third")
        library.renameWorkspace(second, to: " Two ")
        XCTAssertEqual(document.board.workspaces[second]?.name, "Two")
        library.renameWorkspace(second, to: "")
        XCTAssertEqual(document.board.workspaces[second]?.name, "Two", "blank refused")

        library.moveWorkspace(third, by: -1)
        XCTAssertEqual(library.workspaces.map(\.id), ["ws", third, second])
        library.moveWorkspace("ws", by: 1)
        XCTAssertEqual(library.workspaces.map(\.id), [third, "ws", second])
        XCTAssertEqual(document.board.workspaces[third]?.sortIndex, 0)
        library.moveWorkspace(second, by: 1)
        XCTAssertEqual(library.workspaces.map(\.id), [third, "ws", second], "cannot move past the end")
        document.undo()
        XCTAssertEqual(library.workspaces.map(\.id), ["ws", third, second], "a reorder is one undo step")
    }

    func testDeleteWorkspaceCascadesAndRefusesTheLast() throws {
        let (document, library, _, tabs) = fixture()
        XCTAssertFalse(library.canDeleteWorkspace)
        document.deleteWorkspace("ws")
        XCTAssertEqual(document.board.workspaces.count, 1, "the last workspace stays")

        let second = library.createWorkspace(named: "Second")
        let root2 = document.board.workspaces[second]!.rootCanvasId
        let a = document.createWidget(type: "text", at: .zero, title: "A")!
        let b = document.createWidget(type: "counter", at: Vector2D(x: 400, y: 0), title: "B")!
        _ = document.addRelation(from: a, to: b, type: .parent)
        _ = document.addValueConnection(from: a, field: "text", to: b, field: "count")
        _ = document.addGlue([a, b])
        tabs.open(root2, activate: false)
        let before = document.board

        var toasts: [String] = []
        library.toast = { toasts.append($0) }
        XCTAssertTrue(library.canDeleteWorkspace)
        library.deleteWorkspace(second)
        XCTAssertNil(document.board.workspaces[second])
        XCTAssertFalse(document.board.canvases.contains(root2))
        XCTAssertNil(document.widget(a))
        XCTAssertTrue(document.board.relations.isEmpty)
        XCTAssertTrue(document.board.connections.isEmpty)
        XCTAssertTrue(document.board.glues.isEmpty)
        XCTAssertEqual(document.activeCanvasId, "root", "landed on the first surviving root")
        XCTAssertEqual(document.activeWorkspaceId, "ws")
        XCTAssertEqual(tabs.openTabs.map(\.canvasId), ["root"], "tabs into the dead workspace dropped")
        XCTAssertEqual(toasts, ["Deleted workspace “Second”"])

        document.undo()
        XCTAssertEqual(document.board, before, "the whole deletion is one undo step")
    }

    func testSwitchWorkspaceRemembersTheLastVisit() throws {
        let (document, library, chrome, _) = fixture()
        let second = library.createWorkspace(named: "Second")
        let door = document.createWidget(type: "canvas_node", at: .zero, title: "Deep")!
        let deep = try XCTUnwrap(document.widget(door)?.data.string("canvasId"))
        library.openCanvas(deep)
        XCTAssertEqual(document.activeCanvasId, deep)
        library.switchWorkspace("ws")
        XCTAssertEqual(document.activeCanvasId, "root")
        library.switchWorkspace(second)
        XCTAssertEqual(document.activeCanvasId, deep, "landed where the person last stood")
        XCTAssertEqual(chrome.canvasVisits.first, deep)
    }

    func testCanvasCreationRenameAndDeletionGoThroughTheDocument() throws {
        let (document, library, _, _) = fixture()
        let created = try XCTUnwrap(library.createCanvas(named: "Notes", under: "root", at: Vector2D(x: 37, y: 41)))
        XCTAssertEqual(document.canvas(created)?.name, "Notes")
        XCTAssertEqual(document.canvas(created)?.parentCanvasId, "root")
        let door = try XCTUnwrap(document.ownerCanvasNode(of: created))
        XCTAssertEqual(door.position, Vector2D(x: 40, y: 40), "the door card snaps to the grid")
        XCTAssertNil(library.createCanvas(named: "  ", under: "root", at: .zero))

        let rows = library.canvases(in: "ws")
        XCTAssertEqual(rows.map(\.name), ["Root", "Notes"], "root first")
        XCTAssertTrue(rows[0].isRoot)

        library.renameCanvas(created, to: "Lecture notes")
        XCTAssertEqual(document.canvas(created)?.name, "Lecture notes")

        var requested: [String] = []
        library.requestDeletion = { requested = $0 }
        library.deleteCanvas(created)
        XCTAssertEqual(requested, [door.id])
        library.deleteCanvas("root")
        XCTAssertEqual(requested, [door.id], "a root is never deleted here")

        document.undo()
        document.undo()
        XCTAssertFalse(document.board.canvases.contains(created))
    }
}
