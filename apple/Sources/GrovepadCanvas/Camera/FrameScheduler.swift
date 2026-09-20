import Foundation

// ---------------------------------------------------------------------------
// Time is injected (apple/AGENTS.md law 6). The camera engine tweens and
// glides on a frame clock; the gesture engine arms a long-press timeout.
// Both come through these protocols so tests step frames deterministically
// and the platforms plug in CADisplayLink and Dispatch.
// ---------------------------------------------------------------------------

/// One per-frame callback. Receives the frame time in milliseconds and
/// returns `true` to keep running on the next frame — the same shape as a
/// `requestAnimationFrame` step that re-requests itself.
public typealias FrameStep = (_ now: Double) -> Bool

/// A `requestAnimationFrame` equivalent: schedule a step, cancel it by id.
public protocol FrameScheduler: AnyObject {
    /// Current time in milliseconds on the same clock the steps receive.
    var now: Double { get }
    /// Starts calling `step` once per frame until it returns `false` or is
    /// cancelled. Returns a non-zero id.
    func schedule(_ step: @escaping FrameStep) -> Int
    func cancel(_ id: Int)
}

/// A `setTimeout` equivalent for one-shot delays (the long-press timer).
public protocol TimeoutScheduler: AnyObject {
    /// Returns a non-zero id.
    func schedule(afterMilliseconds delay: Double, _ action: @escaping () -> Void) -> Int
    func cancelTimeout(_ id: Int)
}

/// A hand-cranked clock for tests: `advance(by:)` runs every pending frame
/// step once per `frameMs` and fires every timeout that has come due, in
/// time order. Lives in the module so every test target can use it.
public final class ManualScheduler: FrameScheduler, TimeoutScheduler {
    public private(set) var now: Double
    public var frameMs: Double

    private var nextId = 1
    private var steps: [(id: Int, step: FrameStep)] = []
    private var timeouts: [(id: Int, due: Double, action: () -> Void)] = []

    public init(now: Double = 0, frameMs: Double = 16) {
        self.now = now
        self.frameMs = frameMs
    }

    public var pendingStepCount: Int { steps.count }
    public var pendingTimeoutCount: Int { timeouts.count }

    public func schedule(_ step: @escaping FrameStep) -> Int {
        let id = nextId
        nextId += 1
        steps.append((id, step))
        return id
    }

    public func cancel(_ id: Int) {
        steps.removeAll { $0.id == id }
    }

    public func schedule(afterMilliseconds delay: Double, _ action: @escaping () -> Void) -> Int {
        let id = nextId
        nextId += 1
        timeouts.append((id, now + delay, action))
        return id
    }

    public func cancelTimeout(_ id: Int) {
        timeouts.removeAll { $0.id == id }
    }

    /// Runs one frame: the clock moves forward by `frameMs`, due timeouts
    /// fire, then every pending step runs once with the new time.
    public func tick() {
        advance(by: frameMs)
    }

    /// Moves the clock by `milliseconds`, running frames every `frameMs` on
    /// the way so a tween sees the same cadence a display link would give it.
    public func advance(by milliseconds: Double) {
        let target = now + milliseconds
        while now < target {
            now = min(target, now + frameMs)
            fireDueTimeouts()
            runFrame()
        }
    }

    private func fireDueTimeouts() {
        let due = timeouts.filter { $0.due <= now }.sorted { $0.due < $1.due }
        guard !due.isEmpty else { return }
        timeouts.removeAll { entry in due.contains { $0.id == entry.id } }
        for entry in due { entry.action() }
    }

    private func runFrame() {
        // Steps scheduled while running belong to the next frame, as with
        // requestAnimationFrame.
        let current = steps
        for entry in current {
            guard steps.contains(where: { $0.id == entry.id }) else { continue }
            let keep = entry.step(now)
            if !keep { steps.removeAll { $0.id == entry.id } }
        }
    }
}

/// Dispatch-backed timeouts for the platforms.
public final class DispatchTimeoutScheduler: TimeoutScheduler {
    private var nextId = 1
    private var live: Set<Int> = []
    private let queue: DispatchQueue

    public init(queue: DispatchQueue = .main) {
        self.queue = queue
    }

    public func schedule(afterMilliseconds delay: Double, _ action: @escaping () -> Void) -> Int {
        let id = nextId
        nextId += 1
        live.insert(id)
        // `setTimeout` converts its delay to a long: it TRUNCATES toward
        // zero and clamps a negative to 0. `.rounded()` did neither.
        queue.asyncAfter(deadline: .now() + .milliseconds(Int(max(0, delay.isFinite ? delay : 0)))) { [weak self] in
            guard let self, self.live.remove(id) != nil else { return }
            action()
        }
        return id
    }

    public func cancelTimeout(_ id: Int) {
        live.remove(id)
    }
}

#if canImport(QuartzCore)
import QuartzCore
#if canImport(AppKit)
import AppKit
#elseif canImport(UIKit)
import UIKit
#endif

/// A `CADisplayLink`-driven scheduler for both platforms. Steps run on the
/// main run loop at the display's cadence; the link pauses itself whenever
/// nothing is scheduled so an idle canvas costs no wakeups.
public final class DisplayLinkScheduler: FrameScheduler {
    private var link: CADisplayLink?
    private var nextId = 1
    private var steps: [(id: Int, step: FrameStep)] = []
    private let makeLink: (DisplayLinkScheduler) -> CADisplayLink?

    public var now: Double { CACurrentMediaTime() * 1000 }

    #if canImport(AppKit)
    /// macOS 14+: display links are minted by the screen or view they track.
    public init(screen: NSScreen? = NSScreen.main) {
        makeLink = { owner in
            screen?.displayLink(target: owner, selector: #selector(DisplayLinkScheduler.frame(_:)))
        }
    }

    public init(view: NSView) {
        makeLink = { owner in
            view.displayLink(target: owner, selector: #selector(DisplayLinkScheduler.frame(_:)))
        }
    }
    #else
    public init() {
        makeLink = { owner in
            CADisplayLink(target: owner, selector: #selector(DisplayLinkScheduler.frame(_:)))
        }
    }
    #endif

    deinit {
        link?.invalidate()
    }

    public func schedule(_ step: @escaping FrameStep) -> Int {
        let id = nextId
        nextId += 1
        steps.append((id, step))
        ensureRunning()
        return id
    }

    public func cancel(_ id: Int) {
        steps.removeAll { $0.id == id }
        if steps.isEmpty { link?.isPaused = true }
    }

    private func ensureRunning() {
        if link == nil {
            link = makeLink(self)
            // Ask for the panel's full rate: ProMotion runs camera motion at
            // 120 Hz only when the link says it wants it.
            link?.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
            link?.add(to: .main, forMode: .common)
        }
        link?.isPaused = false
    }

    @objc private func frame(_ sender: CADisplayLink) {
        let now = sender.targetTimestamp * 1000
        let current = steps
        for entry in current {
            guard steps.contains(where: { $0.id == entry.id }) else { continue }
            if !entry.step(now) { steps.removeAll { $0.id == entry.id } }
        }
        if steps.isEmpty { sender.isPaused = true }
    }
}
#endif
