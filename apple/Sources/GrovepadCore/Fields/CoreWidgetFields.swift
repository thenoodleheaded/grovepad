import Foundation

// ---------------------------------------------------------------------------
// Everyday widget fields (`widgets/fields/coreWidgetFields.ts`): text,
// counter, rating, checklist, goal_tracker, habit, timekeeper. One entry per
// field in the TypeScript order — field order IS port-slot order.
// ---------------------------------------------------------------------------

enum CoreWidgetFields {
    static let tables: [String: [FieldDescriptor]] = [
        "text": [
            FieldDescriptor(
                key: "text", label: "Text", valueType: .text,
                get: { $0.fieldValue("text", default: .text("")) },
                set: { data, value, _ in data.assigning("text", .string(text(value))) }
            ),
        ],
        "counter": [
            FieldDescriptor(
                key: "count", label: "Count", valueType: .number, unit: .count,
                get: { $0.fieldValue("count", default: .number(0)) },
                set: { data, value, _ in data.assigning("count", .number(num(value))) }
            ),
        ],
        "rating": [
            FieldDescriptor(
                key: "value", label: "Rating", valueType: .number,
                get: { $0.fieldValue("value", default: .number(0)) },
                set: { data, value, _ in data.assigning("value", .number(Swift.min(5, Swift.max(0, jsRound(num(value)))))) }
            ),
        ],
        "checklist": [
            FieldDescriptor(
                key: "done_count", label: "Done count", valueType: .number, unit: .count,
                get: { data in .number(Double(data.records("items").filter { JavaScript.truthy($0["done"]) }.count)) }
            ),
            FieldDescriptor(
                key: "all_done", label: "All done", valueType: .boolean,
                get: { data in
                    let items = data.records("items")
                    return .bool(!items.isEmpty && items.allSatisfy { JavaScript.truthy($0["done"]) })
                }
            ),
        ],
        "goal_tracker": [
            FieldDescriptor(
                key: "percent", label: "Progress %", valueType: .number, unit: .percent,
                get: { goal in .number(goalPercent(goal)) },
                set: { goal, value, _ in
                    var simple = JSONObject()
                    simple["label"] = goalSimpleLabel(goal)
                    simple["percent"] = .number(Swift.min(100, Swift.max(0, jsRound(num(value)))))
                    return goal.assigning("simple", .object(simple))
                }
            ),
            FieldDescriptor(
                key: "complete", label: "Complete", valueType: .boolean,
                get: { goal in .bool(goalComplete(goal)) }
            ),
        ],
        "habit": [
            FieldDescriptor(
                key: "streak", label: "Days done", valueType: .number, unit: .count,
                get: { data in .number(Double(data.items("days").filter { JavaScript.truthy($0) }.count)) }
            ),
        ],
        "timekeeper": [
            FieldDescriptor(
                key: "running", label: "Running", valueType: .boolean,
                get: { data in .bool(timekeeperRunning(data)) }
            ),
            FieldDescriptor(
                key: "mode", label: "Mode", valueType: .text,
                get: { $0.fieldValue("mode", default: .text("")) }
            ),
            FieldDescriptor(
                key: "days_left", label: "Days left", valueType: .number, unit: .count, timeSensitive: true,
                get: { data in .number(deadlineDaysLeft(data)) }
            ),
            FieldDescriptor(
                key: "days_until", label: "Days until", valueType: .number, unit: .count, timeSensitive: true,
                get: { data in .number(deadlineDaysLeft(data)) }
            ),
            FieldDescriptor(
                key: "sessions_done", label: "Sessions done", valueType: .number, unit: .count,
                get: { data in (data.object("pomodoro") ?? JSONObject()).fieldValue("completed", default: .number(0)) }
            ),
            FieldDescriptor(
                key: "completed", label: "Completed sessions", valueType: .number, unit: .count,
                get: { data in (data.object("pomodoro") ?? JSONObject()).fieldValue("completed", default: .number(0)) }
            ),
            FieldDescriptor(
                key: "primary_time", label: "Primary time", valueType: .text, timeSensitive: true,
                get: { data in .text(primaryZoneTime(worldClockZones(data))) }
            ),
            FieldDescriptor(
                key: "zone_count", label: "Time zones", valueType: .number, unit: .count,
                get: { data in .number(Double((data.object("worldClock")?.array("zones") ?? []).count)) }
            ),
        ],
    ]

    // MARK: goal_tracker

    static func goalPercent(_ goal: JSONObject) -> Double {
        let mode = goal.string("mode")
        if mode == "simple" { return goal.object("simple")?.number("percent") ?? 0 }
        if mode == "hours" {
            guard let hours = goal.object("hours"), hours.dbl("targetHours") > 0 else { return 0 }
            return Swift.min(100, jsRound(hours.dbl("loggedHours") / hours.dbl("targetHours") * 100))
        }
        if mode == "okr" {
            let results = goal.object("okr")?.records("keyResults") ?? []
            var weight = results.reduce(0.0) { $0 + Swift.max(0, $1.dbl("weight")) }
            if weight == 0 { weight = 1 } // `|| 1`
            let sum = results.reduce(0.0) { sum, item in
                sum + Swift.min(1, Swift.max(0, item.dbl("current") / Swift.max(1, item.dbl("target")))) * Swift.max(0, item.dbl("weight"))
            }
            return sum / weight * 100
        }
        let milestones = goal.records("milestones")
        if milestones.isEmpty { return 0 }
        let done = milestones.filter { JavaScript.truthy($0["done"]) }.count
        return jsRound(Double(done) / Double(milestones.count) * 100)
    }

    static func goalComplete(_ goal: JSONObject) -> Bool {
        let mode = goal.string("mode")
        if mode == "simple" { return (goal.object("simple")?.number("percent") ?? 0) >= 100 }
        if mode == "hours" {
            guard let hours = goal.object("hours") else { return false }
            return hours.dbl("targetHours") > 0 && hours.dbl("loggedHours") >= hours.dbl("targetHours")
        }
        if mode == "okr" {
            let results = goal.object("okr")?.records("keyResults") ?? []
            return !results.isEmpty && results.allSatisfy { $0.dbl("current") >= $0.dbl("target") }
        }
        let milestones = goal.records("milestones")
        return !milestones.isEmpty && milestones.allSatisfy { JavaScript.truthy($0["done"]) }
    }

    /// `(goal.simple?.label ?? goal.goal) || 'Progress'` — `??` falls through
    /// null and missing, `||` falls through every falsy value.
    static func goalSimpleLabel(_ goal: JSONObject) -> JSONValue {
        let label = JavaScript.coalesce(goal.object("simple")?["label"], goal["goal"])
        return JavaScript.truthy(label) ? label! : .string("Progress")
    }

    // MARK: timekeeper

    static func timekeeperRunning(_ data: JSONObject) -> Bool {
        let mode = data.string("mode") ?? ""
        // `x.endAt !== null`: a missing slot is `undefined`, which is not null.
        func notNull(_ object: JSONObject?, _ key: String) -> Bool {
            guard let object else { return false } // the web would throw here
            return object[key].map { !$0.isNull } ?? true
        }
        switch mode {
        case "pomodoro": return notNull(data.object("pomodoro"), "endAt")
        case "stopwatch", "lap_timer": return notNull(data.object("stopwatch"), "startedAt")
        case "intervals", "tabata", "multi_stage_timer":
            return data.object("skinStates")?.object(mode)?.number("endAt") != nil
        case "deadline", "world_clock", "chess_clock": return false
        default: return notNull(data.object("countdown"), "endAt")
        }
    }

    static func worldClockZones(_ data: JSONObject) -> [String] {
        (data.object("worldClock")?.array("zones") ?? []).compactMap(\.stringValue)
    }

    /// `Math.ceil((new Date(`${target}T00:00:00`).getTime() - Date.now()) / 86_400_000) || 0`.
    /// A descriptor getter has no clock parameter, so this reads the system
    /// clock and the current calendar/time zone, exactly as the web reads
    /// `Date.now()` and the browser's local zone. Unparseable targets are 0.
    static func deadlineDaysLeft(_ data: JSONObject) -> Double {
        guard let target = data.object("deadline")?.string("targetDate"), !target.isEmpty else { return 0 }
        guard let midnight = localMidnight(ofDayKey: target) else { return 0 }
        let millis = (midnight.timeIntervalSince1970 * 1000).rounded(.down) - (Date().timeIntervalSince1970 * 1000).rounded(.down)
        let days = (millis / 86_400_000).rounded(.up)
        return days.isFinite && days != 0 ? days : 0
    }

    /// `new Date("YYYY-MM-DDT00:00:00")` — a date-time form without an offset
    /// is local time.
    static func localMidnight(ofDayKey key: String) -> Date? {
        let parts = key.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3, let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]) else { return nil }
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = 0
        components.minute = 0
        components.second = 0
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone.current
        guard calendar.date(from: components) != nil, month >= 1, month <= 12, day >= 1, day <= 31 else { return nil }
        return calendar.date(from: components)
    }

    /// `primaryZoneTime`: the first zone's clock as `en-GB` HH:mm, or `--:--`.
    static func primaryZoneTime(_ zones: [String]) -> String {
        guard let zone = zones.first, let timeZone = TimeZone(identifier: zone) else { return "--:--" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_GB")
        formatter.timeZone = timeZone
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: Date())
    }

    /// `isValidTimeZone`: whether the platform knows the identifier.
    static func isValidTimeZone(_ zone: String) -> Bool {
        TimeZone(identifier: zone) != nil
    }
}
