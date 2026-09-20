import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Calendar (`components/widgets/modules/CalendarWidget.tsx`,
// `calendarSkinModel.ts`, `restingFaces/calendar.ts`). `year`, `month`
// (0-based, as JavaScript counts) and `markedDates` (sorted, unique day keys)
// are the canonical sheet; every skin reads the same marks. The skin field
// is `skin`. Marking a day writes `markedDates` as a sorted set
// (`setMarked`); month navigation writes `year`/`month`; both spread the
// worn skin last (`baseData`).
//
// Ported skins: month, week, agenda, year_heatmap, connected_calendars (the
// Google Calendar agenda — `ExternalCalendars.swift`). availability,
// shift_rota and birthday_and_anniversary render the month with a note;
// their pockets in `skinStates` are preserved untouched.
// ---------------------------------------------------------------------------

public struct CalendarWidget: WidgetRenderer {
    public static let type = "calendar"
    static let skins: Set<String> = ["month", "week", "agenda", "year_heatmap", "availability", "shift_rota", "birthday_and_anniversary", "connected_calendars"]
    static let dayInitials = ["M", "T", "W", "T", "F", "S", "S"]
    static let monthInitials = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "month"
    }

    /// The proleptic Gregorian calendar in the current zone — what a
    /// JavaScript `Date` computes local components with.
    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone.current
        return calendar
    }

    /// `dayKey(date)`.
    static func dayKey(_ date: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return "\(parts.year ?? 0)-\(JavaScript.pad2(parts.month ?? 0))-\(JavaScript.pad2(parts.day ?? 0))"
    }

    /// `dateFromDayKey`: noon of a real calendar day, or nil.
    static func date(fromDayKey raw: String) -> Date? {
        guard DateSkinModel.dayStart(raw) != nil else { return nil }
        var components = DateComponents()
        components.year = Int(raw.prefix(4))
        components.month = Int(raw.dropFirst(5).prefix(2))
        components.day = Int(raw.dropFirst(8).prefix(2))
        components.hour = 12
        return calendar.date(from: components)
    }

    static func addDays(_ iso: String, _ amount: Int) -> String {
        guard let date = date(fromDayKey: iso), let moved = calendar.date(byAdding: .day, value: amount, to: date) else { return iso }
        return dayKey(moved)
    }

    /// `weekDayKeys`: Monday to Sunday around an anchor day.
    static func weekDayKeys(_ anchor: String) -> [String] {
        guard let date = date(fromDayKey: anchor) else { return [] }
        let weekday = calendar.component(.weekday, from: date) // 1 = Sunday
        let mondayOffset = (weekday + 5) % 7
        let monday = addDays(anchor, -mondayOffset)
        return (0..<7).map { addDays(monday, $0) }
    }

    struct Cell: Equatable { var day: Int, inMonth: Bool, iso: String }

    /// `calendarMonthGrid`: a stable six-row, Monday-first month grid.
    static func monthGrid(year: Int, month: Int) -> [Cell] {
        var components = DateComponents()
        components.year = year
        components.month = month + 1
        components.day = 1
        components.hour = 12
        guard let first = calendar.date(from: components) else { return [] }
        let mondayLead = (calendar.component(.weekday, from: first) + 5) % 7
        guard let gridStart = calendar.date(byAdding: .day, value: -mondayLead, to: first) else { return [] }
        return (0..<42).compactMap { index in
            guard let date = calendar.date(byAdding: .day, value: index, to: gridStart) else { return nil }
            let parts = calendar.dateComponents([.year, .month, .day], from: date)
            return Cell(day: parts.day ?? 0, inMonth: parts.month == month + 1 && parts.year == year, iso: dayKey(date))
        }
    }

    static func monthName(year: Int, month: Int, locale: Locale = .current) -> String {
        var components = DateComponents()
        components.year = year
        components.month = month + 1
        components.day = 1
        guard let date = calendar.date(from: components) else { return "" }
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = TimeZone.current
        formatter.setLocalizedDateFormatFromTemplate("MMMM")
        return formatter.string(from: date)
    }

    static func marked(_ data: JSONObject) -> [String] {
        (data.array("markedDates") ?? []).compactMap(\.stringValue)
    }

    /// `year`/`month` as stored, else today's.
    static func yearMonth(_ data: JSONObject, today: Date) -> (year: Int, month: Int) {
        let parts = calendar.dateComponents([.year, .month], from: today)
        let year = data.finite("year").map { Int($0) } ?? (parts.year ?? 2026)
        let month = data.finite("month").map { Int($0) } ?? ((parts.month ?? 1) - 1)
        return (year, month)
    }

    /// `setMarked`: a unique, sorted set, the skin spread last (`baseData`).
    static func writeMarked(_ data: inout JSONObject, _ next: [String], skin: String) {
        data["markedDates"] = .array(Array(Set(next)).sorted().map { .string($0) })
        data["skin"] = .string(skin)
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = CalendarWidget.skin(data)
        let today = Date(timeIntervalSince1970: FieldClock.nowMs() / 1000)
        let todayIso = CalendarWidget.dayKey(today)
        let marked = Set(CalendarWidget.marked(data))
        let accent = Color(hex: context.accent)
        let toggle = { (iso: String) in
            context.update { data in
                let current = CalendarWidget.marked(data)
                CalendarWidget.writeMarked(&data, current.contains(iso) ? current.filter { $0 != iso } : current + [iso], skin: skin)
            }
        }
        return VStack(alignment: .leading, spacing: 6) {
            switch skin {
            case "week":
                weekBody(context, todayIso: todayIso, marked: marked, accent: accent, toggle: toggle)
            case "agenda":
                agendaBody(context, todayIso: todayIso, marked: CalendarWidget.marked(data), accent: accent, toggle: toggle)
            case "year_heatmap":
                yearBody(context, todayIso: todayIso, marked: CalendarWidget.marked(data), accent: accent, skin: skin)
            case "connected_calendars":
                let (year, month) = CalendarWidget.yearMonth(data, today: today)
                ConnectedCalendarsBody(year: year, month: month, monthName: CalendarWidget.monthName(year: year, month: month), accent: accent)
            default:
                if skin != "month" {
                    SkinNote("Shown as the month — the \(skin.replacingOccurrences(of: "_", with: " ")) skin arrives later.")
                }
                monthBody(context, today: today, todayIso: todayIso, marked: marked, accent: accent, skin: skin, toggle: toggle)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func dayCell(_ text: String, marked: Bool, current: Bool, inMonth: Bool, accent: Color) -> some View {
        Text(text)
            .font(.grove(size: 11, weight: current || marked ? .bold : .medium))
            .monospacedDigit()
            .foregroundStyle(marked ? accent : current ? Color.primary : inMonth ? Color.primary.opacity(0.7) : Color.primary.opacity(0.25))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(marked ? accent.opacity(0.22) : Color.clear))
            .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(current ? accent.opacity(0.8) : Color.clear, lineWidth: 1))
            .contentShape(Rectangle())
    }

    private func monthBody(_ context: WidgetCardContext, today: Date, todayIso: String, marked: Set<String>, accent: Color, skin: String, toggle: @escaping (String) -> Void) -> some View {
        let (year, month) = CalendarWidget.yearMonth(context.data, today: today)
        let grid = CalendarWidget.monthGrid(year: year, month: month)
        let shift = { (delta: Int) in
            context.update { data in
                var components = DateComponents()
                components.year = year
                components.month = month + 1 + delta
                components.day = 1
                components.hour = 12
                guard let next = CalendarWidget.calendar.date(from: components) else { return }
                let parts = CalendarWidget.calendar.dateComponents([.year, .month], from: next)
                data["year"] = .number(Double(parts.year ?? year))
                data["month"] = .number(Double((parts.month ?? 1) - 1))
                data["skin"] = .string(skin)
            }
        }
        return VStack(spacing: 4) {
            HStack(spacing: 4) {
                GhostButton("chevron.left", label: "Previous month") { shift(-1) }
                Text("\(CalendarWidget.monthName(year: year, month: month)) \(String(year))").font(GlassType.value).lineLimit(1).frame(maxWidth: .infinity)
                Button("Today") {
                    context.update { data in
                        let parts = CalendarWidget.calendar.dateComponents([.year, .month], from: today)
                        data["year"] = .number(Double(parts.year ?? year))
                        data["month"] = .number(Double((parts.month ?? 1) - 1))
                        data["skin"] = .string(skin)
                    }
                }
                .buttonStyle(.plain).font(GlassType.label).foregroundStyle(accent).touchTarget()
                GhostButton("chevron.right", label: "Next month") { shift(1) }
            }
            HStack(spacing: 2) {
                ForEach(0..<7, id: \.self) { index in
                    Text(CalendarWidget.dayInitials[index]).font(GlassType.label).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                }
            }
            // The lattice fills the card: cells grow with the box, so a bigger
            // card is a bigger finger target (the 44 pt floor cannot fit 42
            // cells in the default 280 × 240 box — see AGENTS.md).
            VStack(spacing: 2) {
                ForEach(0..<6, id: \.self) { row in
                    HStack(spacing: 2) {
                        ForEach(0..<7, id: \.self) { column in
                            let cell = grid[row * 7 + column]
                            Button { toggle(cell.iso) } label: {
                                dayCell(cell.inMonth ? String(cell.day) : "", marked: cell.inMonth && marked.contains(cell.iso), current: cell.iso == todayIso, inMonth: cell.inMonth, accent: accent)
                            }
                            .buttonStyle(.plain)
                            .disabled(!cell.inMonth)
                            .accessibilityLabel("\(cell.iso)\(marked.contains(cell.iso) ? ", marked" : "")")
                            .accessibilityAddTraits(marked.contains(cell.iso) ? .isSelected : [])
                        }
                    }
                }
            }
            .frame(maxHeight: .infinity)
        }
    }

    private func weekBody(_ context: WidgetCardContext, todayIso: String, marked: Set<String>, accent: Color, toggle: @escaping (String) -> Void) -> some View {
        let days = CalendarWidget.weekDayKeys(todayIso)
        return VStack(spacing: 6) {
            HStack {
                GlassLabel("This week")
                Text("\(days.filter { marked.contains($0) }.count) marked").font(GlassType.label).foregroundStyle(.secondary)
            }
            HStack(spacing: 4) {
                ForEach(Array(days.enumerated()), id: \.element) { index, iso in
                    Button { toggle(iso) } label: {
                        VStack(spacing: 2) {
                            Text(CalendarWidget.dayInitials[index]).font(GlassType.label).foregroundStyle(.secondary)
                            dayCell(String(Int(iso.suffix(2)) ?? 0), marked: marked.contains(iso), current: iso == todayIso, inMonth: true, accent: accent)
                                .frame(height: 44)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(iso)\(marked.contains(iso) ? ", marked" : "")")
                    .touchTarget()
                }
            }
        }
    }

    private func agendaBody(_ context: WidgetCardContext, todayIso: String, marked: [String], accent: Color, toggle: @escaping (String) -> Void) -> some View {
        let sorted = marked.sorted()
        return VStack(alignment: .leading, spacing: 2) {
            HStack {
                GlassLabel("Agenda")
                Text("\(marked.count) marked").font(GlassType.label).foregroundStyle(.secondary)
            }
            ForEach(sorted, id: \.self) { iso in
                HStack(spacing: 8) {
                    Text(DateSkinModel.shortDayText(iso).isEmpty ? iso : DateSkinModel.shortDayText(iso)).font(GlassType.body).monospacedDigit().foregroundStyle(iso == todayIso ? accent : Color.primary.opacity(0.85))
                    Text(iso == todayIso ? "Today" : iso < todayIso ? "Past" : "Marked").font(GlassType.label).foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    RowDeleteButton(label: "Unmark \(iso)") { toggle(iso) }
                }
            }
            if !marked.contains(todayIso) {
                Button { toggle(todayIso) } label: {
                    Label("Mark today", systemImage: "plus").font(GlassType.body).foregroundStyle(accent)
                }
                .buttonStyle(.plain)
                .touchTarget()
            }
        }
    }

    private func yearBody(_ context: WidgetCardContext, todayIso: String, marked: [String], accent: Color, skin: String) -> some View {
        let (year, _) = CalendarWidget.yearMonth(context.data, today: Date(timeIntervalSince1970: FieldClock.nowMs() / 1000))
        let markedSet = Set(marked)
        let yearMarked = marked.filter { $0.hasPrefix("\(year)-") }.count
        let shiftYear = { (delta: Int) in
            context.update { data in
                data["year"] = .number(Double(year + delta))
                data["skin"] = .string(skin)
            }
        }
        return VStack(spacing: 4) {
            HStack(spacing: 4) {
                GhostButton("chevron.left", label: "Previous year") { shiftYear(-1) }
                Text(String(year)).font(GlassType.value).frame(maxWidth: .infinity)
                Text("\(yearMarked) active days").font(GlassType.label).foregroundStyle(.secondary)
                GhostButton("chevron.right", label: "Next year") { shiftYear(1) }
            }
            VStack(spacing: 2) {
                ForEach(0..<12, id: \.self) { month in
                    let days = CalendarWidget.monthGrid(year: year, month: month).filter(\.inMonth)
                    HStack(spacing: 1) {
                        Text(CalendarWidget.monthInitials[month]).font(GlassType.label).foregroundStyle(.secondary).frame(width: 12)
                        ForEach(days, id: \.iso) { cell in
                            RoundedRectangle(cornerRadius: 1).fill(markedSet.contains(cell.iso) ? accent : Color.lift.opacity(cell.iso == todayIso ? 0.3 : 0.08)).frame(maxWidth: .infinity).frame(height: 8)
                        }
                        if days.count < 31 { Spacer(minLength: 0).frame(maxWidth: .infinity) }
                    }
                }
            }
            SkinNote("Mark days on the month skin; the heat map reads them.")
        }
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// The month's own lattice (marked days accent, today neutral, the rest
    /// muted), the week as one row, the agenda as dated rows, the year as
    /// twelve month initials. The web's grid also carries a `header` row and
    /// per-cell fills; this port's grid carries tone alone.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let skin = CalendarWidget.skin(data)
        let today = Date(timeIntervalSince1970: FieldClock.nowMs() / 1000)
        let todayIso = CalendarWidget.dayKey(today)
        let markedDates = CalendarWidget.marked(data)
        let marked = Set(markedDates)
        let (year, month) = CalendarWidget.yearMonth(data, today: today)
        switch skin {
        case "year_heatmap":
            // Twelve months across one row of initials, each a lit/unlit run
            // of days — the open heat map's reading at a twelfth the cells.
            let currentMonth = (CalendarWidget.calendar.component(.month, from: today) - 1, CalendarWidget.calendar.component(.year, from: today))
            let cells = (0..<12).map { index -> RestCell in
                let active = CalendarWidget.monthGrid(year: year, month: index).filter { $0.inMonth && marked.contains($0.iso) }.count
                return RestCell(
                    key: "month-\(index)", text: CalendarWidget.monthInitials[index], tone: active == 0 ? .muted : nil,
                    fill: active == 0 ? nil : min(1, Double(active) / 8), current: index == currentMonth.0 && year == currentMonth.1
                )
            }
            return .grid(cols: 12, cells: cells, eyebrow: RestEyebrow(label: String(year), note: "\(markedDates.filter { $0.hasPrefix("\(year)-") }.count) active days"))
        case "agenda":
            let upcoming = markedDates.filter { $0 >= todayIso }.sorted()
            let source = upcoming.isEmpty ? Array(markedDates.sorted().suffix(RestingFaceMeasure.rowLimit)) : upcoming
            let shown = Array(source.prefix(RestingFaceMeasure.rowLimit))
            if shown.isEmpty { return .icon }
            return .rows(
                rows: shown.map { iso in
                    let short = DateSkinModel.shortDayText(iso)
                    return RestRow(key: iso, label: iso == todayIso ? "Today" : "Marked", lead: short.isEmpty ? iso : short, tone: iso == todayIso ? .accent : .muted)
                },
                overflow: max(0, source.count - shown.count),
                eyebrow: RestEyebrow(label: "Agenda", note: "\(markedDates.count) marked")
            )
        case "week":
            let days = CalendarWidget.weekDayKeys(todayIso)
            return .grid(
                cols: 7,
                cells: days.map { iso in
                    RestCell(key: iso, text: String(Int(iso.suffix(2)) ?? 0), tone: marked.contains(iso) || iso == todayIso ? nil : .muted, fill: marked.contains(iso) ? 0.6 : nil, current: iso == todayIso)
                },
                eyebrow: RestEyebrow(label: "This week", note: "\(days.filter { marked.contains($0) }.count) marked"),
                header: CalendarWidget.dayInitials
            )
        case "availability":
            let days = CalendarWidget.weekDayKeys(todayIso)
            let busy = data.skinState(skin).object("busy") ?? JSONObject()
            var cells: [RestCell] = []
            var busyCount = 0
            // Three rows — morning, afternoon, evening — against seven days,
            // filled where the slot is taken. That grid IS the answer.
            for slot in ["morning", "afternoon", "evening"] {
                for iso in days {
                    let slots = (busy.array(iso) ?? []).compactMap(\.stringValue)
                    let taken = slots.contains(slot)
                    cells.append(RestCell(key: "\(slot)-\(iso)", text: "", tone: taken ? .bad : .muted, fill: taken ? 1 : nil))
                }
            }
            for (_, value) in busy.entries { busyCount += (value.arrayValue ?? []).count }
            return .grid(cols: 7, cells: cells, eyebrow: RestEyebrow(label: "Availability", note: "\(busyCount) busy"), header: CalendarWidget.dayInitials)
        case "shift_rota":
            let state = data.skinState(skin)
            let days = CalendarWidget.weekDayKeys(todayIso)
            let shifts = state.object("shifts") ?? JSONObject()
            let hours = ["off": "Off", "morning": "07–15", "evening": "15–23", "night": "23–07"]
            let tones: [String: RestTone] = ["off": .muted, "morning": .accent, "evening": .warn, "night": .bad]
            let working = days.filter { (shifts.string($0) ?? "off") != "off" }.count
            let assignee = JavaScript.trim(state.str("assignee"))
            return .columns(
                columns: days.enumerated().map { index, iso in
                    let shift = hours[shifts.string(iso) ?? "off"] == nil ? "off" : (shifts.string(iso) ?? "off")
                    return RestColumn(key: iso, label: CalendarWidget.dayInitials[index], tone: tones[shift], items: [RestRow(key: "\(iso)-shift", label: hours[shift] ?? "Off")], overflow: 0)
                },
                eyebrow: RestEyebrow(label: RestText.compact(assignee.isEmpty ? "Shift rota" : assignee, 18), note: "\(working)/7 on")
            )
        case "birthday_and_anniversary":
            let occasions = (data.skinState(skin).array("occasions") ?? []).compactMap(\.objectValue)
                .filter { $0.string("id") != nil && $0.string("name") != nil && $0.string("date") != nil }
                .sorted { $0.str("date") < $1.str("date") }
            if occasions.isEmpty { return .icon }
            let visible = Array(occasions.prefix(RestingFaceMeasure.rowLimit))
            return .rows(
                rows: visible.map { occasion in
                    let name = JavaScript.trim(occasion.str("name"))
                    let short = DateSkinModel.shortDayText("2000-\(occasion.str("date"))")
                    return RestRow(key: occasion.str("id"), label: RestText.compact(name.isEmpty ? "Untitled" : name, 22), value: short.isEmpty ? occasion.str("date") : short, tone: occasion.string("kind") == "anniversary" ? .accent : nil)
                },
                overflow: max(0, occasions.count - visible.count),
                eyebrow: RestEyebrow(label: "Occasions", note: String(occasions.count))
            )
        case "connected_calendars":
            return .rows(rows: [RestRow(key: "google", label: "Google Calendar", value: "Open to view", tone: .muted)], overflow: 0, eyebrow: RestEyebrow(label: "Connected calendars", note: "Private"))
        default:
            // month — the calendar's own lattice, weeks down and days across.
            let grid = CalendarWidget.monthGrid(year: year, month: month)
            return .grid(
                cols: 7,
                cells: grid.map { cell in
                    let lit = cell.inMonth && (marked.contains(cell.iso) || cell.iso == todayIso)
                    return RestCell(key: cell.iso, text: cell.inMonth ? String(cell.day) : "", tone: lit ? nil : .muted, fill: cell.inMonth && marked.contains(cell.iso) ? 0.65 : nil, current: cell.iso == todayIso)
                },
                eyebrow: RestEyebrow(label: CalendarWidget.monthName(year: year, month: month), note: String(year)),
                header: CalendarWidget.dayInitials
            )
        }
    }
}
