import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Handoff and window restoration (roadmap phase 7): the active window
// advertises one `NSUserActivity` of type `app.grovepad.native.canvas`
// carrying the workspace, the canvas and the camera. Another device (or the
// same Mac after a relaunch, an iPad scene coming back) continues it by
// landing on that canvas and parking the camera where it was. The payload
// is a plain dictionary so both ends can be tested without a scene.
// ---------------------------------------------------------------------------

public struct CanvasActivityPayload: Equatable, Sendable {
    public static let activityType = "app.grovepad.native.canvas"
    static let keys = (workspace: "workspaceId", canvas: "canvasId", panX: "panX", panY: "panY", zoom: "zoom")

    public var workspaceId: String
    public var canvasId: String
    public var camera: CanvasView?

    public init(workspaceId: String, canvasId: String, camera: CanvasView? = nil) {
        self.workspaceId = workspaceId
        self.canvasId = canvasId
        self.camera = camera
    }

    /// `userInfo` as Handoff carries it (strings and doubles only).
    public var userInfo: [String: Any] {
        var info: [String: Any] = [
            CanvasActivityPayload.keys.workspace: workspaceId,
            CanvasActivityPayload.keys.canvas: canvasId,
        ]
        if let camera {
            info[CanvasActivityPayload.keys.panX] = camera.pan.x
            info[CanvasActivityPayload.keys.panY] = camera.pan.y
            info[CanvasActivityPayload.keys.zoom] = camera.zoom
        }
        return info
    }

    public init?(userInfo: [AnyHashable: Any]?) {
        guard let info = userInfo,
              let workspaceId = info[CanvasActivityPayload.keys.workspace] as? String, !workspaceId.isEmpty,
              let canvasId = info[CanvasActivityPayload.keys.canvas] as? String, !canvasId.isEmpty
        else { return nil }
        self.workspaceId = workspaceId
        self.canvasId = canvasId
        if let x = CanvasActivityPayload.double(info[CanvasActivityPayload.keys.panX]),
           let y = CanvasActivityPayload.double(info[CanvasActivityPayload.keys.panY]),
           let zoom = CanvasActivityPayload.double(info[CanvasActivityPayload.keys.zoom]), zoom > 0 {
            camera = CanvasView(pan: Vector2D(x: x, y: y), zoom: zoom)
        } else {
            camera = nil
        }
    }

    static func double(_ value: Any?) -> Double? {
        switch value {
        case let number as Double: number
        case let number as NSNumber: number.doubleValue
        case let number as Int: Double(number)
        default: nil
        }
    }

    /// Fill a system activity: eligible for Handoff and for restoration,
    /// titled after the canvas so the other device's dock reads it.
    public func apply(to activity: NSUserActivity, canvasName: String) {
        activity.title = canvasName.isEmpty ? "Grovepad canvas" : canvasName
        activity.userInfo = userInfo
        activity.requiredUserInfoKeys = [CanvasActivityPayload.keys.workspace, CanvasActivityPayload.keys.canvas]
        activity.isEligibleForHandoff = true
        activity.isEligibleForSearch = false
        #if os(iOS)
        activity.isEligibleForPrediction = false
        #endif
        activity.needsSave = true
    }
}
