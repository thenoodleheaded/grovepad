import Foundation

// ---------------------------------------------------------------------------
// Study widget fields (`widgets/fields/studyFields.ts`): grade_calc,
// formula_sheet, citation. Plus the outline table, which the web keeps in
// `professionalFields.ts`. Field order IS port-slot order.
// ---------------------------------------------------------------------------

enum StudyFields {
    static let tables: [String: [FieldDescriptor]] = [
        "grade_calc": [
            FieldDescriptor(
                key: "grade", label: "Grade %", valueType: .number, unit: .percent,
                get: { data in
                    let components = data.records("components")
                    let weight = totalWeight(components)
                    if weight <= 0 { return .number(0) }
                    return .number(jsRound(weightedSum(components) / weight * 10) / 10)
                }
            ),
            FieldDescriptor(
                key: "passing", label: "Passing", valueType: .boolean,
                get: { data in
                    let components = data.records("components")
                    let weight = totalWeight(components)
                    if weight <= 0 { return .bool(false) }
                    return .bool(weightedSum(components) / weight >= 60)
                }
            ),
            FieldDescriptor(
                key: "gpa", label: "GPA", valueType: .number,
                get: { data in
                    let courses = data.object("gpa")?.records("courses") ?? []
                    let credits = courses.reduce(0.0) { $0 + $1.dbl("credits") }
                    guard credits > 0 else { return .number(0) }
                    return .number(courses.reduce(0.0) { $0 + $1.dbl("credits") * $1.dbl("points") } / credits)
                }
            ),
        ],
        "formula_sheet": [
            FieldDescriptor(
                key: "count", label: "Formulas", valueType: .number,
                get: { data in
                    .number(Double(data.records("formulas").filter { !$0.trimmed("name").isEmpty || !$0.trimmed("expression").isEmpty }.count))
                }
            ),
        ],
        "citation": [
            FieldDescriptor(
                key: "count", label: "Sources", valueType: .number,
                get: { data in .number(Double(data.records("sources").filter { !$0.trimmed("title").isEmpty }.count)) }
            ),
        ],
        "outline": [
            FieldDescriptor(
                key: "item_count", label: "Items", valueType: .number,
                get: { data in .number(Double(data.records("items").filter { !$0.trimmed("text").isEmpty }.count)) }
            ),
            FieldDescriptor(
                key: "top_level_count", label: "Top-level items", valueType: .number,
                get: { data in
                    // `item.depth === 0`: strictly the number zero.
                    .number(Double(data.records("items").filter { $0.number("depth") == 0 && !$0.trimmed("text").isEmpty }.count))
                }
            ),
        ],
    ]

    static func totalWeight(_ components: [JSONObject]) -> Double {
        components.reduce(0.0) { $0 + $1.finiteOrZero("weight") }
    }

    static func weightedSum(_ components: [JSONObject]) -> Double {
        components.reduce(0.0) { $0 + $1.finiteOrZero("score") * $1.finiteOrZero("weight") }
    }
}
