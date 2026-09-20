import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Number Input (`components/widgets/modules/essential/inputWidgets.tsx`,
// `restingFaces/numeric.ts numberInputRestingFace`). A bounded number for
// live calculations. Every write to `value` goes through the field setter
// (`fieldDescriptor("number_input", "value").set`) so the card clamps
// exactly the way a wire does; ± run the `increment`/`decrement` commands.
// The skin field is `skin`.
//
// Ported skins: stepper, slider. dial, currency, percent, duration and range
// render the stepper with their unit word where one exists.
// ---------------------------------------------------------------------------

public struct NumberInputWidget: WidgetRenderer {
    public static let type = "number_input"
    static let skins: Set<String> = ["stepper", "slider", "dial", "currency", "percent", "duration", "range"]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "stepper"
    }

    static func bounds(_ data: JSONObject) -> (low: Double, high: Double) {
        let minimum = data.finite("min") ?? 0
        let maximum = data.finite("max") ?? 100
        return (min(minimum, maximum), max(minimum, maximum))
    }

    static func display(_ value: Double, skin: String) -> String {
        switch skin {
        case "duration": return RestText.duration(value)
        case "percent": return "\(RestText.number(value))%"
        default: return RestText.number(value)
        }
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = NumberInputWidget.skin(data)
        let value = data.finite("value") ?? 0
        let (low, high) = NumberInputWidget.bounds(data)
        let step = max(0.0001, abs(data.finite("step") ?? 1))
        let accent = Color(hex: context.accent)
        let setValue = { (next: Double) in
            context.update { data in
                if let setter = fieldDescriptor("number_input", "value")?.set {
                    data = setter(data, .number(next), context.mint)
                }
            }
        }
        return VStack(alignment: .leading, spacing: 8) {
            CardTextField("Label", text: data.str("label")) { next in
                context.update { $0["label"] = .string(next) }
            }
            .foregroundStyle(.secondary)
            if skin == "slider" {
                Text(NumberInputWidget.display(value, skin: skin))
                    .font(GlassType.hero).monospacedDigit().foregroundStyle(accent)
                Slider(
                    value: Binding(get: { min(high, max(low, value)) }, set: { setValue($0) }),
                    in: low...max(low + step, high),
                    step: step
                )
                .tint(accent)
                .frame(minHeight: GlassTokens.touchTarget)
                .accessibilityLabel(data.str("label", "Value"))
            } else {
                // The symmetry rule: − and + are identical siblings around the hero.
                HStack(spacing: 8) {
                    GhostButton("minus", label: "Decrease") { context.runCommand("decrement") }
                    CardTextField("Value", text: JavaScript.numberString(value)) { next in
                        let parsed = JavaScript.parseFloat(next)
                        if parsed.isFinite { setValue(parsed) }
                    }
                    .font(GlassType.hero)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(accent)
                    GhostButton("plus", label: "Increase") { context.runCommand("increment") }
                }
            }
            HStack(spacing: 8) {
                ForEach(["min", "max", "step"], id: \.self) { key in
                    VStack(alignment: .leading, spacing: 2) {
                        GlassLabel(key)
                        CardTextField(key, text: JavaScript.numberString(data.finite(key) ?? (key == "max" ? 100 : key == "step" ? 1 : 0))) { next in
                            let parsed = JavaScript.parseFloat(next)
                            guard parsed.isFinite else { return }
                            context.update { $0[key] = .number(parsed) }
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// The value with its label and, when the bounds make sense, its
    /// progress along them. No value at all rests as the bare icon.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        guard let value = data.finite("value") else { return .icon }
        let (low, high) = NumberInputWidget.bounds(data)
        let label = data.trimmedStr("label")
        let skin = NumberInputWidget.skin(data)
        return .metric(
            primary: NumberInputWidget.display(value, skin: skin),
            secondary: RestText.compact(label.isEmpty ? "Value" : label, 20),
            progress: high > low ? RestText.fraction((value - low) / (high - low)) : nil
        )
    }
}
