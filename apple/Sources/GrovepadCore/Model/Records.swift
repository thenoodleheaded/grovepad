import Foundation

// ---------------------------------------------------------------------------
// Board records.
//
// Every persisted record is a validated JSON object with typed accessors on
// top (roadmap decision 8). The object keeps the key order and the unknown
// fields it was read with; typed setters assign in place, exactly as the web
// app's `{ ...record, field: value }` spreads do. Reading a typed field never
// fails after validation; the parser (BoardParser) is the only place that
// decides what is valid.
// ---------------------------------------------------------------------------

/// A record backed by an ordered JSON object.
public protocol JSONBackedRecord: Equatable, Hashable {
    var record: JSONObject { get set }
}

public extension JSONBackedRecord {
    var json: JSONValue { .object(record) }
}

// MARK: - Widget

/// The primary spatial entity — one module type per card (`types/spatial.ts`).
public struct Widget: JSONBackedRecord {
    public var record: JSONObject
    /// For a locked newer-client placeholder: the record the newer client
    /// wrote, verbatim (`OPAQUE_WIDGET_SOURCE` in persistedBoardSchema.ts).
    /// The serializer writes this back with only `id` and `canvasId` re-stamped.
    public var opaqueSource: JSONObject?

    public init(record: JSONObject, opaqueSource: JSONObject? = nil) {
        self.record = record
        self.opaqueSource = opaqueSource
    }

    /// Build a fresh record in the web app's key order.
    public init(
        id: String, type: String, title: String, canvasId: String,
        position: Vector2D, size: Size, data: JSONObject, metadata: WidgetMetadata = WidgetMetadata()
    ) {
        var record = JSONObject()
        record["id"] = .string(id)
        record["type"] = .string(type)
        record["title"] = .string(title)
        record["canvasId"] = .string(canvasId)
        record["position"] = position.json()
        record["size"] = size.json()
        record["data"] = .object(data)
        record["metadata"] = .object(metadata.record)
        self.record = record
    }

    public var id: String { record.string("id") ?? "" }

    public var type: String {
        get { record.string("type") ?? "" }
        set { record["type"] = .string(newValue) }
    }

    public var title: String {
        get { record.string("title") ?? "" }
        set { record["title"] = .string(newValue) }
    }

    public var canvasId: String {
        get { record.string("canvasId") ?? "" }
        set { record["canvasId"] = .string(newValue) }
    }

    public var position: Vector2D {
        get { Vector2D(json: record["position"]) ?? .zero }
        set { record["position"] = newValue.json(updating: record.object("position")) }
    }

    public var size: Size {
        get { Size(json: record["size"]) ?? Size(width: 0, height: 0) }
        set { record["size"] = newValue.json(updating: record.object("size")) }
    }

    public var data: JSONObject {
        get { record.object("data") ?? JSONObject() }
        set { record["data"] = .object(newValue) }
    }

    public var metadata: WidgetMetadata {
        get { WidgetMetadata(record: record.object("metadata") ?? JSONObject()) }
        set { record["metadata"] = .object(newValue.record) }
    }

    /// Reduced to a compact icon tile; `size` is the icon square.
    public var iconified: Bool? {
        get { record.bool("iconified") }
        set { record["iconified"] = newValue.map(JSONValue.bool) }
    }

    /// Dormant full-card size preserved while a widget is an icon.
    public var expandedSize: Size? {
        get { Size(json: record["expandedSize"]) }
        set { record["expandedSize"] = newValue?.json(updating: record.object("expandedSize")) }
    }

    public var isHydrating: Bool {
        get { record.bool("isHydrating") ?? false }
        set { record["isHydrating"] = newValue ? .bool(true) : nil }
    }

    public var frame: WorldRect {
        WorldRect(x: position.x, y: position.y, width: size.width, height: size.height)
    }

    /// The newer module type a locked placeholder stands in for, if any.
    public var opaqueType: String? {
        opaqueSource?.string("type")
    }
}

// MARK: - Widget metadata

public struct WidgetMetadata: JSONBackedRecord {
    public var record: JSONObject

    public init(record: JSONObject) { self.record = record }

    public init() {
        record = JSONObject()
        record["badges"] = .array([])
    }

    public var badges: [JSONValue] {
        get { record.array("badges") ?? [] }
        set { record["badges"] = .array(newValue) }
    }

    public var locked: Bool {
        get { record.bool("locked") ?? false }
        set { record["locked"] = newValue ? .bool(true) : nil }
    }

    public var pinned: Bool {
        get { record.bool("pinned") ?? false }
        set { record["pinned"] = newValue ? .bool(true) : nil }
    }

    public var pinnedFrom: JSONValue? {
        get { record["pinnedFrom"] }
        set { record["pinnedFrom"] = newValue }
    }

    public var favorite: Bool {
        get { record.bool("favorite") ?? false }
        set { record["favorite"] = newValue ? .bool(true) : nil }
    }

    public var strictHold: Bool {
        get { record.bool("strictHold") ?? false }
        set { record["strictHold"] = newValue ? .bool(true) : nil }
    }

    public var accent: String? {
        get { record.string("accent") }
        set { record["accent"] = newValue.map(JSONValue.string) }
    }

    public var zIndex: Double? {
        get { record.number("zIndex") }
        set { record["zIndex"] = newValue.map(JSONValue.number) }
    }

    public var completed: Bool {
        get { record.bool("completed") ?? false }
        set { record["completed"] = newValue ? .bool(true) : nil }
    }
}

// MARK: - Relation

public enum RelationType: String, CaseIterable, Sendable {
    case parent
    case coParent = "co-parent"
    case cousin
    case blocker
    case conflict

    public var label: String {
        switch self {
        case .parent: return "Parent"
        case .coParent: return "Co-parent"
        case .cousin: return "Cousin"
        case .blocker: return "Dependency"
        case .conflict: return "Conflict"
        }
    }
}

public struct Relation: JSONBackedRecord {
    public var record: JSONObject

    public init(record: JSONObject) { self.record = record }

    public init(id: String, fromId: String, toId: String, type: RelationType, isResolved: Bool = false) {
        var record = JSONObject()
        record["id"] = .string(id)
        record["fromId"] = .string(fromId)
        record["toId"] = .string(toId)
        record["type"] = .string(type.rawValue)
        record["isResolved"] = .bool(isResolved)
        self.record = record
    }

    public var id: String { record.string("id") ?? "" }
    public var fromId: String { record.string("fromId") ?? "" }
    public var toId: String { record.string("toId") ?? "" }
    public var type: RelationType { RelationType(rawValue: record.string("type") ?? "") ?? .parent }
    public var isResolved: Bool {
        get { record.bool("isResolved") ?? false }
        set { record["isResolved"] = .bool(newValue) }
    }
}

// MARK: - Connection (circuit wire)

public enum WireKind: String, Sendable {
    case value
    case trigger
}

public enum TriggerEdge: String, CaseIterable, Sendable {
    case rising
    case falling
    case change

    public var label: String {
        switch self {
        case .rising: return "Turns on"
        case .falling: return "Turns off"
        case .change: return "Any change"
        }
    }
}

public struct Connection: JSONBackedRecord {
    public var record: JSONObject

    public init(record: JSONObject) { self.record = record }

    /// A value wire in the web app's key order.
    public static func value(
        id: String, fromId: String, fromField: String, toId: String, toField: String,
        transform: WireTransform? = nil, enabled: Bool = true
    ) -> Connection {
        var record = JSONObject()
        record["id"] = .string(id)
        record["fromId"] = .string(fromId)
        record["fromField"] = .string(fromField)
        record["toId"] = .string(toId)
        record["kind"] = .string("value")
        record["toField"] = .string(toField)
        if let transform { record["transform"] = transform.json }
        record["enabled"] = .bool(enabled)
        return Connection(record: record)
    }

    /// A trigger wire in the web app's key order.
    public static func trigger(
        id: String, fromId: String, fromField: String, toId: String, command: String, edge: TriggerEdge,
        transform: WireTransform? = nil, enabled: Bool = true
    ) -> Connection {
        var record = JSONObject()
        record["id"] = .string(id)
        record["fromId"] = .string(fromId)
        record["fromField"] = .string(fromField)
        record["toId"] = .string(toId)
        record["kind"] = .string("trigger")
        record["command"] = .string(command)
        record["edge"] = .string(edge.rawValue)
        if let transform { record["transform"] = transform.json }
        record["enabled"] = .bool(enabled)
        return Connection(record: record)
    }

    public var id: String { record.string("id") ?? "" }
    public var fromId: String { record.string("fromId") ?? "" }
    public var fromField: String { record.string("fromField") ?? "" }
    public var toId: String { record.string("toId") ?? "" }
    public var kind: WireKind { WireKind(rawValue: record.string("kind") ?? "") ?? .value }
    public var toField: String? { record.string("toField") }
    public var command: String? { record.string("command") }
    public var edge: TriggerEdge? { TriggerEdge(rawValue: record.string("edge") ?? "") }

    public var transform: WireTransform? {
        get { WireTransform(json: record["transform"]) }
        set { record["transform"] = newValue?.json }
    }

    public var enabled: Bool {
        get { record.bool("enabled") ?? false }
        set { record["enabled"] = .bool(newValue) }
    }

    public var hasTransform: Bool { record["transform"] != nil }
}

// MARK: - Glue

public struct GlueRestoreEntry: Equatable, Hashable, Sendable {
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double
    public var iconified: Bool

    public init(x: Double, y: Double, width: Double, height: Double, iconified: Bool) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.iconified = iconified
    }

    public var json: JSONValue {
        var object = JSONObject()
        object["x"] = .number(x)
        object["y"] = .number(y)
        object["width"] = .number(width)
        object["height"] = .number(height)
        object["iconified"] = .bool(iconified)
        return .object(object)
    }
}

public struct WidgetGlue: JSONBackedRecord {
    public var record: JSONObject

    public init(record: JSONObject) { self.record = record }

    public init(id: String, widgetIds: [String]) {
        var record = JSONObject()
        record["id"] = .string(id)
        record["widgetIds"] = .array(widgetIds.map(JSONValue.string))
        self.record = record
    }

    public var id: String { record.string("id") ?? "" }

    public var widgetIds: [String] {
        get { (record.array("widgetIds") ?? []).compactMap(\.stringValue) }
        set { record["widgetIds"] = .array(newValue.map(JSONValue.string)) }
    }

    public var name: String? {
        get { record.string("name") }
        set { record["name"] = newValue.map(JSONValue.string) }
    }

    public var collapsed: Bool {
        get { record.bool("collapsed") ?? false }
        set { record["collapsed"] = newValue ? .bool(true) : nil }
    }

    public var restore: [String: GlueRestoreEntry]? {
        guard let object = record.object("restore") else { return nil }
        var result: [String: GlueRestoreEntry] = [:]
        for (id, entry) in object.entries {
            guard let entry = entry.objectValue, let x = entry.number("x"), let y = entry.number("y"),
                  let width = entry.number("width"), let height = entry.number("height") else { continue }
            result[id] = GlueRestoreEntry(x: x, y: y, width: width, height: height, iconified: entry.bool("iconified") ?? false)
        }
        return result
    }

    public var foldedAt: Vector2D? {
        get { Vector2D(json: record["foldedAt"]) }
        set { record["foldedAt"] = newValue?.json(updating: record.object("foldedAt")) }
    }
}

// MARK: - Workspace and canvas

public struct Workspace: JSONBackedRecord {
    public var record: JSONObject

    public init(record: JSONObject) { self.record = record }

    public init(id: String, name: String, rootCanvasId: String, createdAt: Double) {
        var record = JSONObject()
        record["id"] = .string(id)
        record["name"] = .string(name)
        record["rootCanvasId"] = .string(rootCanvasId)
        record["createdAt"] = .number(createdAt)
        self.record = record
    }

    public var id: String { record.string("id") ?? "" }
    public var name: String {
        get { record.string("name") ?? "" }
        set { record["name"] = .string(newValue) }
    }
    public var rootCanvasId: String {
        get { record.string("rootCanvasId") ?? "" }
        set { record["rootCanvasId"] = .string(newValue) }
    }
    public var createdAt: Double { record.number("createdAt") ?? 0 }
    public var sortIndex: Double? {
        get { record.number("sortIndex") }
        set { record["sortIndex"] = newValue.map(JSONValue.number) }
    }
    public var tint: String? {
        get { record.string("tint") }
        set { record["tint"] = newValue.map(JSONValue.string) }
    }
}

public struct CanvasMeta: JSONBackedRecord {
    public var record: JSONObject

    public init(record: JSONObject) { self.record = record }

    public init(id: String, name: String, workspaceId: String, parentCanvasId: String?) {
        var record = JSONObject()
        record["id"] = .string(id)
        record["name"] = .string(name)
        record["workspaceId"] = .string(workspaceId)
        record["parentCanvasId"] = parentCanvasId.map(JSONValue.string) ?? .null
        self.record = record
    }

    public var id: String {
        get { record.string("id") ?? "" }
        set { record["id"] = .string(newValue) }
    }
    public var name: String {
        get { record.string("name") ?? "" }
        set { record["name"] = .string(newValue) }
    }
    public var workspaceId: String { record.string("workspaceId") ?? "" }
    /// Nil only for a workspace root canvas.
    public var parentCanvasId: String? {
        get { record.string("parentCanvasId") }
        set { record["parentCanvasId"] = newValue.map(JSONValue.string) ?? .null }
    }
    /// Opted in to realtime collaboration (`updateCanvasSettings(id, { shared })`).
    public var shared: Bool {
        get { record.bool("shared") ?? false }
        set { record["shared"] = .bool(newValue) }
    }
    /// Per-canvas grid multiplier, 100 by default.
    public var gridIntensity: Double {
        get { record.number("gridIntensity") ?? 100 }
        set { record["gridIntensity"] = .number(newValue) }
    }
    /// Hides relation, dependency and circuit lines without deleting them.
    public var linksVisible: Bool {
        get { record.bool("linksVisible") ?? true }
        set { record["linksVisible"] = .bool(newValue) }
    }
}

/// A parked camera for one canvas (device state, never document state).
public struct CanvasView: Equatable, Hashable, Sendable {
    public var pan: Vector2D
    public var zoom: Double

    public init(pan: Vector2D, zoom: Double) {
        self.pan = pan
        self.zoom = zoom
    }
}
