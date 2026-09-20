import XCTest
@testable import GrovepadCore

/// The driver loop against a fake board host and a hand-driven heartbeat:
/// baseline on load, immediate delivery on wiring, loop damping and re-arm,
/// heartbeat seeding, and the disposer.
final class CircuitDriverTests: XCTestCase {
    // MARK: Fakes

    final class FakeHost: CircuitHost {
        var widgets = OrderedMap<Widget>()
        var connections = OrderedMap<Connection>()
        var widgetsVersion: UInt64 = 1
        var connectionsVersion: UInt64 = 1
        var dampedIds: Set<String> = []
        private var listeners: [Int: () -> Void] = [:]
        private var nextListener = 0

        var appliedWrites: [OrderedMap<JSONObject>] = []
        var fires: [(ids: [String], at: Double)] = []
        var dampCalls: [[String]] = []
        var clearDampedCalls = 0
        var notifications: [String] = []
        var executions: [String] = []
        var snapshotReads = 0

        var snapshot: CircuitSnapshot {
            snapshotReads += 1
            return CircuitSnapshot(widgets: widgets, connections: connections, widgetsVersion: widgetsVersion, connectionsVersion: connectionsVersion)
        }

        func subscribe(_ listener: @escaping () -> Void) -> () -> Void {
            let id = nextListener
            nextListener += 1
            listeners[id] = listener
            return { [weak self] in self?.listeners[id] = nil }
        }

        var listenerCount: Int { listeners.count }

        private func notify() { for listener in listeners.values { listener() } }

        /// The only path the engine may write through: one batched commit, no undo entry.
        func applyWireWrites(_ writes: OrderedMap<JSONObject>) {
            appliedWrites.append(writes)
            for (id, data) in writes.entries { widgets[id]?.data = data }
            widgetsVersion += 1
            notify()
        }

        func dampConnections(_ ids: [String]) {
            dampCalls.append(ids)
            dampedIds.formUnion(ids)
        }

        func clearDamped() {
            clearDampedCalls += 1
            dampedIds = []
        }

        func recordFires(_ ids: [String], at ms: Double) { fires.append((ids, ms)) }
        func notifyLoopDamped(_ message: String) { notifications.append(message) }
        func executeAutomation(widgetId: String) { executions.append(widgetId) }

        // User-side edits, as the widget store slices would commit them.
        func editWidget(_ id: String, _ data: JSONObject) {
            widgets[id]?.data = data
            widgetsVersion += 1
            notify()
        }

        func setConnections(_ next: OrderedMap<Connection>) {
            connections = next
            connectionsVersion += 1
            notify()
        }

        func loadBoard(widgets next: OrderedMap<Widget>, connections nextConnections: OrderedMap<Connection>) {
            widgets = next
            connections = nextConnections
            widgetsVersion += 1
            connectionsVersion += 1
            notify()
        }
    }

    final class FakeScheduler: HeartbeatScheduler {
        var isVisible = true
        var interval: TimeInterval?
        var tick: (() -> Void)?
        var visibilityHandler: (() -> Void)?
        var heartbeatCancelled = false
        var visibilityCancelled = false

        func schedule(every interval: TimeInterval, _ tick: @escaping () -> Void) -> () -> Void {
            self.interval = interval
            self.tick = tick
            return { [weak self] in self?.heartbeatCancelled = true; self?.tick = nil }
        }

        func observeVisibility(_ handler: @escaping () -> Void) -> () -> Void {
            visibilityHandler = handler
            return { [weak self] in self?.visibilityCancelled = true; self?.visibilityHandler = nil }
        }

        func fireTick() { tick?() }

        func setVisible(_ visible: Bool) {
            isVisible = visible
            visibilityHandler?()
        }
    }

    // MARK: Fixtures

    private func widget(_ id: String, _ type: String, _ data: JSONObject) -> Widget {
        Widget(id: id, type: type, title: id, canvasId: "canvas", position: .zero, size: Size(width: 280, height: 200), data: data)
    }

    private func counter(_ count: Double) -> JSONObject { ["label": "Tally", "count": .number(count), "step": 1] }
    private func goal(_ percent: Double) -> JSONObject {
        ["goal": "", "mode": "simple", "simple": .object(["label": "Progress", "percent": .number(percent)]), "milestones": []]
    }
    private func textData(_ text: String) -> JSONObject { ["text": .string(text)] }

    private func makeDriver(_ host: FakeHost, _ scheduler: FakeScheduler, clockMs: Double = 1_789_000_000_000) -> CircuitDriver {
        CircuitDriver(host: host, scheduler: scheduler, clock: .fixed(ms: clockMs), minter: .counting())
    }

    // MARK: Scenarios

    func testBoardLoadBaselinesAndNeverFires() {
        let host = FakeHost()
        host.widgets = ["counter": widget("counter", "counter", counter(4)), "goal": widget("goal", "goal_tracker", goal(0))]
        host.connections = ["w": .value(id: "w", fromId: "counter", fromField: "count", toId: "goal", toField: "percent", transform: .scale(factor: 10))]
        let scheduler = FakeScheduler()
        let driver = makeDriver(host, scheduler)
        driver.start()

        XCTAssertTrue(host.appliedWrites.isEmpty, "startup must not deliver")
        XCTAssertTrue(host.fires.isEmpty)
        XCTAssertEqual(host.widgets["goal"]?.data["simple"]?["percent"], .number(0))

        // A real edit after the baseline delivers through the transform.
        host.editWidget("counter", counter(6))
        XCTAssertEqual(host.appliedWrites.count, 1)
        XCTAssertEqual(host.widgets["goal"]?.data["simple"]?["percent"], .number(60))
        XCTAssertEqual(host.fires.map(\.ids), [["w"]])
        XCTAssertEqual(host.fires.first?.at, 1_789_000_000_000)

        // A whole-board replacement (load / undo) baselines again, silently.
        host.loadBoard(
            widgets: ["counter": widget("counter", "counter", counter(9)), "goal": widget("goal", "goal_tracker", goal(0))],
            connections: ["w": .value(id: "w", fromId: "counter", fromField: "count", toId: "goal", toField: "percent", transform: .scale(factor: 10))]
        )
        XCTAssertEqual(host.appliedWrites.count, 1, "load must not deliver")
        XCTAssertEqual(host.widgets["goal"]?.data["simple"]?["percent"], .number(0))
        host.editWidget("counter", counter(3))
        XCTAssertEqual(host.widgets["goal"]?.data["simple"]?["percent"], .number(30))
    }

    func testDrawingAWireDeliversImmediately() {
        let host = FakeHost()
        host.widgets = ["counter": widget("counter", "counter", counter(4)), "goal": widget("goal", "goal_tracker", goal(0))]
        let scheduler = FakeScheduler()
        let driver = makeDriver(host, scheduler)
        driver.start()
        XCTAssertTrue(host.appliedWrites.isEmpty)

        host.setConnections(["w": .value(id: "w", fromId: "counter", fromField: "count", toId: "goal", toField: "percent")])
        XCTAssertEqual(host.appliedWrites.count, 1)
        XCTAssertEqual(host.widgets["goal"]?.data["simple"]?["percent"], .number(4))
        XCTAssertEqual(host.clearDampedCalls, 1, "editing the circuit lifts damping")

        // Editing the wire's transform re-delivers its current value at once.
        host.setConnections(["w": .value(id: "w", fromId: "counter", fromField: "count", toId: "goal", toField: "percent", transform: .scale(factor: 10))])
        XCTAssertEqual(host.appliedWrites.count, 2)
        XCTAssertEqual(host.widgets["goal"]?.data["simple"]?["percent"], .number(40))

        // Re-committing the same wires delivers nothing.
        host.setConnections(host.connections)
        XCTAssertEqual(host.appliedWrites.count, 2)

        // Deleting the wire forgets its memory; redrawing it delivers again.
        host.setConnections([:])
        host.editWidget("goal", goal(0))
        host.setConnections(["w": .value(id: "w", fromId: "counter", fromField: "count", toId: "goal", toField: "percent", transform: .scale(factor: 10))])
        XCTAssertEqual(host.widgets["goal"]?.data["simple"]?["percent"], .number(40))
    }

    func testOscillatorIsDampedAfterTheBurstAndResumesAfterAnEdit() {
        let host = FakeHost()
        host.widgets = ["a": widget("a", "counter", counter(0)), "b": widget("b", "counter", counter(0))]
        let wires: OrderedMap<Connection> = [
            "forward": .value(id: "forward", fromId: "a", fromField: "count", toId: "b", toField: "count", transform: .offset(amount: 1)),
            "backward": .value(id: "backward", fromId: "b", fromField: "count", toId: "a", toField: "count", transform: .offset(amount: 1)),
        ]
        host.connections = wires
        let scheduler = FakeScheduler()
        let driver = makeDriver(host, scheduler)
        driver.start()
        XCTAssertTrue(host.appliedWrites.isEmpty)

        host.editWidget("a", counter(5))
        XCTAssertEqual(host.appliedWrites.count, CircuitDriver.burstLimit, "rings for exactly the burst, then trips")
        XCTAssertEqual(host.dampCalls, [["forward", "backward"]])
        XCTAssertEqual(host.dampedIds, ["forward", "backward"])
        XCTAssertEqual(host.notifications, [CircuitDriver.dampedMessage])
        XCTAssertTrue(host.fires.allSatisfy { $0.ids == ["forward", "backward"] })

        // Damped wires stay silent through further edits.
        host.editWidget("a", counter(100))
        XCTAssertEqual(host.appliedWrites.count, CircuitDriver.burstLimit)

        // Editing any wire re-arms the circuit; it rings again and is damped again,
        // and the toast is throttled because the clock has not moved.
        var edited = wires
        edited["forward"] = .value(id: "forward", fromId: "a", fromField: "count", toId: "b", toField: "count", transform: .offset(amount: 2))
        host.setConnections(edited)
        XCTAssertEqual(host.clearDampedCalls, 1)
        XCTAssertEqual(host.appliedWrites.count, 2 * CircuitDriver.burstLimit)
        XCTAssertEqual(host.dampCalls.count, 2)
        XCTAssertEqual(host.notifications.count, 1, "second toast within 4 s is suppressed")
    }

    func testHeartbeatSeedsOnlyTimeSensitiveSourcesWhileVisible() {
        let host = FakeHost()
        var clock = JSONObject()
        clock["mode"] = "deadline"
        clock["deadline"] = .object(["label": "Launch", "targetDate": .string(localDayKey())])
        host.widgets = [
            "clock": widget("clock", "timekeeper", clock),
            "counter": widget("counter", "counter", counter(1)),
            "days": widget("days", "text", textData("")),
            "tally": widget("tally", "text", textData("")),
        ]
        host.connections = [
            "d": .value(id: "d", fromId: "clock", fromField: "days_left", toId: "days", toField: "text"),
            "c": .value(id: "c", fromId: "counter", fromField: "count", toId: "tally", toField: "text"),
        ]
        let scheduler = FakeScheduler()
        let driver = makeDriver(host, scheduler)
        driver.start()
        XCTAssertEqual(scheduler.interval, 30)
        XCTAssertTrue(host.appliedWrites.isEmpty)

        // Nothing moved: a tick re-reads the clock source only, and it is silent.
        scheduler.fireTick()
        XCTAssertEqual(driver.lastWaveSeeds, ["clock"], "the counter is not a clock source")
        XCTAssertTrue(host.appliedWrites.isEmpty)

        // Move the deadline behind the driver's back (no version bump, as the
        // wall clock moving under a getter would). Hidden ticks exit; becoming
        // visible refreshes the clock sources and the wire delivers.
        host.widgets["clock"]?.data["deadline"] = .object(["label": "Launch", "targetDate": "2099-01-01"])
        scheduler.setVisible(false)
        driver.lastWaveSeedsReset()
        scheduler.fireTick()
        XCTAssertTrue(host.appliedWrites.isEmpty, "hidden: the tick exits")
        XCTAssertEqual(driver.lastWaveSeeds, [])
        scheduler.setVisible(true)
        XCTAssertEqual(host.appliedWrites.count, 1, "becoming visible refreshes clock sources")
        XCTAssertEqual(host.appliedWrites.first?.keys, ["days"])
        XCTAssertNotEqual(host.widgets["days"]?.data["text"], .string(""))
        XCTAssertEqual(host.widgets["tally"]?.data["text"], .string(""))
        XCTAssertEqual(host.fires.map(\.ids), [["d"]])

        // With no clock wires at all the tick has nothing to seed.
        host.setConnections(["c": .value(id: "c", fromId: "counter", fromField: "count", toId: "tally", toField: "text")])
        driver.lastWaveSeedsReset()
        scheduler.fireTick()
        XCTAssertEqual(driver.lastWaveSeeds, [])
    }

    func testDisposerStopsEverything() {
        let host = FakeHost()
        host.widgets = ["counter": widget("counter", "counter", counter(4)), "goal": widget("goal", "goal_tracker", goal(0))]
        host.connections = ["w": .value(id: "w", fromId: "counter", fromField: "count", toId: "goal", toField: "percent")]
        let scheduler = FakeScheduler()
        let driver = makeDriver(host, scheduler)
        let dispose = driver.start()
        XCTAssertTrue(driver.isRunning)
        XCTAssertEqual(host.listenerCount, 1)
        driver.start() // while running: a no-op that hands back the same disposer
        XCTAssertEqual(host.listenerCount, 1, "no second subscription")

        dispose()
        XCTAssertFalse(driver.isRunning)
        XCTAssertEqual(host.listenerCount, 0)
        XCTAssertTrue(scheduler.heartbeatCancelled)
        XCTAssertTrue(scheduler.visibilityCancelled)
        host.editWidget("counter", counter(6))
        driver.process()
        XCTAssertTrue(host.appliedWrites.isEmpty, "a disposed driver never writes")
        dispose() // idempotent

        // A fresh start baselines the current board and works again.
        driver.start()
        XCTAssertTrue(host.appliedWrites.isEmpty)
        host.editWidget("counter", counter(7))
        XCTAssertEqual(host.appliedWrites.count, 1)
        XCTAssertEqual(host.widgets["goal"]?.data["simple"]?["percent"], .number(7))
    }

    func testEngineWritesGoThroughApplyWireWritesOnly() {
        let host = FakeHost()
        host.widgets = [
            "counter": widget("counter", "counter", counter(7)),
            "middle": widget("middle", "number_input", ["label": "Value", "value": 0, "min": 0, "max": 100, "step": 1]),
            "goal": widget("goal", "goal_tracker", goal(0)),
        ]
        host.connections = [
            "first": .value(id: "first", fromId: "counter", fromField: "count", toId: "middle", toField: "value"),
            "second": .value(id: "second", fromId: "middle", fromField: "value", toId: "goal", toField: "percent"),
        ]
        let scheduler = FakeScheduler()
        let driver = makeDriver(host, scheduler)
        driver.start()
        host.editWidget("counter", counter(8))
        // One wave, one batched commit, both targets in write order.
        XCTAssertEqual(host.appliedWrites.count, 1)
        XCTAssertEqual(host.appliedWrites.first?.keys, ["middle", "goal"])
        XCTAssertEqual(host.widgets["middle"]?.data["value"], .number(8))
        XCTAssertEqual(host.widgets["goal"]?.data["simple"]?["percent"], .number(8))
        XCTAssertEqual(host.fires.map(\.ids), [["first", "second"]])
        // The commit re-notified the driver; the guard bounced it and the next
        // pass found nothing new to do.
        host.editWidget("counter", counter(8))
        XCTAssertEqual(host.appliedWrites.count, 1)
    }

    func testTriggerWiresFireCommandsAndRouteAutomationExecute() {
        let host = FakeHost()
        host.widgets = [
            "toggle": widget("toggle", "toggle", ["label": "Condition", "value": false]),
            "list": widget("list", "checklist", ["items": []]),
            "loop": widget("loop", "loop", ["input": "", "output": "", "enabled": true]),
        ]
        host.connections = [
            "add": .trigger(id: "add", fromId: "toggle", fromField: "value", toId: "list", command: "add_item", edge: .rising, transform: .format(template: "Task {value}")),
            "run": .trigger(id: "run", fromId: "toggle", fromField: "value", toId: "loop", command: "execute", edge: .rising),
        ]
        let scheduler = FakeScheduler()
        let driver = makeDriver(host, scheduler)
        driver.start()
        host.editWidget("toggle", ["label": "Condition", "value": true])
        XCTAssertEqual(host.executions, ["loop"])
        XCTAssertEqual(host.appliedWrites.count, 1)
        XCTAssertEqual(JSONWriter.stringify(.object(host.widgets["list"]!.data)), #"{"items":[{"id":"uuid-0001","label":"Task true","done":false,"status":"todo"}]}"#)
        host.editWidget("toggle", ["label": "Condition", "value": false])
        XCTAssertEqual(host.appliedWrites.count, 1, "falling edge does not fire a rising trigger")
    }
}
