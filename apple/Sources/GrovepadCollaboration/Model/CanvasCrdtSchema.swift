import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Port of `src/collaboration/yjsCanvas.ts` (the CRDT schema) and
// `mergeCanvasIntoBoard` from `src/collaboration/canvasStoreBridge.ts`.
//
// One active canvas maps to one Yjs document with six root maps. Records are
// nested maps of JSON fields so unrelated properties merge independently;
// every widget whose `data.text` is a string keeps that text in `texts` as a
// `Y.Text` so concurrent typing is kept character by character.
//
// Records travel as the document writes them (`persistedWidgetRecord`), and
// everything that comes back is bounded and run through the board parser
// before it may reach the board.
// ---------------------------------------------------------------------------

/// One canvas and its internal edges as plain persisted records.
public struct CanvasCollaborationSnapshot: Equatable {
    public var canvasId: String
    /// `{ id, name, gridIntensity?, linksVisible?, relationStrict? }`.
    public var canvas: JSONObject
    public var widgets: OrderedMap<JSONObject>
    public var relations: OrderedMap<JSONObject>
    public var connections: OrderedMap<JSONObject>
    public var glues: OrderedMap<JSONObject>

    public init(
        canvasId: String, canvas: JSONObject,
        widgets: OrderedMap<JSONObject> = [:], relations: OrderedMap<JSONObject> = [:],
        connections: OrderedMap<JSONObject> = [:], glues: OrderedMap<JSONObject> = [:]
    ) {
        self.canvasId = canvasId
        self.canvas = canvas
        self.widgets = widgets
        self.relations = relations
        self.connections = connections
        self.glues = glues
    }

    /// The empty document a read-only role seeds when the server has nothing.
    public static func empty(canvasId: String, name: String) -> CanvasCollaborationSnapshot {
        var canvas = JSONObject()
        canvas["id"] = .string(canvasId)
        canvas["name"] = .string(name)
        return CanvasCollaborationSnapshot(canvasId: canvasId, canvas: canvas)
    }
}

/// A shared document read back and validated: the canvas's metadata fields
/// and its records, typed exactly as a loaded board holds them.
public struct ValidatedCanvas: Equatable {
    public var canvasId: String
    public var canvas: CanvasMeta
    public var widgets: OrderedMap<Widget>
    public var relations: OrderedMap<Relation>
    public var connections: OrderedMap<Connection>
    public var glues: OrderedMap<WidgetGlue>
}

public enum CanvasCrdtSchema {
    static let validationWorkspaceId = "__collaboration_workspace__"
    public static let maxEntitiesPerKind = 10_000
    public static let maxTextCharacters = 2_000_000
    public static let maxJSONCharacters = 8_000_000

    // MARK: - Local board → snapshot

    /// `canvasSnapshotMeta`: optional settings only when the canvas has them.
    static func canvasMeta(_ canvas: CanvasMeta) -> JSONObject {
        var meta = JSONObject()
        meta["id"] = .string(canvas.id)
        meta["name"] = .string(canvas.name)
        for key in ["gridIntensity", "linksVisible", "relationStrict"] {
            if let value = canvas.record[key], value != .null { meta[key] = value }
        }
        return meta
    }

    /// `snapshotCanvas`: only the active canvas and its internal edges.
    public static func snapshotCanvas(_ board: Board, canvasId: String) throws -> CanvasCollaborationSnapshot {
        guard let canvas = board.canvases[canvasId] else {
            throw CollaborationError("canvas \(canvasId) does not exist locally")
        }
        var widgets = OrderedMap<JSONObject>()
        for (id, widget) in board.widgets.entries where widget.canvasId == canvasId {
            widgets[id] = BoardSerializer.persistedWidgetRecord(id, widget)
        }
        let hasWidget = { (id: String) in widgets.contains(id) }
        return CanvasCollaborationSnapshot(
            canvasId: canvasId,
            canvas: canvasMeta(canvas),
            widgets: widgets,
            relations: board.relations.filter { _, edge in hasWidget(edge.fromId) && hasWidget(edge.toId) }.mapValues(\.record),
            connections: board.connections.filter { _, edge in hasWidget(edge.fromId) && hasWidget(edge.toId) }.mapValues(\.record),
            glues: board.glues.filter { _, glue in glue.widgetIds.contains(where: hasWidget) }.mapValues(\.record)
        )
    }

    // MARK: - Snapshot → document edits

    /// `collaborativeText`: a widget's `data.text` when it is a string.
    static func collaborativeText(_ widget: JSONObject) -> String? {
        guard case .object(let data)? = widget["data"], case .string(let text)? = data["text"] else { return nil }
        return text
    }

    /// `withoutCollaborativeText`.
    static func withoutCollaborativeText(_ widget: JSONObject) -> JSONObject {
        guard collaborativeText(widget) != nil, case .object(var data)? = widget["data"] else { return widget }
        data.removeValue(forKey: "text")
        var record = widget
        record["data"] = .object(data)
        return record
    }

    static func fields(_ record: JSONObject) -> [CrdtField] {
        record.entries.map { CrdtField(key: $0.key, json: JSONWriter.stringify($0.value)) }
    }

    /// `writeCanvasSnapshot` as one batch of edits. With a `previous`
    /// snapshot, records equal to their previous value are skipped entirely
    /// (the web compares by reference; value equality is the same test for
    /// immutable records); without one, the document is reconciled in full.
    public static func edits(for snapshot: CanvasCollaborationSnapshot, previous: CanvasCollaborationSnapshot?) -> [CrdtEdit] {
        var edits: [CrdtEdit] = []
        if previous == nil || previous!.canvas != snapshot.canvas {
            edits.append(.replaceCanvas(fields: fields(snapshot.canvas)))
        }
        reconcile(.widgets, snapshot.widgets, previous?.widgets, transform: withoutCollaborativeText, into: &edits)
        reconcile(.relations, snapshot.relations, previous?.relations, into: &edits)
        reconcile(.connections, snapshot.connections, previous?.connections, into: &edits)
        reconcile(.glues, snapshot.glues, previous?.glues, into: &edits)

        if let previous {
            for id in previous.widgets.keys {
                guard let widget = snapshot.widgets[id], collaborativeText(widget) != nil else {
                    edits.append(.deleteText(id: id))
                    continue
                }
            }
        } else {
            let ids = snapshot.widgets.entries.filter { collaborativeText($0.value) != nil }.map(\.key)
            edits.append(.retainTexts(ids: ids))
        }
        for (id, widget) in snapshot.widgets.entries {
            if let previous, previous.widgets[id] == widget { continue }
            guard let text = collaborativeText(widget) else { continue }
            edits.append(.replaceText(id: id, text: text))
        }
        return edits
    }

    static func reconcile(
        _ root: CrdtRoot,
        _ records: OrderedMap<JSONObject>,
        _ previous: OrderedMap<JSONObject>?,
        transform: (JSONObject) -> JSONObject = { $0 },
        into edits: inout [CrdtEdit]
    ) {
        if let previous {
            for id in previous.keys where !records.contains(id) {
                edits.append(.deleteRecord(root: root, id: id))
            }
        } else {
            edits.append(.retainRecords(root: root, ids: records.keys))
        }
        for (id, record) in records.entries {
            if let previous, previous[id] == record { continue }
            edits.append(.replaceRecord(root: root, id: id, fields: fields(transform(record))))
        }
    }

    /// `writeCanvasSnapshot` against a live engine, as this person's edit.
    /// Returns the update to send (empty when nothing changed).
    @discardableResult
    public static func write(
        _ snapshot: CanvasCollaborationSnapshot, to crdt: CanvasCrdt, previous: CanvasCollaborationSnapshot?
    ) throws -> Data {
        let batch = edits(for: snapshot, previous: previous)
        guard !batch.isEmpty else { return Data() }
        return try crdt.applyLocalEdits(edits: batch)
    }

    // MARK: - Document → validated canvas

    /// `readCanvasSnapshot`: bound, parse and validate everything in the
    /// document. `local` supplies key order only: a record keeps the key order
    /// this device already has for it, so a merge does not reshuffle saved
    /// bytes (the engine's maps are unordered).
    public static func read(_ crdt: CanvasCrdt, canvasId: String, local: Board?) throws -> ValidatedCanvas {
        try read(crdt.readSnapshot(), canvasId: canvasId, local: local)
    }

    public static func read(_ raw: CrdtSnapshot, canvasId: String, local: Board?) throws -> ValidatedCanvas {
        func bound(_ count: UInt32, _ label: String) throws {
            if Int(count) > maxEntitiesPerKind {
                throw CollaborationError("\(label) exceeds \(maxEntitiesPerKind) records")
            }
        }
        try bound(raw.widgetCount, "widgets")
        try bound(raw.relationCount, "relations")
        try bound(raw.connectionCount, "connections")
        try bound(raw.glueCount, "glues")
        try bound(raw.textCount, "texts")

        let canvas = try object(raw.canvas)
        var widgets = try records(raw.widgets)
        let relations = try records(raw.relations)
        let connections = try records(raw.connections)
        let glues = try records(raw.glues)
        for text in raw.texts {
            if Int(text.utf16Length) > maxTextCharacters {
                throw CollaborationError("note \(text.id) exceeds \(maxTextCharacters) characters")
            }
            guard var widget = widgets[text.id] else { continue }
            var data = widget["data"]?.objectValue ?? JSONObject()
            data["text"] = .string(text.text)
            widget["data"] = .object(data)
            widgets[text.id] = widget
        }

        let localWidgets = local.map { board in board.widgets.filter { _, widget in widget.canvasId == canvasId } }
        return try validate(
            canvasId: canvasId,
            canvas: canvas,
            widgets: ordered(widgets, like: localWidgets.map { $0.mapValues { BoardSerializer.persistedWidgetRecord($0.id, $0) } }),
            relations: ordered(relations, like: local?.relations.mapValues(\.record)),
            connections: ordered(connections, like: local?.connections.mapValues(\.record)),
            glues: ordered(glues, like: local?.glues.mapValues(\.record)),
            localCanvas: local?.canvases[canvasId]
        )
    }

    static func object(_ fields: [CrdtField]) throws -> JSONObject {
        var object = JSONObject()
        for field in fields.sorted(by: { JSONWriter.utf16Less($0.key, $1.key) }) {
            do {
                object[field.key] = try JSONParser.parse(field.json)
            } catch {
                throw CollaborationError("canvas payload failed board validation")
            }
        }
        return object
    }

    static func records(_ records: [CrdtRecord]) throws -> OrderedMap<JSONObject> {
        var result = OrderedMap<JSONObject>()
        for record in records.sorted(by: { JSONWriter.utf16Less($0.id, $1.id) }) {
            result[record.id] = try object(record.fields)
        }
        return result
    }

    /// Records in the local order first, then the rest (already sorted); each
    /// record's keys likewise, recursively.
    static func ordered(_ records: OrderedMap<JSONObject>, like local: OrderedMap<JSONObject>?) -> OrderedMap<JSONObject> {
        guard let local else { return records }
        var result = OrderedMap<JSONObject>()
        for id in local.keys {
            if let record = records[id] { result[id] = ordered(record, like: local[id]) }
        }
        for (id, record) in records.entries where !result.contains(id) { result[id] = record }
        return result
    }

    static func ordered(_ object: JSONObject, like reference: JSONObject?) -> JSONObject {
        guard let reference else { return object }
        var result = JSONObject()
        for key in reference.keys {
            if let value = object[key] { result[key] = ordered(value, like: reference[key]) }
        }
        for (key, value) in object.entries where !result.contains(key) { result[key] = value }
        return result
    }

    static func ordered(_ value: JSONValue, like reference: JSONValue?) -> JSONValue {
        switch (value, reference) {
        case (.object(let object), .object(let other)?):
            return .object(ordered(object, like: other))
        case (.array(let items), .array(let others)?):
            return .array(items.enumerated().map { index, item in ordered(item, like: index < others.count ? others[index] : nil) })
        default:
            return value
        }
    }

    /// `validateSnapshot`: wrap the records in a one-canvas board document
    /// and run the persisted-board parser over it.
    static func validate(
        canvasId: String, canvas: JSONObject,
        widgets: OrderedMap<JSONObject>, relations: OrderedMap<JSONObject>,
        connections: OrderedMap<JSONObject>, glues: OrderedMap<JSONObject>,
        localCanvas: CanvasMeta?
    ) throws -> ValidatedCanvas {
        guard canvas["id"] == .string(canvasId) else { throw CollaborationError("canvas metadata id mismatch") }
        var workspace = JSONObject()
        workspace["id"] = .string(validationWorkspaceId)
        workspace["name"] = .string("Collaboration validation")
        workspace["rootCanvasId"] = .string(canvasId)
        workspace["createdAt"] = .number(0)

        var canvasRecord = JSONObject()
        canvasRecord["id"] = .string(canvasId)
        if let name = canvas["name"] { canvasRecord["name"] = name }
        canvasRecord["workspaceId"] = .string(validationWorkspaceId)
        canvasRecord["parentCanvasId"] = .null
        for key in ["gridIntensity", "linksVisible", "relationStrict"] {
            if let value = canvas[key] { canvasRecord[key] = value }
        }

        var candidate = JSONObject()
        candidate["format"] = .string(BoardFormat.format)
        candidate["v"] = .number(Double(BoardFormat.version))
        candidate["workspaces"] = .object([validationWorkspaceId: .object(workspace)])
        candidate["canvases"] = .object([canvasId: .object(canvasRecord)])
        candidate["widgets"] = widgets.json
        candidate["relations"] = relations.json
        candidate["connections"] = connections.json
        candidate["glues"] = glues.json
        candidate["activePacks"] = .array([])
        candidate["activeWorkspaceId"] = .string(validationWorkspaceId)
        candidate["activeCanvasId"] = .string(canvasId)
        candidate["canvasViews"] = .object(JSONObject())

        if JSONWriter.stringify(.object(candidate)).utf16.count > maxJSONCharacters {
            throw CollaborationError("canvas payload exceeds \(maxJSONCharacters) characters")
        }
        guard let parsed = BoardParser.parsePersistedBoard(.object(candidate)), let parsedCanvas = parsed.canvases[canvasId] else {
            throw CollaborationError("canvas payload failed board validation")
        }

        // The canvas keeps its local record (workspace, parent, shared flag,
        // unknown keys); only the shared settings come from the document.
        var meta = localCanvas ?? parsedCanvas
        meta.name = parsedCanvas.name
        for key in ["gridIntensity", "linksVisible", "relationStrict"] {
            meta.record[key] = parsedCanvas.record[key]
        }
        return ValidatedCanvas(
            canvasId: canvasId,
            canvas: meta,
            widgets: parsed.widgets,
            relations: parsed.relations,
            connections: parsed.connections,
            glues: parsed.glues
        )
    }

    // MARK: - Validated canvas → board

    /// `mergeCanvasIntoBoard`: replace one canvas inside the board. Other
    /// canvases keep their records untouched; edges and glues touching a
    /// widget that was or is on this canvas come from the document.
    public static func merge(_ canvas: ValidatedCanvas, into board: Board) -> Board {
        let previousIds = Set(board.widgets.entries.filter { $0.value.canvasId == canvas.canvasId }.map(\.key))
        let relevant = previousIds.union(canvas.widgets.keys)
        var next = board
        next.widgets = board.widgets.filter { _, widget in widget.canvasId != canvas.canvasId }.merging(canvas.widgets)
        next.relations = board.relations.filter { _, edge in !relevant.contains(edge.fromId) && !relevant.contains(edge.toId) }
            .merging(canvas.relations)
        next.connections = board.connections.filter { _, edge in !relevant.contains(edge.fromId) && !relevant.contains(edge.toId) }
            .merging(canvas.connections)
        next.glues = board.glues.filter { _, glue in !glue.widgetIds.contains(where: relevant.contains) }
            .merging(canvas.glues)
        if var existing = board.canvases[canvas.canvasId] {
            existing.name = canvas.canvas.name
            for key in ["gridIntensity", "linksVisible", "relationStrict"] {
                existing.record[key] = canvas.canvas.record[key]
            }
            next.canvases[canvas.canvasId] = existing
        }
        return next
    }
}
