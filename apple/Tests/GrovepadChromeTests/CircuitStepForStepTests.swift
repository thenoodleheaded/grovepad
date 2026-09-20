import XCTest
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// THE PHASE-4 GATE: every circuit golden in `Conformance/pack.json`
/// (`circuits`, except the wall-clock `time-sensitive` case) replayed through
/// the native document and the circuit driver, step for step — a wired board
/// exported from the web behaving identically in the Mac app.
///
/// The goldens are engine-level scripts (`runWave` inputs: seeds, damped
/// ids, a baseline flag, edits). The driver only speaks in host events, so
/// each golden step maps onto the document action that produces that wave:
///
/// | Golden step                       | Document / driver action                          |
/// |----------------------------------|----------------------------------------------------|
/// | first `baselineOnly`, no edits    | `loadBoard` + `driver.start()` (the board open)   |
/// | later `baselineOnly` (with edits) | `loadBoard` of the edited board: both version     |
/// |                                   | stamps move, the driver baselines silently        |
/// | edits, not baseline               | `updateWidgetData` replacing each edited record   |
/// |                                   | (one commit per widget; the driver seeds it)      |
/// | no edits, not baseline, step 0    | the wires are DRAWN through `addValueConnection`/ |
/// |                                   | `addTriggerConnection` with the golden's ids, in  |
/// |                                   | golden order (a drawn wire delivers immediately), |
/// |                                   | then `driver.reseed(seeds)`                       |
/// | no edits, not baseline, later     | `driver.reseed(seeds)` — the heartbeat path;      |
/// |                                   | delivery memory is kept                           |
/// | `damped` ids present              | `dampConnections` before the reseed               |
/// | `damped` ids lifted               | re-arm by editing the wire (disable, enable): the |
/// |                                   | driver rule — any wire edit clears damping and    |
/// |                                   | redelivers the edited wire                        |
///
/// How the golden's wires enter the board (`entry` below): goldens whose
/// first step is a baseline, whose wires the document would refuse to draw
/// (missing endpoints), or whose wires break the single-writer rule (two
/// writers on one field, `disabled-and-damped`) are LOADED as an exported
/// board; the rest are drawn, because that is the only host event that
/// leaves a wire with empty delivery memory, as the golden's first wave has.
///
/// Drawn wires seed every source of the new wires and sequential edits run
/// one wave each, so the driver may fire a wire more than once where the
/// golden fired it once in a single wave; the assertions are therefore on
/// the SET of wires fired during the step and on the exact widget data after
/// it (as JSON text), which is what a person sees. Ids minted inside a step
/// restart at `uuid-0001`, as the generator's per-step counter did.
final class CircuitStepForStepTests: XCTestCase {

    /// These tests exercise the circuit system, which the app ships frozen
    /// (`CircuitFeature`); each switches it on for itself only.
    override func invokeTest() {
        let previous = CircuitFeature.isEnabled
        CircuitFeature.isEnabled = true
        defer { CircuitFeature.isEnabled = previous }
        super.invokeTest()
    }
    enum Entry { case load, draw }

    static let entry: [String: Entry] = [
        "baseline-records-without-writing": .load,
        "chain-within-one-wave": .draw,
        "coercion-via-target-setter": .draw,
        "cycle-terminates": .draw,
        "disabled-and-damped": .load,
        "every-transform-op": .draw,
        "flashcards-and-status-commands": .load,
        "missing-endpoints-and-fields": .load,
        "single-fire-fan-out-and-fan-in": .load,
        "trigger-baseline-mode-never-fires": .load,
        "trigger-edges": .draw,
        "trigger-payload-add-item": .draw,
        "value-delivery-with-transform": .draw,
    ]

    /// The generator's per-step id counter: reset before every step.
    final class StepMinter {
        var count = 0
        var minter: IdMinter {
            IdMinter { [self] in
                self.count += 1
                let digits = String(self.count)
                return "uuid-" + String(repeating: "0", count: max(0, 4 - digits.count)) + digits
            }
        }
        func reset() { count = 0 }
    }

    private func strings(_ json: JSONValue?) -> [String] {
        (json?.arrayValue ?? []).compactMap(\.stringValue)
    }

    private func board(from golden: JSONObject, withConnections: Bool) throws -> Board {
        var board = Board()
        board.workspaces["workspace"] = Workspace(id: "workspace", name: "Workspace", rootCanvasId: "canvas", createdAt: 1_789_000_000_000)
        board.canvases["canvas"] = CanvasMeta(id: "canvas", name: "Canvas", workspaceId: "workspace", parentCanvasId: nil)
        board.activeWorkspaceId = "workspace"
        board.activeCanvasId = "canvas"
        for (id, record) in try XCTUnwrap(golden["widgets"]?.objectValue).entries {
            board.widgets[id] = Widget(record: try XCTUnwrap(record.objectValue))
        }
        if withConnections {
            for (id, record) in try XCTUnwrap(golden["connections"]?.objectValue).entries {
                board.connections[id] = Connection(record: try XCTUnwrap(record.objectValue))
            }
        }
        return board
    }

    /// Draw one golden wire through the document, minting its golden id.
    private func draw(_ connection: Connection, in document: BoardDocument) -> String? {
        let mint = IdMinter { connection.id }
        switch connection.kind {
        case .value:
            return document.addValueConnection(
                from: connection.fromId, field: connection.fromField, to: connection.toId, field: connection.toField ?? "",
                transform: connection.transform, enabled: connection.enabled, mint: mint
            )
        case .trigger:
            return document.addTriggerConnection(
                from: connection.fromId, field: connection.fromField, to: connection.toId, command: connection.command ?? "",
                edge: connection.edge ?? .rising, transform: connection.transform, enabled: connection.enabled, mint: mint
            )
        }
    }

    func testEveryGoldenRunsThroughTheDocumentAndDriverStepForStep() throws {
        let manifest = try XCTUnwrap(ChromePack.json("pack.json").objectValue)
        let names = strings(manifest["circuits"]).filter { $0 != "time-sensitive" }
        XCTAssertEqual(Set(names), Set(CircuitStepForStepTests.entry.keys), "every golden is classified in the entry table")
        var stepsChecked = 0

        for name in names {
            let golden = try XCTUnwrap(ChromePack.json("circuits/\(name).json").objectValue)
            let entry = try XCTUnwrap(CircuitStepForStepTests.entry[name])
            let goldenConnections = try XCTUnwrap(golden["connections"]?.objectValue).entries.map { Connection(record: $0.value.objectValue ?? JSONObject()) }
            let widgetOrder = try XCTUnwrap(golden["widgets"]?.objectValue).keys

            // The document and the driver over it, exactly as the app wires them.
            let stepMinter = StepMinter()
            let tick = TestClock()
            let undo = UndoManager()
            undo.groupsByEvent = false
            var undoGroups = 0
            let observer = NotificationCenter.default.addObserver(forName: .NSUndoManagerDidCloseUndoGroup, object: undo, queue: nil) { _ in undoGroups += 1 }
            defer { NotificationCenter.default.removeObserver(observer) }
            let document = BoardDocument(board: Board(), undoManager: undo, mint: stepMinter.minter, clock: tick.clock)
            document.loadBoard(try board(from: golden, withConnections: entry == .load))
            let scheduler = FakeScheduler()
            let driver = CircuitDriver(host: document, scheduler: scheduler, clock: tick.clock, minter: stepMinter.minter)
            let dispose = driver.start()
            defer { dispose() }
            XCTAssertTrue(document.circuitUI.firePulses.isEmpty, "\(name): opening the board fires nothing")

            /// One user action: the undo groups it registers must be exactly
            /// `expected` — the driver's wire writes inside it register none.
            func userAction(_ expected: Int, _ label: String, _ body: () -> Void) {
                let before = undoGroups
                body()
                XCTAssertEqual(undoGroups - before, expected, "\(name): \(label) registers \(expected) undo step(s), wire writes none")
            }

            var previousDamped: [String] = []
            for (position, stepJSON) in (golden["steps"]?.arrayValue ?? []).enumerated() {
                let step = try XCTUnwrap(stepJSON.objectValue)
                let label = "\(name) step \(position) (\(step.string("label") ?? ""))"
                let expect = try XCTUnwrap(step.object("expect"))
                let edits = step.object("edits") ?? JSONObject()
                let seeds = strings(step["seeds"])
                let damped = strings(step["damped"])
                let baselineOnly = step.bool("baselineOnly") ?? false

                stepMinter.reset()
                tick.advance(ms: 1000)
                let stepTime = tick.now

                if baselineOnly {
                    if position > 0 || !edits.isEmpty {
                        // A load-style double stamp: the edited board arrives whole.
                        var next = document.board
                        for (id, data) in edits.entries { next.widgets[id]?.data = try XCTUnwrap(data.objectValue) }
                        userAction(0, "load") { document.loadBoard(next) }
                    }
                } else if !edits.isEmpty {
                    for (id, data) in edits.entries {
                        let record = try XCTUnwrap(data.objectValue)
                        let changes = document.widget(id)?.data != record
                        userAction(changes ? 1 : 0, "edit \(id)") {
                            document.updateWidgetData(id, coalesce: false) { $0 = record }
                        }
                    }
                } else {
                    if position == 0, entry == .draw {
                        for connection in goldenConnections {
                            userAction(1, "draw \(connection.id)") {
                                XCTAssertEqual(draw(connection, in: document), connection.id, "\(label): the document draws \(connection.id)")
                            }
                        }
                    }
                    let lifted = previousDamped.filter { !damped.contains($0) }
                    for id in lifted {
                        // Re-arm by editing the wire: disable, then enable again.
                        userAction(1, "disable \(id)") { document.setConnectionEnabled(id, false) }
                        tick.advance(ms: 1000)
                        userAction(1, "enable \(id)") { document.setConnectionEnabled(id, true) }
                    }
                    if !damped.isEmpty { userAction(0, "damp") { document.dampConnections(damped) } }
                    userAction(0, "reseed") { driver.reseed(seeds) }
                }
                previousDamped = damped

                // Fires recorded during this step carry a timestamp at or after its start.
                let fired = Set(document.circuitUI.firePulses.filter { $0.value >= stepTime }.keys)
                XCTAssertEqual(fired, Set(strings(expect["firedIds"])), "\(label) fired wires")

                var after = JSONObject()
                for id in widgetOrder { after[id] = .object(document.widget(id)?.data ?? JSONObject()) }
                XCTAssertEqual(JSONWriter.stringify(.object(after)), JSONWriter.stringify(try XCTUnwrap(expect["widgetsAfter"])), "\(label) widget data")
                stepsChecked += 1
            }
        }
        XCTAssertGreaterThan(stepsChecked, 25)
    }
}
