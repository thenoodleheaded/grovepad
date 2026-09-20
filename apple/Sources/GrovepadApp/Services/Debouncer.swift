import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// A trailing-edge debounce over the injectable `TimerSource` the sync engine
// already uses, so autosave (500 ms after the last commit, as the web's
// `scheduleSave`) and the device-state save can be tested by advancing a
// `ManualTimerSource` instead of sleeping. `flush` runs a pending action now.
// ---------------------------------------------------------------------------

public final class Debouncer {
    public let delayMs: Double
    private let timers: TimerSource
    private var handle: Int?
    private var pending: (() -> Void)?

    public init(delayMs: Double, timers: TimerSource) {
        self.delayMs = delayMs
        self.timers = timers
    }

    public var isPending: Bool { pending != nil }

    /// Replace whatever was waiting; the clock restarts.
    public func schedule(_ action: @escaping () -> Void) {
        cancel()
        pending = action
        handle = timers.schedule(afterMs: delayMs) { [weak self] in
            guard let self else { return }
            self.handle = nil
            let action = self.pending
            self.pending = nil
            action?()
        }
    }

    /// Run the pending action immediately (background, quit, close).
    public func flush() {
        guard let action = pending else { return }
        cancel()
        action()
    }

    public func cancel() {
        if let handle { timers.cancel(handle) }
        handle = nil
        pending = nil
    }
}
