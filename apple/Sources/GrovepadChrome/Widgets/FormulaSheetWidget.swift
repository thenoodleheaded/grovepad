import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Formula Sheet (`components/widgets/modules/FormulaSheetWidget.tsx`,
// `formulaSheetSkinModel.ts`, `restingFaces/catalog.ts formulaSheetFace`).
// One shelf of named formulas `{ id, name, expression }`, six ways to hold
// it; the skin field is `skin` (absent on a fresh card; reference_sheet is
// the default).
//
// reference_sheet, equation_cards and exam_strip are drawn: the ledger, the
// deck (one island a formula, the equation leading) and the numbered strip.
// derivation, unit_aware and worked_example are schema extensions and render
// the ledger with a note; their pockets (steps, units, values, openId) are
// preserved, read by the resting face where the port can, and cleaned when
// a formula is removed (`dataWithoutFormula`). The unit checker and the
// example evaluator are not ported: those two skins fold to the plain
// ledger face.
// ---------------------------------------------------------------------------

public struct FormulaSheetWidget: WidgetRenderer {
    public static let type = "formula_sheet"
    static let skins = ["reference_sheet", "equation_cards", "exam_strip", "derivation", "unit_aware", "worked_example"]
    static let extensionSkins: Set<String> = ["derivation", "unit_aware", "worked_example"]
    static let lineLimit = 5
    static let maxFormulas = 160

    static let meta: [String: (label: String, hint: String)] = [
        "reference_sheet": ("Reference sheet", "Look it up fast"),
        "equation_cards": ("Equation cards", "One equation at a time"),
        "exam_strip": ("Exam strip", "Everything on one page"),
        "derivation": ("Derivation", "How the result was reached"),
        "unit_aware": ("Unit check", "Both sides must agree"),
        "worked_example": ("Worked example", "Numbers in, answer out"),
    ]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "reference_sheet"
    }

    struct Formula {
        var id: String
        var name: String
        var expression: String
    }

    /// `formulaSheetItems`.
    static func formulas(_ data: JSONObject) -> [Formula] {
        (data.array("formulas") ?? []).prefix(maxFormulas).enumerated().compactMap { index, raw in
            guard let record = raw.objectValue else { return nil }
            let id = record.str("id")
            return Formula(id: id.isEmpty ? "formula-\(index)" : id, name: record.str("name"), expression: record.str("expression"))
        }
    }

    static func isWritten(_ formula: Formula) -> Bool {
        !JavaScript.trim(formula.name).isEmpty || !JavaScript.trim(formula.expression).isEmpty
    }

    /// `formulaSubject`: the single symbol on the left of the first `=`.
    static func subject(_ expression: String) -> String {
        guard let equals = expression.firstIndex(of: "=") else { return "" }
        let left = JavaScript.trim(String(expression[..<equals]))
        let isSymbol = !left.isEmpty && left.unicodeScalars.allSatisfy { CharacterSet.letters.contains($0) || CharacterSet.decimalDigits.contains($0) || $0 == "_" } && !(left.first?.isNumber ?? true)
        return isSymbol ? left : ""
    }

    /// `formulaDerivationSteps`: the ladder one formula holds in its pocket.
    static func derivationSteps(_ data: JSONObject, id: String) -> [String] {
        (data.skinState("derivation").object("steps")?.array(id) ?? []).prefix(40).compactMap { $0.stringValue }.map { String($0.prefix(240)) }
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = FormulaSheetWidget.skin(data)
        let formulas = FormulaSheetWidget.formulas(data)
        let accent = Color(hex: context.accent)
        let meta = FormulaSheetWidget.meta[skin] ?? FormulaSheetWidget.meta["reference_sheet"]!
        let written = formulas.filter(FormulaSheetWidget.isWritten).count
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 0) {
                    GlassLabel(meta.label)
                    Text(meta.hint).font(GlassType.label).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Text(written > 0 ? "\(written)" : "—").font(GlassType.label).monospacedDigit().foregroundStyle(.secondary)
            }
            if FormulaSheetWidget.extensionSkins.contains(skin) {
                NotesSkinNote("Shown as the reference sheet — the \(meta.label.lowercased()) working arrives later.")
            }
            if formulas.isEmpty {
                FlowButton("Add your first formula", symbol: "plus", accent: accent) { add(context, skin: skin) }
            }
            ForEach(Array(formulas.enumerated()), id: \.element.id) { index, formula in
                if skin == "equation_cards" {
                    Island(padding: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                nameField(context, skin: skin, formula: formula, placeholder: "Untitled")
                                RowDeleteButton(label: "Remove \(formula.name.isEmpty ? "formula" : formula.name)") { remove(context, skin: skin, id: formula.id) }
                            }
                            expressionField(context, skin: skin, formula: formula).font(GlassType.value)
                            let subject = FormulaSheetWidget.subject(formula.expression)
                            if !subject.isEmpty {
                                Text("solves for \(subject)").font(GlassType.label).foregroundStyle(.secondary)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                } else {
                    HStack(spacing: 6) {
                        if skin == "exam_strip" {
                            Text("\(index + 1)").font(GlassType.label).monospacedDigit().foregroundStyle(.secondary).frame(width: 16, alignment: .trailing)
                        }
                        nameField(context, skin: skin, formula: formula, placeholder: skin == "exam_strip" ? "Title" : "Name this formula…")
                            .frame(maxWidth: 120)
                        expressionField(context, skin: skin, formula: formula)
                        RowDeleteButton(label: "Remove \(formula.name.isEmpty ? "formula" : formula.name)") { remove(context, skin: skin, id: formula.id) }
                    }
                }
            }
            HStack {
                FlowButton("Add formula", symbol: "plus", accent: accent) { add(context, skin: skin) }
                Spacer(minLength: 0)
                Text(skin == "derivation" ? "Enter adds a step" : skin == "unit_aware" ? "Name a unit for each symbol" : skin == "worked_example" ? "Open one to work it out" : "Name it, then write it")
                    .font(GlassType.label).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func nameField(_ context: WidgetCardContext, skin: String, formula: Formula, placeholder: String) -> some View {
        CardTextField(placeholder, text: formula.name) { next in
            context.update { data in
                data.patchRecord(in: "formulas", id: formula.id) { $0["name"] = .string(next) }
                data["skin"] = .string(skin)
            }
        }
        .accessibilityLabel("Formula name")
    }

    private func expressionField(_ context: WidgetCardContext, skin: String, formula: Formula) -> some View {
        CardTextField("a² + b² = c²", text: formula.expression) { next in
            context.update { data in
                data.patchRecord(in: "formulas", id: formula.id) { $0["expression"] = .string(next) }
                data["skin"] = .string(skin)
            }
        }
        .font(.system(size: 13, weight: .medium, design: .monospaced))
        .accessibilityLabel("Expression for \(formula.name.isEmpty ? "this formula" : formula.name)")
    }

    private func add(_ context: WidgetCardContext, skin: String) {
        let id = context.mint()
        context.update { data in
            var record = JSONObject()
            record["id"] = .string(id)
            record["name"] = .string("")
            record["expression"] = .string("")
            data.appendRecord(in: "formulas", record)
            data["skin"] = .string(skin)
        }
    }

    /// `dataWithoutFormula`: the formula and its steps, units, values and
    /// open state leave every pocket.
    private func remove(_ context: WidgetCardContext, skin: String, id: String) {
        context.update { data in
            data.removeRecord(in: "formulas", id: id)
            data.removeFromEverySkinPocket(id: id, in: ["steps", "units", "values"])
            if let states = data.object("skinStates") {
                for skinKey in states.keys where states.object(skinKey)?.string("openId") == id {
                    data.patchSkinState(skinKey) { _ = $0.removeValue(forKey: "openId") }
                }
            }
            data["skin"] = .string(skin)
        }
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `formulaSheetFace`: the deck leads with the equation, the ledgers with
    /// the name (the strip keeps its numbers), as monospaced lines; a written
    /// derivation is the ladder itself — its steps, landing on the result.
    /// Unit verdicts and worked answers are not computed.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let formulas = FormulaSheetWidget.formulas(data)
        if formulas.isEmpty { return .icon }
        let skin = FormulaSheetWidget.skin(data)

        if skin == "derivation", let derived = formulas.first(where: { !FormulaSheetWidget.derivationSteps(data, id: $0.id).isEmpty }) {
            let steps = FormulaSheetWidget.derivationSteps(data, id: derived.id)
            let shown = steps.prefix(max(1, RestingFaceMeasure.nodeLimit - 1))
            var nodes = shown.enumerated().map { index, step in RestNode(key: "\(derived.id)-step-\(index)", label: RestText.compact(step, 20)) }
            let result = derived.expression.isEmpty ? (derived.name.isEmpty ? "Result" : derived.name) : derived.expression
            nodes.append(RestNode(key: "\(derived.id)-result", label: RestText.compact(result, 20), caption: derived.name.isEmpty ? nil : RestText.compact(derived.name, 18)))
            return NotesAndStudyFamily.dressed(.chain(nodes: nodes, shape: .linear, overflow: max(0, steps.count - shown.count)), type: FormulaSheetWidget.type, data: data)
        }

        let leadsWithExpression = skin == "equation_cards"
        let lines = formulas.prefix(RestingFaceMeasure.lineLimit).enumerated().map { index, formula -> RestLine in
            let name = RestText.compact(formula.name, 16)
            let expression = RestText.compact(formula.expression, leadsWithExpression ? 20 : 18)
            if leadsWithExpression {
                let subject = FormulaSheetWidget.subject(formula.expression)
                return RestLine(key: formula.id, left: expression.isEmpty ? (name.isEmpty ? "Formula" : name) : expression, right: !subject.isEmpty && !expression.isEmpty ? RestText.compact(subject, 8) : nil)
            }
            let numbered = skin == "exam_strip" ? "\(index + 1). " : ""
            return RestLine(key: formula.id, left: numbered + (name.isEmpty ? "Formula" : name), right: expression.isEmpty ? nil : expression)
        }
        return NotesAndStudyFamily.dressed(.lines(lines: lines, mono: true), type: FormulaSheetWidget.type, data: data)
    }
}
