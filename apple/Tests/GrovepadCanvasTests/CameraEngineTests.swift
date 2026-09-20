import XCTest
import GrovepadCore
@testable import GrovepadCanvas

final class CameraEngineTests: XCTestCase {
    var scheduler: ManualScheduler!
    var camera: CameraEngine!

    override func setUp() {
        super.setUp()
        scheduler = ManualScheduler()
        camera = CameraEngine(scheduler: scheduler)
        camera.setViewportSize(Size(width: 1000, height: 800))
    }

    func testSetViewClampsZoomAndKeepsPan() {
        camera.setView(Vector2D(x: 10, y: -20), 9)
        XCTAssertEqual(camera.frame.pan, Vector2D(x: 10, y: -20))
        XCTAssertEqual(camera.frame.zoom, CanvasGeometry.zoomMax)
        camera.setView(Vector2D(x: 0, y: 0), 0.01)
        XCTAssertEqual(camera.frame.zoom, CanvasGeometry.zoomMin)
    }

    func testViewportSizeIgnoresCollapsedMeasurements() {
        camera.setViewportSize(Size(width: 0, height: 0))
        XCTAssertEqual(camera.viewportSize, Size(width: 1000, height: 800))
        camera.setViewportSize(Size(width: 640, height: 480))
        XCTAssertEqual(camera.viewportSize, Size(width: 640, height: 480))
    }

    func testPanByAccumulatesAndSkipsZeroDeltas() {
        var commits = 0
        camera.onFrame { _ in commits += 1 }
        camera.panBy(Vector2D(x: 5, y: 7))
        camera.panBy(Vector2D(x: 0, y: 0))
        camera.panBy(Vector2D(x: -1, y: 1))
        XCTAssertEqual(camera.frame.pan, Vector2D(x: 4, y: 8))
        XCTAssertEqual(commits, 2)
    }

    func testZoomAtPointKeepsTheFocalWorldPointStill() {
        camera.setView(Vector2D(x: 100, y: 50), 1)
        let focal = Vector2D(x: 300, y: 200)
        let world = CanvasGeometry.screenToWorld(focal, transform: camera.frame.transform)
        camera.zoomAtPoint(2, focal: focal)
        XCTAssertEqual(camera.frame.zoom, 2)
        let after = CanvasGeometry.worldToScreen(world, transform: camera.frame.transform)
        XCTAssertEqual(after.x, focal.x, accuracy: 1e-9)
        XCTAssertEqual(after.y, focal.y, accuracy: 1e-9)
        // The anchor derives from the clamped zoom: asking for 100 gives 3
        // and the focal point still holds.
        camera.zoomAtPoint(100, focal: focal)
        XCTAssertEqual(camera.frame.zoom, 3)
        let clamped = CanvasGeometry.worldToScreen(world, transform: camera.frame.transform)
        XCTAssertEqual(clamped.x, focal.x, accuracy: 1e-9)
        XCTAssertEqual(clamped.y, focal.y, accuracy: 1e-9)
    }

    func testWorldSinkRunsBeforeListenersOnEveryCommit() {
        var order: [String] = []
        camera.worldTransformSink = { _ in order.append("world") }
        camera.onFrame { _ in order.append("listener") }
        camera.setView(Vector2D(x: 1, y: 1), 1)
        XCTAssertEqual(order, ["world", "listener"])
    }

    func testAnimateToReachesTheTargetExactlyWithAStepClock() {
        camera.setView(Vector2D(x: 0, y: 0), 1)
        var frames = 0
        camera.onFrame { _ in frames += 1 }
        camera.animateTo(Vector2D(x: 400, y: -120), 2.5, duration: 300)
        XCTAssertTrue(camera.isAnimating)
        scheduler.advance(by: 150)
        // Halfway through an ease-out quint the pan is well past halfway and
        // the zoom is between the ends (log-space interpolation).
        XCTAssertGreaterThan(camera.frame.pan.x, 200)
        XCTAssertLessThan(camera.frame.pan.x, 400)
        XCTAssertGreaterThan(camera.frame.zoom, 1)
        XCTAssertLessThan(camera.frame.zoom, 2.5)
        scheduler.advance(by: 300)
        XCTAssertFalse(camera.isAnimating)
        XCTAssertEqual(camera.frame.pan.x, 400, accuracy: 1e-9)
        XCTAssertEqual(camera.frame.pan.y, -120, accuracy: 1e-9)
        XCTAssertEqual(camera.frame.zoom, 2.5, accuracy: 1e-9)
        XCTAssertGreaterThan(frames, 5)
        XCTAssertEqual(scheduler.pendingStepCount, 0)
    }

    func testAnimateToInterpolatesZoomInLogSpace() {
        camera.setView(.zero, 1)
        camera.animateTo(.zero, 2.5, duration: 100)
        // One 10 ms frame into a 100 ms tween: t = 0.1, zoom follows the
        // log-space formula rather than a linear blend (which would be 1.06).
        scheduler.frameMs = 10
        scheduler.advance(by: 10)
        let eased = CameraMotion.easeOutQuint(0.1)
        XCTAssertEqual(camera.frame.zoom, exp(log(1) + (log(2.5) - log(1)) * eased), accuracy: 1e-9)
        XCTAssertNotEqual(camera.frame.zoom, 1 + 1.5 * eased, accuracy: 1e-3)
    }

    func testAnimateToJumpsUnderReducedMotion() {
        camera.reducedMotion = true
        camera.animateTo(Vector2D(x: 50, y: 60), 0.5)
        XCTAssertFalse(camera.isAnimating)
        XCTAssertEqual(camera.frame, CameraFrame(pan: Vector2D(x: 50, y: 60), zoom: 0.5))
        XCTAssertEqual(scheduler.pendingStepCount, 0)
    }

    func testDirectWritesInterruptATween() {
        camera.animateTo(Vector2D(x: 500, y: 0), 1, duration: 300)
        scheduler.advance(by: 50)
        camera.panBy(Vector2D(x: 1, y: 0))
        XCTAssertFalse(camera.isAnimating)
        let held = camera.frame
        scheduler.advance(by: 400)
        XCTAssertEqual(camera.frame, held)
    }

    func testGlideDecaysToAStop() {
        camera.setView(.zero, 1)
        camera.glide(Vector2D(x: 1000, y: 0))
        XCTAssertTrue(camera.isGliding)
        scheduler.advance(by: 100)
        let early = camera.frame.pan.x
        XCTAssertGreaterThan(early, 0)
        scheduler.advance(by: 2000)
        XCTAssertFalse(camera.isGliding)
        XCTAssertGreaterThan(camera.frame.pan.x, early)
        // The total travel of an exponential decay is v * tau: about 220 px
        // here, minus the tail below the stop speed.
        XCTAssertLessThan(camera.frame.pan.x, 1000 * CameraMotion.glideDecayMs / 1000 + 1)
        XCTAssertEqual(scheduler.pendingStepCount, 0)
    }

    func testGlideIgnoresSlowReleasesAndReducedMotion() {
        camera.glide(Vector2D(x: 40, y: 0))
        XCTAssertFalse(camera.isGliding)
        camera.reducedMotion = true
        camera.glide(Vector2D(x: 4000, y: 0))
        XCTAssertFalse(camera.isGliding)
    }

    func testGlideCapsTheFrameDeltaAt64ms() {
        camera.setView(.zero, 1)
        scheduler.frameMs = 500
        camera.glide(Vector2D(x: 1000, y: 0))
        scheduler.tick()
        // One 500 ms frame integrates as 64 ms: 1000 * exp(-64/220) * 0.064.
        let expected = 1000 * exp(-64 / CameraMotion.glideDecayMs) * 64 / 1000
        XCTAssertEqual(camera.frame.pan.x, expected, accuracy: 1e-9)
    }

    func testHistoryBackAndForward() {
        var history: [(Bool, Bool)] = []
        camera.historySink = { history.append(($0, $1)) }
        camera.setView(Vector2D(x: 0, y: 0), 1)
        camera.reducedMotion = true // jumps keep the assertions exact
        camera.animateTo(Vector2D(x: 100, y: 0), 1)
        camera.animateTo(Vector2D(x: 200, y: 0), 1)
        XCTAssertTrue(camera.canGoBack)
        XCTAssertFalse(camera.canGoForward)

        camera.goBack()
        XCTAssertEqual(camera.frame.pan.x, 100)
        XCTAssertTrue(camera.canGoForward)
        camera.goBack()
        XCTAssertEqual(camera.frame.pan.x, 0)
        XCTAssertFalse(camera.canGoBack)
        camera.goBack() // nothing to do
        XCTAssertEqual(camera.frame.pan.x, 0)

        camera.goForward()
        XCTAssertEqual(camera.frame.pan.x, 100)
        camera.goForward()
        XCTAssertEqual(camera.frame.pan.x, 200)
        XCTAssertFalse(camera.canGoForward)
        XCTAssertEqual(history.last?.0, true)
        XCTAssertEqual(history.last?.1, false)

        // A fresh animateTo clears the forward stack.
        camera.goBack()
        camera.animateTo(Vector2D(x: 300, y: 0), 1)
        XCTAssertFalse(camera.canGoForward)
    }

    func testHistoryCapsAtThirtyEntries() {
        camera.reducedMotion = true
        for step in 1...50 {
            camera.animateTo(Vector2D(x: Double(step) * 10, y: 0), 1)
        }
        XCTAssertEqual(camera.historyDepth, CameraMotion.historyLimit)
        var steps = 0
        while camera.canGoBack {
            camera.goBack()
            steps += 1
        }
        XCTAssertEqual(steps, 30)
        // The oldest entries were dropped: the floor is view 20, not 0.
        XCTAssertEqual(camera.frame.pan.x, 200)
    }

    func testHistoryIgnoresANoOpAndDuplicateEntries() {
        camera.reducedMotion = true
        camera.animateTo(Vector2D(x: 0, y: 0), 1) // same as the current view
        XCTAssertEqual(camera.historyDepth, 0)
        camera.animateTo(Vector2D(x: 10, y: 0), 1)
        camera.setView(Vector2D(x: 0, y: 0), 1)
        // The view to record is (0,0) again, identical to the last entry:
        // no duplicate is pushed.
        camera.animateTo(Vector2D(x: 10, y: 0), 1)
        XCTAssertEqual(camera.historyDepth, 1)
    }

    func testFramingFitRectCentresAndCapsZoom() {
        camera.fitRect(rect(0, 0, 100, 100))
        // (1000-240)/100 = 7.6 and (800-240)/100 = 5.6 both exceed 1.45.
        XCTAssertEqual(camera.frame.zoom, 1.45)
        XCTAssertEqual(camera.frame.pan.x, 500 - 50 * 1.45, accuracy: 1e-9)
        XCTAssertEqual(camera.frame.pan.y, 400 - 50 * 1.45, accuracy: 1e-9)
        camera.fitRect(rect(0, 0, 10000, 100))
        XCTAssertEqual(camera.frame.zoom, CanvasGeometry.zoomMin)
        camera.fitRect(rect(100, 100, 2000, 1000), padding: 0)
        XCTAssertEqual(camera.frame.zoom, 0.5)
        XCTAssertEqual(camera.frame.pan.x, 500 - 1100 * 0.5, accuracy: 1e-9)
    }

    func testFitAllHomesTheCamera() {
        camera.reducedMotion = true
        camera.setView(Vector2D(x: 99, y: 99), 2)
        camera.fitAll()
        XCTAssertEqual(camera.frame, .identity)
    }

    func testZoomToAnimatedTargetsTheFocalAnchor() {
        camera.reducedMotion = true
        camera.setView(Vector2D(x: 100, y: 50), 1)
        let focal = Vector2D(x: 300, y: 200)
        let world = CanvasGeometry.screenToWorld(focal, transform: camera.frame.transform)
        camera.zoomToAnimated(2, focal: focal)
        let after = CanvasGeometry.worldToScreen(world, transform: camera.frame.transform)
        XCTAssertEqual(camera.frame.zoom, 2)
        XCTAssertEqual(after.x, focal.x, accuracy: 1e-9)
        XCTAssertEqual(after.y, focal.y, accuracy: 1e-9)
    }

    func testBoundsForWidgetsUnionsFrames() {
        let widgets = [makeWidget(id: "a", x: 0, y: 0, width: 100, height: 50), makeWidget(id: "b", x: 200, y: -30, width: 20, height: 20)]
        XCTAssertEqual(CameraFraming.boundsForWidgets(widgets), rect(0, -30, 220, 80))
        XCTAssertNil(CameraFraming.boundsForWidgets([]))
    }

    /// `fitWidgets` is the port of `frameCanvas('board')`, and `frameCanvas`
    /// pads by 160 and never passes `animated` — so Fit lands at once and
    /// leaves the camera history alone. The port defaulted to `fitRect`'s own
    /// 120 and to an animated tween, which both framed differently AND lit
    /// the back button up after every Fit.
    func testFitWidgetsFramesLikeFrameCanvasBoard() {
        XCTAssertEqual(CameraFraming.framePadding, 160)
        let scheduler = ManualScheduler()
        let camera = CameraEngine(scheduler: scheduler)
        camera.setViewportSize(Size(width: 1280, height: 720))
        let widget = makeWidget(id: "w", x: 0, y: 0, width: 400, height: 300)
        XCTAssertFalse(camera.canGoBack)
        camera.fitWidgets([widget])
        // Immediate, not tweened: the frame is right before any frame ticks.
        let expected = CameraFraming.fit(widget.frame, in: Size(width: 1280, height: 720), padding: 160)
        XCTAssertEqual(camera.frame.zoom, expected.zoom, accuracy: 1e-9)
        XCTAssertEqual(camera.frame.pan.x, expected.pan.x, accuracy: 1e-9)
        XCTAssertEqual(camera.frame.pan.y, expected.pan.y, accuracy: 1e-9)
        XCTAssertFalse(camera.canGoBack, "framing is not a place you go back from")
        // And 160 is a different frame from fitRect's own 120.
        XCTAssertNotEqual(expected.zoom, CameraFraming.fit(widget.frame, in: Size(width: 1280, height: 720), padding: 120).zoom)
    }
}
