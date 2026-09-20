import Foundation

// ---------------------------------------------------------------------------
// Input and logic widget fields (`widgets/fields/inputLogicFields.ts`):
// text_input, number_input, toggle, status. `formula` and `date_picker`
// depend on skin models and are deferred (see AGENTS.md). Field order IS
// port-slot order.
// ---------------------------------------------------------------------------

enum InputLogicFields {
    static let legalStatuses: Set<String> = ["not_started", "in_progress", "blocked", "done"]

    static let tables: [String: [FieldDescriptor]] = [
        "text_input": [
            FieldDescriptor(
                key: "value", label: "Text value", valueType: .text,
                get: { $0.fieldValue("value", default: .text("")) },
                set: { data, value, _ in data.assigning("value", .string(text(value))) }
            ),
            FieldDescriptor(
                key: "has_value", label: "Has value", valueType: .boolean,
                get: { data in .bool(!data.trimmed("value").isEmpty) }
            ),
        ],
        "number_input": [
            FieldDescriptor(
                key: "value", label: "Number value", valueType: .number,
                get: { $0.fieldValue("value", default: .number(0)) },
                set: { data, value, _ in
                    let lo = Swift.min(data.dbl("min"), data.dbl("max"))
                    let hi = Swift.max(data.dbl("min"), data.dbl("max"))
                    return data.assigning("value", .number(Swift.min(hi, Swift.max(lo, num(value)))))
                }
            ),
        ],
        "toggle": [
            FieldDescriptor(
                key: "value", label: "On / off", valueType: .boolean,
                get: { $0.fieldValue("value", default: .bool(false)) },
                set: { data, value, _ in data.assigning("value", .bool(bool(value))) }
            ),
        ],
        "status": [
            FieldDescriptor(
                key: "status", label: "Status", valueType: .text,
                get: { $0.fieldValue("value", default: .text("")) },
                set: { data, value, _ in
                    let status = text(value)
                    return legalStatuses.contains(status) ? data.assigning("value", .string(status)) : data
                }
            ),
            FieldDescriptor(
                key: "progress", label: "Progress %", valueType: .number, unit: .percent,
                get: { data in
                    let status = data.string("value")
                    return .number(status == "done" ? 100 : (status == "in_progress" || status == "blocked") ? 50 : 0)
                }
            ),
            FieldDescriptor(
                key: "complete", label: "Complete", valueType: .boolean,
                get: { data in .bool(data.string("value") == "done") }
            ),
        ],
    ]
}
