import SwiftUI
#if canImport(WidgetKit)
import WidgetKit
#endif

// ---------------------------------------------------------------------------
// Draws one `HomeWidgetCard` at a home-screen size. The same grammars the
// canvas's resting tiles use (`WidgetRestingFaceView`), re-laid for the
// system's fixed widget boxes: the box decides how much fits, the face keeps
// its shape, and whatever does not fit is counted ("+3 more"), never cut
// silently. Static by design — WidgetKit renders once per timeline entry —
// except a running clock, which ticks through `Text(timerInterval:)`.
//
// Lives in the shared module (not the extension) so the app's tests can
// render every grammar at every size to PNG.
// ---------------------------------------------------------------------------

/// The system box being drawn into.
public enum HomeWidgetLayout: String, CaseIterable, Sendable {
    case small, medium, large, extraLarge, rectangular, inline, circular

    /// How much of each grammar fits.
    struct Capacity {
        var rows: Int
        var textLines: Int
        var chips: Int
        var bars: Int
        var columns: Int
        var columnItems: Int
        var gridRows: Int
        var nodes: Int
        var showsCanvas: Bool
    }

    var capacity: Capacity {
        switch self {
        case .small: return Capacity(rows: 4, textLines: 6, chips: 4, bars: 3, columns: 2, columnItems: 2, gridRows: 4, nodes: 2, showsCanvas: false)
        case .medium: return Capacity(rows: 4, textLines: 4, chips: 8, bars: 3, columns: 4, columnItems: 3, gridRows: 4, nodes: 4, showsCanvas: true)
        case .large: return Capacity(rows: 11, textLines: 15, chips: 16, bars: 8, columns: 4, columnItems: 6, gridRows: 8, nodes: 4, showsCanvas: true)
        case .extraLarge: return Capacity(rows: 11, textLines: 15, chips: 16, bars: 8, columns: 6, columnItems: 6, gridRows: 8, nodes: 6, showsCanvas: true)
        case .rectangular, .inline, .circular: return Capacity(rows: 2, textLines: 2, chips: 2, bars: 1, columns: 1, columnItems: 1, gridRows: 1, nodes: 2, showsCanvas: false)
        }
    }

    var isAccessory: Bool { self == .rectangular || self == .inline || self == .circular }
}

/// What a widget instance has to show.
public enum HomeWidgetContent: Equatable, Sendable {
    case card(HomeWidgetCard)
    /// Nothing chosen yet (freshly added).
    case unconfigured
    /// The chosen card is no longer on the board.
    case missing(title: String?)
    /// No mirror to read: the app has not run since install, or this build
    /// has no App Group.
    case unavailable
}

public struct HomeWidgetView: View {
    let content: HomeWidgetContent
    let layout: HomeWidgetLayout
    let now: Date

    public init(content: HomeWidgetContent, layout: HomeWidgetLayout, now: Date = Date()) {
        self.content = content
        self.layout = layout
        self.now = now
    }

    public var body: some View {
        switch content {
        case .card(let card):
            if layout.isAccessory {
                HomeAccessoryView(card: card, layout: layout, now: now)
            } else {
                HomeCardView(card: card, layout: layout, now: now)
            }
        case .unconfigured:
            HomePromptView(symbol: "square.grid.2x2", title: "Choose a widget", message: "Touch and hold, then Edit Widget to pick a canvas and one of its widgets.", layout: layout)
        case .missing(let title):
            HomePromptView(symbol: "rectangle.slash", title: title.map { "“\($0)” is gone" } ?? "Widget removed", message: "It was deleted from its canvas. Edit this widget to choose another.", layout: layout)
        case .unavailable:
            HomePromptView(symbol: "arrow.clockwise", title: "Open Grovepad", message: "Your canvases appear here after Grovepad has opened once.", layout: layout)
        }
    }
}

/// The widget's ground: the app's near-black (or paper, in light mode) with
/// the card's accent blooming from the top corner, as an open card wears it.
public struct HomeWidgetBackground: View {
    let accent: String
    @Environment(\.colorScheme) private var scheme

    public init(accent: String) {
        self.accent = accent
    }

    public var body: some View {
        let hue = Color(homeHex: accent)
        ZStack {
            (scheme == .dark ? Color(homeHex: "#0c0f0e") : Color(homeHex: "#f6f7f4"))
            RadialGradient(colors: [hue.opacity(scheme == .dark ? 0.30 : 0.20), .clear], center: .topLeading, startRadius: 0, endRadius: 260)
            LinearGradient(colors: [Color.white.opacity(scheme == .dark ? 0.05 : 0.35), .clear], startPoint: .top, endPoint: .center)
        }
    }
}

// MARK: - The card

struct HomeCardView: View {
    let card: HomeWidgetCard
    let layout: HomeWidgetLayout
    let now: Date

    private var accent: Color { Color(homeHex: card.accent) }
    private var cap: HomeWidgetLayout.Capacity { layout.capacity }

    var body: some View {
        VStack(alignment: .leading, spacing: layout == .small ? 6 : 8) {
            header
            HomeFaceView(face: card.face, card: card, layout: layout, accent: accent, now: now)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(HomeWidgetSummary.accessibilityLabel(card))
    }

    private var header: some View {
        HStack(spacing: 6) {
            Image(systemName: card.symbol)
                .font(.system(size: layout == .small ? 11 : 12, weight: .semibold))
                .foregroundStyle(accent)
                .homeAccentable()
            Text(card.displayTitle)
                .font(.system(size: layout == .small ? 12 : 13, weight: .semibold, design: .rounded))
                .lineLimit(1)
                .foregroundStyle(.primary)
            Spacer(minLength: 4)
            if cap.showsCanvas {
                Text(card.canvasName)
                    .font(.system(size: 10.5, weight: .medium, design: .rounded))
                    .lineLimit(1)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// One grammar, laid into the space the header leaves.
struct HomeFaceView: View {
    let face: HomeWidgetFace
    let card: HomeWidgetCard
    let layout: HomeWidgetLayout
    let accent: Color
    let now: Date

    private var cap: HomeWidgetLayout.Capacity { layout.capacity }
    private var compact: Bool { layout == .small }

    var body: some View {
        switch face {
        case .empty:
            HomeEmptyFace(symbol: card.symbol, kind: card.kind, accent: accent)
        case .note(let text, let sticky, let mono):
            noteFace(text: text, sticky: sticky, mono: mono)
        case .rows(let eyebrow, let rows, let overflow, let meter):
            rowsFace(eyebrow: eyebrow, rows: rows, overflow: overflow, meter: meter)
        case .boolean(let label, let active, let shape, let tone):
            booleanFace(label: label, active: active, shape: shape, tone: tone)
        case .metric(let eyebrow, let primary, let secondary, let progress, let tone):
            metricFace(eyebrow: eyebrow, primary: primary, secondary: secondary, progress: progress, tone: tone)
        case .text(let text, let tint):
            Text(text)
                .font(.system(size: compact ? 13 : 14, design: .rounded))
                .lineSpacing(2)
                .lineLimit(cap.textLines)
                .foregroundStyle(tint.map { Color(homeHex: $0) } ?? Color.primary.opacity(0.85))
        case .clock(let eyebrow, let clock, let chips, let rows):
            clockFace(eyebrow: eyebrow, clock: clock, chips: chips, rows: rows)
        case .chart(let stats, let series, let colors):
            chartFace(stats: stats, series: series, colors: colors)
        case .stars(let value):
            starsFace(value)
        case .columns(let eyebrow, let columns, _):
            columnsFace(eyebrow: eyebrow, columns: columns)
        case .grid(let eyebrow, let cols, let cells, let header, let dense):
            gridFace(eyebrow: eyebrow, cols: cols, cells: cells, header: header, dense: dense)
        case .bars(let eyebrow, let bars):
            barsFace(eyebrow: eyebrow, bars: bars)
        case .gauge(let eyebrow, let progress, let primary, let secondary, let caption, let tone):
            gaugeFace(eyebrow: eyebrow, progress: progress, primary: primary, secondary: secondary, caption: caption, tone: tone)
        case .chips(let eyebrow, let chips, let overflow):
            chipsFace(eyebrow: eyebrow, chips: chips, overflow: overflow)
        case .lines(let eyebrow, let lines, let mono, let total):
            linesFace(eyebrow: eyebrow, lines: lines, mono: mono, total: total)
        case .chain(let eyebrow, let nodes, _, let overflow):
            chainFace(eyebrow: eyebrow, nodes: nodes, overflow: overflow)
        case .split(let eyebrow, let left, let right, let divider):
            splitFace(eyebrow: eyebrow, left: left, right: right, divider: divider)
        case .canvas(let name, let subtitle, let count):
            canvasFace(name: name, subtitle: subtitle, count: count)
        }
    }

    // MARK: Shared pieces

    private func ink(_ tone: HomeTone?) -> Color { homeToneColor(tone, accent: accent) }

    @ViewBuilder
    private func eyebrowView(_ eyebrow: HomeEyebrow?) -> some View {
        if let eyebrow {
            HStack(spacing: 6) {
                Text(eyebrow.label.uppercased())
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .tracking(0.8)
                    .lineLimit(1)
                    .foregroundStyle(ink(eyebrow.tone ?? .accent))
                Spacer(minLength: 0)
                if let note = eyebrow.note {
                    Text(note).font(.system(size: 10, weight: .medium, design: .rounded)).monospacedDigit().lineLimit(1).foregroundStyle(.secondary)
                }
            }
        }
    }

    private func more(_ count: Int) -> some View {
        Text("+\(count) more")
            .font(.system(size: 10, weight: .medium, design: .rounded))
            .foregroundStyle(.secondary)
    }

    private func meterBar(_ fraction: Double, tone: HomeTone? = nil) -> some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.primary.opacity(0.1))
                Capsule().fill(tone == nil ? accent : ink(tone))
                    .frame(width: max(3, proxy.size.width * homeClamp(fraction)))
                    .homeAccentable()
            }
        }
        .frame(height: 4)
    }

    private func chip(_ chip: HomeChip) -> some View {
        let color = ink(chip.tone)
        return Text(chip.text)
            .font(.system(size: 10.5, weight: .medium, design: .rounded))
            .lineLimit(1)
            .padding(.horizontal, 7)
            .frame(height: 19)
            .background(Capsule().fill(chip.filled ? color.opacity(0.18) : Color.clear))
            .overlay(Capsule().strokeBorder(chip.filled ? color.opacity(0.35) : Color.primary.opacity(0.14), lineWidth: 1))
            .foregroundStyle(chip.filled ? color : Color.primary.opacity(0.7))
    }

    // MARK: Note

    private func noteFace(text: String, sticky: Bool, mono: Bool) -> some View {
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return Text(words.isEmpty ? "Empty note" : words)
            .font(mono ? .system(size: compact ? 12 : 13, design: .monospaced) : .system(size: compact ? 13.5 : 15, design: .rounded))
            .lineSpacing(2)
            .lineLimit(cap.textLines + (compact ? 0 : 1))
            .foregroundStyle(sticky ? Color(red: 0.2, green: 0.16, blue: 0.02) : (words.isEmpty ? Color.secondary : Color.primary.opacity(0.9)))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(sticky ? 10 : 0)
            .background {
                if sticky {
                    RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color(homeHex: "#fcd34d").opacity(0.9))
                }
            }
    }

    // MARK: Rows

    private func rowsFace(eyebrow: HomeEyebrow?, rows: [HomeRow], overflow: Int, meter: Double?) -> some View {
        let shown = Array(rows.prefix(cap.rows))
        let hidden = overflow + rows.count - shown.count
        return VStack(alignment: .leading, spacing: compact ? 4 : 5) {
            eyebrowView(eyebrow)
            if let meter { meterBar(meter).padding(.bottom, 2) }
            ForEach(Array(shown.enumerated()), id: \.offset) { _, row in rowView(row) }
            if hidden > 0 { more(hidden) }
        }
    }

    private func rowView(_ row: HomeRow) -> some View {
        HStack(spacing: 6) {
            if let lead = row.lead {
                Text(lead).font(.system(size: 10.5, weight: .semibold, design: .rounded)).monospacedDigit().foregroundStyle(ink(row.tone ?? .muted))
            }
            if let done = row.done {
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(done ? accent : Color.secondary)
                    .homeAccentable(done)
            } else if row.marker {
                Circle().fill(accent).frame(width: 5, height: 5).frame(width: 12).homeAccentable()
            }
            Text(row.label)
                .font(.system(size: compact ? 12 : 13, weight: .medium, design: .rounded))
                .lineLimit(1)
                .strikethrough(row.done == true)
                .foregroundStyle(row.done == true ? Color.secondary : ink(row.tone))
            Spacer(minLength: 4)
            if let value = row.value {
                Text(value).font(.system(size: 11.5, weight: .semibold, design: .rounded)).monospacedDigit().lineLimit(1).foregroundStyle(.secondary)
            }
        }
        .padding(.leading, CGFloat(min(row.indent, 4)) * 12)
    }

    // MARK: Single readings

    private func booleanFace(label: String, active: Bool, shape: String, tone: HomeTone?) -> some View {
        let symbol: String
        switch shape {
        case "checkbox": symbol = active ? "checkmark.square.fill" : "square"
        case "power": symbol = "power.circle.fill"
        default: symbol = "switch.2"
        }
        return VStack(alignment: .leading, spacing: 8) {
            Spacer(minLength: 0)
            HStack(spacing: 10) {
                if shape == "switch" {
                    Capsule().fill(active ? (tone == nil ? accent : ink(tone)) : Color.primary.opacity(0.18))
                        .frame(width: 40, height: 24)
                        .overlay(alignment: active ? .trailing : .leading) { Circle().fill(.white).padding(3) }
                        .homeAccentable(active)
                } else {
                    Image(systemName: symbol).font(.system(size: 26, weight: .semibold))
                        .foregroundStyle(active ? (tone == nil ? accent : ink(tone)) : Color.secondary)
                        .homeAccentable(active)
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(active ? "On" : "Off").font(.system(size: 20, weight: .semibold, design: .rounded))
                    Text(label).font(.system(size: 12, design: .rounded)).lineLimit(2).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func metricFace(eyebrow: HomeEyebrow?, primary: String, secondary: String, progress: Double?, tone: HomeTone?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            eyebrowView(eyebrow)
            Spacer(minLength: 0)
            Text(primary)
                .font(.system(size: layout == .small ? 34 : 40, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .minimumScaleFactor(0.4)
                .lineLimit(1)
                .foregroundStyle(tone == nil ? Color.primary : ink(tone))
            Text(secondary).font(.system(size: 12, weight: .medium, design: .rounded)).lineLimit(2).foregroundStyle(.secondary)
            if let progress { meterBar(progress, tone: tone).padding(.top, 4) }
            Spacer(minLength: 0)
        }
    }

    private func starsFace(_ value: Double) -> some View {
        let filled = Int(max(0, min(5, value.rounded())))
        return VStack(alignment: .leading, spacing: 6) {
            Spacer(minLength: 0)
            HStack(spacing: 4) {
                ForEach(0..<5, id: \.self) { index in
                    Image(systemName: index < filled ? "star.fill" : "star")
                        .font(.system(size: compact ? 20 : 24))
                        .foregroundStyle(index < filled ? accent : Color.primary.opacity(0.22))
                        .homeAccentable(index < filled)
                }
            }
            Text("\(filled) of 5").font(.system(size: 12, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
    }

    private func gaugeFace(eyebrow: HomeEyebrow?, progress: Double, primary: String, secondary: String, caption: String?, tone: HomeTone?) -> some View {
        let ring = layout == .small ? 74.0 : 86.0
        return VStack(alignment: .leading, spacing: 6) {
            eyebrowView(eyebrow)
            HStack(spacing: 14) {
                ZStack {
                    Circle().stroke(Color.primary.opacity(0.1), lineWidth: 8)
                    Circle().trim(from: 0, to: homeClamp(progress))
                        .stroke(tone == nil ? accent : ink(tone), style: StrokeStyle(lineWidth: 8, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .homeAccentable()
                    Text(primary).font(.system(size: 17, weight: .semibold, design: .rounded)).monospacedDigit().minimumScaleFactor(0.5).lineLimit(1).padding(10)
                }
                .frame(width: ring, height: ring)
                if !compact {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(secondary).font(.system(size: 13, weight: .medium, design: .rounded)).lineLimit(3)
                        if let caption { Text(caption).font(.system(size: 11.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(3) }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: compact ? .center : .leading)
            if compact { Text(secondary).font(.system(size: 11, weight: .medium, design: .rounded)).lineLimit(1).foregroundStyle(.secondary) }
        }
    }

    private func splitFace(eyebrow: HomeEyebrow?, left: HomeReadout, right: HomeReadout, divider: String?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            eyebrowView(eyebrow)
            Spacer(minLength: 0)
            HStack(alignment: .center, spacing: 10) {
                readout(left)
                Text(divider ?? "·").font(.system(size: 14, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                readout(right)
            }
            Spacer(minLength: 0)
        }
    }

    private func readout(_ readout: HomeReadout) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(readout.primary).font(.system(size: compact ? 20 : 26, weight: .semibold, design: .rounded)).monospacedDigit().minimumScaleFactor(0.5).lineLimit(1)
                .foregroundStyle(readout.tone == nil ? Color.primary : ink(readout.tone))
            Text(readout.secondary).font(.system(size: 11, design: .rounded)).lineLimit(2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Clock

    private func clockFace(eyebrow: HomeEyebrow?, clock: HomeClock?, chips: [HomeChip], rows: [HomeRow]) -> some View {
        var ink = Color.primary
        if let clock {
            if clock.urgent { ink = Color(homeHex: "#f87171") }
            else if clock.running, clock.tone == "work" { ink = Color(homeHex: "#fb7185") }
            else if clock.running, clock.tone == "break" { ink = Color(homeHex: "#34d399") }
        }
        return VStack(alignment: .leading, spacing: 4) {
            eyebrowView(eyebrow)
            Spacer(minLength: 0)
            clockReadout(clock)
                .font(.system(size: compact ? 32 : 40, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.4)
                .foregroundStyle(ink)
            Text((clock?.caption ?? "Idle").uppercased())
                .font(.system(size: 10, weight: .semibold, design: .rounded)).tracking(1).foregroundStyle(.secondary)
            if let clock { meterBar(clock.fraction).padding(.top, 2) }
            if !chips.isEmpty, !compact {
                HStack(spacing: 4) { ForEach(Array(chips.prefix(cap.chips).enumerated()), id: \.offset) { _, item in chip(item) } }
            }
            if !compact {
                ForEach(Array(rows.prefix(max(0, cap.rows - 2)).enumerated()), id: \.offset) { _, row in rowView(row) }
            }
            Spacer(minLength: 0)
        }
    }

    /// A running clock ticks on its own; a still one shows its reading.
    @ViewBuilder
    private func clockReadout(_ clock: HomeClock?) -> some View {
        if let end = card.live?.countsDownToMs, clock?.running == true {
            let endDate = Date(timeIntervalSince1970: end / 1000)
            if endDate > now {
                Text(timerInterval: now...endDate, countsDown: true)
            } else {
                Text("0:00")
            }
        } else if let start = card.live?.countsUpFromMs, clock?.running == true {
            Text(Date(timeIntervalSince1970: start / 1000), style: .timer)
        } else {
            Text(clock?.readout ?? "--:--")
        }
    }

    // MARK: Chart

    private func chartFace(stats: [HomeStat], series: [Double], colors: [String?]) -> some View {
        let plot = HomeSparkBars(series: series, colors: colors, accent: accent)
        return Group {
            if compact {
                VStack(alignment: .leading, spacing: 6) {
                    plot
                    HStack(spacing: 10) { ForEach(Array(stats.prefix(2).enumerated()), id: \.offset) { _, stat in statView(stat) } }
                }
            } else {
                HStack(alignment: .top, spacing: 14) {
                    plot
                    VStack(alignment: .leading, spacing: 8) { ForEach(Array(stats.prefix(4).enumerated()), id: \.offset) { _, stat in statView(stat) } }
                        .frame(width: 84, alignment: .leading)
                }
            }
        }
    }

    private func statView(_ stat: HomeStat) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(stat.label.uppercased()).font(.system(size: 8.5, weight: .bold, design: .rounded)).tracking(0.8).foregroundStyle(.secondary)
            Text(stat.value).font(.system(size: 14, weight: .semibold, design: .rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
        }
    }

    // MARK: Many small things

    private func columnsFace(eyebrow: HomeEyebrow?, columns: [HomeColumn]) -> some View {
        let shown = Array(columns.prefix(cap.columns))
        return VStack(alignment: .leading, spacing: 6) {
            eyebrowView(eyebrow)
            HStack(alignment: .top, spacing: 6) {
                ForEach(Array(shown.enumerated()), id: \.offset) { _, column in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 4) {
                            Text(column.label.uppercased()).font(.system(size: 8.5, weight: .bold, design: .rounded)).tracking(0.6).lineLimit(1).foregroundStyle(ink(column.tone ?? .accent))
                            Spacer(minLength: 0)
                            Text(column.note ?? "\(column.items.count + column.overflow)").font(.system(size: 9, weight: .medium, design: .rounded)).monospacedDigit().foregroundStyle(.secondary)
                        }
                        let items = Array(column.items.prefix(cap.columnItems))
                        ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                            Text(item.label)
                                .font(.system(size: 10.5, weight: .medium, design: .rounded))
                                .lineLimit(2)
                                .strikethrough(item.done == true)
                                .padding(.horizontal, 6).padding(.vertical, 4)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Color.primary.opacity(0.07)))
                        }
                        let hidden = column.overflow + column.items.count - items.count
                        if hidden > 0 { more(hidden) }
                    }
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                }
            }
            if columns.count > shown.count { more(columns.count - shown.count) }
        }
    }

    private func gridFace(eyebrow: HomeEyebrow?, cols: Int, cells: [HomeCell], header: [String]?, dense: Bool) -> some View {
        let columns = max(1, cols)
        let rowsAvailable = cap.gridRows
        let shown = Array(cells.prefix(columns * rowsAvailable))
        let grid = Array(repeating: GridItem(.flexible(), spacing: dense ? 3 : 8), count: columns)
        return VStack(alignment: .leading, spacing: 5) {
            eyebrowView(eyebrow)
            LazyVGrid(columns: grid, alignment: .leading, spacing: dense ? 3 : 4) {
                if let header {
                    ForEach(Array(header.prefix(columns).enumerated()), id: \.offset) { _, label in
                        Text(label.uppercased()).font(.system(size: 8, weight: .bold, design: .rounded)).lineLimit(1).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: dense ? .center : .leading)
                    }
                }
                ForEach(Array(shown.enumerated()), id: \.offset) { _, cell in
                    if dense {
                        denseCell(cell)
                    } else {
                        Text(cell.text).font(.system(size: 11, weight: .medium, design: .rounded)).lineLimit(1)
                            .foregroundStyle(ink(cell.tone))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            let hidden = (cells.count - shown.count) / columns
            if hidden > 0 { more(hidden) }
        }
    }

    /// Fixed per box, never from the width: a wide box would grow square
    /// cells taller than it is.
    private var denseCellHeight: CGFloat {
        switch layout {
        case .small: return 16
        case .medium: return 15
        default: return 28
        }
    }

    private func denseCell(_ cell: HomeCell) -> some View {
        let fill = cell.fill.map { homeClamp($0) }
        return RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(fill.map { (cell.tone == nil ? accent : ink(cell.tone)).opacity(0.18 + 0.72 * $0) } ?? Color.primary.opacity(0.06))
            .frame(height: denseCellHeight)
            .overlay {
                if !cell.text.isEmpty {
                    Text(cell.text).font(.system(size: 8.5, weight: .medium, design: .rounded)).monospacedDigit().minimumScaleFactor(0.5).lineLimit(1)
                        .foregroundStyle(fill != nil && fill! > 0.5 ? Color.white : Color.primary.opacity(0.8))
                }
            }
            .overlay {
                if cell.current { RoundedRectangle(cornerRadius: 3, style: .continuous).strokeBorder(accent, lineWidth: 1.5) }
            }
    }

    private func barsFace(eyebrow: HomeEyebrow?, bars: [HomeBar]) -> some View {
        let shown = Array(bars.prefix(cap.bars))
        return VStack(alignment: .leading, spacing: 7) {
            eyebrowView(eyebrow)
            ForEach(Array(shown.enumerated()), id: \.offset) { _, bar in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(bar.label).font(.system(size: 11.5, weight: .medium, design: .rounded)).lineLimit(1)
                        Spacer(minLength: 4)
                        Text(bar.value).font(.system(size: 11, weight: .semibold, design: .rounded)).monospacedDigit().foregroundStyle(.secondary)
                    }
                    meterBar(bar.fraction, tone: bar.tone)
                }
            }
            if bars.count > shown.count { more(bars.count - shown.count) }
        }
    }

    private func chipsFace(eyebrow: HomeEyebrow?, chips: [HomeChip], overflow: Int) -> some View {
        let shown = Array(chips.prefix(cap.chips))
        let hidden = overflow + chips.count - shown.count
        return VStack(alignment: .leading, spacing: 6) {
            eyebrowView(eyebrow)
            HomeFlowLayout(spacing: 4) {
                ForEach(Array(shown.enumerated()), id: \.offset) { _, item in chip(item) }
            }
            if hidden > 0 { more(hidden) }
        }
    }

    private func linesFace(eyebrow: HomeEyebrow?, lines: [HomeLine], mono: Bool, total: HomeLine?) -> some View {
        let shown = Array(lines.suffix(cap.rows))
        let font = Font.system(size: compact ? 11.5 : 12.5, weight: .medium, design: mono ? .monospaced : .rounded)
        return VStack(alignment: .leading, spacing: 4) {
            eyebrowView(eyebrow)
            if lines.count > shown.count { more(lines.count - shown.count) }
            ForEach(Array(shown.enumerated()), id: \.offset) { _, line in
                HStack(spacing: 6) {
                    Text(line.left).lineLimit(1).foregroundStyle(line.dim ? Color.secondary : ink(line.tone))
                    Spacer(minLength: 4)
                    if let right = line.right { Text(right).monospacedDigit().lineLimit(1).foregroundStyle(line.dim ? Color.secondary : ink(line.tone)) }
                }
                .font(font)
            }
            if let total {
                Divider()
                HStack {
                    Text(total.left).font(.system(size: 12, weight: .semibold, design: .rounded))
                    Spacer(minLength: 4)
                    Text(total.right ?? "").font(.system(size: 14, weight: .bold, design: .rounded)).monospacedDigit().foregroundStyle(ink(total.tone ?? .accent))
                }
            }
        }
    }

    private func chainFace(eyebrow: HomeEyebrow?, nodes: [HomeNode], overflow: Int) -> some View {
        let shown = Array(nodes.prefix(cap.nodes))
        let hidden = overflow + nodes.count - shown.count
        return VStack(alignment: .leading, spacing: 6) {
            eyebrowView(eyebrow)
            Spacer(minLength: 0)
            HStack(spacing: 4) {
                ForEach(Array(shown.enumerated()), id: \.offset) { index, node in
                    if index > 0 { Image(systemName: "arrow.right").font(.system(size: 9, weight: .bold)).foregroundStyle(.secondary) }
                    VStack(spacing: 2) {
                        Text(node.label).font(.system(size: 11, weight: .semibold, design: .rounded)).lineLimit(2).multilineTextAlignment(.center)
                        if let caption = node.caption { Text(caption).font(.system(size: 9, design: .rounded)).lineLimit(1).foregroundStyle(.secondary) }
                    }
                    .padding(.horizontal, 6).padding(.vertical, 6)
                    .frame(maxWidth: .infinity)
                    .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(node.current ? accent.opacity(0.22) : Color.primary.opacity(0.07)))
                    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(node.current ? accent : .clear, lineWidth: 1))
                }
            }
            if hidden > 0 { more(hidden) }
            Spacer(minLength: 0)
        }
    }

    private func canvasFace(name: String, subtitle: String?, count: Int?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Spacer(minLength: 0)
            Image(systemName: "rectangle.3.group").font(.system(size: 26, weight: .semibold)).foregroundStyle(accent).homeAccentable()
            Text(name).font(.system(size: 17, weight: .semibold, design: .rounded)).lineLimit(2)
            if let subtitle { Text(subtitle).font(.system(size: 12, design: .rounded)).lineLimit(2).foregroundStyle(.secondary) }
            if let count { Text(count == 1 ? "1 widget inside" : "\(count) widgets inside").font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.secondary) }
            Spacer(minLength: 0)
        }
    }
}

struct HomeEmptyFace: View {
    let symbol: String
    let kind: String
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Spacer(minLength: 0)
            Image(systemName: symbol).font(.system(size: 24, weight: .regular)).foregroundStyle(accent.opacity(0.8))
            Text("Nothing here yet").font(.system(size: 12, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
    }
}

/// Bars for any series: negatives hang below a zero line, the last bar is
/// the brightest (the canvas chart face's rule).
struct HomeSparkBars: View {
    let series: [Double]
    let colors: [String?]
    let accent: Color

    var body: some View {
        GeometryReader { proxy in
            let values = Array(series.suffix(24))
            let top = max(values.max() ?? 0, 0)
            let bottom = min(values.min() ?? 0, 0)
            let span = max(top - bottom, 0.000_1)
            let zero = proxy.size.height * CGFloat(top / span)
            let gap: CGFloat = values.count > 12 ? 2 : 4
            let width = values.isEmpty ? 0 : (proxy.size.width - gap * CGFloat(values.count - 1)) / CGFloat(values.count)
            ZStack(alignment: .topLeading) {
                Rectangle().fill(Color.primary.opacity(0.12)).frame(height: 1).offset(y: zero)
                ForEach(Array(values.enumerated()), id: \.offset) { index, value in
                    let height = max(2, proxy.size.height * CGFloat(abs(value) / span))
                    let hue = (index < colors.count ? colors[index] : nil).map { Color(homeHex: $0) } ?? accent
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(hue.opacity(index == values.count - 1 ? 1 : 0.5))
                        .frame(width: max(1, width), height: height)
                        .offset(x: CGFloat(index) * (width + gap), y: value >= 0 ? zero - height : zero)
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: 40, maxHeight: .infinity)
        .homeAccentable()
    }
}

/// Wrapping row for chips.
struct HomeFlowLayout: Layout {
    var spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, line: CGFloat = 0, widest: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { x = 0; y += line + spacing; line = 0 }
            x += size.width + spacing
            widest = max(widest, x - spacing)
            line = max(line, size.height)
        }
        return CGSize(width: min(widest, width), height: y + line)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, line: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX { x = bounds.minX; y += line + spacing; line = 0 }
            if y + size.height > bounds.maxY + 0.5 {
                view.place(at: CGPoint(x: -10_000, y: -10_000), proposal: .zero)
                continue
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            line = max(line, size.height)
        }
    }
}

// MARK: - Lock Screen and the states between

struct HomeAccessoryView: View {
    let card: HomeWidgetCard
    let layout: HomeWidgetLayout
    let now: Date

    var body: some View {
        let lines = HomeWidgetSummary.lines(card, limit: 2)
        switch layout {
        case .inline:
            Label("\(card.displayTitle): \(lines.first ?? card.kind)", systemImage: card.symbol)
        case .circular:
            VStack(spacing: 1) {
                Image(systemName: card.symbol).font(.system(size: 13, weight: .semibold))
                Text(HomeWidgetSummary.headline(card) ?? card.kind).font(.system(size: 11, weight: .semibold, design: .rounded)).minimumScaleFactor(0.5).lineLimit(1)
            }
        default:
            VStack(alignment: .leading, spacing: 1) {
                Label(card.displayTitle, systemImage: card.symbol).font(.system(size: 13, weight: .semibold, design: .rounded)).lineLimit(1)
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    Text(line).font(.system(size: 12, design: .rounded)).lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct HomePromptView: View {
    let symbol: String
    let title: String
    let message: String
    let layout: HomeWidgetLayout

    var body: some View {
        if layout.isAccessory {
            Label(title, systemImage: symbol).font(.system(size: 12, weight: .semibold))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Image(systemName: symbol).font(.system(size: 20, weight: .semibold)).foregroundStyle(Color(homeHex: "#34d399"))
                Spacer(minLength: 0)
                Text(title).font(.system(size: 14, weight: .semibold, design: .rounded)).lineLimit(2)
                Text(message).font(.system(size: 11.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(layout == .small ? 4 : 3)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

// MARK: - Words for Lock Screen and VoiceOver

public enum HomeWidgetSummary {
    /// The single most telling reading, when the face has one.
    public static func headline(_ card: HomeWidgetCard) -> String? {
        switch card.face {
        case .metric(_, let primary, _, _, _): return primary
        case .gauge(_, _, let primary, _, _, _): return primary
        case .clock(_, let clock, _, _): return clock?.readout
        case .boolean(_, let active, _, _): return active ? "On" : "Off"
        case .stars(let value): return "\(Int(value.rounded()))★"
        case .rows(let eyebrow, _, _, _): return eyebrow?.note
        default: return nil
        }
    }

    /// Plain lines of what the card holds, most important first.
    public static func lines(_ card: HomeWidgetCard, limit: Int) -> [String] {
        var out: [String] = []
        switch card.face {
        case .empty: out = ["Nothing here yet"]
        case .note(let text, _, _): out = text.split(whereSeparator: \.isNewline).map { String($0).trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        case .rows(let eyebrow, let rows, _, _):
            if let note = eyebrow?.note { out.append("\(eyebrow!.label) \(note)") }
            out += rows.map { ($0.done == true ? "✓ " : $0.done == false ? "○ " : "") + $0.label + ($0.value.map { " \($0)" } ?? "") }
        case .boolean(let label, let active, _, _): out = ["\(label): \(active ? "On" : "Off")"]
        case .metric(_, let primary, let secondary, _, _): out = ["\(primary) \(secondary)"]
        case .text(let text, _): out = [text]
        case .clock(_, let clock, _, _): out = clock.map { ["\($0.readout) \($0.caption)"] } ?? []
        case .chart(let stats, _, _): out = stats.map { "\($0.label) \($0.value)" }
        case .stars(let value): out = ["\(Int(value.rounded())) of 5 stars"]
        case .columns(_, let columns, _): out = columns.map { "\($0.label): \($0.items.count + $0.overflow)" }
        case .grid(let eyebrow, _, let cells, _, _): out = [eyebrow?.label, eyebrow?.note].compactMap { $0 } + [cells.filter { !$0.text.isEmpty }.prefix(6).map(\.text).joined(separator: " ")]
        case .bars(_, let bars): out = bars.map { "\($0.label) \($0.value)" }
        case .gauge(_, _, let primary, let secondary, let caption, _): out = ["\(primary) \(secondary)"] + (caption.map { [$0] } ?? [])
        case .chips(_, let chips, _): out = [chips.map(\.text).joined(separator: ", ")]
        case .lines(_, let lines, _, let total): out = (total.map { ["\($0.left) \($0.right ?? "")"] } ?? []) + lines.reversed().map { [$0.left, $0.right].compactMap { $0 }.joined(separator: " ") }
        case .chain(_, let nodes, _, _): out = [nodes.map(\.label).joined(separator: " → ")]
        case .split(_, let left, let right, _): out = ["\(left.primary) \(left.secondary)", "\(right.primary) \(right.secondary)"]
        case .canvas(let name, let subtitle, _): out = [name] + (subtitle.map { [$0] } ?? [])
        }
        return Array(out.filter { !$0.isEmpty }.prefix(limit))
    }

    public static func accessibilityLabel(_ card: HomeWidgetCard) -> String {
        ([card.displayTitle, "on \(card.canvasName)"] + lines(card, limit: 12)).joined(separator: ". ")
    }
}

// MARK: - Colour

func homeClamp(_ value: Double) -> Double {
    value.isFinite ? min(1, max(0, value)) : 0
}

func homeToneColor(_ tone: HomeTone?, accent: Color) -> Color {
    switch tone {
    case .accent?: return accent
    case .muted?: return Color.primary.opacity(0.45)
    case .good?: return Color(homeHex: "#34d399")
    case .warn?: return Color(homeHex: "#f59e0b")
    case .bad?: return Color(homeHex: "#f87171")
    case .neutral?, nil: return Color.primary.opacity(0.9)
    }
}

public extension Color {
    /// `#rrggbb` / `#rgb`; an unreadable value is the app's grey.
    init(homeHex hex: String) {
        var text = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.hasPrefix("#") { text.removeFirst() }
        if text.count == 3 { text = text.map { "\($0)\($0)" }.joined() }
        guard text.count == 6, let value = UInt32(text, radix: 16) else {
            self = Color(red: 0.45, green: 0.47, blue: 0.5)
            return
        }
        self = Color(red: Double((value >> 16) & 0xff) / 255, green: Double((value >> 8) & 0xff) / 255, blue: Double(value & 0xff) / 255)
    }
}

extension View {
    /// Tinted and clear home screens recolour only what is marked accentable;
    /// the accent marks are what should take the tint.
    @ViewBuilder
    func homeAccentable(_ on: Bool = true) -> some View {
        #if canImport(WidgetKit)
        self.widgetAccentable(on)
        #else
        self
        #endif
    }
}
