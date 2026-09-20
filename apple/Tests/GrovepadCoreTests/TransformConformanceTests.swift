import XCTest
@testable import GrovepadCore

/// Transforms, field-value serialization and unit suggestions against
/// `circuits/transforms.json`: every sample value through every transform
/// must produce the same field value the web engine produced.
final class TransformConformanceTests: XCTestCase {
    private func fieldValue(_ json: JSONValue?, _ label: String) throws -> FieldValue {
        guard let json, let value = FieldValue(json: json) else {
            throw NSError(domain: "TransformConformanceTests", code: 1, userInfo: [NSLocalizedDescriptionKey: "\(label): not a field value"])
        }
        return value
    }

    func testEveryTransformCaseMatchesTheWeb() throws {
        let table = try ConformancePack.object("circuits/transforms.json")
        let cases = table["cases"]?.arrayValue ?? []
        XCTAssertGreaterThan(cases.count, 600)
        for (position, entry) in cases.enumerated() {
            guard let object = entry.objectValue else { return XCTFail("case \(position) is not an object") }
            let label = "case \(position): \(JSONWriter.stringify(entry))"
            let value = try fieldValue(object["value"], label)
            let expected = try fieldValue(object["result"], label)
            let transform: WireTransform?
            if let raw = object["transform"], !raw.isNull {
                guard let parsed = WireTransform(json: raw) else { return XCTFail("\(label): transform did not parse") }
                transform = parsed
            } else {
                transform = nil
            }
            let actual = applyTransform(value, transform)
            XCTAssertEqual(actual, expected, label)
            // Bytes, not just values: 1e21 and -0 must print the same way too.
            XCTAssertEqual(JSONWriter.stringify(actual.json), JSONWriter.stringify(expected.json), label)
        }
    }

    func testSerializedFormAndBooleanReadingMatchTheWeb() throws {
        let table = try ConformancePack.object("circuits/transforms.json")
        let rows = table["fieldValues"]?.arrayValue ?? []
        XCTAssertGreaterThan(rows.count, 30)
        for row in rows {
            let object = try XCTUnwrap(row.objectValue)
            let label = JSONWriter.stringify(row)
            let value = try fieldValue(object["value"], label)
            XCTAssertEqual(serializeFieldValue(value), object.string("serialized"), label)
            XCTAssertEqual(fieldValueAsBool(value), object.bool("bool"), label)
        }
    }

    func testUnitSuggestionsMatchTheWeb() throws {
        let table = try ConformancePack.object("circuits/transforms.json")
        let rows = table["suggestions"]?.arrayValue ?? []
        XCTAssertEqual(rows.count, 64)
        for row in rows {
            let object = try XCTUnwrap(row.objectValue)
            let from = object.string("from").flatMap(SemanticUnit.init(rawValue:))
            let to = object.string("to").flatMap(SemanticUnit.init(rawValue:))
            let expected = WireTransform(json: object["transform"])
            XCTAssertEqual(WireTransform.suggested(from: from, to: to), expected, JSONWriter.stringify(row))
        }
    }

    func testCoercionEdgeCasesTheWebRelieOn() {
        XCTAssertEqual(num(.text("3abc")), 3)
        XCTAssertEqual(num(.text("-4e2")), -400)
        XCTAssertEqual(num(.text(" 8 ")), 8)
        XCTAssertEqual(num(.text("\u{A0}8")), 8)
        XCTAssertEqual(num(.text("Infinity")), 0)
        XCTAssertEqual(num(.text("NaN")), 0)
        XCTAssertEqual(num(.text(".5")), 0.5)
        XCTAssertEqual(num(.text("5.")), 5)
        XCTAssertEqual(num(.text("1e")), 1)
        XCTAssertEqual(num(.text("+2")), 2)
        XCTAssertEqual(num(.text("1e400")), 0)
        XCTAssertEqual(text(.number(1e21)), "1e+21")
        XCTAssertEqual(text(.number(-0.0)), "0")
        XCTAssertEqual(text(.series([SeriesPoint(t: 0, v: 4), SeriesPoint(t: 1, v: 9.5)])), "4, 9.5")
        XCTAssertEqual(JavaScript.trim("\u{FEFF}\u{2028} x \u{3000}"), "x")
        // replaceAll with a string pattern still expands `$&`, `$$`, `` $` `` and `$'`.
        XCTAssertEqual(JavaScript.replaceAll("a{value}b", "{value}", with: "[$&|$$|$`|$']"), "a[{value}|$|a|b]b")
        XCTAssertEqual(JavaScript.replaceAll("{value}{value}", "{value}", with: "x"), "xx")
    }
}
