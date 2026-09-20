import Foundation
import Observation
import GrovepadCore

// ---------------------------------------------------------------------------
// The tree shaper (the web's "ghost tree"): drag a point down for children,
// up to prune, left/right for siblings; press a point to choose its widgets;
// Create Tree turns the sketch into real cards. Ports the ghost half of
// `uiLinkingSlice.ts` (start, begin/shape/end gesture, set/add widget types,
// cancel, node selection), the gesture bookkeeping in `widgetGhostLayout.ts`
// and the pointer rules of `GhostTreeShaper.tsx` (direction lock, absolute
// from-grab-point shaping). Never document state and never undoable: only
// `commit` touches the board, as one undo step.
// ---------------------------------------------------------------------------

@Observable
public final class TreeShaperModel {
    /// Screen points of travel before a press becomes a shaping drag.
    public static let directionLockPx = 4.0
    /// One node per two grid cells of world travel.
    public static let nodeStepWorld = CanvasGeometry.gridSize * 2

    public private(set) var config: GhostTreeConfig?
    /// Multi-selected points, in selection order.
    public private(set) var selectedNodeIds: [String] = []
    /// The points the widget picker is editing, when it is open.
    public private(set) var pickerTarget: [String]?
    /// Points the current drag pruned, still painted (fading) until the drag
    /// ends, so a drag that removes its own point keeps its gesture.
    public private(set) var closingNodes: [GhostTreeNode] = []

    @ObservationIgnored private let mint: IdMinter
    @ObservationIgnored private var gestureBase: [GhostTreeNode]?
    @ObservationIgnored private var gestureIds: [String: String] = [:]
    @ObservationIgnored private var drag: Drag?

    private struct Drag {
        var nodeId: String
        var direction: GhostShapeDirection?
        var lastSignature: String
        /// Passed the direction lock at least once: the release is not a tap.
        var travelled: Bool
    }

    public init(mint: IdMinter = .system) {
        self.mint = mint
    }

    public var isActive: Bool { config != nil }
    public var isPickerOpen: Bool { pickerTarget != nil }

    /// Live points plus the ones a drag is pruning (web: `renderedNodes`).
    public var renderedNodes: [GhostTreeNode] {
        guard let config else { return [] }
        let live = Set(config.nodes.map(\.id))
        return closingNodes.filter { !live.contains($0.id) } + config.nodes
    }

    public func isClosing(_ id: String) -> Bool {
        guard let config else { return false }
        return !config.nodes.contains { $0.id == id } && closingNodes.contains { $0.id == id }
    }

    // MARK: - Lifecycle

    /// `startGhostShaper`: one empty root at the grid-snapped point.
    public func start(at world: Vector2D) {
        resetGesture()
        let originX = CanvasGeometry.snapToGrid(world.x)
        let originY = CanvasGeometry.snapToGrid(world.y)
        config = GhostTreeConfig(originX: originX, originY: originY, nodes: [
            GhostTreeNode(id: mint(), parentId: nil, order: 0, x: originX, y: originY),
        ])
        selectedNodeIds = []
        pickerTarget = nil
    }

    /// `cancelGhostShaper`.
    public func cancel() {
        resetGesture()
        config = nil
        selectedNodeIds = []
        pickerTarget = nil
    }

    /// `commitGhostTree`: nil (and nothing changes) while a point is empty.
    @discardableResult
    public func commit(into document: BoardDocument, mint override: IdMinter? = nil) -> [String]? {
        guard let config, config.unconfiguredCount == 0 else { return nil }
        guard let created = document.commitGhostTree(config.nodes, originX: config.originX, originY: config.originY, mint: override) else { return nil }
        cancel()
        return created
    }

    private func resetGesture() {
        gestureBase = nil
        gestureIds = [:]
        drag = nil
        closingNodes = []
    }

    // MARK: - Shaping (store actions)

    /// `beginGhostGesture`: shaping is absolute from the grab point, so every
    /// step rebuilds from this snapshot.
    public func beginGesture() {
        gestureBase = config?.nodes
        gestureIds = [:]
    }

    /// `endGhostGesture`.
    public func endGesture() {
        gestureBase = nil
        gestureIds = [:]
        closingNodes = []
    }

    /// `gestureGhostId`: one id per structural slot for the whole gesture, so
    /// a point that disappears and returns mid-drag keeps its identity.
    private func gestureId(_ key: String) -> String {
        if let existing = gestureIds[key] { return existing }
        let id = mint()
        gestureIds[key] = id
        return id
    }

    /// `shapeGhostTree(nodeId, direction, steps)`.
    public func shape(_ nodeId: String, direction: GhostShapeDirection, steps: Int) {
        guard let config else { return }
        let base = gestureBase ?? config.nodes
        guard base.contains(where: { $0.id == nodeId }) else { return }
        var nodes = base
        defer {
            let laid = GhostTree.layout(nodes, originX: config.originX, originY: config.originY)
            self.config?.nodes = laid
            let live = Set(laid.map(\.id))
            closingNodes = gestureBase.map { $0.filter { !live.contains($0.id) } } ?? []
        }
        guard steps > 0 else { return }

        func removeSubtree(_ rootId: String) {
            var remove: Set<String> = [rootId]
            for candidate in nodes {
                if let parentId = candidate.parentId, remove.contains(parentId) { remove.insert(candidate.id) }
            }
            nodes.removeAll { remove.contains($0.id) }
        }

        switch direction {
        case .down:
            // Grow the order-zero spine below the grabbed point.
            var parent = nodes.first { $0.id == nodeId }
            while let current = parent, let center = nodes.first(where: { $0.parentId == current.id && $0.order == 0 }) {
                parent = center
            }
            var step = 0
            while step < steps, let current = parent {
                let child = GhostTreeNode(
                    id: gestureId("down:\(nodeId):\(step)"), parentId: current.id, order: 0,
                    x: current.x, y: current.y + GhostTree.pitchY
                )
                nodes.append(child)
                parent = child
                step += 1
            }
        case .up:
            for _ in 0..<steps {
                guard let reference = nodes.first(where: { $0.id == nodeId }) else { break }
                var frontier = nodes.filter { $0.parentId == reference.id }
                var deepest: GhostTreeNode?
                while !frontier.isEmpty {
                    // The outermost child at each level (JS sort by |order| desc, first wins ties).
                    let pick = frontier.enumerated().max { a, b in
                        abs(a.element.order) != abs(b.element.order) ? abs(a.element.order) < abs(b.element.order) : a.offset > b.offset
                    }!.element
                    deepest = pick
                    frontier = nodes.filter { $0.parentId == pick.id }
                }
                if let deepest { removeSubtree(deepest.id) } else if reference.parentId != nil { removeSubtree(reference.id) }
            }
        case .left, .right:
            guard let reference = nodes.first(where: { $0.id == nodeId }) else { return }
            let gestureSide = direction == .left ? -1 : 1
            let outward = reference.order == 0 || reference.order.signum() == gestureSide
            // Inward motion edits the side the grabbed point belongs to.
            let side = outward ? gestureSide : reference.order.signum()
            let siblingParentId = reference.parentId
            for _ in 0..<steps {
                let onSide = nodes.filter { $0.parentId == siblingParentId && $0.order.signum() == side }
                if outward {
                    if onSide.count >= GhostTree.siblingsPerSideMax { break }
                    let order = side < 0
                        ? min(0, onSide.map(\.order).min() ?? 0) - 1
                        : max(0, onSide.map(\.order).max() ?? 0) + 1
                    nodes.append(GhostTreeNode(
                        id: gestureId("side:\(siblingParentId ?? "root"):\(order)"), parentId: siblingParentId, order: order,
                        x: reference.x, y: reference.parentId != nil ? reference.y : config.originY
                    ))
                } else {
                    let outermost = onSide.enumerated().max { a, b in
                        abs(a.element.order) != abs(b.element.order) ? abs(a.element.order) < abs(b.element.order) : a.offset > b.offset
                    }?.element
                    guard let outermost else { break }
                    removeSubtree(outermost.id)
                }
            }
        }
    }

    /// `setGhostNodeWidgetTypes`: replace one point's bundle (deduplicated).
    public func setWidgetTypes(_ nodeId: String, _ widgetTypes: [String]) {
        guard var config, let index = config.nodes.firstIndex(where: { $0.id == nodeId }) else { return }
        let unique = TreeShaperModel.deduplicated(widgetTypes)
        guard config.nodes[index].widgetTypes != unique else { return }
        config.nodes[index].widgetTypes = unique
        config.nodes = GhostTree.layout(config.nodes, originX: config.originX, originY: config.originY)
        self.config = config
    }

    /// `addWidgetTypesToGhostNodes`: a bulk edit adds to each point's bundle.
    public func addWidgetTypes(_ nodeIds: [String], _ widgetTypes: [String]) {
        guard var config else { return }
        let targets = Set(nodeIds)
        var changed = false
        for index in config.nodes.indices where targets.contains(config.nodes[index].id) {
            let merged = TreeShaperModel.deduplicated(config.nodes[index].widgetTypes + widgetTypes)
            if merged != config.nodes[index].widgetTypes {
                config.nodes[index].widgetTypes = merged
                changed = true
            }
        }
        guard changed else { return }
        config.nodes = GhostTree.layout(config.nodes, originX: config.originX, originY: config.originY)
        self.config = config
    }

    static func deduplicated(_ types: [String]) -> [String] {
        var seen = Set<String>()
        return types.filter { seen.insert($0).inserted }
    }

    // MARK: - Node selection

    public func isSelected(_ nodeId: String) -> Bool { selectedNodeIds.contains(nodeId) }

    public func toggleSelected(_ nodeId: String) {
        if let index = selectedNodeIds.firstIndex(of: nodeId) { selectedNodeIds.remove(at: index) } else { selectedNodeIds.append(nodeId) }
    }

    /// `addGhostNodesToSelection` (the marquee).
    public func addToSelection(_ nodeIds: [String]) {
        for id in nodeIds where !selectedNodeIds.contains(id) { selectedNodeIds.append(id) }
    }

    public func clearSelection() { selectedNodeIds = [] }

    /// Points whose footprint meets a world rectangle (the marquee's test).
    public func nodeIds(intersecting rect: WorldRect) -> [String] {
        (config?.nodes ?? []).filter { node in
            let grid = GhostTree.grid(count: node.widgetTypes.count)
            return node.x < rect.x + rect.width && node.x + grid.width > rect.x
                && node.y < rect.y + rect.height && node.y + grid.height > rect.y
        }.map(\.id)
    }

    // MARK: - Picker

    /// What the picker starts with: a single point's bundle; a bulk edit
    /// starts blank and adds (the points may already differ).
    public var pickerInitialTypes: [String] {
        guard let pickerTarget, pickerTarget.count == 1, let node = config?.nodes.first(where: { $0.id == pickerTarget[0] }) else { return [] }
        return node.widgetTypes
    }

    /// The first live point the picker edits (its anchor).
    public var pickerAnchor: GhostTreeNode? {
        guard let pickerTarget else { return nil }
        return config?.nodes.first { pickerTarget.contains($0.id) }
    }

    public func confirmPicker(_ widgetTypes: [String]) {
        guard let pickerTarget else { return }
        if pickerTarget.count == 1 { setWidgetTypes(pickerTarget[0], widgetTypes) } else { addWidgetTypes(pickerTarget, widgetTypes) }
        closePicker()
    }

    public func closePicker() {
        pickerTarget = nil
        selectedNodeIds = []
    }

    // MARK: - Pointer (`GhostTreeShaper.tsx`)

    /// A press landed on a point. Travel is measured from here, in screen
    /// points, so shaping depends only on distance — never event rate.
    public func pressBegan(_ nodeId: String) {
        guard config?.nodes.contains(where: { $0.id == nodeId }) == true else { return }
        beginGesture()
        drag = Drag(nodeId: nodeId, direction: nil, lastSignature: "", travelled: false)
    }

    /// The press moved `translation` screen points from where it began.
    public func pressMoved(_ nodeId: String, translation: Vector2D, zoom: Double) {
        guard var drag, drag.nodeId == nodeId else { return }
        defer { self.drag = drag }
        let dx = translation.x, dy = translation.y
        if max(abs(dx), abs(dy)) < TreeShaperModel.directionLockPx {
            if drag.lastSignature != "zero" {
                shape(nodeId, direction: drag.direction ?? .down, steps: 0)
                drag.lastSignature = "zero"
            }
            return
        }
        drag.travelled = true
        let direction: GhostShapeDirection = abs(dx) > abs(dy) ? (dx < 0 ? .left : .right) : (dy < 0 ? .up : .down)
        let screenTravel = direction == .left || direction == .right ? abs(dx) : abs(dy)
        let steps = Int((screenTravel / max(zoom, 0.05) / TreeShaperModel.nodeStepWorld).rounded(.down))
        let signature = "\(direction.rawValue):\(steps)"
        guard signature != drag.lastSignature else { return }
        drag.direction = direction
        drag.lastSignature = signature
        shape(nodeId, direction: direction, steps: steps)
    }

    /// The press lifted. A press that never travelled is a tap: `additive`
    /// (shift on a keyboard, the Select tool on touch) toggles the point's
    /// selection; otherwise the picker opens for the selection, or the point.
    public func pressEnded(_ nodeId: String, additive: Bool) {
        let wasTap = drag?.nodeId == nodeId && drag?.travelled == false
        drag = nil
        endGesture()
        guard wasTap, config?.nodes.contains(where: { $0.id == nodeId }) == true else { return }
        if additive {
            toggleSelected(nodeId)
        } else if selectedNodeIds.count > 1 {
            pickerTarget = selectedNodeIds
        } else {
            selectedNodeIds = []
            pickerTarget = [nodeId]
        }
    }

    /// The press was taken away (window lost focus, pointer cancel).
    public func pressCancelled() {
        drag = nil
        endGesture()
    }
}
