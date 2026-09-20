import Foundation

// ---------------------------------------------------------------------------
// The clock a field getter reads.
//
// `FieldDescriptor.get` has no clock parameter, exactly as the web's getters
// call `Date.now()` inline. The date_picker getters (`days_until`, `is_due`,
// `next_occurrence`, `duration_days`) are judged by the pack, which the web
// generated under fake timers frozen at `Clock.conformance`; so the port
// needs one process-wide seam the tests can freeze the same way. Production
// never touches it: the default is the system clock.
// ---------------------------------------------------------------------------

public enum FieldClock {
    private final class Box: @unchecked Sendable {
        let lock = NSLock()
        var clock: Clock = .system
    }

    private static let box = Box()

    /// The clock every date getter reads. Tests install `.conformance`.
    public static var now: Clock {
        get { box.lock.withLock { box.clock } }
        set { box.lock.withLock { box.clock = newValue } }
    }

    /// `Date.now()` as the getters see it.
    public static func nowMs() -> Double { now.nowMs() }

    /// Back to the system clock (a test's tearDown).
    public static func reset() { now = .system }
}
