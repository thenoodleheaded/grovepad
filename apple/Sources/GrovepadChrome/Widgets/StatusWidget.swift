import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Status (`components/widgets/modules/essential/workflowWidgets.tsx
// StatusWidget`, `restingFaces/catalog.ts statusFace`). One `value` from four
// legal states; every write goes through the `status` field setter
// (`fieldDescriptor("status", "status").set`) so a tap validates exactly as
// a wire does. `reset` and `check_all` are the Core commands. The skin
// field is `skin`.
//
// Ported skins: badge, traffic_light, progress, pipeline, availability (the
// same four-step chooser, each wearing its own shape). approval and
// service_health render the badge with a note; pockets are preserved.
// ---------------------------------------------------------------------------

public struct StatusWidget: WidgetRenderer {
    public static let type = "status"
    static let skins: Set<String> = ["badge", "traffic_light", "progress", "pipeline", "availability", "approval", "service_health"]
    static let steps: [(value: String, label: String, color: String, progress: Double)] = [
        ("not_started", "Not started", "#737373", 0), ("in_progress", "In progress", "#38bdf8", 50), ("blocked", "Blocked", "#fb7185", 50), ("done", "Done", "#34d399", 100),
    ]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "badge"
    }

    static func current(_ data: JSONObject) -> (value: String, label: String, color: String, progress: Double) {
        steps.first { $0.value == data.string("value") } ?? steps[0]
    }

    static func tone(_ value: String) -> RestTone {
        value == "done" ? .good : value == "blocked" ? .bad : value == "in_progress" ? .accent : .muted
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = StatusWidget.skin(data)
        let current = StatusWidget.current(data)
        let accent = Color(hex: context.accent)
        let choose = { (value: String) in
            context.update { data in
                if let setter = fieldDescriptor("status", "status")?.set {
                    data = setter(data, .text(value), context.mint)
                }
            }
        }
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                CardTextField("Label", text: data.str("label")) { next in
                    context.update { $0["label"] = .string(next) }
                }
                .foregroundStyle(.secondary)
                Text(current.label).font(GlassType.value).foregroundStyle(Color(hex: current.color))
            }
            if skin == "approval" || skin == "service_health" {
                SkinNote("Shown as the badge — the \(skin.replacingOccurrences(of: "_", with: " ")) skin arrives later.")
            }
            HStack(spacing: 6) {
                ForEach(StatusWidget.steps, id: \.value) { step in
                    let selected = step.value == current.value
                    if skin == "traffic_light" || skin == "availability" {
                        Button { choose(step.value) } label: {
                            VStack(spacing: 4) {
                                Circle().fill(Color(hex: step.color).opacity(selected ? 1 : 0.28)).frame(width: 16, height: 16)
                                Text(step.label).font(GlassType.label).lineLimit(1).minimumScaleFactor(0.7).foregroundStyle(selected ? Color.primary : .secondary)
                            }
                            .frame(maxWidth: .infinity, minHeight: 40)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(step.label)
                        .accessibilityAddTraits(selected ? .isSelected : [])
                        .touchTarget()
                    } else {
                        ChoiceButton(text: step.label, selected: selected, tint: Color(hex: step.color)) { choose(step.value) }
                    }
                }
            }
            if skin == "pipeline" {
                HStack(spacing: 2) {
                    ForEach(StatusWidget.steps, id: \.value) { step in
                        let reached = StatusWidget.steps.firstIndex { $0.value == step.value }! <= StatusWidget.steps.firstIndex { $0.value == current.value }!
                        Capsule().fill(reached ? Color(hex: current.color) : Color.lift.opacity(0.08)).frame(height: 4)
                    }
                }
            } else {
                MeterBar(fraction: current.progress / 100, tint: skin == "progress" ? accent : Color(hex: current.color))
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `statusFace`: one lit state as a metric; a pipeline names the whole run
    /// of states, so it keeps the whole run as a chain; progress and service
    /// health rest as a gauge of their percentage.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let current = StatusWidget.current(data)
        let label = RestText.compact(data.str("label").isEmpty ? "Status" : data.str("label"), 22)
        let tone = StatusWidget.tone(current.value)
        let skin = StatusWidget.skin(data)
        if skin == "pipeline" {
            return .chain(
                nodes: StatusWidget.steps.prefix(RestingFaceMeasure.nodeLimit).map { step in
                    RestNode(key: step.value, label: RestText.compact(step.label, 10), current: step.value == current.value)
                },
                shape: .linear,
                overflow: 0
            )
        }
        if skin == "progress" || skin == "service_health" {
            return .gauge(progress: current.progress / 100, primary: "\(RestText.number(current.progress))%", secondary: RestText.compact(current.label, 18), caption: label, tone: tone)
        }
        return .metric(primary: current.label, secondary: label, progress: current.progress / 100, tone: tone)
    }
}
