import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Drag and resize law (widget constitution XII.1; `store/slices/
// widgetLayoutSlice.ts` clamp rules, `utils/widgetScale.ts`,
// `utils/widgetResizeEdge.ts`). Pure functions over a Widget: the store
// applies the result and settles neighbours afterwards.
// ---------------------------------------------------------------------------

/// `WidgetSizing` from `widgets/contracts/registry.ts`.
public struct SizingRules: Equatable, Sendable {
    public var minWidth: Double?
    public var minHeight: Double?
    public var maxWidth: Double?
    public var maxHeight: Double?
    /// Content-fit height: the per-type height ceiling is lifted (never the
    /// absolute one) and a gesture is width-only.
    public var autoHeight: Bool
    public var autoWidth: Bool
    /// Entirely content-driven: no resize handle, no manual size.
    public var fixed: Bool

    public init(
        minWidth: Double? = nil,
        minHeight: Double? = nil,
        maxWidth: Double? = nil,
        maxHeight: Double? = nil,
        autoHeight: Bool = false,
        autoWidth: Bool = false,
        fixed: Bool = false
    ) {
        self.minWidth = minWidth
        self.minHeight = minHeight
        self.maxWidth = maxWidth
        self.maxHeight = maxHeight
        self.autoHeight = autoHeight
        self.autoWidth = autoWidth
        self.fixed = fixed
    }

    /// `DEFAULT_SIZING`: 200 × 120 floor, 1280 × 1280 ceiling.
    public static let defaultMinWidth = CanvasGeometry.gridSize * 5
    public static let defaultMinHeight = CanvasGeometry.gridSize * 3
    public static let defaultMaxWidth = CanvasGeometry.gridSize * 32
    public static let defaultMaxHeight = CanvasGeometry.gridSize * 32

    public static let defaults = SizingRules(
        minWidth: defaultMinWidth, minHeight: defaultMinHeight,
        maxWidth: defaultMaxWidth, maxHeight: defaultMaxHeight
    )

    /// `mergeWidgetSizing`: a mounted renderer's measured rules tighten the
    /// registry fallback and never loosen it, in both directions.
    public static func merge(fallback: SizingRules?, live: SizingRules?) -> SizingRules {
        var result = fallback ?? SizingRules()
        if let live {
            if live.maxWidth != nil { result.maxWidth = live.maxWidth }
            if live.maxHeight != nil { result.maxHeight = live.maxHeight }
            // `autoHeight` is NOT merged: the web writes
            // `autoHeight: fallback?.autoHeight` after the `...live` spread,
            // so only the registry decides content-fit. It is the flag that
            // lifts the per-type height ceiling, and a measured card must
            // never be able to loosen the window this function tightens.
            result.autoWidth = live.autoWidth || result.autoWidth
            result.fixed = live.fixed || result.fixed
        }
        let minWidth = max(fallback?.minWidth ?? 0, live?.minWidth ?? 0)
        let minHeight = max(fallback?.minHeight ?? 0, live?.minHeight ?? 0)
        result.minWidth = minWidth == 0 ? nil : minWidth
        result.minHeight = minHeight == 0 ? nil : minHeight
        if let fallbackMax = fallback?.maxWidth, let liveMax = live?.maxWidth { result.maxWidth = min(fallbackMax, liveMax) }
        if let fallbackMax = fallback?.maxHeight, let liveMax = live?.maxHeight { result.maxHeight = min(fallbackMax, liveMax) }
        return result
    }
}

/// Which sides a gesture moves: -1 left/top, +1 right/bottom, 0 pinned. The
/// pinned side never moves, so a drag grows the box away from it rather than
/// out of its centre.
public struct ResizeEdge: Equatable, Sendable {
    public var x: Int
    public var y: Int

    public init(x: Int, y: Int) {
        self.x = max(-1, min(1, x))
        self.y = max(-1, min(1, y))
    }

    public static let left = ResizeEdge(x: -1, y: 0)
    public static let right = ResizeEdge(x: 1, y: 0)
    public static let top = ResizeEdge(x: 0, y: -1)
    public static let bottom = ResizeEdge(x: 0, y: 1)
    public static let topLeft = ResizeEdge(x: -1, y: -1)
    public static let topRight = ResizeEdge(x: 1, y: -1)
    public static let bottomLeft = ResizeEdge(x: -1, y: 1)
    public static let bottomRight = ResizeEdge(x: 1, y: 1)
}

public extension ResizeEdge {
    /// `RESIZE_BAND_PX` / `RESIZE_CORNER_PX`: screen points of border that
    /// answer the pointer, and how far along the other axis a side still
    /// counts as its corner. Screen-space, so equally reachable at any zoom.
    static let bandPoints = 14.0
    static let cornerPoints = 28.0

    /// `resizeEdgeAt`: the edge armed for a pointer at `point` in the box's
    /// own coordinates (screen points, origin top-left), or nil inside the
    /// interior or outside the band. Bands are capped against the box so a
    /// small tile keeps an interior to press; the band reaches a little past
    /// the border on purpose.
    /// `inside` caps how far the band reaches INTO the box (nil: as far as
    /// outside). A native card's controls sit near its border, so the Mac
    /// keeps most of the band outside where it cannot take their clicks.
    static func at(_ point: Vector2D, size: Size, band bandPoints: Double = ResizeEdge.bandPoints, corner cornerPoints: Double = ResizeEdge.cornerPoints, inside insidePoints: Double? = nil) -> ResizeEdge? {
        let limit = max(2, min(size.width, size.height) / 3)
        let band = min(bandPoints, limit)
        let inner = min(insidePoints ?? band, band)
        let corner = max(band, min(cornerPoints, limit * 1.6))
        if point.x < -band || point.x > size.width + band { return nil }
        if point.y < -band || point.y > size.height + band { return nil }
        var x = 0
        var y = 0
        if point.x <= inner { x = -1 } else if point.x >= size.width - inner { x = 1 }
        if point.y <= inner { y = -1 } else if point.y >= size.height - inner { y = 1 }
        if x != 0, y == 0 {
            if point.y <= corner { y = -1 } else if point.y >= size.height - corner { y = 1 }
        } else if y != 0, x == 0 {
            if point.x <= corner { x = -1 } else if point.x >= size.width - corner { x = 1 }
        }
        return x == 0 && y == 0 ? nil : ResizeEdge(x: x, y: y)
    }
}

public enum DragResize {
    /// `MIN_WIDGET_WIDTH` / `MIN_WIDGET_HEIGHT`: one cell.
    public static let minWidgetWidth = CanvasGeometry.gridSize
    public static let minWidgetHeight = CanvasGeometry.gridSize
    /// `REST_ELASTIC_PX`: how far a rubber band can stretch past a bound.
    public static let elasticLimit = 18.0

    // MARK: Dragging

    /// A screen delta in world units: the camera scales the gesture, so a
    /// 10 px drag at 50% zoom moves the card 20 world units.
    public static func worldDelta(screenDelta: Vector2D, zoom: Double) -> Vector2D {
        let safeZoom = zoom > 0 ? zoom : 1
        return Vector2D(x: screenDelta.x / safeZoom, y: screenDelta.y / safeZoom)
    }

    /// `moveWidget` for one card. Locked widgets never move; a zero delta is
    /// a no-op so callers can compare identity.
    public static func moved(_ widget: Widget, by screenDelta: Vector2D, zoom: Double) -> Widget {
        if widget.metadata.locked { return widget }
        let delta = worldDelta(screenDelta: screenDelta, zoom: zoom)
        if delta.x == 0 && delta.y == 0 { return widget }
        var next = widget
        next.position = Vector2D(x: widget.position.x + delta.x, y: widget.position.y + delta.y)
        return next
    }

    /// `snapWidgetToGrid`: landing on the grid at release.
    public static func snappedToGrid(_ widget: Widget) -> Widget {
        if widget.metadata.locked { return widget }
        let snapped = Vector2D(x: CanvasGeometry.snapToGrid(widget.position.x), y: CanvasGeometry.snapToGrid(widget.position.y))
        if snapped == widget.position { return widget }
        var next = widget
        next.position = snapped
        return next
    }

    // MARK: Rubber band

    /// Damped travel past a boundary. Never reaches `limit`, so it always
    /// reads as resistance rather than a second, softer range.
    public static func elasticOvershoot(_ distance: Double, limit: Double = 36) -> Double {
        if distance <= 0 { return 0 }
        return limit * (1 - exp(-distance / limit))
    }

    /// The painted value for a pull to `requested` against `[lower, upper]`:
    /// inside the range it is the request; past a bound it is the bound plus
    /// a damped overshoot. The stored value is `clampBack`, never this.
    public static func rubberBand(_ requested: Double, lower: Double, upper: Double, limit: Double = elasticLimit) -> Double {
        if requested < lower { return lower - elasticOvershoot(lower - requested, limit: limit) }
        if requested > upper { return upper + elasticOvershoot(requested - upper, limit: limit) }
        return requested
    }

    /// Where a rubber-banded value lands on release.
    public static func clampBack(_ value: Double, lower: Double, upper: Double) -> Double {
        min(upper, max(lower, value))
    }

    // MARK: Full-card clamp

    /// `clampFullSize`: the store's final clamp for every resize path.
    /// `dataWidth`/`dataHeight` are the content-derived floors (0 = none).
    public static func clampFullSize(_ requested: Size, rules: SizingRules, dataWidth: Double = 0, dataHeight: Double = 0) -> Size {
        let ceiling = CanvasGeometry.widgetMaxEdge
        // Even a content-derived floor answers to the absolute ceiling: a min
        // above it would otherwise invert the range and pin the card at an
        // illegal size.
        let minWidth = min(ceiling, max(rules.minWidth ?? SizingRules.defaultMinWidth, dataWidth))
        let minHeight = min(ceiling, max(rules.minHeight ?? SizingRules.defaultMinHeight, dataHeight))
        let maxWidth = min(ceiling, max(minWidth, rules.maxWidth ?? SizingRules.defaultMaxWidth))
        // Content-fit types grow past the per-type height ceiling by design,
        // but never past the absolute one — that fallback used to be
        // Infinity, which is how a long list could grow until it swallowed
        // the board.
        let configuredMaxHeight = rules.autoHeight
            ? (rules.maxHeight ?? ceiling)
            : (rules.maxHeight ?? SizingRules.defaultMaxHeight)
        let maxHeight = min(ceiling, max(minHeight, configuredMaxHeight))
        return Size(
            width: min(maxWidth, max(minWidth, requested.width)),
            height: min(maxHeight, max(minHeight, requested.height))
        )
    }

    /// `resizeWidget`: the size a request lands at. `snap` is a committed
    /// request (release); a live frame passes false.
    public static func resized(
        _ widget: Widget,
        to requested: Size,
        snap: Bool,
        rules: SizingRules,
        dataWidth: Double = 0,
        dataHeight: Double = 0
    ) -> Widget {
        if widget.metadata.locked { return widget }
        // An icon is a square with its own gesture (`resizedFromEdge`): a
        // plain size request never reshapes it.
        if widget.iconified == true { return widget }
        var size = snap
            ? Size(
                width: max(minWidgetWidth, CanvasGeometry.snapToGrid(requested.width)),
                height: max(minWidgetHeight, CanvasGeometry.snapToGrid(requested.height))
            )
            : Size(width: max(minWidgetWidth, requested.width), height: max(minWidgetHeight, requested.height))
        size = clampFullSize(size, rules: rules, dataWidth: dataWidth, dataHeight: dataHeight)
        if size == widget.size { return widget }
        var next = widget
        next.size = size
        return next
    }

    /// Where the box's origin has to sit so the pinned sides stay exactly
    /// where they were while the dragged sides move. Growing from the left
    /// edge walks the origin left; growing from the right leaves it alone.
    public static func anchoredOrigin(_ origin: Vector2D, from: Size, to: Size, edge: ResizeEdge) -> Vector2D {
        Vector2D(
            x: edge.x == -1 ? origin.x + (from.width - to.width) : origin.x,
            y: edge.y == -1 ? origin.y + (from.height - to.height) : origin.y
        )
    }

    /// Outward pointer travel along each axis, signed by the armed edge:
    /// positive means "bigger". A pinned axis contributes nothing.
    public static func outwardGrowth(edge: ResizeEdge, dx: Double, dy: Double) -> Vector2D {
        Vector2D(x: Double(edge.x) * dx, y: Double(edge.y) * dy)
    }

    /// An icon is the same state at every size between 2×2 and 3×3: a square
    /// whose edge follows the pull freely while held (`snap` false) and
    /// settles on the nearest whole-cell square when let go. Never a switch
    /// between an "80" state and a "120" state.
    static func scaledIcon(_ widget: Widget, to requested: Size, edge: ResizeEdge, snap: Bool) -> Widget {
        var pulled: [Double] = []
        if edge.x != 0 { pulled.append(requested.width) }
        if edge.y != 0 { pulled.append(requested.height) }
        guard !pulled.isEmpty else { return widget }
        let intended = pulled.reduce(0, +) / Double(pulled.count)
        let edgeLength = min(CanvasGeometry.iconMaxEdge, max(CanvasGeometry.iconMinEdge, snap ? CanvasGeometry.snapToGrid(intended) : intended))
        let size = Size(width: edgeLength, height: edgeLength)
        if size == widget.size { return widget }
        var next = widget
        next.size = size
        return next
    }

    /// `resizeWidgetFromEdge`: apply a size request, then move the origin so
    /// the sides the gesture did not grab stay pinned.
    public static func resizedFromEdge(
        _ widget: Widget,
        to requested: Size,
        edge: ResizeEdge,
        snap: Bool,
        rules: SizingRules,
        dataWidth: Double = 0,
        dataHeight: Double = 0
    ) -> Widget {
        let after = widget.iconified == true && !widget.metadata.locked
            ? scaledIcon(widget, to: requested, edge: edge, snap: snap)
            : resized(widget, to: requested, snap: snap, rules: rules, dataWidth: dataWidth, dataHeight: dataHeight)
        if after.size == widget.size { return after }
        let origin = anchoredOrigin(widget.position, from: widget.size, to: after.size, edge: edge)
        if origin == after.position { return after }
        var moved = after
        moved.position = origin
        return moved
    }

    /// The size a drag intends, from the box at gesture start and the
    /// pointer's screen travel: each grabbed axis grows by its outward pull
    /// in world units, pinned axes hold.
    public static func intendedSize(start: Size, edge: ResizeEdge, screenDelta: Vector2D, zoom: Double) -> Size {
        let delta = worldDelta(screenDelta: screenDelta, zoom: zoom)
        let growth = outwardGrowth(edge: edge, dx: delta.x, dy: delta.y)
        return Size(width: start.width + growth.x, height: start.height + growth.y)
    }
}
