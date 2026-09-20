import XCTest
@testable import GrovepadCore

/// Field and command tables against `fields/*.json`: port lists in slot
/// order, every getter over the populated samples, every setter over every
/// sample value, and every command with and without a payload. Setter and
/// command results are compared as the exact JSON text, so key order and
/// unknown-field survival are judged along with the values.
final class FieldTableConformanceTests: XCTestCase {
    /// The pack was generated under fake timers at the frozen clock; the
    /// date_picker getters read `FieldClock`, so the same instant is installed
    /// here (in `TimeZone.current`, like the machine that generated the pack).
    override func setUp() {
        super.setUp()
        FieldClock.now = .conformance
    }

    override func tearDown() {
        FieldClock.reset()
        super.tearDown()
    }

    private func assertData(_ actual: JSONObject, _ expected: JSONValue?, type: String, sample: Int, _ label: String) {
        assertSameText(JSONWriter.stringify(.object(actual)), expected.map(JSONWriter.stringify), label)
    }

    func testPortListsMatchTheWeb() throws {
        let manifest = try ConformancePack.manifest()
        let types = ConformancePack.stringList(manifest["fieldTables"])
        XCTAssertEqual(types.count, 31)
        for type in types {
            let table = try ConformancePack.object("fields/\(type).json")
            let fields = fieldsFor(type)
            let outputs = outputPortsFor(type)
            let expectedOutputs = table["outputs"]?.arrayValue ?? []
            XCTAssertEqual(outputs.count, expectedOutputs.count, "\(type) output count")
            for (port, expected) in zip(outputs, expectedOutputs) {
                let expected = try XCTUnwrap(expected.objectValue)
                let label = "\(type) output \(port.key)"
                XCTAssertEqual(port.key, expected.string("key"), label)
                XCTAssertEqual(port.label, expected.string("label"), label)
                XCTAssertEqual(port.kind, .field, label)
                XCTAssertEqual(port.valueType?.rawValue, expected.string("valueType"), label)
                XCTAssertEqual(port.unit?.rawValue, expected.string("unit"), label)
                XCTAssertEqual(Double(port.index), expected.number("index"), label)
                XCTAssertEqual(fields.first { $0.key == port.key }?.timeSensitive, expected.bool("timeSensitive"), label)
            }
            let inputs = inputPortsFor(type)
            let expectedInputs = table["inputs"]?.arrayValue ?? []
            XCTAssertEqual(inputs.count, expectedInputs.count, "\(type) input count")
            for (port, expected) in zip(inputs, expectedInputs) {
                let expected = try XCTUnwrap(expected.objectValue)
                let label = "\(type) input \(port.key)"
                XCTAssertEqual(port.key, expected.string("key"), label)
                XCTAssertEqual(port.label, expected.string("label"), label)
                XCTAssertEqual(port.kind.rawValue, expected.string("kind"), label)
                XCTAssertEqual(port.valueType?.rawValue, expected.string("valueType"), label)
                XCTAssertEqual(port.unit?.rawValue, expected.string("unit"), label)
                XCTAssertEqual(port.acceptsPayload, expected.bool("acceptsPayload"), label)
                XCTAssertEqual(Double(port.index), expected.number("index"), label)
                XCTAssertEqual(findInputPort(type, port.key, port.kind), port, label)
            }
            for port in outputs { XCTAssertEqual(findOutputPort(type, port.key), port) }
        }
    }

    func testGettersMatchTheWeb() throws {
        let manifest = try ConformancePack.manifest()
        var checked = 0
        for type in ConformancePack.stringList(manifest["fieldTables"]) {
            let table = try ConformancePack.object("fields/\(type).json")
            let samples = (table["samples"]?.arrayValue ?? []).map { $0.objectValue ?? JSONObject() }
            for entry in table["gets"]?.arrayValue ?? [] {
                let get = try XCTUnwrap(entry.objectValue)
                let sample = Int(get.number("sample") ?? -1)
                let key = get.string("key") ?? ""
                let label = "\(type) sample \(sample) get \(key)"
                guard let descriptor = fieldDescriptor(type, key) else { XCTFail("\(label): no descriptor"); continue }
                let expected = try XCTUnwrap(get["value"].flatMap(FieldValue.init(json:)), label)
                let actual = descriptor.get(samples[sample])
                XCTAssertEqual(actual, expected, label)
                XCTAssertEqual(JSONWriter.stringify(actual.json), JSONWriter.stringify(expected.json), label)
                checked += 1
            }
        }
        XCTAssertGreaterThan(checked, 100)
    }

    func testSettersMatchTheWebByteForByte() throws {
        let manifest = try ConformancePack.manifest()
        var checked = 0
        for type in ConformancePack.stringList(manifest["fieldTables"]) {
            let table = try ConformancePack.object("fields/\(type).json")
            let samples = (table["samples"]?.arrayValue ?? []).map { $0.objectValue ?? JSONObject() }
            for entry in table["sets"]?.arrayValue ?? [] {
                let set = try XCTUnwrap(entry.objectValue)
                let sample = Int(set.number("sample") ?? -1)
                let key = set.string("key") ?? ""
                let label = "\(type) sample \(sample) set \(key) ← \(JSONWriter.stringify(set["value"] ?? .null))"
                guard let setter = fieldDescriptor(type, key)?.set else { XCTFail("\(label): no setter"); continue }
                let value = try XCTUnwrap(set["value"].flatMap(FieldValue.init(json:)), label)
                assertData(setter(samples[sample], value, .counting()), set["data"], type: type, sample: sample, label)
                checked += 1
            }
        }
        XCTAssertGreaterThan(checked, 500)
    }

    func testCommandsMatchTheWebByteForByte() throws {
        let manifest = try ConformancePack.manifest()
        var checked = 0
        for type in ConformancePack.stringList(manifest["fieldTables"]) {
            let table = try ConformancePack.object("fields/\(type).json")
            let samples = (table["samples"]?.arrayValue ?? []).map { $0.objectValue ?? JSONObject() }
            for entry in table["commands"]?.arrayValue ?? [] {
                let command = try XCTUnwrap(entry.objectValue)
                let sample = Int(command.number("sample") ?? -1)
                let key = command.string("key") ?? ""
                let label = "\(type) sample \(sample) command \(key) payload \(JSONWriter.stringify(command["payload"] ?? .null))"
                guard let descriptor = commandsFor(type).first(where: { $0.key == key }) else { XCTFail("\(label): no command"); continue }
                let payload: FieldValue? = command.bool("hasPayload") == true ? try XCTUnwrap(command["payload"].flatMap(FieldValue.init(json:)), label) : nil
                assertData(descriptor.run(samples[sample], payload, .counting()), command["data"], type: type, sample: sample, label)
                checked += 1
            }
        }
        XCTAssertGreaterThan(checked, 100)
    }

    func testDeferredAndUnknownTypesHaveNoPorts() {
        for type in FieldRegistry.deferredTypes + ["no_such_type", "canvas_node"] {
            XCTAssertEqual(fieldsFor(type).count, 0, type)
            XCTAssertEqual(commandsFor(type).count, 0, type)
            XCTAssertEqual(outputPortsFor(type).count, 0, type)
            XCTAssertEqual(inputPortsFor(type).count, 0, type)
        }
    }
}
