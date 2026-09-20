import XCTest
@testable import GrovepadCore

/// Law 7 (JavaScript arithmetic) at the seams where a Swift rounding mode
/// and `Math.round` disagree.
///
/// `Math.round(x)` is `floor(x + 0.5)`: a half lands toward +∞, so
/// `Math.round(-0.5)` is `-0` and `Math.round(-1.5)` is `-1`. Swift's
/// `Double.rounded()` is `.toNearestOrAwayFromZero`, so the same inputs give
/// `-1` and `-2`. Anything that snaps a coordinate has to use `jsRound`, or a
/// card released on the left half of a canvas lands one whole cell away from
/// where the web app puts it — and that position is persisted board state.
final class JSArithmeticTests: XCTestCase {
    func testJsRoundSendsHalvesTowardPositiveInfinity() {
        XCTAssertEqual(jsRound(0.5), 1)
        XCTAssertEqual(jsRound(1.5), 2)
        XCTAssertEqual(jsRound(-0.5), 0, "Math.round(-0.5) === -0, not -1")
        XCTAssertEqual(jsRound(-1.5), -1, "Math.round(-1.5) === -1, not -2")
        XCTAssertEqual(jsRound(-2.5), -2)
        XCTAssertEqual(jsRound(2.4), 2)
        XCTAssertEqual(jsRound(-2.6), -3)
    }

    /// `snapToGrid` in `types/canvas.ts` is `Math.round(value / grid) * grid`.
    func testSnapToGridRoundsHalvesTheWayJavaScriptDoes() {
        XCTAssertEqual(CanvasGeometry.snapToGrid(117), 120)
        XCTAssertEqual(CanvasGeometry.snapToGrid(100), 120, "100/40 = 2.5 → 3")
        // The negative halves: the web keeps them one cell closer to zero.
        XCTAssertEqual(CanvasGeometry.snapToGrid(-20), 0, "Math.round(-0.5) * 40 === -0")
        XCTAssertEqual(CanvasGeometry.snapToGrid(-60), -40, "Math.round(-1.5) * 40 === -40")
        XCTAssertEqual(CanvasGeometry.snapToGrid(-100), -80)
        // Non-halves are unaffected, in both directions.
        XCTAssertEqual(CanvasGeometry.snapToGrid(-117), -120)
        XCTAssertEqual(CanvasGeometry.snapToGrid(-21), -40)
        XCTAssertEqual(CanvasGeometry.snapToGrid(-19), 0)
        // A custom grid takes the same rule.
        XCTAssertEqual(CanvasGeometry.snapToGrid(-5, grid: 10), 0)
    }

    /// `-0` and `0` are the same number in JavaScript and the same `Double`
    /// bit-pattern only when written back as a coordinate; the serializer
    /// must never emit "-0" for a snapped origin.
    func testSnappedOriginNeverSerializesAsNegativeZero() {
        let snapped = CanvasGeometry.snapToGrid(-20)
        XCTAssertEqual(JavaScript.numberString(snapped), "0")
    }

    /// `options[pickedIndex] ?? ''` is a property lookup on the web: an index
    /// it cannot find answers `undefined`, never a crash. The port compared
    /// `Int(index) < options.count`, and `Int(1e20)` traps — a valid JSON
    /// board could take the whole app down through a read-only getter.
    func testDecisionPickedSurvivesAnIndexNoIntCanHold() throws {
        func picked(_ index: JSONValue, options: [String]) -> String {
            var data = JSONObject()
            data["options"] = .array(options.map(JSONValue.string))
            data["pickedIndex"] = index
            let descriptor = fieldDescriptor("decision", "picked")!
            guard case .text(let value) = descriptor.get(data) else { return "<not text>" }
            return value
        }
        XCTAssertEqual(picked(.number(1), options: ["a", "b"]), "b")
        XCTAssertEqual(picked(.number(0), options: ["a", "b"]), "a")
        XCTAssertEqual(picked(.number(2), options: ["a", "b"]), "", "past the end is empty")
        XCTAssertEqual(picked(.number(-1), options: ["a", "b"]), "")
        XCTAssertEqual(picked(.number(0.5), options: ["a", "b"]), "", "a fractional index finds no property")
        XCTAssertEqual(picked(.null, options: ["a", "b"]), "")
        // The ones that used to trap.
        XCTAssertEqual(picked(.number(1e20), options: []), "")
        XCTAssertEqual(picked(.number(1e20), options: ["a"]), "")
        XCTAssertEqual(picked(.number(9.3e18), options: ["a"]), "", "just past Int64")
    }

    /// One local-day rule. `Date.getFullYear()` is always proleptic
    /// Gregorian; `Calendar.current` follows the reader's REGION calendar, so
    /// a second copy over it made `calendar.today` and the date card disagree
    /// about the year for a Buddhist or Japanese region.
    func testLocalDayKeyIsTheOneGregorianRule() {
        let instant = Date(timeIntervalSince1970: 1_789_000_000)
        XCTAssertEqual(localDayKey(at: instant), DateSkinModel.localDayKey(instant.timeIntervalSince1970 * 1000))
        XCTAssertEqual(DateSkinModel.calendar.identifier, .iso8601, "proleptic Gregorian, whatever the region says")
        XCTAssertEqual(DateSkinModel.calendar.timeZone, TimeZone.current, "…in the reader's zone, as `Date` is")
        // Shape, for every zone: four-digit year, zero-padded month and day.
        let key = localDayKey(at: instant)
        XCTAssertEqual(key.count, 10, key)
        XCTAssertEqual(key.filter { $0 == "-" }.count, 2, key)
    }
}
