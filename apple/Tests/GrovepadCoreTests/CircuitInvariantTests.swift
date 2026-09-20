import XCTest
@testable import GrovepadCore

/// The seven invariants listed at the end of `docs/circuit-engine.md`, each
/// with a test that fails if it breaks. Five were already guarded elsewhere
/// and are pointed at from here so the list stays checkable in one place;
/// two — bounded fan-out over a cycle, and transform totality — had no direct
/// guard and get one below.
///
/// | # | Invariant | Guarded by |
/// |---|---|---|
/// | 1 | A wave over unchanged state writes nothing | `CircuitGoldenTests.testWaveOverUnchangedStateWritesNothing` |
/// | 2 | Each connection fires ≤ once per wave; cycles terminate | here |
/// | 3 | Baseline mode never writes and never fires triggers | `CircuitDriverTests.testBoardLoadBaselinesAndNeverFires` (+ here, at the wave) |
/// | 4 | One incoming value wire per target field | `BoardDocumentTests.testSingleWriterRuleReplacesTheEarlierValueWire` |
/// | 5 | Deleting a widget deletes its wires; undo restores both | `BoardDocumentTests.testDeleteCascadesRelationsWiresAndGlues` |
/// | 6 | Transforms never emit NaN/Infinity | here |
/// | 7 | Engine writes never create undo entries | `CircuitDriverTests.testEngineWritesGoThroughApplyWireWritesOnly` |
final class CircuitInvariantTests: XCTestCase {
    private func board(_ json: JSONValue?) throws -> OrderedMap<Widget> {
        var map = OrderedMap<Widget>()
        for (id, record) in try XCTUnwrap(json?.objectValue).entries {
            map[id] = Widget(record: try XCTUnwrap(record.objectValue))
        }
        return map
    }

    private func wires(_ json: JSONValue?) throws -> OrderedMap<Connection> {
        var map = OrderedMap<Connection>()
        for (id, record) in try XCTUnwrap(json?.objectValue).entries {
            map[id] = Connection(record: try XCTUnwrap(record.objectValue))
        }
        return map
    }

    // MARK: - Invariant 2

    /// SINGLE FIRE, stated as the bound the doc states it as: "a wave
    /// terminates in ≤ |connections| firings, cycles included". The golden
    /// pack has a two-way oscillator; run it with BOTH ends seeded and assert
    /// the wave stops, that no connection appears twice in `firedIds`, and
    /// that the count never exceeds the number of wires.
    func testAWaveOverACycleTerminatesInAtMostOneFiringPerConnection() throws {
        let golden = try ConformancePack.object("circuits/cycle-terminates.json")
        var widgets = try board(golden["widgets"])
        let connections = try wires(golden["connections"])
        let index = buildConnectionIndex(connections)
        var memory = DeliveryMemory()
        // Ten waves of a genuinely oscillating circuit: each one is bounded,
        // and the whole run reaches a fixpoint rather than ringing forever.
        var lastNonEmpty = 0
        for pass in 0..<10 {
            let result = runWave(
                WaveInput(widgets: widgets, index: index, seeds: widgets.keys, minter: .counting()),
                memory: &memory
            )
            XCTAssertEqual(Set(result.firedIds).count, result.firedIds.count, "pass \(pass): a connection delivered twice in one wave")
            XCTAssertLessThanOrEqual(result.firedIds.count, connections.count, "pass \(pass): more firings than there are wires")
            for (id, data) in result.writes.entries { widgets[id]?.data = data }
            if !result.writes.isEmpty { lastNonEmpty = pass }
        }
        XCTAssertLessThan(lastNonEmpty, 9, "the circuit never went quiet — a wave is not reaching a fixpoint")
    }

    /// A self-referential wire (a widget feeding its own field) is the
    /// tightest cycle there is, and it must also fire at most once.
    func testASelfWireFiresAtMostOncePerWave() {
        let counter = Widget(id: "c", type: "counter", title: "c", canvasId: "k", position: .zero, size: Size(width: 1, height: 1), data: ["count": 1, "step": 1])
        let loop = Connection.value(id: "self", fromId: "c", fromField: "count", toId: "c", toField: "count", transform: .offset(amount: 1))
        let widgets: OrderedMap<Widget> = ["c": counter]
        let index = buildConnectionIndex([loop])
        var memory = DeliveryMemory()
        let result = runWave(WaveInput(widgets: widgets, index: index, seeds: ["c"], minter: .counting()), memory: &memory)
        XCTAssertEqual(result.firedIds, ["self"], "one firing, and the wave ends")
    }

    // MARK: - Invariant 3, at the wave

    /// Baseline mode over the same oscillator: memory fills, nothing is
    /// written, and no trigger fires.
    func testBaselineOverACycleRecordsWithoutWritingOrFiring() throws {
        let golden = try ConformancePack.object("circuits/trigger-edges.json")
        let widgets = try board(golden["widgets"])
        let index = buildConnectionIndex(try wires(golden["connections"]))
        var memory = DeliveryMemory()
        let result = runWave(
            WaveInput(widgets: widgets, index: index, seeds: widgets.keys, baselineOnly: true, minter: .counting()),
            memory: &memory
        )
        XCTAssertTrue(result.writes.isEmpty)
        XCTAssertTrue(result.firedIds.isEmpty)
        XCTAssertTrue(result.executeRequests.isEmpty)
        XCTAssertFalse(memory.isEmpty, "…but it did record what it saw")
    }

    // MARK: - Invariant 6

    /// "Transforms never emit NaN/Infinity: a wire must be unable to poison
    /// the widget it feeds." The pack checks the sampled cases; this checks
    /// the property, over every op and every hostile value a field getter
    /// could hand a wire.
    ///
    /// NOTE — the doc overstates this, and the port is faithful to the web
    /// rather than to the doc (law 1). Three paths in `transforms.ts` really
    /// can carry a non-finite number through, and all three are checked
    /// against the web below in `testTheThreeWaysTheWebItselfLetsANaNThrough`:
    /// `identity` returns its value untouched; `format` stringifies it; and
    /// `toNumber` of a SERIES is `value.at(-1)?.v ?? 0` with no
    /// `Number.isFinite` guard, unlike its number branch. What actually
    /// protects a widget is the target setter's own `num()` coercion.
    func testNoArithmeticTransformEverManufacturesNaNOrInfinity() {
        let ops: [WireTransform] = [
            .scale(factor: 1e308),
            .scale(factor: -1e308),
            .scale(factor: 0),
            .offset(amount: 1e308),
            .offset(amount: -1e308),
            .clamp(min: -1e308, max: 1e308),
            .clamp(min: 5, max: -5),
            .mapRange(inMin: 0, inMax: 0, outMin: 1e308, outMax: -1e308),
            .mapRange(inMin: -1e-308, inMax: 1e-308, outMin: -1e308, outMax: 1e308),
            .mapRange(inMin: 0, inMax: 1, outMin: 0, outMax: 100),
            .round,
            .invert,
            .threshold(value: 0),
        ]
        let values: [FieldValue] = [
            .number(.nan),
            .number(.infinity),
            .number(-.infinity),
            .number(1e308),
            .number(-1e308),
            .number(0),
            .number(-0.0),
            .number(.leastNonzeroMagnitude),
            .bool(true),
            .bool(false),
            .text(""),
            .text("not a number"),
            .text("1e999"),
            .text("-1e999"),
            .text("  12.5rest"),
            .series([]),
            .series([SeriesPoint(t: 0, v: 3), SeriesPoint(t: 1, v: 4)]),
        ]
        for op in ops {
            for value in values {
                let out = applyTransform(value, op)
                if case .number(let number) = out {
                    XCTAssertTrue(number.isFinite, "\(op) on \(value) emitted \(number)")
                }
                let serialized = serializeFieldValue(out)
                XCTAssertFalse(serialized.contains("NaN"), "\(op) on \(value) serialized as \(serialized)")
                XCTAssertFalse(serialized.contains("Infinity"), "\(op) on \(value) serialized as \(serialized)")
            }
        }
    }

    /// The three documented escape hatches, asserted so the port cannot
    /// quietly diverge from the web in either direction — neither by
    /// "fixing" a faithful quirk nor by growing a new one.
    func testTheThreeWaysTheWebItselfLetsANaNThrough() {
        // 1. `case 'identity': return value` — no coercion at all.
        XCTAssertEqual(serializeFieldValue(applyTransform(.number(.nan), .identity)), "n:NaN")
        XCTAssertEqual(serializeFieldValue(applyTransform(.number(.infinity), nil)), "n:Infinity")
        // 2. `format` is `template.replaceAll('{value}', toText(value))`, and
        //    `String(NaN)` is "NaN".
        XCTAssertEqual(applyTransform(.number(.nan), .format(template: "{value} units")), .text("NaN units"))
        // 3. `toNumber` of an array skips the finite guard its number branch
        //    has: `value.at(-1)?.v ?? 0`.
        let poisoned = FieldValue.series([SeriesPoint(t: 0, v: 1), SeriesPoint(t: 1, v: .nan)])
        XCTAssertTrue(num(poisoned).isNaN, "the series branch has no isFinite guard, exactly as the web")
        XCTAssertTrue(serializeFieldValue(applyTransform(poisoned, .round)).contains("NaN"))
        // …and an empty series is the `?? 0` fallback, which is finite.
        XCTAssertEqual(num(.series([])), 0)
    }

    /// The identity transform is the one op that passes its value straight
    /// through, so a non-finite number CAN reach a target through it — the
    /// web is the same (`case 'identity': return value`). What protects the
    /// widget is the setter's own coercion, which is `num()`, which is
    /// `Number.isFinite(x) ? x : 0`.
    func testAnIdentityWiresNonFiniteValueIsNeutralisedByTheCoercion() {
        XCTAssertEqual(num(applyTransform(.number(.nan), .identity)), 0)
        XCTAssertEqual(num(applyTransform(.number(.infinity), nil)), 0)
        XCTAssertEqual(num(.text("1e999")), 0, "parseFloat overflows to Infinity, which reads as 0")
    }
}
