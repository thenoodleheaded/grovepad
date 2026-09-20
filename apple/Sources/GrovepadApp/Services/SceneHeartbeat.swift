import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// The circuit driver's heartbeat on a real clock: a repeating `Timer` on the
// main run loop, and the scene phase as the visibility signal (the web's
// `visibilitychange`). The app calls `setVisible` from `scenePhase`; the
// driver re-seeds time-sensitive fields when the app comes back.
// ---------------------------------------------------------------------------

public final class SceneHeartbeat: HeartbeatScheduler {
    public private(set) var isVisible = true
    private var observers: [Int: () -> Void] = [:]
    private var nextObserver = 1

    public init() {}

    public func schedule(every interval: TimeInterval, _ tick: @escaping () -> Void) -> () -> Void {
        let timer = Timer(timeInterval: interval, repeats: true) { _ in tick() }
        RunLoop.main.add(timer, forMode: .common)
        return { timer.invalidate() }
    }

    public func observeVisibility(_ handler: @escaping () -> Void) -> () -> Void {
        let id = nextObserver
        nextObserver += 1
        observers[id] = handler
        return { [weak self] in self?.observers[id] = nil }
    }

    /// The scene became active (true) or left the foreground (false).
    public func setVisible(_ visible: Bool) {
        guard visible != isVisible else { return }
        isVisible = visible
        for handler in observers.values { handler() }
    }
}
