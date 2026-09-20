import XCTest
@testable import GrovepadCore

/// `externalCalendarService.ts`'s pure half: what a Google calendar list and
/// event page parse into, the month window and the request URL.
final class ExternalCalendarTests: XCTestCase {
    private func parse(_ text: String) throws -> JSONValue { try JSONParser.parse(text) }

    func testCalendarListKeepsNamedCalendarsWithSafeColours() throws {
        let raw = try parse(##"{"items":[{"id":"me@x","summary":"Mine","backgroundColor":"#16A765","primary":true},{"id":"team","summary":"Team","backgroundColor":"red"},{"id":"","summary":"No id"},{"id":"nameless"},"junk"]}"##)
        XCTAssertEqual(ExternalCalendarRules.calendars(from: raw), [
            ExternalCalendar(provider: .google, id: "me@x", name: "Mine", color: "#16A765", primary: true),
            ExternalCalendar(provider: .google, id: "team", name: "Team", color: "#4285f4", primary: false),
        ])
        XCTAssertEqual(ExternalCalendarRules.calendars(from: try parse("{}")), [])
        XCTAssertEqual(ExternalCalendarRules.calendars(from: nil), [])
    }

    func testEventsReadTimedAllDayAndUntitledEntries() throws {
        let calendar = ExternalCalendar(provider: .google, id: "c1", name: "Work", color: "#123456", primary: true)
        let raw = try parse(##"""
        {"items":[
          {"id":"a","summary":"Standup","start":{"dateTime":"2026-09-21T09:00:00+01:00"},"end":{"dateTime":"2026-09-21T09:15:00+01:00"},"htmlLink":"https://calendar.google.com/e?a"},
          {"id":"b","start":{"date":"2026-09-22"},"end":{"date":"2026-09-23"},"htmlLink":"javascript:alert(1)"},
          {"id":"c","summary":"No end","start":{"date":"2026-09-24"}},
          {"id":"d","summary":"No start"},
          {"summary":"No id","start":{"date":"2026-09-25"}}
        ]}
        """##)
        let events = ExternalCalendarRules.events(for: calendar, from: raw)
        XCTAssertEqual(events.map(\.id), ["a", "b", "c"])
        XCTAssertEqual(events[0], ExternalCalendarEvent(provider: .google, id: "a", calendarId: "c1", calendarName: "Work", title: "Standup", start: "2026-09-21T09:00:00+01:00", end: "2026-09-21T09:15:00+01:00", allDay: false, url: "https://calendar.google.com/e?a", color: "#123456"))
        XCTAssertEqual(events[1].title, "Busy", "an untitled event reads as busy")
        XCTAssertTrue(events[1].allDay)
        XCTAssertNil(events[1].url, "only http(s) links survive")
        XCTAssertEqual(events[2].end, "2026-09-24", "a missing end falls back to the start")
    }

    func testAMonthLoadsPrimaryFirstAndAtMostSixCalendars() {
        let calendars = (0..<8).map { ExternalCalendar(provider: .google, id: "c\($0)", name: "C\($0)", color: "#000000", primary: $0 == 5) }
        XCTAssertEqual(ExternalCalendarRules.visibleCalendars(calendars).map(\.id), ["c5", "c0", "c1", "c2", "c3", "c4"])
    }

    func testMonthBoundsAreLocalMidnightsInUtc() throws {
        let zone = try XCTUnwrap(TimeZone(identifier: "Europe/London"))
        let september = ExternalCalendarRules.monthBounds(year: 2026, month: 8, timeZone: zone)
        XCTAssertEqual(september.start, "2026-08-31T23:00:00.000Z")
        XCTAssertEqual(september.end, "2026-09-30T23:00:00.000Z")
        let december = ExternalCalendarRules.monthBounds(year: 2026, month: 11, timeZone: TimeZone(identifier: "UTC")!)
        XCTAssertEqual(december.end, "2027-01-01T00:00:00.000Z", "December rolls into the next year")
    }

    func testEventsUrlEncodesTheCalendarIdAndQuery() {
        let url = ExternalCalendarRules.eventsURL(calendarId: "a b@group.calendar.google.com", start: "2026-09-01T00:00:00.000Z", end: "2026-10-01T00:00:00.000Z")
        XCTAssertEqual(url.absoluteString, "https://www.googleapis.com/calendar/v3/calendars/a%20b%40group.calendar.google.com/events?timeMin=2026-09-01T00:00:00.000Z&timeMax=2026-10-01T00:00:00.000Z&singleEvents=true&orderBy=startTime&maxResults=40")
    }

    func testEventsSortByStartKeepingTies() {
        func event(_ id: String, _ start: String) -> ExternalCalendarEvent {
            ExternalCalendarEvent(provider: .google, id: id, calendarId: "c", calendarName: "C", title: id, start: start, end: start, allDay: false, url: nil, color: "#000000")
        }
        let sorted = ExternalCalendarRules.sortedEvents([event("late", "2026-09-30"), event("tie1", "2026-09-02"), event("early", "2026-09-01"), event("tie2", "2026-09-02")])
        XCTAssertEqual(sorted.map(\.id), ["early", "tie1", "tie2", "late"])
    }
}
