import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Toggle (`components/widgets/modules/ToggleWidget.tsx`, `toggleSkinModel.ts`,
// `restingFaces/structure.ts toggleRestingFace`). `value` is the one
// canonical boolean — what the circuit reads and the `reset` command clears;
// every skin writes exactly that field. The skin field is `skin`.
//
// Ported skins: switch, checkbox, power. segment, availability and tri_state
// render as the switch with their own state words (the segment labels and
// the third tri-state position live in their pockets, untouched).
// ---------------------------------------------------------------------------

public struct ToggleWidget: WidgetRenderer {
    public static let type = "toggle"
    static let skins: Set<String> = ["switch", "checkbox", "power", "segment", "availability", "tri_state"]
    static let stateWords: [String: (on: String, off: String)] = [
        "switch": ("On", "Off"), "checkbox": ("Done", "To do"), "power": ("Armed", "Disarmed"),
        "segment": ("On", "Off"), "availability": ("Available", "Busy"), "tri_state": ("On", "Off"),
    ]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "switch"
    }

    /// `toggleStateLabel`: each skin's own word for the same boolean.
    static func stateLabel(skin: String, value: Bool, state: JSONObject) -> String {
        if skin == "segment" {
            let on = state.str("onLabel").isEmpty ? "On" : String(state.str("onLabel").prefix(24))
            let off = state.str("offLabel").isEmpty ? "Off" : String(state.str("offLabel").prefix(24))
            return value ? on : off
        }
        if skin == "tri_state", !value, state.string("state") == "unset" { return "Unset" }
        let words = stateWords[skin] ?? ("On", "Off")
        return value ? words.on : words.off
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = ToggleWidget.skin(data)
        let value = data.bool("value") == true
        let state = data.skinState(skin)
        let accent = Color(hex: context.accent)
        let word = ToggleWidget.stateLabel(skin: skin, value: value, state: state)
        let flip = { context.update { $0["value"] = .bool(!value) } }
        return VStack(alignment: .leading, spacing: 8) {
            CardTextField("Label", text: data.str("label")) { next in
                context.update { $0["label"] = .string(next) }
            }
            .foregroundStyle(.secondary)
            HStack(spacing: 10) {
                switch skin {
                case "checkbox":
                    Button(action: flip) {
                        Image(systemName: value ? "checkmark.square.fill" : "square")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(value ? accent : Color.secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(word)
                    .accessibilityAddTraits(value ? .isSelected : [])
                    .touchTarget()
                case "power":
                    Button(action: flip) {
                        Image(systemName: "power")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundStyle(value ? accent : Color.secondary)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(value ? accent.opacity(0.18) : Color.lift.opacity(0.06)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(word)
                    .touchTarget()
                default:
                    Toggle(isOn: Binding(get: { value }, set: { _ in flip() })) { EmptyView() }
                        .labelsHidden()
                        .toggleStyle(.switch)
                        .tint(skin == "availability" ? Color(hex: value ? "#34d399" : "#f59e0b") : accent)
                        .touchTarget()
                }
                Text(word)
                    .font(GlassType.value)
                    .foregroundStyle(skin == "availability" ? Color(hex: value ? "#34d399" : "#f59e0b") : (value ? accent : .secondary))
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// A card that names its own outcomes keeps those names; otherwise the
    /// skin's word, in the skin's shape.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let enabled = data.bool("value") == true
        let skin = ToggleWidget.skin(data)
        let state = data.skinState(skin)
        let activeLabel = enabled ? data.str("trueLabel") : data.str("falseLabel")
        if !JavaScript.trim(activeLabel).isEmpty {
            return .boolean(label: RestText.compact(activeLabel, 24), active: enabled, shape: .switch)
        }
        if skin == "segment" {
            let off = ToggleWidget.stateLabel(skin: skin, value: false, state: state)
            let on = ToggleWidget.stateLabel(skin: skin, value: true, state: state)
            return .chips(chips: [
                RestChip(key: "off", text: RestText.compact(off, 14), tone: enabled ? .muted : .accent, filled: !enabled),
                RestChip(key: "on", text: RestText.compact(on, 14), tone: enabled ? .accent : .muted, filled: enabled),
            ], overflow: 0)
        }
        if skin == "tri_state" {
            let position = enabled ? "on" : (state.string("state") == "unset" ? "unset" : "off")
            return .chips(chips: ["off", "unset", "on"].map { slot in
                RestChip(key: slot, text: slot == "off" ? "Off" : slot == "unset" ? "Unset" : "On", tone: slot == position ? .accent : .muted, filled: slot == position)
            }, overflow: 0)
        }
        return .boolean(
            label: RestText.compact(ToggleWidget.stateLabel(skin: skin, value: enabled, state: state), 24),
            active: enabled,
            shape: skin == "checkbox" ? .checkbox : skin == "power" ? .power : .switch,
            tone: skin == "availability" ? (enabled ? .good : .warn) : nil
        )
    }
}
