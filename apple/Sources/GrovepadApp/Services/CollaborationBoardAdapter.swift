import Foundation
import Observation
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
import GrovepadCollaboration

// ---------------------------------------------------------------------------
// The collaboration session's view of the app: the one `BoardDocument`, the
// active window's camera, the pointer over any canvas, the network. The web
// runtime reads the same things from its Zustand stores and `window`.
// ---------------------------------------------------------------------------

@MainActor
final class CollaborationBoardAdapter: CollaborationBoardHost {
    private let document: BoardDocument
    private weak var coordinator: AppCoordinator?
    private let reachability: NetworkReachability?
    private var pointerListeners: [Int: (Vector2D?) -> Void] = [:]
    private var cameraListeners: [Int: () -> Void] = [:]
    private var nextListener = 0

    init(document: BoardDocument, coordinator: AppCoordinator, reachability: NetworkReachability?) {
        self.document = document
        self.coordinator = coordinator
        self.reachability = reachability
    }

    private var cameraEngine: CameraEngine? { (coordinator?.activeSession ?? coordinator?.sessions.first)?.camera }

    var board: Board { document.board }
    var activeCanvasId: String { document.activeCanvasId }
    var selectedWidgetIds: [String] { document.selection }
    var isOnline: Bool { reachability?.isOnline ?? true }

    var camera: CollaborationCamera? {
        guard let frame = cameraEngine?.frame else { return nil }
        return CollaborationCamera(pan: frame.pan, zoom: frame.zoom)
    }

    func applyCollaborativeBoard(_ board: Board) { document.applyCollaborativeBoard(board) }

    func setCamera(_ camera: CollaborationCamera) {
        cameraEngine?.setView(camera.pan, camera.zoom)
    }

    func setEditingLocked(_ locked: Bool) { document.setEditingLocked(locked) }

    func setHistory(_ history: CollaborativeHistory?) {
        document.setHistoryOverride(history.map(HistoryOverride.init))
    }

    func setCanvasShared(_ canvasId: String, shared: Bool) { document.setCanvasShared(canvasId, shared: shared) }

    func adoptSharedCanvas(_ canvasId: String, name: String) throws {
        guard document.adoptSharedCanvas(canvasId, name: name) else {
            throw CollaborationError("No local workspace is available for the shared canvas")
        }
        if let session = coordinator?.activeSession ?? coordinator?.sessions.first {
            session.environment.tabs.navigate(to: canvasId)
        } else {
            document.navigate(to: canvasId)
        }
    }

    func observeBoard(_ listener: @escaping () -> Void) -> () -> Void {
        document.subscribe(listener)
    }

    func observeSelection(_ listener: @escaping () -> Void) -> () -> Void {
        observe({ [document] in _ = document.selection }, listener)
    }

    /// Fed by every window's camera (`noteCameraMoved`), so a session that
    /// starts before any window exists still hears the camera later.
    func observeCamera(_ listener: @escaping () -> Void) -> () -> Void {
        nextListener += 1
        let id = nextListener
        cameraListeners[id] = listener
        return { [weak self] in self?.cameraListeners[id] = nil }
    }

    func noteCameraMoved() {
        for listener in cameraListeners.values { listener() }
    }

    func observePointer(_ listener: @escaping (Vector2D?) -> Void) -> () -> Void {
        nextListener += 1
        let id = nextListener
        pointerListeners[id] = listener
        return { [weak self] in self?.pointerListeners[id] = nil }
    }

    /// A window's canvas host reports the pointer in world coordinates.
    func notePointer(_ world: Vector2D?) {
        for listener in pointerListeners.values { listener(world) }
    }

    /// `withObservationTracking`, re-armed after every change until cancelled.
    private func observe(_ read: @escaping () -> Void, _ onChange: @escaping () -> Void) -> () -> Void {
        let token = ObservationToken()
        func arm() {
            withObservationTracking(read) {
                Task { @MainActor in
                    guard !token.cancelled else { return }
                    onChange()
                    arm()
                }
            }
        }
        arm()
        return { token.cancelled = true }
    }
}

private final class ObservationToken {
    var cancelled = false
}

/// Collaborative history as the document's Undo/Redo.
private final class HistoryOverride: BoardHistoryOverride {
    private let history: CollaborativeHistory

    init(_ history: CollaborativeHistory) { self.history = history }

    var canUndo: Bool { MainActor.assumeIsolated { history.canUndo } }
    var canRedo: Bool { MainActor.assumeIsolated { history.canRedo } }
    func undo() { MainActor.assumeIsolated { history.undo() } }
    func redo() { MainActor.assumeIsolated { history.redo() } }
}
