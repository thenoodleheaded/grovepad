import Foundation

// ---------------------------------------------------------------------------
// Port of `src/utils/cloudDocuments.ts`: one small board index plus one
// document per canvas, the canonical JSON form checksums are taken over, and
// the join that rebuilds a board document for the parser.
//
// `encodeCloudDocument`/`decodeCloudDocument` (gzip + bytea framing for the
// cloud transport) are not ported here: gzip needs a platform library and
// belongs with the sync client (roadmap phase 6).
// ---------------------------------------------------------------------------

public enum CloudDocuments {
    public static let indexFormat = "grovepad-board-index"
    public static let indexVersion = 1
    public static let canvasFormat = "grovepad-canvas"
    public static let canvasVersion = 1

    /// Fields that belong to the board itself; everything else is `extra`.
    /// Device fields an old payload still echoes are discarded at the split.
    static let coreBoardFields: Set<String> = [
        "format", "v", "workspaces", "canvases", "widgets", "relations", "connections", "glues",
        "groups", "activePacks", "activeWorkspaceId", "activeCanvasId", "canvasViews",
    ]

    public struct Split: Equatable {
        public var index: JSONObject
        public var canvases: OrderedMap<JSONObject>

        public init(index: JSONObject, canvases: OrderedMap<JSONObject>) {
            self.index = index
            self.canvases = canvases
        }
    }

    // MARK: - Split

    /// `splitCloudBoard(board)` over a serialized board document.
    public static func splitCloudBoard(_ board: JSONObject) -> Split {
        let widgets = board.object("widgets") ?? JSONObject()
        var canvases = OrderedMap<JSONObject>()
        for canvasId in (board.object("canvases") ?? JSONObject()).keys {
            var document = JSONObject()
            document["format"] = .string(canvasFormat)
            document["v"] = .number(Double(canvasVersion))
            document["canvasId"] = .string(canvasId)
            document["widgets"] = .object(JSONObject())
            document["relations"] = .object(JSONObject())
            document["connections"] = .object(JSONObject())
            document["glues"] = .object(JSONObject())
            canvases[canvasId] = document
        }

        func place(_ canvasId: String?, _ key: String, _ id: String, _ value: JSONValue) -> Bool {
            guard let canvasId, var canvas = canvases[canvasId] else { return false }
            var bucket = canvas.object(key) ?? JSONObject()
            bucket[id] = value
            canvas[key] = .object(bucket)
            canvases[canvasId] = canvas
            return true
        }

        for (widgetId, widget) in widgets.entries {
            _ = place(JS.key(widget["canvasId"]), "widgets", widgetId, widget)
        }

        var indexRelations = JSONObject()
        for (relationId, relation) in (board.object("relations") ?? JSONObject()).entries {
            let canvasId = endpointCanvas(widgets, JS.key(relation["fromId"]), JS.key(relation["toId"]))
            if !place(canvasId, "relations", relationId, relation) { indexRelations[relationId] = relation }
        }

        var indexConnections = JSONObject()
        for (connectionId, connection) in (board.object("connections") ?? JSONObject()).entries {
            let canvasId = endpointCanvas(widgets, JS.key(connection["fromId"]), JS.key(connection["toId"]))
            if !place(canvasId, "connections", connectionId, connection) { indexConnections[connectionId] = connection }
        }

        var indexGlues = JSONObject()
        for (glueId, glue) in (board.object("glues") ?? JSONObject()).entries {
            let canvasId = glueCanvas(widgets, glue)
            if !place(canvasId, "glues", glueId, glue) { indexGlues[glueId] = glue }
        }

        let extra = board.filter { key, _ in !coreBoardFields.contains(key) }
        var index = JSONObject()
        index["format"] = .string(indexFormat)
        index["v"] = .number(Double(indexVersion))
        index["boardFormat"] = .string(BoardFormat.format)
        index["boardVersion"] = .number(Double(BoardFormat.version))
        index["workspaces"] = board["workspaces"] ?? .object(JSONObject())
        index["canvases"] = board["canvases"] ?? .object(JSONObject())
        index["activePacks"] = board["activePacks"] ?? .array([])
        index["relations"] = .object(indexRelations)
        index["connections"] = .object(indexConnections)
        index["glues"] = .object(indexGlues)
        index["extra"] = .object(extra)
        return Split(index: index, canvases: canvases)
    }

    /// The canvas both endpoints sit on, or nil for a cross-canvas edge.
    /// `fromCanvas && fromCanvas === …`: an empty canvas id is falsy.
    private static func endpointCanvas(_ widgets: JSONObject, _ fromId: String?, _ toId: String?) -> String? {
        guard let fromId, let fromCanvas = JS.key(widgets.object(fromId)?["canvasId"]), !fromCanvas.isEmpty else { return nil }
        guard let toId, JS.key(widgets.object(toId)?["canvasId"]) == fromCanvas else { return nil }
        return fromCanvas
    }

    private static func glueCanvas(_ widgets: JSONObject, _ glue: JSONValue) -> String? {
        let widgetIds = glue["widgetIds"]?.arrayValue ?? []
        guard let firstId = widgetIds.first.flatMap(JS.key), let first = JS.key(widgets.object(firstId)?["canvasId"]), !first.isEmpty else { return nil }
        let allOnFirst = widgetIds.allSatisfy { id in
            guard let id = JS.key(id) else { return false }
            return JS.key(widgets.object(id)?["canvasId"]) == first
        }
        return allOnFirst ? first : nil
    }

    // MARK: - Shape checks

    public static func isCloudBoardIndex(_ value: JSONValue) -> Bool {
        guard let object = value.objectValue else { return false }
        return object["format"] == .string(indexFormat) &&
            object["v"] == .number(Double(indexVersion)) &&
            object["boardFormat"] == .string(BoardFormat.format) &&
            object["boardVersion"] == .number(Double(BoardFormat.version)) &&
            object.object("workspaces") != nil &&
            object.object("canvases") != nil &&
            object.array("activePacks") != nil &&
            object.object("relations") != nil &&
            object.object("connections") != nil &&
            // Legacy documents carry `groups` instead of `glues`; still readable.
            (object.object("glues") != nil || object.object("groups") != nil) &&
            object.object("extra") != nil
    }

    public static func isCloudCanvasDocument(_ value: JSONValue) -> Bool {
        guard let object = value.objectValue else { return false }
        return object["format"] == .string(canvasFormat) &&
            object["v"] == .number(Double(canvasVersion)) &&
            JS.isString(object["canvasId"]) &&
            object.object("widgets") != nil &&
            object.object("relations") != nil &&
            object.object("connections") != nil &&
            (object.object("glues") != nil || object.object("groups") != nil)
    }

    // MARK: - Join

    /// Reassemble transport documents; the board parser validates the result.
    public static func joinCloudBoard(index: JSONObject, canvases canvasDocuments: [JSONObject]) -> JSONObject {
        let indexCanvases = index.object("canvases") ?? JSONObject()
        var widgets = JSONObject()
        var relations = index.object("relations") ?? JSONObject()
        var connections = index.object("connections") ?? JSONObject()
        var glues = index.object("glues") ?? JSONObject()
        for canvas in canvasDocuments {
            guard let canvasId = JS.key(canvas["canvasId"]), indexCanvases.contains(canvasId) else { continue }
            widgets.merge(canvas.object("widgets") ?? JSONObject())
            relations.merge(canvas.object("relations") ?? JSONObject())
            connections.merge(canvas.object("connections") ?? JSONObject())
            glues.merge(canvas.object("glues") ?? JSONObject())
        }
        var board = index.object("extra") ?? JSONObject()
        board["format"] = index["boardFormat"] ?? .null
        board["v"] = index["boardVersion"] ?? .null
        board["workspaces"] = index["workspaces"] ?? .null
        board["canvases"] = index["canvases"] ?? .null
        board["widgets"] = .object(widgets)
        board["relations"] = .object(relations)
        board["connections"] = .object(connections)
        board["glues"] = .object(glues)
        board["activePacks"] = index["activePacks"] ?? .null
        return board
    }

    // MARK: - Checksums

    /// Stable JSON bytes: keys sorted at every level, then `JSON.stringify`.
    public static func canonicalJson(_ value: JSONValue) -> String {
        JSONWriter.canonical(value)
    }

    public static func sha256Hex(_ text: String) -> String {
        SHA256.hex(text)
    }

    /// `fingerprintBoard` from syncBaseline.ts: the checksums `fetchCloudHead`
    /// compares before any document crosses the network.
    public struct BoardFingerprint: Equatable {
        public var indexChecksum: String
        public var canvasChecksums: OrderedMap<String>

        public init(indexChecksum: String, canvasChecksums: OrderedMap<String>) {
            self.indexChecksum = indexChecksum
            self.canvasChecksums = canvasChecksums
        }

        /// `fingerprintsMatch`.
        public func matches(_ other: BoardFingerprint) -> Bool {
            guard indexChecksum == other.indexChecksum, canvasChecksums.count == other.canvasChecksums.count else { return false }
            return canvasChecksums.entries.allSatisfy { other.canvasChecksums[$0.key] == $0.value }
        }
    }

    public static func fingerprintBoard(_ document: JSONObject) -> BoardFingerprint {
        let split = splitCloudBoard(document)
        var canvases = OrderedMap<String>()
        for (canvasId, canvas) in split.canvases.entries {
            canvases[canvasId] = sha256Hex(canonicalJson(.object(canvas)))
        }
        return BoardFingerprint(indexChecksum: sha256Hex(canonicalJson(.object(split.index))), canvasChecksums: canvases)
    }

    public static func fingerprintBoard(_ board: Board) -> BoardFingerprint {
        fingerprintBoard(BoardSerializer.serializePersistedBoard(board))
    }
}
