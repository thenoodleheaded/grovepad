import Foundation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// The top bar (`CanvasToolbar.tsx`), the zoom row (`ZoomControls.tsx`) and
// the phone mode dock (`CanvasModeDock.tsx`). Circuit mode keeps exactly one
// toggle, in the top bar; the dock holds the two tools a finger cannot
// reach any other way. Undo/Redo live in the dock below desktop width and
// in the zoom row at desktop width — never both.
// ---------------------------------------------------------------------------

public struct Breadcrumb: Equatable, Sendable {
    public var canvasId: String?
    public var name: String
    public var isCurrent: Bool
    /// The collapsed middle of a deep path ("…").
    public var isEllipsis: Bool { canvasId == nil }
}

public struct ToolbarModel {
    public let document: BoardDocument
    public let chrome: ChromeState
    public let tabs: CanvasTabsModel
    public let camera: ChromeCamera?

    public init(document: BoardDocument, chrome: ChromeState, tabs: CanvasTabsModel, camera: ChromeCamera?) {
        self.document = document
        self.chrome = chrome
        self.tabs = tabs
        self.camera = camera
    }

    public var workspaceName: String { document.board.workspaces[document.activeWorkspaceId]?.name ?? "Workspace" }
    public var circuitMode: Bool { document.circuitUI.circuitMode }
    public var canUndo: Bool { document.canUndo }
    public var canRedo: Bool { document.canRedo }
    public var canGoBack: Bool { camera?.canGoBack ?? false }
    public var canGoForward: Bool { camera?.canGoForward ?? false }

    /// `CanvasBreadcrumbs`: root only shows "Origin"; deep paths collapse the
    /// middle to Origin / … / Parent / Current.
    public var breadcrumbs: [Breadcrumb] {
        let path = document.canvasPath(to: document.activeCanvasId)
        guard !path.isEmpty else { return [] }
        let shown: [CanvasMeta?] = path.count > 4 ? [path[0], nil, path[path.count - 2], path[path.count - 1]] : path
        return shown.enumerated().map { index, canvas in
            guard let canvas else { return Breadcrumb(canvasId: nil, name: "…", isCurrent: false) }
            return Breadcrumb(canvasId: canvas.id, name: canvas.name, isCurrent: index == shown.count - 1)
        }
    }

    public var isAtRootOnly: Bool {
        let path = document.canvasPath(to: document.activeCanvasId)
        return path.count <= 1 && path.first?.name == "Origin"
    }

    /// `frameCanvas('board')`. One copy of the rule lives in
    /// `ZoomControlsModel`; the bar and the dock delegate to it so a Fit from
    /// the overflow menu and a Fit from the zoom row land identically.
    public func frameBoard() {
        ZoomControlsModel(document: document, camera: camera).frameBoard()
    }

    /// `H` / `V`: picking a tool leaves Circuit mode.
    public func setMode(_ mode: InteractionMode) {
        document.setCircuitMode(false)
        chrome.interactionMode = mode
    }

    /// The ⚡ toggle: Circuit mode is the Connect tool.
    public func toggleCircuitMode() {
        let next = !document.circuitUI.circuitMode
        document.setCircuitMode(next)
        chrome.interactionMode = next ? .connect : .navigate
    }

    public func undo() { document.undo() }
    public func redo() { document.redo() }

    public func openAddWidget() {
        chrome.openAddWidget(at: camera?.viewCenterWorld ?? .zero)
    }

    /// `startGhostShaper(viewCenterWorld())`: sketch a tree from the middle
    /// of the view.
    public func shapeTree() {
        chrome.treeShaper.start(at: camera?.viewCenterWorld ?? .zero)
    }

    public func openTree() { chrome.treeOpen = true }
    public func openPalette() { chrome.openPalette() }
    public func openSettings() { chrome.openSettings() }
    public func openShortcuts() { chrome.shortcutsOpen = true }

    public func goBack() { camera?.goBack() }
    public func goForward() { camera?.goForward() }

    /// `openCanvasFromClick` for a breadcrumb.
    public func openBreadcrumb(_ crumb: Breadcrumb, command: Bool = false, shift: Bool = false) {
        guard let canvasId = crumb.canvasId, !crumb.isCurrent else { return }
        if command { tabs.open(canvasId, activate: shift) } else { tabs.navigate(to: canvasId) }
        chrome.recordVisit(canvasId)
    }

    /// The overflow menu holds what dropped out of the bar at this width.
    public func overflowShowsSearch(_ adaptation: ChromeAdaptation) -> Bool { adaptation.isPhone }
    public func overflowVisible(_ adaptation: ChromeAdaptation) -> Bool { adaptation.viewportClass != .desktop }
}

public struct ZoomControlsModel {
    public static let zoomStep = 1.25
    public static let presets = [25, 50, 75, 100, 150, 200]

    public let document: BoardDocument
    public let camera: ChromeCamera?
    /// When present, the readout follows the chrome's observable camera
    /// transform so it moves with a pinch or a wheel zoom.
    public let chrome: ChromeState?

    public init(document: BoardDocument, camera: ChromeCamera?, chrome: ChromeState? = nil) {
        self.document = document
        self.camera = camera
        self.chrome = chrome
    }

    public var zoomPercent: Int { Int(jsRound((chrome?.cameraTransform.zoom ?? camera?.zoom ?? 1) * 100)) }

    /// Undo/Redo and Frame sit in the zoom row only at desktop width.
    public func showsHistory(_ adaptation: ChromeAdaptation) -> Bool { !ChromeAdaptation.modeDockShowsHistory(adaptation.viewportClass) }

    public func zoomIn() { zoomBy(ZoomControlsModel.zoomStep) }
    public func zoomOut() { zoomBy(1 / ZoomControlsModel.zoomStep) }

    public func zoomBy(_ factor: Double) {
        guard let camera else { return }
        camera.zoomTo(camera.zoom * factor, focal: camera.viewportCenter, animated: true)
    }

    public func zoomTo(percent: Int) {
        guard let camera else { return }
        camera.zoomTo(Double(percent) / 100, focal: camera.viewportCenter, animated: true)
    }

    public func resetZoom() { zoomTo(percent: 100) }

    /// `frameCanvas('board')`: what is on the board, else the origin.
    public func frameBoard() {
        guard let camera else { return }
        let widgets = document.board.widgets(on: document.activeCanvasId)
        if let rect = CameraFraming.boundsForWidgets(widgets) { camera.fitRect(rect, padding: 160) } else { camera.fitAll() }
    }

    /// `frameCanvas('selection-or-board')` (the F key).
    public func frameSelectionOrBoard() {
        guard let camera else { return }
        let selected = document.selection.compactMap { document.widget($0) }.filter { $0.canvasId == document.activeCanvasId }
        if let rect = CameraFraming.boundsForWidgets(selected) { camera.fitRect(rect, padding: 150) } else { frameBoard() }
    }
}

public struct ModeDockModel {
    public struct Tool: Equatable, Sendable {
        public var mode: InteractionMode
        public var label: String
        public var shortcut: String
        public var symbol: String
    }

    public static let tools = [
        Tool(mode: .navigate, label: "Navigate canvas", shortcut: "H", symbol: "hand.raised"),
        Tool(mode: .select, label: "Select widgets", shortcut: "V", symbol: "cursorarrow"),
    ]

    public let toolbar: ToolbarModel

    public init(toolbar: ToolbarModel) { self.toolbar = toolbar }

    /// The dock is the touch chrome: phones, tablets, any touch or Pencil session.
    public func isVisible(_ adaptation: ChromeAdaptation) -> Bool { adaptation.touchChrome }
    public func showsHistory(_ adaptation: ChromeAdaptation) -> Bool { ChromeAdaptation.modeDockShowsHistory(adaptation.viewportClass) }
    /// Fit rides in the dock exactly where the zoom row drops its own Frame
    /// button (`ZoomControlsView`, phone width), never both. A phone has no
    /// ⌘0 and no F key, so a camera pointing at empty space has to have a
    /// button to come back from (touch adaptation, question 5).
    public func showsFrame(_ adaptation: ChromeAdaptation) -> Bool { adaptation.isPhone }
    public func isPressed(_ tool: Tool, _ adaptation: ChromeAdaptation) -> Bool { adaptation.interactionMode == tool.mode }
    public func select(_ tool: Tool) { toolbar.setMode(tool.mode) }
    public func frameBoard() { toolbar.frameBoard() }
}
