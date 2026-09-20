import Foundation

// ---------------------------------------------------------------------------
// Inline widget commands (`widgets/fields/coreCommands.ts`), in the
// TypeScript key order — a command's position after the settable fields IS
// its input-port slot. Every command spreads the card's own data (assigns in
// place) so the worn skin and any unknown keys ride along untouched.
// ---------------------------------------------------------------------------

enum CoreCommands {
    /// `text(payload ?? '').trim()`.
    static func payloadText(_ payload: FieldValue?) -> String {
        JavaScript.trim(text(payload ?? .text("")))
    }

    /// `text(payload ?? '').trim() || fallback`.
    static func payloadText(_ payload: FieldValue?, or fallback: String) -> String {
        let trimmed = payloadText(payload)
        return trimmed.isEmpty ? fallback : trimmed
    }

    static let tables: [String: [CommandDescriptor]] = [
        "timekeeper": [
            CommandDescriptor(key: "reset", label: "Reset current timer") { data, _, _ in timekeeperReset(data) },
            CommandDescriptor(key: "add_zone", label: "Add timezone from wire", acceptsPayload: true) { data, payload, _ in
                let zone = payloadText(payload)
                let zones = CoreWidgetFields.worldClockZones(data)
                if zone.isEmpty || zones.contains(zone) || !CoreWidgetFields.isValidTimeZone(zone) { return data }
                var worldClock = JSONObject()
                worldClock["zones"] = .array((data.object("worldClock")?.array("zones") ?? []) + [.string(zone)])
                return data.assigning("worldClock", .object(worldClock))
            },
        ],
        "counter": [
            CommandDescriptor(key: "increment", label: "Increment counter") { data, _, _ in
                data.assigning("count", .number(data.dbl("count") + counterStep(data)))
            },
            CommandDescriptor(key: "decrement", label: "Decrement counter") { data, _, _ in
                data.assigning("count", .number(data.dbl("count") - counterStep(data)))
            },
            CommandDescriptor(key: "reset", label: "Reset counter") { data, _, _ in data.assigning("count", .number(0)) },
        ],
        "checklist": [
            CommandDescriptor(key: "uncheck_all", label: "Uncheck all tasks") { data, _, _ in
                data.mappingRecords("items") { $0.assigning("done", .bool(false)).assigning("status", .string("todo")) }
            },
            CommandDescriptor(key: "check_all", label: "Check all tasks") { data, _, _ in
                data.mappingRecords("items") { $0.assigning("done", .bool(true)).assigning("status", .string("done")) }
            },
            CommandDescriptor(key: "add_item", label: "Add task from wire", acceptsPayload: true) { data, payload, mint in
                var item = JSONObject()
                item["id"] = .string(mint())
                item["label"] = .string(payloadText(payload, or: "New task"))
                item["done"] = .bool(false)
                item["status"] = .string("todo")
                return data.assigning("items", .array(data.items("items") + [.object(item)]))
            },
        ],
        "bullets": [
            CommandDescriptor(key: "add_item", label: "Add bullet from wire", acceptsPayload: true) { data, payload, mint in
                var item = JSONObject()
                item["id"] = .string(mint())
                item["text"] = .string(payloadText(payload, or: "New item"))
                return data.assigning("items", .array(data.items("items") + [.object(item)]))
            },
        ],
        "links": [
            CommandDescriptor(key: "add_item", label: "Add link from wire", acceptsPayload: true) { data, payload, mint in
                let value = payloadText(payload)
                let looksLikeUrl = looksLikeHttpUrl(value)
                var item = JSONObject()
                item["id"] = .string(mint())
                item["label"] = .string(looksLikeUrl ? "" : value)
                item["url"] = .string(looksLikeUrl ? value : "")
                return data.assigning("items", .array(data.items("items") + [.object(item)]))
            },
        ],
        "decision": [
            CommandDescriptor(key: "add_item", label: "Add option from wire", acceptsPayload: true) { data, payload, _ in
                data.assigning("options", .array(data.items("options") + [.string(payloadText(payload, or: "New option"))]))
            },
        ],
        "rating": [
            CommandDescriptor(key: "reset", label: "Clear rating") { data, _, _ in data.assigning("value", .number(0)) },
        ],
        "habit": [
            CommandDescriptor(key: "reset", label: "Clear the week") { data, _, _ in
                data.assigning("days", .array(Array(repeating: .bool(false), count: 7))).assigning("streak", .number(0))
            },
        ],
        "mood_tracker": [
            CommandDescriptor(key: "reset", label: "Clear the week") { data, _, _ in
                data.assigning("days", .array(Array(repeating: .null, count: 7)))
            },
        ],
        "flashcards": [
            CommandDescriptor(key: "increment", label: "Next card") { data, _, _ in
                let count = Double(data.items("cards").count)
                if count == 0 { return data }
                return data.assigning("current", .number(jsRemainder(data.dbl("current") + 1, count)))
            },
            CommandDescriptor(key: "decrement", label: "Previous card") { data, _, _ in
                let count = Double(data.items("cards").count)
                if count == 0 { return data }
                return data.assigning("current", .number(jsRemainder(data.dbl("current") - 1 + count, count)))
            },
        ],
        "meeting_notes": [
            CommandDescriptor(key: "uncheck_all", label: "Reopen all actions") { data, _, _ in
                data.mappingRecords("actions") { $0.assigning("done", .bool(false)) }
            },
        ],
        "goal_tracker": [
            // Inherited from the retired Progress card; it belongs to the Simple skin.
            CommandDescriptor(key: "reset", label: "Reset to 0%") { goal, _, _ in
                var simple = JSONObject()
                simple["label"] = CoreWidgetFields.goalSimpleLabel(goal)
                simple["percent"] = .number(0)
                return goal.assigning("simple", .object(simple))
            },
            CommandDescriptor(key: "uncheck_all", label: "Reset milestones") { data, _, _ in
                data.mappingRecords("milestones") { $0.assigning("done", .bool(false)) }
            },
            CommandDescriptor(key: "check_all", label: "Complete all milestones") { data, _, _ in
                data.mappingRecords("milestones") { $0.assigning("done", .bool(true)) }
            },
        ],
        "reading_list": [
            CommandDescriptor(key: "reset", label: "Re-queue everything") { data, _, _ in
                data.mappingRecords("items") { $0.assigning("status", .string("queued")) }
            },
        ],
        "number_input": [
            CommandDescriptor(key: "increment", label: "Increase by step") { data, _, _ in
                data.assigning("value", .number(Swift.min(data.dbl("max"), data.dbl("value") + numberInputStep(data))))
            },
            CommandDescriptor(key: "decrement", label: "Decrease by step") { data, _, _ in
                data.assigning("value", .number(Swift.max(data.dbl("min"), data.dbl("value") - numberInputStep(data))))
            },
            CommandDescriptor(key: "reset", label: "Reset to minimum") { data, _, _ in
                data.assigning("value", data["min"] ?? .number(0))
            },
        ],
        "toggle": [
            CommandDescriptor(key: "reset", label: "Switch off") { data, _, _ in data.assigning("value", .bool(false)) },
        ],
        "status": [
            CommandDescriptor(key: "reset", label: "Reset status") { data, _, _ in data.assigning("value", .string("not_started")) },
            CommandDescriptor(key: "check_all", label: "Mark done") { data, _, _ in data.assigning("value", .string("done")) },
        ],
    ]

    /// `Number.isFinite(c.step) && c.step !== 0 ? c.step : 1`.
    static func counterStep(_ data: JSONObject) -> Double {
        guard let step = data.number("step"), step.isFinite, step != 0 else { return 1 }
        return step
    }

    /// `Math.max(0.0001, Math.abs(value.step))`.
    static func numberInputStep(_ data: JSONObject) -> Double {
        Swift.max(0.0001, abs(data.dbl("step")))
    }

    /// `/^https?:\/\//i`.
    static func looksLikeHttpUrl(_ value: String) -> Bool {
        let lower = value.lowercased()
        return lower.hasPrefix("http://") || lower.hasPrefix("https://")
    }

    static func timekeeperReset(_ data: JSONObject) -> JSONObject {
        let mode = data.string("mode") ?? ""
        switch mode {
        case "pomodoro":
            var pomodoro = data.object("pomodoro") ?? JSONObject()
            pomodoro["phase"] = .string("work")
            pomodoro["endAt"] = .null
            pomodoro["remainingSeconds"] = .number(pomodoro.dbl("workMinutes") * 60)
            pomodoro["completed"] = .number(0)
            return data.assigning("pomodoro", .object(pomodoro))
        case "stopwatch", "lap_timer":
            var stopwatch = JSONObject()
            stopwatch["elapsedMs"] = .number(0)
            stopwatch["startedAt"] = .null
            stopwatch["laps"] = .array([])
            return data.assigning("stopwatch", .object(stopwatch))
        case "intervals", "tabata", "chess_clock", "multi_stage_timer":
            var skinStates = data.object("skinStates") ?? JSONObject()
            skinStates[mode] = .object(JSONObject())
            return data.assigning("skinStates", .object(skinStates))
        case "deadline", "world_clock":
            return data
        default:
            var countdown = data.object("countdown") ?? JSONObject()
            countdown["remainingSeconds"] = countdown["durationSeconds"] ?? .number(0)
            countdown["endAt"] = .null
            return data.assigning("countdown", .object(countdown))
        }
    }
}
