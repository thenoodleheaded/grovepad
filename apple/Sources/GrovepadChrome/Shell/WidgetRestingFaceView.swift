import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Paints a `RestingFaceModel` at the tile the model was measured for
// (`components/widgets/WidgetRestingFace.tsx`, `RestingFaceGrammars.tsx`).
// One view for every grammar, so every widget's `restingBody` is one line and
// the tile a resting bitmap is rendered from can never disagree with the
// measured size the residency planner used.
//
// Faces are static (drawn from data, never per frame), bounded (the model was
// clamped before it got here; the plot samples to a fixed mark ceiling) and
// non-interactive. The layout constants are `RestingFaceMeasure`'s — the
// drawing and the box it lands in must agree, or the last row falls outside
// the card.
// ---------------------------------------------------------------------------

public struct WidgetRestingFaceView: View {
    private let context: WidgetRestContext

    public init(context: WidgetRestContext) {
        self.context = context
    }

    private var accent: Color { Color.inked(context.accent) }
    private var size: Size { context.face.size }
    private typealias M = RestingFaceMeasure

    public var body: some View {
        Group {
            switch context.face.model {
            case .icon:
                // The same mark the open card's title row wears: an empty
                // Text card rests as a document, not as a dashed square.
                RestIconGlyph(accent: context.accent, symbol: WidgetSymbols.symbol(for: context.widget.type, skin: context.skinValue))
            case .note(let skin):
                notePage(skin: skin)
            case .rows(let rows, let overflow, let eyebrow, let meter):
                rowsFace(rows, overflow: overflow, eyebrow: eyebrow, meter: meter)
            case .boolean(let label, let active, let shape, let tone):
                booleanFace(label: label, active: active, shape: shape, tone: tone)
            case .metric(let primary, let secondary, let progress, let eyebrow, let tone):
                metricFace(primary: primary, secondary: secondary, progress: progress, eyebrow: eyebrow, tone: tone)
            case .text(let text, let tint):
                textFace(text: text, tint: tint)
            case .clock(let shape, let eyebrow, let chips, let rows):
                clockFace(shape: shape, eyebrow: eyebrow, chips: chips, rows: rows)
            case .chart(let stats, let series):
                chartFace(stats: stats, series: series)
            case .stars(let value):
                starsFace(value: value)
            case .columns(let columns, let wrap, let eyebrow):
                columnsFace(columns, wrap: wrap, eyebrow: eyebrow)
            case .grid(let cols, let cells, let eyebrow, let header, let dense):
                gridFace(cols: cols, cells: cells, eyebrow: eyebrow, header: header, dense: dense)
            case .bars(let bars, let eyebrow):
                barsFace(bars, eyebrow: eyebrow)
            case .gauge(let progress, let primary, let secondary, let caption, let tone, let eyebrow):
                gaugeFace(progress: progress, primary: primary, secondary: secondary, caption: caption, tone: tone, eyebrow: eyebrow)
            case .chips(let chips, let overflow, let eyebrow):
                chipsFace(chips, overflow: overflow, eyebrow: eyebrow)
            case .lines(let lines, let eyebrow, let mono, let total):
                linesFace(lines, eyebrow: eyebrow, mono: mono, total: total)
            case .chain(let nodes, let shape, let overflow, let eyebrow):
                chainFace(nodes, shape: shape, overflow: overflow, eyebrow: eyebrow)
            case .split(let left, let right, let divider, let eyebrow):
                splitFace(left: left, right: right, divider: divider, eyebrow: eyebrow)
            case .canvas(let skin, let subtitle):
                canvasFace(skin: skin, subtitle: subtitle)
            }
        }
        .frame(width: CGFloat(size.width), height: CGFloat(size.height))
        .background(tileMaterial)
        .clipShape(RoundedRectangle(cornerRadius: GlassTokens.r0, style: .continuous))
    }

    /// The tile's glass. On the Mac the face is translucent and the canvas
    /// blurs the board behind it; elsewhere it keeps the flat plate. Both
    /// wear the open card's light: the top-left sheen, the accent bloom, the
    /// hairline along the top and the one rim.
    private var tileMaterial: some View {
        TileGlassSurface(accent: accent)
    }

    /// The faint lift the web paints list rows and cells on (`--gp-rest-lift`).
    private var lift: Color { Color.lift.opacity(0.045) }

    private func ink(_ tone: RestTone?) -> Color { restToneColor(tone, accent: accent) }

    // MARK: - Shared pieces

    @ViewBuilder
    private func eyebrowView(_ eyebrow: RestEyebrow?) -> some View {
        if let eyebrow {
            HStack(spacing: 6) {
                Text(eyebrow.label.uppercased()).font(.grove(size: 8, weight: .bold)).tracking(0.9).lineLimit(1)
                    .foregroundStyle(ink(eyebrow.tone ?? .accent))
                Spacer(minLength: 0)
                if let note = eyebrow.note {
                    Text(note).font(.grove(size: 8.5, weight: .medium)).monospacedDigit().lineLimit(1).foregroundStyle(.secondary)
                }
            }
            .frame(height: M.eyebrowHeight)
        }
    }

    /// The padded, top-left-anchored frame every stacked face lives in.
    private func padded<Content: View>(vertical: Bool = true, @ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(.horizontal, M.restPadX)
            .padding(.vertical, vertical ? M.padY : 0)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func chip(_ chip: RestChip) -> some View {
        let color = ink(chip.tone)
        return Text(chip.text).font(.grove(size: 9, weight: .medium)).lineLimit(1)
            .padding(.horizontal, 6).frame(height: M.chipHeight)
            .background(Capsule().fill(chip.filled ? color.opacity(0.18) : Color.clear))
            .overlay(Capsule().strokeBorder(chip.filled ? color.opacity(0.33) : Color.lift.opacity(0.1), lineWidth: 1))
            .foregroundStyle(chip.filled ? color : Color.primary.opacity(0.64))
    }

    // MARK: - Note

    private func notePage(skin: String) -> some View {
        let ratio = size.width / max(1, context.widget.size.width)
        let text = context.widget.data.string("text") ?? ""
        return Text(text)
            .font(skin == "typewriter" ? .system(size: 13 * ratio, design: .monospaced) : .grove(size: 13 * ratio, weight: .medium))
            .foregroundStyle(skin == "sticky" ? Color(red: 0.2, green: 0.16, blue: 0.02) : Color.primary.opacity(0.9))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(12 * ratio)
            .background(skin == "sticky" ? Color(hex: "#fcd34d").opacity(0.85) : Color.clear)
    }

    // MARK: - Rows

    private func rowsFace(_ rows: [RestRow], overflow: Int, eyebrow: RestEyebrow?, meter: Double?) -> some View {
        padded {
            VStack(alignment: .leading, spacing: 0) {
                eyebrowView(eyebrow)
                ForEach(rows, id: \.key) { row in
                    HStack(spacing: 4) {
                        if let lead = row.lead {
                            Text(lead).font(.grove(size: 9, weight: .semibold)).monospacedDigit().foregroundStyle(ink(row.tone ?? .muted))
                        }
                        Group {
                            if let done = row.done {
                                Image(systemName: done ? "checkmark.circle.fill" : "circle").font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(done ? accent : Color.secondary)
                            } else if row.marker {
                                Circle().fill(accent).frame(width: 4, height: 4)
                            }
                        }
                        .frame(width: 12)
                        .padding(.leading, CGFloat(row.indent) * M.rowIndent)
                        Text(row.label).font(.grove(size: 10, weight: .medium)).lineLimit(1)
                            .foregroundStyle(ink(row.tone))
                            .strikethrough(row.done == true)
                        if let value = row.value {
                            Spacer(minLength: 4)
                            Text(value).font(.grove(size: 10, weight: .medium)).monospacedDigit().foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    .frame(height: M.restRowHeight)
                }
                if overflow > 0 {
                    Text("+\(overflow) more").font(.grove(size: 9, weight: .medium)).foregroundStyle(.secondary).frame(height: M.overflowLine)
                }
                if let meter {
                    GeometryReader { proxy in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Color.lift.opacity(0.08))
                            Capsule().fill(accent).frame(width: proxy.size.width * CGFloat(RestText.fraction(meter)))
                        }
                    }
                    .frame(height: 3)
                    .padding(.top, 3)
                }
            }
        }
    }

    // MARK: - Boolean

    private func booleanFace(label: String, active: Bool, shape: RestBooleanShape, tone: RestTone?) -> some View {
        let color = tone.map(ink) ?? accent
        return HStack(spacing: 10) {
            switch shape {
            case .switch:
                Capsule().fill(active ? color : Color.lift.opacity(0.12)).frame(width: M.booleanSwitchWidth, height: 14)
                    .overlay(alignment: active ? .trailing : .leading) { Circle().fill(.white).frame(width: 10, height: 10).padding(2) }
            case .checkbox:
                Image(systemName: active ? "checkmark.square.fill" : "square").font(.system(size: 14, weight: .semibold)).foregroundStyle(active ? color : .secondary)
            case .power:
                Image(systemName: "power").font(.system(size: 13, weight: .bold)).foregroundStyle(active ? color : .secondary)
            }
            Text(label).font(.grove(size: 11.5, weight: .semibold)).lineLimit(1).foregroundStyle(active ? color : Color.primary.opacity(0.8))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, M.restPadX)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    // MARK: - Metric

    private func metricFace(primary: String, secondary: String, progress: Double?, eyebrow: RestEyebrow?, tone: RestTone?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            eyebrowView(eyebrow)
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(primary).font(.grove(size: 15, weight: .bold)).monospacedDigit().lineLimit(1)
                        .foregroundStyle(tone.map(ink) ?? accent)
                    Text(secondary.uppercased()).font(.grove(size: 8.5, weight: .semibold)).tracking(0.8).lineLimit(1).foregroundStyle(.secondary)
                }
                if let progress {
                    Spacer(minLength: 0)
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.lift.opacity(0.08))
                        Capsule().fill(accent).frame(width: 54 * CGFloat(RestText.fraction(progress)))
                    }
                    .frame(width: 54, height: 4)
                }
            }
        }
        .padding(.horizontal, M.restPadX)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    // MARK: - Text

    /// The words themselves beside a thin accent rule, clamped to six lines.
    private func textFace(text: String, tint: String?) -> some View {
        let color = tint.map { Color(hex: $0) } ?? accent
        return padded {
            HStack(alignment: .top, spacing: 8) {
                RoundedRectangle(cornerRadius: 1)
                    .fill(LinearGradient(colors: [color, .clear], startPoint: .top, endPoint: .bottom))
                    .frame(width: 2)
                Text(text)
                    .font(.grove(size: 10, weight: .regular))
                    .lineSpacing(2)
                    .lineLimit(M.textLineLimit)
                    .foregroundStyle(tint.map { Color(hex: $0) } ?? Color.primary.opacity(0.78))
                    .frame(maxWidth: .infinity, alignment: .topLeading)
            }
        }
    }

    // MARK: - Clock

    /// The readout is read from the widget's own clock pocket at paint time,
    /// exactly as the open card reads it; the number takes the phase colour
    /// only while the clock is actually running, so a card cannot read one way
    /// at rest and another when opened.
    private func clockFace(shape: RestClockShape, eyebrow: RestEyebrow?, chips: [RestChip], rows: [RestRow]) -> some View {
        let clock = TimekeeperClock.reading(context.widget.data, nowMs: FieldClock.nowMs())
        let fraction = clock.map { RestText.fraction($0.fraction) } ?? 0
        return Group {
            if shape == .dial {
                ZStack {
                    ClockBezel(fraction: fraction, accent: accent)
                    clockReadout(clock, centred: true)
                }
            } else {
                padded {
                    VStack(alignment: .leading, spacing: 0) {
                        eyebrowView(eyebrow)
                        HStack(spacing: 8) {
                            if shape == .hourglass {
                                // The falling-sand silhouette, drawn once: at rest
                                // the shape is the identity, the number is the reading.
                                Hourglass(fraction: fraction, accent: accent).frame(width: 13, height: 22)
                            }
                            clockReadout(clock, centred: false)
                            Spacer(minLength: 0)
                        }
                        .frame(height: M.clockReadoutHeight)
                        if !chips.isEmpty {
                            HStack(spacing: M.chipGap) {
                                ForEach(chips, id: \.key) { chip($0) }
                            }
                            .padding(.top, M.chipGap)
                        }
                        ForEach(rows, id: \.key) { clockRow($0) }
                    }
                }
            }
        }
    }

    /// The number takes the phase colour only while the clock is actually
    /// running — the rule the expanded card follows. An idle dial stays neutral.
    private func clockReadout(_ clock: TimekeeperClock?, centred: Bool) -> some View {
        var ink = Color.primary.opacity(0.92)
        if let clock {
            if clock.urgent { ink = Color(hex: "#f87171") }
            else if clock.running, clock.tone == "work" { ink = Color(hex: "#fb7185") }
            else if clock.running, clock.tone == "break" { ink = Color(hex: "#34d399") }
        }
        let caption = (clock?.caption ?? "").uppercased()
        return VStack(alignment: centred ? .center : .leading, spacing: 3) {
            Text(clock?.readout ?? "--:--")
                .font(.grove(size: 17, weight: .semibold))
                .monospacedDigit()
                .lineLimit(1)
                .foregroundStyle(ink)
            Text(caption)
                .font(.grove(size: 7.5, weight: .medium))
                .tracking(1)
                .lineLimit(1)
                .foregroundStyle(.secondary)
        }
    }

    private func clockRow(_ row: RestRow) -> some View {
        HStack(spacing: 8) {
            Text(row.label).font(.grove(size: 9.5)).lineLimit(1).foregroundStyle(.secondary)
            Spacer(minLength: 0)
            if let value = row.value {
                Text(value)
                    .font(.grove(size: 9.5, weight: .semibold))
                    .monospacedDigit()
                    .lineLimit(1)
                    .foregroundStyle(row.tone == .accent ? accent : Color.primary.opacity(0.8))
            }
        }
        .frame(height: M.restRowHeight)
    }

    /// The bezel: the card outline's marks, drawn once so the tile reads as
    /// a dial even without the open card around it, with the sweep so far.
    private struct ClockBezel: View {
        let fraction: Double
        let accent: Color

        var body: some View {
            Canvas { context, size in
                let center = CGPoint(x: size.width / 2, y: size.height / 2)
                let radius: CGFloat = min(size.width, size.height) / 2 - 8
                var ring = Path()
                ring.addArc(center: center, radius: radius, startAngle: .zero, endAngle: .degrees(360), clockwise: false)
                context.stroke(ring, with: .color(Color.lift.opacity(0.07)), lineWidth: 1)
                if fraction > 0 {
                    var sweep = Path()
                    let end = Angle.degrees(-90 + 360 * fraction)
                    sweep.addArc(center: center, radius: radius, startAngle: .degrees(-90), endAngle: end, clockwise: false)
                    context.stroke(sweep, with: .color(accent.opacity(0.55)), style: StrokeStyle(lineWidth: 2, lineCap: .round))
                }
                context.stroke(ClockBezel.ticks(center: center, radius: radius, every: 3), with: .color(Color.lift.opacity(0.28)), lineWidth: 1)
                context.stroke(ClockBezel.ticks(center: center, radius: radius, every: 1), with: .color(Color.lift.opacity(0.12)), lineWidth: 1)
            }
        }

        /// The twelve marks (`every` 3 = the quarters only) as one path.
        static func ticks(center: CGPoint, radius: CGFloat, every: Int) -> Path {
            var path = Path()
            for tick in stride(from: 0, to: 12, by: every) {
                let angle: CGFloat = CGFloat(tick) / 12 * 2 * CGFloat.pi - CGFloat.pi / 2
                let dx: CGFloat = cos(angle)
                let dy: CGFloat = sin(angle)
                let innerRadius: CGFloat = radius - 4
                path.move(to: CGPoint(x: center.x + dx * innerRadius, y: center.y + dy * innerRadius))
                path.addLine(to: CGPoint(x: center.x + dx * radius, y: center.y + dy * radius))
            }
            return path
        }
    }

    private struct Hourglass: View {
        let fraction: Double
        let accent: Color

        var body: some View {
            Canvas { context, size in
                var glass = Path()
                glass.move(to: .zero)
                glass.addLine(to: CGPoint(x: size.width, y: 0))
                glass.addLine(to: CGPoint(x: size.width * 0.55, y: size.height / 2))
                glass.addLine(to: CGPoint(x: size.width, y: size.height))
                glass.addLine(to: CGPoint(x: 0, y: size.height))
                glass.addLine(to: CGPoint(x: size.width * 0.45, y: size.height / 2))
                glass.closeSubpath()
                context.clip(to: glass)
                context.fill(Path(CGRect(x: 0, y: 0, width: size.width, height: size.height * fraction)), with: .color(accent.opacity(0.4)))
                context.stroke(glass, with: .color(accent.opacity(0.27)), lineWidth: 1)
            }
        }
    }

    // MARK: - Chart

    /// A real plot filling the tile's height, with the readouts stacked down
    /// a rail on its right. Bars get a faint baseline and the latest column
    /// picked out; a line gets a gradient area beneath it.
    private func chartFace(stats: [RestStat], series: [Double]?) -> some View {
        let data = context.widget.data
        // A supplied series is always a line: it is a history, and a history's
        // shape over time is the whole reason to draw it.
        let mode = series == nil ? (data.string("mode") ?? "bar") : "line"
        let points: [RestSparkline.Point] = series.map { $0.map { RestSparkline.Point(value: $0) } } ?? WidgetRestingFaceView.chartSeries(data)
        return HStack(spacing: 10) {
            RestChartPlot(mode: mode, points: points, accent: accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            if !stats.isEmpty {
                chartRail(stats)
            }
        }
        .padding(.horizontal, M.restPadX)
        .padding(.vertical, M.padY)
    }

    /// The readouts stacked down the plot's right edge, most important first.
    private func chartRail(_ stats: [RestStat]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(stats.enumerated()), id: \.offset) { index, stat in
                VStack(alignment: .leading, spacing: 1) {
                    Text(stat.value)
                        .font(.grove(size: index == 0 ? 14 : 10, weight: index == 0 ? .semibold : .medium))
                        .monospacedDigit()
                        .lineLimit(1)
                        .foregroundStyle(index == 0 ? accent : Color.secondary)
                    Text(stat.label.uppercased())
                        .font(.grove(size: 7, weight: .medium))
                        .tracking(0.8)
                        .lineLimit(1)
                        .foregroundStyle(Color.primary.opacity(0.4))
                }
            }
        }
        .padding(.leading, 10)
        .frame(width: M.chartStatsWidth, alignment: .leading)
        .overlay(alignment: .leading) { Rectangle().fill(Color.lift.opacity(0.07)).frame(width: 1) }
    }

    /// The plot: a ring for donut / pie, a gradient-backed line for a line or
    /// a supplied history, otherwise columns from the zero baseline with the
    /// latest one picked out.
    private struct RestChartPlot: View {
        let mode: String
        let points: [RestSparkline.Point]
        let accent: Color

        var body: some View {
            Canvas { context, size in
                let width = Double(size.width)
                let height = Double(size.height)
                if mode == "donut" || mode == "pie" {
                    drawRing(context, size: size)
                    return
                }
                var baseline = Path()
                baseline.move(to: CGPoint(x: 0, y: height - 0.5))
                baseline.addLine(to: CGPoint(x: width, y: height - 0.5))
                context.stroke(baseline, with: .color(Color.lift.opacity(0.1)), lineWidth: 1)
                if mode == "line" {
                    drawLine(context, width: width, height: height)
                } else {
                    drawBars(context, width: width, height: height)
                }
            }
        }

        private func drawRing(_ context: GraphicsContext, size: CGSize) {
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = min(size.width, size.height) / 2 - 3
            for segment in RestSparkline.donut(points) {
                var arc = Path()
                let start = Angle.degrees(-90 + segment.offset * 360)
                let end = Angle.degrees(-90 + (segment.offset + segment.fraction) * 360)
                arc.addArc(center: center, radius: radius, startAngle: start, endAngle: end, clockwise: false)
                let color: Color = segment.color.map { Color(hex: $0) } ?? accent
                context.stroke(arc, with: .color(color), lineWidth: 6)
            }
        }

        private func drawLine(_ context: GraphicsContext, width: Double, height: Double) {
            let line = RestSparkline.linePoints(points.map(\.value), width: width, height: height - 3)
            guard let first = line.first, let last = line.last else { return }
            var path = Path()
            path.move(to: first)
            for point in line.dropFirst() { path.addLine(to: point) }
            var area = path
            area.addLine(to: CGPoint(x: last.x, y: height))
            area.addLine(to: CGPoint(x: first.x, y: height))
            area.closeSubpath()
            let gradient = Gradient(colors: [accent.opacity(0.34), accent.opacity(0)])
            context.fill(area, with: .linearGradient(gradient, startPoint: .zero, endPoint: CGPoint(x: 0, y: height)))
            context.stroke(path, with: .color(accent), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
        }

        private func drawBars(_ context: GraphicsContext, width: Double, height: Double) {
            let gap = points.isEmpty ? 2 : max(2, (width / Double(points.count)) * 0.34)
            let bars = RestSparkline.bars(points, width: width, height: height - 3, gap: gap)
            for (index, bar) in bars.enumerated() {
                let rect = CGRect(x: bar.x, y: bar.y + 3, width: bar.width, height: bar.height)
                let color: Color = bar.color.map { Color(hex: $0) } ?? accent
                // The most recent column is the one being read; older ones recede.
                let opacity: Double = index == bars.count - 1 ? 1 : 0.42
                context.fill(Path(roundedRect: rect, cornerRadius: 1), with: .color(color.opacity(opacity)))
            }
        }
    }

    /// `chartSeries`: the Chart family's own bars/points/segments.
    public static func chartSeries(_ data: JSONObject) -> [RestSparkline.Point] {
        for key in ["bars", "points", "segments"] {
            let list = data.recordList(key)
            if list.isEmpty { continue }
            return list.compactMap { item in
                guard let value = item.finite("value") else { return nil }
                return RestSparkline.Point(value: value, color: item.string("color"))
            }
        }
        return []
    }

    // MARK: - Stars

    private func starsFace(value: Double) -> some View {
        let filled = Int(max(0, min(5, jsRound(value))))
        return HStack(spacing: 4) {
            ForEach(0..<5, id: \.self) { index in
                Image(systemName: index < filled ? "star.fill" : "star")
                    .font(.system(size: 14, weight: .regular))
                    .frame(width: 16, height: 16)
                    .foregroundStyle(index < filled ? accent : Color.primary.opacity(0.25))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, M.restPadX)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    // MARK: - Columns

    /// Lanes of cards: the expanded board's column header — name on the left,
    /// its one reading on the right, a tinted rule under both.
    private func columnsFace(_ columns: [RestColumn], wrap: Int?, eyebrow: RestEyebrow?) -> some View {
        let perRow = max(1, min(wrap ?? columns.count, max(1, columns.count)))
        let bands = stride(from: 0, to: columns.count, by: perRow).map { Array(columns[$0..<min($0 + perRow, columns.count)]) }
        let widths = M.columnWidths(columns)
        return padded {
            VStack(alignment: .leading, spacing: M.columnGap) {
                eyebrowView(eyebrow)
                ForEach(Array(bands.enumerated()), id: \.offset) { bandIndex, band in
                    HStack(alignment: .top, spacing: M.columnGap) {
                        ForEach(Array(band.enumerated()), id: \.element.key) { offset, column in
                            let tint = ink(column.tone ?? .accent)
                            VStack(alignment: .leading, spacing: 0) {
                                HStack(spacing: 4) {
                                    Text(column.label.uppercased()).font(.grove(size: 7.5, weight: .bold)).tracking(0.5).lineLimit(1).foregroundStyle(tint)
                                    Spacer(minLength: 0)
                                    if let note = column.note {
                                        Text(note).font(.grove(size: 7.5, weight: .semibold)).monospacedDigit().lineLimit(1).foregroundStyle(.secondary)
                                    }
                                }
                                .frame(height: M.columnHeader - 2)
                                Rectangle().fill(tint.opacity(0.24)).frame(height: 1).padding(.bottom, 1)
                                VStack(alignment: .leading, spacing: 2) {
                                    ForEach(column.items, id: \.key) { item in
                                        HStack(spacing: 4) {
                                            Text(item.label).font(.grove(size: 8.5)).lineLimit(1)
                                                .foregroundStyle(item.done == true ? Color.primary.opacity(0.35) : Color.primary.opacity(0.8))
                                                .strikethrough(item.done == true)
                                            if let value = item.value {
                                                Spacer(minLength: 0)
                                                Text(value).font(.grove(size: 7.5, weight: .semibold)).monospacedDigit().lineLimit(1).foregroundStyle(tint)
                                            }
                                        }
                                        .padding(.horizontal, 4)
                                        .frame(height: 11)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .background(RoundedRectangle(cornerRadius: 3).fill(lift))
                                    }
                                    if column.overflow > 0 {
                                        Text("+\(column.overflow)").font(.grove(size: 7, weight: .medium)).foregroundStyle(Color.primary.opacity(0.4)).frame(height: 10)
                                    }
                                }
                                .padding(.top, 2)
                            }
                            .frame(width: widths[bandIndex * perRow + offset], alignment: .topLeading)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Grid

    /// A lattice. `dense` is the calendar/heatmap shape — equal square cells
    /// whose fill carries the reading; otherwise a table, where the first
    /// column takes the extra width the way a record's name does.
    private func gridFace(cols: Int, cells: [RestCell], eyebrow: RestEyebrow?, header: [String]?, dense: Bool) -> some View {
        let columns = max(1, cols)
        let rows = stride(from: 0, to: cells.count, by: columns).map { Array(cells[$0..<min($0 + columns, cells.count)]) }
        let widths = dense ? [] : M.gridColumnWidths(cols: columns, header: header, cells: cells)
        let gap = dense ? M.denseGap : M.gridColGap
        let cellHeight = dense ? M.denseCell : M.gridRowHeight
        return padded {
            VStack(alignment: .leading, spacing: dense ? M.denseGap : 0) {
                eyebrowView(eyebrow)
                if let header, !header.isEmpty {
                    HStack(spacing: gap) {
                        ForEach(Array(header.prefix(columns).enumerated()), id: \.offset) { index, text in
                            Text(text.uppercased()).font(.grove(size: 7.5, weight: .bold)).tracking(0.5).lineLimit(1).foregroundStyle(.secondary)
                                .frame(width: dense ? M.denseCell : widths[index], height: cellHeight, alignment: dense ? .center : .leading)
                        }
                    }
                }
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    HStack(spacing: gap) {
                        ForEach(Array(row.enumerated()), id: \.element.key) { index, cell in
                            if dense {
                                denseCell(cell)
                            } else {
                                Text(cell.text).font(.grove(size: 9.5)).monospacedDigit().lineLimit(1)
                                    .foregroundStyle(cell.tone == nil ? Color.primary.opacity(0.84) : ink(cell.tone))
                                    .frame(width: widths[index], height: cellHeight, alignment: .leading)
                            }
                        }
                    }
                }
            }
        }
    }

    private func denseCell(_ cell: RestCell) -> some View {
        let tint = ink(cell.tone ?? .accent)
        let filled = (cell.fill ?? 0) > 0
        return Text(cell.text).font(.grove(size: 8.5, weight: cell.current ? .bold : .medium)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
            .foregroundStyle(cell.current || filled ? Color(hex: "#0a0a0a") : cell.tone == .muted ? Color.primary.opacity(0.32) : ink(cell.tone))
            .frame(width: M.denseCell, height: M.denseCell)
            .background(
                RoundedRectangle(cornerRadius: 4).fill(
                    cell.current ? tint : filled ? tint.opacity(0.22 + (cell.fill ?? 0) * 0.7) : cell.tone == .muted ? Color.clear : lift
                )
            )
    }

    // MARK: - Bars

    /// Labelled tracks. The bar is the row's own background, so the label
    /// keeps the full width instead of being squeezed beside a meter.
    private func barsFace(_ bars: [RestBar], eyebrow: RestEyebrow?) -> some View {
        padded {
            VStack(alignment: .leading, spacing: 0) {
                eyebrowView(eyebrow)
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(bars, id: \.key) { bar in
                        let tint = ink(bar.tone ?? .accent)
                        HStack(spacing: 0) {
                            Text(bar.label).font(.grove(size: 9)).lineLimit(1).foregroundStyle(Color.primary.opacity(0.85))
                            Spacer(minLength: 6)
                            Text(bar.value).font(.grove(size: 9, weight: .semibold)).monospacedDigit().lineLimit(1).foregroundStyle(tint)
                        }
                        .padding(.horizontal, 6)
                        .frame(height: 14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            GeometryReader { proxy in
                                ZStack(alignment: .leading) {
                                    RoundedRectangle(cornerRadius: 4).fill(Color.lift.opacity(0.05))
                                    RoundedRectangle(cornerRadius: 4).fill(tint.opacity(0.3))
                                        .frame(width: proxy.size.width * CGFloat(max(0.02, RestText.fraction(bar.fraction))))
                                }
                            }
                        )
                    }
                }
                .frame(maxHeight: .infinity, alignment: .center)
            }
        }
    }

    // MARK: - Gauge

    /// A dial. The ring states the proportion, the text the exact reading.
    private func gaugeFace(progress: Double, primary: String, secondary: String, caption: String?, tone: RestTone?, eyebrow: RestEyebrow?) -> some View {
        let tint = ink(tone ?? .accent)
        return padded {
            VStack(alignment: .leading, spacing: 0) {
                eyebrowView(eyebrow)
                HStack(spacing: 10) {
                    ZStack {
                        Circle().stroke(Color.lift.opacity(0.08), lineWidth: 5)
                        Circle().trim(from: 0, to: CGFloat(RestText.fraction(progress)))
                            .stroke(tint, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                    }
                    .padding(2.5)
                    .frame(width: M.gaugeDiameter, height: M.gaugeDiameter)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(primary).font(.grove(size: 15, weight: .semibold)).monospacedDigit().lineLimit(1).foregroundStyle(Color.primary.opacity(0.95))
                        Text(secondary.uppercased()).font(.grove(size: 8, weight: .medium)).tracking(0.8).lineLimit(1).foregroundStyle(.secondary)
                        if let caption {
                            Text(caption).font(.grove(size: 8.5)).lineLimit(1).foregroundStyle(tint)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .frame(maxHeight: .infinity, alignment: .center)
            }
        }
    }

    // MARK: - Chips

    private func chipsFace(_ chips: [RestChip], overflow: Int, eyebrow: RestEyebrow?) -> some View {
        padded {
            VStack(alignment: .leading, spacing: M.chipGap) {
                eyebrowView(eyebrow)
                WrappedChips(chips: chips, overflow: overflow, chip: { self.chip($0) })
            }
        }
    }

    /// Chips wrapped onto the lines the measurer counted, packing left to
    /// right at the same widths (`measure * 1.05 + pad + gap`).
    private struct WrappedChips<ChipView: View>: View {
        let chips: [RestChip]
        let overflow: Int
        let chip: (RestChip) -> ChipView

        var lines: [[RestChip]] {
            let inner = M.maxTileWidth - M.restPadX * 2
            var lines: [[RestChip]] = [[]]
            var line = 0.0
            for chip in chips {
                let width = M.measure(chip.text) * 1.05 + M.chipPad
                if line > 0, line + width > inner { lines.append([]); line = 0 }
                lines[lines.count - 1].append(chip)
                line += width + M.chipGap
            }
            return lines
        }

        var body: some View {
            VStack(alignment: .leading, spacing: M.chipGap) {
                ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                    HStack(spacing: M.chipGap) {
                        ForEach(line, id: \.key) { chip($0) }
                        if overflow > 0, index == lines.count - 1 {
                            Text("+\(overflow)").font(.grove(size: 8, weight: .medium)).foregroundStyle(Color.primary.opacity(0.4))
                        }
                    }
                }
            }
        }
    }

    // MARK: - Lines

    /// A ledger: entry on the left, its value right-aligned, an optional
    /// ruled total underneath.
    private func linesFace(_ lines: [RestLine], eyebrow: RestEyebrow?, mono: Bool, total: RestLine?) -> some View {
        let design: Font.Design = mono ? .monospaced : .default
        return padded {
            VStack(alignment: .leading, spacing: 0) {
                eyebrowView(eyebrow)
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(lines, id: \.key) { line in
                        HStack(spacing: M.lineGap) {
                            Text(line.left).font(.system(size: 9.5, design: design)).lineLimit(1)
                                .foregroundStyle(line.dim ? Color.primary.opacity(0.4) : ink(line.tone))
                            if let right = line.right {
                                Spacer(minLength: 0)
                                Text(right).font(.system(size: 9.5, weight: .semibold, design: design)).monospacedDigit().lineLimit(1)
                                    .foregroundStyle(line.tone == nil ? Color.primary.opacity(0.9) : ink(line.tone))
                            }
                        }
                        .frame(height: M.lineHeight)
                    }
                }
                .frame(maxHeight: .infinity, alignment: .center)
                if let total {
                    HStack(spacing: M.lineGap) {
                        Text(total.left.uppercased()).font(.system(size: 8, weight: .bold, design: design)).tracking(0.7).lineLimit(1).foregroundStyle(.secondary)
                        Spacer(minLength: 0)
                        if let right = total.right {
                            Text(right).font(.system(size: 11, weight: .semibold, design: design)).monospacedDigit().lineLimit(1).foregroundStyle(ink(total.tone ?? .accent))
                        }
                    }
                    .frame(height: M.lineHeight)
                    .padding(.top, 4)
                    .overlay(alignment: .top) { Rectangle().fill(Color.lift.opacity(0.09)).frame(height: 1) }
                }
            }
        }
    }

    // MARK: - Chain

    /// Connected nodes. The connector carries the meaning: one arrow for a
    /// forward link, two for a doubly-linked one, a returning arrow for a ring.
    private func chainFace(_ nodes: [RestNode], shape: RestChainShape, overflow: Int, eyebrow: RestEyebrow?) -> some View {
        padded {
            VStack(alignment: .leading, spacing: 0) {
                eyebrowView(eyebrow)
                if shape == .stack {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(nodes.enumerated()), id: \.element.key) { index, node in
                            HStack(spacing: 6) {
                                ZStack {
                                    if index < nodes.count - 1 {
                                        Rectangle().fill(Color.lift.opacity(0.16)).frame(width: 1, height: 5).offset(y: 8)
                                    }
                                    Circle().fill(node.current ? accent : Color.lift.opacity(0.28)).frame(width: 5, height: 5)
                                }
                                .frame(width: 8, height: M.restRowHeight)
                                Text(node.label).font(.grove(size: 10)).lineLimit(1).foregroundStyle(Color.primary.opacity(0.85))
                                if let caption = node.caption {
                                    Spacer(minLength: 0)
                                    Text(caption).font(.grove(size: 8.5)).monospacedDigit().lineLimit(1).foregroundStyle(.secondary)
                                }
                            }
                            .frame(height: M.restRowHeight)
                        }
                        if overflow > 0 {
                            Text("+\(overflow) more").font(.grove(size: 8, weight: .medium)).foregroundStyle(Color.primary.opacity(0.4)).frame(height: M.overflowLine)
                        }
                    }
                    .frame(maxHeight: .infinity, alignment: .center)
                } else {
                    HStack(spacing: 0) {
                        ForEach(Array(nodes.enumerated()), id: \.element.key) { index, node in
                            if index > 0 {
                                Text(shape == .doubly ? "⇄" : "→").font(.grove(size: 8)).foregroundStyle(Color.lift.opacity(0.32))
                                    .frame(width: M.nodeConnector)
                            }
                            VStack(alignment: .leading, spacing: 1) {
                                Text(node.label).font(.grove(size: 9, weight: .medium)).lineLimit(1).foregroundStyle(Color.primary.opacity(0.85))
                                if let caption = node.caption {
                                    Text(caption.uppercased()).font(.grove(size: 7)).tracking(0.4).lineLimit(1).foregroundStyle(.secondary)
                                }
                            }
                            .padding(.horizontal, 4)
                            .frame(width: M.nodeWidth, height: M.nodeHeight, alignment: .leading)
                            .background(RoundedRectangle(cornerRadius: 5).fill(lift))
                            .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(node.current ? accent.opacity(0.47) : Color.lift.opacity(0.07), lineWidth: 1))
                        }
                        if overflow > 0 {
                            Text("+\(overflow)").font(.grove(size: 8, weight: .medium)).foregroundStyle(Color.primary.opacity(0.4)).padding(.leading, M.nodeConnector)
                        }
                    }
                    .frame(maxHeight: .infinity, alignment: .center)
                    .overlay(alignment: .bottom) {
                        if shape == .circular {
                            ReturnArc(accent: accent).frame(height: 6).padding(.horizontal, 8).offset(y: 6)
                        }
                    }
                }
            }
        }
    }

    private struct ReturnArc: View {
        let accent: Color
        var body: some View {
            Canvas { context, size in
                var path = Path()
                path.move(to: .zero)
                path.addLine(to: CGPoint(x: 0, y: size.height - 3))
                path.addQuadCurve(to: CGPoint(x: 3, y: size.height), control: CGPoint(x: 0, y: size.height))
                path.addLine(to: CGPoint(x: size.width - 3, y: size.height))
                path.addQuadCurve(to: CGPoint(x: size.width, y: size.height - 3), control: CGPoint(x: size.width, y: size.height))
                path.addLine(to: CGPoint(x: size.width, y: 0))
                context.stroke(path, with: .color(accent.opacity(0.33)), style: StrokeStyle(lineWidth: 1, dash: [2, 2]))
            }
        }
    }

    // MARK: - Split

    /// Two readings that only mean something beside each other.
    private func splitFace(left: RestReadout, right: RestReadout, divider: String?, eyebrow: RestEyebrow?) -> some View {
        let side = { (readout: RestReadout, trailing: Bool) -> AnyView in
            AnyView(VStack(alignment: trailing ? .trailing : .leading, spacing: 2) {
                Text(readout.primary).font(.grove(size: 15, weight: .semibold)).monospacedDigit().lineLimit(1)
                    .foregroundStyle(readout.tone.map(self.ink) ?? Color.primary.opacity(0.95))
                Text(readout.secondary.uppercased()).font(.grove(size: 8, weight: .medium)).tracking(0.8).lineLimit(1).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: trailing ? .trailing : .leading))
        }
        return padded {
            VStack(alignment: .leading, spacing: 0) {
                eyebrowView(eyebrow)
                HStack(spacing: 8) {
                    side(left, false)
                    Text(divider ?? "·").font(.grove(size: 10, weight: .medium)).foregroundStyle(Color.primary.opacity(0.4))
                    side(right, true)
                }
                .frame(maxHeight: .infinity, alignment: .center)
            }
        }
    }

    // MARK: - Canvas

    private func canvasFace(skin: String, subtitle: String?) -> some View {
        let canvasId = context.widget.data.string("canvasId") ?? ""
        let name = context.canvasName(canvasId) ?? context.widget.title
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Image(systemName: skin == "live_thumbnail" ? "rectangle.3.group" : "folder.fill").font(.system(size: 14, weight: .semibold)).foregroundStyle(accent)
                Text(name.isEmpty ? "Canvas" : name).font(.grove(size: 12, weight: .semibold)).lineLimit(1)
                Spacer(minLength: 0)
            }
            if let subtitle { Text(subtitle).font(.grove(size: 9.5, weight: .medium)).foregroundStyle(.secondary).lineLimit(2) }
            if skin != "portal" { Spacer(minLength: 0) }
        }
        .padding(.horizontal, M.restPadX)
        .padding(.vertical, skin == "portal" ? 0 : M.padY)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: skin == "portal" ? .leading : .topLeading)
    }
}
