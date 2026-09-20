import XCTest
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
@testable import GrovepadApp

/// The Quick Look extension's summary builder (`PackageSummary` in
/// GrovepadCore): counts, names with fallbacks, the first titles per
/// canvas, over a real `.grovepad` round trip.
@MainActor
final class IntegrationQuickLookTests: XCTestCase {
    func testSummaryCountsAndNamesAPackage() throws {
        let document = BoardDocument(board: AppCoordinator.emptyBoard(mint: .counting(prefix: "b-"), clock: .fixed(ms: 1)), mint: .counting(prefix: "m-"), clock: .fixed(ms: 1))
        let root = document.activeCanvasId
        document.renameCanvas(root, name: "  ")
        let door = try XCTUnwrap(document.createWidget(type: "canvas_node", at: .zero, title: "Biology"))
        let inner = try XCTUnwrap(document.widget(door)?.data.string("canvasId"))
        for index in 0..<7 {
            _ = document.createWidget(type: "text", at: Vector2D(x: Double(index) * 400, y: 300), title: index == 0 ? "" : "Note \(index)")
        }
        document.navigate(to: inner)
        _ = document.createWidget(type: "counter", at: .zero, title: "Tally")

        let bytes = GrovepadPackage.build(document.board, appVersion: "test", clock: .fixed(ms: 1)) { _ in nil }
        let package = try GrovepadPackage.read(bytes)
        let summary = PackageSummary.build(package)

        XCTAssertEqual(summary.workspaceCount, 1)
        XCTAssertEqual(summary.canvasCount, 2)
        XCTAssertEqual(summary.cardCount, 9)
        XCTAssertEqual(summary.mediaCount, 0)
        XCTAssertEqual(summary.headline, "1 workspace · 2 canvases · 9 cards")
        XCTAssertEqual(summary.workspaces, [PackageSummary.WorkspaceLine(name: "Workspace", canvasCount: 2, cardCount: 9)])
        XCTAssertEqual(summary.canvases.count, 2)
        let rootLine = try XCTUnwrap(summary.canvases.first)
        XCTAssertEqual(rootLine.name, "Canvas", "a blank canvas name falls back")
        XCTAssertEqual(rootLine.workspaceName, "Workspace")
        XCTAssertEqual(rootLine.cardCount, 8)
        XCTAssertEqual(rootLine.firstCardTitles, ["Biology", "Text", "Note 1", "Note 2", "Note 3"], "five titles, an untitled card named by type")
        let innerLine = try XCTUnwrap(summary.canvases.last)
        XCTAssertEqual(innerLine.name, "Biology")
        XCTAssertEqual(innerLine.firstCardTitles, ["Tally"])
    }

    func testTypeLabelsAndPlurals() {
        XCTAssertEqual(PackageSummary.typeLabel("canvas_node"), "Canvas node")
        XCTAssertEqual(PackageSummary.typeLabel("text"), "Text")
        XCTAssertEqual(PackageSummary.typeLabel(""), "Card")
        let one = PackageSummary(workspaceCount: 1, canvasCount: 1, cardCount: 1, mediaCount: 0, workspaces: [], canvases: [])
        XCTAssertEqual(one.headline, "1 workspace · 1 canvas · 1 card")
        XCTAssertEqual(PackageSummary.build(Board()).headline, "0 workspaces · 0 canvases · 0 cards")
    }

    func testCanvasListIsBounded() {
        var board = AppCoordinator.emptyBoard(mint: .counting(prefix: "b-"), clock: .fixed(ms: 1))
        let workspaceId = board.activeWorkspaceId
        for index in 0..<40 {
            board.canvases["extra-\(index)"] = CanvasMeta(id: "extra-\(index)", name: "Extra \(index)", workspaceId: workspaceId, parentCanvasId: board.activeCanvasId)
        }
        let summary = PackageSummary.build(board)
        XCTAssertEqual(summary.canvasCount, 41)
        XCTAssertEqual(summary.canvases.count, PackageSummary.canvasLimit)
        XCTAssertEqual(summary.workspaces.first?.canvasCount, 41, "counts are whole even when the list is cut")
    }
}
