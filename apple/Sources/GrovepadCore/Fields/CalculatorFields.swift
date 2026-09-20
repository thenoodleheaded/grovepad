import Foundation

// ---------------------------------------------------------------------------
// Calculator fields (`widgets/fields/dataMediaFields.ts`, `calculator`).
// `result` first, then one writable slot per named-value position on the
// Named Variables skin. Writing a slot re-evaluates the expression in the
// same step, so `result` is never one write stale. Field order IS port-slot
// order.
// ---------------------------------------------------------------------------

enum CalculatorFields {
    static let tables: [String: [FieldDescriptor]] = [
        "calculator": [
            FieldDescriptor(
                key: "result", label: "Result", valueType: .number,
                get: { data in .number(num(data["result"])) }
            ),
        ] + (0..<CalculatorSkinModel.variableLimit).map { index in
            FieldDescriptor(
                key: "variable_\(index + 1)", label: "Named value \(index + 1)", valueType: .number,
                get: { data in
                    let variables = CalculatorSkinModel.namedVariables(data.object("skinStates")?.object("named_variables")?["variables"])
                    return .number(index < variables.count ? variables[index].value : 0)
                },
                set: { data, value, _ in
                    // `data.skinStates?.named_variables ?? {}`: a pocket that is
                    // not a record has no `variables`, so there is no target.
                    guard let state = data.object("skinStates")?.object("named_variables") else { return data }
                    let variables = CalculatorSkinModel.namedVariables(state["variables"])
                    guard index < variables.count else { return data }
                    var next = variables
                    next[index].value = num(value)
                    let expression = data.str("expression")
                    let result = JavaScript.trim(expression).isEmpty
                        ? ""
                        : CalculatorSkinModel.safeResult {
                            try CalculatorSkinModel.evaluateExpression(expression, variables: CalculatorSkinModel.variableBindings(next))
                        }
                    var skinStates = data.object("skinStates") ?? JSONObject()
                    skinStates["named_variables"] = .object(state.assigning("variables", .array(next.map(\.json))))
                    return data.assigning("result", .string(result)).assigning("skinStates", .object(skinStates))
                }
            )
        },
    ]
}
