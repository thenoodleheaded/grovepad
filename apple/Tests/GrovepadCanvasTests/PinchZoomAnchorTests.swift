import XCTest
import GrovepadCore
@testable import GrovepadCanvas

// ---------------------------------------------------------------------------
// `engine/camera/pinchZoomAnchor.test.ts`.
//
// A pinch has one job beyond changing scale: the world point under the
// fingers stays under the fingers. CameraEngine.commit() clamps the zoom it
// is given but keeps the pan verbatim, so the pan has to be derived from the
// CLAMPED zoom — otherwise, the moment a pinch crosses a zoom limit, the
// board slides away by world * (raw - clamped) and stays there on release.
// ---------------------------------------------------------------------------

final class PinchZoomAnchorTests: XCTestCase {
    // The limits themselves live in CanvasGeometry; ask clampZoom for them so
    // this test cannot drift out of step with the engine it is checking.
    let zoomCeiling = CanvasGeometry.clampZoom(.infinity)
    let zoomFloor = CanvasGeometry.clampZoom(0)

    struct Pinch {
        var frame: CameraFrame
        var anchorOnScreen: Vector2D
        var midpoint: Vector2D
    }

    /// Pinch from `startGap` to `endGap` about a fixed midpoint on a
    /// 1000×800 viewport, and report where the world point that began under
    /// that midpoint ends up on screen.
    func pinchAbout(_ startZoom: Double, _ startGap: Double, _ endGap: Double, midpoint: Vector2D = Vector2D(x: 500, y: 400)) -> Pinch {
        let scheduler = ManualScheduler()
        let camera = CameraEngine(scheduler: scheduler)
        camera.setViewportSize(Size(width: 1000, height: 800))
        let gestures = GestureEngine(camera: camera, timeouts: scheduler)

        camera.setView(.zero, startZoom)
        let start = camera.frame
        let anchorWorld = Vector2D(
            x: (midpoint.x - start.pan.x) / start.zoom,
            y: (midpoint.y - start.pan.y) / start.zoom
        )

        func touch(_ phase: PointerPhase, _ id: Int, _ x: Double) {
            gestures.pointer(PointerEvent(id: id, kind: .touch, phase: phase, point: Vector2D(x: x, y: midpoint.y), timestamp: 0))
        }
        touch(.down, 1, midpoint.x - startGap / 2)
        touch(.down, 2, midpoint.x + startGap / 2)
        touch(.move, 1, midpoint.x - endGap / 2)
        touch(.move, 2, midpoint.x + endGap / 2)

        let frame = camera.frame
        return Pinch(
            frame: frame,
            anchorOnScreen: Vector2D(
                x: frame.pan.x + anchorWorld.x * frame.zoom,
                y: frame.pan.y + anchorWorld.y * frame.zoom
            ),
            midpoint: midpoint
        )
    }

    func testHoldsTheAnchorForAnOrdinaryPinchInsideTheZoomRange() {
        // The control. Without it, refusing to move at all would pass every case.
        let pinch = pinchAbout(1, 100, 150)
        XCTAssertEqual(pinch.frame.zoom, 1.5, accuracy: 1e-5)
        XCTAssertEqual(pinch.anchorOnScreen.x, pinch.midpoint.x, accuracy: 1e-5)
        XCTAssertEqual(pinch.anchorOnScreen.y, pinch.midpoint.y, accuracy: 1e-5)
    }

    func testHoldsItWhenThePinchIsPushedPastTheMaximumZoom() {
        // Spreading to 3x from zoom 2 asks for 6, which the engine caps at 3.
        // Deriving the pan from the uncapped 6 moved the anchor to (-250, -200):
        // every card off-screen, and it stayed there once the fingers lifted.
        let pinch = pinchAbout(2, 100, 300)
        XCTAssertEqual(pinch.frame.zoom, zoomCeiling)
        XCTAssertEqual(pinch.anchorOnScreen.x, pinch.midpoint.x, accuracy: 1e-5)
        XCTAssertEqual(pinch.anchorOnScreen.y, pinch.midpoint.y, accuracy: 1e-5)
    }

    func testHoldsItWhenThePinchIsPushedBelowTheMinimumZoom() {
        let pinch = pinchAbout(0.2, 400, 40)
        XCTAssertEqual(pinch.frame.zoom, zoomFloor)
        XCTAssertEqual(pinch.anchorOnScreen.x, pinch.midpoint.x, accuracy: 1e-5)
        XCTAssertEqual(pinch.anchorOnScreen.y, pinch.midpoint.y, accuracy: 1e-5)
    }
}
