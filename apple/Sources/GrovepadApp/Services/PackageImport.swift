import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Opening a `.grovepad` package. Two ways in:
//
//   - `.newWorkspace` — every workspace the package holds becomes a fresh
//     workspace on the current board (the archive's ids are reminted so two
//     imports of the same file never collide); the first new root canvas is
//     what the app navigates to. This is the "at minimum" route the phase-6
//     brief asks for.
//   - `.replace` — the package's board becomes the board (what the preview
//     shell and the web's file open do).
//
// The web's `importBoardFileOntoCanvas` places the archive as a Canvas card
// on the current canvas instead; that door-card variant depends on the
// layout engine and is deferred (see apple/AGENTS.md). Media blobs are
// stored under the keys the archive carries: no in-scope widget reads a
// media key, and the locked newer-client placeholders that might keep
// their references intact only if the key does not move.
// ---------------------------------------------------------------------------

public enum PackageImportMode: Equatable, Sendable {
    case newWorkspace
    case replace
}

public struct PackageImportResult: Equatable {
    public var board: Board
    /// The workspaces the import created (`.newWorkspace`), in archive order.
    public var workspaceIds: [String]
    /// Where to land: the first imported root canvas, or the package's own.
    public var landingCanvasId: String
    public var widgetCount: Int
}

public enum PackageImport {
    /// `canvasImportTitle`: the file name without its extension.
    public static func title(forFileName name: String) -> String {
        var text = name
        for ext in [".grovepad", ".json", ".GROVEPAD", ".JSON"] where text.hasSuffix(ext) {
            text = String(text.dropLast(ext.count))
            break
        }
        text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? "Imported board" : text
    }

    public static func apply(_ package: ImportedPackage, to current: Board, mode: PackageImportMode, title: String, mint: IdMinter = .system, clock: Clock = .system) -> PackageImportResult {
        switch mode {
        case .replace:
            let board = package.board
            let landing = board.canvases.contains(board.activeCanvasId) ? board.activeCanvasId
                : (board.workspaces.values.first?.rootCanvasId ?? board.canvases.keys.first ?? "")
            return PackageImportResult(board: board, workspaceIds: [], landingCanvasId: landing, widgetCount: board.widgets.count)
        case .newWorkspace:
            return merge(package.board, into: current, title: title, mint: mint, clock: clock)
        }
    }

    /// Remint every id in `imported` and append its records to `current`.
    static func merge(_ imported: Board, into current: Board, title: String, mint: IdMinter, clock: Clock) -> PackageImportResult {
        var ids: [String: String] = [:]
        func fresh(_ old: String) -> String {
            if let known = ids[old] { return known }
            let next = mint()
            ids[old] = next
            return next
        }
        // Mint in a stable order (workspaces, canvases, widgets, then the
        // rest) so a counting minter yields predictable ids.
        for key in imported.workspaces.keys { _ = fresh(key) }
        for key in imported.canvases.keys { _ = fresh(key) }
        for key in imported.widgets.keys { _ = fresh(key) }
        for key in imported.relations.keys { _ = fresh(key) }
        for key in imported.connections.keys { _ = fresh(key) }
        for key in imported.glues.keys { _ = fresh(key) }

        var board = current
        let manyWorkspaces = imported.workspaces.count > 1
        var workspaceIds: [String] = []
        var landing: String?

        for workspace in imported.workspaces.values {
            var next = workspace
            next.record["id"] = .string(fresh(workspace.id))
            next.rootCanvasId = fresh(workspace.rootCanvasId)
            next.name = manyWorkspaces ? "\(title) — \(workspace.name)" : title
            next.record["createdAt"] = .number(clock.nowMs())
            next.sortIndex = nil
            board.workspaces[next.id] = next
            workspaceIds.append(next.id)
            if landing == nil, imported.canvases.contains(workspace.rootCanvasId) { landing = next.rootCanvasId }
        }

        for canvas in imported.canvases.values {
            var next = canvas
            next.id = fresh(canvas.id)
            next.record["workspaceId"] = .string(fresh(canvas.workspaceId))
            next.parentCanvasId = canvas.parentCanvasId.map(fresh)
            board.canvases[next.id] = next
        }

        for widget in imported.widgets.values {
            var next = widget
            next.record["id"] = .string(fresh(widget.id))
            next.canvasId = fresh(widget.canvasId)
            if widget.type == "canvas_node", let door = widget.data.string("canvasId"), imported.canvases.contains(door) {
                var data = widget.data
                data["canvasId"] = .string(fresh(door))
                next.data = data
            }
            if var source = next.opaqueSource {
                source["id"] = .string(next.id)
                source["canvasId"] = .string(next.canvasId)
                next.opaqueSource = source
            }
            board.widgets[next.id] = next
        }

        for relation in imported.relations.values {
            var next = relation
            next.record["id"] = .string(fresh(relation.id))
            next.record["fromId"] = .string(fresh(relation.fromId))
            next.record["toId"] = .string(fresh(relation.toId))
            board.relations[next.id] = next
        }

        for connection in imported.connections.values {
            var next = connection
            next.record["id"] = .string(fresh(connection.id))
            next.record["fromId"] = .string(fresh(connection.fromId))
            next.record["toId"] = .string(fresh(connection.toId))
            board.connections[next.id] = next
        }

        for glue in imported.glues.values {
            var next = glue
            next.record["id"] = .string(fresh(glue.id))
            next.widgetIds = glue.widgetIds.map(fresh)
            if let restore = glue.record.object("restore") {
                var remapped = JSONObject()
                for (id, entry) in restore.entries { remapped[fresh(id)] = entry }
                next.record["restore"] = .object(remapped)
            }
            board.glues[next.id] = next
        }

        // Records this build does not understand travel with their endpoints
        // remapped where the keys are the standard ones (law 5: the rest of
        // the record is untouched).
        func remapUnknown(_ records: OrderedMap<JSONObject>) -> OrderedMap<JSONObject> {
            var result = OrderedMap<JSONObject>()
            for (key, record) in records.entries {
                var next = record
                let id = fresh(key)
                next["id"] = .string(id)
                for field in ["fromId", "toId"] {
                    if let old = record.string(field) { next[field] = .string(fresh(old)) }
                }
                if let members = record.array("widgetIds") {
                    next["widgetIds"] = .array(members.map { $0.stringValue.map { .string(fresh($0)) } ?? $0 })
                }
                result[id] = next
            }
            return result
        }
        board.unknownRelations = board.unknownRelations.merging(remapUnknown(imported.unknownRelations))
        board.unknownConnections = board.unknownConnections.merging(remapUnknown(imported.unknownConnections))
        board.unknownGlues = board.unknownGlues.merging(remapUnknown(imported.unknownGlues))

        for pack in imported.activePacks where !board.activePacks.contains(pack) { board.activePacks.append(pack) }
        for pack in imported.rawActivePacks where !board.rawActivePacks.contains(pack) { board.rawActivePacks.append(pack) }

        if let landing, let workspace = workspaceIds.first {
            board.activeWorkspaceId = workspace
            board.activeCanvasId = landing
        }
        return PackageImportResult(
            board: board,
            workspaceIds: workspaceIds,
            landingCanvasId: landing ?? current.activeCanvasId,
            widgetCount: imported.widgets.count
        )
    }
}
