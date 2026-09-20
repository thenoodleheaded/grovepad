import Foundation
import Observation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// The chrome's own transient state: which tool is in force, what the window
// measures, which sheets are open, the context-menu press, the rename in
// progress and the relation being drawn. On the web these are scattered over
// `useAdaptiveInputStore`, `useWidgetStore` (palette/shortcuts/addWidget
// flags, contextMenu, renaming) and `useCanvasTreeStore`. None of it is
// document state and none of it is undoable.
// ---------------------------------------------------------------------------

/// The camera the chrome drives. The app target fills it with
/// `CameraEngine`; tests fill it with a recorder. Every zoom and frame the
/// toolbar, zoom row, palette and selection bar perform goes through here.
public protocol ChromeCamera: AnyObject {
    var zoom: Double { get }
    var viewportSize: Size { get }
    var canGoBack: Bool { get }
    var canGoForward: Bool { get }
    var transform: CanvasTransform { get }
    func zoomTo(_ zoom: Double, focal: Vector2D, animated: Bool)
    func fitRect(_ rect: WorldRect, padding: Double)
    func fitAll()
    func goBack()
    func goForward()
    /// `animateView(pan, zoom, ms)`: glide to an exact view (the minimap).
    func animateView(pan: Vector2D, zoom: Double, durationMs: Double)
}

public extension ChromeCamera {
    /// The world point under the middle of the screen — where created cards land.
    var viewCenterWorld: Vector2D {
        CanvasGeometry.screenToWorld(Vector2D(x: viewportSize.width / 2, y: viewportSize.height / 2), transform: transform)
    }

    var viewportCenter: Vector2D { Vector2D(x: viewportSize.width / 2, y: viewportSize.height / 2) }
}

/// A relation being drawn from the selection bar (`startChildLink`,
/// `startDependencyLink`): the canvas host completes it on the next card tap.
public struct PendingLink: Equatable, Sendable {
    public var fromId: String
    public var type: RelationType

    public init(fromId: String, type: RelationType) {
        self.fromId = fromId
        self.type = type
    }
}

/// A held press or right-click on a card, in screen points.
public struct ContextMenuRequest: Equatable, Sendable {
    public var widgetId: String
    public var x: Double
    public var y: Double

    public init(widgetId: String, x: Double, y: Double) {
        self.widgetId = widgetId
        self.x = x
        self.y = y
    }
}

@Observable
public final class ChromeState {
    public var interactionMode: InteractionMode = .navigate
    public var activeInput: ActiveInput = .mouse
    public var viewportSize = Size(width: 1280, height: 800)
    /// The camera as of its last commit, observable: the zoom readout and
    /// the minimap redraw from this, never by polling the camera.
    public var cameraTransform = CanvasTransform(x: 0, y: 0, zoom: 1)

    public var paletteOpen = false
    /// The `find <text>` verb pre-fills the search box.
    public var paletteInitialQuery: String?
    public var settingsOpen = false
    public var settingsSection: SettingsSection = .general
    public var treeOpen = false
    public var shortcutsOpen = false
    /// The world point the add-widget surface will spawn at, when open.
    public var addWidgetAnchor: Vector2D?
    public var contextMenu: ContextMenuRequest?
    public var renamingWidgetId: String?
    public var pendingLink: PendingLink?
    /// Device-local visit trail (`canvasRecents`): the palette's jump list
    /// and the workspace switcher's memory.
    public var canvasVisits: [String] = []
    /// The tree being sketched, when the shaper is open.
    public let treeShaper = TreeShaperModel()
    /// The skin drum grown out of a card's title, while it is up.
    public var skinRoller: SkinRollerModel?
    /// The card lifted into the full-screen sheet, while it is up.
    public var fullscreen: FullscreenRequest?
    /// The account panel grown out of the floating account button.
    public var accountPanelOpen = false

    public init() {}

    public var adaptation: ChromeAdaptation {
        ChromeAdaptation(width: viewportSize.width, height: viewportSize.height, activeInput: activeInput, interactionMode: interactionMode)
    }

    /// `openAddWidget(worldPos)`.
    public func openAddWidget(at world: Vector2D) { addWidgetAnchor = world }
    public func closeAddWidget() { addWidgetAnchor = nil }
    public var addWidgetOpen: Bool { addWidgetAnchor != nil }

    public func openPalette(query: String? = nil) {
        paletteInitialQuery = query
        paletteOpen = true
    }

    public func openSettings(_ section: SettingsSection? = nil) {
        if let section { settingsSection = section }
        settingsOpen = true
    }

    /// `openContextMenu`: only for a card that exists.
    public func openContextMenu(_ widgetId: String, x: Double, y: Double, in document: BoardDocument) {
        guard document.widget(widgetId) != nil else { return }
        contextMenu = ContextMenuRequest(widgetId: widgetId, x: x, y: y)
    }

    public func closeContextMenu() { contextMenu = nil }

    /// `recordCanvasVisit`: most recent first, no duplicates, capped.
    public func recordVisit(_ canvasId: String) {
        canvasVisits.removeAll { $0 == canvasId }
        canvasVisits.insert(canvasId, at: 0)
        if canvasVisits.count > 24 { canvasVisits.removeLast(canvasVisits.count - 24) }
    }

    /// `lastVisitedCanvasIn`: the newest visit inside a workspace.
    public func lastVisitedCanvas(in workspaceId: String, board: Board) -> String? {
        canvasVisits.first { board.canvases[$0]?.workspaceId == workspaceId }
    }
}

/// The settings sections the web shows, in order (`SettingsSection`).
public enum SettingsSection: String, CaseIterable, Sendable {
    case general, controls, canvas, account, data

    public var label: String {
        switch self {
        case .general: return "General"
        case .controls: return "Hotkeys"
        case .canvas: return "Canvas"
        case .account: return "Account"
        case .data: return "Data"
        }
    }

    public var symbol: String {
        switch self {
        case .general: return "paintpalette"
        case .controls: return "keyboard"
        case .canvas: return "rectangle.dashed"
        case .account: return "person"
        case .data: return "cylinder"
        }
    }
}

/// A camera that records what the chrome asked of it (tests and previews).
public final class RecordingCamera: ChromeCamera {
    public var zoom: Double = 1
    public var viewportSize = Size(width: 1000, height: 600)
    public var canGoBack = false
    public var canGoForward = false
    public var transform: CanvasTransform { CanvasTransform(x: pan.x, y: pan.y, zoom: zoom) }
    public var pan = Vector2D.zero
    public private(set) var log: [String] = []

    public init() {}

    public func zoomTo(_ zoom: Double, focal: Vector2D, animated: Bool) {
        self.zoom = CanvasGeometry.clampZoom(zoom)
        log.append("zoomTo:\(JSNumberFormatter.string(self.zoom))")
    }

    public func fitRect(_ rect: WorldRect, padding: Double) {
        log.append("fitRect:\(JSNumberFormatter.string(rect.x)),\(JSNumberFormatter.string(rect.y)),\(JSNumberFormatter.string(rect.width)),\(JSNumberFormatter.string(rect.height))")
    }

    public func fitAll() { log.append("fitAll") }
    public func animateView(pan: Vector2D, zoom: Double, durationMs: Double) {
        self.pan = pan
        self.zoom = zoom
        log.append("animateView:\(JSNumberFormatter.string(pan.x)),\(JSNumberFormatter.string(pan.y)),\(JSNumberFormatter.string(zoom))")
    }
    public func goBack() { log.append("goBack") }
    public func goForward() { log.append("goForward") }
}
