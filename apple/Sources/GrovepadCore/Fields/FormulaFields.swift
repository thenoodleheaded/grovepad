import Foundation

// ---------------------------------------------------------------------------
// Formula fields (`widgets/fields/inputLogicFields.ts`, `formula`). Field
// order IS port-slot order: `a`, `b`, `result`, then `c`…`f` (appended after
// `result` so every existing board keeps A, B and Result on the rail slots
// it drew them at), then `valid`.
// ---------------------------------------------------------------------------

enum FormulaFields {
    static let tables: [String: [FieldDescriptor]] = [
        "formula": [
            FieldDescriptor(
                key: "a", label: "Input A", valueType: .number,
                get: { $0.fieldValue("a", default: .number(0)) },
                set: { data, value, _ in data.assigning("a", .number(num(value))) }
            ),
            FieldDescriptor(
                key: "b", label: "Input B", valueType: .number,
                get: { $0.fieldValue("b", default: .number(0)) },
                set: { data, value, _ in data.assigning("b", .number(num(value))) }
            ),
            // The published answer is whatever the worn skin asks of the card's
            // inputs; one owner computes it for the card, the tile and this port.
            FieldDescriptor(
                key: "result", label: "Result", valueType: .number,
                get: { data in .number(FormulaSkinModel.value(data)) }
            ),
        ] + ["c", "d", "e", "f"].map { key in
            FieldDescriptor(
                key: key, label: "Input \(key.uppercased())", valueType: .number,
                // `d[key] ?? 0`: null and missing read as 0; anything else as itself.
                get: { data in
                    guard let raw = data[key], !raw.isNull else { return .number(0) }
                    return FieldValue(loose: raw) ?? .number(0)
                },
                set: { data, value, _ in FormulaSkinModel.dataWithInputValue(data, key, num(value)) }
            )
        } + [
            FieldDescriptor(
                key: "valid", label: "Answerable", valueType: .boolean,
                get: { data in .bool(FormulaSkinModel.isValid(data)) }
            ),
        ],
    ]
}
