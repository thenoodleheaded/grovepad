import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// The tree shaper's preview geometry, ported from `types/spatial.ts` (the
// ghost tree types and pitch), `utils/ghostTreePresentation.ts` (icon
// packing, the stepped contour, the alternating accent dashes) and
// `store/widgetGhostLayout.ts` (`layoutGhostTree`). Pure values: the model
// (`TreeShaperModel`) edits the tree, the view (`GhostTreeOverlay`) paints it.
// ---------------------------------------------------------------------------

public enum GhostShapeDirection: String, Sendable {
    case up, down, left, right
}

/// One tree point: a bundle of widget types that becomes one welded cluster.
public struct GhostTreeNode: Equatable, Identifiable, Sendable {
    public var id: String
    public var parentId: String?
    /// Stable sibling order; the layout derives x/y from topology after each edit.
    public var order: Int
    public var x: Double
    public var y: Double
    /// Widget types this point will materialise as one compact bundle.
    public var widgetTypes: [String]

    public init(id: String, parentId: String?, order: Int, x: Double, y: Double, widgetTypes: [String] = []) {
        self.id = id
        self.parentId = parentId
        self.order = order
        self.x = x
        self.y = y
        self.widgetTypes = widgetTypes
    }
}

/// The tree being sculpted. `originX`/`originY` are grid-snapped world points.
public struct GhostTreeConfig: Equatable, Sendable {
    public var originX: Double
    public var originY: Double
    public var nodes: [GhostTreeNode]

    public init(originX: Double, originY: Double, nodes: [GhostTreeNode]) {
        self.originX = originX
        self.originY = originY
        self.nodes = nodes
    }

    /// `ghostTreeWidgetCount`.
    public var widgetCount: Int { nodes.reduce(0) { $0 + $1.widgetTypes.count } }
    /// `ghostTreeUnconfiguredCount`.
    public var unconfiguredCount: Int { nodes.reduce(0) { $0 + ($1.widgetTypes.isEmpty ? 1 : 0) } }
}

public enum GhostTree {
    public static let siblingsPerSideMax = 4
    /// Exactly two grid cells (80 pt) of clear space between 40 pt markers.
    public static let pitchX = 120.0
    public static let pitchY = 120.0

    public static let iconSize = 28.0
    static let iconGap = 4.0
    static let nodePadding = 6.0
    static let emptySize = 40.0
    /// The empty point's accent (`#a855f7`), also its rope's colour.
    public static let emptyAccent = "#a855f7"
    static let contourRadius = 7.0

    static let dashLength = 6.0
    static let dashGap = 8.0
    static var dashStep: Double { dashLength + dashGap }
}

// MARK: - Icon packing

public struct GhostNodeGrid: Equatable, Sendable {
    public var columns: Int
    public var rows: Int
    public var rowCounts: [Int]
    public var width: Double
    public var height: Double
    /// Top-left of each icon, relative to the node's top-left.
    public var placements: [Vector2D]
}

public extension GhostTree {
    /// `balancedRowCounts`: the closest practical square, fuller rows in the
    /// middle, short rows centred by the caller.
    static func balancedRowCounts(_ itemCount: Int) -> [Int] {
        let rowCount = max(1, Int(jsRound(Double(itemCount).squareRoot())))
        let base = itemCount / rowCount
        var counts = Array(repeating: base, count: rowCount)
        var remaining = itemCount - base * rowCount
        let center = Double(rowCount - 1) / 2
        let priority = counts.indices.sorted { a, b in
            let da = abs(Double(a) - center), db = abs(Double(b) - center)
            return da != db ? da < db : a < b
        }
        for index in priority {
            if remaining == 0 { break }
            counts[index] += 1
            remaining -= 1
        }
        return counts
    }

    /// `ghostNodeGrid`: icons packed into the closest square, incomplete rows
    /// centred so odd counts read as one balanced bundle.
    static func grid(count: Int) -> GhostNodeGrid {
        let itemCount = max(0, count)
        if itemCount == 0 {
            return GhostNodeGrid(columns: 1, rows: 1, rowCounts: [], width: emptySize, height: emptySize, placements: [])
        }
        let rowCounts = balancedRowCounts(itemCount)
        let columns = rowCounts.max() ?? 1
        let rows = rowCounts.count
        let width = max(emptySize, nodePadding * 2 + Double(columns) * iconSize + Double(columns - 1) * iconGap)
        let height = max(emptySize, nodePadding * 2 + Double(rows) * iconSize + Double(rows - 1) * iconGap)
        var placements: [Vector2D] = []
        for (row, rowCount) in rowCounts.enumerated() {
            let rowWidth = Double(rowCount) * iconSize + Double(max(0, rowCount - 1)) * iconGap
            let rowStart = (width - rowWidth) / 2
            for column in 0..<rowCount {
                placements.append(Vector2D(
                    x: rowStart + Double(column) * (iconSize + iconGap),
                    y: nodePadding + Double(row) * (iconSize + iconGap)
                ))
            }
        }
        return GhostNodeGrid(columns: columns, rows: rows, rowCounts: rowCounts, width: width, height: height, placements: placements)
    }
}

// MARK: - Contour

/// A rounded polygon as drawing steps: move to `start`, then for every
/// corner a quadratic curve through it followed by a line to the next
/// corner's entry, then close (`roundedPolygonPath`'s SVG, as values).
public struct GhostContour: Equatable, Sendable {
    public struct Corner: Equatable, Sendable {
        public var control: Vector2D
        public var end: Vector2D
        public var lineTo: Vector2D
    }

    public var start: Vector2D
    public var corners: [Corner]
}

public extension GhostTree {
    /// `ghostNodeContourPath`: a stepped, rounded hull following the icon rows.
    static func contour(_ grid: GhostNodeGrid) -> GhostContour? {
        if grid.placements.isEmpty {
            return roundedPolygon([
                Vector2D(x: 1, y: 1),
                Vector2D(x: grid.width - 1, y: 1),
                Vector2D(x: grid.width - 1, y: grid.height - 1),
                Vector2D(x: 1, y: grid.height - 1),
            ], radius: contourRadius)
        }
        let contourPadding = nodePadding - 1
        struct Bounds { var left, right, top, bottom: Double }
        var rowBounds: [Bounds] = []
        var firstIndex = 0
        for (row, count) in grid.rowCounts.enumerated() {
            let first = grid.placements[firstIndex]
            let last = grid.placements[firstIndex + count - 1]
            rowBounds.append(Bounds(
                left: first.x - contourPadding,
                right: last.x + iconSize + contourPadding,
                top: row == 0 ? 1 : first.y - iconGap / 2,
                bottom: row == grid.rows - 1 ? grid.height - 1 : first.y + iconSize + iconGap / 2
            ))
            firstIndex += count
        }
        var points = [Vector2D(x: rowBounds[0].left, y: rowBounds[0].top), Vector2D(x: rowBounds[0].right, y: rowBounds[0].top)]
        for row in 0..<(rowBounds.count - 1) {
            let current = rowBounds[row], next = rowBounds[row + 1]
            points.append(Vector2D(x: current.right, y: current.bottom))
            points.append(Vector2D(x: next.right, y: current.bottom))
        }
        let last = rowBounds[rowBounds.count - 1]
        points.append(Vector2D(x: last.right, y: last.bottom))
        points.append(Vector2D(x: last.left, y: last.bottom))
        for row in stride(from: rowBounds.count - 1, to: 0, by: -1) {
            let current = rowBounds[row], previous = rowBounds[row - 1]
            points.append(Vector2D(x: current.left, y: current.top))
            points.append(Vector2D(x: previous.left, y: current.top))
        }
        return roundedPolygon(simplifyPolygon(points), radius: contourRadius)
    }

    static func simplifyPolygon(_ points: [Vector2D]) -> [Vector2D] {
        let distinct = points.enumerated().filter { index, point in
            let previous = points[(index - 1 + points.count) % points.count]
            return point.x != previous.x || point.y != previous.y
        }.map(\.element)
        return distinct.enumerated().filter { index, point in
            let previous = distinct[(index - 1 + distinct.count) % distinct.count]
            let next = distinct[(index + 1) % distinct.count]
            return !((previous.x == point.x && point.x == next.x) || (previous.y == point.y && point.y == next.y))
        }.map(\.element)
    }

    static func roundedPolygon(_ points: [Vector2D], radius: Double) -> GhostContour? {
        guard points.count >= 3 else { return nil }
        struct Rounded { var current, before, after: Vector2D }
        let rounded: [Rounded] = points.indices.map { index in
            let previous = points[(index - 1 + points.count) % points.count]
            let current = points[index]
            let next = points[(index + 1) % points.count]
            let incoming = hypot(previous.x - current.x, previous.y - current.y)
            let outgoing = hypot(next.x - current.x, next.y - current.y)
            let amount = min(radius, incoming / 2, outgoing / 2)
            return Rounded(
                current: current,
                before: Vector2D(
                    x: current.x + ((previous.x - current.x) / max(1, incoming)) * amount,
                    y: current.y + ((previous.y - current.y) / max(1, incoming)) * amount
                ),
                after: Vector2D(
                    x: current.x + ((next.x - current.x) / max(1, outgoing)) * amount,
                    y: current.y + ((next.y - current.y) / max(1, outgoing)) * amount
                )
            )
        }
        let corners = rounded.indices.map { index in
            GhostContour.Corner(control: rounded[index].current, end: rounded[index].after, lineTo: rounded[(index + 1) % rounded.count].before)
        }
        return GhostContour(start: rounded[0].before, corners: corners)
    }
}

// MARK: - Accent dashes

public struct GhostDash: Equatable, Sendable {
    /// `[dash, gap]` in points.
    public var pattern: [Double]
    /// The SVG `stroke-dashoffset`, folded into one period so Core Graphics
    /// never sees a negative phase.
    public var phase: Double
}

public extension GhostTree {
    /// `ghostAccentDash`: one overlaid stroke per accent paints every Nth dash.
    static func accentDash(index accentIndex: Int, count accentCount: Int) -> GhostDash {
        let count = max(1, accentCount)
        let index = ((accentIndex % count) + count) % count
        let period = dashStep * Double(count)
        let offset = index == 0 ? 0 : -Double(index) * dashStep
        let phase = (offset.truncatingRemainder(dividingBy: period) + period).truncatingRemainder(dividingBy: period)
        return GhostDash(pattern: [dashLength, period - dashLength], phase: phase)
    }
}

// MARK: - Layout

public extension GhostTree {
    /// `layoutGhostTree`: tidy forest with subtree-width reservation. Siblings
    /// and independent branches yield room to each other, and the order-zero
    /// root stays centred on the shaping origin.
    static func layout(_ source: [GhostTreeNode], originX: Double, originY: Double) -> [GhostTreeNode] {
        var nodes = source
        let indexById = Dictionary(nodes.enumerated().map { ($1.id, $0) }, uniquingKeysWith: { first, _ in first })
        var children: [String: [Int]] = [:]
        for (index, node) in nodes.enumerated() {
            guard let parentId = node.parentId, indexById[parentId] != nil else { continue }
            children[parentId, default: []].append(index)
        }
        for key in children.keys { children[key]!.sort { nodes[$0].order < nodes[$1].order } }
        let horizontalGap = pitchX - 40
        let verticalGap = pitchY - 40
        var widths: [String: Double] = [:]
        var depthById: [String: Int] = [:]
        var maxHeightByDepth: [Int: Double] = [:]

        func measure(_ index: Int) -> Double {
            let node = nodes[index]
            let row = children[node.id] ?? []
            let ownWidth = grid(count: node.widgetTypes.count).width
            let childrenWidth = row.isEmpty ? 0 : row.reduce(0) { $0 + measure($1) } + horizontalGap * Double(row.count - 1)
            let width = max(ownWidth, childrenWidth)
            widths[node.id] = width
            return width
        }
        let roots = nodes.indices.filter { nodes[$0].parentId == nil }.sorted { nodes[$0].order < nodes[$1].order }
        guard !roots.isEmpty else { return nodes }
        for root in roots { _ = measure(root) }

        func measureDepth(_ index: Int, _ depth: Int) {
            let node = nodes[index]
            depthById[node.id] = depth
            maxHeightByDepth[depth] = max(maxHeightByDepth[depth] ?? 0, grid(count: node.widgetTypes.count).height)
            for child in children[node.id] ?? [] { measureDepth(child, depth + 1) }
        }
        for root in roots { measureDepth(root, 0) }
        var yByDepth: [Int: Double] = [:]
        var nextY = originY
        let maxDepth = depthById.values.max() ?? 0
        for depth in 0...maxDepth {
            yByDepth[depth] = nextY
            nextY += (maxHeightByDepth[depth] ?? 40) + verticalGap
        }

        func place(_ index: Int, _ start: Double) {
            let id = nodes[index].id
            let width = widths[id] ?? 1
            let own = grid(count: nodes[index].widgetTypes.count)
            nodes[index].x = start + width / 2 - own.width / 2
            nodes[index].y = yByDepth[depthById[id] ?? 0] ?? originY
            var cursor = start
            for child in children[id] ?? [] {
                place(child, cursor)
                cursor += (widths[nodes[child].id] ?? 1) + horizontalGap
            }
        }
        var rootCursor = 0.0
        for root in roots {
            place(root, rootCursor)
            rootCursor += (widths[nodes[root].id] ?? 1) + horizontalGap
        }
        let anchor = roots.first { nodes[$0].order == 0 } ?? roots[0]
        let rootWidth = grid(count: nodes[anchor].widgetTypes.count).width
        let shiftX = originX + 20 - (nodes[anchor].x + rootWidth / 2)
        for index in nodes.indices { nodes[index].x += shiftX }
        return nodes
    }
}
