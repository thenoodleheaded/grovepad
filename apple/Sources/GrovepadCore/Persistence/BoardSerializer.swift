import Foundation

// ---------------------------------------------------------------------------
// Port of `serializePersistedBoard` and its helpers — the canonical write
// boundary for every board transport (IndexedDB/local store, cloud, package).
// Document key order: `{ ...unknownFields, format, v, workspaces, canvases,
// widgets, relations, connections, glues, activePacks }`. Device fields never
// appear.
// ---------------------------------------------------------------------------

public enum BoardSerializer {
    /// `serializePersistedBoard(state)` as an ordered JSON document.
    public static func serializePersistedBoard(_ board: Board) -> JSONObject {
        var widgets = JSONObject()
        for (id, widget) in board.widgets.entries {
            widgets[id] = .object(persistedWidgetRecord(id, widget))
        }

        let unknownRelations = retainOpaqueEdges(board.unknownRelations, widgets: board.widgets)
        let unknownConnections = retainOpaqueEdges(board.unknownConnections, widgets: board.widgets)
        let unknownGlues = retainOpaqueGlues(board.unknownGlues, widgets: board.widgets)

        var document = board.unknownFields
        document["format"] = .string(BoardFormat.format)
        document["v"] = .number(Double(BoardFormat.version))
        document["workspaces"] = board.workspaces.mapValues(\.record).json
        document["canvases"] = board.canvases.mapValues(\.record).json
        document["widgets"] = .object(widgets)
        document["relations"] = unknownRelations.merging(board.relations.mapValues(\.record)).json
        document["connections"] = unknownConnections.merging(board.connections.mapValues(\.record)).json
        document["glues"] = unknownGlues.merging(board.glues.mapValues(\.record)).json
        document["activePacks"] = .array(serializePacks(board.activePacks, rawPacks: board.rawActivePacks).map(JSONValue.string))
        return document
    }

    /// One widget exactly as the document writes it. Collaboration sends this
    /// record, so a shared canvas carries what a saved board would.
    public static func persistedWidgetRecord(_ id: String, _ widget: Widget) -> JSONObject {
        if var source = widget.opaqueSource {
            // The stashed source is the newer client's record verbatim; only
            // the two fields the reader owns are re-stamped, so the record can
            // never disagree with its map key or name a canvas that is gone.
            source["id"] = .string(id)
            source["canvasId"] = widget.record["canvasId"] ?? .string(widget.canvasId)
            return source
        }
        return BoardParser.normalizeWidgetData(widget).record
    }

    /// `JSON.stringify(serializePersistedBoard(state))`.
    public static func serializedText(_ board: Board) -> String {
        JSONWriter.stringify(.object(serializePersistedBoard(board)))
    }

    /// Opaque edges survive only while both endpoints still exist.
    static func retainOpaqueEdges(_ records: OrderedMap<JSONObject>, widgets: OrderedMap<Widget>) -> OrderedMap<JSONObject> {
        records.filter { _, value in
            guard let fromId = JS.key(value["fromId"]), let toId = JS.key(value["toId"]) else { return false }
            return widgets.contains(fromId) && widgets.contains(toId)
        }
    }

    /// Opaque glues keep only surviving members and need at least two.
    static func retainOpaqueGlues(_ records: OrderedMap<JSONObject>, widgets: OrderedMap<Widget>) -> OrderedMap<JSONObject> {
        var result = OrderedMap<JSONObject>()
        for (id, value) in records.entries {
            guard let rawIds = value.array("widgetIds") else { continue }
            let widgetIds = rawIds.filter { JS.key($0).map(widgets.contains) ?? false }
            guard widgetIds.count >= 2 else { continue }
            var retained = value
            retained["widgetIds"] = .array(widgetIds)
            result[id] = retained
        }
        return result
    }

    /// `serializePacks`: the original order is kept for packs that are still
    /// active and for strings this build does not know; newly activated packs
    /// append. Note the second loop deduplicates only against the first, so a
    /// duplicate inside `activePacks` itself is written twice — as on the web.
    static func serializePacks(_ activePacks: [String], rawPacks: [String]) -> [String] {
        let active = Set(activePacks)
        var seen = Set<String>()
        var serialized: [String] = []
        for pack in rawPacks {
            if !WidgetTypeCatalog.domainPackSet.contains(pack) {
                serialized.append(pack)
                continue
            }
            if active.contains(pack), !seen.contains(pack) {
                serialized.append(pack)
                seen.insert(pack)
            }
        }
        for pack in activePacks where !seen.contains(pack) {
            serialized.append(pack)
        }
        return serialized
    }
}
