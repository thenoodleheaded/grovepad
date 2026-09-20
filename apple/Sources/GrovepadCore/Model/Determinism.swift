import Foundation

// ---------------------------------------------------------------------------
// Injected sources of ids and time. The web app calls `crypto.randomUUID()`
// and `Date.now()` inline; the conformance pack was generated with both
// stubbed (ids `uuid-0001, uuid-0002, …`, clock 1789000000000 ms), so every
// port that mints or timestamps takes these instead of reaching for the
// system directly.
// ---------------------------------------------------------------------------

/// Mints record ids. The default is a lowercase RFC 4122 UUID, as
/// `crypto.randomUUID()` produces.
public struct IdMinter {
    private let mint: () -> String

    public init(_ mint: @escaping () -> String) {
        self.mint = mint
    }

    public func callAsFunction() -> String { mint() }

    public static let system = IdMinter { UUID().uuidString.lowercased() }

    /// `uuid-0001, uuid-0002, …` — the conformance pack's rule. Each call to
    /// `counting()` starts a fresh counter.
    public static func counting(prefix: String = "uuid-", width: Int = 4) -> IdMinter {
        let box = Counter()
        return IdMinter {
            box.value += 1
            let digits = String(box.value)
            return prefix + String(repeating: "0", count: max(0, width - digits.count)) + digits
        }
    }

    private final class Counter { var value = 0 }
}

/// Reads the wall clock in milliseconds since the epoch, as `Date.now()` does.
public struct Clock {
    private let read: () -> Double

    public init(_ read: @escaping () -> Double) {
        self.read = read
    }

    /// Milliseconds since 1970, integral, like `Date.now()`.
    public func nowMs() -> Double { read().rounded(.down) }

    public func now() -> Date { Date(timeIntervalSince1970: nowMs() / 1000) }

    public static let system = Clock { Date().timeIntervalSince1970 * 1000 }

    public static func fixed(ms: Double) -> Clock { Clock { ms } }

    /// The conformance pack's frozen clock.
    public static let conformance = Clock.fixed(ms: 1_789_000_000_000)
}
