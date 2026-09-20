import Foundation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// The board-level settle pass: `store/widgetSettling.ts` (`settleWidgetLayout`,
// `settleWidgetsByCanvas`) and `store/generationFloor.ts`
// (`enforceGenerationFloor`, `settleWithGenerationFloor`), ported function for
// function and in the web's iteration order — the spatial hash's buckets and
// the candidate set are insertion-ordered exactly like JavaScript `Set`s, so
// the same board settles to the same positions on both sides.
//
// Pure: widgets in, widgets out, positions mutated in place on the existing
// records (law 5). The one seam is `GlueMeasure` — a card's idle footprint
// (`restingFootprintWidget`) and whether it floats a name row
// (`widgetShowsTitleRow`) — which defaults to the registry.
// ---------------------------------------------------------------------------

public enum WidgetSettling {
    /// `LAYOUT_GAP`.
    public static let layoutGap = 24.0
    /// `SETTLE_ITERATION_LIMIT`.
    static let iterationLimit = 180
    /// `SETTLE_CELL`: the spatial hash's cell.
    static let settleCell = 640.0
    /// `GENERATION_GAP`: two cells between a parent's bottom and a child's top.
    public static let generationGap = CanvasGeometry.gridSize * 2
    /// `FLOOR_PASS_LIMIT`.
    static let floorPassLimit = 8

    /// `uniqueExistingIds`.
    static func uniqueExistingIds(_ ids: [String], _ widgets: OrderedMap<Widget>) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for id in ids where !seen.contains(id) && widgets.contains(id) {
            seen.insert(id)
            result.append(id)
        }
        return result
    }

    private struct CellRange: Equatable {
        var minCX: Int
        var minCY: Int
        var maxCX: Int
        var maxCY: Int
    }

    private struct CellKey: Hashable {
        var cx: Int
        var cy: Int
    }

    /// An insertion-ordered string set with JavaScript `Set` semantics:
    /// re-adding keeps the old slot; delete then add moves to the end.
    private struct OrderedSet {
        var items: [String] = []
        var members: Set<String> = []

        mutating func add(_ key: String) {
            if members.insert(key).inserted { items.append(key) }
        }

        mutating func delete(_ key: String) {
            guard members.remove(key) != nil, let index = items.firstIndex(of: key) else { return }
            items.remove(at: index)
        }
    }

    /// `Math.floor(v / SETTLE_CELL)` as a cell index.
    private static func cell(_ value: Double) -> Int {
        Int((value / settleCell).rounded(.down))
    }

    // MARK: - settleWidgetLayout

    /// `settleWidgetLayout`: push overlapping neighbours apart until the
    /// layout is collision-free, at CLUSTER granularity (a glue cluster is
    /// one rigid unit whose seams survive). `anchorIds` (and their clusters)
    /// neither move nor re-snap; everything else gives way around them.
    /// Returns the same map when nothing moved.
    public static func settleLayout(
        _ widgets: OrderedMap<Widget>,
        activeIds: [String],
        glueIndex: [String: String],
        anchorIds: [String] = [],
        measure: GlueMeasure = .registry
    ) -> OrderedMap<Widget> {
        let requested = uniqueExistingIds(activeIds, widgets)
        guard let firstId = requested.first else { return widgets }
        let canvasId = widgets[firstId]!.canvasId
        let allIds = widgets.keys.filter { widgets[$0]!.canvasId == canvasId }

        func clusterOf(_ id: String) -> String {
            if let gid = glueIndex[id], !gid.isEmpty { return "g:\(gid)" }
            return "w:\(id)"
        }
        var memberKeys: [String] = []
        var memberIds: [String: [String]] = [:]
        for id in allIds {
            let key = clusterOf(id)
            if memberIds[key] != nil {
                memberIds[key]!.append(id)
            } else {
                memberIds[key] = [id]
                memberKeys.append(key)
            }
        }

        var anchored = Set<String>()
        for id in anchorIds where widgets.contains(id) { anchored.insert(clusterOf(id)) }

        var queue: [String] = []
        var queued = Set<String>()
        for id in requested {
            if widgets[id]!.canvasId != canvasId { continue }
            let key = clusterOf(id)
            if queued.contains(key) { continue }
            queued.insert(key)
            queue.append(key)
        }
        if queue.isEmpty { return widgets }

        // Footprints never change during a settle — only positions do.
        var sizes: [String: Size] = [:]
        var heads: [String: Double] = [:]
        for id in allIds {
            let widget = widgets[id]!
            sizes[id] = measure.visibleSize(widget)
            heads[id] = measure.showsTitleRow(widget) ? widgetTitleRowHeight : 0
        }

        var positions: [String: Vector2D] = [:]
        // A multi-member cluster snaps RIGIDLY by the delta of the member
        // already closest to the grid, so its 0.3-cell seams survive.
        var rigidSnapDelta: [String: Vector2D] = [:]
        for key in memberKeys {
            let ids = memberIds[key]!
            guard queued.contains(key), key.hasPrefix("g:"), ids.count >= 2 else { continue }
            var best: Vector2D?
            for id in ids {
                let p = widgets[id]!.position
                let delta = Vector2D(x: CanvasGeometry.snapToGrid(p.x) - p.x, y: CanvasGeometry.snapToGrid(p.y) - p.y)
                if best == nil || abs(delta.x) + abs(delta.y) < abs(best!.x) + abs(best!.y) { best = delta }
            }
            rigidSnapDelta[key] = best!
        }
        for id in allIds {
            let widget = widgets[id]!
            let key = clusterOf(id)
            if let rigid = rigidSnapDelta[key] {
                positions[id] = Vector2D(x: widget.position.x + rigid.x, y: widget.position.y + rigid.y)
            } else if queued.contains(key), widget.iconified != true, !anchored.contains(key) {
                // An icon's continuous edge already sits off the grid on purpose.
                positions[id] = Vector2D(x: CanvasGeometry.snapToGrid(widget.position.x), y: CanvasGeometry.snapToGrid(widget.position.y))
            } else {
                positions[id] = widget.position
            }
        }

        // Overlaps INSIDE a queued cluster resolve first, by the cluster's own
        // rule (push exactly enough to touch again). Anchors hold; failing an
        // explicit anchor, the ids the caller queued hold.
        for key in memberKeys {
            let ids = memberIds[key]!
            guard queued.contains(key), key.hasPrefix("g:"), ids.count >= 2 else { continue }
            let boxes = ids.map { id -> WeldedBox in
                let pos = positions[id]!
                let head = heads[id]!
                let size = sizes[id]!
                return WeldedBox(id: id, rect: WorldRect(x: pos.x, y: pos.y - head, width: size.width, height: size.height + head))
            }
            let anchors = anchorIds.filter(ids.contains)
            let held = anchors.isEmpty ? requested.filter(ids.contains) : anchors
            for (id, next) in GlueGeometry.reflowWeldedCluster(boxes, anchorIds: held).entries {
                positions[id] = Vector2D(x: next.x, y: next.y + heads[id]!)
            }
        }

        func rectFor(_ key: String) -> WorldRect {
            let ids = memberIds[key]!
            let isCluster = key.hasPrefix("g:") && ids.count > 1
            var minX = Double.infinity, minY = Double.infinity, maxX = -Double.infinity, maxY = -Double.infinity
            for id in ids {
                let pos = positions[id]!
                let size = sizes[id]!
                minX = min(minX, pos.x)
                minY = min(minY, pos.y - heads[id]!)
                maxX = max(maxX, pos.x + size.width)
                maxY = max(maxY, pos.y + size.height)
            }
            // A group claims its frame band and the name row above its top line.
            if isCluster {
                minX -= GlueGeometry.frameBand
                maxX += GlueGeometry.frameBand
                minY -= GlueGeometry.titleHeadroom
                maxY += GlueGeometry.frameBand
            }
            return WorldRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
        }

        var cells: [CellKey: OrderedSet] = [:]
        var ranges: [String: CellRange] = [:]

        func rangeFor(_ key: String) -> CellRange {
            let rect = rectFor(key)
            return CellRange(
                minCX: cell(rect.x - layoutGap),
                minCY: cell(rect.y - layoutGap),
                maxCX: cell(rect.x + rect.width + layoutGap),
                maxCY: cell(rect.y + rect.height + layoutGap)
            )
        }

        func addToCells(_ key: String, _ range: CellRange) {
            for cy in range.minCY...range.maxCY {
                for cx in range.minCX...range.maxCX {
                    cells[CellKey(cx: cx, cy: cy), default: OrderedSet()].add(key)
                }
            }
            ranges[key] = range
        }

        func reindex(_ key: String) {
            let previous = ranges[key]!
            let next = rangeFor(key)
            if previous == next { return }
            for cy in previous.minCY...previous.maxCY {
                for cx in previous.minCX...previous.maxCX {
                    cells[CellKey(cx: cx, cy: cy)]?.delete(key)
                }
            }
            addToCells(key, next)
        }

        for key in memberKeys { addToCells(key, rangeFor(key)) }

        /// Rigid move: every member shifts by the same grid-aligned delta.
        func displace(_ key: String, _ dx: Double, _ dy: Double) -> Bool {
            if anchored.contains(key) { return false }
            for id in memberIds[key]! {
                let pos = positions[id]!
                positions[id] = Vector2D(x: pos.x + dx, y: pos.y + dy)
            }
            reindex(key)
            return true
        }

        /// The fewest whole cells that STRICTLY clear the overlap (at least one).
        func stepFor(_ overlap: Double) -> Double {
            ((overlap / CanvasGeometry.gridSize).rounded(.down) + 1) * CanvasGeometry.gridSize
        }

        var cursor = 0
        var iterations = 0
        while cursor < queue.count && iterations < iterationLimit {
            let activeKey = queue[cursor]
            cursor += 1
            // `queued` means "still scheduled": a cluster displaced after its
            // pass may come back onto the queue.
            queued.remove(activeKey)
            reindex(activeKey)
            let activeRect = rectFor(activeKey)
            let activeCenter = activeRect.center
            let activeRange = ranges[activeKey]!

            var candidates = OrderedSet()
            for cy in activeRange.minCY...activeRange.maxCY {
                for cx in activeRange.minCX...activeRange.maxCX {
                    guard let bucket = cells[CellKey(cx: cx, cy: cy)] else { continue }
                    for key in bucket.items { candidates.add(key) }
                }
            }

            for otherKey in candidates.items {
                if otherKey == activeKey { continue }
                let otherRect = rectFor(otherKey)
                // Only a GENUINE overlap may move anything.
                let overlapX = min(activeRect.x + activeRect.width, otherRect.x + otherRect.width) - max(activeRect.x, otherRect.x)
                let overlapY = min(activeRect.y + activeRect.height, otherRect.y + otherRect.height) - max(activeRect.y, otherRect.y)
                if overlapX <= 0 || overlapY <= 0 { continue }

                let otherCenter = otherRect.center
                let moved: Bool
                if overlapX <= overlapY {
                    let direction: Double = otherCenter.x >= activeCenter.x ? 1 : -1
                    moved = displace(otherKey, direction * stepFor(overlapX), 0)
                } else {
                    let direction: Double = otherCenter.y >= activeCenter.y ? 1 : -1
                    moved = displace(otherKey, 0, direction * stepFor(overlapY))
                }
                // An anchored neighbour never moves; re-queueing it would spin.
                if moved && !queued.contains(otherKey) {
                    queued.insert(otherKey)
                    queue.append(otherKey)
                }
            }
            iterations += 1
        }

        var next = widgets
        var changed = false
        for id in allIds {
            let widget = widgets[id]!
            let pos = positions[id]!
            if pos.x == widget.position.x && pos.y == widget.position.y { continue }
            var moved = widget
            moved.position = pos
            next[id] = moved
            changed = true
        }
        return changed ? next : widgets
    }

    /// `settleWidgetsByCanvas`: one settle per canvas the ids live on, in
    /// first-seen order.
    public static func settleByCanvas(
        _ widgets: OrderedMap<Widget>,
        activeIds: [String],
        glueIndex: [String: String],
        anchorIds: [String] = [],
        measure: GlueMeasure = .registry
    ) -> OrderedMap<Widget> {
        var canvasOrder: [String] = []
        var idsByCanvas: [String: [String]] = [:]
        for id in activeIds {
            guard let canvasId = widgets[id]?.canvasId, !canvasId.isEmpty else { continue }
            if idsByCanvas[canvasId] == nil {
                idsByCanvas[canvasId] = [id]
                canvasOrder.append(canvasId)
            } else {
                idsByCanvas[canvasId]!.append(id)
            }
        }
        var next = widgets
        for canvasId in canvasOrder {
            next = settleLayout(next, activeIds: idsByCanvas[canvasId]!, glueIndex: glueIndex, anchorIds: anchorIds, measure: measure)
        }
        return next
    }

    // MARK: - The generation floor

    private struct Unit {
        var key: String
        var ids: [String]
        var locked: Bool
    }

    /// `enforceGenerationFloor`: push every parent-linked child down until
    /// its top clears its parent's bottom by `generationGap`, carrying its
    /// whole branch; never up, never sideways; locked units hold. Returns
    /// the ids whose position changed (in board order), empty when the board
    /// already obeys the rule.
    public static func enforceGenerationFloor(
        _ widgets: inout OrderedMap<Widget>,
        relations: OrderedMap<Relation>,
        glueIndex: [String: String],
        measure: GlueMeasure = .registry
    ) -> [String] {
        func unitKey(_ id: String) -> String {
            if let gid = glueIndex[id], !gid.isEmpty { return "g:\(gid)" }
            return "w:\(id)"
        }
        let order = widgets.keys
        var units: [String: Unit] = [:]
        var unitOf: [String: String] = [:]
        for id in order {
            let widget = widgets[id]!
            let key = unitKey(widget.id)
            unitOf[widget.id] = key
            if units[key] != nil {
                units[key]!.ids.append(widget.id)
                units[key]!.locked = units[key]!.locked || widget.metadata.locked
            } else {
                units[key] = Unit(key: key, ids: [widget.id], locked: widget.metadata.locked)
            }
        }

        // Parent edges BETWEEN units, on one canvas.
        var edges: [(parent: String, child: String)] = []
        var childUnits: [String: [String]] = [:]
        var seen = Set<String>()
        for relation in relations.values {
            // The raw type string: an unknown type is not parenthood.
            guard relation.record.string("type") == "parent" else { continue }
            guard let from = widgets[relation.fromId], let to = widgets[relation.toId], from.canvasId == to.canvasId,
                  let parent = unitOf[relation.fromId], let child = unitOf[relation.toId] else { continue }
            if parent == child { continue }
            let key = "\(parent)>\(child)"
            if !seen.insert(key).inserted { continue }
            edges.append((parent, child))
            childUnits[parent, default: []].append(child)
        }
        if edges.isEmpty { return [] }

        var positions: [String: Vector2D] = [:]
        for id in order { positions[id] = widgets[id]!.position }

        func verticalSpan(_ unit: Unit) -> (top: Double, bottom: Double) {
            let isCluster = unit.key.hasPrefix("g:") && unit.ids.count > 1
            var top = Double.infinity
            var bottom = -Double.infinity
            for id in unit.ids {
                let widget = widgets[id]!
                let y = positions[id]!.y
                let head = measure.showsTitleRow(widget) ? widgetTitleRowHeight : 0
                top = min(top, y - head)
                bottom = max(bottom, y + measure.visibleSize(widget).height)
            }
            if isCluster {
                top -= GlueGeometry.titleHeadroom
                bottom += GlueGeometry.frameBand
            }
            return (top, bottom)
        }

        /// A unit and everything hanging under it (breadth first, cycle-safe).
        func branchOf(_ start: String) -> [String] {
            var collected: [String] = []
            var visited: Set<String> = [start]
            var queue = [start]
            var head = 0
            while head < queue.count {
                let key = queue[head]
                head += 1
                collected.append(key)
                for kid in childUnits[key] ?? [] where !visited.contains(kid) {
                    visited.insert(kid)
                    queue.append(kid)
                }
            }
            return collected
        }

        var moved = false
        for _ in 0..<floorPassLimit {
            var pushedThisPass = false
            for edge in edges {
                let parentUnit = units[edge.parent]!
                let childUnit = units[edge.child]!
                if childUnit.locked { continue }
                let floor = verticalSpan(parentUnit).bottom + generationGap
                let childTop = verticalSpan(childUnit).top
                let delta = floor - childTop
                if delta <= 0 { continue }
                for key in branchOf(edge.child) {
                    let unit = units[key]!
                    if unit.locked { continue }
                    for id in unit.ids {
                        positions[id] = Vector2D(x: positions[id]!.x, y: positions[id]!.y + delta)
                    }
                }
                pushedThisPass = true
                moved = true
            }
            if !pushedThisPass { break }
        }
        if !moved { return [] }

        var pushed: [String] = []
        for id in order {
            let position = positions[id]!
            guard var widget = widgets[id], position.y != widget.position.y else { continue }
            widget.position = position
            widgets[id] = widget
            pushed.append(id)
        }
        return pushed
    }

    /// `settleWithGenerationFloor`: clear overlaps, drop every child clear of
    /// its parent, then clear whatever that push landed on — holding the
    /// pushed cards where the rule put them.
    public static func settleWithGenerationFloor(
        _ widgets: OrderedMap<Widget>,
        activeIds: [String],
        glueIndex: [String: String],
        relations: OrderedMap<Relation>,
        anchorIds: [String] = [],
        measure: GlueMeasure = .registry
    ) -> OrderedMap<Widget> {
        let settled = settleLayout(widgets, activeIds: activeIds, glueIndex: glueIndex, anchorIds: anchorIds, measure: measure)
        var floored = settled
        let pushed = enforceGenerationFloor(&floored, relations: relations, glueIndex: glueIndex, measure: measure)
        if pushed.isEmpty { return settled }
        return settleLayout(floored, activeIds: pushed, glueIndex: glueIndex, anchorIds: anchorIds + pushed, measure: measure)
    }
}
