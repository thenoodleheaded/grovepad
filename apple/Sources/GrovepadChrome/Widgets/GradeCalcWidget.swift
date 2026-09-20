import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Grades (`components/widgets/modules/GradeCalcWidget.tsx`, `GpaWidget.tsx`,
// `gradeSkinModel.ts`, `restingFaces/catalog.ts gradeCalcFace`). A weighted
// course grade over `{ id, name, score, weight }` components, and a GPA
// ledger over `gpa.courses`; the skin field is `mode`.
//
// weighted and gpa are fully editable. pass_fail and what_if are drawn as
// the weighted table with their reading on the hero (the pass mark and the
// simulated score are read from their pockets, not edited yet); rubric,
// dropped_scores and curve_simulator are schema extensions and render the
// weighted table with a note. Scores and weights clamp to 0…100, credits to
// 0…99 and grade points to 0…4.3 (`clampGradeNumber`).
// ---------------------------------------------------------------------------

public struct GradeCalcWidget: WidgetRenderer {
    public static let type = "grade_calc"
    static let skins = ["weighted", "gpa", "pass_fail", "what_if", "rubric", "dropped_scores", "curve_simulator"]
    static let extensionSkins: Set<String> = ["rubric", "dropped_scores", "curve_simulator"]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("mode")
        return skins.contains(raw) ? raw : "weighted"
    }

    static func clamp(_ raw: Double?, _ low: Double, _ high: Double) -> Double {
        guard let raw, raw.isFinite else { return low }
        return min(high, max(low, raw))
    }

    /// Σ(score × weight) / Σ(weight), each clamped to 0…100.
    static func weightedGrade(_ components: [JSONObject]) -> Double {
        let total = components.reduce(0.0) { $0 + clamp($1.finite("weight"), 0, 100) }
        if total <= 0 { return 0 }
        return components.reduce(0.0) { $0 + clamp($1.finite("score"), 0, 100) * clamp($1.finite("weight"), 0, 100) } / total
    }

    static func totalWeight(_ components: [JSONObject]) -> Double {
        components.reduce(0.0) { $0 + clamp($1.finite("weight"), 0, 100) }
    }

    /// Σ(credits × points) / Σ(credits).
    static func gpa(_ courses: [JSONObject]) -> Double {
        let credits = courses.reduce(0.0) { $0 + clamp($1.finite("credits"), 0, 99) }
        if credits <= 0 { return 0 }
        return courses.reduce(0.0) { $0 + clamp($1.finite("credits"), 0, 99) * clamp($1.finite("points"), 0, 4.3) } / credits
    }

    static func letter(_ grade: Double) -> String {
        let scale: [(Double, String)] = [(97, "A+"), (93, "A"), (90, "A−"), (87, "B+"), (83, "B"), (80, "B−"), (77, "C+"), (73, "C"), (70, "C−"), (67, "D+"), (63, "D"), (60, "D−")]
        return scale.first { grade >= $0.0 }?.1 ?? "F"
    }

    static func toneColor(_ grade: Double, threshold: Double = 60) -> Color {
        if grade < threshold { return Color(hex: "#f87171") }
        return grade >= max(85, threshold + 15) ? Color(hex: "#34d399") : Color(hex: "#fbbf24")
    }

    static func fixed(_ value: Double, _ places: Int) -> String {
        String(format: "%.\(places)f", value)
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = GradeCalcWidget.skin(data)
        let accent = Color(hex: context.accent)
        return Group {
            if skin == "gpa" {
                gpaBody(context, accent: accent)
            } else {
                weightedBody(context, skin: skin, accent: accent)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func hero(eyebrow: String, value: String, suffix: String?, note: String, tone: Color, aside: String) -> some View {
        Island {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    GlassLabel(eyebrow)
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text(value).font(GlassType.hero).monospacedDigit().foregroundStyle(tone)
                        if let suffix { Text(suffix).font(GlassType.heroUnit).foregroundStyle(.secondary) }
                    }
                    Text(note).font(GlassType.label).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Text(aside).font(GlassType.value).foregroundStyle(tone)
                    .frame(width: 44, height: 44)
                    .background(Circle().stroke(tone.opacity(0.4), lineWidth: 3))
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func weightedBody(_ context: WidgetCardContext, skin: String, accent: Color) -> some View {
        let data = context.data
        let components = data.recordList("components")
        let grade = GradeCalcWidget.weightedGrade(components)
        let total = GradeCalcWidget.totalWeight(components)
        return VStack(alignment: .leading, spacing: 6) {
            switch skin {
            case "pass_fail":
                let threshold = GradeCalcWidget.clamp(data.skinState("pass_fail").finite("threshold") ?? 60, 0, 100)
                let margin = grade - threshold
                hero(eyebrow: margin >= 0 ? "On track" : "Needs attention", value: margin >= 0 ? "Passing" : "Below", suffix: nil,
                     note: "\(GradeCalcWidget.fixed(abs(margin), 1)) points \(margin >= 0 ? "above" : "below") your pass mark of \(GradeCalcWidget.fixed(threshold, 0))%",
                     tone: margin >= 0 ? GradeCalcWidget.toneColor(grade, threshold: threshold) : Color(hex: "#f87171"), aside: margin >= 0 ? "✓" : "−")
                NotesSkinNote("The pass mark is read from the skin's pocket — its slider arrives later.")
            case "what_if":
                let state = data.skinState("what_if")
                let chosen = components.first { $0.str("id") == state.str("componentId") } ?? components.first
                let simulated = GradeCalcWidget.clamp(state.finite("score") ?? chosen?.finite("score") ?? 0, 0, 100)
                let projected = GradeCalcWidget.weightedGrade(components.map { component in
                    guard component.str("id") == chosen?.str("id") else { return component }
                    var copy = component
                    copy["score"] = .number(simulated)
                    return copy
                })
                let delta = projected - grade
                hero(eyebrow: "Projected grade", value: GradeCalcWidget.fixed(projected, 1), suffix: "%",
                     note: "\(delta >= 0 ? "+" : "")\(GradeCalcWidget.fixed(delta, 1)) points from your current \(GradeCalcWidget.fixed(grade, 1))%",
                     tone: GradeCalcWidget.toneColor(projected), aside: GradeCalcWidget.letter(projected))
                NotesSkinNote("The simulated score is read from the skin's pocket — its slider arrives later.")
            default:
                hero(eyebrow: "Weighted grade", value: GradeCalcWidget.fixed(grade, 1), suffix: "%",
                     note: "\(GradeCalcWidget.fixed(total, 0))% of your course is mapped", tone: GradeCalcWidget.toneColor(grade), aside: GradeCalcWidget.letter(grade))
                if GradeCalcWidget.extensionSkins.contains(skin) {
                    NotesSkinNote("Shown as the weighted table — the \(skin.replacingOccurrences(of: "_", with: " ")) controls arrive later.")
                }
            }
            HStack(spacing: 6) {
                GlassLabel("Coursework").frame(maxWidth: .infinity, alignment: .leading)
                GlassLabel("Score").frame(width: 56, alignment: .trailing)
                GlassLabel("Weight").frame(width: 56, alignment: .trailing)
                Color.clear.frame(width: GlassTokens.touchTarget)
            }
            if components.isEmpty {
                Text("Add your first piece of coursework.").font(GlassType.label).foregroundStyle(.secondary)
            }
            ForEach(components, id: \.["id"]) { component in
                let id = component.str("id")
                HStack(spacing: 6) {
                    CardTextField("Component…", text: component.str("name")) { next in
                        context.update { $0.patchRecord(in: "components", id: id) { $0["name"] = .string(String(next.prefix(80))) } }
                    }
                    CardNumberField("\(component.str("name").isEmpty ? "Component" : component.str("name")) score", value: GradeCalcWidget.clamp(component.finite("score"), 0, 100)) { next in
                        context.update { $0.patchRecord(in: "components", id: id) { $0["score"] = .number(GradeCalcWidget.clamp(next, 0, 100)) } }
                    }
                    CardNumberField("\(component.str("name").isEmpty ? "Component" : component.str("name")) weight", value: GradeCalcWidget.clamp(component.finite("weight"), 0, 100)) { next in
                        context.update { $0.patchRecord(in: "components", id: id) { $0["weight"] = .number(GradeCalcWidget.clamp(next, 0, 100)) } }
                    }
                    RowDeleteButton(label: "Remove \(component.str("name").isEmpty ? "component" : component.str("name"))") {
                        context.update { $0.removeRecord(in: "components", id: id) }
                    }
                }
            }
            HStack {
                FlowButton("Add component", symbol: "plus", accent: accent) {
                    let id = context.mint()
                    context.update { data in
                        var record = JSONObject()
                        record["id"] = .string(id)
                        record["name"] = .string("")
                        record["score"] = .number(0)
                        record["weight"] = .number(0)
                        data.appendRecord(in: "components", record)
                    }
                }
                Spacer(minLength: 0)
                Text("\(Int(jsRound(total))) / 100%").font(GlassType.label).monospacedDigit()
                    .foregroundStyle(Int(jsRound(total)) == 100 ? Color(hex: "#34d399") : Color.secondary)
            }
        }
    }

    private func gpaBody(_ context: WidgetCardContext, accent: Color) -> some View {
        let data = context.data
        let courses = data.object("gpa")?.recordList("courses") ?? []
        let gpa = GradeCalcWidget.gpa(courses)
        let credits = courses.reduce(0.0) { $0 + GradeCalcWidget.clamp($1.finite("credits"), 0, 99) }
        let patch = { (mutate: @escaping (inout JSONObject) -> Void) in
            context.update { data in
                var gpa = data.object("gpa") ?? JSONObject()
                mutate(&gpa)
                data["gpa"] = .object(gpa)
            }
        }
        return VStack(alignment: .leading, spacing: 6) {
            hero(eyebrow: "Cumulative GPA", value: GradeCalcWidget.fixed(gpa, 2), suffix: nil,
                 note: "\(GradeCalcWidget.fixed(credits, 0)) credits across \(courses.count) course\(courses.count == 1 ? "" : "s")",
                 tone: GradeCalcWidget.toneColor(gpa * 25), aside: "/4.3")
            HStack(spacing: 6) {
                GlassLabel("Course").frame(maxWidth: .infinity, alignment: .leading)
                GlassLabel("Credits").frame(width: 56, alignment: .trailing)
                GlassLabel("Points").frame(width: 56, alignment: .trailing)
                Color.clear.frame(width: GlassTokens.touchTarget)
            }
            if courses.isEmpty {
                Text("Add your first course to calculate a GPA.").font(GlassType.label).foregroundStyle(.secondary)
            }
            ForEach(courses, id: \.["id"]) { course in
                let id = course.str("id")
                HStack(spacing: 6) {
                    CardTextField("Course…", text: course.str("name")) { next in
                        patch { $0.patchRecord(in: "courses", id: id) { $0["name"] = .string(String(next.prefix(80))) } }
                    }
                    CardNumberField("\(course.str("name").isEmpty ? "Course" : course.str("name")) credits", value: GradeCalcWidget.clamp(course.finite("credits"), 0, 99)) { next in
                        patch { $0.patchRecord(in: "courses", id: id) { $0["credits"] = .number(GradeCalcWidget.clamp(next, 0, 99)) } }
                    }
                    CardNumberField("\(course.str("name").isEmpty ? "Course" : course.str("name")) grade points", value: GradeCalcWidget.clamp(course.finite("points"), 0, 4.3)) { next in
                        patch { $0.patchRecord(in: "courses", id: id) { $0["points"] = .number(GradeCalcWidget.clamp(next, 0, 4.3)) } }
                    }
                    RowDeleteButton(label: "Remove \(course.str("name").isEmpty ? "course" : course.str("name"))") {
                        patch { $0.removeRecord(in: "courses", id: id) }
                    }
                }
            }
            HStack {
                FlowButton("Add course", symbol: "plus", accent: accent) {
                    let id = context.mint()
                    patch { gpa in
                        var record = JSONObject()
                        record["id"] = .string(id)
                        record["name"] = .string("")
                        record["credits"] = .number(3)
                        record["points"] = .number(4)
                        gpa.appendRecord(in: "courses", record)
                    }
                }
                Spacer(minLength: 0)
                Text("\(GradeCalcWidget.fixed(credits, 0)) credits").font(GlassType.label).monospacedDigit().foregroundStyle(.secondary)
            }
        }
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `gradeCalcFace`: the grade as the eyebrow's note, each component as a
    /// bar of its score, strong ones good, weak ones bad.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let components = data.recordList("components")
        if components.isEmpty { return .icon }
        let weight = components.reduce(0.0) { $0 + max(0, $1.finite("weight") ?? 0) }
        let earned = components.reduce(0.0) { $0 + ($1.finite("score") ?? 0) * max(0, $1.finite("weight") ?? 0) }
        let bars = components.prefix(RestingFaceMeasure.barLimit).enumerated().map { index, component -> RestBar in
            let score = component.finite("score") ?? 0
            let id = component.str("id")
            return RestBar(
                key: id.isEmpty ? "component-\(index)" : id,
                label: RestText.compact(component.str("name").isEmpty ? "Component" : component.str("name"), 18),
                value: "\(RestText.number(score))%",
                fraction: RestText.fraction(score / 100),
                tone: score >= 80 ? .good : score < 50 ? .bad : nil
            )
        }
        let model = RestingFaceModel.bars(
            bars: bars,
            eyebrow: RestEyebrow(label: "Grade", note: weight > 0 ? "\(RestText.number(jsRound(earned / weight * 10) / 10))%" : "—")
        )
        return NotesAndStudyFamily.dressed(model, type: GradeCalcWidget.type, data: data)
    }
}
