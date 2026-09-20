import Foundation
import GrovepadCore
@testable import GrovepadCanvas

/// A widget record in the web app's key order, sized like the test boards.
func makeWidget(
    id: String,
    type: String = "text",
    title: String? = nil,
    canvasId: String = "canvas",
    x: Double = 0,
    y: Double = 0,
    width: Double = 240,
    height: Double = 160,
    locked: Bool = false,
    pinned: Bool = false,
    iconified: Bool? = nil,
    zIndex: Double? = nil
) -> Widget {
    var metadata = WidgetMetadata()
    metadata.locked = locked
    metadata.pinned = pinned
    metadata.zIndex = zIndex
    var widget = Widget(
        id: id, type: type, title: title ?? id, canvasId: canvasId,
        position: Vector2D(x: x, y: y), size: Size(width: width, height: height),
        data: JSONObject(), metadata: metadata
    )
    widget.iconified = iconified
    return widget
}

/// A rest context whose every widget rests as an 80×80 tile.
func tileRestContext(edge: Double = 80, expandedWidgetId: String? = nil, expandedOffset: Vector2D? = nil) -> RestContext {
    RestContext(expandedWidgetId: expandedWidgetId, expandedOffset: expandedOffset) { _ in Size(width: edge, height: edge) }
}

func rect(_ x: Double, _ y: Double, _ w: Double, _ h: Double) -> WorldRect {
    WorldRect(x: x, y: y, width: w, height: h)
}
