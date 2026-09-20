import Foundation

// ---------------------------------------------------------------------------
// The canonical board model (`PersistedBoardDocumentState` + the sidecars the
// web reader attaches non-enumerably). Persistence validates a payload into
// this; every mutation path works on it; the serializer writes it back.
// ---------------------------------------------------------------------------

public enum BoardFormat {
    public static let format = "grovepad-board"
    public static let version = 2
    public static let deviceFormat = "grovepad-device"
    public static let deviceVersion = 1
}

public struct Board: Equatable, Hashable {
    public var workspaces: OrderedMap<Workspace>
    public var canvases: OrderedMap<CanvasMeta>
    public var widgets: OrderedMap<Widget>
    public var relations: OrderedMap<Relation>
    public var connections: OrderedMap<Connection>
    public var glues: OrderedMap<WidgetGlue>
    /// Known domain packs, in the order the reader accepted them.
    public var activePacks: [String]

    // Reader-owned sidecars (storage law 2).
    /// Unknown top-level fields, expanded back into the document first.
    public var unknownFields: JSONObject
    /// Well-formed semantic records this runtime does not understand.
    public var unknownRelations: OrderedMap<JSONObject>
    public var unknownConnections: OrderedMap<JSONObject>
    public var unknownGlues: OrderedMap<JSONObject>
    /// Original pack order including strings a newer build introduced.
    public var rawActivePacks: [String]

    // Navigation the legacy embedded fields resolve to; device state, never
    // written into a document.
    public var activeWorkspaceId: String
    public var activeCanvasId: String
    public var canvasViews: OrderedMap<CanvasView>

    public init(
        workspaces: OrderedMap<Workspace> = [:],
        canvases: OrderedMap<CanvasMeta> = [:],
        widgets: OrderedMap<Widget> = [:],
        relations: OrderedMap<Relation> = [:],
        connections: OrderedMap<Connection> = [:],
        glues: OrderedMap<WidgetGlue> = [:],
        activePacks: [String] = [],
        unknownFields: JSONObject = JSONObject(),
        unknownRelations: OrderedMap<JSONObject> = [:],
        unknownConnections: OrderedMap<JSONObject> = [:],
        unknownGlues: OrderedMap<JSONObject> = [:],
        rawActivePacks: [String] = [],
        activeWorkspaceId: String = "",
        activeCanvasId: String = "",
        canvasViews: OrderedMap<CanvasView> = [:]
    ) {
        self.workspaces = workspaces
        self.canvases = canvases
        self.widgets = widgets
        self.relations = relations
        self.connections = connections
        self.glues = glues
        self.activePacks = activePacks
        self.unknownFields = unknownFields
        self.unknownRelations = unknownRelations
        self.unknownConnections = unknownConnections
        self.unknownGlues = unknownGlues
        self.rawActivePacks = rawActivePacks
        self.activeWorkspaceId = activeWorkspaceId
        self.activeCanvasId = activeCanvasId
        self.canvasViews = canvasViews
    }

    /// Widgets on one canvas, in record order.
    public func widgets(on canvasId: String) -> [Widget] {
        widgets.values.filter { $0.canvasId == canvasId }
    }
}

/// Local-only navigation (`BoardDeviceState`): never enters a document.
public struct CanvasTab: Equatable, Hashable, Sendable {
    public var id: String
    public var canvasId: String

    public init(id: String, canvasId: String) {
        self.id = id
        self.canvasId = canvasId
    }
}

public struct DeviceState: Equatable, Hashable {
    public var activeWorkspaceId: String
    public var activeCanvasId: String
    public var canvasViews: OrderedMap<CanvasView>
    public var openTabs: [CanvasTab]
    /// Always names a tab in `openTabs`, and that tab points at `activeCanvasId`.
    public var activeTabId: String

    public init(activeWorkspaceId: String, activeCanvasId: String, canvasViews: OrderedMap<CanvasView>, openTabs: [CanvasTab], activeTabId: String) {
        self.activeWorkspaceId = activeWorkspaceId
        self.activeCanvasId = activeCanvasId
        self.canvasViews = canvasViews
        self.openTabs = openTabs
        self.activeTabId = activeTabId
    }
}
