import Foundation

// ---------------------------------------------------------------------------
// Port of `src/utils/persistedBoardSchema.ts` — the read side.
//
// Every function here mirrors its TypeScript namesake statement for statement,
// including the key order every `{ ...x, y }` spread produces: assigning to a
// key that already exists keeps its position, assigning a new key appends.
// Records are therefore always mutated in place on a copy of the source
// object (law 5), never rebuilt from typed fields.
// ---------------------------------------------------------------------------

/// The one incompatible case that must block every write in an old client.
public struct FuturePersistedBoardVersionError: Error, Equatable, CustomStringConvertible {
    public let foundVersion: Int

    public init(foundVersion: Int) { self.foundVersion = foundVersion }

    public var description: String { "Board version \(foundVersion) requires a newer Grovepad" }
}

public enum BoardParser {
    /// The id every pre-minting board called its root canvas (`LEGACY_SHARED_ROOT_CANVAS_ID`).
    public static let legacySharedRootCanvasId = "canvas-origin"
    /// The workspace a v1 board is wrapped in (`MIGRATED_WORKSPACE_ID`).
    public static let migratedWorkspaceId = "ws-default"

    static let knownBoardFields: Set<String> = [
        "format", "v", "workspaces", "canvases", "widgets", "relations", "connections", "glues",
        // Legacy widget-grouping records: recognized only so they are dropped
        // instead of round-tripping as opaque unknown fields.
        "groups",
        "activePacks", "activeWorkspaceId", "activeCanvasId", "canvasViews",
    ]
    static let transientAutomationRunTypes: Set<String> = ["http_request", "webhook_sender", "widget_creator"]
    static let relationTypes: Set<String> = Set(RelationType.allCases.map(\.rawValue))
    static let triggerEdges: Set<String> = Set(TriggerEdge.allCases.map(\.rawValue))

    // MARK: - Version gate

    /// `getFuturePersistedBoardVersion`.
    public static func futurePersistedBoardVersion(_ value: JSONValue) -> Int? {
        guard let object = value.objectValue else { return nil }
        guard object["format"] == .string(BoardFormat.format) else { return nil }
        guard let version = object.number("v"), JS.isInteger(version) else { return nil }
        guard version > Double(BoardFormat.version) else { return nil }
        return Int(exactly: version) ?? Int.max
    }

    /// `isPersistedBoardFromNewerVersion`.
    public static func isFromNewerVersion(_ value: JSONValue) -> Bool {
        futurePersistedBoardVersion(value) != nil
    }

    // MARK: - parsePersistedBoard

    /// Validate and normalize an arbitrary v2 board payload.
    public static func parsePersistedBoard(_ value: JSONValue) -> Board? {
        guard let parsed = value.objectValue, let rawWidgets = parsed.object("widgets") else { return nil }
        if let format = parsed["format"], format != .string(BoardFormat.format) { return nil }
        if let version = parsed["v"], version != .number(Double(BoardFormat.version)) { return nil }
        guard let rawWorkspaces = parsed.object("workspaces"), let rawCanvases = parsed.object("canvases") else { return nil }

        var workspaces = OrderedMap<Workspace>()
        for (id, raw) in rawWorkspaces.entries {
            guard let record = raw.objectValue, isValidWorkspace(record), JS.key(record["id"]) == id else { continue }
            workspaces[id] = Workspace(record: record)
        }

        var canvases = OrderedMap<CanvasMeta>()
        for (id, raw) in rawCanvases.entries {
            guard let record = raw.objectValue, isValidCanvas(record), JS.key(record["id"]) == id,
                  let workspaceId = JS.key(record["workspaceId"]), workspaces.contains(workspaceId) else { continue }
            canvases[id] = CanvasMeta(record: record)
        }
        // Each loop walks a snapshot of the values (`Object.values`) while
        // looking up — and deleting from — the live map, in this exact order.
        for (id, canvas) in canvases.entries {
            let parent = canvas.record["parentCanvasId"] ?? .null
            if !parent.isNull, !(JS.key(parent).map(canvases.contains) ?? false) {
                canvases.removeValue(forKey: id)
            }
        }
        for (id, workspace) in workspaces.entries {
            if !(JS.key(workspace.record["rootCanvasId"]).map(canvases.contains) ?? false) {
                workspaces.removeValue(forKey: id)
            }
        }
        for (id, canvas) in canvases.entries {
            if !(JS.key(canvas.record["workspaceId"]).map(workspaces.contains) ?? false) {
                canvases.removeValue(forKey: id)
            }
        }
        if workspaces.isEmpty { return nil }

        var widgets = OrderedMap<Widget>()
        for (id, raw) in rawWidgets.entries {
            guard let source = raw.objectValue, hasValidWidgetEnvelope(source, requireCanvasId: true), JS.key(source["id"]) == id else { continue }
            // A deleted card is dropped, never rehydrated as a placeholder.
            let rawType = source.string("type") ?? ""
            if WidgetTypeCatalog.deletedTypes.contains(rawType) { continue }
            // A renamed card is rewritten to its live name before validity is
            // checked, so it never falls into the opaque path.
            let widget = renamed(source, from: rawType)
            guard let canvasId = JS.key(widget["canvasId"]), canvases.contains(canvasId) else { continue }
            widgets[id] = isKnownType(widget) ? normalizeWidgetData(Widget(record: widget)) : createOpaqueWidget(widget)
        }

        let firstWorkspaceId = workspaces.keys[0]
        let activeWorkspaceId: String = {
            if let requested = JS.key(parsed["activeWorkspaceId"]), workspaces.contains(requested) { return requested }
            return firstWorkspaceId
        }()
        let activeCanvasId: String = {
            if let requested = JS.key(parsed["activeCanvasId"]), let canvas = canvases[requested],
               JS.key(canvas.record["workspaceId"]) == activeWorkspaceId { return requested }
            return JS.key(workspaces[activeWorkspaceId]!.record["rootCanvasId"]) ?? ""
        }()

        var canvasViews = OrderedMap<CanvasView>()
        if let rawViews = parsed.object("canvasViews") {
            for (canvasId, view) in rawViews.entries {
                guard canvases.contains(canvasId), let record = view.objectValue else { continue }
                guard let pan = Vector2D(json: record["pan"]), let zoom = record.number("zoom") else { continue }
                // The web keeps any extra keys of the view object here; they are
                // dead data (device state is rebuilt as `{ pan, zoom }`), so the
                // typed CanvasView drops them.
                canvasViews[canvasId] = CanvasView(pan: pan, zoom: CanvasGeometry.clampZoom(zoom))
            }
        }

        let relations = parseRelations(parsed["relations"], widgets: widgets)
        let connections = parseConnections(parsed["connections"], widgets: widgets)
        let glues = parseGlues(parsed["glues"], widgets: widgets)
        let packs = parsePacks(parsed["activePacks"])

        return Board(
            workspaces: workspaces, canvases: canvases, widgets: widgets,
            relations: relations.known, connections: connections.known, glues: glues.known,
            activePacks: packs.known,
            unknownFields: collectUnknownBoardFields(parsed),
            unknownRelations: relations.unknown, unknownConnections: connections.unknown, unknownGlues: glues.unknown,
            rawActivePacks: packs.rawStrings,
            activeWorkspaceId: activeWorkspaceId, activeCanvasId: activeCanvasId, canvasViews: canvasViews
        )
    }

    // MARK: - migrateLegacyBoard

    /// Wrap a v1 flat board in a default workspace and root canvas.
    public static func migrateLegacyBoard(_ value: JSONValue, mint: IdMinter, clock: Clock) -> Board? {
        guard let parsed = value.objectValue, let rawWidgets = parsed.object("widgets") else { return nil }

        let rootCanvasId = mint()
        var widgets = OrderedMap<Widget>()
        for (id, raw) in rawWidgets.entries {
            guard let source = raw.objectValue, hasValidWidgetEnvelope(source, requireCanvasId: false), JS.key(source["id"]) == id else { continue }
            let rawType = source.string("type") ?? ""
            if WidgetTypeCatalog.deletedTypes.contains(rawType) { continue }
            var migrated = renamed(source, from: rawType)
            migrated["canvasId"] = .string(rootCanvasId)
            widgets[id] = isKnownType(migrated) ? normalizeWidgetData(Widget(record: migrated)) : createOpaqueWidget(migrated)
        }

        var workspaces = OrderedMap<Workspace>()
        workspaces[migratedWorkspaceId] = Workspace(id: migratedWorkspaceId, name: "My Workspace", rootCanvasId: rootCanvasId, createdAt: clock.nowMs())
        var canvases = OrderedMap<CanvasMeta>()
        canvases[rootCanvasId] = CanvasMeta(id: rootCanvasId, name: "Origin", workspaceId: migratedWorkspaceId, parentCanvasId: nil)

        let relations = parseRelations(parsed["relations"], widgets: widgets)
        let connections = parseConnections(parsed["connections"], widgets: widgets)
        let glues = parseGlues(parsed["glues"], widgets: widgets)
        let packs = parsePacks(parsed["activePacks"])

        return Board(
            workspaces: workspaces, canvases: canvases, widgets: widgets,
            relations: relations.known, connections: connections.known, glues: glues.known,
            activePacks: packs.known,
            unknownFields: collectUnknownBoardFields(parsed),
            unknownRelations: relations.unknown, unknownConnections: connections.unknown, unknownGlues: glues.unknown,
            rawActivePacks: packs.rawStrings,
            activeWorkspaceId: migratedWorkspaceId, activeCanvasId: rootCanvasId, canvasViews: [:]
        )
    }

    // MARK: - remapLegacyRootCanvasId

    /// Move a board off the shared `canvas-origin` id, once, on load.
    ///
    /// WEB QUIRK, reproduced on purpose: the TypeScript rebuilds the board with
    /// `Object.assign`, which copies only enumerable properties, so the
    /// reader-owned sidecars (unknown fields, unknown edges and glues, raw
    /// pack order) do not survive a remap. A `canvas-origin` board that also
    /// carried newer-client data loses that data on the web today; the port
    /// matches until the web is fixed and the pack regenerated.
    public static func remapLegacyRootCanvasId(_ board: Board, mint: IdMinter) -> Board {
        let from = legacySharedRootCanvasId
        guard board.canvases.contains(from) else { return board }
        let to = mint()
        func swap(_ value: JSONValue?) -> JSONValue? { JS.key(value) == from ? .string(to) : value }

        var canvases = OrderedMap<CanvasMeta>()
        for (id, canvas) in board.canvases.entries {
            let nextId = id == from ? to : id
            var record = canvas.record
            record["id"] = .string(nextId)
            record["parentCanvasId"] = swap(record["parentCanvasId"]) ?? .null
            canvases[nextId] = CanvasMeta(record: record)
        }

        var workspaces = OrderedMap<Workspace>()
        for (id, workspace) in board.workspaces.entries {
            var record = workspace.record
            record["rootCanvasId"] = swap(record["rootCanvasId"]) ?? .null
            workspaces[id] = Workspace(record: record)
        }

        var widgets = OrderedMap<Widget>()
        for (id, widget) in board.widgets.entries {
            // Only the wrapper's canvasId moves; a placeholder keeps its stashed
            // source, and the serializer re-stamps canvasId onto it.
            var next = widget
            next.record["canvasId"] = swap(next.record["canvasId"]) ?? .null
            // A canvas-node card names the canvas it opens; missing it here would
            // leave a portal pointing at an id nothing answers to.
            if next.record["type"] == .string("canvas_node"), var data = next.record.object("data"), JS.key(data["canvasId"]) == from {
                data["canvasId"] = .string(to)
                next.record["data"] = .object(data)
            }
            widgets[id] = next
        }

        var canvasViews = OrderedMap<CanvasView>()
        for (id, view) in board.canvasViews.entries {
            canvasViews[id == from ? to : id] = view
        }

        return Board(
            workspaces: workspaces, canvases: canvases, widgets: widgets,
            relations: board.relations, connections: board.connections, glues: board.glues,
            activePacks: board.activePacks,
            unknownFields: JSONObject(), unknownRelations: [:], unknownConnections: [:], unknownGlues: [:], rawActivePacks: [],
            activeWorkspaceId: board.activeWorkspaceId,
            activeCanvasId: board.activeCanvasId == from ? to : board.activeCanvasId,
            canvasViews: canvasViews
        )
    }

    // MARK: - Widget validation and normalization

    /// `{ ...raw, type: currentWidgetType(raw.type) }`, leaving an ill-formed
    /// type string untouched when no rename applies.
    private static func renamed(_ source: JSONObject, from rawType: String) -> JSONObject {
        var widget = source
        let current = WidgetTypeCatalog.currentType(rawType)
        if current != rawType { widget["type"] = .string(current) }
        return widget
    }

    private static func isKnownType(_ widget: JSONObject) -> Bool {
        guard case .string(let type)? = widget["type"] else { return false }
        return WidgetTypeCatalog.moduleTypeSet.contains(type)
    }

    /// Base spatial envelope shared by known and future widget module types.
    static func hasValidWidgetEnvelope(_ value: JSONObject, requireCanvasId: Bool) -> Bool {
        guard JS.isString(value["id"]), JS.isString(value["type"]), JS.isString(value["title"]) else { return false }
        if requireCanvasId, !JS.isString(value["canvasId"]) { return false }
        guard JS.isVector(value["position"]) else { return false }
        guard let size = value.object("size"), JS.isFiniteNumber(size["width"]), JS.isFiniteNumber(size["height"]) else { return false }
        guard value.object("data") != nil else { return false }
        guard let metadata = value.object("metadata"), metadata.array("badges") != nil else { return false }
        return true
    }

    /// `createOpaqueWidget`: a locked text placeholder carrying the source verbatim.
    static func createOpaqueWidget(_ value: JSONObject) -> Widget {
        var placeholder = value
        placeholder["type"] = .string("text")
        placeholder["data"] = .object(["text": .string("")])
        var metadata = value.object("metadata") ?? JSONObject()
        metadata["locked"] = .bool(true)
        placeholder["metadata"] = .object(metadata)
        // Deleted from the placeholder only; the stashed source keeps it.
        placeholder.removeValue(forKey: "isHydrating")
        return Widget(record: placeholder, opaqueSource: value)
    }

    /// One-time compatibility normalization for evolved widget data contracts.
    /// Also the serializer's write-side scrub, so runtime-only state never
    /// reaches a transport.
    static func normalizeWidgetData(_ widget: Widget) -> Widget {
        var record = widget.record
        record.removeValue(forKey: "isHydrating")
        restoreRetiredPill(&record)
        sanitizePinOrigin(&record)
        let type = record.string("type") ?? ""
        var data = record.object("data") ?? JSONObject()

        if type == "ai_generator", data["status"] == .string("generating") {
            data["status"] = .string("idle")
            record["data"] = .object(data)
            return Widget(record: record)
        }
        if type == "secret_reference" {
            data["input"] = .string("")
            data["output"] = .string("")
            data["config"] = .string("{}")
            data["enabled"] = .bool(false)
            data["running"] = .bool(false)
            data["lastError"] = .string("Secret material was removed. Protected secret storage is not available in this beta.")
            record["data"] = .object(data)
            return Widget(record: record)
        }
        if WidgetTypeCatalog.automationCoreTypes.contains(type), transientAutomationRunTypes.contains(type), data["running"] == .bool(true) {
            data["running"] = .bool(false)
            data["lastError"] = .string("Previous run was interrupted. Review the input and run again.")
            record["data"] = .object(data)
            return Widget(record: record)
        }
        if type != "bullets" { return Widget(record: record) }

        let rawItems = data.array("items") ?? []
        var items: [JSONValue] = []
        for (index, value) in rawItems.enumerated() {
            if value.isString {
                // Legacy string bullets get a stable id derived from the widget id.
                var item = JSONObject()
                item["id"] = JS.concat(record["id"] ?? .string(""), ":bullet:\(index)")
                item["text"] = value
                items.append(.object(item))
            } else if let item = value.objectValue, JS.isString(item["id"]), JS.isString(item["text"]) {
                // `{ ...value, id: value.id, text: value.text }` — every field kept, order unchanged.
                items.append(.object(item))
            }
        }
        data["items"] = .array(items)
        record["data"] = .object(data)
        return Widget(record: record)
    }

    /// The retired `collapsed` name-pill scale state: restore the dormant
    /// full-card geometry instead of leaving a stunted 200×40 card.
    private static func restoreRetiredPill(_ widget: inout JSONObject) {
        guard widget["collapsed"] == .bool(true) else { return }
        widget.removeValue(forKey: "collapsed")
        if widget["iconified"] == .bool(true) { return }
        // `widget.expandedSize ?? widgetDefinition(widget.type).defaultSize`:
        // any non-null expandedSize value is taken verbatim, extra keys and all.
        if let expanded = widget["expandedSize"], !expanded.isNull {
            widget["size"] = expanded
        } else if let type = widget.string("type"), let size = WidgetTypeCatalog.defaultSizes[type] {
            widget["size"] = size.json()
        }
        widget.removeValue(forKey: "expandedSize")
    }

    /// The state a pin interrupted: anything unpinning could not act on is dropped.
    private static func sanitizePinOrigin(_ widget: inout JSONObject) {
        guard var metadata = widget.object("metadata"), metadata.contains("pinnedFrom") else { return }
        let from = metadata.object("pinnedFrom")
        let valid: Bool = {
            guard let from else { return false }
            if from["kind"] == .string("rest") { return true }
            guard from["kind"] == .string("icon"), let width = from.number("width"), let height = from.number("height") else { return false }
            return width > 0 && height > 0
        }()
        // A memory without a pin to belong to is stale bookkeeping, not state.
        if !valid || metadata["pinned"] != .bool(true) {
            metadata.removeValue(forKey: "pinnedFrom")
            widget["metadata"] = .object(metadata)
        }
    }

    // MARK: - Workspace and canvas validation

    private static func isValidWorkspace(_ value: JSONObject) -> Bool {
        JS.isString(value["id"]) && JS.isString(value["name"]) && JS.isString(value["rootCanvasId"]) && JS.isFiniteNumber(value["createdAt"])
    }

    private static func isValidCanvas(_ value: JSONObject) -> Bool {
        guard JS.isString(value["id"]), JS.isString(value["name"]), JS.isString(value["workspaceId"]) else { return false }
        guard let parent = value["parentCanvasId"], parent.isNull || parent.isString else { return false }
        func optionalBool(_ key: String) -> Bool { value[key] == nil || value[key]?.boolValue != nil }
        guard optionalBool("shared"), optionalBool("linksVisible"), optionalBool("relationStrict") else { return false }
        if let intensity = value["gridIntensity"] {
            guard let number = intensity.numberValue, number >= 0, number <= 100 else { return false }
        }
        return true
    }

    // MARK: - Relations

    struct ParsedRecords<T> {
        var known = OrderedMap<T>()
        var unknown = OrderedMap<JSONObject>()
    }

    private static func hasValidRelationEnvelope(_ value: JSONObject, widgets: OrderedMap<Widget>) -> Bool {
        guard JS.isString(value["id"]), JS.isString(value["type"]), value["isResolved"]?.boolValue != nil else { return false }
        guard let fromId = JS.key(value["fromId"]), let toId = JS.key(value["toId"]) else { return false }
        return widgets.contains(fromId) && widgets.contains(toId)
    }

    static func parseRelations(_ raw: JSONValue?, widgets: OrderedMap<Widget>) -> ParsedRecords<Relation> {
        var result = ParsedRecords<Relation>()
        guard let records = raw?.objectValue else { return result }
        for (id, value) in records.entries {
            guard let relation = value.objectValue, hasValidRelationEnvelope(relation, widgets: widgets), JS.key(relation["id"]) == id else { continue }
            if case .string(let type)? = relation["type"], relationTypes.contains(type) {
                result.known[id] = Relation(record: relation)
            } else {
                result.unknown[id] = relation
            }
        }
        return result
    }

    // MARK: - Connections

    private static func hasValidConnectionEnvelope(_ value: JSONObject, widgets: OrderedMap<Widget>) -> Bool {
        guard JS.isString(value["id"]), JS.isString(value["fromField"]), JS.isString(value["kind"]),
              value["enabled"]?.boolValue != nil,
              let fromId = JS.key(value["fromId"]), let toId = JS.key(value["toId"]),
              widgets.contains(fromId), widgets.contains(toId) else { return false }
        if value["kind"] == .string("value") {
            guard JS.isString(value["toField"]) else { return false }
            // `value.transform !== undefined`: a present key, even null, is checked.
            if let transform = value["transform"] {
                guard let object = transform.objectValue, JS.isString(object["op"]) else { return false }
            }
        }
        if value["kind"] == .string("trigger") {
            guard JS.isString(value["command"]), JS.isString(value["edge"]) else { return false }
        }
        return true
    }

    /// `isValidConnectionShape` from types/circuit.ts, after the envelope passed.
    private static func isValidConnectionShape(_ value: JSONObject) -> Bool {
        if value["kind"] == .string("value") {
            guard JS.isString(value["toField"]) else { return false }
            if let transform = value["transform"], WireTransform(json: transform) == nil { return false }
            return true
        }
        if value["kind"] == .string("trigger") {
            guard JS.isString(value["command"]) else { return false }
            guard case .string(let edge)? = value["edge"], triggerEdges.contains(edge) else { return false }
            return true
        }
        return false
    }

    static func parseConnections(_ raw: JSONValue?, widgets: OrderedMap<Widget>) -> ParsedRecords<Connection> {
        var result = ParsedRecords<Connection>()
        guard let records = raw?.objectValue else { return result }
        for (id, value) in records.entries {
            guard let connection = value.objectValue, hasValidConnectionEnvelope(connection, widgets: widgets), JS.key(connection["id"]) == id else { continue }
            if isValidConnectionShape(connection) {
                result.known[id] = Connection(record: connection)
            } else {
                result.unknown[id] = connection
            }
        }
        return result
    }

    // MARK: - Glues

    /// `parseGlueEnvelope`: the source plus its member ids filtered to widgets that exist.
    private static func parseGlueEnvelope(_ value: JSONValue, widgets: OrderedMap<Widget>) -> (source: JSONObject, widgetIds: [JSONValue])? {
        guard let source = value.objectValue, JS.isString(source["id"]), let rawIds = source.array("widgetIds") else { return nil }
        let widgetIds = rawIds.filter { id in JS.key(id).map(widgets.contains) ?? false }
        guard widgetIds.count >= 2 else { return nil }
        return (source, widgetIds)
    }

    /// `sanitizeGlueRestore`: only members that survived, every field finite.
    private static func sanitizeGlueRestore(_ value: JSONValue?, widgetIds: [JSONValue]) -> JSONObject? {
        guard let object = value?.objectValue else { return nil }
        let members = Set(widgetIds.compactMap(JS.key))
        var restore = JSONObject()
        for (id, entry) in object.entries {
            guard members.contains(id), let entry = entry.objectValue else { continue }
            guard let x = entry.number("x"), let y = entry.number("y") else { continue }
            guard let width = entry.number("width"), let height = entry.number("height"), width > 0, height > 0 else { continue }
            restore[id] = GlueRestoreEntry(x: x, y: y, width: width, height: height, iconified: entry["iconified"] == .bool(true)).json
        }
        return restore.isEmpty ? nil : restore
    }

    /// `sanitizeGlue`. A JavaScript `{ ...source, key: undefined }` leaves the
    /// key in place with an undefined value, which JSON.stringify omits; the
    /// port removes the key instead. The only observable difference would be
    /// the position of that key if the same object were later re-assigned in
    /// place, which no persisted path does.
    private static func sanitizeGlue(_ value: JSONValue, widgets: OrderedMap<Widget>) -> WidgetGlue? {
        guard let envelope = parseGlueEnvelope(value, widgets: widgets) else { return nil }
        let source = envelope.source
        var name: JSONValue? = nil
        if let rawName = source["name"], let units = JS.units(rawName), JS.hasNonWhitespace(units) {
            name = JS.string(fromUnits: JS.collapseWhitespaceTrimAndSlice(units, limit: 60))
        }
        let restore = sanitizeGlueRestore(source["restore"], widgetIds: envelope.widgetIds)
        // A cluster is only "collapsed" if it also carries the map that can undo the fold.
        let collapsed = source["collapsed"] == .bool(true) && restore != nil
        // The fold anchor only means anything while the fold it describes is in effect.
        var foldedAt: JSONValue? = nil
        if collapsed, let anchor = source.object("foldedAt"), let x = anchor.number("x"), let y = anchor.number("y") {
            foldedAt = Vector2D(x: x, y: y).json()
        }

        var record = source
        record["id"] = source["id"]
        record["widgetIds"] = .array(envelope.widgetIds)
        if let name { record["name"] = name }
        if collapsed { record["collapsed"] = .bool(true) } else { record.removeValue(forKey: "collapsed") }
        if collapsed, let restore { record["restore"] = .object(restore) } else { record.removeValue(forKey: "restore") }
        if let foldedAt { record["foldedAt"] = foldedAt } else { record.removeValue(forKey: "foldedAt") }
        return WidgetGlue(record: record)
    }

    static func parseGlues(_ raw: JSONValue?, widgets: OrderedMap<Widget>) -> ParsedRecords<WidgetGlue> {
        var result = ParsedRecords<WidgetGlue>()
        guard let records = raw?.objectValue else { return result }
        for (id, value) in records.entries {
            guard let envelope = parseGlueEnvelope(value, widgets: widgets), JS.key(envelope.source["id"]) == id else { continue }
            if let sanitized = sanitizeGlue(value, widgets: widgets) {
                result.known[id] = sanitized
            } else {
                var unknown = envelope.source
                unknown["widgetIds"] = .array(envelope.widgetIds)
                result.unknown[id] = unknown
            }
        }
        return result
    }

    // MARK: - Packs and unknown fields

    static func parsePacks(_ raw: JSONValue?) -> (known: [String], rawStrings: [String]) {
        let rawStrings = (raw?.arrayValue ?? []).compactMap { $0.isString ? $0.stringValue : nil }
        return (rawStrings.filter(WidgetTypeCatalog.domainPackSet.contains), rawStrings)
    }

    static func collectUnknownBoardFields(_ value: JSONObject) -> JSONObject {
        value.filter { key, _ in !knownBoardFields.contains(key) }
    }
}
