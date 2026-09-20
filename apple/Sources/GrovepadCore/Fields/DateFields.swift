import Foundation

// ---------------------------------------------------------------------------
// Date picker fields (`widgets/fields/inputLogicFields.ts`, `date_picker`).
// Field order IS port-slot order.
//
// Distance is measured to the day the worn skin actually points at, so an
// Anniversary or a Recurring Date reports its NEXT occurrence rather than a
// first occasion in the past. The open card, the folded face and the wire
// all read the same `DateSkinModel.reading`, so they can never disagree.
//
// The four clock getters read `FieldClock` (the web reads `Date.now()`
// inline) and do local-day arithmetic in `TimeZone.current`, which is why
// their pack expectations depend on the generating machine's zone.
// ---------------------------------------------------------------------------

enum DateFields {
    static let tables: [String: [FieldDescriptor]] = [
        "date_picker": [
            FieldDescriptor(
                key: "date", label: "Date", valueType: .text, unit: .dateISO,
                get: { $0.fieldValue("date", default: .text("")) },
                set: { data, value, _ in data.assigning("date", .string(text(value))) }
            ),
            FieldDescriptor(
                key: "days_until", label: "Days until", valueType: .number, unit: .count, timeSensitive: true,
                get: { data in .number(DateSkinModel.reading(data).days ?? 0) }
            ),
            FieldDescriptor(
                key: "is_due", label: "Is due", valueType: .boolean, timeSensitive: true,
                get: { data in
                    let days = DateSkinModel.reading(data).days
                    return .bool(days != nil && days! <= 0)
                }
            ),
            FieldDescriptor(
                key: "next_occurrence", label: "Next occurrence", valueType: .text, unit: .dateISO, timeSensitive: true,
                get: { data in .text(DateSkinModel.reading(data).day) }
            ),
            // Only a Range has a length; every other skin marks a point in time.
            FieldDescriptor(
                key: "duration_days", label: "Duration (days)", valueType: .number, unit: .count, timeSensitive: true,
                get: { data in .number(DateSkinModel.durationDays(data) ?? 0) }
            ),
        ],
    ]
}
