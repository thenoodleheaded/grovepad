import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Date (`components/widgets/modules/DateWidget.tsx`, `dateSkinModel.ts`,
// `restingFace.ts` date_picker branch). One canonical day (`date`), an
// optional clock time, and seven questions asked of it. Every reading —
// the phrase, the detail, the days — comes from `DateSkinModel.reading`, the
// same owner the `days_until`/`is_due`/`next_occurrence` ports read, so the
// card, the tile and a wire can never disagree. The skin field is `mode`.
//
// Every write goes through `base()` (`{ ...data, mode, date: day, time }`),
// so the first edit of an old card also settles its normalized shape; skin
// pockets are written with `DateSkinModel.dataWithDateState`.
//
// Ported skins: date_time, deadline (lead days), anniversary, relative_date,
// range (the far end), recurring_date (unit and interval), milestone
// (status, owner, deliverable).
// ---------------------------------------------------------------------------

public struct DatePickerWidget: WidgetRenderer {
    public static let type = "date_picker"
    static let skinCopy: [String: (field: String, empty: String)] = [
        "date_time": ("Date", "Pick a day"), "deadline": ("Due", "Set a due date"), "anniversary": ("First occasion", "Pick the first occasion"),
        "relative_date": ("Date", "Pick a day"), "range": ("Start", "Pick a start"), "recurring_date": ("First occurrence", "Pick the first occurrence"), "milestone": ("Target", "Pick a target day"),
    ]

    public init() {}

    static func skin(_ data: JSONObject) -> String { DateSkinModel.skinMode(data["mode"]) }

    /// `base()`: the normalized shape every write starts from, in place.
    static func normalize(_ data: inout JSONObject, skin: String) {
        data["mode"] = .string(skin)
        data["date"] = .string(DateSkinModel.dateDay(data["date"]))
        data["time"] = .string(DateSkinModel.dateTime(data["time"]))
    }

    static func patch(_ context: WidgetCardContext, skin: String, _ mutate: @escaping (inout JSONObject) -> Void) {
        context.update { data in
            normalize(&data, skin: skin)
            mutate(&data)
        }
    }

    static func patchState(_ context: WidgetCardContext, skin: String, _ state: JSONObject) {
        context.update { data in
            normalize(&data, skin: skin)
            data = DateSkinModel.dataWithDateState(data, skin, state)
        }
    }

    static func stateColor(_ state: DateSkinModel.DateState, accent: Color) -> Color {
        switch state {
        case .overdue: return Color(hex: "#f87171")
        case .today: return Color(hex: "#34d399")
        case .upcoming: return accent
        case .unset: return .secondary
        }
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = DatePickerWidget.skin(data)
        let day = DateSkinModel.dateDay(data["date"])
        let time = DateSkinModel.dateTime(data["time"])
        let reading = DateSkinModel.reading(data)
        let accent = Color(hex: context.accent)
        let copy = DatePickerWidget.skinCopy[skin] ?? ("Date", "Pick a day")
        return VStack(alignment: .leading, spacing: 6) {
            CardTextField("Label", text: data.str("label")) { next in
                DatePickerWidget.patch(context, skin: skin) { $0["label"] = .string(next) }
            }
            .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 0) {
                Text(reading.phrase).font(GlassType.hero).foregroundStyle(DatePickerWidget.stateColor(reading.state, accent: accent)).lineLimit(1).minimumScaleFactor(0.6)
                Text(reading.day.isEmpty ? copy.empty : reading.detail).font(GlassType.body).foregroundStyle(.secondary).lineLimit(2)
            }
            if skin == "deadline" {
                let lead = DateSkinModel.deadlineLeadDays(data)
                MeterBar(fraction: DateSkinModel.deadlineProgress(reading.days, lead), tint: DatePickerWidget.stateColor(reading.state, accent: accent))
                HStack(spacing: 4) {
                    GlassLabel("Runway")
                    ForEach(DateSkinModel.deadlineLeadChoices, id: \.self) { choice in
                        ChoiceButton(text: "\(RestText.number(choice))d", selected: lead == choice, tint: accent) {
                            var state = JSONObject()
                            state["leadDays"] = .number(choice)
                            DatePickerWidget.patchState(context, skin: skin, state)
                        }
                    }
                }
            }
            if skin == "anniversary", !day.isEmpty {
                let years = DateSkinModel.anniversaryYears(day, reading.day)
                Text(years == 0 ? "The first occasion" : "\(years)\(years == 1 ? "st" : years == 2 ? "nd" : years == 3 ? "rd" : "th") anniversary").font(GlassType.label).foregroundStyle(.secondary)
            }
            HStack(spacing: 8) {
                GlassLabel(copy.field).frame(width: 60, alignment: .leading)
                DayField(day: day) { next in
                    DatePickerWidget.patch(context, skin: skin) { $0["date"] = .string(next) }
                }
                if !day.isEmpty {
                    GhostButton("xmark", label: "Clear the date") {
                        DatePickerWidget.patch(context, skin: skin) { $0["date"] = .string(""); $0["time"] = .string("") }
                    }
                }
            }
            if skin == "date_time" || skin == "deadline" {
                HStack(spacing: 8) {
                    Toggle(isOn: Binding(get: { JavaScript.truthy(data["includeTime"]) }, set: { next in
                        DatePickerWidget.patch(context, skin: skin) { $0["includeTime"] = .bool(next) }
                    })) { GlassLabel("Time") }
                        .toggleStyle(.switch)
                        .tint(accent)
                        .touchTarget()
                    if JavaScript.truthy(data["includeTime"]) {
                        CardTextField("Time (HH:MM)", text: time) { next in
                            DatePickerWidget.patch(context, skin: skin) { $0["time"] = .string(next) }
                        }
                        .frame(width: 70)
                    }
                }
            }
            if skin == "range" {
                let end = DateSkinModel.rangeEndDay(data)
                HStack(spacing: 8) {
                    GlassLabel("End").frame(width: 60, alignment: .leading)
                    DayField(day: end) { next in
                        var state = JSONObject()
                        state["end"] = .string(next)
                        DatePickerWidget.patchState(context, skin: skin, state)
                    }
                }
                if let span = DateSkinModel.rangeSpan(day, end) {
                    Text("\(RestText.number(span.nights)) \(span.nights == 1 ? "night" : "nights") · \(span.state == .before ? "Ahead" : span.state == .during ? "Under way" : "Over")").font(GlassType.label).foregroundStyle(.secondary)
                    MeterBar(fraction: span.progress, tint: accent)
                }
            }
            if skin == "recurring_date" {
                let rule = DateSkinModel.recurrenceOf(data)
                HStack(spacing: 4) {
                    ForEach(DateSkinModel.RecurrenceUnit.allCases, id: \.rawValue) { unit in
                        ChoiceButton(text: unit.rawValue.capitalized, selected: rule.unit == unit, tint: accent) {
                            var state = JSONObject()
                            state["unit"] = .string(unit.rawValue)
                            state["interval"] = .number(rule.interval)
                            DatePickerWidget.patchState(context, skin: skin, state)
                        }
                    }
                }
                HStack(spacing: 8) {
                    GlassLabel("Every").frame(width: 60, alignment: .leading)
                    GhostButton("minus", label: "Less often") { setInterval(context, skin: skin, rule: rule, rule.interval - 1) }
                    Text("\(RestText.number(rule.interval)) \(rule.unit.rawValue)\(rule.interval == 1 ? "" : "s")").font(GlassType.value).frame(maxWidth: .infinity)
                    GhostButton("plus", label: "More often") { setInterval(context, skin: skin, rule: rule, rule.interval + 1) }
                }
            }
            if skin == "milestone" {
                let detail = DateSkinModel.milestoneDetail(data)
                HStack(spacing: 4) {
                    ForEach(DateSkinModel.MilestoneStatus.allCases, id: \.rawValue) { status in
                        ChoiceButton(text: status.label, selected: detail.status == status, tint: accent) {
                            var state = JSONObject()
                            state["status"] = .string(status.rawValue)
                            DatePickerWidget.patchState(context, skin: skin, state)
                        }
                    }
                }
                CardTextField("Owner", text: detail.owner) { next in
                    var state = JSONObject()
                    state["owner"] = .string(next)
                    DatePickerWidget.patchState(context, skin: skin, state)
                }
                CardTextField("Deliverable", text: detail.deliverable) { next in
                    var state = JSONObject()
                    state["deliverable"] = .string(next)
                    DatePickerWidget.patchState(context, skin: skin, state)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func setInterval(_ context: WidgetCardContext, skin: String, rule: DateSkinModel.Recurrence, _ value: Double) {
        var state = JSONObject()
        state["unit"] = .string(rule.unit.rawValue)
        state["interval"] = .number(max(1, min(99, value)))
        DatePickerWidget.patchState(context, skin: skin, state)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// A folded Date card shows the answer its skin is for: a Deadline rests
    /// as the days left, a Range as its two ends, a Milestone as its status,
    /// the rest as the phrase over the day.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let reading = DateSkinModel.reading(data)
        if reading.day.isEmpty { return .icon }
        if reading.skin == "range" {
            guard let span = DateSkinModel.rangeSpan(DateSkinModel.dateDay(data["date"]), DateSkinModel.rangeEndDay(data)) else { return .icon }
            return .rows(rows: [
                RestRow(key: "span", label: "\(RestText.number(span.nights)) \(span.nights == 1 ? "night" : "nights")", value: DateSkinModel.shortDayText(span.start)),
                RestRow(key: "end", label: "Ends", value: DateSkinModel.shortDayText(span.end)),
            ], overflow: 0)
        }
        if reading.skin == "milestone" {
            let detail = DateSkinModel.milestoneDetail(data)
            var rows = [RestRow(key: "status", label: detail.status.label, value: DateSkinModel.mediumDayText(reading.day))]
            if !detail.owner.isEmpty { rows.append(RestRow(key: "owner", label: RestText.compact(detail.owner, 24), value: reading.phrase)) }
            return .rows(rows: rows, overflow: 0)
        }
        if reading.skin == "deadline" {
            let days = reading.days ?? 0
            return .metric(
                primary: days == 0 ? "Today" : RestText.number(abs(days)),
                secondary: days == 0 ? "Due" : days < 0 ? "Days overdue" : "Days left",
                progress: DateSkinModel.deadlineProgress(days, DateSkinModel.deadlineLeadDays(data))
            )
        }
        return .metric(primary: reading.phrase, secondary: DateSkinModel.mediumDayText(reading.day))
    }
}

/// A `YYYY-MM-DD` day as a compact system date picker beside its text: the
/// picker is the finger's way in, the text field the keyboard's.
struct DayField: View {
    let day: String
    let onChange: (String) -> Void

    var body: some View {
        HStack(spacing: 6) {
            DatePicker(
                "Day",
                selection: Binding(
                    get: { DateSkinModel.dayStart(day) ?? Date(timeIntervalSince1970: FieldClock.nowMs() / 1000) },
                    set: { onChange(DateSkinModel.localDayKey($0.timeIntervalSince1970 * 1000)) }
                ),
                displayedComponents: .date
            )
            .labelsHidden()
            .datePickerStyle(.compact)
            .frame(minHeight: GlassTokens.touchTarget)
            .accessibilityLabel("Pick a day")
            CardTextField("YYYY-MM-DD", text: day, onCommit: onChange)
                .font(GlassType.label)
                .foregroundStyle(.secondary)
                .frame(width: 84)
        }
    }
}
