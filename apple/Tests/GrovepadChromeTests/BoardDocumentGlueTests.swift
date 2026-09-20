import XCTest
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// The group actions on the document (`glueSlice.ts` and its hooks in
/// select / move / settle / delete / pin / icon): what a person does with a
/// group, and that each is one undo step that takes it back exactly.
final class BoardDocumentGlueTests: XCTestCase {
    // These fixtures use pinned cards as "never resting" (the web's rule).
    override func setUp() {
        super.setUp()
    }

    override func tearDown() {
        super.tearDown()
    }

    /// Pinned Text cards (never resting): a | b welded side by side, c free
    /// a cell to the right of b, d far away.
    private func makeGroupBoard() -> Board {
        var board = makeBoard()
        func card(_ id: String, _ x: Double, _ y: Double) -> Widget {
            var metadata = WidgetMetadata()
            metadata.pinned = true
            var data = JSONObject()
            data["text"] = .string("")
            return Widget(id: id, type: "text", title: id.uppercased(), canvasId: "root", position: Vector2D(x: x, y: y), size: Size(width: 240, height: 160), data: data, metadata: metadata)
        }
        for w in [card("a", 0, 40), card("b", 240, 40), card("c", 520, 40), card("d", 2000, 40)] { board.widgets[w.id] = w }
        return board
    }

    func testGlueSelectsAndMovesTheWholeGroupAsOneUndoStep() throws {
        let (document, _, _) = makeDocument(board: makeGroupBoard())
        let before = document.board
        let glueId = try XCTUnwrap(document.addGlue(["a", "b"]))
        XCTAssertEqual(document.board.glues[glueId]?.widgetIds, ["a", "b"])

        document.select("b")
        XCTAssertEqual(Set(document.selection), ["a", "b"], "selecting a member selects its group")
        document.select("b", additive: true)
        XCTAssertEqual(document.selection, [], "shift-click toggles the whole group off")

        document.beginGesture(named: "Move")
        document.moveWidgets(["a"], by: Vector2D(x: 13, y: 7))
        document.snapWidgetsToGrid(["a"])
        document.endGesture()
        XCTAssertEqual(document.widget("a")?.position, Vector2D(x: 0, y: 40), "the group snaps rigidly back onto the grid")
        XCTAssertEqual(document.widget("b")?.position, Vector2D(x: 240, y: 40))

        document.moveWidgets(["a"], by: Vector2D(x: 80, y: 0))
        XCTAssertEqual(document.widget("b")?.position.x, 320, "a plain move carries the clustermate")
        document.moveWidgets(["a"], by: Vector2D(x: -80, y: 0), soloGlued: true)
        XCTAssertEqual(document.widget("b")?.position.x, 320, "an option-drag moves the grabbed card alone")

        document.undo()
        document.undo()
        document.undo()
        document.undo()
        XCTAssertEqual(document.board, before)
    }

    func testOptionDragWeldsAtTheSeamAndPullsOff() throws {
        let (document, _, _) = makeDocument(board: makeGroupBoard())
        _ = try XCTUnwrap(document.addGlue(["a", "b"]))
        document.beginGesture(named: "Move")
        document.moveWidgets(["c"], by: Vector2D(x: -20, y: 10), soloGlued: true)
        let dragged = try XCTUnwrap(document.widget("c"))
        let snap = try XCTUnwrap(GlueGeometry.findSnap(dragged, widgets: document.board.widgets))
        XCTAssertEqual(snap.targetId, "b")
        document.setGlueIntent(GlueIntent(draggedId: "c", targetId: snap.targetId, position: snap.position, axis: snap.axis))
        XCTAssertTrue(document.commitGlue())
        document.endGesture()
        XCTAssertEqual(document.widget("c")?.position, Vector2D(x: 480, y: 40), "lands touching b, grid-snapped across the bond")
        XCTAssertEqual(document.glue(containing: "c")?.widgetIds, ["a", "b", "c"], "c joins the a | b group")
        XCTAssertNil(document.glueIntent)

        // Pull b out of a | b | c: the survivors close ranks and stay grouped.
        document.select("b")
        XCTAssertTrue(document.unglueWidget("b"))
        XCTAssertEqual(document.selection, ["b"], "the freed card is selected alone")
        let group = try XCTUnwrap(document.glue(containing: "a"))
        XCTAssertEqual(group.widgetIds, ["a", "c"])
        XCTAssertNil(document.glue(containing: "b"))
    }

    func testCollapseFoldsToOneCellEachAndExpandRestoresWhereTheBlockMoved() throws {
        let (document, _, _) = makeDocument(board: makeGroupBoard())
        let glueId = try XCTUnwrap(document.addGlue(["a", "b"]))
        let open = document.board.widgets
        document.setClusterCollapsed(glueId, true)
        let glue = try XCTUnwrap(document.board.glues[glueId])
        XCTAssertTrue(glue.collapsed)
        XCTAssertEqual(glue.foldedAt, Vector2D(x: 0, y: 40))
        XCTAssertEqual(document.widget("a")?.size, GlueGeometry.collapsedMemberSize)
        XCTAssertEqual(document.widget("b")?.position, Vector2D(x: 40, y: 40), "packed side by side")
        XCTAssertTrue(document.isInFoldedCluster("a"))

        document.moveWidgets(["a"], by: Vector2D(x: 400, y: 80))
        document.setClusterCollapsed(glueId, false)
        XCTAssertFalse(document.board.glues[glueId]?.collapsed ?? true)
        XCTAssertNil(document.board.glues[glueId]?.record["restore"])
        XCTAssertEqual(document.widget("a")?.size, open["a"]?.size)
        XCTAssertEqual(document.widget("a")?.position, Vector2D(x: 400, y: 120), "opens around where the block sits now")
        XCTAssertEqual(document.widget("b")?.position, Vector2D(x: 640, y: 120))
    }

    func testUngroupSpreadsRenameCleansAndDeleteClosesRanks() throws {
        let (document, _, _) = makeDocument(board: makeGroupBoard())
        let glueId = try XCTUnwrap(document.addGlue(["a", "b"]))
        document.renameGlue(glueId, name: "  Sprint \n  plan  ")
        XCTAssertEqual(document.board.glues[glueId]?.name, "Sprint plan")
        document.renameGlue(glueId, name: "   ")
        XCTAssertNil(document.board.glues[glueId]?.record["name"], "an empty name removes the key")

        document.select("a")
        document.unglueCluster(glueId)
        XCTAssertTrue(document.board.glues.isEmpty)
        XCTAssertEqual(document.selection, [])
        let a = try XCTUnwrap(document.widget("a")), b = try XCTUnwrap(document.widget("b"))
        XCTAssertGreaterThanOrEqual(b.position.x - (a.position.x + a.size.width), 40, "the split is physical: a clear cell apart")

        // A three-card row loses its middle card: the ends close ranks.
        let (row, _, _) = makeDocument(board: makeGroupBoard())
        row.moveWidgets(["c"], by: Vector2D(x: -40, y: 0))
        let trio = try XCTUnwrap(row.addGlue(["a", "b", "c"]))
        row.deleteWidgets(["b"])
        XCTAssertEqual(row.board.glues[trio]?.widgetIds, ["a", "c"])
        XCTAssertEqual(row.widget("c")?.position.x, 240, "c slides back to weld onto a")
    }

    func testGroupButtonsAndMenuNarrowing() throws {
        let (document, _, _) = makeDocument(board: makeGroupBoard())
        _ = try XCTUnwrap(document.addGlue(["a", "b"]))
        document.setMetadataFlag("favorite", true, on: ["a", "b"])
        XCTAssertTrue(document.widget("a")!.metadata.favorite && document.widget("b")!.metadata.favorite)

        document.select("a")
        document.selectForContextMenu("b")
        XCTAssertEqual(document.selection, ["b"], "the menu aims at the pressed card, not the group")

        document.selectWidgets(["a", "b", "d"])
        document.selectForContextMenu("b")
        XCTAssertEqual(document.selection, ["a", "b", "d"], "a deliberate multi-selection is left alone")
    }

    func testLoadHealsRecordsWhosePiecesNoLongerTouch() throws {
        var board = makeGroupBoard()
        board.glues["g"] = WidgetGlue(id: "g", widgetIds: ["a", "b", "d"])
        let (document, _, _) = makeDocument()
        document.loadBoard(board)
        XCTAssertEqual(document.board.glues["g"]?.widgetIds, ["a", "b"], "d is far away and splits off")
    }

    func testRenderInsetsCarveTheSeamAndFoldEvenly() throws {
        let (document, _, _) = makeDocument(board: makeGroupBoard())
        let glueId = try XCTUnwrap(document.addGlue(["a", "b"]))
        var insets = GlueGeometry.renderInsets(glues: document.board.glues, widgets: document.board.widgets, canvasId: "root")
        XCTAssertEqual(insets["a"], CardInsets(right: 6))
        XCTAssertEqual(insets["b"], CardInsets(left: 6))
        XCTAssertNil(insets["c"])
        document.setClusterCollapsed(glueId, true)
        insets = GlueGeometry.renderInsets(glues: document.board.glues, widgets: document.board.widgets, canvasId: "root")
        XCTAssertEqual(insets["a"], CardInsets(top: 6, left: 6, bottom: 6, right: 6))
    }
}
