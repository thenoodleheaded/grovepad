import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Formula (`components/widgets/modules/FormulaWidget.tsx`,
// `formulaSkinModel.ts`, `restingFaces/numeric.ts formulaRestingFace`). Up
// to six named numbers, every one a circuit port, and seven questions asked
// of them. `FormulaSkinModel.reading` is the only calculation: the card, the
// tile and the `result` port all read it. Every input value is written
// through its field setter (`fieldDescriptor("formula", key).set`), names
// and the rack size through the model's own writers, and every write spreads
// the worn skin last (`write`). The skin field is `skin`.
//
// Ported skins: two_input (operator chain), percent_change, ratio, growth,
// expression (the written expression in its pocket). weighted_score and
// conditional show the rack and the model's answer with a note; their
// weights, comparator and branches are read from their pockets, not edited.
// ---------------------------------------------------------------------------

public struct FormulaWidget: WidgetRenderer {
    public static let type = "formula"

    public init() {}

    static func skin(_ data: JSONObject) -> String { FormulaSkinModel.skinMode(data["skin"]) }

    static func write(_ context: WidgetCardContext, skin: String, _ mutate: @escaping (inout JSONObject) -> Void) {
        context.update { data in
            mutate(&data)
            data["skin"] = .string(skin)
        }
    }

    static func setValue(_ context: WidgetCardContext, skin: String, key: String, _ value: Double) {
        write(context, skin: skin) { data in
            if let setter = fieldDescriptor("formula", key)?.set {
                data = setter(data, .number(value), context.mint)
            }
        }
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = FormulaWidget.skin(data)
        let inputs = FormulaSkinModel.inputs(data)
        let reading = FormulaSkinModel.reading(data)
        let accent = Color(hex: context.accent)
        let state = data.skinState(skin)
        return VStack(alignment: .leading, spacing: 6) {
            CardTextField("Label", text: data.str("label")) { next in
                FormulaWidget.write(context, skin: skin) { $0["label"] = .string(next) }
            }
            .foregroundStyle(.secondary)
            if skin == "weighted_score" || skin == "conditional" {
                SkinNote("The \(skin.replacingOccurrences(of: "_", with: " ")) skin's weights and branches are read from the card; editing them arrives later.")
            }
            // The rack: every input stays on screen and editable — a wire
            // writes them, and a card that hid one could not be corrected by hand.
            ForEach(inputs, id: \.key) { input in
                HStack(spacing: 6) {
                    Text(input.letter).font(GlassType.label).monospacedDigit().foregroundStyle(accent).frame(width: 14)
                    CardTextField("Name \(input.letter)", text: input.name) { next in
                        FormulaWidget.write(context, skin: skin) { $0 = FormulaSkinModel.dataWithInputName($0, input.key, next) }
                    }
                    .foregroundStyle(.secondary)
                    CardTextField("Value \(input.letter)", text: JavaScript.numberString(input.value)) { next in
                        let parsed = JavaScript.parseFloat(next)
                        if parsed.isFinite { FormulaWidget.setValue(context, skin: skin, key: input.key, parsed) }
                    }
                    .multilineTextAlignment(.trailing)
                    .frame(width: 84)
                }
            }
            HStack(spacing: 8) {
                GhostButton("minus", label: "Remove the last input") {
                    FormulaWidget.write(context, skin: skin) { $0 = FormulaSkinModel.dataWithInputCount($0, Double(inputs.count - 1)) }
                }
                .disabled(inputs.count <= FormulaSkinModel.inputMin)
                if skin == "two_input" {
                    Picker("Operation", selection: Binding(get: { FormulaSkinModel.formulaOperator(data["operator"]) }, set: { next in
                        FormulaWidget.write(context, skin: skin) { $0["operator"] = .string(next) }
                    })) {
                        ForEach(FormulaSkinModel.operators, id: \.self) { op in
                            Text("\(FormulaSkinModel.operatorSymbol[op] ?? op)  \(FormulaSkinModel.operatorWord[op] ?? "")").tag(op)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    .frame(minHeight: GlassTokens.touchTarget)
                    .accessibilityLabel("Operation")
                } else if skin == "expression" {
                    CardTextField("Expression, e.g. a * b + c", text: FormulaSkinModel.expressionText(state)) { next in
                        FormulaWidget.write(context, skin: skin) { data in
                            var pocket = data.skinState(skin)
                            pocket["expression"] = .string(JavaScript.prefix(next, utf16Count: FormulaSkinModel.expressionLimit))
                            data.setSkinState(skin, pocket)
                        }
                    }
                    .font(.system(size: 13, design: .monospaced))
                } else {
                    Spacer(minLength: 0)
                }
                GhostButton("plus", label: "Add an input") {
                    FormulaWidget.write(context, skin: skin) { $0 = FormulaSkinModel.dataWithInputCount($0, Double(inputs.count + 1)) }
                }
                .disabled(inputs.count >= FormulaSkinModel.inputMax)
            }
            if skin == "ratio" {
                let shares = FormulaSkinModel.inputShares(inputs)
                HStack(spacing: 2) {
                    ForEach(Array(inputs.enumerated()), id: \.element.key) { index, _ in
                        Capsule().fill(accent.opacity(index == 0 ? 1 : 0.35)).frame(width: max(2, CGFloat(shares[index]) * 200), height: 4)
                    }
                }
            }
            if skin == "growth" {
                let projection = FormulaSkinModel.growthProjection(FormulaSkinModel.roleInput(inputs, state, "startKey", 0).value, FormulaSkinModel.roleInput(inputs, state, "rateKey", 1).value, periods: max(FormulaSkinModel.growthPeriods(state), 3))
                let peak = max(1, projection.map(abs).max() ?? 1)
                HStack(alignment: .bottom, spacing: 3) {
                    ForEach(Array(projection.enumerated()), id: \.offset) { index, value in
                        RoundedRectangle(cornerRadius: 2).fill(accent.opacity(index + 1 == FormulaSkinModel.growthPeriods(state) ? 1 : 0.4)).frame(maxWidth: .infinity).frame(height: max(2, CGFloat(abs(value) / peak) * 28))
                    }
                }
            }
            Well {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    GlassLabel(FormulaSkinModel.resultWord(skin)).frame(width: 70, alignment: .leading)
                    Text(FormulaSkinModel.answerText(data)).font(GlassType.hero).monospacedDigit().foregroundStyle(reading.note == nil ? accent : Color(hex: "#f59e0b")).lineLimit(1).minimumScaleFactor(0.5)
                    Spacer(minLength: 0)
                }
                if let note = reading.note {
                    Text(note).font(GlassType.label).foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `formulaRestingFace`: the chain as it is written over the answer; a
    /// ratio as its pair (or the shares as bars, because a split of four
    /// cannot be said as "3 : 1"); a change as before → after; growth and
    /// weights as bars of their size.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        guard let a = data.finite("a"), let b = data.finite("b") else { return .icon }
        let skin = FormulaWidget.skin(data)
        let reading = FormulaSkinModel.reading(data)
        let inputs = FormulaSkinModel.inputs(data)
        let state = data.skinState(skin)
        let answer = "\(RestText.number(reading.value))\(reading.suffix)"
        let answerTone: RestTone = reading.note == nil ? .accent : .warn
        switch skin {
        case "ratio":
            let part = FormulaSkinModel.roleInput(inputs, state, "partKey", 0)
            if inputs.count == 2 {
                let simplified = FormulaSkinModel.simplifiedRatio(a, b)
                return .split(
                    left: RestReadout(primary: RestText.number(simplified?.left ?? a), secondary: inputs[0].title, tone: .accent),
                    right: RestReadout(primary: RestText.number(simplified?.right ?? b), secondary: inputs[1].title),
                    divider: ":",
                    eyebrow: RestEyebrow(label: "Ratio", note: answer)
                )
            }
            let shares = FormulaSkinModel.inputShares(inputs)
            return .bars(bars: inputs.prefix(RestingFaceMeasure.barLimit).enumerated().map { index, input in
                RestBar(key: input.key, label: RestText.compact(input.title, 18), value: "\(RestText.number(jsRound(shares[index] * 100)))%", fraction: RestText.fraction(shares[index]), tone: input.key == part.key ? nil : .muted)
            }, eyebrow: RestEyebrow(label: "Ratio", note: answer))
        case "percent_change":
            let from = FormulaSkinModel.roleInput(inputs, state, "fromKey", 0)
            let to = FormulaSkinModel.roleInput(inputs, state, "toKey", 1)
            let rising = reading.value > 0
            return .split(
                left: RestReadout(primary: RestText.number(from.value), secondary: "Was"),
                right: RestReadout(primary: RestText.number(to.value), secondary: "Now", tone: rising ? .good : .bad),
                divider: "→",
                eyebrow: RestEyebrow(label: "Percent change", note: "\(rising ? "+" : "")\(answer)", tone: reading.value == 0 ? .muted : rising ? .good : .bad)
            )
        case "growth":
            // Where the same rate takes the value — the projection IS the skin.
            let start = FormulaSkinModel.roleInput(inputs, state, "startKey", 0)
            let rate = FormulaSkinModel.roleInput(inputs, state, "rateKey", 1)
            let periods = FormulaSkinModel.growthPeriods(state)
            let projection = Array(FormulaSkinModel.growthProjection(start.value, rate.value, periods: max(RestingFaceMeasure.barLimit, periods)).prefix(RestingFaceMeasure.barLimit))
            let peak = max(1, projection.map(abs).max() ?? 1)
            return .bars(bars: projection.enumerated().map { index, value in
                RestBar(key: "period-\(index)", label: "Period \(index + 1)", value: RestText.number(value), fraction: abs(value) / peak, tone: index + 1 == periods ? nil : .muted)
            }, eyebrow: RestEyebrow(label: "Growth", note: "\(RestText.number(rate.value))%"))
        case "weighted_score":
            let rows = FormulaSkinModel.weightedRows(data)
            let weight = rows.reduce(0.0) { $0 + $1.weight }
            return .bars(bars: rows.prefix(RestingFaceMeasure.barLimit).map { row in
                RestBar(key: row.id, label: RestText.compact(row.label, 18), value: "×\(RestText.number(row.weight))", fraction: weight == 0 ? 0 : RestText.fraction(row.weight / weight), tone: row.canonical ? nil : .muted)
            }, eyebrow: RestEyebrow(label: "Weighted score", note: answer))
        case "conditional":
            let comparator = FormulaSkinModel.comparator(state)
            let left = FormulaSkinModel.roleInput(inputs, state, "leftKey", 0)
            let right = FormulaSkinModel.roleInput(inputs, state, "rightKey", 1)
            let branches = FormulaSkinModel.conditionalBranches(state, FormulaSkinModel.bindings(inputs))
            let holds = FormulaSkinModel.comparisonHolds(left.value, right.value, comparator)
            return .metric(
                primary: answer, secondary: holds ? "Condition met" : "Condition not met",
                eyebrow: RestEyebrow(label: "\(left.title) \(FormulaSkinModel.comparatorSymbol[comparator] ?? comparator) \(right.title)", note: "\(RestText.number(branches.whenTrue)) / \(RestText.number(branches.whenFalse))"),
                tone: holds ? .good : .muted
            )
        case "expression":
            let source = FormulaSkinModel.expressionText(state)
            return .lines(
                lines: [
                    RestLine(key: "source", left: RestText.compact(source.isEmpty ? "A + B" : source, 24), dim: true),
                    RestLine(key: "inputs", left: RestText.compact(inputs.map { "\($0.title) \(RestText.number($0.value))" }.joined(separator: "   "), 30), dim: true),
                ],
                eyebrow: RestEyebrow(label: "Expression", note: reading.note == nil ? nil : "!"),
                mono: true,
                total: RestLine(key: "result", left: "=", right: answer, tone: answerTone)
            )
        default:
            // two_input: the chain as it is written, over the answer.
            let symbol = FormulaSkinModel.operatorSymbol[FormulaSkinModel.formulaOperator(data["operator"])] ?? "+"
            return .lines(
                lines: [RestLine(key: "sum", left: RestText.compact(inputs.map { RestText.number($0.value) }.joined(separator: " \(symbol) "), 30), dim: true)],
                eyebrow: RestEyebrow(label: FormulaSkinModel.resultWord(skin)),
                mono: true,
                total: RestLine(key: "result", left: "=", right: answer, tone: answerTone)
            )
        }
    }
}
