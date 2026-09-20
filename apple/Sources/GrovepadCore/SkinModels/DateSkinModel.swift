import Foundation

// ---------------------------------------------------------------------------
// Date skin model (`components/widgets/modules/dateSkinModel.ts`).
//
// One day, seven questions. `DatePickerData.date` is the single canonical
// day; Anniversary and Recurring Date DERIVE their next occurrence, Range
// stores only the far end beside the skin, Deadline only its runway.
//
// Every calculation is local-calendar arithmetic: a day key is `YYYY-MM-DD`
// in the user's own time zone, distances are measured between local
// midnights and rounded, so a daylight-saving boundary inside a span can
// never turn three days into two days and twenty-three hours. The zone is
// `TimeZone.current`, exactly as the web reads the browser's zone; the clock
// is the `now` argument, defaulting to `FieldClock` (the web's `Date.now()`).
//
// Not ported: the locale-rendered `phrase`/`detail` strings use
// `Intl.RelativeTimeFormat`/`Intl.DateTimeFormat` on the web; here they are
// English (`relativePhrase`) and `DateFormatter` over a given locale.
// ---------------------------------------------------------------------------

public enum DateSkinModel {
    public static let skins: [String] = ["date_time", "deadline", "relative_date", "anniversary", "range", "recurring_date", "milestone"]

    static let dayMs = 86_400_000.0
    static let maxDetail = 200
    static let maxLeadDays = 999.0
    static let maxInterval = 99.0
    /// A recurrence never walks further than this to find the next occurrence.
    static let maxRecurrenceSteps = 4_000

    /// The proleptic Gregorian calendar in the current zone — what a
    /// JavaScript `Date` computes local components with.
    static var calendar: Calendar {
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = TimeZone.current
        return calendar
    }

    /// The worn skin. `countdown` was the old second mode of this card and
    /// meant "a day I am counting down to", so it reads back as `deadline`.
    public static func skinMode(_ raw: JSONValue?) -> String {
        guard let value = raw?.stringValue else { return "date_time" }
        if value == "countdown" { return "deadline" }
        return skins.contains(value) ? value : "date_time"
    }

    // MARK: - Days

    /// `localDayKey(ms)`: `YYYY-MM-DD` of an instant in the current zone.
    public static func localDayKey(_ ms: Double) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: Date(timeIntervalSince1970: ms / 1000))
        return "\(parts.year ?? 0)-\(JavaScript.pad2(parts.month ?? 0))-\(JavaScript.pad2(parts.day ?? 0))"
    }

    static func localDayKey(_ date: Date) -> String {
        localDayKey(date.timeIntervalSince1970 * 1000)
    }

    static func isDayKeyShape(_ day: String) -> Bool {
        let units = Array(day.utf16)
        guard units.count == 10 else { return false }
        for (index, unit) in units.enumerated() {
            if index == 4 || index == 7 {
                if unit != 0x2D { return false }
            } else if unit < 0x30 || unit > 0x39 {
                return false
            }
        }
        return true
    }

    /// Local midnight for a day key, or nil when the key is not a real
    /// calendar day: `new Date(2026, 1, 31)` rolls forward to March, so the
    /// parts are read back to reject a day that does not exist. Years below
    /// 100 are rejected too — `new Date(99, 0, 1)` is 1999 on the web.
    public static func dayStart(_ day: String?) -> Date? {
        guard let day, isDayKeyShape(day) else { return nil }
        let year = Int(day.prefix(4))!
        let month = Int(day.dropFirst(5).prefix(2))!
        let date = Int(day.dropFirst(8).prefix(2))!
        if year < 100 { return nil }
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = date
        let calendar = calendar
        guard let parsed = calendar.date(from: components) else { return nil }
        let back = calendar.dateComponents([.year, .month, .day], from: parsed)
        guard back.year == year, back.month == month, back.day == date else { return nil }
        return parsed
    }

    /// A stored day, or "" when the card holds nothing usable.
    public static func dateDay(_ raw: JSONValue?) -> String {
        guard let day = raw?.stringValue, dayStart(day) != nil else { return "" }
        return day
    }

    /// A stored 24-hour time (`^([01]\d|2[0-3]):[0-5]\d$`), or "".
    public static func dateTime(_ raw: JSONValue?) -> String {
        guard let time = raw?.stringValue else { return "" }
        let units = Array(time.utf16)
        guard units.count == 5, units[2] == 0x3A, units.allSatisfy({ $0 == 0x3A || ($0 >= 0x30 && $0 <= 0x39) }) else { return "" }
        let hour = Int(time.prefix(2))!
        let minute = Int(time.dropFirst(3))!
        return hour <= 23 && minute <= 59 ? time : ""
    }

    /// Whole calendar days from `from` to `to`, or nil if either is not a day.
    public static func daysBetween(_ from: String?, _ to: String?) -> Double? {
        guard let start = dayStart(from), let end = dayStart(to) else { return nil }
        return jsRound((end.timeIntervalSince1970 - start.timeIntervalSince1970) * 1000 / dayMs)
    }

    /// Whole calendar days from today to `day`. Negative once the day has passed.
    public static func daysUntilDay(_ day: String?, now: Double = FieldClock.nowMs()) -> Double? {
        daysBetween(localDayKey(now), day)
    }

    /// The same day moved by whole local calendar days.
    public static func shiftDay(_ day: String?, _ days: Double) -> String {
        guard let start = dayStart(day), days.isFinite, let whole = Int(exactly: JavaScript.trunc(days)) else { return "" }
        guard let moved = calendar.date(byAdding: .day, value: whole, to: start) else { return "" }
        return localDayKey(moved)
    }

    /// A day-of-month placed in another month, clamped to that month's length.
    public static func dayInMonth(_ year: Int, _ month: Int, _ day: Int) -> String {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = 1
        let calendar = calendar
        let lastOfMonth = calendar.date(from: components).flatMap { calendar.range(of: .day, in: .month, for: $0)?.count } ?? 31
        return "\(year)-\(JavaScript.pad2(month))-\(JavaScript.pad2(Swift.min(day, lastOfMonth)))"
    }

    static func parts(_ date: Date) -> (year: Int, month: Int, day: Int) {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return (components.year ?? 0, components.month ?? 0, components.day ?? 0)
    }

    // MARK: - Language

    static func sentenceCase(_ text: String) -> String {
        guard let first = text.first else { return text }
        return String(first).uppercased() + text.dropFirst()
    }

    /// `Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(value, unit)`.
    static func relativeEnglish(_ value: Double, _ unit: String) -> String {
        if value == 0 { return unit == "day" ? "today" : "this \(unit)" }
        if value == 1 { return unit == "day" ? "tomorrow" : "next \(unit)" }
        if value == -1 { return unit == "day" ? "yesterday" : "last \(unit)" }
        let count = JavaScript.numberString(abs(value))
        return value > 0 ? "in \(count) \(unit)s" : "\(count) \(unit)s ago"
    }

    /// How far away a day reads out loud: "Today", "Tomorrow", "In 3 weeks",
    /// "2 months ago". English only; the web speaks the browser's locale.
    public static func relativePhrase(_ days: Double) -> String {
        if !days.isFinite { return "—" }
        let whole = JavaScript.trunc(days) == 0 ? 0 : JavaScript.trunc(days)
        let distance = abs(whole)
        if distance < 7 { return sentenceCase(relativeEnglish(whole, "day")) }
        if distance < 28 { return sentenceCase(relativeEnglish(jsRound(whole / 7), "week")) }
        if distance < 365 { return sentenceCase(relativeEnglish(jsRound(whole / 30), "month")) }
        return sentenceCase(relativeEnglish(jsRound(whole / 365), "year"))
    }

    static func formatDay(_ day: String, template: String, locale: Locale) -> String {
        guard let start = dayStart(day) else { return "" }
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = TimeZone.current
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: start)
    }

    /// "Friday, 4 September 2026" — the unambiguous long form.
    public static func longDayText(_ day: String, locale: Locale = .current) -> String {
        formatDay(day, template: "EEEEdMMMMy", locale: locale)
    }

    /// "4 Sep 2026" — the compact form used beside a hero reading.
    public static func mediumDayText(_ day: String, locale: Locale = .current) -> String {
        formatDay(day, template: "dMMMy", locale: locale)
    }

    /// "4 Sep" — for chips and rails where the year is already established.
    public static func shortDayText(_ day: String, locale: Locale = .current) -> String {
        formatDay(day, template: "dMMM", locale: locale)
    }

    /// "Fri" — the weekday alone.
    public static func weekdayText(_ day: String, locale: Locale = .current) -> String {
        formatDay(day, template: "EEE", locale: locale)
    }

    /// The month number (1–12) of a day, or nil.
    public static func monthOfDay(_ day: String) -> Int? {
        dayStart(day).map { parts($0).month }
    }

    /// "14:30" rendered the way the reader's locale writes a clock time.
    public static func timeText(_ time: String, locale: Locale = .current) -> String {
        let value = dateTime(.string(time))
        if value.isEmpty { return "" }
        var components = DateComponents()
        components.year = 2000
        components.month = 1
        components.day = 1
        components.hour = Int(value.prefix(2))!
        components.minute = Int(value.dropFirst(3))!
        guard let at = calendar.date(from: components) else { return "" }
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = TimeZone.current
        formatter.setLocalizedDateFormatFromTemplate("jmm")
        return formatter.string(from: at)
    }

    // MARK: - Skin states

    static func stateOf(_ data: JSONObject, _ skin: String) -> JSONObject {
        skinStateRecord(data, skin)
    }

    static func cleanDetail(_ raw: JSONValue?) -> String {
        guard let string = raw?.stringValue else { return "" }
        return JavaScript.prefix(string, utf16Count: maxDetail)
    }

    /// `dataWithDateState`: write one skin's optional state without touching
    /// the canonical day. Empty strings are dropped from the merged state (the
    /// web also drops `undefined`, which JSON cannot hold), an emptied pocket
    /// is removed, and an empty `skinStates` goes with it.
    public static func dataWithDateState(_ data: JSONObject, _ skin: String, _ patch: JSONObject) -> JSONObject {
        var next = stateOf(data, skin).merging(patch)
        for key in next.keys where next[key] == .string("") {
            next.removeValue(forKey: key)
        }
        return dataWithSkinState(data.assigning("mode", .string(skin)), skin, next)
    }

    /// `dataWithSkinState` (`utils/widgetSkins.ts`).
    static func dataWithSkinState(_ data: JSONObject, _ skin: String, _ state: JSONObject) -> JSONObject {
        var nextStates = data.object("skinStates") ?? JSONObject()
        if state.isEmpty { nextStates.removeValue(forKey: skin) } else { nextStates[skin] = .object(state) }
        if nextStates.isEmpty { return data.removing(["skinStates"]) }
        return data.assigning("skinStates", .object(nextStates))
    }

    // MARK: - Deadline

    public enum DeadlineUrgency: String {
        case overdue, due, urgent, soon, calm
    }

    public static let deadlineLeadChoices: [Double] = [7, 14, 30, 90]
    static let defaultLeadDays = 30.0

    /// The runway this deadline is measured against — "30 days out, 12 left".
    public static func deadlineLeadDays(_ data: JSONObject, skin: String = "deadline") -> Double {
        guard let raw = stateOf(data, skin).number("leadDays") else { return defaultLeadDays }
        let value = JavaScript.trunc(raw)
        return value.isFinite && value >= 1 ? Swift.min(value, maxLeadDays) : defaultLeadDays
    }

    public static func deadlineUrgency(_ days: Double?) -> DeadlineUrgency {
        guard let days else { return .calm }
        if days < 0 { return .overdue }
        if days == 0 { return .due }
        if days <= 2 { return .urgent }
        if days <= 7 { return .soon }
        return .calm
    }

    /// How much of the runway is spent, 0 → 1.
    public static func deadlineProgress(_ days: Double?, _ leadDays: Double) -> Double {
        guard let days, leadDays > 0 else { return 0 }
        let spent = (leadDays - days) / leadDays
        return Swift.min(1, Swift.max(0, spent))
    }

    // MARK: - Anniversary

    /// The next time this month and day comes round, counting today as next.
    public static func nextAnniversary(_ day: String?, now: Double = FieldClock.nowMs()) -> String {
        guard let start = dayStart(day) else { return "" }
        let today = localDayKey(now)
        let thisYear = Int(today.prefix(4)) ?? 0
        let (_, month, date) = parts(start)
        let candidate = dayInMonth(thisYear, month, date)
        return candidate >= today ? candidate : dayInMonth(thisYear + 1, month, date)
    }

    /// Which anniversary that occurrence is: the original day is the 0th.
    public static func anniversaryYears(_ day: String?, _ occurrence: String?) -> Int {
        guard let start = dayStart(day), let at = dayStart(occurrence) else { return 0 }
        return Swift.max(0, parts(at).year - parts(start).year)
    }

    // MARK: - Range

    public enum RangeState: String {
        case before, during, after
    }

    public struct RangeSpan: Equatable {
        /// Always the earlier day, whichever end the user typed it into.
        public let start: String
        public let end: String
        /// Nights between the two ends; a one-day range is 0 nights, 1 day.
        public let nights: Double
        public let days: Double
        /// Today's position inside the span, 0 → 1.
        public let progress: Double
        public let state: RangeState
    }

    /// The far end of the range, kept beside the skin rather than in the card.
    public static func rangeEndDay(_ data: JSONObject, skin: String = "range") -> String {
        dateDay(stateOf(data, skin)["end"])
    }

    /// The span between the canonical day and the range's far end, ordered
    /// before measuring so a back-to-front range reads as real nights.
    public static func rangeSpan(_ startDay: String, _ endDay: String, now: Double = FieldClock.nowMs()) -> RangeSpan? {
        guard dayStart(startDay) != nil, dayStart(endDay) != nil else { return nil }
        let (start, end) = startDay <= endDay ? (startDay, endDay) : (endDay, startDay)
        let nights = daysBetween(start, end) ?? 0
        let elapsed = daysBetween(start, localDayKey(now)) ?? 0
        let progress: Double = nights == 0
            ? (elapsed == 0 ? 1 : elapsed < 0 ? 0 : 1)
            : Swift.min(1, Swift.max(0, elapsed / nights))
        return RangeSpan(
            start: start, end: end, nights: nights, days: nights + 1, progress: progress,
            state: elapsed < 0 ? .before : elapsed > nights ? .after : .during
        )
    }

    // MARK: - Recurring date

    public enum RecurrenceUnit: String, CaseIterable {
        case day, week, month, year
    }

    public struct Recurrence: Equatable {
        public let unit: RecurrenceUnit
        /// How many units between occurrences, 1–99.
        public let interval: Double

        public init(unit: RecurrenceUnit, interval: Double) {
            self.unit = unit
            self.interval = interval
        }
    }

    public static func recurrenceOf(_ data: JSONObject, skin: String = "recurring_date") -> Recurrence {
        let state = stateOf(data, skin)
        let interval = state.number("interval").map(JavaScript.trunc) ?? 1
        return Recurrence(
            unit: state.string("unit").flatMap(RecurrenceUnit.init(rawValue:)) ?? .week,
            interval: interval.isFinite && interval >= 1 ? Swift.min(interval, maxInterval) : 1
        )
    }

    /// The nth occurrence of a rule that begins on `startDay`.
    static func occurrenceAt(_ startDay: String, _ rule: Recurrence, _ step: Int) -> String {
        guard let start = dayStart(startDay) else { return "" }
        let steps = rule.interval * Double(step)
        if rule.unit == .day { return shiftDay(startDay, steps) }
        if rule.unit == .week { return shiftDay(startDay, steps * 7) }
        // Months and years count from the original day-of-month every time, so
        // a rule that starts on the 31st does not creep to the 28th for good.
        let (startYear, startMonth, startDate) = parts(start)
        let monthIndex = startMonth - 1
        let month = rule.unit == .month ? monthIndex + Int(steps) : monthIndex
        let year = startYear + (rule.unit == .year ? Int(steps) : Int((Double(month) / 12).rounded(.down)))
        let normalizedMonth = rule.unit == .year ? monthIndex : ((month % 12) + 12) % 12
        return dayInMonth(year, normalizedMonth + 1, startDate)
    }

    /// The next `count` occurrences from today onwards, bounded.
    public static func recurrenceOccurrences(_ startDay: String, _ rule: Recurrence, count: Int = 4, now: Double = FieldClock.nowMs()) -> [String] {
        guard dayStart(startDay) != nil, count > 0 else { return [] }
        let today = localDayKey(now)
        var step = 0
        if rule.unit == .day || rule.unit == .week {
            // Fixed-length units land on the right step by division.
            let perStep = rule.interval * (rule.unit == .week ? 7 : 1)
            let elapsed = daysBetween(startDay, today) ?? 0
            if elapsed > 0 { step = Int((elapsed / perStep).rounded(.up)) }
        } else {
            var day = startDay
            while !day.isEmpty, day < today, step < maxRecurrenceSteps {
                step += 1
                day = occurrenceAt(startDay, rule, step)
            }
        }
        var found: [String] = []
        for index in 0..<count {
            let occurrence = occurrenceAt(startDay, rule, step + index)
            if occurrence.isEmpty { break }
            found.append(occurrence)
        }
        return found
    }

    /// The next occurrence alone — what a wire and a folded card both want.
    public static func nextRecurrence(_ startDay: String, _ rule: Recurrence, now: Double = FieldClock.nowMs()) -> String {
        recurrenceOccurrences(startDay, rule, count: 1, now: now).first ?? ""
    }

    /// "Every week", "Every 3 days".
    public static func recurrenceLabel(_ rule: Recurrence) -> String {
        let one = rule.unit.rawValue
        return rule.interval == 1 ? "Every \(one)" : "Every \(JavaScript.numberString(rule.interval)) \(one)s"
    }

    // MARK: - Milestone

    public enum MilestoneStatus: String, CaseIterable {
        case planned, active, at_risk, shipped

        public var label: String {
            switch self {
            case .planned: return "Planned"
            case .active: return "In progress"
            case .at_risk: return "At risk"
            case .shipped: return "Shipped"
            }
        }
    }

    public struct MilestoneDetail: Equatable {
        public let owner: String
        public let deliverable: String
        public let status: MilestoneStatus
    }

    public static func milestoneDetail(_ data: JSONObject, skin: String = "milestone") -> MilestoneDetail {
        let state = stateOf(data, skin)
        return MilestoneDetail(
            owner: cleanDetail(state["owner"]),
            deliverable: cleanDetail(state["deliverable"]),
            status: state.string("status").flatMap(MilestoneStatus.init(rawValue:)) ?? .planned
        )
    }

    // MARK: - The reading

    public enum DateState: String {
        case unset, overdue, today, upcoming
    }

    public struct Reading: Equatable {
        public let skin: String
        /// The day this card actually points at: the next occurrence for the
        /// repeating skins, the earlier end for a range, the stored day otherwise.
        public let day: String
        /// Whole calendar days from today to `day`; nil when no day is set.
        public let days: Double?
        /// The headline: "Today", "In 3 weeks", "2 months ago".
        public let phrase: String
        /// The second line: the day itself, with the time when the card keeps one.
        public let detail: String
        public let state: DateState
    }

    /// The one reading every consumer shares.
    public static func reading(_ data: JSONObject, now: Double = FieldClock.nowMs(), locale: Locale = .current) -> Reading {
        let skin = skinMode(data["mode"])
        let stored = dateDay(data["date"])
        let day: String
        switch skin {
        case "anniversary": day = nextAnniversary(stored, now: now)
        case "recurring_date": day = nextRecurrence(stored, recurrenceOf(data), now: now)
        case "range": day = rangeSpan(stored, rangeEndDay(data), now: now)?.start ?? stored
        default: day = stored
        }
        let days = day.isEmpty ? nil : daysUntilDay(day, now: now)
        let time = JavaScript.truthy(data["includeTime"]) ? dateTime(data["time"]) : ""
        let clock = time.isEmpty ? "" : " · \(timeText(time, locale: locale))"
        return Reading(
            skin: skin,
            day: day,
            days: days,
            phrase: days.map(relativePhrase) ?? "No date set",
            detail: day.isEmpty ? "Pick a day to begin" : longDayText(day, locale: locale) + clock,
            state: days.map { $0 < 0 ? .overdue : $0 == 0 ? .today : .upcoming } ?? .unset
        )
    }

    /// The nights a Range covers, for the wire that wants a duration. Nil on
    /// every other skin, which measures a point in time rather than a length.
    public static func durationDays(_ data: JSONObject, now: Double = FieldClock.nowMs()) -> Double? {
        guard skinMode(data["mode"]) == "range" else { return nil }
        return rangeSpan(dateDay(data["date"]), rangeEndDay(data), now: now)?.nights
    }
}
