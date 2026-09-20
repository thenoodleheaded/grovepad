import XCTest
import GrovepadCore
@testable import GrovepadCanvas

final class GestureEngineTests: XCTestCase {
    final class Recorder: GestureDelegate {
        var marqueeStarts: [(ActiveGesture, MarqueeMode)] = []
        var marqueeUpdates: [(WorldRect, Int)] = []
        var marqueeFinishes: [(WorldRect, [String], MarqueeMode)] = []
        var zoomRegions: [WorldRect] = []
        var longPresses: [Vector2D] = []
        var panning: [Bool] = []
        var cursors: [CanvasCursor] = []
        var pressBegan = 0

        func gestureMarqueeStarted(kind: ActiveGesture, mode: MarqueeMode) { marqueeStarts.append((kind, mode)) }
        func gestureMarqueeUpdated(screenRect: WorldRect, worldRect: WorldRect, boxedCount: Int) { marqueeUpdates.append((worldRect, boxedCount)) }
        func gestureMarqueeFinished(worldRect: WorldRect, boxedIds: [String], mode: MarqueeMode) { marqueeFinishes.append((worldRect, boxedIds, mode)) }
        func gestureZoomRegionFinished(worldRect: WorldRect) { zoomRegions.append(worldRect) }
        func gestureLongPress(at point: Vector2D) { longPresses.append(point) }
        func gestureIsPanningChanged(_ isPanning: Bool) { panning.append(isPanning) }
        func gestureCursorChanged(_ cursor: CanvasCursor) { cursors.append(cursor) }
        func gestureWillBeginPress() { pressBegan += 1 }
    }

    var scheduler: ManualScheduler!
    var camera: CameraEngine!
    var gestures: GestureEngine!
    var recorder: Recorder!

    override func setUp() {
        super.setUp()
        scheduler = ManualScheduler()
        camera = CameraEngine(scheduler: scheduler)
        camera.setViewportSize(Size(width: 1000, height: 800))
        gestures = GestureEngine(camera: camera, timeouts: scheduler)
        recorder = Recorder()
        gestures.delegate = recorder
    }

    func mouse(_ phase: PointerPhase, _ x: Double, _ y: Double, button: Int = 0, modifiers: PointerModifiers = [], empty: Bool = true, id: Int = 1, t: Double = 0) {
        gestures.pointer(PointerEvent(id: id, kind: .mouse, phase: phase, point: Vector2D(x: x, y: y), button: button, timestamp: t, modifiers: modifiers, isEmptyCanvas: empty))
    }

    func touch(_ phase: PointerPhase, _ id: Int, _ x: Double, _ y: Double, t: Double = 0, empty: Bool = true) {
        gestures.pointer(PointerEvent(id: id, kind: .touch, phase: phase, point: Vector2D(x: x, y: y), timestamp: t, isEmptyCanvas: empty))
    }

    // MARK: Wheel

    func testPlainWheelPansAgainstTheDelta() {
        gestures.wheel(WheelEvent(delta: Vector2D(x: 10, y: -30), point: Vector2D(x: 0, y: 0)))
        XCTAssertEqual(camera.frame.pan, Vector2D(x: -10, y: 30))
        XCTAssertEqual(camera.frame.zoom, 1)
    }

    func testLineModeWheelScalesBySixteen() {
        gestures.wheel(WheelEvent(delta: Vector2D(x: 0, y: 1), lineMode: true, point: .zero))
        XCTAssertEqual(camera.frame.pan, Vector2D(x: 0, y: -16))
    }

    func testCtrlWheelZoomsAtTheCursorWithTheExponentialFactor() {
        camera.setView(Vector2D(x: 100, y: 100), 1)
        let cursor = Vector2D(x: 400, y: 300)
        let world = CanvasGeometry.screenToWorld(cursor, transform: camera.frame.transform)
        gestures.wheel(WheelEvent(delta: Vector2D(x: 0, y: -100), ctrlOrCmd: true, point: cursor))
        XCTAssertEqual(camera.frame.zoom, exp(100 * GestureTuning.wheelZoomFactor), accuracy: 1e-12)
        let after = CanvasGeometry.worldToScreen(world, transform: camera.frame.transform)
        XCTAssertEqual(after.x, cursor.x, accuracy: 1e-9)
        XCTAssertEqual(after.y, cursor.y, accuracy: 1e-9)
    }

    // MARK: Intent table

    func testIntentTable() {
        typealias I = CanvasPointerIntent
        func intent(button: Int = 0, mode: InteractionMode = .navigate, empty: Bool = true, space: Bool = false, z: Bool = false, shift: Bool = false) -> I {
            CanvasGesturePolicy.resolveIntent(button: button, interactionMode: mode, isEmptyCanvas: empty, isSpaceHeld: space, isZHeld: z, isShiftHeld: shift)
        }
        XCTAssertEqual(intent(button: 1, empty: false), .pan)
        XCTAssertEqual(intent(button: 2), .none)
        XCTAssertEqual(intent(empty: false), .none)
        XCTAssertEqual(intent(space: true, z: true, shift: true), .pan)
        XCTAssertEqual(intent(z: true, shift: true), .zoomRegion)
        XCTAssertEqual(intent(shift: true), .select)
        XCTAssertEqual(intent(mode: .select), .select)
        XCTAssertEqual(intent(mode: .navigate), .pan)
        // Connect mode: the press belongs to the wire, so the canvas starts
        // nothing at all. This is the clause the web's final `return 'none'`
        // exists for; without the case a connect-mode drag panned the camera.
        XCTAssertEqual(intent(mode: .connect), .none)
        XCTAssertEqual(intent(mode: .connect, shift: true), .select, "Shift still boxes")
        XCTAssertEqual(intent(mode: .connect, space: true), .pan, "Space still pans")
        XCTAssertEqual(intent(mode: .connect, z: true), .zoomRegion)
        XCTAssertEqual(intent(button: 1, mode: .connect, empty: false), .pan, "the middle button always pans")
        XCTAssertEqual(InteractionMode.allCases.count, 3, "navigate, select, connect — as `adaptiveInput.ts` has it")
        XCTAssertTrue(CanvasGesturePolicy.pressMoved(from: .zero, to: Vector2D(x: 4, y: 0)))
        XCTAssertFalse(CanvasGesturePolicy.pressMoved(from: .zero, to: Vector2D(x: 3.9, y: 3.9)))
    }

    func testMiddleButtonDragPansEvenOverACard() {
        mouse(.down, 100, 100, button: 1, empty: false)
        XCTAssertEqual(gestures.activeGesture, .pan)
        XCTAssertEqual(recorder.panning, [true])
        XCTAssertEqual(recorder.cursors, [.grabbing])
        mouse(.move, 110, 95, button: 1, empty: false)
        XCTAssertEqual(camera.frame.pan, Vector2D(x: 10, y: -5))
        mouse(.up, 110, 95, button: 1, empty: false)
        XCTAssertNil(gestures.activeGesture)
        XCTAssertEqual(recorder.panning, [true, false])
        XCTAssertFalse(camera.isGliding, "a mouse release never flings")
    }

    func testSpaceAndZChangeTheCursorAndTheIntent() {
        gestures.keyDown(.space)
        XCTAssertEqual(recorder.cursors.last, .grab)
        gestures.interactionMode = .select
        mouse(.down, 10, 10)
        XCTAssertEqual(gestures.activeGesture, .pan, "space wins over select mode")
        mouse(.up, 10, 10)
        gestures.keyUp(.space)
        gestures.keyDown(.z)
        XCTAssertEqual(recorder.cursors.last, .zoomIn)
        mouse(.down, 10, 10)
        XCTAssertEqual(gestures.activeGesture, .zoomRegion)
        mouse(.up, 10, 10)
        gestures.windowBlur()
        XCTAssertFalse(gestures.isZPressed)
        XCTAssertEqual(recorder.cursors.last, .standard)
    }

    // MARK: Marquee

    func testMarqueeNeedsTheDragThresholdAndFixesItsModeAtPointerDown() {
        let widget = makeWidget(id: "w", x: 50, y: 50, width: 100, height: 100)
        gestures.marqueeHitTest = { rect in marqueeBoxedIds(in: rect, widgets: [widget], canvasId: "canvas", footprint: { $0.frame }) }
        mouse(.down, 0, 0, modifiers: [.shift])
        XCTAssertEqual(recorder.pressBegan, 1)
        mouse(.move, 3, 3, modifiers: [.shift])
        XCTAssertTrue(recorder.marqueeStarts.isEmpty, "under the 4 px threshold nothing starts")
        mouse(.move, 60, 60) // shift released mid-drag
        XCTAssertEqual(recorder.marqueeStarts.count, 1)
        XCTAssertEqual(recorder.marqueeStarts[0].1, .add)
        XCTAssertEqual(recorder.marqueeUpdates.last?.1, 1)
        mouse(.up, 60, 60)
        XCTAssertEqual(recorder.marqueeFinishes.count, 1)
        XCTAssertEqual(recorder.marqueeFinishes[0].1, ["w"])
        XCTAssertEqual(recorder.marqueeFinishes[0].2, .add, "the mode read at pointerdown sticks")
        XCTAssertEqual(recorder.marqueeFinishes[0].0, rect(0, 0, 60, 60))
    }

    func testAClickWithoutADragFinishesNoMarquee() {
        gestures.interactionMode = .select
        mouse(.down, 0, 0)
        mouse(.up, 1, 1)
        XCTAssertTrue(recorder.marqueeFinishes.isEmpty)
        XCTAssertNil(gestures.activeGesture)
    }

    func testMarqueeRectIsInWorldUnitsUnderZoom() {
        camera.setView(Vector2D(x: 100, y: 100), 2)
        gestures.interactionMode = .select
        mouse(.down, 100, 100)
        mouse(.move, 300, 200)
        mouse(.up, 300, 200)
        XCTAssertEqual(recorder.marqueeFinishes[0].0, rect(0, 0, 100, 50))
    }

    func testZoomRegionFitsTheCameraToTheBox() {
        gestures.keyDown(.z)
        mouse(.down, 100, 100)
        mouse(.move, 300, 300)
        mouse(.up, 300, 300)
        XCTAssertEqual(recorder.zoomRegions, [rect(100, 100, 200, 200)])
        let expected = CameraFraming.fit(rect(100, 100, 200, 200), in: Size(width: 1000, height: 800), padding: GestureTuning.zoomRegionPadding)
        XCTAssertEqual(camera.frame, expected)
    }

    // MARK: Touch

    func testOneFingerPansInNavigateModeAndFlingsOnRelease() {
        touch(.down, 1, 100, 100, t: 0)
        for step in 1...6 {
            touch(.move, 1, 100 + Double(step) * 40, 100, t: Double(step) * 16)
        }
        XCTAssertEqual(camera.frame.pan, Vector2D(x: 240, y: 0))
        touch(.up, 1, 340, 100, t: 96)
        XCTAssertTrue(camera.isGliding, "a touch release with recent motion flings")
        XCTAssertNil(gestures.activeGesture)
        scheduler.advance(by: 3000)
        XCTAssertGreaterThan(camera.frame.pan.x, 240)
    }

    func testAFingerThatPausedBeforeLiftingDoesNotFling() {
        touch(.down, 1, 100, 100, t: 0)
        touch(.move, 1, 400, 100, t: 40)
        // The release sample is recorded first, so a 300 ms pause reads as
        // zero recent velocity.
        touch(.up, 1, 400, 100, t: 400)
        XCTAssertFalse(camera.isGliding)
    }

    func testOneFingerInSelectModeStartsAMarqueeNotAPan() {
        gestures.interactionMode = .select
        touch(.down, 1, 100, 100)
        XCTAssertEqual(gestures.activeGesture, .select)
        touch(.move, 1, 200, 200)
        touch(.up, 1, 200, 200)
        XCTAssertEqual(recorder.marqueeFinishes.count, 1)
        XCTAssertEqual(camera.frame.pan, .zero)
    }

    func testLongPressOpensTheContextMenuWhenTheFingerStaysStill() {
        touch(.down, 1, 120, 130, t: 0)
        touch(.move, 1, 124, 130, t: 100) // inside the 8 px slop
        scheduler.advance(by: GestureTuning.longPressMs)
        XCTAssertEqual(recorder.longPresses, [Vector2D(x: 120, y: 130)])
        XCTAssertNil(gestures.activeGesture, "the press is consumed by the menu")
        XCTAssertEqual(recorder.panning.last, false)
        touch(.up, 1, 124, 130, t: 600)
        XCTAssertFalse(camera.isGliding)
    }

    func testLongPressIsCancelledByMovementASecondFingerOrSelectMode() {
        touch(.down, 1, 120, 130, t: 0)
        touch(.move, 1, 140, 130, t: 50)
        scheduler.advance(by: 600)
        XCTAssertTrue(recorder.longPresses.isEmpty, "moved past the slop")
        touch(.up, 1, 140, 130, t: 700)

        touch(.down, 1, 120, 130, t: 800)
        touch(.down, 2, 220, 130, t: 810)
        scheduler.advance(by: 600)
        XCTAssertTrue(recorder.longPresses.isEmpty, "a second finger means a pinch")
        touch(.up, 1, 120, 130, t: 1500)
        touch(.up, 2, 220, 130, t: 1500)

        gestures.interactionMode = .select
        touch(.down, 1, 120, 130, t: 1600)
        XCTAssertEqual(scheduler.pendingTimeoutCount, 0, "select mode arms no long press")
        touch(.up, 1, 120, 130, t: 1700)
    }

    func testTwoFingersPinchAndOneLiftedFingerContinuesAsAPan() {
        touch(.down, 1, 400, 400, t: 0)
        touch(.down, 2, 600, 400, t: 0)
        XCTAssertEqual(gestures.activeGesture, .pinch)
        XCTAssertEqual(recorder.panning, [true])
        touch(.move, 1, 300, 400, t: 16)
        touch(.move, 2, 700, 400, t: 16)
        XCTAssertEqual(camera.frame.zoom, 2, accuracy: 1e-9)
        // Lift finger 2: finger 1 keeps panning from where it is.
        touch(.up, 2, 700, 400, t: 32)
        XCTAssertEqual(gestures.activeGesture, .pan)
        let before = camera.frame.pan
        touch(.move, 1, 310, 420, t: 48)
        XCTAssertEqual(camera.frame.pan, Vector2D(x: before.x + 10, y: before.y + 20))
        XCTAssertEqual(camera.frame.zoom, 2, accuracy: 1e-9)
        touch(.up, 1, 310, 420, t: 60)
        XCTAssertNil(gestures.activeGesture)
        XCTAssertEqual(recorder.panning.last, false)
    }

    func testPointerCancelEndsAPanWithoutAFling() {
        touch(.down, 1, 100, 100, t: 0)
        touch(.move, 1, 300, 100, t: 16)
        touch(.cancel, 1, 300, 100, t: 32)
        XCTAssertNil(gestures.activeGesture)
        XCTAssertFalse(camera.isGliding)
    }

    func testAPressOnACardInNavigateModeIsNotACanvasGesture() {
        mouse(.down, 10, 10, empty: false)
        XCTAssertNil(gestures.activeGesture)
        XCTAssertEqual(recorder.pressBegan, 0)
        touch(.down, 1, 10, 10, empty: false)
        XCTAssertNil(gestures.activeGesture)
        XCTAssertEqual(scheduler.pendingTimeoutCount, 0, "no long press over a card")
    }
}
