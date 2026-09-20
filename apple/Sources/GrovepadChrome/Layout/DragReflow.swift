import Foundation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// Drag reflow: `store/dragReflow.ts`, how the board makes room for a card you
// are dragging. Nothing is ever pushed: the cards the drag contends with form
// an ORDERED LANE, the drag claims an INDEX in it, and every neighbour's ghost
// offset is recomputed from the pre-gesture baseline every frame — so
// withdrawing the drag restores the baseline to the pixel.
//
// Ghost offsets are view state, like the web's `useDragReflowStore`: they
// live in this object (owned by the canvas interaction), never in the board,
// so they can never reach undo, persistence or sync. They are committed
// exactly once, at the drop (`BoardDocument.applyGhostDisplacement`).
// The clock is injected (`now` in ms), as the web's `performance.now()` is.
// ---------------------------------------------------------------------------

/// One rigid rect the lane reasons over (`LaneRect`): a glue cluster is one.
public struct ReflowRect: Equatable, Sendable {
    public var id: String
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double
    public var locked: Bool
    /// Widget ids this rect stands for.
    public var ids: [String]

    public init(id: String, x: Double, y: Double, width: Double, height: Double, locked: Bool = false, ids: [String]? = nil) {
        self.id = id
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.locked = locked
        self.ids = ids ?? [id]
    }
}

/// `ReflowBaseline`.
public struct ReflowBaseline: Equatable, Sendable {
    public var movingKey: String
    public var neighbours: [ReflowRect]
    public var active: ReflowRect
    public var activeIsCluster: Bool
}

public final class DragReflow {
    public enum Axis: Sendable { case x, y }

    /// `REFLOW_ENGAGE_MS`.
    public static let engageMs = 120.0
    /// `REFLOW_SCAN_RANGE`.
    public static let scanRange = 1600.0
    /// `AXIS_SWITCH_RATIO`.
    static let axisSwitchRatio = 1.5
    /// `INDEX_HYSTERESIS`.
    static let indexHysteresis = CanvasGeometry.gridSize
    /// `LANE_BAND_RATIO`.
    static let laneBandRatio = 0.25
    /// `ENGAGE_COVERAGE_RATIO`.
    static let engageCoverageRatio = 1.0 / 3.0

    /// Ghost offset per widget id (`offsets`). Entries parked at zero keep
    /// gliding home; they only disappear when the drag ends.
    public private(set) var offsets = OrderedMap<Vector2D>()
    /// Cards the drag covers that the lane cannot answer for (locked, or
    /// beside the band): dimmed as a "will settle on drop" hint.
    public private(set) var pendingSettleIds: Set<String> = []

    private struct Tracker {
        var directionX = 0.0
        var directionY = 0.0
        var axis: Axis?
        var index: Int?
        var laneKey: String?
        var engageStart: Double?
        var engaged = false
        var baseline: ReflowBaseline?
    }

    private var tracker: Tracker?
    private let measure: GlueMeasure

    public init(measure: GlueMeasure = .registry) {
        self.measure = measure
    }

    /// Whether a gesture is armed.
    public var isActive: Bool { tracker != nil }

    // MARK: - Pure geometry

    /// JavaScript `<` on strings (UTF-16 code units).
    static func jsLess(_ a: String, _ b: String) -> Bool {
        a.utf16.lexicographicallyPrecedes(b.utf16)
    }

    /// `measureCluster`: the resting footprint, the floating title row, and a
    /// real cluster's frame band — exactly what the release settle measures.
    static func measureCluster(_ widgets: OrderedMap<Widget>, ids: [String], isCluster: Bool, measure: GlueMeasure) -> ReflowRect {
        var minX = Double.infinity, minY = Double.infinity, maxX = -Double.infinity, maxY = -Double.infinity
        for id in ids {
            let widget = widgets[id]!
            let size = measure.visibleSize(widget)
            let head = measure.showsTitleRow(widget) ? widgetTitleRowHeight : 0
            minX = min(minX, widget.position.x)
            minY = min(minY, widget.position.y - head)
            maxX = max(maxX, widget.position.x + size.width)
            maxY = max(maxY, widget.position.y + size.height)
        }
        if isCluster {
            minX -= GlueGeometry.frameBand
            maxX += GlueGeometry.frameBand
            minY -= GlueGeometry.titleHeadroom
            maxY += GlueGeometry.frameBand
        }
        return ReflowRect(id: "", x: minX, y: minY, width: maxX - minX, height: maxY - minY, ids: [])
    }

    /// `buildReflowBaseline`: the moving widgets become one active rect; every
    /// nearby non-moving widget joins its glue cluster's rigid rect.
    public static func buildBaseline(
        _ widgets: OrderedMap<Widget>,
        glues: OrderedMap<WidgetGlue>,
        glueIndex: [String: String],
        movingIds: [String],
        range: Double = scanRange,
        measure: GlueMeasure = .registry
    ) -> ReflowBaseline? {
        let moving = movingIds.filter { widgets.contains($0) }
        guard let first = moving.first else { return nil }
        let canvasId = widgets[first]!.canvasId
        let onCanvas = moving.filter { widgets[$0]!.canvasId == canvasId }
        if onCanvas.isEmpty { return nil }
        let movingSet = Set(onCanvas)

        let activeIsCluster = onCanvas.count > 1 && onCanvas.allSatisfy { !(glueIndex[$0] ?? "").isEmpty }
        var active = measureCluster(widgets, ids: onCanvas, isCluster: activeIsCluster, measure: measure)
        active.id = "__drag__"

        var clusterKeys: [String] = []
        var byCluster: [String: [String]] = [:]
        for id in widgets.keys {
            let widget = widgets[id]!
            if widget.canvasId != canvasId || movingSet.contains(id) { continue }
            let gid = glueIndex[id] ?? ""
            let key = !gid.isEmpty && glues.contains(gid) ? "g:\(gid)" : "w:\(id)"
            if byCluster[key] == nil {
                byCluster[key] = [id]
                clusterKeys.append(key)
            } else {
                byCluster[key]!.append(id)
            }
        }

        var neighbours: [ReflowRect] = []
        for key in clusterKeys {
            let ids = byCluster[key]!
            var rect = measureCluster(widgets, ids: ids, isCluster: key.hasPrefix("g:") && ids.count > 1, measure: measure)
            if rect.x + rect.width < active.x - range || rect.x > active.x + active.width + range { continue }
            if rect.y + rect.height < active.y - range || rect.y > active.y + active.height + range { continue }
            rect.id = key
            rect.locked = ids.contains { widgets[$0]!.metadata.locked }
            rect.ids = ids
            neighbours.append(rect)
        }
        neighbours.sort { jsLess($0.id, $1.id) }
        let movingKey = onCanvas.sorted(by: jsLess).joined(separator: "|")
        return ReflowBaseline(movingKey: movingKey, neighbours: neighbours, active: active, activeIsCluster: activeIsCluster)
    }

    static func start(_ r: ReflowRect, _ axis: Axis) -> Double { axis == .x ? r.x : r.y }
    static func span(_ r: ReflowRect, _ axis: Axis) -> Double { axis == .x ? r.width : r.height }
    static func end(_ r: ReflowRect, _ axis: Axis) -> Double { start(r, axis) + span(r, axis) }
    static func middle(_ r: ReflowRect, _ axis: Axis) -> Double { start(r, axis) + span(r, axis) / 2 }
    static func other(_ axis: Axis) -> Axis { axis == .x ? .y : .x }

    /// Whole grid cells, rounded up.
    static func quantize(_ distance: Double) -> Double {
        distance > 0 ? (distance / CanvasGeometry.gridSize).rounded(.up) * CanvasGeometry.gridSize : 0
    }

    static func overlapAlong(_ a: ReflowRect, _ b: ReflowRect, _ axis: Axis) -> Double {
        min(end(a, axis), end(b, axis)) - max(start(a, axis), start(b, axis))
    }

    static func intersectionArea(_ a: ReflowRect, _ b: ReflowRect) -> Double {
        let w = overlapAlong(a, b, .x)
        let h = overlapAlong(a, b, .y)
        return w > 0 && h > 0 ? w * h : 0
    }

    /// `buildLane`: the unlocked neighbours sharing enough of the drag's
    /// perpendicular band, in axis order.
    public static func buildLane(_ neighbours: [ReflowRect], active: ReflowRect, axis: Axis) -> [ReflowRect] {
        let perp = other(axis)
        var lane = neighbours.filter { rect in
            if rect.locked { return false }
            let shared = overlapAlong(active, rect, perp)
            if shared <= 0 { return false }
            return shared >= min(span(active, perp), span(rect, perp)) * laneBandRatio
        }
        lane.sort { a, b in
            let diff = start(a, axis) - start(b, axis)
            if diff != 0 { return diff < 0 }
            return jsLess(a.id, b.id)
        }
        return lane
    }

    /// `claimIndex`: how many lane cards the drag has passed, held with
    /// hysteresis against the previous claim.
    public static func claimIndex(_ lane: [ReflowRect], active: ReflowRect, axis: Axis, previous: Int?) -> Int {
        let here = middle(active, axis)
        guard let previous else {
            var seed = 0
            while seed < lane.count && here > middle(lane[seed], axis) { seed += 1 }
            return seed
        }
        var index = max(0, min(previous, lane.count))
        while index < lane.count && here > middle(lane[index], axis) + indexHysteresis { index += 1 }
        while index > 0 && here < middle(lane[index - 1], axis) - indexHysteresis { index -= 1 }
        return index
    }

    /// `laneShifts`: the signed shift per lane position given the claimed
    /// slot; each run walks outward until a card already had the room.
    public static func laneShifts(_ lane: [ReflowRect], index: Int, active: ReflowRect, axis: Axis, gap: Double = WidgetSettling.layoutGap) -> [Double] {
        var shifts = [Double](repeating: 0, count: lane.count)
        var frontier = end(active, axis) + gap
        var i = index
        while i < lane.count {
            let needed = quantize(frontier - start(lane[i], axis))
            if needed <= 0 { break }
            shifts[i] = needed
            frontier = end(lane[i], axis) + needed + gap
            i += 1
        }
        var backier = start(active, axis) - gap
        i = index - 1
        while i >= 0 {
            let needed = quantize(end(lane[i], axis) - backier)
            if needed <= 0 { break }
            shifts[i] = -needed
            backier = start(lane[i], axis) - needed - gap
            i -= 1
        }
        return shifts
    }

    // MARK: - The gesture

    /// `beginDragReflow`: arm reflow for a new drag.
    public func begin() {
        tracker = Tracker()
    }

    /// `updateDragReflow`: recompute this frame. `movingIds` is exactly the
    /// set the move changed this frame (unlocked, clusters expanded);
    /// `worldDelta` is this frame's world-space move. Returns true when the
    /// published offsets or pending set changed (the host repaints then).
    @discardableResult
    public func update(
        widgets: OrderedMap<Widget>,
        glues: OrderedMap<WidgetGlue>,
        glueIndex: [String: String],
        movingIds: [String],
        worldDelta: Vector2D,
        now: Double
    ) -> Bool {
        guard var tracker else { return false }
        defer { self.tracker = tracker }

        // Smoothed direction, then a sticky axis.
        tracker.directionX = tracker.directionX * 0.6 + worldDelta.x * 0.4
        tracker.directionY = tracker.directionY * 0.6 + worldDelta.y * 0.4
        let alongX = abs(tracker.directionX)
        let alongY = abs(tracker.directionY)
        if tracker.axis == nil {
            if alongX > 1e-6 || alongY > 1e-6 { tracker.axis = alongX >= alongY ? .x : .y }
        } else if tracker.axis == .x && alongY > alongX * DragReflow.axisSwitchRatio {
            tracker.axis = .y
        } else if tracker.axis == .y && alongX > alongY * DragReflow.axisSwitchRatio {
            tracker.axis = .x
        }
        guard let axis = tracker.axis else { return false }

        let present = movingIds.filter { widgets.contains($0) }
        let movingKey = present.sorted(by: DragReflow.jsLess).joined(separator: "|")
        if tracker.baseline == nil || tracker.baseline!.movingKey != movingKey {
            tracker.baseline = DragReflow.buildBaseline(widgets, glues: glues, glueIndex: glueIndex, movingIds: movingIds, measure: measure)
            tracker.index = nil
        }
        guard let baseline = tracker.baseline, !baseline.neighbours.isEmpty else {
            DragReflow.resetClaim(&tracker)
            return withdrawGhosts()
        }

        // The live footprint projected onto the grid: offsets only change on
        // cell crossings, and the preview shows where a drop would land.
        let live = DragReflow.measureCluster(widgets, ids: present, isCluster: baseline.activeIsCluster, measure: measure)
        let active = ReflowRect(
            id: baseline.active.id,
            x: CanvasGeometry.snapToGrid(live.x),
            y: CanvasGeometry.snapToGrid(live.y),
            width: live.width,
            height: live.height,
            ids: []
        )

        // Engagement: meaningful coverage of SOME neighbour, held long enough
        // to read as arriving. Latches for the gesture.
        if !tracker.engaged {
            let activeArea = active.width * active.height
            let meaningful = baseline.neighbours.contains { rect in
                let inter = DragReflow.intersectionArea(active, rect)
                if inter <= 0 { return false }
                let coverage = max(inter / (rect.width * rect.height), inter / activeArea)
                return coverage >= DragReflow.engageCoverageRatio
            }
            if !meaningful {
                DragReflow.resetClaim(&tracker)
                return withdrawGhosts()
            }
            if tracker.engageStart == nil {
                tracker.engageStart = now
                if DragReflow.engageMs > 0 { return false }
            }
            if now - tracker.engageStart! < DragReflow.engageMs { return false }
            tracker.engaged = true
        }

        let lane = DragReflow.buildLane(baseline.neighbours, active: active, axis: axis)
        let laneKey = "\(axis == .x ? "x" : "y"):" + lane.map(\.id).joined(separator: ",")
        let index = DragReflow.claimIndex(lane, active: active, axis: axis, previous: tracker.laneKey == laneKey ? tracker.index : nil)
        tracker.laneKey = laneKey
        tracker.index = index

        let shifts = DragReflow.laneShifts(lane, index: index, active: active, axis: axis)
        return publish(lane: lane, shifts: shifts, axis: axis, baseline: baseline, active: active)
    }

    private static func resetClaim(_ tracker: inout Tracker) {
        tracker.index = nil
        tracker.laneKey = nil
        tracker.engageStart = nil
    }

    /// Park every live ghost at zero (they glide home) and clear the hints.
    private func withdrawGhosts() -> Bool {
        if offsets.isEmpty && pendingSettleIds.isEmpty { return false }
        var parked = OrderedMap<Vector2D>()
        for id in offsets.keys { parked[id] = .zero }
        let changed = parked != offsets || !pendingSettleIds.isEmpty
        offsets = parked
        pendingSettleIds = []
        return changed
    }

    private func publish(lane: [ReflowRect], shifts: [Double], axis: Axis, baseline: ReflowBaseline, active: ReflowRect) -> Bool {
        let previous = offsets
        var next = OrderedMap<Vector2D>()
        var shiftedById: [String: ReflowRect] = [:]
        var shiftedRects: [ReflowRect] = []
        var changed = false

        for (i, rect) in lane.enumerated() {
            let shift = shifts[i]
            if shift == 0 { continue }
            let offset = axis == .x ? Vector2D(x: shift, y: 0) : Vector2D(x: 0, y: shift)
            var placed = rect
            placed.x += offset.x
            placed.y += offset.y
            shiftedById[rect.id] = placed
            shiftedRects.append(placed)
            for id in rect.ids {
                next[id] = offset
                if previous[id] != offset { changed = true }
            }
        }
        // A card whose slot went back to baseline parks at zero.
        for id in previous.keys where !next.contains(id) {
            next[id] = .zero
            if previous[id] != .zero { changed = true }
        }
        if next.count != previous.count { changed = true }

        // Everything the drop will still have to sort out.
        var pending = Set<String>()
        let laneIds = Set(lane.map(\.id))
        for rect in baseline.neighbours {
            let placed = shiftedById[rect.id] ?? rect
            let covered = DragReflow.intersectionArea(active, placed) > 0 && (rect.locked || !laneIds.contains(rect.id))
            let crowded = shiftedById[rect.id] == nil && shiftedRects.contains { DragReflow.intersectionArea($0, placed) > 0 }
            if covered || crowded { for id in rect.ids { pending.insert(id) } }
        }
        if pending != pendingSettleIds { changed = true }

        if changed {
            offsets = next
            pendingSettleIds = pending
        }
        return changed
    }

    /// `endDragReflow`: end the gesture and hand back the non-zero offsets
    /// for the drop commit.
    public func end() -> OrderedMap<Vector2D> {
        tracker = nil
        var commit = OrderedMap<Vector2D>()
        for (id, offset) in offsets.entries where offset.x != 0 || offset.y != 0 { commit[id] = offset }
        offsets = OrderedMap()
        pendingSettleIds = []
        return commit
    }

    /// `cancelDragReflow`: drop every ghost without committing anything.
    public func cancel() {
        tracker = nil
        offsets = OrderedMap()
        pendingSettleIds = []
    }
}
