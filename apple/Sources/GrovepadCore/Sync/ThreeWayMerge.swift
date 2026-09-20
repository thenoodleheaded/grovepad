import Foundation

// ---------------------------------------------------------------------------
// Port of `src/utils/boardThreeWayMerge.ts` over serialized board documents.
//
// Reconciling two boards by comparing them to each other can only ever ask a
// question: they differ, so which one do you want? Comparing BOTH of them to
// the copy that was last synced answers it instead. For every record the base
// says which side actually moved:
//
//   local == cloud                  nothing happened
//   local == base, cloud moved      the other device edited it   -> take cloud
//   cloud == base, local moved      this device edited it        -> take local
//   both moved, differently         a real conflict              -> see below
//
// "Moved" includes deletion; a delete that raced an edit loses. Widgets carry
// content, so a real conflict keeps BOTH versions: the cloud copy stays at its
// own id and this device's version is kept beside it as a new card. Every
// other record (names, canvas metadata, links, glue) takes this device's
// version. The merge is total and silent (storage laws 8–10).
//
// Judged by `apple/Conformance/reconcile/*.json` (`mergedJson` byte for byte).
// ---------------------------------------------------------------------------

public struct ThreeWayMergeResult: Equatable {
    /// A raw union — run it through `BoardParser.parsePersistedBoard`, which
    /// owns referential integrity, before it reaches the document or the cloud.
    public var board: JSONObject
    /// Titles of cards that existed in two different versions and were both kept.
    public var keptBothTitles: [String]

    public init(board: JSONObject, keptBothTitles: [String]) {
        self.board = board
        self.keptBothTitles = keptBothTitles
    }
}

/// `mergeBoardsThreeWay(base, local, cloud, idFactory)`. Pass `base: nil`
/// only when no lineage exists (first sync on this device, or a lost
/// baseline); the merge then unions both sides, which is lossless but cannot
/// detect deletions.
public func mergeBoardsThreeWay(
    base: JSONObject?,
    local: JSONObject,
    cloud: JSONObject,
    mint: IdMinter = .system
) -> ThreeWayMergeResult {
    ThreeWayMerge.merge(base: base, local: local, cloud: cloud, mint: mint)
}

public enum ThreeWayMerge {
    static let keptBothSuffix = " (this device)"
    static let keptBothTitleLimit = 80

    struct MapMerge {
        var merged: JSONObject
        var conflicts: [(id: String, local: JSONObject, cloud: JSONObject)]
    }

    enum Preference { case local, cloud }

    /// `json(value)`: nil for an absent record, canonical JSON otherwise.
    private static func json(_ value: JSONValue?) -> String? {
        value.map(CloudDocuments.canonicalJson)
    }

    /// `mergeRecordMaps`: merge one id-keyed collection. `preferOnConflict`
    /// decides records whose two versions both moved; widgets pass `.cloud`
    /// and keep the local one separately.
    static func mergeRecordMaps(
        base: JSONObject?,
        local: JSONObject,
        cloud: JSONObject,
        preferOnConflict: Preference
    ) -> MapMerge {
        var merged = JSONObject()
        var conflicts: [(id: String, local: JSONObject, cloud: JSONObject)] = []
        let baseMap = base ?? JSONObject()
        // `new Set([...local keys, ...cloud keys, ...base keys])` — insertion order, deduplicated.
        var ids: [String] = []
        var seen = Set<String>()
        for id in local.keys + cloud.keys + baseMap.keys where seen.insert(id).inserted { ids.append(id) }

        for id in ids {
            let localRecord = local[id]
            let cloudRecord = cloud[id]
            let localJson = json(localRecord)
            let cloudJson = json(cloudRecord)
            // Identical on both sides — including "deleted on both sides".
            if localJson == cloudJson {
                if let localRecord { merged[id] = localRecord }
                continue
            }
            // A missing base entry is not a special case: an id absent from the
            // base is unequal to any present record, so a one-sided creation
            // takes the side that has it, and a two-sided creation of the same
            // id falls through to the conflict arm exactly like an edit.
            let baseJson = json(baseMap[id])
            if localJson == baseJson {
                if let cloudRecord { merged[id] = cloudRecord }
                continue
            }
            if cloudJson == baseJson {
                if let localRecord { merged[id] = localRecord }
                continue
            }
            // Both sides moved. A delete on one side against an edit on the
            // other is not a conflict worth keeping two copies of.
            guard let localRecord else {
                merged[id] = cloudRecord!
                continue
            }
            guard let cloudRecord else {
                merged[id] = localRecord
                continue
            }
            merged[id] = preferOnConflict == .cloud ? cloudRecord : localRecord
            if let localObject = localRecord.objectValue, let cloudObject = cloudRecord.objectValue {
                conflicts.append((id, localObject, cloudObject))
            }
        }
        return MapMerge(merged: merged, conflicts: conflicts)
    }

    /// `mergePacks`: packs are a set, so union is the honest merge — except
    /// for one that the base proves was deliberately turned off on one side.
    static func mergePacks(base: [JSONValue]?, local: [JSONValue], cloud: [JSONValue]) -> [JSONValue] {
        let basePacks = base ?? []
        let removedLocally = basePacks.filter { !local.contains($0) }
        let removedInCloud = basePacks.filter { !cloud.contains($0) }
        var union: [JSONValue] = []
        for pack in cloud + local where !union.contains(pack) { union.append(pack) }
        return union.filter { !removedLocally.contains($0) && !removedInCloud.contains($0) }
    }

    /// `keptBothTitle`: trimmed, `Card` when empty, suffixed once, clipped to
    /// 80 UTF-16 units including the suffix.
    static func keptBothTitle(_ title: JSONValue?) -> JSONValue {
        let suffix = Array(keptBothSuffix.utf16)
        var units = title.flatMap(JS.units) ?? []
        while let first = units.first, JS.isWhitespace(first) { units.removeFirst() }
        while let last = units.last, JS.isWhitespace(last) { units.removeLast() }
        if units.isEmpty { units = Array("Card".utf16) }
        if units.count >= suffix.count, Array(units.suffix(suffix.count)) == suffix {
            return JS.string(fromUnits: units)
        }
        return JS.string(fromUnits: Array(units.prefix(keptBothTitleLimit - suffix.count)) + suffix)
    }

    static func merge(base: JSONObject?, local: JSONObject, cloud: JSONObject, mint: IdMinter) -> ThreeWayMergeResult {
        func map(_ key: String, _ preference: Preference) -> MapMerge {
            mergeRecordMaps(
                base: base?.object(key),
                local: local.object(key) ?? JSONObject(),
                cloud: cloud.object(key) ?? JSONObject(),
                preferOnConflict: preference
            )
        }
        let workspaces = map("workspaces", .local)
        let canvases = map("canvases", .local)
        var widgets = map("widgets", .cloud)
        let relations = map("relations", .local)
        let connections = map("connections", .local)
        let glues = map("glues", .local)

        // Keep this device's version of every genuinely conflicted card, beside
        // the cloud version rather than on top of it. A fresh id keeps it out of
        // the cloud copy's glue cluster and links, which stay pointed at the original.
        var occupied = Set(widgets.merged.keys)
        var keptBothTitles: [String] = []
        for conflict in widgets.conflicts {
            var id = mint()
            while occupied.contains(id) { id = mint() }
            occupied.insert(id)
            let source = conflict.local
            let title = keptBothTitle(source["title"])
            var copy = source
            copy["id"] = .string(id)
            copy["title"] = title
            let position = source.object("position") ?? JSONObject()
            let size = source.object("size") ?? JSONObject()
            var moved = JSONObject()
            moved["x"] = .number(position.number("x") ?? .nan)
            moved["y"] = .number((position.number("y") ?? .nan) + (size.number("height") ?? .nan) + CanvasGeometry.gridSize)
            copy["position"] = .object(moved)
            widgets.merged[id] = .object(copy)
            keptBothTitles.append(title.stringValue ?? "")
        }

        // `{ ...cloud, ...local, format, v, …records, activePacks }`:
        // unrecognized top-level fields from a newer build survive from both
        // sides; this device's copy wins where the two disagree.
        var board = cloud.merging(local)
        board["format"] = local["format"]
        board["v"] = local["v"]
        board["workspaces"] = .object(workspaces.merged)
        board["canvases"] = .object(canvases.merged)
        board["widgets"] = .object(widgets.merged)
        board["relations"] = .object(relations.merged)
        board["connections"] = .object(connections.merged)
        board["glues"] = .object(glues.merged)
        board["activePacks"] = .array(mergePacks(
            base: base?.array("activePacks"),
            local: local.array("activePacks") ?? [],
            cloud: cloud.array("activePacks") ?? []
        ))
        return ThreeWayMergeResult(board: board, keptBothTitles: keptBothTitles)
    }
}
