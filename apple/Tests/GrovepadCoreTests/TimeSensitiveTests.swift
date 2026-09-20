import XCTest
@testable import GrovepadCore

/// `timeSensitiveSourceIds` against `circuits/time-sensitive.json`: which
/// source widgets the heartbeat re-reads for each connection subset.
final class TimeSensitiveTests: XCTestCase {
    func testHeartbeatSourcesMatchTheWebForEveryConnectionSubset() throws {
        let table = try ConformancePack.object("circuits/time-sensitive.json")
        var widgets = OrderedMap<Widget>()
        for (id, record) in try XCTUnwrap(table.object("widgets")).entries {
            widgets[id] = Widget(record: try XCTUnwrap(record.objectValue))
        }
        let all = try XCTUnwrap(table.object("connections"))
        let cases = table["cases"]?.arrayValue ?? []
        XCTAssertEqual(cases.count, 4)
        for entry in cases {
            let object = try XCTUnwrap(entry.objectValue)
            var subset = OrderedMap<Connection>()
            for id in ConformancePack.stringList(object["connectionIds"]) {
                subset[id] = Connection(record: try XCTUnwrap(all.object(id)))
            }
            XCTAssertEqual(
                timeSensitiveSourceIds(connections: subset, widgets: widgets),
                ConformancePack.stringList(object["sourceIds"]),
                JSONWriter.stringify(entry)
            )
        }
    }

    func testTimeSensitiveFlagsAreExactlyTheWallClockFields() {
        let flagged = ["timekeeper", "calendar", "text", "counter", "goal_tracker", "status"].flatMap { type in
            fieldsFor(type).filter(\.timeSensitive).map { "\(type).\($0.key)" }
        }
        XCTAssertEqual(flagged, ["timekeeper.days_left", "timekeeper.days_until", "timekeeper.primary_time", "calendar.today"])
    }

    func testClockGettersReadTheSystemClock() {
        let today = fieldDescriptor("calendar", "today")!.get(JSONObject())
        XCTAssertEqual(text(today), localDayKey())
        XCTAssertEqual(text(today).count, 10)
        var clock = JSONObject()
        clock["deadline"] = .object(["label": "Launch", "targetDate": .string(localDayKey())])
        XCTAssertEqual(fieldDescriptor("timekeeper", "days_left")!.get(clock), .number(0))
        clock["deadline"] = .object(["label": "Launch", "targetDate": "not a date"])
        XCTAssertEqual(fieldDescriptor("timekeeper", "days_left")!.get(clock), .number(0))
        clock["worldClock"] = .object(["zones": ["Europe/London"]])
        let time = text(fieldDescriptor("timekeeper", "primary_time")!.get(clock))
        XCTAssertEqual(time.count, 5)
        XCTAssertEqual(Array(time)[2], ":")
        clock["worldClock"] = .object(["zones": ["Nowhere/Nope"]])
        XCTAssertEqual(text(fieldDescriptor("timekeeper", "primary_time")!.get(clock)), "--:--")
    }
}
