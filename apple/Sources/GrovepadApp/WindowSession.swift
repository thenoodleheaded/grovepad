import Foundation
import Observation
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome

// ---------------------------------------------------------------------------
// One window (Mac) or scene (iOS) over the shared document: its own camera,
// its own chrome state (sheets, viewport, tabs) and the canvas host that
// fills the scene's slot. The coordinator owns the document and every
// service; a session owns what is per-window. Camera parking (one
// `CanvasView` per canvas, device state) goes through the coordinator so
// every window reads the same trail.
// ---------------------------------------------------------------------------

/// `CameraEngine` behind the chrome's `ChromeCamera` seam.
public final class CanvasCameraBridge: ChromeCamera {
    public let engine: CameraEngine
    /// The host supplies the displayed footprints (resting tiles, icons); the
    /// fallback frames raw widget frames.
    public var fitAllHandler: (() -> Void)?
    public var activeWidgets: () -> [Widget] = { [] }

    public init(engine: CameraEngine) {
        self.engine = engine
    }

    public var zoom: Double { engine.frame.zoom }
    public var viewportSize: Size { engine.viewportSize }
    public var canGoBack: Bool { engine.canGoBack }
    public var canGoForward: Bool { engine.canGoForward }
    public var transform: CanvasTransform { engine.frame.transform }

    public func zoomTo(_ zoom: Double, focal: Vector2D, animated: Bool) {
        if animated { engine.zoomToAnimated(zoom, focal: focal) } else { engine.zoomAtPoint(zoom, focal: focal) }
    }

    public func fitRect(_ rect: WorldRect, padding: Double) {
        engine.fitRect(rect, padding: padding, animated: true)
    }

    public func fitAll() {
        if let fitAllHandler { fitAllHandler() } else { engine.fitWidgets(activeWidgets()) }
    }

    public func goBack() { engine.goBack() }
    public func goForward() { engine.goForward() }

    public func animateView(pan: Vector2D, zoom: Double, durationMs: Double) {
        engine.animateTo(pan, zoom, duration: durationMs)
    }
}

@MainActor
@Observable
public final class WindowSession: Identifiable {
    public let id = UUID()
    /// The app a window belongs to. Held weakly so a canvas host that
    /// outlives it (a window still closing, a test's teardown) can find out
    /// instead of trapping; `isAttached` says whether it is still there.
    @ObservationIgnored private weak var owner: AppCoordinator?
    public var coordinator: AppCoordinator { owner! }
    public var isAttached: Bool { owner != nil }
    public let camera: CameraEngine
    public let bridge: CanvasCameraBridge
    public let environment: ChromeEnvironment
    /// True once a host laid out and the camera was parked or restored.
    public private(set) var isViewportReady = false
    @ObservationIgnored private var unsubscribeFrame: (() -> Void)?
    @ObservationIgnored private var parkedCanvasId: String?
    @ObservationIgnored private var observingCanvas = false

    init(coordinator: AppCoordinator, scheduler: FrameScheduler, deviceState: DeviceState?) {
        self.owner = coordinator
        let camera = CameraEngine(scheduler: scheduler)
        self.camera = camera
        let bridge = CanvasCameraBridge(engine: camera)
        self.bridge = bridge
        let document = coordinator.document
        bridge.activeWidgets = { [weak document] in document.map { $0.board.widgets(on: $0.activeCanvasId) } ?? [] }
        environment = ChromeEnvironment(
            document: document,
            camera: bridge,
            deviceState: deviceState,
            settingsStore: coordinator.settingsStore,
            pickerPrefs: coordinator.pickerPrefs,
            toastScheduler: coordinator.toastScheduler,
            analyticsConfigured: false
        )
        environment.settings.account = coordinator.settingsAccountStatus
        environment.settings.accountBadge = coordinator.settingsAccountBadge
        environment.chrome.recordVisit(document.activeCanvasId)
        parkedCanvasId = document.activeCanvasId
        unsubscribeFrame = camera.onFrame { [weak self] frame in self?.cameraDidCommit(frame) }
        observeCanvas()
    }

    deinit {
        unsubscribeFrame?()
    }

    public var document: BoardDocument { coordinator.document }

    // MARK: - Camera parking

    /// The host has a size: restore the active canvas's parked view (or
    /// frame the cards when none was parked).
    public func noteViewportReady() {
        guard !isViewportReady else { return }
        isViewportReady = true
        restoreCamera(for: document.activeCanvasId)
    }

    private func cameraDidCommit(_ frame: CameraFrame) {
        let transform = frame.transform
        if environment.chrome.cameraTransform != transform { environment.chrome.cameraTransform = transform }
        owner?.noteCameraMoved(in: self)
        guard isViewportReady, let canvasId = parkedCanvasId else { return }
        coordinator.recordCanvasView(canvasId, CanvasView(pan: frame.pan, zoom: frame.zoom))
    }

    private func observeCanvas() {
        guard !observingCanvas else { return }
        observingCanvas = true
        withObservationTracking { [document] in
            _ = document.activeCanvasId
        } onChange: { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.observingCanvas = false
                self.canvasDidChange(to: self.document.activeCanvasId)
                self.observeCanvas()
            }
        }
    }

    private func canvasDidChange(to canvasId: String) {
        guard canvasId != parkedCanvasId else { return }
        parkedCanvasId = canvasId
        environment.chrome.recordVisit(canvasId)
        coordinator.noteNavigation()
        if isViewportReady { restoreCamera(for: canvasId) }
    }

    private func restoreCamera(for canvasId: String) {
        if let view = coordinator.canvasViews[canvasId] {
            camera.setView(view.pan, view.zoom)
        } else {
            bridge.fitAll()
        }
    }

    /// Frame every card on the active canvas (View ▸ Fit, ⌘0).
    public func fitAll() { bridge.fitAll() }

    // MARK: - Context menu (phase 7: the Note widget row)

    /// The chrome's row list plus the device-local "Show in widget" state
    /// the app owns; both hosts build their menu from this one call.
    public func contextMenuModel(for widgetId: String, nativeMenu: Bool = false) -> ContextMenuModel? {
        ContextMenuModel(widgetId: widgetId, document: document, nativeMenu: nativeMenu, noteWidget: coordinator.noteWidget.menuState(for: widgetId))
    }

    /// The chrome's actions with the widget toggle wired to the coordinator.
    public var contextMenuActions: ContextMenuActions {
        var actions = environment.contextMenuActions
        actions.toggleNoteWidget = { [weak self] widgetId in
            guard let self else { return }
            self.coordinator.noteWidget.toggle(widgetId)
            let shown = self.coordinator.noteWidget.selectedWidgetId == widgetId
            self.environment.toasts.add(shown ? "This note now shows in the Grovepad widget" : "Removed from the Grovepad widget")
        }
        return actions
    }
}
