import XCTest
import GrovepadCore
@testable import GrovepadCanvas

// ---------------------------------------------------------------------------
// `engine/camera/marqueeRestingFootprint.test.ts`.
//
// A marquee must box what the user can see. A resting card is drawn as a
// small icon tile, while its stored `size` keeps the full-card dimensions it
// will wear once it has content — so hit-testing the stored box selected
// cards from a patch of canvas that looks completely empty.
// ---------------------------------------------------------------------------

final class MarqueeRestingFootprintTests: XCTestCase {
    final class Recorder: GestureDelegate {
        var selected: [String] = []
        var selection: [String] = []
        func gestureMarqueeFinished(worldRect: WorldRect, boxedIds: [String], mode: MarqueeMode) {
            selection = mergeMarqueeSelection(current: selection, boxed: boxedIds, mode: mode)
            selected = selection
        }
    }

    /// Shift-drag a marquee between two WORLD points and report what it
    /// selected. The camera is parked so world and viewport coordinates
    /// differ by a constant, which keeps the boxed rect exactly where the
    /// caller asked for it.
    func marqueeOver(from: Vector2D, to: Vector2D, origin: Double, widgets: [Widget], rest: RestContext) -> [String] {
        let scheduler = ManualScheduler()
        let camera = CameraEngine(scheduler: scheduler)
        camera.setViewportSize(Size(width: 1000, height: 800))
        let gestures = GestureEngine(camera: camera, timeouts: scheduler)
        let recorder = Recorder()
        gestures.delegate = recorder
        gestures.marqueeHitTest = { rect in
            marqueeBoxedIds(in: rect, widgets: widgets, canvasId: "canvas", footprint: rest.restingFootprint)
        }
        camera.setView(Vector2D(x: -origin, y: -origin), 1)

        func point(_ phase: PointerPhase, _ world: Vector2D) {
            gestures.pointer(PointerEvent(
                id: 7, kind: .mouse, phase: phase,
                point: Vector2D(x: world.x - origin, y: world.y - origin),
                timestamp: 0, modifiers: [.shift]
            ))
        }
        point(.down, from)
        point(.move, to)
        point(.up, to)
        return recorder.selected
    }

    func testIgnoresARestingCardWhoseIconTileTheBoxNeverTouched() {
        // Far from the seed board so nothing else can land inside the box.
        let ox = 500_000.0
        let widget = makeWidget(id: "resting", x: ox, y: ox, width: 400, height: 280)
        let rest = tileRestContext()

        // The premise: this card is drawn much smaller than its stored box.
        let drawn = rest.restingFootprint(widget)
        XCTAssertLessThan(drawn.width, 400)
        XCTAssertLessThan(drawn.height, 280)

        // A box wholly inside the stored 400x280 rect but clear of the drawn tile.
        let selected = marqueeOver(
            from: Vector2D(x: ox + 320, y: ox + 200),
            to: Vector2D(x: ox + 390, y: ox + 270),
            origin: ox, widgets: [widget], rest: rest
        )
        XCTAssertFalse(selected.contains("resting"))
    }

    func testStillBoxesTheCardWhenTheMarqueeCrossesTheTileItDraws() {
        // The control: without it, selecting nothing at all would pass above.
        let ox = 600_000.0
        let widget = makeWidget(id: "resting", x: ox, y: ox, width: 400, height: 280)
        let selected = marqueeOver(
            from: Vector2D(x: ox - 20, y: ox - 20),
            to: Vector2D(x: ox + 40, y: ox + 40),
            origin: ox, widgets: [widget], rest: tileRestContext()
        )
        XCTAssertTrue(selected.contains("resting"))
    }

    func testMarqueeModesMergeLikeTheWeb() {
        XCTAssertEqual(marqueeModeFor(shift: false, alt: false), .replace)
        XCTAssertEqual(marqueeModeFor(shift: true, alt: false), .add)
        XCTAssertEqual(marqueeModeFor(shift: true, alt: true), .subtract)
        XCTAssertEqual(mergeMarqueeSelection(current: ["a", "b"], boxed: ["c", "c"], mode: .replace), ["c"])
        XCTAssertEqual(mergeMarqueeSelection(current: ["a", "b"], boxed: ["b", "c"], mode: .add), ["a", "b", "c"])
        XCTAssertEqual(mergeMarqueeSelection(current: ["a", "b"], boxed: ["b"], mode: .subtract), ["a"])
    }

    func testHitTestUsesStrictOverlap() {
        // Edge-touching boxes do not select (gestureEngine.ts `intersects`).
        let widget = makeWidget(id: "w", x: 100, y: 100, width: 80, height: 80)
        let touching = marqueeBoxedIds(in: rect(0, 0, 100, 100), widgets: [widget], canvasId: "canvas", footprint: { $0.frame })
        XCTAssertEqual(touching, [])
        let crossing = marqueeBoxedIds(in: rect(0, 0, 101, 101), widgets: [widget], canvasId: "canvas", footprint: { $0.frame })
        XCTAssertEqual(crossing, ["w"])
        let otherCanvas = marqueeBoxedIds(in: rect(0, 0, 500, 500), widgets: [widget], canvasId: "elsewhere", footprint: { $0.frame })
        XCTAssertEqual(otherCanvas, [])
    }
}
