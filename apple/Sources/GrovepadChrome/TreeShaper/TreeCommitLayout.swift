import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Committed tree-shaper layout (`store/treeCommitLayout.ts`). The preview is
// drawn from small icon tiles, so its coordinates say nothing about how much
// room the real widgets need; this lays the tree out again in world space
// from the real widget sizes, so the committed board is already tidy.
// ---------------------------------------------------------------------------

public struct TreeCommitNode: Equatable, Sendable {
    public var id: String
    public var parentId: String?
    public var order: Int
    /// Real widget sizes for this node, in creation order.
    public var widgetSizes: [Size]

    public init(id: String, parentId: String?, order: Int, widgetSizes: [Size]) {
        self.id = id
        self.parentId = parentId
        self.order = order
        self.widgetSizes = widgetSizes
    }
}

public struct TreeCommitPlacement: Equatable, Sendable {
    public var nodeId: String
    /// Absolute world positions, index-aligned with the node's `widgetSizes`.
    public var widgetPositions: [Vector2D]
}

public struct TreeClusterLayout: Equatable, Sendable {
    public var width: Double
    public var height: Double
    /// Member offsets from the cluster's top-left.
    public var offsets: [Vector2D]
}

public enum TreeCommitLayout {
    /// Horizontal room between sibling bundles (clears both glass rims).
    public static let siblingGap = CanvasGeometry.gridSize * 3
    /// Vertical room between a parent's members and its children's: the lower
    /// rim, the child bundle's name pill and the child cards' title capsules.
    public static let generationGap = CanvasGeometry.gridSize * 5

    /// `clusterLayout`: one node's widgets packed grid-aligned and touching
    /// (the weld seam is drawn by the glued cards, not stored), top-aligned
    /// per row, rows wrapping into a near-square block and centred.
    public static func cluster(_ sizes: [Size]) -> TreeClusterLayout {
        guard !sizes.isEmpty else { return TreeClusterLayout(width: 0, height: 0, offsets: []) }
        let columns = Int(Double(sizes.count).squareRoot().rounded(.up))
        var rows: [[Size]] = []
        var rowIndexOf: [Int] = []
        for (index, size) in sizes.enumerated() {
            let row = index / columns
            if rows.count <= row { rows.append([]) }
            rows[row].append(size)
            rowIndexOf.append(row)
        }
        let rowWidths = rows.map { $0.reduce(0) { $0 + $1.width } }
        let rowHeights = rows.map { $0.map(\.height).max() ?? 0 }
        let width = rowWidths.max() ?? 0
        let height = rowHeights.reduce(0, +)
        var rowTops: [Double] = []
        var y = 0.0
        for rowHeight in rowHeights {
            rowTops.append(y)
            y += rowHeight
        }
        var cursorByRow = rowWidths.map { (width - $0) / 2 }
        var offsets: [Vector2D] = []
        for (index, size) in sizes.enumerated() {
            let row = rowIndexOf[index]
            offsets.append(Vector2D(x: cursorByRow[row], y: rowTops[row]))
            cursorByRow[row] += size.width
        }
        return TreeClusterLayout(width: width, height: height, offsets: offsets)
    }

    /// `layoutCommittedTree`: tidy-forest placement over real cluster
    /// footprints; each generation shares one baseline. Each cluster's
    /// top-left snaps to the grid once, then members sit at exact offsets so
    /// weld seams survive.
    public static func layout(_ nodes: [TreeCommitNode], originX: Double, originY: Double) -> [TreeCommitPlacement] {
        guard !nodes.isEmpty else { return [] }
        let ids = Set(nodes.map(\.id))
        var clusters: [String: TreeClusterLayout] = [:]
        for node in nodes { clusters[node.id] = cluster(node.widgetSizes) }
        var children: [String: [TreeCommitNode]] = [:]
        for node in nodes {
            guard let parentId = node.parentId, ids.contains(parentId) else { continue }
            children[parentId, default: []].append(node)
        }
        for key in children.keys { children[key]!.sort { $0.order < $1.order } }

        var subtreeWidth: [String: Double] = [:]
        func measure(_ node: TreeCommitNode) -> Double {
            let row = children[node.id] ?? []
            let own = clusters[node.id]!.width
            let spread = row.isEmpty ? 0 : row.reduce(0) { $0 + measure($1) } + siblingGap * Double(row.count - 1)
            let width = max(own, spread)
            subtreeWidth[node.id] = width
            return width
        }
        let roots = nodes.filter { $0.parentId == nil || !ids.contains($0.parentId!) }.sorted { $0.order < $1.order }
        guard !roots.isEmpty else { return [] }
        for root in roots { _ = measure(root) }

        var depthOf: [String: Int] = [:]
        var tallestByDepth: [Int: Double] = [:]
        func walkDepth(_ node: TreeCommitNode, _ depth: Int) {
            depthOf[node.id] = depth
            tallestByDepth[depth] = max(tallestByDepth[depth] ?? 0, clusters[node.id]!.height)
            for child in children[node.id] ?? [] { walkDepth(child, depth + 1) }
        }
        for root in roots { walkDepth(root, 0) }
        var topByDepth: [Int: Double] = [:]
        var cursorY = 0.0
        for depth in 0...(depthOf.values.max() ?? 0) {
            topByDepth[depth] = cursorY
            cursorY += (tallestByDepth[depth] ?? 0) + generationGap
        }

        var clusterOrigin: [String: Vector2D] = [:]
        func place(_ node: TreeCommitNode, _ start: Double) {
            let own = clusters[node.id]!
            let width = subtreeWidth[node.id]!
            // Centre each parent over the span its children occupy.
            clusterOrigin[node.id] = Vector2D(x: start + (width - own.width) / 2, y: topByDepth[depthOf[node.id] ?? 0]!)
            var cursor = start
            for child in children[node.id] ?? [] {
                place(child, cursor)
                cursor += subtreeWidth[child.id]! + siblingGap
            }
        }
        var rootCursor = 0.0
        for root in roots {
            place(root, rootCursor)
            rootCursor += subtreeWidth[root.id]! + siblingGap
        }

        // Anchor the whole forest on the shaping origin via its first root.
        let anchor = clusterOrigin[roots[0].id]!
        let anchorCluster = clusters[roots[0].id]!
        let shiftX = originX - (anchor.x + anchorCluster.width / 2)
        let shiftY = originY - anchor.y

        return nodes.map { node in
            guard let origin = clusterOrigin[node.id] else { return TreeCommitPlacement(nodeId: node.id, widgetPositions: []) }
            let baseX = CanvasGeometry.snapToGrid(origin.x + shiftX)
            let baseY = CanvasGeometry.snapToGrid(origin.y + shiftY)
            return TreeCommitPlacement(
                nodeId: node.id,
                widgetPositions: clusters[node.id]!.offsets.map { Vector2D(x: baseX + $0.x, y: baseY + $0.y) }
            )
        }
    }
}
