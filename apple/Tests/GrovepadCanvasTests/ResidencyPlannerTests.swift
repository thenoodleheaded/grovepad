import XCTest
import GrovepadCore
@testable import GrovepadCanvas

final class ResidencyPlannerTests: XCTestCase {
    func widget(_ id: String, _ x: Double, _ y: Double) -> Widget {
        makeWidget(id: id, x: x, y: y, width: 240, height: 160)
    }

    // MARK: Viewport geometry (used to pick which tiles to sharpen)

    func testConvertsTheScreenViewportAndAGutterIntoWorldSpace() {
        let camera = CameraViewport(pan: Vector2D(x: 100, y: -50), zoom: 0.5, viewportSize: Size(width: 800, height: 600))
        XCTAssertEqual(worldRectForViewport(camera, screenPadding: 50), rect(-300, 0, 1800, 1400))
    }

    // MARK: Displayed rect and rest context

    func testDisplayedRectUsesTheTileWhileRestingAndTheCardWhileExpanded() {
        let w = makeWidget(id: "w", x: 100, y: 100, width: 400, height: 280)
        XCTAssertEqual(displayedWidgetRect(w, restContext: tileRestContext()), rect(100, 100, 80, 80))
        let expanded = tileRestContext(expandedWidgetId: "w", expandedOffset: Vector2D(x: -160, y: -100))
        XCTAssertEqual(displayedWidgetRect(w, restContext: expanded), rect(-60, 0, 400, 280))
        XCTAssertEqual(displayedWidgetRect(w, restContext: .none), rect(100, 100, 400, 280))
    }

    func testIconsAndPinnedCardsNeverRest() {
        let icon = makeWidget(id: "i", x: 0, y: 0, width: 80, height: 80, iconified: true)
        let pinned = makeWidget(id: "p", x: 0, y: 0, width: 300, height: 200, pinned: true)
        let rest = tileRestContext(edge: 40)
        XCTAssertFalse(rest.isResting(icon))
        XCTAssertFalse(rest.isResting(pinned))
        XCTAssertEqual(rest.restingFootprint(pinned), rect(0, 0, 300, 200))
        // A peeked icon opens at its parked expanded size.
        var peek = icon
        peek.expandedSize = Size(width: 320, height: 240)
        let peeking = tileRestContext(edge: 40, expandedWidgetId: "i")
        XCTAssertTrue(peeking.isRestExpanded(peek))
        XCTAssertEqual(peeking.effectiveSize(peek), Size(width: 320, height: 240))
    }

    // MARK: Controller (no window, no level of detail)

    func makeController(count: Int = 30) -> ResidencyController {
        let controller = ResidencyController(restContext: .none)
        var widgets: [Widget] = []
        for index in 0..<count {
            let column = index % 6
            let row = index / 6
            widgets.append(widget("w\(index)", Double(column) * 300, Double(row) * 240))
        }
        controller.setWidgets(widgets)
        return controller
    }

    func testEveryCardIsPlannedInBoardOrderWhereverTheCameraIs() {
        let controller = makeController(count: 200)
        controller.replan()
        let plan = controller.plan!
        XCTAssertEqual(plan.orderedIds, (0..<200).map { "w\($0)" }, "every card, in paint order — nothing culled")
        XCTAssertTrue(plan.tiers.values.allSatisfy { $0 == .resting })
    }

    func testTiersFollowUrgencyOnly() {
        let controller = makeController()
        controller.urgentIds = ["w3"]
        controller.replan()
        XCTAssertEqual(controller.tier(of: "w3"), .live)
        XCTAssertEqual(controller.tier(of: "w0"), .resting)
        controller.urgentIds = ["w3", "w4"]
        let diff = controller.replan()
        XCTAssertEqual(diff.entered(.live), ["w4"])
        XCTAssertEqual(diff.left(.resting), ["w4"])
        XCTAssertEqual(ResidencyTier.allCases, [.live, .resting], "no far tier")
    }

    func testDiffReportsEnterAndLeavePerTier() {
        let controller = makeController(count: 4)
        let first = controller.replan()
        XCTAssertEqual(Set(first.entered(.resting)), ["w0", "w1", "w2", "w3"])
        XCTAssertTrue(first.left.isEmpty)
        XCTAssertTrue(controller.replan().isEmpty, "an unchanged board moves nothing")
        // The canvas empties (another canvas shown): everything leaves.
        controller.setWidgets([])
        let second = controller.replan()
        XCTAssertEqual(Set(second.left(.resting)), ["w0", "w1", "w2", "w3"])
        XCTAssertTrue(second.entered.values.allSatisfy(\.isEmpty))
        XCTAssertTrue(controller.tiers.isEmpty)
    }
}
