import Foundation
import GrovepadCore
#if canImport(CoreSpotlight)
import CoreSpotlight
#endif

// ---------------------------------------------------------------------------
// One door for every system activity that arrives: a Handoff / restoration
// activity (`app.grovepad.native.canvas`) lands on its canvas and parks the
// camera; a Spotlight result (`CSSearchableItemActionType`) reveals the
// canvas or card its identifier names. The window that receives it is the
// one that navigates; the coordinator only answers what to do.
// ---------------------------------------------------------------------------

public enum ActivityContinuation: Equatable, Sendable {
    case canvas(CanvasActivityPayload)
    case spotlight(SpotlightIdentifier)

    /// Read an activity into a continuation, or nil when it is not ours.
    public init?(activityType: String, userInfo: [AnyHashable: Any]?) {
        if activityType == CanvasActivityPayload.activityType, let payload = CanvasActivityPayload(userInfo: userInfo) {
            self = .canvas(payload)
            return
        }
        #if canImport(CoreSpotlight)
        if activityType == CSSearchableItemActionType,
           let raw = userInfo?[CSSearchableItemActivityIdentifier] as? String,
           let identifier = SpotlightIdentifier(raw) {
            self = .spotlight(identifier)
            return
        }
        #endif
        return nil
    }

    public init?(_ activity: NSUserActivity) {
        self.init(activityType: activity.activityType, userInfo: activity.userInfo)
    }
}

@MainActor
public extension AppCoordinator {
    /// The activity the given window advertises right now.
    func activityPayload(for session: WindowSession) -> CanvasActivityPayload {
        let canvasId = document.activeCanvasId
        let frame = session.camera.frame
        return CanvasActivityPayload(
            workspaceId: document.activeWorkspaceId,
            canvasId: canvasId,
            camera: session.isViewportReady ? CanvasView(pan: frame.pan, zoom: frame.zoom) : canvasViews[canvasId]
        )
    }

    /// Continue an activity in `session` (the receiving window). Returns
    /// false when the canvas is not on this device's board.
    @discardableResult
    func continueActivity(_ continuation: ActivityContinuation, in session: WindowSession?) -> Bool {
        switch continuation {
        case .canvas(let payload):
            guard document.board.canvases.contains(payload.canvasId) else { return false }
            if let camera = payload.camera { recordCanvasView(payload.canvasId, camera) }
            if let session {
                session.environment.tabs.navigate(to: payload.canvasId)
                if session.isViewportReady, let camera = payload.camera { session.camera.setView(camera.pan, camera.zoom) }
            }
            document.navigate(to: payload.canvasId)
            return true
        case .spotlight(let identifier):
            return reveal(identifier)
        }
    }

    @discardableResult
    func continueActivity(_ activity: NSUserActivity, in session: WindowSession?) -> Bool {
        guard let continuation = ActivityContinuation(activity) else { return false }
        return continueActivity(continuation, in: session)
    }
}
