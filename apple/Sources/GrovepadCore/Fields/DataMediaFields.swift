import Foundation

// ---------------------------------------------------------------------------
// Data, board and media widget fields (`widgets/fields/dataMediaFields.ts`)
// for the in-scope types: bar_chart, meeting_notes, pros_cons, decision,
// bullets, table, links, code, metrics, calendar, mood_tracker,
// reading_list, flashcards. `calculator` is deferred with its skin model.
// Field order IS port-slot order.
// ---------------------------------------------------------------------------

enum DataMediaFields {
    static let tables: [String: [FieldDescriptor]] = [
        "bar_chart": [
            FieldDescriptor(
                key: "total", label: "Total", valueType: .number, unit: .count,
                get: { data in .number(data.records("bars").reduce(0.0) { $0 + $1.finiteOrZero("value") }) }
            ),
            FieldDescriptor(
                key: "series", label: "Series", valueType: .series,
                get: { data in
                    .series(data.records("bars").enumerated().map { index, bar in SeriesPoint(t: Double(index), v: bar.dbl("value")) })
                },
                set: { data, value, mint in
                    guard case .series(let points) = value else { return data }
                    return data.assigning("bars", .array(rebuiltBars(existing: data.records("bars"), points: points, mint: mint)))
                }
            ),
            FieldDescriptor(
                key: "latest", label: "Latest value", valueType: .number,
                get: { data in
                    guard let last = data.records("bars").last, let value = last["value"], !value.isNull else { return .number(0) }
                    return FieldValue(loose: value) ?? .number(0)
                }
            ),
            FieldDescriptor(
                key: "average", label: "Average", valueType: .number,
                get: { data in
                    let bars = data.records("bars")
                    guard !bars.isEmpty else { return .number(0) }
                    return .number(bars.reduce(0.0) { $0 + $1.dbl("value") } / Double(bars.count))
                }
            ),
        ],
        "meeting_notes": [
            FieldDescriptor(
                key: "actions_done", label: "Actions done", valueType: .boolean,
                get: { data in
                    let actions = data.records("actions")
                    return .bool(!actions.isEmpty && actions.allSatisfy { JavaScript.truthy($0["done"]) })
                }
            ),
        ],
        "pros_cons": [
            FieldDescriptor(
                key: "pros_count", label: "Pros", valueType: .number, unit: .count,
                get: { data in .number(Double(data.records("pros").filter { !$0.trimmed("text").isEmpty }.count)) }
            ),
            FieldDescriptor(
                key: "cons_count", label: "Cons", valueType: .number, unit: .count,
                get: { data in .number(Double(data.records("cons").filter { !$0.trimmed("text").isEmpty }.count)) }
            ),
        ],
        "decision": [
            FieldDescriptor(
                key: "picked", label: "Picked option", valueType: .text,
                get: { data in
                    // `pickedIndex !== null ? (options[pickedIndex] ?? '') : ''`
                    guard let picked = data["pickedIndex"], !picked.isNull else { return .text("") }
                    let options = data.items("options")
                    // `options[pickedIndex]` is a property lookup: ANY index
                    // it cannot find answers `undefined`, hence `''`. Compare
                    // as a Double before converting — `Int(1e20)` traps, and
                    // `{"pickedIndex": 1e20}` is valid JSON a board can carry.
                    guard let index = picked.numberValue, index == index.rounded(),
                          index >= 0, index < Double(options.count) else { return .text("") }
                    return .text(options[Int(index)].stringValue ?? "")
                }
            ),
        ],
        "bullets": [
            FieldDescriptor(
                key: "count", label: "Items", valueType: .number, unit: .count,
                get: { data in .number(Double(data.records("items").filter { !$0.trimmed("text").isEmpty }.count)) }
            ),
        ],
        "table": [
            FieldDescriptor(
                key: "row_count", label: "Rows", valueType: .number, unit: .count,
                get: { data in .number(Double(Swift.max(0, data.items("rows").count - 1))) }
            ),
        ],
        "links": [
            FieldDescriptor(
                key: "count", label: "Links", valueType: .number, unit: .count,
                get: { data in .number(Double(data.records("items").filter { !$0.trimmed("url").isEmpty || !$0.trimmed("label").isEmpty }.count)) }
            ),
        ],
        "code": [
            FieldDescriptor(
                key: "code", label: "Code", valueType: .text,
                get: { $0.fieldValue("code", default: .text("")) },
                set: { data, value, _ in data.assigning("code", .string(text(value))) }
            ),
        ],
        "metrics": [
            FieldDescriptor(
                key: "value_1", label: "Tile 1 value", valueType: .number,
                get: { data in
                    guard let first = data.records("tiles").first else { return .number(0) }
                    return .number(num(first["value"]))
                },
                set: { data, value, _ in
                    guard !data.records("tiles").isEmpty else { return data }
                    var copy = data
                    copy["tiles"] = .array(data.items("tiles").enumerated().map { index, tile in
                        index == 0 ? .object((tile.objectValue ?? JSONObject()).assigning("value", .string(JavaScript.numberString(num(value))))) : tile
                    })
                    return copy
                }
            ),
        ],
        "calendar": [
            FieldDescriptor(
                key: "marked_count", label: "Marked days", valueType: .number, unit: .count,
                get: { data in .number(Double(data.items("markedDates").count)) }
            ),
            // `localDayKey()`: the calendar day in the user's local zone. A
            // descriptor getter has no clock parameter, so this reads the
            // system clock, as the web reads `Date.now()`.
            FieldDescriptor(
                key: "today", label: "Today", valueType: .text, unit: .dateISO, timeSensitive: true,
                get: { _ in .text(localDayKey()) }
            ),
        ],
        "mood_tracker": [
            FieldDescriptor(
                key: "logged_count", label: "Days logged", valueType: .number, unit: .count,
                get: { data in .number(Double(data.items("days").filter { !$0.isNull }.count)) }
            ),
        ],
        "reading_list": [
            FieldDescriptor(
                key: "done_count", label: "Read", valueType: .number, unit: .count,
                get: { data in .number(Double(data.records("items").filter { $0.string("status") == "done" }.count)) }
            ),
        ],
        "flashcards": [
            FieldDescriptor(
                key: "card_count", label: "Cards", valueType: .number, unit: .count,
                get: { deck in
                    let mode = deck.string("mode")
                    if mode == "vocabulary" { return .number(Double(deck.object("vocabulary")?.items("terms").count ?? 0)) }
                    if mode == "quiz" { return .number(Double(deck.object("quiz")?.items("options").count ?? 0)) }
                    return .number(Double(deck.items("cards").count))
                }
            ),
        ],
    ]

    /// `v.slice(-400).map((point, index) => ({ id, label, color, value }))`.
    /// `color` is copied only when the source bar has the slot: the web emits
    /// `color: undefined` for a missing one and `JSON.stringify` drops it, so
    /// omitting the key is the same bytes.
    static func rebuiltBars(existing: [JSONObject], points: [SeriesPoint], mint: IdMinter) -> [JSONValue] {
        points.suffix(400).enumerated().map { index, point in
            let source: JSONObject? = index < existing.count ? existing[index] : nil
            var bar = JSONObject()
            bar["id"] = JavaScript.coalesce(source?["id"], nil) ?? .string(mint())
            bar["label"] = JavaScript.coalesce(source?["label"], nil) ?? .string(String(index + 1))
            if let color = source?["color"] { bar["color"] = color }
            bar["value"] = .number(point.v)
            return .object(bar)
        }
    }
}

/// `localDayKey()` (`utils/localDate.ts`): `yyyy-MM-dd` in the local zone.
///
/// One rule, one implementation: `DateSkinModel.localDayKey`. This used to
/// keep its own copy over `Calendar.current`, which follows the user's
/// REGION CALENDAR — a reader whose region calendar is Buddhist got
/// `"2569-09-10"` from `calendar.today` and `"2026-09-10"` from
/// `date_picker.next_occurrence` for the same instant. JavaScript's
/// `Date.getFullYear()` is always proleptic Gregorian, so both must be.
public func localDayKey(at date: Date = Date()) -> String {
    DateSkinModel.localDayKey(date)
}
