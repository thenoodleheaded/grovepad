import Foundation

// ---------------------------------------------------------------------------
// Engine driver (`initCircuitEngine` in `engine/circuitEngine.ts`) — turns
// board changes into waves. All cascading happens inside one flattened loop:
// the engine's own batched commit re-notifies the host subscription, the
// re-entry guard bounces it, and the loop picks the new state up on its next
// pass. No recursion, no timers. Nothing starts at module scope; `start()`
// returns a disposer.
// ---------------------------------------------------------------------------

/// The board as the driver sees it. The web compares object identity to
/// detect change cheaply; Swift records are values, so the host bumps a
/// version whenever it replaces the widgets or connections map (any edit,
/// load or undo) and the driver compares the records that matter by value.
public struct CircuitSnapshot {
    public var widgets: OrderedMap<Widget>
    public var connections: OrderedMap<Connection>
    /// Bumped whenever `widgets` is replaced (`state.widgets !== prevWidgets`).
    public var widgetsVersion: UInt64
    /// Bumped whenever `connections` is replaced.
    public var connectionsVersion: UInt64

    public init(widgets: OrderedMap<Widget>, connections: OrderedMap<Connection>, widgetsVersion: UInt64, connectionsVersion: UInt64) {
        self.widgets = widgets
        self.connections = connections
        self.widgetsVersion = widgetsVersion
        self.connectionsVersion = connectionsVersion
    }
}

/// What the driver needs from the board store and the circuit UI store.
/// Engine writes reach the board through `applyWireWrites` only (law 3: one
/// batched commit, no undo entry).
public protocol CircuitHost: AnyObject {
    var snapshot: CircuitSnapshot { get }
    /// Wires silenced by the loop breaker (`useCircuitStore.dampedIds`).
    var dampedIds: Set<String> { get }
    /// Called after every board commit, including the driver's own; returns an unsubscribe.
    func subscribe(_ listener: @escaping () -> Void) -> () -> Void
    func applyWireWrites(_ writes: OrderedMap<JSONObject>)
    func dampConnections(_ ids: [String])
    func clearDamped()
    func recordFires(_ ids: [String], at ms: Double)
    func notifyLoopDamped(_ message: String)
    /// A trigger asked an automation-core widget to execute (async, host-owned).
    func executeAutomation(widgetId: String)
}

/// The heartbeat and visibility source (`setInterval` + `visibilitychange`),
/// injectable so tests drive time by hand.
public protocol HeartbeatScheduler: AnyObject {
    /// `document.visibilityState === 'visible'`.
    var isVisible: Bool { get }
    /// Repeats `tick` every `interval` seconds until the returned cancel runs.
    func schedule(every interval: TimeInterval, _ tick: @escaping () -> Void) -> () -> Void
    /// Calls `handler` whenever visibility changes until the returned cancel runs.
    func observeVisibility(_ handler: @escaping () -> Void) -> () -> Void
}

public final class CircuitDriver {
    /// Consecutive engine-fed waves allowed before the loop breaker trips.
    public static let burstLimit = 24
    /// Minute-class heartbeat for time-sensitive source fields.
    public static let heartbeatInterval: TimeInterval = 30
    public static let dampedMessage = "Circuit loop damped — a wire cycle was oscillating. Edit any wire to resume."
    /// Minimum gap between two damping toasts, in ms.
    public static let dampToastGapMs: Double = 4000

    private let host: CircuitHost
    private let scheduler: HeartbeatScheduler
    private let clock: Clock
    private let minter: IdMinter

    private var prevWidgets = OrderedMap<Widget>()
    private var prevConnections = OrderedMap<Connection>()
    private var prevWidgetsVersion: UInt64 = 0
    private var prevConnectionsVersion: UInt64 = 0
    private var index = ConnectionIndex()
    private var lastDelivered = DeliveryMemory()
    private var forcedSeeds: [String] = []
    private var lastFiredIds: [String] = []
    private var processing = false
    private var dampToastAt: Double = 0
    private var cleanup: (() -> Void)?
    private var activeDispose: (() -> Void)?
    /// Telemetry: the seeds of the most recent non-baseline wave.
    public internal(set) var lastWaveSeeds: [String] = []

    public init(host: CircuitHost, scheduler: HeartbeatScheduler, clock: Clock = .system, minter: IdMinter = .system) {
        self.host = host
        self.scheduler = scheduler
        self.clock = clock
        self.minter = minter
    }

    /// Whether `start()` has run and its disposer has not.
    public var isRunning: Bool { activeDispose != nil }

    /// Baseline the loaded board without firing, subscribe, and start the
    /// heartbeat. Calling it again while running returns the same disposer.
    @discardableResult
    public func start() -> () -> Void {
        if let activeDispose { return activeDispose }
        var disposed = false
        let dispose: () -> Void = { [weak self] in
            guard let self, !disposed else { return }
            disposed = true
            self.cleanup?()
            self.cleanup = nil
            self.activeDispose = nil
        }
        activeDispose = dispose

        let state = host.snapshot
        prevWidgets = state.widgets
        prevConnections = state.connections
        prevWidgetsVersion = state.widgetsVersion
        prevConnectionsVersion = state.connectionsVersion
        index = buildConnectionIndex(prevConnections)
        lastDelivered = DeliveryMemory()
        forcedSeeds = []
        lastFiredIds = []

        // Startup: baseline delivery memory to the loaded board without firing —
        // a reload must never replay triggers or clobber current values.
        _ = runWave(
            WaveInput(widgets: prevWidgets, index: index, seeds: index.sourceIds, dampedIds: [], baselineOnly: true, minter: minter),
            memory: &lastDelivered
        )

        let unsubscribe = host.subscribe { [weak self] in self?.process() }
        process()

        // Zero wires with time-sensitive sources → the tick exits immediately.
        let cancelHeartbeat = scheduler.schedule(every: CircuitDriver.heartbeatInterval) { [weak self] in
            guard let self, self.scheduler.isVisible else { return }
            let state = self.host.snapshot
            let sources = timeSensitiveSourceIds(connections: state.connections, widgets: state.widgets)
            if sources.isEmpty { return }
            self.addForcedSeeds(sources)
            self.process()
        }
        let cancelVisibility = scheduler.observeVisibility { [weak self] in
            guard let self, self.scheduler.isVisible else { return }
            let state = self.host.snapshot
            self.addForcedSeeds(timeSensitiveSourceIds(connections: state.connections, widgets: state.widgets))
            self.process()
        }
        cleanup = {
            unsubscribe()
            cancelHeartbeat()
            cancelVisibility()
        }
        return dispose
    }

    private func addForcedSeeds(_ ids: [String]) {
        for id in ids where !forcedSeeds.contains(id) { forcedSeeds.append(id) }
    }

    /// One pass of the flattened loop. Re-entrant calls (the host notifying
    /// the driver of the driver's own commit) bounce off the guard.
    public func process() {
        guard activeDispose != nil, !processing else { return }
        processing = true
        defer { processing = false }
        var iteration = 0
        while true {
            defer { iteration += 1 }
            let state = host.snapshot
            let connectionsChanged = state.connectionsVersion != prevConnectionsVersion
            let widgetsChanged = state.widgetsVersion != prevWidgetsVersion
            if !connectionsChanged, !widgetsChanged, forcedSeeds.isEmpty { return }

            var seeds = forcedSeeds
            forcedSeeds = []

            if connectionsChanged {
                // Editing the circuit lifts any damping — the user is fixing it.
                host.clearDamped()
                for id in lastDelivered.keys where !state.connections.contains(id) {
                    lastDelivered.removeValue(forKey: id)
                }
                // Widgets AND connections replaced together = board load / undo:
                // baseline silently. Connections alone = the user drew or edited
                // a wire: reset its memory so it delivers its current value now.
                // The web tells "same wire" from "replaced wire" by object
                // identity, and a load hands it new objects for every wire;
                // records here are values, so a load is recognised by both
                // maps changing at once and then every wire is baselined.
                var baselineSeeds: [String] = []
                for (id, connection) in state.connections.entries {
                    if !widgetsChanged, connection == prevConnections[id] { continue }
                    lastDelivered.removeValue(forKey: id)
                    if widgetsChanged { baselineSeeds.append(connection.fromId) }
                    else if !seeds.contains(connection.fromId) { seeds.append(connection.fromId) }
                }
                index = buildConnectionIndex(state.connections)
                prevConnections = state.connections
                prevConnectionsVersion = state.connectionsVersion
                if !baselineSeeds.isEmpty {
                    _ = runWave(
                        WaveInput(widgets: state.widgets, index: index, seeds: baselineSeeds, dampedIds: host.dampedIds, baselineOnly: true, minter: minter),
                        memory: &lastDelivered
                    )
                }
            }

            if widgetsChanged {
                for sourceId in index.sourceIds where state.widgets[sourceId]?.data != prevWidgets[sourceId]?.data {
                    if !seeds.contains(sourceId) { seeds.append(sourceId) }
                }
                prevWidgets = state.widgets
                prevWidgetsVersion = state.widgetsVersion
            }

            if seeds.isEmpty { return }

            // Loop breaker: a cascade that is still writing after burstLimit
            // waves is oscillating — silence the wires that fired last.
            if iteration >= CircuitDriver.burstLimit {
                host.dampConnections(lastFiredIds)
                let now = clock.nowMs()
                if now - dampToastAt > CircuitDriver.dampToastGapMs {
                    dampToastAt = now
                    host.notifyLoopDamped(CircuitDriver.dampedMessage)
                }
                return
            }

            lastWaveSeeds = seeds
            let wave = runWave(
                WaveInput(widgets: state.widgets, index: index, seeds: seeds, dampedIds: host.dampedIds, baselineOnly: false, minter: minter),
                memory: &lastDelivered
            )
            if !wave.firedIds.isEmpty {
                lastFiredIds = wave.firedIds
                host.recordFires(wave.firedIds, at: clock.nowMs())
            }
            for widgetId in wave.executeRequests { host.executeAutomation(widgetId: widgetId) }
            if wave.writes.isEmpty {
                // Nothing written — the loop only continues if something else changed.
                continue
            }
            // Commit re-notifies the subscription; the guard bounces it and the
            // next loop pass sees the fresh state.
            host.applyWireWrites(wave.writes)
        }
    }
}

extension CircuitDriver {
    /// Clears the seed telemetry so a test can tell "no wave ran" from "the
    /// last wave had these seeds".
    public func lastWaveSeedsReset() { lastWaveSeeds = [] }

    /// The heartbeat's forced-seed path, callable by a host: re-read these
    /// source widgets now and deliver whatever changed. Delivery memory is
    /// kept, so a wire whose transformed value is unchanged stays silent
    /// (law 2); this is exactly what the 30 s tick does for time-sensitive
    /// sources. Ignored while the driver is not running.
    public func reseed(_ ids: [String]) {
        guard activeDispose != nil else { return }
        addForcedSeeds(ids)
        process()
    }
}
