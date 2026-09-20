import Foundation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// Widget groups (glue clusters): the geometry half of `utils/glueGeometry.ts`,
// ported function for function. A group is NOT an object on the board: its
// members stay individual cards stored grid-aligned and touching, each drawn
// inset by half a seam on every welded edge so the 0.3-cell gap is carved
// equally from both cards and the cluster's outer corners hold the grid.
//
// Everything here is pure: it takes widgets and returns widgets. The one seam
// is `GlueMeasure` — what a card's visible box is (its resting tile while it
// rests) and whether it floats a name row — which defaults to the registry
// and is swappable in tests. Numbers are the web's to the pixel: a board
// welded here must reconcile identically when the web opens it.
// ---------------------------------------------------------------------------

/// How much a card gives up on each edge when it is drawn (`GlueEdgeInsets`).
public typealias GlueEdgeInsets = CardInsets

/// The option-drag weld preview a release would commit (`GlueIntent`).
public struct GlueIntent: Equatable, Sendable {
    public var draggedId: String
    public var targetId: String
    /// Where the dragged card's top-left lands when the bond commits.
    public var position: Vector2D
    public var axis: GlueAxis

    public init(draggedId: String, targetId: String, position: Vector2D, axis: GlueAxis) {
        self.draggedId = draggedId
        self.targetId = targetId
        self.position = position
        self.axis = axis
    }
}

public enum GlueAxis: String, Equatable, Sendable { case x, y }

/// `GlueSnap`: the bond an option-drag would commit.
public struct GlueSnap: Equatable, Sendable {
    public var targetId: String
    public var position: Vector2D
    public var axis: GlueAxis
}

/// `WeldedBox`.
public struct WeldedBox: Equatable, Sendable {
    public var id: String
    public var rect: WorldRect

    public init(id: String, rect: WorldRect) {
        self.id = id
        self.rect = rect
    }
}

/// `CollapsedLayout`.
public struct CollapsedClusterLayout: Equatable, Sendable {
    public var width: Double
    public var height: Double
    public var offsets: [Vector2D]
}

/// What a card looks like to the glue geometry: the visible box and whether
/// a name row floats above it (`glueBoxRect`, `widgetShowsTitleRow`).
public struct GlueMeasure {
    public var visibleSize: (Widget) -> Size
    public var showsTitleRow: (Widget) -> Bool

    public init(visibleSize: @escaping (Widget) -> Size, showsTitleRow: @escaping (Widget) -> Bool) {
        self.visibleSize = visibleSize
        self.showsTitleRow = showsTitleRow
    }

    /// The registry's answer, read at idle (`expandedWidgetId: null`): a
    /// resting card is its tile, everything else its stored card; a card
    /// floats a name row unless it is an icon or rests as a bare icon face.
    public static let registry: GlueMeasure = {
        let idle = WidgetRestContextFactory.make()
        return GlueMeasure(
            visibleSize: { widget in idle.isResting(widget) ? idle.restingTileSize(widget) : widget.size },
            showsTitleRow: { widget in
                if widget.iconified == true { return false }
                if idle.isResting(widget), WidgetRendererRegistry.renderer(for: widget.type).restingFace(widget) == .icon { return false }
                return true
            }
        )
    }()

    /// Stored boxes, every card floating a name row unless iconified: the
    /// geometry without the registry (tests of the pure rules).
    public static let stored = GlueMeasure(visibleSize: { $0.size }, showsTitleRow: { $0.iconified != true })
}

public enum GlueGeometry {
    static let grid = CanvasGeometry.gridSize

    /// `GLUE_GAP`: the seam, 0.3 of a cell (12).
    public static let gap = jsRound(grid * 0.3)
    /// `GLUE_HALF_GAP` (6).
    public static let halfGap = jsRound(gap / 2)
    /// `GLUE_RANGE`: the option-drag's reach, edge to edge (40).
    public static let range = grid
    /// `GLUE_FRAME_BAND`: the group frame's band around the members (20).
    public static let frameBand = jsRound(grid * 0.5)
    /// `GLUE_TITLE_ROW_H` and its gap above the top boundary line.
    public static let titleRowHeight = 28.0
    static let titleRowGap = 4.0
    /// `GLUE_TITLE_HEADROOM` (52).
    public static let titleHeadroom = frameBand + titleRowHeight + titleRowGap
    /// `GLUE_MIN_OVERLAP`: a bond needs half a cell of shared edge.
    static let minOverlap = grid / 2
    /// `GLUE_OVERSHOOT`: how far a drag may push INTO its target and still weld.
    static let overshoot = jsRound(grid / 2)
    /// `TOUCH_EPS`.
    static let touchEps = 1.5
    /// `REFLOW_EPS`, `REFLOW_PASSES`.
    static let reflowEps = 0.5
    static let reflowPasses = 24
    /// `WIDGET_TITLE_ROW`.
    static let titleRow = widgetTitleRowHeight
    /// `COLLAPSED_MEMBER_SIZE`: one grid cell.
    public static let collapsedMemberSize = Size(width: grid, height: grid)

    // MARK: - Boxes

    /// `glueBoxRect`: the box a member visually occupies.
    public static func boxRect(_ widget: Widget, _ measure: GlueMeasure = .registry) -> WorldRect {
        let size = measure.visibleSize(widget)
        return WorldRect(x: widget.position.x, y: widget.position.y, width: size.width, height: size.height)
    }

    /// `glueChromeRect`: the box plus the name row it floats, if any.
    public static func chromeRect(_ widget: Widget, _ measure: GlueMeasure = .registry) -> WorldRect {
        let box = boxRect(widget, measure)
        guard measure.showsTitleRow(widget) else { return box }
        return WorldRect(x: box.x, y: box.y - titleRow, width: box.width, height: box.height + titleRow)
    }

    /// The headroom a stored position sits below its chrome top.
    static func head(_ widget: Widget, _ measure: GlueMeasure) -> Double {
        measure.showsTitleRow(widget) ? titleRow : 0
    }

    struct EdgeGaps {
        var gapX: Double
        var gapY: Double
        var overlapX: Double { -gapX }
        var overlapY: Double { -gapY }
    }

    static func edgeGaps(_ a: WorldRect, _ b: WorldRect) -> EdgeGaps {
        EdgeGaps(
            gapX: max(a.x, b.x) - min(a.x + a.width, b.x + b.width),
            gapY: max(a.y, b.y) - min(a.y + a.height, b.y + b.height)
        )
    }

    /// `glueSeparation`: edge-to-edge distance, 0 when touching or overlapping.
    public static func separation(_ a: WorldRect, _ b: WorldRect) -> Double {
        let gaps = edgeGaps(a, b)
        return max(gaps.gapX, gaps.gapY, 0)
    }

    /// `edgeInsets`: which edges weld to a clustermate.
    static func edgeInsets(_ a: WorldRect, others: [WorldRect]) -> GlueEdgeInsets {
        var insets = GlueEdgeInsets.zero
        for o in others {
            let overlapY = min(a.y + a.height, o.y + o.height) - max(a.y, o.y)
            let overlapX = min(a.x + a.width, o.x + o.width) - max(a.x, o.x)
            if overlapY > touchEps {
                if abs(a.x + a.width - o.x) <= touchEps { insets.right = halfGap }
                if abs(a.x - (o.x + o.width)) <= touchEps { insets.left = halfGap }
            }
            if overlapX > touchEps {
                if abs(a.y + a.height - o.y) <= touchEps { insets.bottom = halfGap }
                if abs(a.y - (o.y + o.height)) <= touchEps { insets.top = halfGap }
            }
        }
        return insets
    }

    /// `glueMemberInsets`: the render insets for one member.
    public static func memberInsets(_ widgetId: String, memberIds: [String], widgets: OrderedMap<Widget>, measure: GlueMeasure = .registry) -> GlueEdgeInsets {
        guard let me = widgets[widgetId] else { return .zero }
        let others = memberIds.filter { $0 != widgetId }.compactMap { widgets[$0] }.map { boxRect($0, measure) }
        return edgeInsets(boxRect(me, measure), others: others)
    }

    /// `foldedMemberInsets`: every folded cell gives up the half-seam on all
    /// four edges, so the block reads as one even grid.
    public static func foldedMemberInsets() -> GlueEdgeInsets {
        GlueEdgeInsets(top: halfGap, left: halfGap, bottom: halfGap, right: halfGap)
    }

    /// Render insets for every member of every group on a canvas: the seam
    /// carve for welded clusters, the even fold for collapsed ones.
    public static func renderInsets(glues: OrderedMap<WidgetGlue>, widgets: OrderedMap<Widget>, canvasId: String, measure: GlueMeasure = .registry) -> [String: GlueEdgeInsets] {
        var result: [String: GlueEdgeInsets] = [:]
        for glue in glues.values {
            let members = glue.widgetIds.filter { widgets[$0]?.canvasId == canvasId }
            guard members.count >= 2 else { continue }
            if glue.collapsed {
                for id in members { result[id] = foldedMemberInsets() }
            } else {
                for id in members {
                    let insets = memberInsets(id, memberIds: members, widgets: widgets, measure: measure)
                    if insets != .zero { result[id] = insets }
                }
            }
        }
        return result
    }

    // MARK: - Envelopes

    /// `clusterChromeEnvelope`: the union of every member's chrome box.
    public static func chromeEnvelope(_ memberIds: [String], widgets: OrderedMap<Widget>, measure: GlueMeasure = .registry) -> WorldRect? {
        var minX = Double.infinity, minY = Double.infinity, maxX = -Double.infinity, maxY = -Double.infinity
        var found = false
        for id in memberIds {
            guard let widget = widgets[id] else { continue }
            found = true
            let b = chromeRect(widget, measure)
            minX = min(minX, b.x)
            minY = min(minY, b.y)
            maxX = max(maxX, b.x + b.width)
            maxY = max(maxY, b.y + b.height)
        }
        return found ? WorldRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY) : nil
    }

    /// `clusterFrameEnvelope`: the chrome envelope grown by the frame band.
    public static func frameEnvelope(_ memberIds: [String], widgets: OrderedMap<Widget>, measure: GlueMeasure = .registry) -> WorldRect? {
        guard let env = chromeEnvelope(memberIds, widgets: widgets, measure: measure) else { return nil }
        return WorldRect(x: env.x - frameBand, y: env.y - frameBand, width: env.width + frameBand * 2, height: env.height + frameBand * 2)
    }

    /// `GLUE_NAME_MAX`, `GLUE_NAME_CHAR`, `GLUE_TITLE_ICON`,
    /// `GLUE_TITLE_BUTTON`, `GLUE_TITLE_BUTTONS_MAX`.
    static let nameMax = 200.0
    static let nameChar = 7.0
    static let titleIcon = 28.0 + 8
    static let titleButton = 22.0
    static let titleButtonsMax = 5.0

    /// `clusterTitleRowRect`: the name row as painted, only as wide as its
    /// icon, name and buttons.
    public static func titleRowRect(_ memberIds: [String], widgets: OrderedMap<Widget>, name: String?, measure: GlueMeasure = .registry) -> WorldRect? {
        guard let env = chromeEnvelope(memberIds, widgets: widgets, measure: measure) else { return nil }
        let trimmed = name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let label = trimmed.isEmpty ? "Group" : trimmed
        let width = titleIcon + min(nameMax, Double(label.utf16.count) * nameChar) + titleButton * titleButtonsMax
        return WorldRect(x: env.x, y: env.y - titleHeadroom, width: width, height: titleRowHeight)
    }

    // MARK: - Reflow (push) and compaction (pull)

    private struct Live {
        var id: String
        var x: Double
        var y: Double
        var width: Double
        var height: Double

        init(_ box: WeldedBox) {
            id = box.id
            x = box.rect.x
            y = box.rect.y
            width = box.rect.width
            height = box.rect.height
        }
    }

    /// `reflowWeldedCluster`: push overlapping members apart by exactly the
    /// penetration, along the axis each pair is arranged on. Anchors hold.
    public static func reflowWeldedCluster(_ boxes: [WeldedBox], anchorIds: [String]) -> OrderedMap<Vector2D> {
        var moved = OrderedMap<Vector2D>()
        if boxes.count < 2 { return moved }
        var anchored = Set(anchorIds)
        if !boxes.contains(where: { anchored.contains($0.id) }) { anchored.insert(boxes[0].id) }

        var live = boxes.map(Live.init)
        var dirty = false
        var envMinX = Double.infinity, envMinY = Double.infinity, envMaxX = -Double.infinity, envMaxY = -Double.infinity
        for rect in live {
            envMinX = min(envMinX, rect.x)
            envMinY = min(envMinY, rect.y)
            envMaxX = max(envMaxX, rect.x + rect.width)
            envMaxY = max(envMaxY, rect.y + rect.height)
        }
        let clusterRunsX = envMaxX - envMinX >= envMaxY - envMinY

        for _ in 0..<reflowPasses {
            var overlapped = false
            for i in 0..<live.count {
                for j in (i + 1)..<live.count {
                    var a = live[i]
                    var b = live[j]
                    let overlapX = min(a.x + a.width, b.x + b.width) - max(a.x, b.x)
                    let overlapY = min(a.y + a.height, b.y + b.height) - max(a.y, b.y)
                    if overlapX <= reflowEps || overlapY <= reflowEps { continue }
                    let aFixed = anchored.contains(a.id)
                    let bFixed = anchored.contains(b.id)
                    if aFixed && bFixed { continue }
                    overlapped = true
                    dirty = true
                    let shareA = aFixed ? 0.0 : bFixed ? 1.0 : 0.5
                    let shareB = 1 - shareA
                    let spanX = (a.width + b.width) / 2
                    let spanY = (a.height + b.height) / 2
                    let alongX = abs(a.x + a.width / 2 - (b.x + b.width / 2)) / (spanX == 0 ? 1 : spanX)
                    let alongY = abs(a.y + a.height / 2 - (b.y + b.height / 2)) / (spanY == 0 ? 1 : spanY)
                    let swallowed =
                        min(overlapX, a.width, b.width) >= min(a.width, b.width) - reflowEps &&
                        min(overlapY, a.height, b.height) >= min(a.height, b.height) - reflowEps
                    let pushX = swallowed ? clusterRunsX : (alongX == alongY ? overlapX <= overlapY : alongX > alongY)
                    if pushX {
                        let direction: Double = a.x + a.width / 2 <= b.x + b.width / 2 ? -1 : 1
                        let travel = direction < 0 ? a.x + a.width - b.x : b.x + b.width - a.x
                        a.x += direction * travel * shareA
                        b.x -= direction * travel * shareB
                    } else {
                        let direction: Double = a.y + a.height / 2 <= b.y + b.height / 2 ? -1 : 1
                        let travel = direction < 0 ? a.y + a.height - b.y : b.y + b.height - a.y
                        a.y += direction * travel * shareA
                        b.y -= direction * travel * shareB
                    }
                    live[i] = a
                    live[j] = b
                }
            }
            if !overlapped { break }
        }

        guard dirty else { return moved }
        for (index, start) in boxes.enumerated() {
            let x = jsRound(live[index].x)
            let y = jsRound(live[index].y)
            if x != start.rect.x || y != start.rect.y { moved[start.id] = Vector2D(x: x, y: y) }
        }
        return moved
    }

    /// `compactWeldedCluster`: the exact mirror of the push — free members
    /// slide toward the anchored block, one axis at a time, nearest first,
    /// stopping the moment they meet something. A seam-wide gap is a weld.
    public static func compactWeldedCluster(_ boxes: [WeldedBox], anchorIds: [String]) -> OrderedMap<Vector2D> {
        var moved = OrderedMap<Vector2D>()
        if boxes.count < 2 { return moved }
        let ids = Set(boxes.map(\.id))
        var anchored = Set(anchorIds.filter { ids.contains($0) })
        if anchored.isEmpty { anchored.insert(boxes[0].id) }

        var live = boxes.map(Live.init)
        var blockMinX = Double.infinity, blockMinY = Double.infinity, blockMaxX = -Double.infinity, blockMaxY = -Double.infinity
        for rect in live where anchored.contains(rect.id) {
            blockMinX = min(blockMinX, rect.x)
            blockMinY = min(blockMinY, rect.y)
            blockMaxX = max(blockMaxX, rect.x + rect.width)
            blockMaxY = max(blockMaxY, rect.y + rect.height)
        }
        let freeIndices = live.indices.filter { !anchored.contains(live[$0].id) }
        if freeIndices.isEmpty { return moved }
        var dirty = false

        // Axis accessors: (position, size, perpendicular position, perpendicular size).
        func pos(_ r: Live, _ xAxis: Bool) -> Double { xAxis ? r.x : r.y }
        func size(_ r: Live, _ xAxis: Bool) -> Double { xAxis ? r.width : r.height }
        func perpPos(_ r: Live, _ xAxis: Bool) -> Double { xAxis ? r.y : r.x }
        func perpSize(_ r: Live, _ xAxis: Bool) -> Double { xAxis ? r.height : r.width }

        for _ in 0..<reflowPasses {
            var closed = false
            for xAxis in [true, false] {
                let blockMin = xAxis ? blockMinX : blockMinY
                let blockMax = xAxis ? blockMaxX : blockMaxY
                let blockCentre = (blockMin + blockMax) / 2
                let ordered = freeIndices.enumerated().sorted { lhs, rhs in
                    let a = abs(pos(live[lhs.element], xAxis) + size(live[lhs.element], xAxis) / 2 - blockCentre)
                    let b = abs(pos(live[rhs.element], xAxis) + size(live[rhs.element], xAxis) / 2 - blockCentre)
                    return a != b ? a < b : lhs.offset < rhs.offset
                }.map(\.element)
                for index in ordered {
                    let rect = live[index]
                    let start = pos(rect, xAxis)
                    let end = start + size(rect, xAxis)
                    let direction: Double = end <= blockMin + reflowEps ? 1 : start >= blockMax - reflowEps ? -1 : 0
                    if direction == 0 { continue }
                    var travel = Double.infinity
                    for (otherIndex, other) in live.enumerated() where otherIndex != index {
                        let lane = min(perpPos(rect, xAxis) + perpSize(rect, xAxis), perpPos(other, xAxis) + perpSize(other, xAxis)) -
                            max(perpPos(rect, xAxis), perpPos(other, xAxis))
                        if lane <= reflowEps { continue }
                        let space = direction < 0 ? start - (pos(other, xAxis) + size(other, xAxis)) : pos(other, xAxis) - end
                        if space < -reflowEps { continue }
                        // A gap no wider than the seam IS the weld.
                        travel = min(travel, space <= GlueGeometry.gap + reflowEps ? 0 : space)
                    }
                    if travel == .infinity || travel <= reflowEps { continue }
                    if xAxis { live[index].x += direction * travel } else { live[index].y += direction * travel }
                    closed = true
                    dirty = true
                }
            }
            if !closed { break }
        }

        guard dirty else { return moved }
        for (index, start) in boxes.enumerated() {
            let x = jsRound(live[index].x)
            let y = jsRound(live[index].y)
            if x != start.rect.x || y != start.rect.y { moved[start.id] = Vector2D(x: x, y: y) }
        }
        return moved
    }

    // MARK: - Collapsed clusters

    /// `collapsedClusterLayout`: single cells packed into the closest square,
    /// short rows centred on whole cells (the ghost tree's stacking).
    public static func collapsedClusterLayout(_ count: Int) -> CollapsedClusterLayout {
        let total = max(0, count)
        if total == 0 { return CollapsedClusterLayout(width: 0, height: 0, offsets: []) }
        let rowCounts = GhostTree.balancedRowCounts(total)
        let columns = rowCounts.max() ?? 1
        var offsets: [Vector2D] = []
        for (row, rowCount) in rowCounts.enumerated() {
            let lead = (columns - rowCount) / 2
            for column in 0..<rowCount {
                offsets.append(Vector2D(
                    x: Double(lead + column) * collapsedMemberSize.width,
                    y: Double(row) * collapsedMemberSize.height
                ))
            }
        }
        return CollapsedClusterLayout(
            width: Double(columns) * collapsedMemberSize.width,
            height: Double(rowCounts.count) * collapsedMemberSize.height,
            offsets: offsets
        )
    }

    /// The restore map as an ordered JSON object (`WidgetGlue.restore`).
    public typealias RestoreMap = OrderedMap<GlueRestoreEntry>

    /// `glue.restore` in stored key order.
    public static func restoreMap(of glue: WidgetGlue) -> RestoreMap? {
        guard let object = glue.record.object("restore") else { return nil }
        var result = RestoreMap()
        for (id, entry) in object.entries {
            guard let entry = entry.objectValue, let x = entry.number("x"), let y = entry.number("y"),
                  let width = entry.number("width"), let height = entry.number("height") else { continue }
            result[id] = GlueRestoreEntry(x: x, y: y, width: width, height: height, iconified: entry.bool("iconified") ?? false)
        }
        return result
    }

    /// Writes a restore map onto a glue record, entry by entry.
    public static func restoreJSON(_ map: RestoreMap) -> JSONValue {
        var object = JSONObject()
        for (id, entry) in map.entries { object[id] = entry.json }
        return .object(object)
    }

    /// `refoldCollapsedCluster`: the one owner of what a folded group looks
    /// like — every member one cell, packed, the block anchored on members
    /// already folded; newcomers record their current state now.
    public static func refoldCollapsedCluster(
        _ widgets: OrderedMap<Widget>, memberIds: [String], existingRestore: RestoreMap?, previousFoldedAt: Vector2D?
    ) -> (widgets: OrderedMap<Widget>, restore: RestoreMap, anchor: Vector2D) {
        let present = memberIds.filter { widgets.contains($0) }
        let anchorFrom = present.filter { existingRestore?[$0] != nil }
        let forAnchor = anchorFrom.isEmpty ? present : anchorFrom
        var anchorX = Double.infinity, anchorY = Double.infinity
        for id in forAnchor {
            anchorX = min(anchorX, widgets[id]!.position.x)
            anchorY = min(anchorY, widgets[id]!.position.y)
        }
        anchorX = CanvasGeometry.snapToGrid(anchorX.isFinite ? anchorX : 0)
        anchorY = CanvasGeometry.snapToGrid(anchorY.isFinite ? anchorY : 0)
        let rebaseX = previousFoldedAt.map { anchorX - $0.x } ?? 0
        let rebaseY = previousFoldedAt.map { anchorY - $0.y } ?? 0

        var restore = RestoreMap()
        for id in present {
            if let saved = existingRestore?[id] {
                var entry = saved
                entry.x = saved.x + rebaseX
                entry.y = saved.y + rebaseY
                restore[id] = entry
                continue
            }
            let w = widgets[id]!
            restore[id] = GlueRestoreEntry(x: w.position.x, y: w.position.y, width: w.size.width, height: w.size.height, iconified: w.iconified == true)
        }

        let layout = collapsedClusterLayout(present.count)
        var next = widgets
        for (index, id) in present.enumerated() {
            var w = widgets[id]!
            let offset = index < layout.offsets.count ? layout.offsets[index] : .zero
            let wasIcon = w.iconified == true
            let dormant = wasIcon ? w.expandedSize : w.size
            w.iconified = true
            // `{ ...w, iconified, expandedSize, size, position }`: an absent
            // dormant size is `undefined`, which the bytes never carry.
            w.expandedSize = dormant
            w.size = collapsedMemberSize
            w.position = Vector2D(x: anchorX + offset.x, y: anchorY + offset.y)
            next[id] = w
        }
        return (next, restore, Vector2D(x: anchorX, y: anchorY))
    }

    /// `foldedBlockShift`: how far a folded block has travelled since its
    /// fold was recorded.
    public static func foldedBlockShift(_ widgets: OrderedMap<Widget>, glue: WidgetGlue) -> Vector2D {
        guard let foldedAt = glue.foldedAt else { return .zero }
        var minX = Double.infinity, minY = Double.infinity
        for id in glue.widgetIds {
            guard let w = widgets[id] else { continue }
            minX = min(minX, w.position.x)
            minY = min(minY, w.position.y)
        }
        guard minX.isFinite, minY.isFinite else { return .zero }
        return Vector2D(x: minX - foldedAt.x, y: minY - foldedAt.y)
    }

    /// `unfoldReleasedFoldedMembers`: a 1×1 icon no longer inside a folded
    /// group goes back to the state it was folded from (or its dormant size).
    public static func unfoldReleasedFoldedMembers(
        _ widgets: OrderedMap<Widget>, previous: OrderedMap<WidgetGlue>, next nextGlues: OrderedMap<WidgetGlue>
    ) -> OrderedMap<Widget> {
        var stillFolded = Set<String>()
        for glue in nextGlues.values where glue.collapsed { stillFolded.formUnion(glue.widgetIds) }
        func restoreFor(_ id: String) -> (entry: GlueRestoreEntry, glue: WidgetGlue)? {
            for glue in previous.values where glue.collapsed {
                if let entry = restoreMap(of: glue)?[id] { return (entry, glue) }
            }
            return nil
        }
        var result = widgets
        for (id, w) in widgets.entries {
            let folded = w.iconified == true && w.size == collapsedMemberSize
            if !folded || stillFolded.contains(id) { continue }
            var restored = w
            if let saved = restoreFor(id) {
                let shift = foldedBlockShift(widgets, glue: saved.glue)
                restored.iconified = saved.entry.iconified
                restored.size = Size(width: saved.entry.width, height: saved.entry.height)
                restored.position = Vector2D(x: saved.entry.x + shift.x, y: saved.entry.y + shift.y)
            } else {
                restored.iconified = false
                restored.size = w.expandedSize ?? w.size
                restored.expandedSize = nil
            }
            result[id] = restored
        }
        return result
    }

    // MARK: - The option-drag

    /// `findGlueSnap`: the nearest facing card within a cell (vertical bonds
    /// land chrome-to-chrome, horizontal ones card-to-card), else a card
    /// dropped squarely on another, escaping along the shallower overlap.
    public static func findSnap(_ dragged: Widget, widgets: OrderedMap<Widget>, excludeIds: Set<String> = [], measure: GlueMeasure = .registry) -> GlueSnap? {
        let draggedBox = boxRect(dragged, measure)
        let draggedChrome = chromeRect(dragged, measure)
        let draggedHead = dragged.position.y - draggedChrome.y
        var best: (snap: GlueSnap, gap: Double)?
        var overlapping: (snap: GlueSnap, depth: Double)?

        for candidate in widgets.values {
            if candidate.id == dragged.id || candidate.canvasId != dragged.canvasId { continue }
            if excludeIds.contains(candidate.id) || candidate.metadata.locked { continue }
            let box = boxRect(candidate, measure)
            let chrome = chromeRect(candidate, measure)
            let bare = edgeGaps(draggedBox, box)
            let deep = edgeGaps(draggedChrome, chrome)
            let gapX = bare.gapX, overlapY = bare.overlapY
            let gapY = deep.gapY, overlapX = deep.overlapX, deepY = deep.overlapY

            if gapX >= -overshoot && gapX <= range && overlapY >= minOverlap {
                let score = abs(gapX)
                if best == nil || score < best!.gap {
                    let draggedOnLeft = draggedBox.x <= box.x
                    best = (GlueSnap(
                        targetId: candidate.id,
                        position: Vector2D(x: draggedOnLeft ? box.x - draggedBox.width : box.x + box.width, y: CanvasGeometry.snapToGrid(dragged.position.y)),
                        axis: .x
                    ), score)
                }
            }
            if gapY >= -overshoot && gapY <= range && overlapX >= minOverlap {
                let score = abs(gapY)
                if best == nil || score < best!.gap {
                    let draggedOnTop = draggedChrome.y <= chrome.y
                    best = (GlueSnap(
                        targetId: candidate.id,
                        position: Vector2D(
                            x: CanvasGeometry.snapToGrid(dragged.position.x),
                            y: (draggedOnTop ? chrome.y - draggedChrome.height : chrome.y + chrome.height) + draggedHead
                        ),
                        axis: .y
                    ), score)
                }
            }
            if overlapX > touchEps && deepY > touchEps {
                let escapeX = overlapX <= deepY
                let depth = min(overlapX, deepY)
                if overlapping == nil || depth < overlapping!.depth {
                    let draggedOnLeft = draggedChrome.x + draggedChrome.width / 2 <= chrome.x + chrome.width / 2
                    let draggedOnTop = draggedChrome.y + draggedChrome.height / 2 <= chrome.y + chrome.height / 2
                    let position = escapeX
                        ? Vector2D(x: draggedOnLeft ? box.x - draggedBox.width : box.x + box.width, y: CanvasGeometry.snapToGrid(dragged.position.y))
                        : Vector2D(
                            x: CanvasGeometry.snapToGrid(dragged.position.x),
                            y: (draggedOnTop ? chrome.y - draggedChrome.height : chrome.y + chrome.height) + draggedHead
                        )
                    overlapping = (GlueSnap(targetId: candidate.id, position: position, axis: escapeX ? .x : .y), depth)
                }
            }
        }
        return best?.snap ?? overlapping?.snap
    }

    /// `pulledFreeOfCluster`: further than a cell from every clustermate.
    public static func pulledFreeOfCluster(_ dragged: Widget, memberIds: [String], widgets: OrderedMap<Widget>, measure: GlueMeasure = .registry) -> Bool {
        let draggedBox = chromeRect(dragged, measure)
        for id in memberIds where id != dragged.id {
            guard let member = widgets[id] else { continue }
            if separation(draggedBox, chromeRect(member, measure)) <= range { return false }
        }
        return true
    }

    /// `connectedGlueComponents`: members grouped by what still touches what.
    public static func connectedComponents(_ memberIds: [String], widgets: OrderedMap<Widget>, reach: Double = range, measure: GlueMeasure = .registry) -> [[String]] {
        let ids = memberIds.filter { widgets.contains($0) }
        var boxes: [String: WorldRect] = [:]
        for id in ids { boxes[id] = chromeRect(widgets[id]!, measure) }
        var seen = Set<String>()
        var components: [[String]] = []
        for start in ids where !seen.contains(start) {
            seen.insert(start)
            var component: [String] = []
            var queue = [start]
            while !queue.isEmpty {
                let current = queue.removeFirst()
                component.append(current)
                for other in ids where !seen.contains(other) {
                    if separation(boxes[current]!, boxes[other]!) <= reach {
                        seen.insert(other)
                        queue.append(other)
                    }
                }
            }
            components.append(component)
        }
        return components
    }

    /// `faceAlign`.
    static func faceAlign(_ start: Double, _ size: Double, _ blockStart: Double, _ blockSize: Double) -> Double {
        let need = min(minOverlap, size, blockSize)
        let overlap = min(start + size, blockStart + blockSize) - max(start, blockStart)
        if overlap >= need { return 0 }
        let a = blockStart
        let b = blockStart + blockSize - size
        return min(max(a, b), max(min(a, b), start)) - start
    }

    /// `closeClusterGaps`: pieces that drifted clear slide back to face the
    /// standing block, then interior holes close by gravity.
    public static func closeClusterGaps(_ widgets: OrderedMap<Widget>, memberIds: [String], anchorIds: [String] = [], measure: GlueMeasure = .registry) -> OrderedMap<Widget> {
        let present = memberIds.filter { widgets.contains($0) }
        if present.count < 2 { return widgets }
        var next = widgets
        let components = connectedComponents(present, widgets: widgets, reach: gap, measure: measure)
        if components.count > 1 {
            let anchored = Set(anchorIds)
            let ordered = components.enumerated().sorted { lhs, rhs in
                let a = lhs.element.contains(where: anchored.contains) ? 1 : 0
                let b = rhs.element.contains(where: anchored.contains) ? 1 : 0
                return a != b ? a > b : lhs.offset < rhs.offset
            }.map(\.element)
            var merged = ordered[0]
            for component in ordered.dropFirst() {
                let block = chromeEnvelope(merged, widgets: next, measure: measure)!
                let env = chromeEnvelope(component, widgets: next, measure: measure)!
                let gaps = edgeGaps(block, env)
                let spanX = (block.width + env.width) / 2
                let spanY = (block.height + env.height) / 2
                let alongX = abs(env.x + env.width / 2 - (block.x + block.width / 2)) / (spanX == 0 ? 1 : spanX)
                let alongY = abs(env.y + env.height / 2 - (block.y + block.height / 2)) / (spanY == 0 ? 1 : spanY)
                let closeX = alongX >= alongY
                let dx = closeX
                    ? (gaps.gapX > 0 ? (env.x + env.width / 2 >= block.x + block.width / 2 ? -gaps.gapX : gaps.gapX) : 0)
                    : faceAlign(env.x, env.width, block.x, block.width)
                let dy = closeX
                    ? faceAlign(env.y, env.height, block.y, block.height)
                    : (gaps.gapY > 0 ? (env.y + env.height / 2 >= block.y + block.height / 2 ? -gaps.gapY : gaps.gapY) : 0)
                for id in component {
                    var w = next[id]!
                    w.position = Vector2D(x: w.position.x + dx, y: w.position.y + dy)
                    next[id] = w
                }
                merged.append(contentsOf: component)
            }
        }
        let boxes = present.map { WeldedBox(id: $0, rect: chromeRect(next[$0]!, measure)) }
        let moved = compactWeldedCluster(boxes, anchorIds: anchorIds.filter { next.contains($0) })
        if moved.isEmpty { return next }
        for (id, corner) in moved.entries {
            var w = next[id]!
            w.position = Vector2D(x: corner.x, y: corner.y + head(w, measure))
            next[id] = w
        }
        return next
    }

    /// `spreadClusterMembers`: a dissolved group's cards end a clear cell apart.
    public static func spreadClusterMembers(_ widgets: OrderedMap<Widget>, memberIds: [String], measure: GlueMeasure = .registry) -> OrderedMap<Widget> {
        let present = memberIds.filter { widgets.contains($0) }
        if present.count < 2 { return widgets }
        let pad = grid / 2
        let boxes = present.map { id -> WeldedBox in
            let box = boxRect(widgets[id]!, measure)
            return WeldedBox(id: id, rect: WorldRect(x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2))
        }
        let moved = reflowWeldedCluster(boxes, anchorIds: [])
        if moved.isEmpty { return widgets }
        var next = widgets
        for (id, corner) in moved.entries {
            var w = next[id]!
            w.position = Vector2D(x: CanvasGeometry.snapToGrid(corner.x + pad), y: CanvasGeometry.snapToGrid(corner.y + pad))
            next[id] = w
        }
        return next
    }

    /// Re-packs a cluster around members whose footprint changed (the
    /// settle pass's in-cluster half): pushes clustermates exactly far
    /// enough to touch again, anchors holding.
    public static func reflowCluster(_ widgets: OrderedMap<Widget>, memberIds: [String], anchorIds: [String], measure: GlueMeasure = .registry) -> OrderedMap<Widget> {
        let present = memberIds.filter { widgets.contains($0) }
        if present.count < 2 { return widgets }
        let boxes = present.map { WeldedBox(id: $0, rect: chromeRect(widgets[$0]!, measure)) }
        let moved = reflowWeldedCluster(boxes, anchorIds: anchorIds.filter(present.contains))
        if moved.isEmpty { return widgets }
        var next = widgets
        for (id, corner) in moved.entries {
            var w = next[id]!
            w.position = Vector2D(x: corner.x, y: corner.y + head(w, measure))
            next[id] = w
        }
        return next
    }

    /// `reconcileGlueClusters`: split any record whose pieces no longer
    /// touch; a component of one drops; the first component keeps the id.
    /// Returns nil when nothing changed.
    public static func reconcile(_ widgets: OrderedMap<Widget>, glues: OrderedMap<WidgetGlue>, mint: IdMinter, measure: GlueMeasure = .registry) -> OrderedMap<WidgetGlue>? {
        var next = OrderedMap<WidgetGlue>()
        var changed = false
        for (glueId, glue) in glues.entries {
            let components = connectedComponents(glue.widgetIds, widgets: widgets, measure: measure).filter { $0.count >= 2 }
            if components.count == 1 && components[0].count == glue.widgetIds.count {
                next[glueId] = glue
                continue
            }
            changed = true
            for (index, component) in components.enumerated() {
                if index == 0 {
                    var kept = glue
                    kept.widgetIds = component
                    next[glueId] = kept
                } else {
                    let id = mint()
                    next[id] = WidgetGlue(id: id, widgetIds: component)
                }
            }
        }
        return changed ? next : nil
    }

    /// `buildGlueIndex`: member → glue id (a later record wins, as on the web).
    public static func index(_ glues: OrderedMap<WidgetGlue>) -> [String: String] {
        var index: [String: String] = [:]
        for (glueId, glue) in glues.entries {
            for id in glue.widgetIds { index[id] = glueId }
        }
        return index
    }
}
