import XCTest
import GrovepadCore
@testable import GrovepadChrome

/// The tree drawer's outline, keyboard walk, reparent policy and row actions.
final class SurfacesCanvasTreeTests: XCTestCase {
    private func fixture() throws -> (BoardDocument, CanvasTreeModel, ChromeState, RecordingCamera, inner: String, deeper: String) {
        let (document, _, _) = makeDocument()
        let chrome = ChromeState()
        let tabs = CanvasTabsModel(document: document, mint: .counting(prefix: "tab-"))
        let camera = RecordingCamera()
        let tree = CanvasTreeModel(document: document, tabs: tabs, chrome: chrome, camera: camera)
        _ = document.createWidget(type: "text", at: Vector2D(x: 400, y: 0), title: "Right")!
        _ = document.createWidget(type: "text", at: Vector2D(x: 0, y: 0), title: "Left")!
        _ = document.createWidget(type: "counter", at: Vector2D(x: 0, y: 200), title: "Below")!
        let zeta = document.createWidget(type: "canvas_node", at: Vector2D(x: 800, y: 0), title: "Zeta")!
        let alpha = document.createWidget(type: "canvas_node", at: Vector2D(x: 800, y: 200), title: "Alpha")!
        let inner = try XCTUnwrap(document.widget(alpha)?.data.string("canvasId"))
        _ = zeta
        document.navigate(to: inner)
        let deeperDoor = document.createWidget(type: "canvas_node", at: .zero, title: "Deeper")!
        let deeper = try XCTUnwrap(document.widget(deeperDoor)?.data.string("canvasId"))
        document.navigate(to: "root")
        return (document, tree, chrome, camera, inner, deeper)
    }

    func testOutlineOrderIsStructuralThenSpatial() throws {
        let (document, tree, _, _, inner, deeper) = try fixture()
        let entries = tree.entries
        let names = entries.map { entry -> String in
            entry.kind == .canvas ? "C:\(document.canvasName(entry.id)!)@\(entry.level)" : "W:\(document.widget(entry.id)!.title)@\(entry.level)"
        }
        XCTAssertEqual(names, ["C:Root@1", "W:Left@2", "W:Right@2", "W:Below@2", "C:Alpha@2", "C:Deeper@3", "C:Zeta@2"])
        XCTAssertEqual(entries.first { $0.id == deeper }?.parentKey, "canvas:\(inner)")
        XCTAssertFalse(entries.contains { $0.kind == .widget && document.widget($0.id)?.type == "canvas_node" }, "door cards are omitted")
    }

    func testCollapseHidesTheBranchAndKeyboardWalkFollowsTheOutline() throws {
        let (_, tree, _, _, inner, deeper) = try fixture()
        tree.toggleExpanded(inner)
        XCTAssertFalse(tree.isExpanded(inner))
        XCTAssertFalse(tree.entries.contains { $0.id == deeper })
        XCTAssertTrue(tree.entries.contains { $0.id == inner }, "the collapsed canvas itself still lists")
        tree.toggleExpanded(inner)

        let entries = tree.entries
        XCTAssertEqual(CanvasOutline.next(entries, from: "canvas:root", .down), entries[1].key)
        XCTAssertEqual(CanvasOutline.next(entries, from: entries[1].key, .left), "canvas:root")
        XCTAssertEqual(CanvasOutline.next(entries, from: "canvas:root", .right), entries[1].key)
        XCTAssertEqual(CanvasOutline.next(entries, from: "canvas:root", .up), "canvas:root")
        XCTAssertEqual(CanvasOutline.next(entries, from: "canvas:\(deeper)", .end), entries.last!.key)
        XCTAssertEqual(CanvasOutline.next(entries, from: "nope", .home), "canvas:root")
        tree.focusedKey = "canvas:root"
        tree.moveFocus(.down)
        XCTAssertEqual(tree.focusedKey, entries[1].key)
    }

    func testParentTargetsExcludeOwnSubtreeAndCurrentParent() throws {
        let (document, tree, _, _, inner, deeper) = try fixture()
        let targets = CanvasOutline.parentTargets(board: document.board, canvasId: inner).map(\.id)
        XCTAssertFalse(targets.contains(inner))
        XCTAssertFalse(targets.contains(deeper), "own subtree")
        XCTAssertFalse(targets.contains("root"), "current parent")
        XCTAssertEqual(targets.count, 1, "only Zeta")
        XCTAssertTrue(tree.canMoveOrDelete(inner))
        XCTAssertFalse(tree.canMoveOrDelete("root"))

        tree.movingCanvasId = inner
        XCTAssertEqual(tree.moveTargets.map(\.id), targets)
        let zeta = targets[0]
        tree.move(to: zeta)
        XCTAssertEqual(document.canvas(inner)?.parentCanvasId, zeta)
        XCTAssertNil(tree.movingCanvasId)
        document.undo()
        XCTAssertEqual(document.canvas(inner)?.parentCanvasId, "root", "one undo step")

        document.reparentCanvas(inner, to: deeper)
        XCTAssertEqual(document.canvas(inner)?.parentCanvasId, "root", "a cycle is refused")
        document.reparentCanvas("root", to: inner)
        XCTAssertNil(document.canvas("root")?.parentCanvasId, "a root never moves")
    }

    func testOpenRenameActivateAndDelete() throws {
        let (document, tree, chrome, camera, inner, _) = try fixture()
        tree.open(inner)
        XCTAssertEqual(document.activeCanvasId, inner)
        XCTAssertEqual(chrome.canvasVisits.first, inner)
        tree.open("root", command: true)
        XCTAssertEqual(document.activeCanvasId, inner, "⌘ opens a background tab")
        XCTAssertEqual(tree.tabs.openTabs.count, 2)

        tree.rename(inner, to: "  Renamed  ")
        XCTAssertEqual(document.canvasName(inner), "Renamed")
        XCTAssertEqual(document.board.widgets.values.first { $0.type == "canvas_node" && $0.data.string("canvasId") == inner }?.title, "Renamed", "the door card follows")
        tree.rename(inner, to: "   ")
        XCTAssertEqual(document.canvasName(inner), "Renamed", "blank refused")

        let left = document.board.widgets.values.first { $0.title == "Left" }!
        tree.activateWidget(left.id)
        XCTAssertEqual(document.activeCanvasId, "root")
        XCTAssertEqual(document.selection, [left.id])
        XCTAssertEqual(camera.log.last?.hasPrefix("fitRect:"), true)

        var requested: [String] = []
        tree.requestDeletion = { requested = $0 }
        tree.deleteCanvas(inner)
        XCTAssertEqual(requested, [document.ownerCanvasNode(of: inner)!.id], "a nested canvas deletes through its door card")
        tree.deleteCanvas("root")
        XCTAssertEqual(requested.count, 1, "a root has no door and is not deletable here")

        chrome.treeOpen = true
        tree.close()
        XCTAssertFalse(chrome.treeOpen)
    }
}
