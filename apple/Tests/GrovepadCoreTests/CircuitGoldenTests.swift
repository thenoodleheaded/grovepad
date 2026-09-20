import XCTest
@testable import GrovepadCore

/// The circuit golden tests (`circuits/*.json`): a board, a step sequence,
/// and after every wave the exact writes, fires, execute requests, delivery
/// memory and resulting widget data the web engine produced.
final class CircuitGoldenTests: XCTestCase {
    private func widgets(from json: JSONValue?) throws -> OrderedMap<Widget> {
        var map = OrderedMap<Widget>()
        for (id, record) in try XCTUnwrap(json?.objectValue).entries {
            map[id] = Widget(record: try XCTUnwrap(record.objectValue))
        }
        return map
    }

    private func connections(from json: JSONValue?) throws -> OrderedMap<Connection> {
        var map = OrderedMap<Connection>()
        for (id, record) in try XCTUnwrap(json?.objectValue).entries {
            map[id] = Connection(record: try XCTUnwrap(record.objectValue))
        }
        return map
    }

    private func memoryJSON(_ memory: DeliveryMemory) -> JSONValue {
        var object = JSONObject()
        for (id, state) in memory.entries {
            var entry = JSONObject()
            entry["serialized"] = .string(state.serialized)
            entry["bool"] = .bool(state.bool)
            object[id] = .object(entry)
        }
        return .object(object)
    }

    func testEveryGoldenCaseReplaysStepForStep() throws {
        let manifest = try ConformancePack.manifest()
        var checked = 0
        for name in ConformancePack.stringList(manifest["circuits"]) where name != "time-sensitive" {
            let golden = try ConformancePack.object("circuits/\(name).json")
            var widgets = try widgets(from: golden["widgets"])
            let index = buildConnectionIndex(try connections(from: golden["connections"]))
            var memory = DeliveryMemory()
            for (position, step) in (golden["steps"]?.arrayValue ?? []).enumerated() {
                let step = try XCTUnwrap(step.objectValue)
                let label = "\(name) step \(position) (\(step.string("label") ?? ""))"
                if let edits = step.object("edits") {
                    for (id, data) in edits.entries {
                        widgets[id]?.data = try XCTUnwrap(data.objectValue)
                    }
                }
                let result = runWave(
                    WaveInput(
                        widgets: widgets,
                        index: index,
                        seeds: ConformancePack.stringList(step["seeds"]),
                        dampedIds: Set(ConformancePack.stringList(step["damped"])),
                        baselineOnly: step.bool("baselineOnly") ?? false,
                        minter: .counting()
                    ),
                    memory: &memory
                )
                let expect = try XCTUnwrap(step.object("expect"))
                assertSameText(JSONWriter.stringify(result.writes.json), expect["writes"].map(JSONWriter.stringify), "\(label) writes")
                XCTAssertEqual(result.firedIds, ConformancePack.stringList(expect["firedIds"]), "\(label) firedIds")
                XCTAssertEqual(result.executeRequests, ConformancePack.stringList(expect["executeRequests"]), "\(label) executeRequests")
                assertSameText(JSONWriter.stringify(memoryJSON(memory)), expect["memory"].map(JSONWriter.stringify), "\(label) memory")
                for (id, data) in result.writes.entries {
                    widgets[id]?.data = data
                }
                var after = JSONObject()
                for (id, widget) in widgets.entries { after[id] = .object(widget.data) }
                assertSameText(JSONWriter.stringify(.object(after)), expect["widgetsAfter"].map(JSONWriter.stringify), "\(label) widgetsAfter")
                checked += 1
            }
        }
        XCTAssertGreaterThan(checked, 25)
    }

    func testWaveOverUnchangedStateWritesNothing() throws {
        let golden = try ConformancePack.object("circuits/cycle-terminates.json")
        var widgets = try widgets(from: golden["widgets"])
        let index = buildConnectionIndex(try connections(from: golden["connections"]))
        var memory = DeliveryMemory()
        let first = runWave(WaveInput(widgets: widgets, index: index, seeds: ["a", "b", "a"], minter: .counting()), memory: &memory)
        XCTAssertFalse(first.writes.isEmpty)
        // Each wire fired once even though both sources were seeded (and one twice).
        XCTAssertEqual(Set(first.firedIds).count, first.firedIds.count)
        for (id, data) in first.writes.entries { widgets[id]?.data = data }
        let again = runWave(WaveInput(widgets: widgets, index: index, seeds: ["a", "b"], minter: .counting()), memory: &memory)
        XCTAssertTrue(again.writes.isEmpty)
        XCTAssertTrue(again.firedIds.isEmpty)
    }

    func testAutomationExecuteRoutesToTheExecutor() throws {
        var toggle = Widget(id: "t", type: "toggle", title: "t", canvasId: "c", position: .zero, size: Size(width: 1, height: 1), data: ["label": "x", "value": false])
        let loop = Widget(id: "l", type: "loop", title: "l", canvasId: "c", position: .zero, size: Size(width: 1, height: 1), data: ["input": "", "output": "", "enabled": true])
        let wire = Connection.trigger(id: "w", fromId: "t", fromField: "value", toId: "l", command: "execute", edge: .rising)
        var widgets: OrderedMap<Widget> = ["t": toggle, "l": loop]
        let index = buildConnectionIndex([wire])
        var memory = DeliveryMemory()
        _ = runWave(WaveInput(widgets: widgets, index: index, seeds: ["t"], baselineOnly: true), memory: &memory)
        toggle.data["value"] = .bool(true)
        widgets["t"] = toggle
        let result = runWave(WaveInput(widgets: widgets, index: index, seeds: ["t"]), memory: &memory)
        XCTAssertEqual(result.executeRequests, ["l"])
        XCTAssertEqual(result.firedIds, ["w"])
        XCTAssertTrue(result.writes.isEmpty)
    }
}
