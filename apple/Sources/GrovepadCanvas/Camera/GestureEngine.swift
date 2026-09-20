import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Gesture engine (`engine/camera/gestureEngine.ts`, canvas engine contract
// §1): every input that moves the camera, plus the empty-canvas marquee
// gestures that share the surface.
//
// - pinch / Ctrl(Cmd)+wheel → zoom centred on the cursor/midpoint
// - plain wheel / trackpad  → two-axis pan
// - middle-click drag       → pan
// - Space + left drag       → pan
// - left drag on empty canvas → pan (Navigate) or marquee select (Select/Shift)
// - Z + left drag           → zoom-to-region
// - touch: one finger pans per mode, two fingers pinch, release flings,
//   a still finger opens the context menu after LONG_PRESS_MS
//
// This is a pure state machine: the host view translates platform events
// into viewport-space `PointerEvent`s and `WheelEvent`s, and the engine
// drives a CameraEngine plus a delegate. Camera writes go straight to the
// camera — one transform write per event, nothing else on the hot path.
// ---------------------------------------------------------------------------

public enum PointerKind: Sendable {
    case mouse
    case touch
    case pen
}

public enum PointerPhase: Sendable {
    case down
    case move
    case up
    case cancel
}

public struct PointerModifiers: OptionSet, Sendable {
    public let rawValue: UInt8
    public init(rawValue: UInt8) { self.rawValue = rawValue }
    public static let shift = PointerModifiers(rawValue: 1)
    public static let alt = PointerModifiers(rawValue: 2)
    public static let ctrl = PointerModifiers(rawValue: 4)
    public static let cmd = PointerModifiers(rawValue: 8)
}

/// A pointer event already translated into viewport coordinates.
public struct PointerEvent: Sendable {
    public var id: Int
    public var kind: PointerKind
    public var phase: PointerPhase
    /// Viewport-relative position in screen points.
    public var point: Vector2D
    /// 0 primary, 1 middle, 2 secondary — the DOM convention.
    public var button: Int
    /// Milliseconds on the scheduler's clock.
    public var timestamp: Double
    public var modifiers: PointerModifiers
    /// False when the press landed on a card or a piece of chrome; the host
    /// decides this the way `isEmptyCanvasTarget` does.
    public var isEmptyCanvas: Bool

    public init(
        id: Int,
        kind: PointerKind,
        phase: PointerPhase,
        point: Vector2D,
        button: Int = 0,
        timestamp: Double = 0,
        modifiers: PointerModifiers = [],
        isEmptyCanvas: Bool = true
    ) {
        self.id = id
        self.kind = kind
        self.phase = phase
        self.point = point
        self.button = button
        self.timestamp = timestamp
        self.modifiers = modifiers
        self.isEmptyCanvas = isEmptyCanvas
    }
}

public struct WheelEvent: Sendable {
    public var delta: Vector2D
    /// Trackpad pinch arrives as ctrl+wheel; mouse users hold Ctrl/Cmd.
    public var ctrlOrCmd: Bool
    /// `deltaMode === DOM_DELTA_LINE`: deltas are lines, not pixels.
    public var lineMode: Bool
    /// Cursor position in viewport coordinates.
    public var point: Vector2D

    public init(delta: Vector2D, ctrlOrCmd: Bool = false, lineMode: Bool = false, point: Vector2D) {
        self.delta = delta
        self.ctrlOrCmd = ctrlOrCmd
        self.lineMode = lineMode
        self.point = point
    }
}

public enum GestureKey: Sendable {
    case space
    case z
}

public enum CanvasCursor: Sendable {
    case standard
    case grab
    case grabbing
    case zoomIn
}

public enum ActiveGesture: Sendable {
    case pan
    case pinch
    case select
    case zoomRegion
}

public protocol GestureDelegate: AnyObject {
    /// A marquee (`.select`) or a zoom-region box (`.zoomRegion`) has passed
    /// the drag threshold. `mode` is the marquee mode fixed at pointerdown.
    func gestureMarqueeStarted(kind: ActiveGesture, mode: MarqueeMode)
    /// The box moved. `boxedCount` is the live badge number for a marquee
    /// and 0 for a zoom region.
    func gestureMarqueeUpdated(screenRect: WorldRect, worldRect: WorldRect, boxedCount: Int)
    /// A marquee finished: `boxedIds` are the widgets it boxed, in board order.
    func gestureMarqueeFinished(worldRect: WorldRect, boxedIds: [String], mode: MarqueeMode)
    /// A zoom region finished; the camera has already been fitted to it.
    func gestureZoomRegionFinished(worldRect: WorldRect)
    /// A marquee or zoom-region box was dismissed without finishing.
    func gestureMarqueeCancelled()
    /// A touch stayed within the slop for LONG_PRESS_MS on empty canvas.
    func gestureLongPress(at point: Vector2D)
    func gestureIsPanningChanged(_ isPanning: Bool)
    func gestureCursorChanged(_ cursor: CanvasCursor)
    /// A mouse or pen moved with nothing pressed.
    func gestureHover(at point: Vector2D?)
    /// A press began; open menus close.
    func gestureWillBeginPress()
}

public extension GestureDelegate {
    func gestureMarqueeStarted(kind: ActiveGesture, mode: MarqueeMode) {}
    func gestureMarqueeUpdated(screenRect: WorldRect, worldRect: WorldRect, boxedCount: Int) {}
    func gestureMarqueeFinished(worldRect: WorldRect, boxedIds: [String], mode: MarqueeMode) {}
    func gestureZoomRegionFinished(worldRect: WorldRect) {}
    func gestureMarqueeCancelled() {}
    func gestureLongPress(at point: Vector2D) {}
    func gestureIsPanningChanged(_ isPanning: Bool) {}
    func gestureCursorChanged(_ cursor: CanvasCursor) {}
    func gestureHover(at point: Vector2D?) {}
    func gestureWillBeginPress() {}
}

public enum GestureTuning {
    public static let wheelZoomFactor = 0.0022
    public static let wheelLinePx = 16.0
    /// `LONG_PRESS_MS` from `utils/tapGesture.ts`.
    public static let longPressMs = 500.0
    /// A long press survives this much travel (`TAP_SLOP_PX`).
    public static let longPressSlopPx = 8.0
    /// Zoom-region framing leaves this much clear around the box.
    public static let zoomRegionPadding = 24.0
}

public final class GestureEngine {
    public let camera: CameraEngine
    public weak var delegate: GestureDelegate?
    public var interactionMode: InteractionMode = .navigate

    /// The widgets a world rect boxes, in board order. The engine counts
    /// them for the live badge and hands them to the delegate on release.
    public var marqueeHitTest: ((WorldRect) -> [String])?

    private let timeouts: TimeoutScheduler

    public private(set) var activeGesture: ActiveGesture?
    private var activePointerId: Int?
    private var last = Vector2D.zero
    private var gestureStart: Vector2D?
    private var latestPoint: Vector2D?
    private var hasPassedThreshold = false
    private var isSpaceHeld = false
    private var isZHeld = false
    // Read once at pointerdown: the modifier that STARTED the box is the one
    // that decides how it merges, so releasing shift mid-drag cannot silently
    // turn an additive box into a replacing one.
    private var marqueeMode: MarqueeMode = .replace

    private var touches: [(id: Int, point: Vector2D)] = []
    private var pinchStart: (distance: Double, midpoint: Vector2D, zoom: Double, pan: Vector2D)?
    private var panSamples: [TimedPoint] = []
    private var longPressTimer = 0
    private var longPressStart: Vector2D?
    private var cursor = CanvasCursor.standard
    private var isPanning = false

    public init(camera: CameraEngine, timeouts: TimeoutScheduler) {
        self.camera = camera
        self.timeouts = timeouts
    }

    public var isSpacePressed: Bool { isSpaceHeld }
    public var isZPressed: Bool { isZHeld }
    public var currentCursor: CanvasCursor { cursor }

    // MARK: - Helpers

    private func setIsPanning(_ value: Bool) {
        if isPanning == value { return }
        isPanning = value
        delegate?.gestureIsPanningChanged(value)
    }

    private func updateCursor() {
        let next: CanvasCursor
        if activeGesture == .pan { next = .grabbing }
        else if activeGesture == .zoomRegion { next = .zoomIn }
        else if isSpaceHeld { next = .grab }
        else if isZHeld { next = .zoomIn }
        else { next = .standard }
        if next == cursor { return }
        cursor = next
        delegate?.gestureCursorChanged(next)
    }

    private func cancelLongPress() {
        if longPressTimer != 0 { timeouts.cancelTimeout(longPressTimer) }
        longPressTimer = 0
        longPressStart = nil
    }

    private func touchPair() -> (distance: Double, midpoint: Vector2D)? {
        guard touches.count >= 2 else { return nil }
        let a = touches[0].point
        let b = touches[1].point
        return (
            distance: max(1, ((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)).squareRoot()),
            midpoint: Vector2D(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2)
        )
    }

    private func setTouch(_ id: Int, _ point: Vector2D) {
        if let index = touches.firstIndex(where: { $0.id == id }) {
            touches[index].point = point
        } else {
            touches.append((id, point))
        }
    }

    private func worldRect(from a: Vector2D, to b: Vector2D) -> WorldRect {
        let transform = camera.frame.transform
        let worldA = CanvasGeometry.screenToWorld(a, transform: transform)
        let worldB = CanvasGeometry.screenToWorld(b, transform: transform)
        return WorldRect(
            x: min(worldA.x, worldB.x),
            y: min(worldA.y, worldB.y),
            width: abs(worldA.x - worldB.x),
            height: abs(worldA.y - worldB.y)
        )
    }

    private func screenRect(from a: Vector2D, to b: Vector2D) -> WorldRect {
        WorldRect(x: min(a.x, b.x), y: min(a.y, b.y), width: abs(a.x - b.x), height: abs(a.y - b.y))
    }

    // MARK: - Wheel

    public func wheel(_ event: WheelEvent) {
        // The wheel always drives the camera — over widget content, inputs,
        // textareas, everywhere — the same convention as Figma/Miro/design
        // tools generally: a canvas full of cards is not a scrollable page.
        let scale = event.lineMode ? GestureTuning.wheelLinePx : 1
        let delta = Vector2D(x: event.delta.x * scale, y: event.delta.y * scale)
        if event.ctrlOrCmd {
            // Trackpad pinch arrives as ctrlKey+wheel; mouse users hold Ctrl/Cmd.
            let factor = exp(-delta.y * GestureTuning.wheelZoomFactor)
            camera.zoomAtPoint(camera.frame.zoom * factor, focal: event.point)
        } else {
            camera.panBy(Vector2D(x: -delta.x, y: -delta.y))
        }
    }

    // MARK: - Pointer

    public func pointer(_ event: PointerEvent) {
        switch event.phase {
        case .down: pointerDown(event)
        case .move: pointerMove(event)
        case .up, .cancel: pointerEnd(event)
        }
    }

    private func pointerDown(_ event: PointerEvent) {
        camera.interrupt()

        if event.kind == .touch {
            setTouch(event.id, event.point)
            if touches.count == 2 {
                cancelLongPress()
                panSamples = []
                if let pair = touchPair() {
                    let frame = camera.frame
                    pinchStart = (pair.distance, pair.midpoint, frame.zoom, frame.pan)
                    activeGesture = .pinch
                    setIsPanning(true)
                    updateCursor()
                }
                return
            }
            if event.isEmptyCanvas && interactionMode == .navigate {
                longPressStart = event.point
                longPressTimer = timeouts.schedule(afterMilliseconds: GestureTuning.longPressMs) { [weak self] in
                    guard let self, let start = self.longPressStart, self.touches.count == 1 else { return }
                    self.delegate?.gestureLongPress(at: start)
                    self.activeGesture = nil
                    self.activePointerId = nil
                    self.setIsPanning(false)
                    self.cancelLongPress()
                    self.updateCursor()
                }
            }
        }

        if activePointerId != nil { return }
        let intent = CanvasGesturePolicy.resolveIntent(
            button: event.button,
            interactionMode: interactionMode,
            isEmptyCanvas: event.isEmptyCanvas,
            isSpaceHeld: isSpaceHeld,
            isZHeld: isZHeld,
            isShiftHeld: event.modifiers.contains(.shift)
        )

        if intent == .select || intent == .zoomRegion {
            delegate?.gestureWillBeginPress()
            activePointerId = event.id
            activeGesture = intent == .select ? .select : .zoomRegion
            last = event.point
            gestureStart = event.point
            latestPoint = event.point
            hasPassedThreshold = false
            marqueeMode = marqueeModeFor(shift: event.modifiers.contains(.shift), alt: event.modifiers.contains(.alt))
            updateCursor()
            return
        }

        if intent != .pan { return }
        delegate?.gestureWillBeginPress()
        activePointerId = event.id
        activeGesture = .pan
        last = event.point
        setIsPanning(true)
        panSamples = [TimedPoint(x: event.point.x, y: event.point.y, time: event.timestamp)]
        updateCursor()
    }

    private func pointerMove(_ event: PointerEvent) {
        if event.kind == .touch, touches.contains(where: { $0.id == event.id }) {
            setTouch(event.id, event.point)
            if let start = longPressStart {
                let dx = event.point.x - start.x
                let dy = event.point.y - start.y
                if (dx * dx + dy * dy).squareRoot() > GestureTuning.longPressSlopPx { cancelLongPress() }
            }
            if activeGesture == .pinch, let pinch = pinchStart {
                guard let pair = touchPair() else { return }
                // Clamp BEFORE deriving the pan, the way zoomAtPoint does.
                // commit() clamps the zoom but keeps the pan it is handed, so
                // anchoring against the raw ratio slides the board out from
                // under the fingers by world * (raw - clamped) once the
                // gesture passes a zoom limit.
                let nextZoom = CanvasGeometry.clampZoom(pinch.zoom * (pair.distance / pinch.distance))
                let worldAtStart = Vector2D(
                    x: (pinch.midpoint.x - pinch.pan.x) / pinch.zoom,
                    y: (pinch.midpoint.y - pinch.pan.y) / pinch.zoom
                )
                camera.setView(
                    Vector2D(
                        x: pair.midpoint.x - worldAtStart.x * nextZoom,
                        y: pair.midpoint.y - worldAtStart.y * nextZoom
                    ),
                    nextZoom
                )
                return
            }
        }
        if event.id != activePointerId {
            if activeGesture == nil, event.kind != .touch { delegate?.gestureHover(at: event.point) }
            return
        }

        if activeGesture == .select || activeGesture == .zoomRegion {
            latestPoint = event.point
            guard let start = gestureStart else { return }
            if !hasPassedThreshold {
                if !CanvasGesturePolicy.pressMoved(from: last, to: event.point) { return }
                hasPassedThreshold = true
                delegate?.gestureMarqueeStarted(kind: activeGesture == .select ? .select : .zoomRegion, mode: marqueeMode)
            }
            let world = worldRect(from: start, to: event.point)
            var count = 0
            if activeGesture == .select, let hitTest = marqueeHitTest {
                count = hitTest(world).count
            }
            delegate?.gestureMarqueeUpdated(screenRect: screenRect(from: start, to: event.point), worldRect: world, boxedCount: count)
            return
        }

        if activeGesture != .pan { return }
        camera.panBy(Vector2D(x: event.point.x - last.x, y: event.point.y - last.y))
        last = event.point
        panSamples.append(TimedPoint(x: event.point.x, y: event.point.y, time: event.timestamp))
        trimSamples(&panSamples, now: event.timestamp)
    }

    private func pointerEnd(_ event: PointerEvent) {
        let flingCandidate = event.phase == .up && activeGesture == .pan && touches.count <= 1
        if flingCandidate {
            // A finger can stop before it lifts without another move event —
            // record the release so a pause reads as zero recent velocity.
            panSamples.append(TimedPoint(x: event.point.x, y: event.point.y, time: event.timestamp))
        }

        if event.kind == .touch {
            touches.removeAll { $0.id == event.id }
            cancelLongPress()
            if activeGesture == .pinch {
                pinchStart = nil
                if let remaining = touches.first {
                    // Lifting one of two fingers continues as a pan from the
                    // finger still down, with a fresh sample trail.
                    activeGesture = .pan
                    activePointerId = remaining.id
                    last = remaining.point
                    panSamples = [TimedPoint(x: last.x, y: last.y, time: event.timestamp)]
                    updateCursor()
                    return
                }
                activeGesture = nil
                activePointerId = nil
                setIsPanning(false)
                updateCursor()
                return
            }
        }

        if event.id != activePointerId { return }

        if activeGesture == .select, let start = gestureStart, let latest = latestPoint, hasPassedThreshold {
            let selectionRect = worldRect(from: start, to: latest)
            let boxed = marqueeHitTest?(selectionRect) ?? []
            delegate?.gestureMarqueeFinished(worldRect: selectionRect, boxedIds: boxed, mode: marqueeMode)
        } else if activeGesture == .zoomRegion, let start = gestureStart, let latest = latestPoint, hasPassedThreshold {
            let region = worldRect(from: start, to: latest)
            camera.fitRect(region, padding: GestureTuning.zoomRegionPadding)
            delegate?.gestureZoomRegionFinished(worldRect: region)
        } else if activeGesture == .select || activeGesture == .zoomRegion, hasPassedThreshold {
            delegate?.gestureMarqueeCancelled()
        }

        let shouldFling = flingCandidate && event.kind == .touch
        activePointerId = nil
        activeGesture = nil
        gestureStart = nil
        latestPoint = nil
        hasPassedThreshold = false
        touches.removeAll()
        pinchStart = nil
        cancelLongPress()
        setIsPanning(false)
        if shouldFling { camera.glide(flingVelocity(panSamples)) }
        panSamples = []
        updateCursor()
    }

    // MARK: - Keys and focus

    public func keyDown(_ key: GestureKey, repeat isRepeat: Bool = false) {
        switch key {
        case .space:
            if isRepeat { return }
            isSpaceHeld = true
        case .z:
            isZHeld = true
        }
        updateCursor()
    }

    public func keyUp(_ key: GestureKey) {
        switch key {
        case .space: isSpaceHeld = false
        case .z: isZHeld = false
        }
        updateCursor()
    }

    public func windowBlur() {
        isSpaceHeld = false
        isZHeld = false
        updateCursor()
    }

    /// Drops every in-flight gesture (view teardown).
    public func reset() {
        activePointerId = nil
        activeGesture = nil
        gestureStart = nil
        latestPoint = nil
        hasPassedThreshold = false
        touches.removeAll()
        pinchStart = nil
        panSamples = []
        cancelLongPress()
        setIsPanning(false)
        updateCursor()
    }
}
