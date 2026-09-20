import Foundation

/// A point or displacement in screen or world space (`types/canvas.ts`).
public struct Vector2D: Equatable, Hashable, Sendable {
    public var x: Double
    public var y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }

    public static let zero = Vector2D(x: 0, y: 0)

    public init?(json: JSONValue?) {
        guard let object = json?.objectValue, let x = object.number("x"), let y = object.number("y") else { return nil }
        self.init(x: x, y: y)
    }

    /// `{ x, y }` in that order, or the existing object with both replaced in place.
    public func json(updating existing: JSONObject? = nil) -> JSONValue {
        var object = existing ?? JSONObject()
        object["x"] = .number(x)
        object["y"] = .number(y)
        return .object(object)
    }
}

/// A width/height pair in world units.
public struct Size: Equatable, Hashable, Sendable {
    public var width: Double
    public var height: Double

    public init(width: Double, height: Double) {
        self.width = width
        self.height = height
    }

    public init?(json: JSONValue?) {
        guard let object = json?.objectValue, let width = object.number("width"), let height = object.number("height") else { return nil }
        self.init(width: width, height: height)
    }

    public func json(updating existing: JSONObject? = nil) -> JSONValue {
        var object = existing ?? JSONObject()
        object["width"] = .number(width)
        object["height"] = .number(height)
        return .object(object)
    }
}

/// An axis-aligned world rectangle.
public struct WorldRect: Equatable, Hashable, Sendable {
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double

    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }

    public var minX: Double { x }
    public var minY: Double { y }
    public var maxX: Double { x + width }
    public var maxY: Double { y + height }
    public var center: Vector2D { Vector2D(x: x + width / 2, y: y + height / 2) }

    /// `rectsIntersect` from widgetVirtualization.ts (edge-touching counts).
    public func intersects(_ other: WorldRect) -> Bool {
        x <= other.x + other.width && x + width >= other.x && y <= other.y + other.height && y + height >= other.y
    }

    /// Strict overlap, as the marquee uses (gestureEngine.ts `intersects`).
    public func overlaps(_ other: WorldRect) -> Bool {
        x < other.x + other.width && x + width > other.x && y < other.y + other.height && y + height > other.y
    }

    public func contains(_ inner: WorldRect) -> Bool {
        inner.x >= x && inner.y >= y && inner.x + inner.width <= x + width && inner.y + inner.height <= y + height
    }

    public func contains(_ point: Vector2D) -> Bool {
        point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height
    }
}

/// Full camera transform: screen = world × zoom + pan (`types/canvas.ts`).
public struct CanvasTransform: Equatable, Hashable, Sendable {
    public var x: Double
    public var y: Double
    public var zoom: Double

    public init(x: Double, y: Double, zoom: Double) {
        self.x = x
        self.y = y
        self.zoom = zoom
    }
}

public enum CanvasGeometry {
    public static let zoomMin = 0.1
    public static let zoomMax = 3.0
    /// Base grid cell size in world units at zoom = 1.
    public static let gridSize = 40.0

    public static func clampZoom(_ zoom: Double) -> Double {
        min(zoomMax, max(zoomMin, zoom))
    }

    /// `Math.round(value / grid) * grid`. `jsRound`, not `rounded()`: a half
    /// lands toward +∞ on the web, so a card released at x = -60 snaps to -40
    /// there and would snap to -80 under Swift's away-from-zero rounding.
    /// Positions are persisted board state, so the two must not disagree.
    public static func snapToGrid(_ value: Double, grid: Double = gridSize) -> Double {
        jsRound(value / grid) * grid
    }

    public static func screenToWorld(_ point: Vector2D, transform: CanvasTransform) -> Vector2D {
        Vector2D(x: (point.x - transform.x) / transform.zoom, y: (point.y - transform.y) / transform.zoom)
    }

    public static func worldToScreen(_ point: Vector2D, transform: CanvasTransform) -> Vector2D {
        Vector2D(x: point.x * transform.zoom + transform.x, y: point.y * transform.zoom + transform.y)
    }

    /// Two grid cells square: the floor of anything icon-shaped (`ICON_MIN_EDGE`).
    public static let iconMinEdge = gridSize * 2
    /// Three grid cells square: the ceiling of an icon (`ICON_MAX_EDGE`).
    public static let iconMaxEdge = gridSize * 3
    /// The absolute ceiling on a widget's footprint on either axis (`WIDGET_MAX_EDGE`).
    public static let widgetMaxEdge = gridSize * 32
    public static let iconifiedSize = Size(width: 80, height: 80)
}

/// `Math.round` — half away from zero for positives, half toward +∞ overall,
/// which is what JavaScript does and `Double.rounded()` does not.
@inlinable public func jsRound(_ value: Double) -> Double {
    (value + 0.5).rounded(.down)
}
