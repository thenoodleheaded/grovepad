import Foundation
import Network

// ---------------------------------------------------------------------------
// Network reachability → `CloudSyncEngine.noteNetworkReachable()`. The web
// has no equivalent (a browser retries on the next edit or focus); the
// engine's offline back-off is a timer, and this is the second wake-up: the
// moment the path monitor says the network is back, an engine waiting
// offline retries at once instead of on its next tick.
// ---------------------------------------------------------------------------

public protocol NetworkReachability: AnyObject {
    /// Start watching; `onReachable` runs on the main queue on every
    /// transition to a satisfied path. Idempotent.
    func start(_ onReachable: @escaping () -> Void)
    func stop()
    /// The last known path state (`navigator.onLine`); true before the
    /// first report, as a browser assumes.
    var isOnline: Bool { get }
    /// Every online/offline transition, on the main queue (collaboration's
    /// `online` / `offline` events).
    func observeStatus(_ handler: @escaping (Bool) -> Void)
}

/// `NWPathMonitor` on a utility queue, delivering to main.
public final class PathMonitorReachability: NetworkReachability {
    private var monitor: NWPathMonitor?
    private let queue = DispatchQueue(label: "app.grovepad.reachability", qos: .utility)
    private var wasSatisfied = false
    private var reported = false
    private var statusHandlers: [(Bool) -> Void] = []
    public private(set) var isOnline = true

    public init() {}

    public func observeStatus(_ handler: @escaping (Bool) -> Void) {
        statusHandlers.append(handler)
    }

    public func start(_ onReachable: @escaping () -> Void) {
        guard monitor == nil else { return }
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            let satisfied = path.status == .satisfied
            DispatchQueue.main.async {
                guard let self else { return }
                let came = satisfied && !self.wasSatisfied
                let changed = !self.reported || satisfied != self.wasSatisfied
                self.wasSatisfied = satisfied
                self.reported = true
                self.isOnline = satisfied
                if came { onReachable() }
                if changed { for handler in self.statusHandlers { handler(satisfied) } }
            }
        }
        monitor.start(queue: queue)
        self.monitor = monitor
    }

    public func stop() {
        monitor?.cancel()
        monitor = nil
    }
}

/// A hand-driven monitor for tests: `reachable()` fires the callback.
public final class ManualReachability: NetworkReachability {
    private var handler: (() -> Void)?
    private var statusHandlers: [(Bool) -> Void] = []
    public private(set) var isStarted = false
    public private(set) var isOnline = true

    public init() {}

    public func observeStatus(_ handler: @escaping (Bool) -> Void) {
        statusHandlers.append(handler)
    }

    /// Report a transition (tests).
    public func setOnline(_ online: Bool) {
        isOnline = online
        for handler in statusHandlers { handler(online) }
    }

    public func start(_ onReachable: @escaping () -> Void) {
        handler = onReachable
        isStarted = true
    }

    public func stop() {
        handler = nil
        isStarted = false
    }

    public func reachable() { handler?() }
}
