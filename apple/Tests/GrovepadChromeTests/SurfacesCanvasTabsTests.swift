import XCTest
import GrovepadCore
@testable import GrovepadChrome

/// The tab row's one invariant — the active tab points at the active canvas —
/// across every edit and every document change that can remove a canvas.
final class SurfacesCanvasTabsTests: XCTestCase {
    private func assertInvariant(_ tabs: CanvasTabsModel, file: StaticString = #filePath, line: UInt = #line) {
        let active = tabs.openTabs.first { $0.id == tabs.activeTabId }
        XCTAssertNotNil(active, "active tab exists", file: file, line: line)
        XCTAssertEqual(active?.canvasId, tabs.document.activeCanvasId, file: file, line: line)
        XCTAssertEqual(Set(tabs.openTabs.map(\.id)).count, tabs.openTabs.count, "tab ids unique", file: file, line: line)
    }

    func testSeedsOneTabOnTheActiveCanvas() {
        let (document, _, _) = makeDocument()
        let tabs = CanvasTabsModel(document: document, mint: .counting(prefix: "tab-"))
        XCTAssertEqual(tabs.openTabs.count, 1)
        assertInvariant(tabs)
    }

    func testNavigationOpenCloseAndStepKeepTheInvariant() throws {
        let (document, _, _) = makeDocument()
        let tabs = CanvasTabsModel(document: document, mint: .counting(prefix: "tab-"))
        let door = document.createWidget(type: "canvas_node", at: .zero, title: "Inner")!
        let inner = try XCTUnwrap(document.widget(door)?.data.string("canvasId"))

        tabs.navigate(to: inner)
        XCTAssertEqual(tabs.openTabs.count, 1, "a plain navigation reuses the active tab")
        assertInvariant(tabs)

        tabs.open("root", activate: false)
        XCTAssertEqual(tabs.openTabs.count, 2)
        XCTAssertEqual(document.activeCanvasId, inner, "a background tab is bookkeeping only")
        assertInvariant(tabs)

        tabs.open(inner, activate: true)
        XCTAssertEqual(tabs.openTabs.count, 3)
        XCTAssertEqual(tabs.openTabs[1].canvasId, inner, "inserted right of the active tab")
        assertInvariant(tabs)

        XCTAssertTrue(tabs.step(1))
        XCTAssertEqual(document.activeCanvasId, "root")
        assertInvariant(tabs)
        XCTAssertTrue(tabs.step(1))
        XCTAssertEqual(document.activeCanvasId, inner, "wraps around")

        XCTAssertTrue(tabs.close(tabs.activeTabId))
        assertInvariant(tabs)
        XCTAssertTrue(tabs.close(tabs.activeTabId))
        XCTAssertFalse(tabs.close(tabs.activeTabId), "the last tab never closes")
        XCTAssertEqual(tabs.openTabs.count, 1)
        assertInvariant(tabs)
        XCTAssertFalse(tabs.step(1), "nothing to step to")
    }

    func testDeletingATabbedCanvasRepairsTheRowInPlace() throws {
        let (document, _, _) = makeDocument()
        let tabs = CanvasTabsModel(document: document, mint: .counting(prefix: "tab-"))
        let door = document.createWidget(type: "canvas_node", at: .zero, title: "Inner")!
        let inner = try XCTUnwrap(document.widget(door)?.data.string("canvasId"))
        tabs.open(inner, activate: true)
        tabs.open("root", activate: false)
        XCTAssertEqual(tabs.openTabs.map(\.canvasId), ["root", inner, "root"])

        document.deleteWidgets([door])
        XCTAssertFalse(document.board.canvases.contains(inner))
        XCTAssertEqual(document.activeCanvasId, "root", "the document climbed out of the deleted branch")
        assertInvariant(tabs)
        XCTAssertEqual(tabs.openTabs.count, 2, "the dead tab dropped")
        XCTAssertEqual(tabs.openTabs.firstIndex { $0.id == tabs.activeTabId }, 0, "a tab already on the fallback canvas takes over rather than a refill")

        // With no tab already on the fallback canvas, the slot is refilled in place.
        let (doc2, _, _) = makeDocument()
        let tabs2 = CanvasTabsModel(document: doc2, mint: .counting(prefix: "tab-"))
        let doorA = doc2.createWidget(type: "canvas_node", at: .zero, title: "A")!
        let canvasA = try XCTUnwrap(doc2.widget(doorA)?.data.string("canvasId"))
        let doorB = doc2.createWidget(type: "canvas_node", at: Vector2D(x: 400, y: 0), title: "B")!
        let canvasB = try XCTUnwrap(doc2.widget(doorB)?.data.string("canvasId"))
        tabs2.navigate(to: canvasA)
        tabs2.open(canvasB, activate: true)
        XCTAssertEqual(tabs2.openTabs.map(\.canvasId), [canvasA, canvasB])
        doc2.deleteWidgets([doorB])
        XCTAssertEqual(doc2.activeCanvasId, "root")
        assertInvariant(tabs2)
        XCTAssertEqual(tabs2.openTabs.map(\.canvasId), [canvasA, "root"], "refilled where the dead tab sat")
        XCTAssertEqual(tabs2.openTabs.firstIndex { $0.id == tabs2.activeTabId }, 1)

        document.undo()
        XCTAssertTrue(document.board.canvases.contains(inner))
        assertInvariant(tabs)
    }

    func testReorderAndRowVisibilityAndDeviceState() {
        let (document, _, _) = makeDocument()
        let tabs = CanvasTabsModel(document: document, mint: .counting(prefix: "tab-"))
        tabs.open("root", activate: false)
        tabs.open("root", activate: false)
        let ids = tabs.openTabs.map(\.id)
        tabs.reorder(ids[0], onto: ids[2])
        XCTAssertEqual(tabs.openTabs.map(\.id), [ids[1], ids[2], ids[0]], "dropping rightwards takes the target's slot")
        assertInvariant(tabs)

        XCTAssertTrue(tabs.isRowVisible(ChromeAdaptation(width: 1200)))
        XCTAssertFalse(tabs.isRowVisible(ChromeAdaptation(width: 390)))

        let state = tabs.deviceState(canvasViews: [:])
        XCTAssertEqual(state.openTabs, tabs.openTabs)
        XCTAssertEqual(state.activeTabId, tabs.activeTabId)
        XCTAssertEqual(state.activeCanvasId, "root")
    }

    func testPureRowEditsMatchTheWebRules() {
        let a = CanvasTab(id: "a", canvasId: "root"), b = CanvasTab(id: "b", canvasId: "x"), c = CanvasTab(id: "c", canvasId: "y")
        let position = CanvasTabRow.Position(openTabs: [a, b, c], activeTabId: "b", activeCanvasId: "x")
        XCTAssertNil(CanvasTabRow.close(CanvasTabRow.Position(openTabs: [a], activeTabId: "a", activeCanvasId: "root"), tabId: "a"))
        XCTAssertEqual(CanvasTabRow.close(position, tabId: "c")?.activeTabId, "b", "closing another tab leaves focus")
        XCTAssertEqual(CanvasTabRow.close(position, tabId: "b")?.activeTabId, "c", "closing the active tab hands focus right")
        XCTAssertEqual(CanvasTabRow.close(CanvasTabRow.Position(openTabs: [a, b, c], activeTabId: "c", activeCanvasId: "y"), tabId: "c")?.activeTabId, "b", "…or left at the end")
        XCTAssertEqual(CanvasTabRow.neighbour([a, b, c], activeTabId: "c", delta: 1), "a")
        XCTAssertEqual(CanvasTabRow.neighbour([a, b, c], activeTabId: "a", delta: -1), "c")
        XCTAssertEqual(CanvasTabRow.neighbour([a, b, c], activeTabId: "zzz", delta: 1), "a")
        XCTAssertEqual(CanvasTabRow.reorder([a, b, c], sourceId: "c", targetId: "a").map(\.id), ["c", "a", "b"])
        XCTAssertEqual(CanvasTabRow.reorder([a, b, c], sourceId: "a", targetId: "b").map(\.id), ["b", "a", "c"])
        let inserted = CanvasTabRow.insert(position, canvasId: "root", activate: true, mint: .counting(prefix: "t-"))
        XCTAssertEqual(inserted.openTabs.map(\.id), ["a", "b", "t-0001", "c"])
        XCTAssertEqual(inserted.activeCanvasId, "root")
    }
}
