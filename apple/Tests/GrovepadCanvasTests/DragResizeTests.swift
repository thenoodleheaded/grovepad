import XCTest
import GrovepadCore
@testable import GrovepadCanvas

final class DragResizeTests: XCTestCase {
    func testDragDeltaIsScreenDeltaOverZoom() {
        let w = makeWidget(id: "w", x: 100, y: 100)
        let moved = DragResize.moved(w, by: Vector2D(x: 10, y: -20), zoom: 0.5)
        XCTAssertEqual(moved.position, Vector2D(x: 120, y: 60))
        XCTAssertEqual(DragResize.moved(w, by: Vector2D(x: 10, y: 0), zoom: 0).position.x, 110, "a zero zoom reads as 1")
    }

    func testGridSnapOnRelease() {
        let w = makeWidget(id: "w", x: 117, y: 63)
        XCTAssertEqual(DragResize.snappedToGrid(w).position, Vector2D(x: 120, y: 80))
        let already = makeWidget(id: "w", x: 40, y: 80)
        XCTAssertEqual(DragResize.snappedToGrid(already), already)
    }

    func testLockedWidgetsNeverMoveOrResize() {
        let w = makeWidget(id: "w", x: 100, y: 100, locked: true)
        XCTAssertEqual(DragResize.moved(w, by: Vector2D(x: 50, y: 50), zoom: 1), w)
        XCTAssertEqual(DragResize.snappedToGrid(makeWidget(id: "w", x: 101, y: 101, locked: true)).position, Vector2D(x: 101, y: 101))
        XCTAssertEqual(DragResize.resized(w, to: Size(width: 900, height: 900), snap: true, rules: .defaults), w)
        XCTAssertEqual(DragResize.resizedFromEdge(w, to: Size(width: 900, height: 900), edge: .topLeft, snap: true, rules: .defaults), w)
    }

    func testAnIconScalesFreelyWhileHeldAndSettlesOnTheNearestCellWhenLetGo() {
        let icon = makeWidget(id: "i", x: 100, y: 100, width: 80, height: 80, iconified: true)
        XCTAssertEqual(DragResize.resized(icon, to: Size(width: 110, height: 60), snap: false, rules: .defaults), icon, "a plain size request never reshapes it")
        let held = DragResize.resizedFromEdge(icon, to: Size(width: 103, height: 103), edge: .bottomRight, snap: false, rules: .defaults)
        XCTAssertEqual(held.size, Size(width: 103, height: 103), "held: exactly the pull, still a square")
        XCTAssertEqual(held.position, icon.position)
        XCTAssertEqual(held.iconified, true, "the same state at every size")
        XCTAssertEqual(DragResize.resizedFromEdge(icon, to: Size(width: 103, height: 103), edge: .bottomRight, snap: true, rules: .defaults).size, Size(width: 120, height: 120))
        XCTAssertEqual(DragResize.resizedFromEdge(icon, to: Size(width: 95, height: 95), edge: .bottomRight, snap: true, rules: .defaults).size, Size(width: 80, height: 80))
        XCTAssertEqual(DragResize.resizedFromEdge(icon, to: Size(width: 900, height: 900), edge: .bottomRight, snap: false, rules: .defaults).size, Size(width: 120, height: 120), "never past 3×3")
        XCTAssertEqual(DragResize.resizedFromEdge(icon, to: Size(width: 10, height: 10), edge: .bottomRight, snap: false, rules: .defaults).size, Size(width: 80, height: 80), "never under 2×2")
        let fromTopLeft = DragResize.resizedFromEdge(icon, to: Size(width: 120, height: 120), edge: .topLeft, snap: true, rules: .defaults)
        XCTAssertEqual(fromTopLeft.position, Vector2D(x: 60, y: 60), "the pinned corner holds")
    }

    func testClampFullSizeHonoursRulesDataFloorsAndTheAbsoluteCeiling() {
        XCTAssertEqual(DragResize.clampFullSize(Size(width: 10, height: 10), rules: .defaults), Size(width: 200, height: 120))
        XCTAssertEqual(DragResize.clampFullSize(Size(width: 5000, height: 5000), rules: .defaults), Size(width: 1280, height: 1280))
        let typed = SizingRules(minWidth: 240, minHeight: 160, maxWidth: 480, maxHeight: 320)
        XCTAssertEqual(DragResize.clampFullSize(Size(width: 100, height: 900), rules: typed), Size(width: 240, height: 320))
        // A content floor raises the minimum...
        XCTAssertEqual(DragResize.clampFullSize(Size(width: 100, height: 100), rules: typed, dataHeight: 400).height, 400)
        // ...but never past the absolute ceiling.
        XCTAssertEqual(DragResize.clampFullSize(Size(width: 100, height: 100), rules: typed, dataHeight: 4000).height, 1280)
        // autoHeight lifts the per-type ceiling, never the absolute one.
        let auto = SizingRules(minWidth: 240, minHeight: 160, autoHeight: true)
        XCTAssertEqual(DragResize.clampFullSize(Size(width: 300, height: 3000), rules: auto).height, 1280)
        let autoCapped = SizingRules(minWidth: 240, minHeight: 160, maxHeight: 600, autoHeight: true)
        XCTAssertEqual(DragResize.clampFullSize(Size(width: 300, height: 3000), rules: autoCapped).height, 600)
    }

    func testMergeTightensAndNeverLoosens() {
        let fallback = SizingRules(minWidth: 200, minHeight: 120, maxWidth: 800, maxHeight: 600)
        let live = SizingRules(minWidth: 260, minHeight: 100, maxWidth: 1000, maxHeight: 400)
        let merged = SizingRules.merge(fallback: fallback, live: live)
        XCTAssertEqual(merged.minWidth, 260)
        XCTAssertEqual(merged.minHeight, 120)
        XCTAssertEqual(merged.maxWidth, 800)
        XCTAssertEqual(merged.maxHeight, 400)
    }

    /// `mergeWidgetSizing` ends with `autoHeight: fallback?.autoHeight`,
    /// placed AFTER the `...live` spread: only the registry decides whether a
    /// type is content-fit. A measured card must not be able to switch it on,
    /// because `autoHeight` is what lifts the per-type height ceiling — a
    /// live measurement turning it on loosens exactly the window this
    /// function exists to tighten.
    func testMergeTakesAutoHeightFromTheRegistryAlone() {
        let registrySaysNo = SizingRules(minWidth: 200, minHeight: 120, maxHeight: 520, autoHeight: false)
        let liveSaysYes = SizingRules(minHeight: 200, autoHeight: true)
        XCTAssertFalse(SizingRules.merge(fallback: registrySaysNo, live: liveSaysYes).autoHeight)

        let registrySaysYes = SizingRules(minWidth: 200, minHeight: 120, autoHeight: true)
        let liveSaysNothing = SizingRules(maxHeight: 300)
        XCTAssertTrue(
            SizingRules.merge(fallback: registrySaysYes, live: liveSaysNothing).autoHeight,
            "a live measurement that says nothing cannot switch it off either"
        )
        XCTAssertFalse(SizingRules.merge(fallback: nil, live: liveSaysYes).autoHeight, "no registry entry, no autoHeight")
    }

    func testFullResizeSnapsToGridAndClampsOnRelease() {
        let w = makeWidget(id: "w", x: 0, y: 0, width: 240, height: 160)
        let live = DragResize.resized(w, to: Size(width: 257, height: 173), snap: false, rules: .defaults)
        XCTAssertEqual(live.size, Size(width: 257, height: 173))
        let released = DragResize.resized(live, to: Size(width: 257, height: 173), snap: true, rules: .defaults)
        XCTAssertEqual(released.size, Size(width: 240, height: 160))
        let tiny = DragResize.resized(w, to: Size(width: 1, height: 1), snap: true, rules: .defaults)
        XCTAssertEqual(tiny.size, Size(width: 200, height: 120))
    }

    func testResizeFromEdgeKeepsTheOppositeSidesPinned() {
        let w = makeWidget(id: "w", x: 100, y: 100, width: 240, height: 160)
        let fromLeft = DragResize.resizedFromEdge(w, to: Size(width: 320, height: 160), edge: .left, snap: false, rules: .defaults)
        XCTAssertEqual(fromLeft.position, Vector2D(x: 20, y: 100), "growing from the left walks the origin left")
        XCTAssertEqual(fromLeft.frame.maxX, 340, "the right side is pinned")
        let fromTopLeft = DragResize.resizedFromEdge(w, to: Size(width: 320, height: 200), edge: .topLeft, snap: false, rules: .defaults)
        XCTAssertEqual(fromTopLeft.position, Vector2D(x: 20, y: 60))
        XCTAssertEqual(fromTopLeft.frame.maxX, 340)
        XCTAssertEqual(fromTopLeft.frame.maxY, 260)
        let fromRight = DragResize.resizedFromEdge(w, to: Size(width: 320, height: 200), edge: .bottomRight, snap: false, rules: .defaults)
        XCTAssertEqual(fromRight.position, w.position, "growing from the right leaves the origin alone")
        XCTAssertEqual(DragResize.anchoredOrigin(Vector2D(x: 10, y: 10), from: Size(width: 100, height: 100), to: Size(width: 60, height: 80), edge: .top), Vector2D(x: 10, y: 30))
    }

    func testIntendedSizeFollowsTheGrabbedSidesInWorldUnits() {
        let start = Size(width: 240, height: 160)
        XCTAssertEqual(DragResize.intendedSize(start: start, edge: .right, screenDelta: Vector2D(x: 40, y: 40), zoom: 2), Size(width: 260, height: 160))
        XCTAssertEqual(DragResize.intendedSize(start: start, edge: .left, screenDelta: Vector2D(x: -40, y: 0), zoom: 1), Size(width: 280, height: 160))
        XCTAssertEqual(DragResize.intendedSize(start: start, edge: .topLeft, screenDelta: Vector2D(x: -10, y: -10), zoom: 1), Size(width: 250, height: 170))
    }

    func testRubberBandOvershootsAndClampsBack() {
        XCTAssertEqual(DragResize.elasticOvershoot(0), 0)
        XCTAssertLessThan(DragResize.elasticOvershoot(1000, limit: 36), 36)
        XCTAssertGreaterThan(DragResize.elasticOvershoot(10, limit: 36), 0)
        XCTAssertEqual(DragResize.rubberBand(150, lower: 100, upper: 200), 150)
        let past = DragResize.rubberBand(260, lower: 100, upper: 200)
        XCTAssertGreaterThan(past, 200)
        XCTAssertLessThan(past, 200 + DragResize.elasticLimit)
        let under = DragResize.rubberBand(40, lower: 100, upper: 200)
        XCTAssertLessThan(under, 100)
        XCTAssertGreaterThan(under, 100 - DragResize.elasticLimit)
        XCTAssertEqual(DragResize.clampBack(past, lower: 100, upper: 200), 200)
        XCTAssertEqual(DragResize.clampBack(under, lower: 100, upper: 200), 100)
    }
}
