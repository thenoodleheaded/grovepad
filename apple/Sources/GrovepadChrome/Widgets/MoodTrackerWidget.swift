import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Mood Tracker (`components/widgets/modules/MoodTrackerWidget.tsx`,
// `restingFaces/catalog.ts moodFace`). Seven days, each `null` or a mood
// index 0–4 on the weather scale; tapping a day cycles it. The skin field is
// `skin`. The `reset` command clears the week.
//
// Web quirk, not ported: the web's `cycleDay` writes `{ days }` alone and
// drops `skin`/`skinStates`; the port writes `days` in place (law 5). Fix the
// web to spread its data, then this note goes.
//
// Ported skins: week_check_in, mood_wheel (the week with the latest mood as
// its hero). month_heatmap, mood_journal, energy_matrix and trend render the
// week check-in with a note; their pockets are preserved untouched.
// ---------------------------------------------------------------------------

public struct MoodTrackerWidget: WidgetRenderer {
    public static let type = "mood_tracker"
    static let skins: Set<String> = ["week_check_in", "month_heatmap", "mood_wheel", "mood_journal", "energy_matrix", "trend"]
    static let moods = ["☀️", "🌤️", "☁️", "🌧️", "⛈️"]
    static let moodWords = ["Bright", "Fair", "Overcast", "Rainy", "Stormy"]
    static let dayInitials = ["M", "T", "W", "T", "F", "S", "S"]
    static let dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    static let moodHex = ["#34d399", "#a3e635", "#737373", "#fb923c", "#f87171"]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "week_check_in"
    }

    /// Seven slots, padded with `null`; a mood is a finite number in range.
    static func days(_ data: JSONObject) -> [Int?] {
        let source = data.array("days") ?? []
        return (0..<7).map { index in
            guard index < source.count, let value = source[index].numberValue, value.isFinite else { return nil }
            let mood = Int(value)
            return (0..<moods.count).contains(mood) ? mood : nil
        }
    }

    /// `cycleDay`: empty → 0 → … → 4 → empty.
    static func next(_ current: Int?) -> Int? {
        guard let current else { return 0 }
        return current >= moods.count - 1 ? nil : current + 1
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = MoodTrackerWidget.skin(data)
        let days = MoodTrackerWidget.days(data)
        let logged = days.filter { $0 != nil }.count
        let latest = days.reversed().compactMap { $0 }.first ?? 2
        let accent = Color(hex: context.accent)
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("How's the weather inside?").font(GlassType.body).foregroundStyle(.secondary)
                Spacer(minLength: 0)
                Text("\(logged)/7 logged").font(GlassType.label).monospacedDigit().foregroundStyle(.secondary)
                GhostButton("arrow.counterclockwise", label: "Clear the week") { context.runCommand("reset") }
            }
            if skin != "week_check_in", skin != "mood_wheel" {
                SkinNote("Shown as the week check-in — the \(skin.replacingOccurrences(of: "_", with: " ")) skin arrives later.")
            }
            HStack(alignment: .bottom, spacing: 4) {
                ForEach(0..<7, id: \.self) { index in
                    let mood = days[index]
                    Button {
                        context.update { data in
                            var slots = MoodTrackerWidget.days(data)
                            slots[index] = MoodTrackerWidget.next(mood)
                            data["days"] = .array(slots.map { $0.map { .number(Double($0)) } ?? .null })
                        }
                    } label: {
                        VStack(spacing: 2) {
                            Text(mood.map { MoodTrackerWidget.moods[$0] } ?? "")
                                .font(.grove(size: 16))
                                .frame(width: 32, height: 32)
                                .background(Circle().fill(mood.map { Color(hex: MoodTrackerWidget.moodHex[$0]).opacity(0.18) } ?? Color.clear))
                                .overlay(Circle().strokeBorder(mood.map { Color(hex: MoodTrackerWidget.moodHex[$0]).opacity(0.6) } ?? Color.lift.opacity(0.14), lineWidth: 1))
                            Text(MoodTrackerWidget.dayInitials[index]).font(GlassType.label).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(MoodTrackerWidget.dayNames[index])\(mood.map { ": \(MoodTrackerWidget.moodWords[$0])" } ?? "")")
                    .touchTarget()
                }
            }
            if skin == "mood_wheel" {
                HStack(spacing: 6) {
                    Text(MoodTrackerWidget.moods[latest]).font(.grove(size: 22))
                    Text(MoodTrackerWidget.moodWords[latest]).font(GlassType.value).foregroundStyle(accent)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// A marked day is its weather and nothing else (chips); a month heat map
    /// is its cells; the trend rests as the latest reading (the web plots a
    /// line the port's grammar does not carry).
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let days = MoodTrackerWidget.days(data)
        let marked = days.compactMap { $0 }
        if marked.isEmpty { return .icon }
        let skin = MoodTrackerWidget.skin(data)
        if skin == "month_heatmap" {
            let source = (data.array("days") ?? []).prefix(28)
            return .grid(cols: 7, cells: source.enumerated().map { index, raw in
                let mood = raw.numberValue.flatMap { $0.isFinite ? $0 : nil }
                // The scale runs bright to stormy, so a low reading is a full cell.
                return RestCell(key: "day-\(index)", text: "", fill: mood.map { 1 - $0 / Double(max(1, MoodTrackerWidget.moods.count - 1)) })
            })
        }
        if skin == "trend" {
            // Fewer is better on this scale, so the plot is inverted and a
            // rising line reads as a better week, the way the open card does.
            return .chart(stats: [RestStat(label: "Now", value: MoodTrackerWidget.moods[marked.last!])], series: marked.map { Double(MoodTrackerWidget.moods.count - $0) })
        }
        return .chips(
            chips: days.enumerated().map { index, mood in
                RestChip(key: "day-\(index)", text: mood.map { MoodTrackerWidget.moods[$0] } ?? MoodTrackerWidget.dayInitials[index], tone: mood == nil ? .muted : nil, filled: mood != nil)
            },
            overflow: 0
        )
    }
}
