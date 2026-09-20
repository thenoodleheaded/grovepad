import XCTest
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// The board making room: ports of `store/widgetSettling.test.ts`,
/// `store/generationFloor.test.ts` and `store/dragReflow.test.ts`, plus the
/// document call sites that run them (each one undo step).
final class WidgetSettlingTests: XCTestCase {
    private let grid = CanvasGeometry.gridSize

    // These fixtures use pinned cards as "never resting" (the web's rule),
    // so a card's settle box is its stored rectangle plus its name row.
    override func setUp() {
        super.setUp()
    }

    override func tearDown() {
        super.tearDown()
    }

    /// A pinned notes card (`card()` in the web test).
    private func card(_ id: String, _ x: Double, _ y: Double, width: Double = 160, height: Double = 80, locked: Bool = false, canvasId: String = "root") -> Widget {
        var metadata = WidgetMetadata()
        metadata.pinned = true
        if locked { metadata.locked = true }
        var data = JSONObject()
        data["text"] = .string("")
        return Widget(id: id, type: "text", title: id, canvasId: canvasId, position: Vector2D(x: x, y: y), size: Size(width: width, height: height), data: data, metadata: metadata)
    }

    private func map(_ cards: Widget...) -> OrderedMap<Widget> {
        var widgets = OrderedMap<Widget>()
        for card in cards { widgets[card.id] = card }
        return widgets
    }

    private func relation(_ id: String, _ from: String, _ to: String, type: String = "parent") -> Relation {
        var record = JSONObject()
        record["id"] = .string(id)
        record["fromId"] = .string(from)
        record["toId"] = .string(to)
        record["type"] = .string(type)
        record["isResolved"] = .bool(true)
        return Relation(record: record)
    }

    private func relations(_ items: Relation...) -> OrderedMap<Relation> {
        var map = OrderedMap<Relation>()
        for item in items { map[item.id] = item }
        return map
    }

    private func settle(_ widgets: OrderedMap<Widget>, _ ids: [String], anchors: [String] = []) -> OrderedMap<Widget> {
        WidgetSettling.settleLayout(widgets, activeIds: ids, glueIndex: [:], anchorIds: anchors, measure: .stored)
    }

    // MARK: - settleWidgetLayout (widgetSettling.test.ts)

    func testLeavesNeighboursAloneWhenADropMerelyLandsNearThem() {
        let settled = settle(map(card("a", 0, 0), card("b", 180, 0)), ["a"])
        XCTAssertEqual(settled["a"]?.position, Vector2D(x: 0, y: 0))
        XCTAssertEqual(settled["b"]?.position, Vector2D(x: 180, y: 0))
    }

    func testSeparatesAGenuineOverlapByTheFewestWholeCells() {
        let settled = settle(map(card("a", 0, 0), card("b", 120, 0)), ["a"])
        let left = settled["a"]!, right = settled["b"]!
        let gap = right.position.x - (left.position.x + left.size.width)
        XCTAssertGreaterThan(gap, 0)
        XCTAssertLessThanOrEqual(gap, grid)
        XCTAssertEqual(right.position.x.truncatingRemainder(dividingBy: grid), 0)
        XCTAssertEqual(left.position, Vector2D(x: 0, y: 0), "the card settled around holds its ground")
        XCTAssertEqual(right.position, Vector2D(x: 200, y: 0), "40 of overlap clears at one cell past it")
    }

    func testDoesNotWalkARowOfNeighboursAwayFromOneDrop() {
        let settled = settle(map(card("a", 0, 0), card("b", 200, 0), card("c", 400, 0)), ["a"])
        XCTAssertEqual(settled["b"]?.position, Vector2D(x: 200, y: 0))
        XCTAssertEqual(settled["c"]?.position, Vector2D(x: 400, y: 0))
    }

    func testResolvesAFullStackWithoutLeavingTheCardsOverlapping() {
        let settled = settle(map(card("a", 0, 0), card("b", 0, 0)), ["a"])
        let a = settled["a"]!.frame, b = settled["b"]!.frame
        XCTAssertTrue(b.x >= a.maxX || a.x >= b.maxX || b.y >= a.maxY || a.y >= b.maxY)
    }

    func testAnAnchoredCardHoldsWhileTheNeighbourGivesWay() {
        let settled = settle(map(card("a", 0, 0), card("b", 120, 0)), ["a"], anchors: ["a"])
        XCTAssertEqual(settled["a"]?.position, Vector2D(x: 0, y: 0))
        XCTAssertGreaterThan(settled["b"]!.position.x - 160, 0)
    }

    func testAnAnchoredCardIsNeverGridSnapped() {
        let settled = settle(map(card("a", -20, 60), card("b", 900, 900)), ["a"], anchors: ["a"])
        XCTAssertEqual(settled["a"]?.position, Vector2D(x: -20, y: 60))
        let unanchored = settle(map(card("a", -20, 60), card("b", 900, 900)), ["a"])
        XCTAssertEqual(unanchored["a"]?.position, Vector2D(x: 0, y: 80), "an unanchored drop lands on the grid (Math.round: -0.5 → 0)")
    }

    func testTerminatesWhenAnchoredCardsCannotBePushed() {
        let settled = settle(map(card("a", 0, 0), card("b", 0, 0)), ["a", "b"], anchors: ["a", "b"])
        XCTAssertEqual(settled["a"]?.position, Vector2D(x: 0, y: 0))
        XCTAssertEqual(settled["b"]?.position, Vector2D(x: 0, y: 0))
    }

    func testOtherCanvasesAreNeverPushed() {
        let settled = settle(map(card("a", 0, 0), card("b", 0, 0, canvasId: "other")), ["a"])
        XCTAssertEqual(settled["b"]?.position, Vector2D(x: 0, y: 0))
    }

    func testAGroupIsOneRigidUnitThatClaimsItsFrame() {
        // a | b welded (touching), c dropped onto b: the group moves whole,
        // its seam intact, or c gives way — never torn member by member.
        var widgets = map(card("a", 0, 0), card("b", 160, 0), card("c", 360, 0))
        let index = ["a": "g1", "b": "g1"]
        widgets = WidgetSettling.settleLayout(widgets, activeIds: ["c"], glueIndex: index, measure: .stored)
        XCTAssertEqual(widgets["b"]!.position.x - widgets["a"]!.position.x, 160, "the seam survives")
        // c now clears the group's frame band (20) on the right.
        XCTAssertGreaterThanOrEqual(widgets["c"]!.position.x, widgets["b"]!.position.x + 160 + GlueGeometry.frameBand)
    }

    func testSettleByCanvasSettlesEachCanvasOnItsOwn() {
        let widgets = map(card("a", 0, 0), card("b", 120, 0), card("x", 0, 0, canvasId: "other"), card("y", 120, 0, canvasId: "other"))
        let settled = WidgetSettling.settleByCanvas(widgets, activeIds: ["a", "x"], glueIndex: [:], measure: .stored)
        XCTAssertEqual(settled["b"]?.position, Vector2D(x: 200, y: 0))
        XCTAssertEqual(settled["y"]?.position, Vector2D(x: 200, y: 0))
    }

    // MARK: - The generation floor (generationFloor.test.ts)

    private func boxes(_ entries: [(String, Double)]) -> OrderedMap<Widget> {
        var widgets = OrderedMap<Widget>()
        for (id, y) in entries { widgets[id] = card(id, 0, y, width: 200, height: 100) }
        return widgets
    }

    private func floor(_ widgets: OrderedMap<Widget>, _ relations: OrderedMap<Relation>, glueIndex: [String: String] = [:]) -> (OrderedMap<Widget>, [String]) {
        var next = widgets
        let pushed = WidgetSettling.enforceGenerationFloor(&next, relations: relations, glueIndex: glueIndex, measure: .stored)
        return (next, pushed)
    }

    func testDropsAChildAboveItsParentToAFullGenerationBelow() {
        let (next, pushed) = floor(boxes([("parent", 500), ("child", 0)]), relations(relation("r1", "parent", "child")))
        XCTAssertEqual(next["parent"]?.position.y, 500)
        // Parent bottom 600, gap 80, the child's name row (40) above its box.
        XCTAssertEqual(next["child"]?.position.y, 600 + WidgetSettling.generationGap + widgetTitleRowHeight)
        XCTAssertEqual(pushed, ["child"])
    }

    func testLeavesAFamilyThatAlreadyReadsTopDown() {
        let widgets = boxes([("parent", 0), ("child", 400)])
        let (next, pushed) = floor(widgets, relations(relation("r1", "parent", "child")))
        XCTAssertEqual(next, widgets)
        XCTAssertTrue(pushed.isEmpty)
    }

    func testNeverMovesACardSideways() {
        var widgets = boxes([("parent", 500)])
        widgets["child"] = card("child", 900, 0, width: 200, height: 100)
        let (next, _) = floor(widgets, relations(relation("r1", "parent", "child")))
        XCTAssertEqual(next["child"]?.position.x, 900)
    }

    func testCarriesTheWholeBranchDown() {
        let (next, _) = floor(boxes([("parent", 500), ("child", 0), ("grandchild", 300)]), relations(relation("r1", "parent", "child"), relation("r2", "child", "grandchild")))
        let shift = next["child"]!.position.y
        XCTAssertEqual(next["grandchild"]?.position.y, 300 + shift)
    }

    func testMeasuresAGlueClusterAsOneNode() {
        let (next, _) = floor(
            boxes([("parent", 500), ("top", 0), ("bottom", 112)]),
            relations(relation("r1", "parent", "top")),
            glueIndex: ["top": "g1", "bottom": "g1"]
        )
        XCTAssertEqual(next["bottom"]!.position.y - next["top"]!.position.y, 112, "the weld survives")
        XCTAssertGreaterThanOrEqual(next["top"]!.position.y, 500 + WidgetSettling.generationGap)
    }

    func testHoldsALockedChild() {
        var widgets = boxes([("parent", 500)])
        widgets["child"] = card("child", 0, 0, width: 200, height: 100, locked: true)
        XCTAssertTrue(floor(widgets, relations(relation("r1", "parent", "child"))).1.isEmpty)
    }

    func testIgnoresCrossCanvasLinksAndNonParentRelations() {
        var widgets = boxes([("parent", 500)])
        widgets["child"] = card("child", 0, 0, canvasId: "other")
        XCTAssertTrue(floor(widgets, relations(relation("r1", "parent", "child"))).1.isEmpty)
        let pair = boxes([("a", 500), ("b", 0)])
        XCTAssertTrue(floor(pair, relations(relation("r1", "a", "b", type: "cousin"), relation("r2", "a", "b", type: "blocker"), relation("r3", "a", "b", type: "future-type"))).1.isEmpty)
    }

    func testTerminatesOnAParentCycle() {
        let (next, _) = floor(boxes([("a", 0), ("b", 0)]), relations(relation("r1", "a", "b"), relation("r2", "b", "a")))
        XCTAssertNotNil(next["a"])
    }

    func testSettleWithGenerationFloorClearsWhatThePushLandedOn() {
        // The child drops under its parent, onto a bystander standing there;
        // the pushed child holds and the bystander gives way.
        var widgets = boxes([("parent", 0), ("child", -400)])
        widgets["bystander"] = card("bystander", 0, 240, width: 200, height: 100)
        let settled = WidgetSettling.settleWithGenerationFloor(widgets, activeIds: ["child"], glueIndex: [:], relations: relations(relation("r1", "parent", "child")), measure: .stored)
        let child = settled["child"]!
        XCTAssertEqual(child.position.y, 100 + WidgetSettling.generationGap + widgetTitleRowHeight)
        let bystander = settled["bystander"]!
        let childBox = WorldRect(x: child.position.x, y: child.position.y - widgetTitleRowHeight, width: 200, height: 140)
        let standerBox = WorldRect(x: bystander.position.x, y: bystander.position.y - widgetTitleRowHeight, width: 200, height: 140)
        XCTAssertFalse(childBox.overlaps(standerBox))
    }

    // MARK: - Lane geometry (dragReflow.test.ts)

    private func rect(_ x: Double, _ y: Double, _ w: Double, _ h: Double, _ id: String = "r", locked: Bool = false) -> ReflowRect {
        ReflowRect(id: id, x: x, y: y, width: w, height: h, locked: locked)
    }

    func testTheLaneTakesOnlyCardsInTheBandInAxisOrderNeverLocked() {
        let active = rect(0, 0, 100, 100, "__drag__")
        let lane = DragReflow.buildLane([rect(800, 0, 100, 100, "wall", locked: true), rect(400, 20, 100, 100, "near"), rect(400, 400, 100, 100, "far"), rect(-400, 0, 100, 100, "behind")], active: active, axis: .x)
        XCTAssertEqual(lane.map(\.id), ["behind", "near"])
    }

    func testAClaimNeedsADecisiveCrossing() {
        let lane = [rect(0, 0, 100, 100, "a"), rect(400, 0, 100, 100, "b")]
        let barelyPast = rect(20, 0, 100, 100)
        XCTAssertEqual(DragReflow.claimIndex(lane, active: barelyPast, axis: .x, previous: 0), 0)
        XCTAssertEqual(DragReflow.claimIndex(lane, active: rect(120, 0, 100, 100), axis: .x, previous: 0), 1)
        XCTAssertEqual(DragReflow.claimIndex(lane, active: barelyPast, axis: .x, previous: 1), 1)
        XCTAssertEqual(DragReflow.claimIndex(lane, active: barelyPast, axis: .x, previous: nil), 1)
    }

    func testTheLaneOpensAroundTheDragAndStopsAtTheFirstCardWithRoom() {
        let lane = [rect(0, 0, 100, 100, "a"), rect(200, 0, 100, 100, "b"), rect(2000, 0, 100, 100, "c")]
        let active = rect(90, 0, 100, 100, "__drag__")
        let shifts = DragReflow.laneShifts(lane, index: 1, active: active, axis: .x)
        XCTAssertLessThan(shifts[0], 0)
        XCTAssertGreaterThan(shifts[1], 0)
        XCTAssertEqual(shifts[2], 0)
        XCTAssertTrue(shifts.allSatisfy { $0.truncatingRemainder(dividingBy: grid) == 0 })
        XCTAssertLessThanOrEqual(lane[0].x + lane[0].width + shifts[0], active.x - WidgetSettling.layoutGap)
        XCTAssertGreaterThanOrEqual(lane[1].x + shifts[1], active.x + active.width + WidgetSettling.layoutGap)
        // A pure function of the baseline: withdrawing restores it exactly.
        XCTAssertEqual(DragReflow.laneShifts(lane, index: 1, active: active, axis: .x), shifts)
        XCTAssertEqual(DragReflow.laneShifts(Array(lane.prefix(2)), index: 2, active: rect(4000, 0, 100, 100), axis: .x), [0, 0])
    }

    // MARK: - Baseline and driver (dragReflow.test.ts)

    private let base = 20_000.0

    /// `b` sunk halfway onto `a` from the right (50 % coverage).
    private func overlapPair(locked: Bool = false) -> OrderedMap<Widget> {
        map(card("a", base, base), card("b", base + 80, base, locked: locked))
    }

    private func drive(_ reflow: DragReflow, _ widgets: OrderedMap<Widget>, moving: [String] = ["a"], delta: Vector2D = Vector2D(x: 40, y: 0), at now: Double, glues: OrderedMap<WidgetGlue> = OrderedMap(), glueIndex: [String: String] = [:]) {
        reflow.update(widgets: widgets, glues: glues, glueIndex: glueIndex, movingIds: moving, worldDelta: delta, now: now)
    }

    private let afterEngage = DragReflow.engageMs + 50

    func testTheBaselineExcludesMoversCollapsesClustersAndDropsFarRects() {
        let widgets = map(card("m", base, base), card("a", base + 400, base), card("b", base + 560, base), card("far", base + 40_000, base), card("wall", base, base + 400, locked: true))
        let glues: OrderedMap<WidgetGlue> = ["g1": WidgetGlue(id: "g1", widgetIds: ["a", "b"])]
        let baseline = try! XCTUnwrap(DragReflow.buildBaseline(widgets, glues: glues, glueIndex: ["a": "g1", "b": "g1"], movingIds: ["m"], measure: .stored))
        XCTAssertEqual(baseline.active.width, 160)
        XCTAssertEqual(baseline.neighbours.map(\.id), ["g:g1", "w:wall"])
        XCTAssertEqual(baseline.neighbours[0].ids, ["a", "b"])
        XCTAssertTrue(baseline.neighbours[1].locked)
    }

    func testPublishesNothingUntilMeaningfulOverlapHasHeld() {
        let reflow = DragReflow(measure: .stored)
        reflow.begin()
        drive(reflow, overlapPair(), at: 0)
        XCTAssertTrue(reflow.offsets.isEmpty)
        drive(reflow, overlapPair(), at: DragReflow.engageMs - 20)
        XCTAssertTrue(reflow.offsets.isEmpty)
        drive(reflow, overlapPair(), at: afterEngage)
        XCTAssertEqual(reflow.offsets["b"], Vector2D(x: 120, y: 0), "b clears the drag by the layout gap, on whole cells")
    }

    func testAnOverlappedLockedCardIsPendingNeverAnOffset() {
        let reflow = DragReflow(measure: .stored)
        reflow.begin()
        drive(reflow, overlapPair(locked: true), at: 0)
        drive(reflow, overlapPair(locked: true), at: afterEngage)
        XCTAssertTrue(reflow.offsets.isEmpty)
        XCTAssertTrue(reflow.pendingSettleIds.contains("b"))
        XCTAssertTrue(reflow.end().isEmpty)
    }

    func testEndReturnsOnlyNonZeroOffsetsAndCancelCommitsNothing() {
        let reflow = DragReflow(measure: .stored)
        reflow.begin()
        drive(reflow, overlapPair(), at: 0)
        drive(reflow, overlapPair(), at: afterEngage)
        let commit = reflow.end()
        XCTAssertEqual(commit.keys, ["b"])
        XCTAssertTrue(reflow.offsets.isEmpty)
        XCTAssertTrue(reflow.pendingSettleIds.isEmpty)

        reflow.begin()
        drive(reflow, overlapPair(), at: 0)
        drive(reflow, overlapPair(), at: afterEngage)
        reflow.cancel()
        XCTAssertTrue(reflow.offsets.isEmpty)
        drive(reflow, overlapPair(), at: afterEngage * 2)
        XCTAssertTrue(reflow.offsets.isEmpty, "a fresh gesture never sees stale tracker state")
        XCTAssertFalse(reflow.isActive)
    }

    func testHoldsOneLaneAxisThroughAWobblyDiagonalDrag() {
        let reflow = DragReflow(measure: .stored)
        reflow.begin()
        var now = 0.0
        var axes = Set<String>()
        for frame in 0..<30 {
            now += 40
            drive(reflow, overlapPair(), delta: frame % 2 == 0 ? Vector2D(x: 9, y: 6) : Vector2D(x: 6, y: 9), at: now)
            guard let offset = reflow.offsets["b"], offset != .zero else { continue }
            axes.insert(offset.x != 0 ? "x" : "y")
        }
        XCTAssertEqual(axes.count, 1)
        for _ in 0..<30 {
            now += 40
            drive(reflow, overlapPair(), delta: Vector2D(x: 0, y: 12), at: now)
        }
        let offset = try! XCTUnwrap(reflow.offsets["b"])
        XCTAssertEqual(offset.x, 0)
        XCTAssertGreaterThan(offset.y, 0, "a decisive turn switches the lane")
    }

    func testTheLaneReturnsToBaselineWhenTheDragLeaves() {
        let reflow = DragReflow(measure: .stored)
        var widgets = overlapPair()
        reflow.begin()
        drive(reflow, widgets, at: 0)
        drive(reflow, widgets, at: afterEngage)
        XCTAssertGreaterThan(reflow.offsets["b"]!.x, 0)
        var now = afterEngage
        for _ in 0..<20 {
            widgets["a"]?.position.x += 400
            now += 40
            drive(reflow, widgets, at: now)
        }
        XCTAssertTrue(reflow.offsets.values.allSatisfy { $0 == .zero }, "every ghost parks at exact zero")
        XCTAssertTrue(reflow.end().isEmpty)
    }

    func testACardTheLaneNeverSpokeForIsDimmedNotMoved() {
        // `c` clips the drag's box but shares almost none of its band.
        var widgets = overlapPair()
        widgets["c"] = card("c", base, base + 80 - 4 + widgetTitleRowHeight)
        let reflow = DragReflow(measure: .stored)
        reflow.begin()
        drive(reflow, widgets, at: 0)
        drive(reflow, widgets, at: afterEngage)
        XCTAssertGreaterThan(reflow.offsets["b"]!.x, 0)
        XCTAssertNil(reflow.offsets["c"])
        XCTAssertTrue(reflow.pendingSettleIds.contains("c"))
    }

    // MARK: - The document call sites (owner's rule: only the drop settles)

    private func board(_ cards: Widget...) -> Board {
        var board = makeBoard()
        for card in cards { board.widgets[card.id] = card }
        return board
    }

    func testTheDropIsOneUndoStepAndChildrenLandUnderTheirParent() throws {
        let (document, _, _) = makeDocument(board: board(card("parent", 0, 1200), card("child", 1200, 0)))
        document.addRelation(from: "parent", to: "child", type: .parent)
        XCTAssertEqual(document.widget("child")?.position, Vector2D(x: 1200, y: 0), "drawing a parent line moves nothing")
        let linked = document.board
        document.beginGesture(named: "Move")
        document.moveWidgets(["child"], by: Vector2D(x: 0, y: -40), soloGlued: true)
        document.settleWidgets(["child"])
        document.endGesture()
        XCTAssertGreaterThan(document.widget("child")!.position.y, 1200 + WidgetSettling.generationGap, "the drop lands the child under its parent")
        document.undo()
        XCTAssertEqual(document.board, linked, "the drag and its settle are one step")
    }

    func testTheDropPushesWhatItLandsOn() {
        let (document, _, _) = makeDocument(board: board(card("a", 0, 0), card("b", 400, 0)))
        document.beginGesture(named: "Move")
        document.moveWidgets(["a"], by: Vector2D(x: 320, y: 0))
        document.settleWidgets(["a"])
        document.endGesture()
        XCTAssertEqual(document.widget("a")?.position, Vector2D(x: 320, y: 0))
        XCTAssertEqual(document.widget("b")?.position, Vector2D(x: 520, y: 0), "80 of overlap clears at 120")
    }

    func testNothingButADropPushes() throws {
        let (document, _, _) = makeDocument(board: board(card("a", 0, 0, width: 240, height: 160), card("b", 280, 0, width: 240, height: 160)))
        let id = try XCTUnwrap(document.createWidget(type: "text", at: Vector2D(x: 0, y: 0), title: "New"))
        XCTAssertEqual(document.widget(id)?.position, Vector2D(x: 0, y: 0))
        document.resizeWidget("a", to: Size(width: 400, height: 160))
        document.nudgeWidgets(["b"], by: Vector2D(x: -40, y: 0))
        document.renameWidget("a", title: "A much longer title")
        XCTAssertEqual(document.widget("a")?.position, Vector2D(x: 0, y: 0), "create, resize, nudge and rename push nobody")
        XCTAssertEqual(document.widget("b")?.position, Vector2D(x: 240, y: 0))
    }
}
