import XCTest
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadApp

/// UITouch → PointerEvent as data: a Pencil is a pen, a finger a touch, an
/// indirect pointer a mouse; two fingers pinch through the engine on a
/// phone-sized viewport with the world point under the midpoint pinned.
final class TouchTranslationTests: XCTestCase {
    func testContactKindsMapOntoTheEnginesPointerKinds() {
        XCTAssertEqual(TouchPointerTranslation.kind(for: .finger), .touch)
        XCTAssertEqual(TouchPointerTranslation.kind(for: .pencil), .pen)
        XCTAssertEqual(TouchPointerTranslation.kind(for: .indirectPointer), .mouse)
        let event = TouchPointerTranslation.event(id: 3, contact: .pencil, phase: .move, point: Vector2D(x: 10, y: 20), timestampSeconds: 1.5, isEmptyCanvas: false)
        XCTAssertEqual(event.id, 3)
        XCTAssertEqual(event.kind, .pen)
        XCTAssertEqual(event.timestamp, 1500)
        XCTAssertEqual(event.button, 0)
        XCTAssertFalse(event.isEmptyCanvas)
    }

    func testContactTableMintsOneIdPerLiveContact() {
        var table = TouchPointerTranslation.ContactTable()
        let a = NSObject(), b = NSObject()
        XCTAssertEqual(table.id(for: a), 1)
        XCTAssertEqual(table.id(for: b), 2)
        XCTAssertEqual(table.id(for: a), 1, "a live contact keeps its id")
        XCTAssertEqual(table.liveCount, 2)
        XCTAssertEqual(table.release(a), 1)
        XCTAssertNil(table.release(a))
        XCTAssertEqual(table.id(for: NSObject()), 3, "released ids are never reused while a contact is down")
    }

    func testAPencilNeverEntersThePinchOrFlingPath() {
        let scheduler = ManualScheduler()
        let camera = CameraEngine(scheduler: scheduler)
        camera.setViewportSize(Size(width: 390, height: 844))
        let engine = GestureEngine(camera: camera, timeouts: scheduler)
        // A pen plus a finger: no pinch, because the pen is not in the touch table.
        engine.pointer(TouchPointerTranslation.event(id: 1, contact: .pencil, phase: .down, point: Vector2D(x: 100, y: 400), timestampSeconds: 0))
        engine.pointer(TouchPointerTranslation.event(id: 2, contact: .finger, phase: .down, point: Vector2D(x: 300, y: 400), timestampSeconds: 0))
        XCTAssertNotEqual(engine.activeGesture, .pinch)
        engine.pointer(TouchPointerTranslation.event(id: 1, contact: .pencil, phase: .move, point: Vector2D(x: 140, y: 400), timestampSeconds: 0.05))
        XCTAssertEqual(camera.frame.zoom, 1, "the pen's travel never scaled the camera")
        // A pen on empty canvas pans like a mouse drag would.
        XCTAssertEqual(camera.frame.pan.x, 40, accuracy: 0.001)
        engine.pointer(TouchPointerTranslation.event(id: 1, contact: .pencil, phase: .up, point: Vector2D(x: 140, y: 400), timestampSeconds: 0.1))
        XCTAssertFalse(camera.isGliding, "a pen release never flings")
    }

    func testTwoFingersPinchThroughTheEngineOnAPhoneViewport() {
        let scheduler = ManualScheduler()
        let camera = CameraEngine(scheduler: scheduler)
        camera.setViewportSize(Size(width: 390, height: 844))
        camera.setView(Vector2D(x: -50, y: 30), 1)
        let engine = GestureEngine(camera: camera, timeouts: scheduler)
        let midpoint = Vector2D(x: 195, y: 422)
        let anchorWorld = CanvasGeometry.screenToWorld(midpoint, transform: camera.frame.transform)

        func finger(_ id: Int, _ phase: PointerPhase, _ x: Double, at t: Double) {
            engine.pointer(TouchPointerTranslation.event(id: id, contact: .finger, phase: phase, point: Vector2D(x: x, y: midpoint.y), timestampSeconds: t))
        }
        finger(1, .down, midpoint.x - 50, at: 0)
        finger(2, .down, midpoint.x + 50, at: 0.01)
        XCTAssertEqual(engine.activeGesture, .pinch)
        finger(1, .move, midpoint.x - 100, at: 0.05)
        finger(2, .move, midpoint.x + 100, at: 0.05)
        XCTAssertEqual(camera.frame.zoom, 2, accuracy: 0.0001, "the gap doubled")
        let after = CanvasGeometry.worldToScreen(anchorWorld, transform: camera.frame.transform)
        XCTAssertEqual(after.x, midpoint.x, accuracy: 0.0001, "the world point under the fingers stayed under the fingers")
        XCTAssertEqual(after.y, midpoint.y, accuracy: 0.0001)

        // Lifting one finger continues as a pan from the other.
        finger(2, .up, midpoint.x + 100, at: 0.1)
        XCTAssertEqual(engine.activeGesture, .pan)
        finger(1, .up, midpoint.x - 100, at: 0.15)
        XCTAssertNil(engine.activeGesture)
    }
}
