import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Camera engine core (`engine/camera/cameraEngine.ts`, canvas engine
// contract §1).
//
// During a gesture frame this object writes the camera transform. Camera
// state lives here, outside any view hierarchy; the world layer's transform
// sink is called the instant a frame commits, and everything else (the
// store mirror, the minimap, residency) observes through listeners.
//
// One difference from the TypeScript: the web module is a singleton; here it
// is a class so a window, a test, or a preview can own its own camera.
// ---------------------------------------------------------------------------

public struct CameraFrame: Equatable, Sendable {
    public var pan: Vector2D
    public var zoom: Double

    public init(pan: Vector2D, zoom: Double) {
        self.pan = pan
        self.zoom = zoom
    }

    public static let identity = CameraFrame(pan: .zero, zoom: 1)

    public var transform: CanvasTransform { CanvasTransform(x: pan.x, y: pan.y, zoom: zoom) }
}

public enum CameraMotion {
    /// Kinetic glide: speed halves roughly every 150ms; stops below 12 px/s.
    public static let glideDecayMs = 220.0
    public static let glideStopSpeed = 12.0
    /// A single frame never integrates more than this — a stalled tab or a
    /// paused display link must not fling the board across the room.
    public static let glideMaxFrameMs = 64.0
    /// Camera history keeps this many earlier views.
    public static let historyLimit = 30
    public static let defaultTweenMs = 300.0
    public static let historyTweenMs = 220.0

    public static func easeOutQuint(_ t: Double) -> Double {
        let inv = 1 - t
        return 1 - inv * inv * inv * inv * inv
    }
}

public final class CameraEngine {
    public private(set) var frame: CameraFrame = .identity
    public private(set) var viewportSize = Size(width: 1280, height: 720)

    /// Mirrors `prefers-reduced-motion`: tweens jump, glides do nothing.
    public var reducedMotion = false

    /// The world layer. Called first on every commit, before any listener.
    public var worldTransformSink: ((CameraFrame) -> Void)?
    /// Back/forward availability, for the chrome's navigation buttons.
    public var historySink: ((_ canGoBack: Bool, _ canGoForward: Bool) -> Void)?

    private var frameListeners: [(id: Int, listener: (CameraFrame) -> Void)] = []
    private var nextListenerId = 1

    private let scheduler: FrameScheduler
    private var animationId = 0
    private var glideId = 0

    private var backStack: [CameraFrame] = []
    private var forwardStack: [CameraFrame] = []
    private var applyingHistory = false

    public init(scheduler: FrameScheduler) {
        self.scheduler = scheduler
    }

    public var canGoBack: Bool { !backStack.isEmpty }
    public var canGoForward: Bool { !forwardStack.isEmpty }

    /// Subscribe to committed frames. Returns the unsubscribe closure.
    @discardableResult
    public func onFrame(_ listener: @escaping (CameraFrame) -> Void) -> () -> Void {
        let id = nextListenerId
        nextListenerId += 1
        frameListeners.append((id, listener))
        return { [weak self] in
            self?.frameListeners.removeAll { $0.id == id }
        }
    }

    // MARK: - Commit

    private func commit(_ pan: Vector2D, _ zoom: Double) {
        let clamped = CanvasGeometry.clampZoom(zoom)
        if frame.pan.x == pan.x && frame.pan.y == pan.y && frame.zoom == clamped { return }
        frame = CameraFrame(pan: pan, zoom: clamped)
        worldTransformSink?(frame)
        for entry in frameListeners { entry.listener(frame) }
    }

    private func stopAnimation() {
        if animationId != 0 {
            scheduler.cancel(animationId)
            animationId = 0
        }
    }

    private func stopGlide() {
        if glideId != 0 {
            scheduler.cancel(glideId)
            glideId = 0
        }
    }

    private func pushHistoryEntry() {
        if applyingHistory { return }
        let last = backStack.last
        if last == nil || last != frame {
            backStack.append(frame)
            if backStack.count > CameraMotion.historyLimit { backStack.removeFirst() }
        }
        forwardStack.removeAll()
        historySink?(!backStack.isEmpty, false)
    }

    // MARK: - Public actions

    /// Interrupt any tween/glide — every direct gesture write starts here.
    public func interrupt() {
        stopAnimation()
        stopGlide()
    }

    public var isAnimating: Bool { animationId != 0 }
    public var isGliding: Bool { glideId != 0 }

    public func setViewportSize(_ size: Size) {
        // A hidden or not-yet-laid-out host measures 0×0; keep the last known
        // real size instead of collapsing every viewport-derived rect to nothing.
        if size.width < 1 || size.height < 1 { return }
        viewportSize = size
    }

    public func setView(_ pan: Vector2D, _ zoom: Double) {
        interrupt()
        commit(pan, zoom)
    }

    public func panBy(_ delta: Vector2D) {
        interrupt()
        if delta.x == 0 && delta.y == 0 { return }
        commit(Vector2D(x: frame.pan.x + delta.x, y: frame.pan.y + delta.y), frame.zoom)
    }

    /// Zoom keeping the world point under `focal` (viewport px) stationary.
    /// The anchor is derived from the CLAMPED zoom: commit() keeps the pan it
    /// is handed, so anchoring against a raw ratio past a limit would slide
    /// the board out from under the pointer.
    public func zoomAtPoint(_ zoom: Double, focal: Vector2D) {
        interrupt()
        let next = CanvasGeometry.clampZoom(zoom)
        if next == frame.zoom { return }
        let scale = next / frame.zoom
        commit(
            Vector2D(
                x: focal.x - (focal.x - frame.pan.x) * scale,
                y: focal.y - (focal.y - frame.pan.y) * scale
            ),
            next
        )
    }

    public func animateTo(_ targetPan: Vector2D, _ targetZoom: Double, duration: Double = CameraMotion.defaultTweenMs) {
        interrupt()
        let endZoom = CanvasGeometry.clampZoom(targetZoom)
        if frame.pan.x == targetPan.x && frame.pan.y == targetPan.y && frame.zoom == endZoom { return }
        pushHistoryEntry()
        if reducedMotion || duration <= 0 {
            commit(targetPan, endZoom)
            return
        }
        let startPan = frame.pan
        // Zoom interpolates in log space so a 4× change feels even over time
        // rather than rushing the small end and crawling the large end.
        let startLogZoom = log(frame.zoom)
        let logZoomSpan = log(endZoom) - startLogZoom
        let startTime = scheduler.now
        animationId = scheduler.schedule { [weak self] now in
            guard let self else { return false }
            let t = min(1, (now - startTime) / duration)
            let eased = CameraMotion.easeOutQuint(t)
            self.commit(
                Vector2D(
                    x: startPan.x + (targetPan.x - startPan.x) * eased,
                    y: startPan.y + (targetPan.y - startPan.y) * eased
                ),
                exp(startLogZoom + logZoomSpan * eased)
            )
            if t < 1 { return true }
            self.animationId = 0
            return false
        }
    }

    /// Kinetic glide from a release velocity (screen px/s), decaying
    /// exponentially. Any direct write interrupts it.
    public func glide(_ velocity: Vector2D) {
        interrupt()
        if reducedMotion { return }
        var vx = velocity.x
        var vy = velocity.y
        if (vx * vx + vy * vy).squareRoot() < CameraMotion.glideStopSpeed * 4 { return }
        var last = scheduler.now
        glideId = scheduler.schedule { [weak self] now in
            guard let self else { return false }
            let dt = min(CameraMotion.glideMaxFrameMs, now - last)
            last = now
            let decay = exp(-dt / CameraMotion.glideDecayMs)
            vx *= decay
            vy *= decay
            if (vx * vx + vy * vy).squareRoot() < CameraMotion.glideStopSpeed {
                self.glideId = 0
                return false
            }
            self.commit(
                Vector2D(x: self.frame.pan.x + (vx * dt) / 1000, y: self.frame.pan.y + (vy * dt) / 1000),
                self.frame.zoom
            )
            return true
        }
    }

    public func goBack() {
        guard let previous = backStack.popLast() else { return }
        forwardStack.append(frame)
        applyingHistory = true
        animateTo(previous.pan, previous.zoom, duration: CameraMotion.historyTweenMs)
        applyingHistory = false
        historySink?(!backStack.isEmpty, true)
    }

    public func goForward() {
        guard let next = forwardStack.popLast() else { return }
        backStack.append(frame)
        applyingHistory = true
        animateTo(next.pan, next.zoom, duration: CameraMotion.historyTweenMs)
        applyingHistory = false
        historySink?(true, !forwardStack.isEmpty)
    }

    // MARK: - Test seams

    /// Depth of the back stack (for the history cap test).
    public var historyDepth: Int { backStack.count }
}
