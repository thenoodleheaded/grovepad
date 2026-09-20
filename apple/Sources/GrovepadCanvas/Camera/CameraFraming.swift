import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Framing actions (`store/useCanvasStore.ts`: fitRect, fitAll,
// zoomToAnimated) and the frame-scope helpers that feed them.
// ---------------------------------------------------------------------------

public enum CameraFraming {
    /// `fitRect`'s own default (`useCanvasStore.fitRect`).
    public static let defaultFitPadding = 120.0
    /// `frameCanvas`'s default — what "fit the board" actually means.
    public static let framePadding = 160.0
    /// Framing never zooms in past this, however small the target.
    public static let fitZoomCeiling = 1.45
    public static let zoomTweenMs = 180.0

    /// The pan/zoom that centres `rect` in `viewportSize` with `padding`
    /// screen pixels clear on every side.
    public static func fit(_ rect: WorldRect, in viewportSize: Size, padding: Double = defaultFitPadding) -> CameraFrame {
        let width = max(1, rect.width)
        let height = max(1, rect.height)
        let availableWidth = max(1, viewportSize.width - padding * 2)
        let availableHeight = max(1, viewportSize.height - padding * 2)
        let zoom = CanvasGeometry.clampZoom(min(fitZoomCeiling, availableWidth / width, availableHeight / height))
        let pan = Vector2D(
            x: viewportSize.width / 2 - (rect.x + width / 2) * zoom,
            y: viewportSize.height / 2 - (rect.y + height / 2) * zoom
        )
        return CameraFrame(pan: pan, zoom: zoom)
    }

    /// Union of the rects `footprint` reports; nil when nothing has a box.
    public static func bounds(of widgets: [Widget], footprint: (Widget) -> WorldRect?) -> WorldRect? {
        var result: WorldRect?
        for widget in widgets {
            guard let rect = footprint(widget) else { continue }
            if let current = result {
                let minX = min(current.x, rect.x)
                let minY = min(current.y, rect.y)
                let maxX = max(current.maxX, rect.maxX)
                let maxY = max(current.maxY, rect.maxY)
                result = WorldRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
            } else {
                result = rect
            }
        }
        return result
    }

    /// Stored frames only — the scope helper for callers without a rest context.
    public static func boundsForWidgets(_ widgets: [Widget]) -> WorldRect? {
        bounds(of: widgets) { $0.frame }
    }
}

public extension CameraEngine {
    /// Fit immediately by default so framing is an atomic visibility guarantee.
    func fitRect(_ rect: WorldRect, padding: Double = CameraFraming.defaultFitPadding, animated: Bool = false) {
        let target = CameraFraming.fit(rect, in: viewportSize, padding: padding)
        if animated {
            animateTo(target.pan, target.zoom)
        } else {
            setView(target.pan, target.zoom)
        }
    }

    /// The web `fitAll`: home the camera on the origin at 100%.
    func fitAll() {
        animateTo(.zero, 1)
    }

    /// `frameCanvas('board')`: frame every widget that has a footprint, or
    /// home when there are none. The web's padding is 160, not `fitRect`'s
    /// own 120, and it lands IMMEDIATELY — `frameCanvas` never passes
    /// `animated`, so framing stays an atomic visibility guarantee and does
    /// not push a camera-history entry the back button then offers to undo.
    func fitWidgets(_ widgets: [Widget], footprint: (Widget) -> WorldRect? = { $0.frame }, padding: Double = CameraFraming.framePadding, animated: Bool = false) {
        guard let rect = CameraFraming.bounds(of: widgets, footprint: footprint) else {
            fitAll()
            return
        }
        fitRect(rect, padding: padding, animated: animated)
    }

    /// Like zoomAtPoint, but glides to the target over a short eased tween.
    func zoomToAnimated(_ zoom: Double, focal: Vector2D) {
        let next = CanvasGeometry.clampZoom(zoom)
        let prev = frame.zoom
        if next == prev { return }
        let scale = next / prev
        animateTo(
            Vector2D(
                x: focal.x - (focal.x - frame.pan.x) * scale,
                y: focal.y - (focal.y - frame.pan.y) * scale
            ),
            next,
            duration: CameraFraming.zoomTweenMs
        )
    }
}
