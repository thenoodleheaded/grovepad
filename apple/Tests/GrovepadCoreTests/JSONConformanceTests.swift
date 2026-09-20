import XCTest
@testable import GrovepadCore

/// The JSON layer against the pack: number formatting, string escaping, key
/// ordering, pretty layout, canonical form and SHA-256 must all match what
/// JavaScript produced.
final class JSONConformanceTests: XCTestCase {
    func testNumberFormattingMatchesJavaScript() throws {
        let table = try ConformancePack.object("json/numbers.json")
        XCTAssertGreaterThan(table.count, 50)
        for (literal, expected) in table.entries {
            guard case .number(let value) = try JSONParser.parse(literal) else {
                return XCTFail("\(literal) did not parse as a number")
            }
            XCTAssertEqual(JSNumberFormatter.string(value), expected.stringValue, "literal \(literal)")
        }
    }

    func testStringEscapingMatchesJavaScript() throws {
        let table = try ConformancePack.object("json/strings.json")
        XCTAssertGreaterThan(table.count, 20)
        for (encoded, expected) in table.entries {
            let value = try JSONParser.parse(encoded)
            XCTAssertEqual(JSONWriter.stringify(value), expected.stringValue, "sample \(encoded)")
        }
    }

    func testLoneSurrogatesRoundTripVerbatim() throws {
        let text = #""lone \ud800 high and \udc00 low, pair \ud83d\ude00""#
        let value = try JSONParser.parse(text)
        guard case .utf16 = value else { return XCTFail("expected ill-formed text to be kept as UTF-16") }
        XCTAssertEqual(JSONWriter.stringify(value), #""lone \ud800 high and \udc00 low, pair 😀""#)
        XCTAssertEqual(value.stringValue, "lone \u{FFFD} high and \u{FFFD} low, pair 😀")
    }

    func testObjectsIterateInJavaScriptPropertyOrder() throws {
        let value = try JSONParser.parse(#"{"zeta":1,"10":2,"alpha":3,"2":4,"01":5,"-1":6,"4294967295":7,"4294967294":8,"0":9}"#)
        XCTAssertEqual(value.objectValue?.keys, ["0", "2", "10", "4294967294", "zeta", "alpha", "01", "-1", "4294967295"])
        XCTAssertEqual(JSONWriter.stringify(value), #"{"0":9,"2":4,"10":2,"4294967294":8,"zeta":1,"alpha":3,"01":5,"-1":6,"4294967295":7}"#)
    }

    func testDuplicateKeysTakeTheLastValueAtTheFirstPosition() throws {
        let value = try JSONParser.parse(#"{"a":1,"b":2,"a":3}"#)
        XCTAssertEqual(JSONWriter.stringify(value), #"{"a":3,"b":2}"#)
    }

    func testRejectsWhatJSONParseRejects() {
        for bad in ["", "{", "[1,]", "{\"a\":1,}", "01", "+1", ".5", "1.", "1e", "NaN", "'a'", "\"tab\there\"", "{\"a\" 1}", "[1 2]", "tru", "nul", "\"\\x41\"", "\"\\u12\""] {
            XCTAssertThrowsError(try JSONParser.parse(bad), "should reject \(bad.debugDescription)")
        }
        XCTAssertThrowsError(try JSONParser.parse(try ConformancePack.text("boards/truncated.json")))
    }

    func testAcceptsOnlyJSONWhitespace() throws {
        XCTAssertNoThrow(try JSONParser.parse(" \t\n\r[ 1 , 2 ] \n"))
        XCTAssertThrowsError(try JSONParser.parse("\u{A0}[1]"))
        XCTAssertThrowsError(try JSONParser.parse("[1]\u{2028}"))
    }

    func testGeneratedFixturesReproduceTheirOwnPrettyLayout() throws {
        // The generated fixtures were written by JSON.stringify(value, null, 2):
        // parse → pretty print must give the identical bytes back.
        let manifest = try ConformancePack.manifest()
        let handWritten: Set<String> = ["v2", "v2-unknown", "v3", "truncated", "array-root"]
        var checked = 0
        for name in ConformancePack.stringList(manifest["boards"]) where !handWritten.contains(name) {
            let text = try ConformancePack.text("boards/\(name).json")
            let value = try JSONParser.parse(text)
            assertSameText(JSONWriter.stringify(value, indent: 2) + "\n", text, "boards/\(name).json")
            checked += 1
        }
        XCTAssertGreaterThan(checked, 10)
    }

    func testCompactSerializedDocumentsReproduceByteForByte() throws {
        // Every `serialized` string in the pack came out of JSON.stringify on
        // the web. Reading it and writing it back must not change one byte.
        let manifest = try ConformancePack.manifest()
        var checked = 0
        for name in ConformancePack.stringList(manifest["boards"]) {
            let expectation = try ConformancePack.object("boards/\(name).expected.json")
            guard let serialized = expectation.string("serialized") else { continue }
            let value = try JSONParser.parse(serialized)
            assertSameText(JSONWriter.stringify(value), serialized, "boards/\(name)")
            XCTAssertEqual(SHA256.hex(serialized), expectation.string("sha256"), "boards/\(name) sha256")
            if let canonical = expectation.string("canonical") {
                assertSameText(JSONWriter.canonical(value), canonical, "boards/\(name) canonical")
                XCTAssertEqual(SHA256.hex(canonical), expectation.string("canonicalSha256"), "boards/\(name) canonical sha256")
            }
            checked += 1
        }
        XCTAssertGreaterThan(checked, 10)
    }

    func testSHA256KnownAnswers() {
        XCTAssertEqual(SHA256.hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
        XCTAssertEqual(SHA256.hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        XCTAssertEqual(
            SHA256.hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        )
        XCTAssertEqual(SHA256.hex(String(repeating: "a", count: 1_000_000)), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0")
    }

    func testCanonicalSortsByUTF16CodeUnits() {
        // U+FF00 (one unit) sorts after U+10000 (surrogate pair D800…) in JavaScript.
        XCTAssertTrue(JSONWriter.utf16Less("\u{10000}", "\u{FF00}"))
        XCTAssertFalse(JSONWriter.utf16Less("\u{FF00}", "\u{10000}"))
        XCTAssertTrue(JSONWriter.utf16Less("a", "ab"))
        XCTAssertTrue(JSONWriter.utf16Less("B", "a"))
    }
}
