import XCTest
@testable import GrovepadCore

/// `DateSkinModel` against the web's own `dateSkinModel.test.ts`. Every
/// reading is measured from a fixed local noon on 2026-07-26 in
/// `TimeZone.current`, so nothing here depends on when the suite runs.
final class SkinModelDateTests: XCTestCase {
    private static let now: Double = {
        var components = DateComponents()
        components.year = 2026
        components.month = 7
        components.day = 26
        components.hour = 12
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = TimeZone.current
        return calendar.date(from: components)!.timeIntervalSince1970 * 1000
    }()

    private var now: Double { Self.now }

    private func card(_ patch: JSONObject = JSONObject()) -> JSONObject {
        var base: JSONObject = ["label": "Target date", "date": "2026-07-30", "time": "", "includeTime": false, "mode": "date_time"]
        base.merge(patch)
        return base
    }

    private func reading(_ data: JSONObject) -> DateSkinModel.Reading {
        DateSkinModel.reading(data, now: now, locale: Locale(identifier: "en_GB"))
    }

    // MARK: day arithmetic

    func testRejectsAKeyThatIsNotARealCalendarDay() {
        XCTAssertNil(DateSkinModel.dayStart("2026-02-31"))
        XCTAssertNil(DateSkinModel.dayStart("2026-7-1"))
        XCTAssertNil(DateSkinModel.dayStart("nonsense"))
        XCTAssertNil(DateSkinModel.dayStart("2026-13-01"))
        XCTAssertNil(DateSkinModel.dayStart("2026-00-10"))
        XCTAssertNil(DateSkinModel.dayStart("2026-01-00"))
        XCTAssertNil(DateSkinModel.dayStart("0099-01-01")) // `new Date(99, 0, 1)` is 1999
        XCTAssertNil(DateSkinModel.dayStart("２０２６-01-01")) // full-width digits are not `\d`
        XCTAssertNil(DateSkinModel.dayStart(nil))
        XCTAssertNotNil(DateSkinModel.dayStart("2026-02-28"))
        XCTAssertNotNil(DateSkinModel.dayStart("2028-02-29"))
        XCTAssertNotNil(DateSkinModel.dayStart("0100-01-01"))
        XCTAssertEqual(DateSkinModel.dateDay("2026-02-31"), "")
        XCTAssertEqual(DateSkinModel.dateDay(.string("2026-02-28")), "2026-02-28")
        XCTAssertEqual(DateSkinModel.dateDay(.number(20260228)), "")
    }

    func testMeasuresWholeCalendarDaysAcrossADaylightSavingBoundary() {
        XCTAssertEqual(DateSkinModel.daysBetween("2026-03-27", "2026-03-30"), 3)
        XCTAssertEqual(DateSkinModel.daysBetween("2026-10-23", "2026-10-30"), 7)
        XCTAssertEqual(DateSkinModel.daysBetween("2026-07-30", "2026-07-26"), -4)
        XCTAssertNil(DateSkinModel.daysBetween("2026-07-30", "nope"))
        XCTAssertEqual(DateSkinModel.daysUntilDay("2026-07-30", now: now), 4)
    }

    func testMovesByLocalCalendarDaysRatherThanByMilliseconds() {
        XCTAssertEqual(DateSkinModel.shiftDay("2026-03-28", 1), "2026-03-29")
        XCTAssertEqual(DateSkinModel.shiftDay("2026-12-31", 1), "2027-01-01")
        XCTAssertEqual(DateSkinModel.shiftDay("2026-03-01", -1.9), "2026-02-28")
        XCTAssertEqual(DateSkinModel.shiftDay("", 1), "")
        XCTAssertEqual(DateSkinModel.shiftDay("2026-03-01", .infinity), "")
    }

    func testClampsADayOfMonthIntoAShorterMonth() {
        XCTAssertEqual(DateSkinModel.dayInMonth(2026, 2, 31), "2026-02-28")
        XCTAssertEqual(DateSkinModel.dayInMonth(2028, 2, 29), "2028-02-29")
        XCTAssertEqual(DateSkinModel.dayInMonth(2026, 11, 7), "2026-11-07")
    }

    func testValidatesAStoredTime() {
        XCTAssertEqual(DateSkinModel.dateTime("09:30"), "09:30")
        XCTAssertEqual(DateSkinModel.dateTime("23:59"), "23:59")
        XCTAssertEqual(DateSkinModel.dateTime("24:00"), "")
        XCTAssertEqual(DateSkinModel.dateTime("9:3"), "")
        XCTAssertEqual(DateSkinModel.dateTime("12:60"), "")
        XCTAssertEqual(DateSkinModel.dateTime(930), "")
    }

    // MARK: skin resolution

    func testReadsTheRetiredCountdownModeBackAsTheDeadlineSkin() {
        XCTAssertEqual(DateSkinModel.skinMode("countdown"), "deadline")
        XCTAssertEqual(DateSkinModel.skinMode("milestone"), "milestone")
        XCTAssertEqual(DateSkinModel.skinMode("nonsense"), "date_time")
        XCTAssertEqual(DateSkinModel.skinMode(nil), "date_time")
    }

    // MARK: relative phrasing

    func testCoarsensTheUnitAsTheDistanceGrows() {
        XCTAssertEqual(DateSkinModel.relativePhrase(0), "Today")
        XCTAssertEqual(DateSkinModel.relativePhrase(1), "Tomorrow")
        XCTAssertEqual(DateSkinModel.relativePhrase(-1), "Yesterday")
        XCTAssertEqual(DateSkinModel.relativePhrase(4), "In 4 days")
        XCTAssertEqual(DateSkinModel.relativePhrase(-3), "3 days ago")
        XCTAssertEqual(DateSkinModel.relativePhrase(7), "Next week")
        XCTAssertEqual(DateSkinModel.relativePhrase(21), "In 3 weeks")
        XCTAssertEqual(DateSkinModel.relativePhrase(-90), "3 months ago")
        XCTAssertEqual(DateSkinModel.relativePhrase(-40), "Last month")
        XCTAssertEqual(DateSkinModel.relativePhrase(800), "In 2 years")
        XCTAssertEqual(DateSkinModel.relativePhrase(.nan), "—")
    }

    // MARK: deadline

    func testDefaultsToAThirtyDayRunwayAndKeepsAChosenOne() {
        XCTAssertEqual(DateSkinModel.deadlineLeadDays(card()), 30)
        let withLead = DateSkinModel.dataWithDateState(card(["mode": "deadline"]), "deadline", ["leadDays": 7])
        XCTAssertEqual(DateSkinModel.deadlineLeadDays(withLead), 7)
        XCTAssertEqual(DateSkinModel.deadlineLeadDays(["skinStates": ["deadline": ["leadDays": 5000]]]), 999)
        XCTAssertEqual(DateSkinModel.deadlineLeadDays(["skinStates": ["deadline": ["leadDays": 0.5]]]), 30)
    }

    func testNamesTheTemperatureOfTheRemainingTime() {
        XCTAssertEqual(DateSkinModel.deadlineUrgency(-1), .overdue)
        XCTAssertEqual(DateSkinModel.deadlineUrgency(0), .due)
        XCTAssertEqual(DateSkinModel.deadlineUrgency(2), .urgent)
        XCTAssertEqual(DateSkinModel.deadlineUrgency(6), .soon)
        XCTAssertEqual(DateSkinModel.deadlineUrgency(40), .calm)
        XCTAssertEqual(DateSkinModel.deadlineUrgency(nil), .calm)
    }

    func testSpendsTheRunwayBetweenNothingAndEverything() {
        XCTAssertEqual(DateSkinModel.deadlineProgress(30, 30), 0)
        XCTAssertEqual(DateSkinModel.deadlineProgress(15, 30), 0.5)
        XCTAssertEqual(DateSkinModel.deadlineProgress(0, 30), 1)
        XCTAssertEqual(DateSkinModel.deadlineProgress(90, 30), 0)
        XCTAssertEqual(DateSkinModel.deadlineProgress(-9, 30), 1)
        XCTAssertEqual(DateSkinModel.deadlineProgress(nil, 30), 0)
    }

    // MARK: anniversary

    func testRollsAPastOccasionForwardToItsNextOccurrence() {
        XCTAssertEqual(DateSkinModel.nextAnniversary("1998-09-04", now: now), "2026-09-04")
        XCTAssertEqual(DateSkinModel.nextAnniversary("1998-03-11", now: now), "2027-03-11")
        XCTAssertEqual(DateSkinModel.nextAnniversary("nope", now: now), "")
    }

    func testCountsTodayAsTheNextOccurrenceRatherThanAsLate() {
        XCTAssertEqual(DateSkinModel.nextAnniversary("2014-07-26", now: now), "2026-07-26")
        XCTAssertEqual(DateSkinModel.daysUntilDay(DateSkinModel.nextAnniversary("2014-07-26", now: now), now: now), 0)
    }

    func testKeepsALeapDayOccasionAnnualByClampingIt() {
        XCTAssertEqual(DateSkinModel.nextAnniversary("2000-02-29", now: now), "2027-02-28")
    }

    func testNumbersTheOccurrenceFromTheOriginalYear() {
        XCTAssertEqual(DateSkinModel.anniversaryYears("2014-09-04", "2026-09-04"), 12)
        XCTAssertEqual(DateSkinModel.anniversaryYears("2026-09-04", "2026-09-04"), 0)
        XCTAssertEqual(DateSkinModel.anniversaryYears("2030-09-04", "2026-09-04"), 0)
    }

    // MARK: range

    private func ranged() -> JSONObject {
        DateSkinModel.dataWithDateState(card(["date": "2026-07-24", "mode": "range"]), "range", ["end": "2026-07-30"])
    }

    func testKeepsTheFarEndBesideTheSkinAndTheStartInTheCard() {
        let data = ranged()
        XCTAssertEqual(data.string("date"), "2026-07-24")
        XCTAssertEqual(DateSkinModel.rangeEndDay(data), "2026-07-30")
        XCTAssertEqual(DateSkinModel.rangeEndDay(["skinStates": ["range": ["end": "2026-02-31"]]]), "")
    }

    func testMeasuresNightsDaysAndTodaysPositionInsideTheSpan() throws {
        let span = try XCTUnwrap(DateSkinModel.rangeSpan("2026-07-24", "2026-07-30", now: now))
        XCTAssertEqual(span.nights, 6)
        XCTAssertEqual(span.days, 7)
        XCTAssertEqual(span.state, .during)
        XCTAssertEqual(span.progress, 2.0 / 6, accuracy: 1e-5)
        let single = try XCTUnwrap(DateSkinModel.rangeSpan("2026-07-26", "2026-07-26", now: now))
        XCTAssertEqual(single.nights, 0)
        XCTAssertEqual(single.days, 1)
        XCTAssertEqual(single.progress, 1)
    }

    func testReadsABackToFrontRangeAsARealSpanRatherThanANegativeOne() throws {
        let span = try XCTUnwrap(DateSkinModel.rangeSpan("2026-07-30", "2026-07-24", now: now))
        XCTAssertEqual(span.start, "2026-07-24")
        XCTAssertEqual(span.end, "2026-07-30")
        XCTAssertEqual(span.nights, 6)
    }

    func testReportsBeforeAndAfterWithoutPushingProgressPastItsEnds() throws {
        let before = try XCTUnwrap(DateSkinModel.rangeSpan("2026-08-01", "2026-08-04", now: now))
        XCTAssertEqual(before.state, .before)
        XCTAssertEqual(before.progress, 0)
        let after = try XCTUnwrap(DateSkinModel.rangeSpan("2026-06-01", "2026-06-04", now: now))
        XCTAssertEqual(after.state, .after)
        XCTAssertEqual(after.progress, 1)
        XCTAssertNil(DateSkinModel.rangeSpan("2026-06-01", "", now: now))
    }

    func testPublishesADurationOnlyForTheSkinThatHasOne() {
        XCTAssertEqual(DateSkinModel.durationDays(ranged(), now: now), 6)
        XCTAssertNil(DateSkinModel.durationDays(card(["mode": "deadline"]), now: now))
        XCTAssertNil(DateSkinModel.durationDays(card(["mode": "range"]), now: now))
    }

    // MARK: recurring date

    private func repeating(_ state: JSONObject, date: String = "2026-01-05") -> JSONObject {
        DateSkinModel.dataWithDateState(card(["date": .string(date), "mode": "recurring_date"]), "recurring_date", state)
    }

    func testDefaultsToAWeeklyRuleAndNamesItInWords() {
        XCTAssertEqual(DateSkinModel.recurrenceOf(card()), .init(unit: .week, interval: 1))
        XCTAssertEqual(DateSkinModel.recurrenceLabel(.init(unit: .week, interval: 1)), "Every week")
        XCTAssertEqual(DateSkinModel.recurrenceLabel(.init(unit: .day, interval: 3)), "Every 3 days")
        XCTAssertEqual(DateSkinModel.recurrenceOf(repeating(["unit": "bogus", "interval": 999.7])), .init(unit: .week, interval: 99))
        XCTAssertEqual(DateSkinModel.recurrenceOf(repeating(["unit": "month", "interval": 0.4])), .init(unit: .month, interval: 1))
    }

    func testWalksALongPastWeeklyRuleToTheNextOccurrenceOnOrAfterToday() throws {
        let rule = DateSkinModel.recurrenceOf(repeating(["unit": "week", "interval": 2]))
        let next = DateSkinModel.nextRecurrence("2026-01-05", rule, now: now)
        let until = try XCTUnwrap(DateSkinModel.daysUntilDay(next, now: now))
        XCTAssertGreaterThanOrEqual(until, 0)
        XCTAssertLessThan(until, 14)
        XCTAssertEqual(jsRemainder(try XCTUnwrap(DateSkinModel.daysBetween("2026-01-05", next)), 14), 0)
    }

    func testDoesNotCreepOffTheOriginalDayOfMonthAfterAShortMonth() {
        var components = DateComponents()
        components.year = 2026
        components.month = 1
        components.day = 1
        components.hour = 12
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = TimeZone.current
        let january = calendar.date(from: components)!.timeIntervalSince1970 * 1000
        XCTAssertEqual(
            DateSkinModel.recurrenceOccurrences("2026-01-31", .init(unit: .month, interval: 1), count: 4, now: january),
            ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]
        )
        XCTAssertEqual(
            DateSkinModel.recurrenceOccurrences("2024-02-29", .init(unit: .year, interval: 1), count: 3, now: january),
            ["2026-02-28", "2027-02-28", "2028-02-29"]
        )
        XCTAssertEqual(
            DateSkinModel.recurrenceOccurrences("2025-11-30", .init(unit: .month, interval: 5), count: 2, now: now),
            ["2026-09-30", "2027-02-28"]
        )
    }

    func testStartsAtAFutureStartRatherThanBeforeIt() {
        XCTAssertEqual(DateSkinModel.recurrenceOccurrences("2026-09-01", .init(unit: .day, interval: 1), count: 2, now: now), ["2026-09-01", "2026-09-02"])
    }

    func testReturnsNothingWithoutAUsableStart() {
        XCTAssertEqual(DateSkinModel.recurrenceOccurrences("", .init(unit: .week, interval: 1), count: 4, now: now), [])
        XCTAssertEqual(DateSkinModel.recurrenceOccurrences("2026-01-05", .init(unit: .week, interval: 1), count: 0, now: now), [])
    }

    // MARK: milestone

    func testReadsTheMilestoneDetailWithBoundsAndFallbacks() {
        let detail = DateSkinModel.milestoneDetail(["skinStates": ["milestone": ["owner": "Ada", "status": "active", "deliverable": .string(String(repeating: "d", count: 300))]]])
        XCTAssertEqual(detail.owner, "Ada")
        XCTAssertEqual(detail.status, .active)
        XCTAssertEqual(detail.deliverable.count, 200)
        XCTAssertEqual(DateSkinModel.milestoneDetail(card()), .init(owner: "", deliverable: "", status: .planned))
        XCTAssertEqual(DateSkinModel.MilestoneStatus.at_risk.label, "At risk")
    }

    // MARK: the shared reading

    func testPointsARepeatingSkinAtItsNextOccurrenceNotAtTheStoredDay() {
        let anniversary = reading(card(["date": "1998-09-04", "mode": "anniversary"]))
        XCTAssertEqual(anniversary.day, "2026-09-04")
        XCTAssertEqual(anniversary.days, 40)
        XCTAssertEqual(anniversary.state, .upcoming)
        XCTAssertEqual(anniversary.phrase, "Next month")
    }

    func testPointsARangeAtItsEarlierEnd() {
        let data = DateSkinModel.dataWithDateState(card(["date": "2026-08-10", "mode": "range"]), "range", ["end": "2026-08-01"])
        XCTAssertEqual(reading(data).day, "2026-08-01")
        // A range without a usable far end points at the stored day.
        XCTAssertEqual(reading(card(["date": "2026-08-10", "mode": "range"])).day, "2026-08-10")
    }

    func testReportsAnUnsetCardWithoutInventingADistance() {
        let unset = reading(card(["date": ""]))
        XCTAssertEqual(unset.day, "")
        XCTAssertNil(unset.days)
        XCTAssertEqual(unset.state, .unset)
        XCTAssertEqual(unset.phrase, "No date set")
        XCTAssertEqual(unset.detail, "Pick a day to begin")
    }

    func testMarksAPassedDayOverdueAndIncludesAKeptTimeInTheDetail() {
        let overdue = reading(card(["date": "2026-07-20", "time": "09:30", "includeTime": true, "mode": "deadline"]))
        XCTAssertEqual(overdue.days, -6)
        XCTAssertEqual(overdue.state, .overdue)
        XCTAssertEqual(overdue.skin, "deadline")
        XCTAssertTrue(overdue.detail.contains("·"))
        XCTAssertTrue(overdue.detail.hasPrefix("Monday"), overdue.detail)
        XCTAssertTrue(overdue.detail.contains("20 July 2026"), overdue.detail)
        XCTAssertEqual(overdue.phrase, "6 days ago")
    }

    func testIgnoresAHalfTypedTimeRatherThanPrintingIt() {
        XCTAssertFalse(reading(card(["time": "9:3", "includeTime": true])).detail.contains("·"))
        XCTAssertFalse(reading(card(["time": "09:30", "includeTime": false])).detail.contains("·"))
    }

    func testReadsTodayAsDueAndTheTextHelpers() {
        let today = reading(card(["date": "2026-07-26"]))
        XCTAssertEqual(today.days, 0)
        XCTAssertEqual(today.state, .today)
        XCTAssertEqual(today.phrase, "Today")
        XCTAssertEqual(DateSkinModel.monthOfDay("2026-07-26"), 7)
        XCTAssertNil(DateSkinModel.monthOfDay("nope"))
        XCTAssertEqual(DateSkinModel.weekdayText("2026-07-26", locale: Locale(identifier: "en_GB")), "Sun")
        XCTAssertEqual(DateSkinModel.shortDayText("2026-07-26", locale: Locale(identifier: "en_GB")), "26 Jul")
        XCTAssertEqual(DateSkinModel.mediumDayText("2026-07-26", locale: Locale(identifier: "en_GB")), "26 Jul 2026")
        XCTAssertEqual(DateSkinModel.timeText("14:30", locale: Locale(identifier: "en_GB")), "14:30")
        XCTAssertEqual(DateSkinModel.timeText("9:3"), "")
    }

    // MARK: skin state isolation

    func testKeepsOneSkinsSpecialistFieldsWhenAnotherIsWorn() {
        let withRange = DateSkinModel.dataWithDateState(card(["mode": "range"]), "range", ["end": "2026-08-02"])
        let withMilestone = DateSkinModel.dataWithDateState(withRange.assigning("mode", "milestone"), "milestone", ["owner": "Ada", "status": "active"])
        XCTAssertEqual(withMilestone.object("skinStates")?.object("range"), ["end": "2026-08-02"])
        XCTAssertEqual(withMilestone.object("skinStates")?.object("milestone"), ["owner": "Ada", "status": "active"])
        XCTAssertEqual(withMilestone.string("date"), card().string("date"))
        XCTAssertEqual(withMilestone.string("mode"), "milestone")
    }

    func testDropsAClearedFieldInsteadOfPersistingAnEmptyString() {
        let set = DateSkinModel.dataWithDateState(card(["mode": "milestone"]), "milestone", ["owner": "Ada"])
        let cleared = DateSkinModel.dataWithDateState(set, "milestone", ["owner": ""])
        XCTAssertFalse(cleared.contains("skinStates"))
        XCTAssertEqual(JSONWriter.stringify(.object(cleared)), JSONWriter.stringify(.object(card(["mode": "milestone"]))))
    }

    // MARK: the field clock

    func testTheFieldGettersReadTheInstalledClock() {
        FieldClock.now = .fixed(ms: now)
        defer { FieldClock.reset() }
        let data = card(["date": "1998-09-04", "mode": "anniversary"])
        XCTAssertEqual(fieldDescriptor("date_picker", "days_until")!.get(data), .number(40))
        XCTAssertEqual(fieldDescriptor("date_picker", "next_occurrence")!.get(data), .text("2026-09-04"))
        XCTAssertEqual(fieldDescriptor("date_picker", "is_due")!.get(data), .bool(false))
        XCTAssertEqual(fieldDescriptor("date_picker", "is_due")!.get(card(["date": "2020-01-01", "mode": "deadline"])), .bool(true))
        XCTAssertEqual(fieldDescriptor("date_picker", "duration_days")!.get(ranged()), .number(6))
        XCTAssertEqual(fieldDescriptor("date_picker", "duration_days")!.get(card()), .number(0))
        // `countdown` still reads as the Deadline skin through the port.
        XCTAssertEqual(fieldDescriptor("date_picker", "days_until")!.get(card(["mode": "countdown"])), fieldDescriptor("date_picker", "days_until")!.get(card(["mode": "deadline"])))
        FieldClock.reset()
        XCTAssertEqual(text(fieldDescriptor("date_picker", "next_occurrence")!.get(card(["date": "2000-02-29", "mode": "anniversary"]))).count, 10)
    }
}
