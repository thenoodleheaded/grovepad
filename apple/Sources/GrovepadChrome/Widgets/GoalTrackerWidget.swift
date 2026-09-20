import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Goal (`components/widgets/modules/GoalTrackerWidget.tsx`, `ProgressWidget.tsx`,
// `StudyGoalWidget.tsx`, `renderers/consolidatedWidgetRenderers.tsx goal_tracker`,
// `restingFaces/goal.ts`). Four instruments behind one name — a percentage
// bar (`simple`), a milestone list (`milestones`), an hours ledger (`hours`)
// and an OKR sheet (`okr`) — each in its own slot of the data so rolling
// between them never loses a number. The skin field is `mode`.
//
// simple writes `percent` through the field setter (the same clamp a wire
// gets) and `reset` is its command; milestones edit label/done in place and
// `uncheck_all` / `check_all` are its commands; hours logs ±0.5 h; okr edits
// each key result's current value. The catalogue skins (thermometer,
// burn_up, score_ring; streak_goal, savings_goal, outcome_inputs) wear the
// milestone body with a note, as the web does.
// ---------------------------------------------------------------------------

public struct GoalTrackerWidget: WidgetRenderer {
    public static let type = "goal_tracker"
    static let skins = ["simple", "milestones", "hours", "okr", "thermometer", "burn_up", "score_ring", "streak_goal", "savings_goal", "outcome_inputs"]
    static let catalogueSkins: Set<String> = ["thermometer", "burn_up", "score_ring", "streak_goal", "savings_goal", "outcome_inputs"]
    static let extensionSkins: Set<String> = ["streak_goal", "savings_goal", "outcome_inputs"]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("mode")
        return skins.contains(raw) ? raw : "milestones"
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = GoalTrackerWidget.skin(data)
        let accent = Color(hex: context.accent)
        return Group {
            switch skin {
            case "simple": simpleBody(context, accent: accent)
            case "hours": hoursBody(context, accent: accent)
            case "okr": okrBody(context, accent: accent)
            default: milestonesBody(context, skin: skin, accent: accent)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    /// The milestone checklist under a progress ring (`GoalTrackerWidget.tsx`).
    private func milestonesBody(_ context: WidgetCardContext, skin: String, accent: Color) -> some View {
        let data = context.data
        let milestones = data.recordList("milestones")
        let done = milestones.filter { $0.bool("done") == true }.count
        let percent = milestones.isEmpty ? 0 : Int(jsRound(Double(done) / Double(milestones.count) * 100))
        return VStack(alignment: .leading, spacing: 6) {
            if GoalTrackerWidget.catalogueSkins.contains(skin) {
                NotesSkinNote(GoalTrackerWidget.extensionSkins.contains(skin)
                    ? "Shown as milestones — the \(skin.replacingOccurrences(of: "_", with: " ")) details arrive later."
                    : "Shown as milestones — the \(skin.replacingOccurrences(of: "_", with: " ")) drawing arrives later.")
            }
            HStack(spacing: 10) {
                ProgressRing(fraction: Double(percent) / 100, label: "\(percent)%", accent: accent)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Image(systemName: "target").font(.system(size: 11)).foregroundStyle(Color(hex: "#34d399"))
                        CardTextField("What's the goal?", text: data.str("goal")) { next in
                            context.update { $0["goal"] = .string(next) }
                        }
                        .font(GlassType.value)
                    }
                    Text("\(done) of \(milestones.count) milestones").font(GlassType.label).foregroundStyle(.secondary)
                }
            }
            ForEach(milestones, id: \.["id"]) { milestone in
                let id = milestone.str("id")
                let isDone = milestone.bool("done") == true
                HStack(spacing: 8) {
                    RoundCheckButton(done: isDone, label: milestone.str("label").isEmpty ? "Milestone" : milestone.str("label"), accent: accent) {
                        context.update { $0.patchRecord(in: "milestones", id: id) { $0["done"] = .bool(!isDone) } }
                    }
                    CardTextField("Milestone…", text: milestone.str("label")) { next in
                        context.update { $0.patchRecord(in: "milestones", id: id) { $0["label"] = .string(next) } }
                    }
                    .strikethrough(isDone)
                    .foregroundStyle(isDone ? .secondary : .primary)
                    RowDeleteButton(label: "Remove milestone") {
                        context.update { $0.removeRecord(in: "milestones", id: id) }
                    }
                }
            }
            FlowButton("Add milestone", symbol: "plus", accent: accent) {
                let id = context.mint()
                context.update { data in
                    var record = JSONObject()
                    record["id"] = .string(id)
                    record["label"] = .string("")
                    record["done"] = .bool(false)
                    data.appendRecord(in: "milestones", record)
                }
            }
        }
    }

    /// The labelled meter with ±1 / ±10 nudges (`ProgressWidget.tsx`). Every
    /// write goes through the `percent` field setter.
    private func simpleBody(_ context: WidgetCardContext, accent: Color) -> some View {
        let data = context.data
        let simple = data.object("simple") ?? JSONObject()
        let percent = min(100, max(0, simple.finite("percent") ?? 0))
        let setPercent = { (next: Double) in
            context.update { data in
                if let setter = fieldDescriptor("goal_tracker", "percent")?.set {
                    data = setter(data, .number(next), context.mint)
                }
            }
        }
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                CardTextField("Label…", text: simple.str("label")) { next in
                    context.update { data in
                        var simple = data.object("simple") ?? JSONObject()
                        simple["label"] = .string(next)
                        data["simple"] = .object(simple)
                    }
                }
                Text("\(Int(jsRound(percent)))%").font(GlassType.value).monospacedDigit().foregroundStyle(percent >= 100 ? Color(hex: "#34d399") : accent)
            }
            Slider(value: Binding(get: { percent }, set: { setPercent(jsRound($0)) }), in: 0...100, step: 1)
                .tint(accent)
                .frame(minHeight: GlassTokens.touchTarget)
                .accessibilityLabel("Progress percentage")
            HStack(spacing: 8) {
                GhostButton("minus", label: "Decrease by 10") { setPercent(percent - 10) }
                GhostButton("minus.circle", label: "Decrease by 1") { setPercent(percent - 1) }
                Spacer(minLength: 0)
                GhostButton("plus.circle", label: "Increase by 1") { setPercent(percent + 1) }
                GhostButton("plus", label: "Increase by 10") { setPercent(percent + 10) }
            }
            GhostButton("arrow.counterclockwise", label: "Reset to 0%") { context.runCommand("reset") }
        }
    }

    /// Logged against target hours with ± loggers (`StudyGoalWidget.tsx`).
    private func hoursBody(_ context: WidgetCardContext, accent: Color) -> some View {
        let data = context.data
        let hours = data.object("hours") ?? JSONObject()
        let target = max(0, hours.finite("targetHours") ?? 0)
        let logged = max(0, hours.finite("loggedHours") ?? 0)
        let percent = target > 0 ? min(100, Int(jsRound(logged / target * 100))) : 0
        let patch = { (mutate: @escaping (inout JSONObject) -> Void) in
            context.update { data in
                var hours = data.object("hours") ?? JSONObject()
                mutate(&hours)
                data["hours"] = .object(hours)
            }
        }
        let log = { (delta: Double) in patch { $0["loggedHours"] = .number(max(0, jsRound((logged + delta) * 2) / 2)) } }
        return VStack(alignment: .leading, spacing: 8) {
            CardTextField("What are you studying?", text: hours.str("subject")) { next in patch { $0["subject"] = .string(next) } }
                .font(GlassType.value)
            HStack(spacing: 10) {
                ProgressRing(fraction: Double(percent) / 100, label: "\(percent)%", accent: accent)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Text("\(RestText.number(logged))h").font(GlassType.hero).monospacedDigit().foregroundStyle(accent)
                        Text("of").font(GlassType.label).foregroundStyle(.secondary)
                        CardNumberField("Target hours", value: target, width: 48) { next in patch { $0["targetHours"] = .number(max(0, next)) } }
                        Text("h").font(GlassType.label).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 8) {
                        GhostButton("minus", label: "Log −0.5 hours") { log(-0.5) }
                        GhostButton("plus", label: "Log +0.5 hours") { log(0.5) }
                    }
                }
            }
        }
    }

    /// The objective and its key results (`ExpansionWidget okr`, minimal).
    private func okrBody(_ context: WidgetCardContext, accent: Color) -> some View {
        let data = context.data
        let okr = data.object("okr") ?? JSONObject()
        let results = okr.recordList("keyResults")
        let patch = { (mutate: @escaping (inout JSONObject) -> Void) in
            context.update { data in
                var okr = data.object("okr") ?? JSONObject()
                mutate(&okr)
                data["okr"] = .object(okr)
            }
        }
        return VStack(alignment: .leading, spacing: 6) {
            GlassLabel("Objective")
            CardTextField("Meaningful objective", text: okr.str("objective")) { next in patch { $0["objective"] = .string(next) } }
                .font(GlassType.value)
            GlassLabel("Key results")
            ForEach(results, id: \.["id"]) { result in
                let id = result.str("id")
                let current = result.finite("current") ?? 0
                let target = result.finite("target") ?? 0
                HStack(spacing: 6) {
                    CardTextField("Key result", text: result.str("label")) { next in
                        patch { $0.patchRecord(in: "keyResults", id: id) { $0["label"] = .string(next) } }
                    }
                    CardNumberField("Current", value: current, width: 48) { next in
                        patch { $0.patchRecord(in: "keyResults", id: id) { $0["current"] = .number(next) } }
                    }
                    Text("/").font(GlassType.label).foregroundStyle(.secondary)
                    CardNumberField("Target", value: target, width: 48) { next in
                        patch { $0.patchRecord(in: "keyResults", id: id) { $0["target"] = .number(next) } }
                    }
                    Text(target > 0 ? "\(Int(jsRound(RestText.fraction(current / target) * 100)))%" : "—").font(GlassType.label).monospacedDigit().foregroundStyle(accent).frame(width: 36, alignment: .trailing)
                }
            }
            FlowButton("Add key result", symbol: "plus", accent: accent) {
                let id = context.mint()
                patch { okr in
                    var record = JSONObject()
                    record["id"] = .string(id)
                    record["label"] = .string("")
                    record["current"] = .number(0)
                    record["target"] = .number(100)
                    record["weight"] = .number(1)
                    okr.appendRecord(in: "keyResults", record)
                }
            }
        }
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `goalRestingFace`: the bar and the hours ledger as a gauge, the OKR
    /// sheet as bars of its key results, the milestones as checked rows; a
    /// goal with nothing under it yet as its own words. A card in milestones
    /// mode names its goal; a catalogue skin leaves the eyebrow to the dress,
    /// which fills it with the skin's own name.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let mode = GoalTrackerWidget.skin(data)
        let goal = data.trimmedStr("goal")

        if mode == "simple" {
            let simple = data.object("simple") ?? JSONObject()
            let percent = Int(jsRound(RestText.fraction((simple.finite("percent") ?? 0) / 100) * 100))
            let label = simple.trimmedStr("label").isEmpty ? (goal.isEmpty ? "Progress" : goal) : simple.trimmedStr("label")
            return .gauge(progress: Double(percent) / 100, primary: "\(percent)%", secondary: RestText.compact(label, 22), tone: percent >= 100 ? .good : .accent)
        }
        if mode == "hours" {
            let hours = data.object("hours") ?? JSONObject()
            let target = max(0, hours.finite("targetHours") ?? 0)
            let logged = max(0, hours.finite("loggedHours") ?? 0)
            let subject = hours.trimmedStr("subject").isEmpty ? (goal.isEmpty ? "Study" : goal) : hours.trimmedStr("subject")
            return .gauge(
                progress: target > 0 ? RestText.fraction(logged / target) : 0,
                primary: "\(RestText.number(logged))h", secondary: RestText.compact(subject, 20),
                caption: target > 0 ? "of \(RestText.number(target))h" : "No target yet",
                tone: target > 0 && logged >= target ? .good : .accent
            )
        }
        if mode == "okr" {
            let okr = data.object("okr") ?? JSONObject()
            let results = okr.recordList("keyResults")
            let objective = okr.trimmedStr("objective").isEmpty ? goal : okr.trimmedStr("objective")
            let bars = results.prefix(RestingFaceMeasure.barLimit).enumerated().map { index, entry -> RestBar in
                let current = entry.finite("current") ?? 0
                let target = entry.finite("target") ?? 0
                let id = entry.str("id")
                return RestBar(
                    key: id.isEmpty ? "kr-\(index)" : id,
                    label: RestText.compact(entry.trimmedStr("label").isEmpty ? "Key result" : entry.str("label"), 20),
                    value: target > 0 ? "\(Int(jsRound(RestText.fraction(current / target) * 100)))%" : RestText.number(current),
                    fraction: target > 0 ? RestText.fraction(current / target) : 0
                )
            }
            if bars.isEmpty { return objective.isEmpty ? .icon : .text(text: RestText.compact(objective, 120)) }
            return .bars(bars: bars, eyebrow: RestEyebrow(label: "Objective", note: objective.isEmpty ? nil : RestText.compact(objective, 20)))
        }
        let steps = data.recordList("milestones").filter { !$0.trimmedStr("label").isEmpty }
        if steps.isEmpty {
            let base: RestingFaceModel = goal.isEmpty ? .icon : .text(text: RestText.compact(goal, 120))
            return NotesAndStudyFamily.dressed(base, type: GoalTrackerWidget.type, data: data)
        }
        let done = steps.filter { $0.bool("done") == true }.count
        let visible = steps.prefix(RestingFaceMeasure.rowLimit)
        let rows = visible.enumerated().map { index, step -> RestRow in
            let id = step.str("id")
            return RestRow(key: id.isEmpty ? "milestone-\(index)" : id, label: RestText.compact(step.str("label"), 30), done: step.bool("done") == true)
        }
        let named = mode == "milestones"
        let model = RestingFaceModel.rows(
            rows: rows, overflow: max(0, steps.count - rows.count),
            eyebrow: named ? RestEyebrow(label: RestText.compact(goal.isEmpty ? "Goal" : goal, 20), note: "\(done)/\(steps.count)") : nil,
            meter: Double(done) / Double(steps.count)
        )
        return NotesAndStudyFamily.dressed(model, type: GoalTrackerWidget.type, data: data)
    }
}

/// The 40 pt progress ring the goal cards share, with the reading inside.
struct ProgressRing: View {
    let fraction: Double
    let label: String
    let accent: Color

    var body: some View {
        ZStack {
            Circle().stroke(Color.lift.opacity(0.1), lineWidth: 3)
            Circle().trim(from: 0, to: CGFloat(RestText.fraction(fraction))).stroke(accent, style: StrokeStyle(lineWidth: 3, lineCap: .round)).rotationEffect(.degrees(-90))
            Text(label).font(.grove(size: 9, weight: .semibold)).monospacedDigit().foregroundStyle(accent)
        }
        .frame(width: 40, height: 40)
        .accessibilityLabel(label)
    }
}
