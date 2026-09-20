import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Calculator (`components/widgets/modules/CalculatorWidget.tsx`,
// `calculatorSkinModel.ts`, `restingFaces/numeric.ts calculatorRestingFace`).
// `expression` and `result` are the canonical pair; every key press writes
// both at once (`commit`), the result evaluated by
// `CalculatorSkinModel.evaluateExpression` — the same evaluator the
// `variable_n` field setters re-run — so a tap and a wire never disagree.
// The skin field is `skin`.
//
// Ported skins: basic, scientific (function strip, RAD/DEG in its pocket),
// named_variables (the expression evaluated over the pocket's variables).
// tape, finance, programmer and date_math render the basic pad with a note
// and read their pockets for the folded face only.
// ---------------------------------------------------------------------------

public struct CalculatorWidget: WidgetRenderer {
    public static let type = "calculator"

    struct Key: Identifiable {
        var key: String
        var label: String? = nil
        var action: String? = nil
        var accent: Bool = false
        var id: String { key }
    }

    static let basicKeys: [Key] = [
        Key(key: "C", action: "clear"), Key(key: "("), Key(key: ")"), Key(key: "/"),
        Key(key: "7"), Key(key: "8"), Key(key: "9"), Key(key: "*"),
        Key(key: "4"), Key(key: "5"), Key(key: "6"), Key(key: "-"),
        Key(key: "1"), Key(key: "2"), Key(key: "3"), Key(key: "+"),
        Key(key: "0"), Key(key: "."), Key(key: "⌫", action: "back"), Key(key: "=", action: "equals", accent: true),
    ]
    static let scientificKeys: [Key] = [
        Key(key: "sin(", label: "sin"), Key(key: "cos(", label: "cos"), Key(key: "tan(", label: "tan"), Key(key: "ln(", label: "ln"), Key(key: "log(", label: "log"),
        Key(key: "sqrt(", label: "√"), Key(key: "^", label: "xʸ"), Key(key: "pi", label: "π"), Key(key: "e"), Key(key: "mod"),
    ]

    public init() {}

    static func skin(_ data: JSONObject) -> String { CalculatorSkinModel.skinMode(data["skin"]) }

    /// `write(expression)`: the expression and its answer, together.
    static func commit(_ context: WidgetCardContext, skin: String, _ expression: String) {
        context.update { data in
            let result = JavaScript.trim(expression).isEmpty ? "" : CalculatorWidget.evaluate(data, skin: skin, expression)
            data["expression"] = .string(expression)
            data["result"] = .string(result)
            data["skin"] = .string(skin)
        }
    }

    static func evaluate(_ data: JSONObject, skin: String, _ expression: String, angle override: CalculatorSkinModel.AngleUnit? = nil) -> String {
        let angle = override ?? CalculatorSkinModel.angleUnit(data.skinState("scientific")["angle"])
        let variables = skin == "named_variables" ? CalculatorSkinModel.variableBindings(CalculatorSkinModel.namedVariables(data.skinState("named_variables")["variables"])) : [:]
        return CalculatorSkinModel.safeResult { try CalculatorSkinModel.evaluateExpression(expression, variables: variables, angle: angle) }
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = CalculatorWidget.skin(data)
        let expression = data.str("expression")
        let result = data.str("result")
        let accent = Color(hex: context.accent)
        let press = { (key: Key) in
            switch key.action {
            case "clear": CalculatorWidget.commit(context, skin: skin, "")
            case "back": CalculatorWidget.commit(context, skin: skin, String(expression.dropLast()))
            case "equals": if !result.isEmpty, result != "Error" { CalculatorWidget.commit(context, skin: skin, result) }
            default: CalculatorWidget.commit(context, skin: skin, expression + key.key)
            }
        }
        return VStack(spacing: 6) {
            if !["basic", "scientific", "named_variables"].contains(skin) {
                SkinNote("Shown as the basic pad — the \(skin.replacingOccurrences(of: "_", with: " ")) skin arrives later.")
            }
            Well {
                VStack(alignment: .trailing, spacing: 0) {
                    CardTextField("Expression", text: expression) { next in CalculatorWidget.commit(context, skin: skin, next) }
                        .font(.system(size: 13, design: .monospaced))
                        .multilineTextAlignment(.trailing)
                        .foregroundStyle(.secondary)
                    Text(result.isEmpty ? "0" : result).font(GlassType.hero).monospacedDigit().foregroundStyle(result == "Error" ? Color(hex: "#f87171") : accent).lineLimit(1).minimumScaleFactor(0.5)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .accessibilityLabel("Result \(result.isEmpty ? "0" : result)")
                }
            }
            if skin == "scientific" {
                let angle = CalculatorSkinModel.angleUnit(data.skinState("scientific")["angle"])
                HStack(spacing: 4) {
                    ForEach([CalculatorSkinModel.AngleUnit.rad, .deg], id: \.rawValue) { unit in
                        ChoiceButton(text: unit.rawValue.uppercased(), selected: angle == unit, tint: accent) {
                            // Changing the unit re-reads the same expression, so the
                            // number on screen can never belong to the other unit.
                            context.update { data in
                                var pocket = data.skinState("scientific")
                                pocket["angle"] = .string(unit.rawValue)
                                data["result"] = .string(JavaScript.trim(expression).isEmpty ? "" : CalculatorWidget.evaluate(data, skin: skin, expression, angle: unit))
                                data["skin"] = .string(skin)
                                data.setSkinState("scientific", pocket)
                            }
                        }
                    }
                    // The scientific row wraps rather than scrolling sideways.
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 44), spacing: 4)], spacing: 4) {
                        ForEach(CalculatorWidget.scientificKeys) { key in
                            CalcKey(key: key, accent: accent) { press(key) }
                        }
                    }
                }
            }
            if skin == "named_variables" {
                let variables = CalculatorSkinModel.namedVariables(data.skinState("named_variables")["variables"])
                if variables.isEmpty {
                    SkinNote("No named values yet; a wire to variable 1–3 sets them.")
                } else {
                    HStack(spacing: 6) {
                        ForEach(variables, id: \.id) { variable in
                            Button { press(Key(key: variable.name)) } label: {
                                VStack(spacing: 0) {
                                    Text(variable.name).font(GlassType.label).foregroundStyle(accent)
                                    Text(RestText.number(variable.value)).font(GlassType.body).monospacedDigit()
                                }
                                .frame(maxWidth: .infinity, minHeight: 36)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Insert \(variable.name)")
                            .touchTarget()
                        }
                    }
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 4), spacing: 4) {
                ForEach(CalculatorWidget.basicKeys) { key in
                    CalcKey(key: key, accent: accent) { press(key) }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .top)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `calculatorRestingFace`: the display as a ledger — the expression that
    /// produced the answer over the answer itself; the tape's entries newest
    /// first with their Σ; the programmer's four bases; the variables' names
    /// and values; date math as its two dates. Finance keeps its answer as a
    /// metric (the web's recipe fields are not ported).
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let skin = CalculatorWidget.skin(data)
        let expression = data.str("expression")
        let result = data.str("result")
        switch skin {
        case "tape":
            let entries = (data.skinState("tape").array("entries") ?? []).compactMap(\.objectValue)
            if entries.isEmpty, expression.isEmpty { return .icon }
            // Newest at the top, the way an adding machine's paper reads once torn off.
            let visible = Array(entries.suffix(RestingFaceMeasure.lineLimit).reversed())
            let total = entries.reduce(0.0) { sum, entry in
                let value = Double(entry.str("result")) ?? 0
                return sum + (value.isFinite ? value : 0)
            }
            return .lines(
                lines: visible.enumerated().map { index, entry in
                    RestLine(key: entry.string("id") ?? "entry-\(index)", left: RestText.compact(entry.str("expression").isEmpty ? "—" : entry.str("expression"), 22), right: RestText.compact(entry.str("result"), 10), dim: index > 0)
                },
                eyebrow: RestEyebrow(label: "Tape", note: "\(entries.count) entries"),
                mono: true,
                total: RestLine(key: "total", left: "Σ", right: RestText.number(total), tone: .accent)
            )
        case "programmer":
            let base = ["dec", "hex", "oct", "bin"].contains(data.skinState("programmer").str("base")) ? data.skinState("programmer").str("base") : "dec"
            let value = Double(result) ?? 0
            let safe = value.isFinite ? Int(JavaScript.trunc(value)) : 0
            let labels = ["dec": "DEC", "hex": "HEX", "oct": "OCT", "bin": "BIN"]
            func inBase(_ entry: String) -> String {
                switch entry {
                case "hex": return (safe < 0 ? "-" : "") + String(abs(safe), radix: 16).uppercased()
                case "oct": return (safe < 0 ? "-" : "") + String(abs(safe), radix: 8)
                case "bin": return (safe < 0 ? "-" : "") + String(abs(safe), radix: 2)
                default: return String(safe)
                }
            }
            // Every base at once: the whole reason to reach for this skin.
            return .lines(
                lines: ["dec", "hex", "oct", "bin"].map { entry in
                    RestLine(key: entry, left: labels[entry]!, right: RestText.compact(inBase(entry), 18), tone: entry == base ? .accent : nil, dim: entry != base)
                },
                eyebrow: RestEyebrow(label: "Programmer", note: labels[base]),
                mono: true
            )
        case "finance":
            return .metric(primary: result.isEmpty ? "—" : RestText.compact(result, 14), secondary: "Finance", eyebrow: RestEyebrow(label: RestText.compact(data.skinState("finance").str("mode").replacingOccurrences(of: "_", with: " ").capitalized, 18)))
        case "date_math":
            let state = data.skinState("date_math")
            let from = state.str("from")
            let to = state.str("to")
            let days = DateSkinModel.daysBetween(from, to)
            return .split(
                left: RestReadout(primary: RestText.compact(from.isEmpty ? "—" : from, 10), secondary: "From"),
                right: RestReadout(primary: RestText.compact(to.isEmpty ? "—" : to, 10), secondary: "To", tone: .accent),
                divider: "→",
                eyebrow: RestEyebrow(label: "Date math", note: days.map { "\(RestText.number($0)) days" } ?? "Pick two dates")
            )
        case "named_variables":
            let variables = CalculatorSkinModel.namedVariables(data.skinState("named_variables")["variables"])
            return .lines(
                lines: variables.prefix(RestingFaceMeasure.lineLimit).enumerated().map { index, variable in
                    RestLine(key: "\(variable.name)-\(index)", left: RestText.compact(variable.name.isEmpty ? "x\(index + 1)" : variable.name, 14), right: RestText.number(variable.value))
                },
                eyebrow: RestEyebrow(label: "Variables", note: String(variables.count)),
                mono: true,
                total: result.isEmpty ? nil : RestLine(key: "result", left: "=", right: RestText.compact(result, 14), tone: .accent)
            )
        default:
            if expression.isEmpty, result.isEmpty { return .icon }
            let angle = CalculatorSkinModel.angleUnit(data.skinState("scientific")["angle"])
            return .lines(
                lines: [RestLine(key: "expression", left: RestText.compact(expression.isEmpty ? "—" : expression, 26), dim: true)],
                eyebrow: skin == "scientific" ? RestEyebrow(label: "Scientific", note: angle.rawValue.uppercased()) : RestEyebrow(label: "Calculator"),
                mono: true,
                total: RestLine(key: "result", left: "=", right: RestText.compact(result.isEmpty ? "0" : result, 16), tone: .accent)
            )
        }
    }
}

/// One 44 pt key on the pad.
struct CalcKey: View {
    let key: CalculatorWidget.Key
    let accent: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(key.label ?? key.key)
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .frame(maxWidth: .infinity, minHeight: 36)
                .background(RoundedRectangle(cornerRadius: GlassTokens.r2, style: .continuous).fill(key.accent ? accent.opacity(0.28) : Color.lift.opacity(key.action == nil ? 0.07 : 0.04)))
                .foregroundStyle(key.accent ? accent : key.action == "clear" ? Color(hex: "#f59e0b") : Color.primary.opacity(0.85))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(key.action == "back" ? "Backspace" : key.action == "clear" ? "Clear" : key.action == "equals" ? "Equals" : (key.label ?? key.key))
        .touchTarget()
    }
}
