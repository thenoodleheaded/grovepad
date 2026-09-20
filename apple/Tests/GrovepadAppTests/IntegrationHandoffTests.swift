import XCTest
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
@testable import GrovepadApp

/// Handoff and restoration: the activity payload round-trips through
/// `userInfo`, the window advertises where it is, and continuing lands the
/// receiving window on the canvas with the camera parked.
@MainActor
final class IntegrationHandoffTests: XCTestCase {
    private var directory: URL!

    override func setUp() {
        super.setUp()
        directory = AppFixtures.temporaryDirectory("handoff")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: directory)
        super.tearDown()
    }

    func testPayloadRoundTripsWithAndWithoutACamera() {
        let full = CanvasActivityPayload(workspaceId: "ws", canvasId: "c1", camera: CanvasView(pan: Vector2D(x: -12.5, y: 40), zoom: 0.75))
        XCTAssertEqual(CanvasActivityPayload(userInfo: full.userInfo), full)
        let bare = CanvasActivityPayload(workspaceId: "ws", canvasId: "c1")
        XCTAssertEqual(CanvasActivityPayload(userInfo: bare.userInfo), bare)
        XCTAssertEqual(bare.userInfo.count, 2, "no camera keys when there is no camera")

        // As NSUserActivity carries it (NSNumber on the way back).
        let activity = NSUserActivity(activityType: CanvasActivityPayload.activityType)
        full.apply(to: activity, canvasName: "Biology")
        XCTAssertEqual(activity.title, "Biology")
        XCTAssertTrue(activity.isEligibleForHandoff)
        XCTAssertFalse(activity.isEligibleForSearch)
        XCTAssertEqual(activity.requiredUserInfoKeys, ["workspaceId", "canvasId"])
        XCTAssertEqual(CanvasActivityPayload(userInfo: activity.userInfo), full)
        XCTAssertEqual(ActivityContinuation(activity), .canvas(full))

        XCTAssertNil(CanvasActivityPayload(userInfo: nil))
        XCTAssertNil(CanvasActivityPayload(userInfo: ["workspaceId": "ws"]))
        XCTAssertNil(CanvasActivityPayload(userInfo: ["workspaceId": "", "canvasId": "c1"]))
        XCTAssertNil(CanvasActivityPayload(userInfo: ["workspaceId": "ws", "canvasId": "c1", "panX": 1.0, "panY": 2.0, "zoom": 0.0])?.camera, "a zero zoom is no camera")
    }

    func testTheWindowAdvertisesItsCanvasAndCameraAndAContinuationLandsThere() throws {
        let coordinator = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource())
        coordinator.start()
        defer { coordinator.dispose() }
        let session = coordinator.makeSession()
        let root = coordinator.document.activeCanvasId
        let door = try XCTUnwrap(coordinator.document.createWidget(type: "canvas_node", at: .zero, title: "Inner"))
        let inner = try XCTUnwrap(coordinator.document.widget(door)?.data.string("canvasId"))

        session.camera.setViewportSize(Size(width: 1000, height: 700))
        session.noteViewportReady()
        session.camera.setView(Vector2D(x: -120, y: 40), 0.8)
        let advertised = coordinator.activityPayload(for: session)
        XCTAssertEqual(advertised, CanvasActivityPayload(workspaceId: coordinator.document.activeWorkspaceId, canvasId: root, camera: CanvasView(pan: Vector2D(x: -120, y: 40), zoom: 0.8)))

        // The other device sent its inner canvas and camera.
        let incoming = CanvasActivityPayload(workspaceId: advertised.workspaceId, canvasId: inner, camera: CanvasView(pan: Vector2D(x: 300, y: 300), zoom: 1.25))
        XCTAssertTrue(coordinator.continueActivity(.canvas(incoming), in: session))
        XCTAssertEqual(coordinator.document.activeCanvasId, inner)
        XCTAssertEqual(session.environment.tabs.openTabs.map(\.canvasId), [inner])
        XCTAssertEqual(coordinator.canvasViews[inner], CanvasView(pan: Vector2D(x: 300, y: 300), zoom: 1.25), "the camera is parked for the canvas")
        try awaitObservation()
        XCTAssertEqual(session.camera.frame, CameraFrame(pan: Vector2D(x: 300, y: 300), zoom: 1.25))
        XCTAssertEqual(coordinator.activityPayload(for: session).canvasId, inner, "the advertisement follows")

        XCTAssertFalse(coordinator.continueActivity(.canvas(CanvasActivityPayload(workspaceId: "w", canvasId: "elsewhere")), in: session), "a canvas this board lacks is refused")
        XCTAssertEqual(coordinator.document.activeCanvasId, inner)
    }

    private func awaitObservation() throws {
        let expectation = expectation(description: "turn")
        DispatchQueue.main.async { expectation.fulfill() }
        wait(for: [expectation], timeout: 1)
    }
}
