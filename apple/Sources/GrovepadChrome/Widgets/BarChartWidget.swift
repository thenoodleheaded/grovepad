import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Chart (`components/widgets/modules/BarChartWidget.tsx`,
// `chartSkinModel.ts`, `restingFace.ts` bar_chart branch and
// `restingFaces/catalog.ts chartFace`). One series of `bars` — id, label,
// value, colour — drawn eleven ways; the skin field is `mode`. Every write
// spreads the worn skin last (`baseData`): editing a bar patches its record
// in place, adding mints an id and takes the palette's next colour, the
// `series` port rebuilds the list through Core's `rebuiltBars`.
//
// Drawn with SwiftUI `Canvas`, no library: bar, line, area, sparkline,
// donut, pie, gauge, progress_ring, heatmap, scatter (x from its pocket or
// the index), stacked (the base series as columns with a note; the extra
// series in its pocket are not drawn yet).
// ---------------------------------------------------------------------------

public struct BarChartWidget: WidgetRenderer {
    public static let type = "bar_chart"
    static let skins: Set<String> = ["bar", "line", "donut", "pie", "area", "sparkline", "gauge", "progress_ring", "heatmap", "scatter", "stacked"]
    static let palette = ["#38bdf8", "#a3e635", "#f472b6", "#fbbf24", "#a78bfa", "#2dd4bf", "#fb7185", "#60a5fa"]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("mode")
        return skins.contains(raw) ? raw : "bar"
    }

    struct Bar { var id: String, label: String, value: Double, color: String }

    static func bars(_ data: JSONObject) -> [Bar] {
        data.recordList("bars").enumerated().map { index, bar in
            let color = bar.str("color")
            return Bar(id: bar.string("id") ?? "bar-\(index)", label: bar.str("label"), value: bar.finite("value") ?? 0, color: color.isEmpty ? palette[index % palette.count] : color)
        }
    }

    /// `chartDomain`: the value span, zero included, padded when flat.
    static func domain(_ values: [Double], includeZero: Bool = true) -> (min: Double, max: Double) {
        var low = values.min() ?? 0
        var high = values.max() ?? 1
        if includeZero { low = min(0, low); high = max(0, high) }
        if low == high {
            let padding = max(1, abs(low) * 0.1)
            low -= padding
            high += padding
        }
        return (low, high)
    }

    /// `gaugeState`: the ring's bounds from its pocket, else the domain.
    static func gauge(_ data: JSONObject, values: [Double]) -> (min: Double, max: Double) {
        let state = data.skinState("gauge")
        let domain = domain(values)
        let low = state.finite("min") ?? min(0, domain.min)
        let requested = state.finite("max") ?? max(100, domain.max)
        return (low, requested > low ? requested : low + 1)
    }

    static func writeBars(_ data: inout JSONObject, _ bars: [JSONValue], skin: String) {
        data["bars"] = .array(bars)
        data["mode"] = .string(skin)
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = BarChartWidget.skin(data)
        let bars = BarChartWidget.bars(data)
        let unit = data.str("unit")
        let accent = Color(hex: context.accent)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                CardTextField("Title", text: data.str("title")) { next in
                    context.update { $0["title"] = .string(next); $0["mode"] = .string(skin) }
                }
                .font(GlassType.value)
                CardTextField("Unit", text: unit) { next in
                    context.update { $0["unit"] = .string(next); $0["mode"] = .string(skin) }
                }
                .frame(width: 44)
                .foregroundStyle(.secondary)
            }
            if skin == "stacked" { SkinNote("Stacked series are drawn as the base columns; the extra series arrive later.") }
            ChartPlot(skin: skin, bars: bars, unit: unit, accent: accent, gauge: BarChartWidget.gauge(data, values: bars.map(\.value)), scatterX: data.skinState("scatter").object("xValues") ?? JSONObject())
                .frame(height: 96)
                .frame(maxWidth: .infinity)
            Group {
                VStack(spacing: 0) {
                    ForEach(bars, id: \.id) { bar in
                        HStack(spacing: 6) {
                            Circle().fill(Color(hex: bar.color)).frame(width: 8, height: 8)
                            CardTextField("Label", text: bar.label) { next in
                                context.update { data in
                                    data.patchRecord(in: "bars", id: bar.id) { $0["label"] = .string(next) }
                                    data["mode"] = .string(skin)
                                }
                            }
                            CardTextField("Value", text: JavaScript.numberString(bar.value)) { next in
                                let parsed = JavaScript.parseFloat(next)
                                guard parsed.isFinite else { return }
                                context.update { data in
                                    data.patchRecord(in: "bars", id: bar.id) { $0["value"] = .number(parsed) }
                                    data["mode"] = .string(skin)
                                }
                            }
                            .multilineTextAlignment(.trailing)
                            .frame(width: 64)
                            RowDeleteButton(label: "Remove \(bar.label.isEmpty ? "series" : bar.label)") {
                                context.update { data in
                                    data.removeRecord(in: "bars", id: bar.id)
                                    data["mode"] = .string(skin)
                                }
                            }
                        }
                    }
                }
            }
            Button {
                // `addBar`: a fresh id, the next palette colour, the latest value.
                context.update { data in
                    let existing = data.recordList("bars")
                    var bar = JSONObject()
                    bar["id"] = .string(context.mint())
                    bar["label"] = .string("Series \(existing.count + 1)")
                    bar["value"] = .number(existing.last?.finite("value") ?? 0)
                    bar["color"] = .string(BarChartWidget.palette[existing.count % BarChartWidget.palette.count])
                    data.appendRecord(in: "bars", bar)
                    data["mode"] = .string(skin)
                }
            } label: {
                Label("Add series", systemImage: "plus").font(GlassType.body).foregroundStyle(accent)
            }
            .buttonStyle(.plain)
            .touchTarget()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `chartFace` + the `bar_chart` base: bar / line / scatter rest as the
    /// plot with Now / Change / Peak down its rail; area and sparkline hand
    /// the renderer their series (a line, whatever the mode); gauge and ring
    /// as a dial; the heat map as a filled lattice; the slices as bars of
    /// their shares. None carries a heading — the title capsule says the name.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let bars = BarChartWidget.bars(data)
        if bars.isEmpty { return .icon }
        let skin = BarChartWidget.skin(data)
        let unit = data.str("unit")
        let values = bars.map(\.value)
        let suffix = { (value: Double) in "\(RestText.number(value))\(unit)" }
        switch skin {
        case "gauge", "progress_ring":
            let latest = values.last ?? 0
            let peak = max(values.map(abs).max() ?? 1, 1)
            return .gauge(
                progress: RestText.fraction(abs(latest) / peak),
                primary: suffix(latest),
                secondary: RestText.compact(bars.last?.label.isEmpty == false ? bars.last!.label : "Latest", 18),
                // Only when the needle is short of the top: "72% of 72%" says nothing.
                caption: abs(latest) < peak ? "of \(suffix(peak))" : nil
            )
        case "heatmap":
            let peak = max(values.map(abs).max() ?? 1, 1)
            return .grid(cols: 7, cells: bars.prefix(28).enumerated().map { index, bar in
                RestCell(key: bar.id.isEmpty ? "cell-\(index)" : bar.id, text: "", fill: RestText.fraction(abs(bar.value) / peak))
            })
        case "stacked", "donut", "pie":
            let total = values.reduce(0.0) { $0 + max(0, $1) }
            if total <= 0 { return .icon }
            return .bars(bars: bars.prefix(RestingFaceMeasure.barLimit).enumerated().map { index, bar in
                let value = max(0, bar.value)
                return RestBar(
                    key: bar.id.isEmpty ? "bar-\(index)" : bar.id,
                    label: RestText.compact(bar.label.isEmpty ? "Slice \(index + 1)" : bar.label, 18),
                    value: "\(RestText.number(jsRound(value / total * 100)))%",
                    fraction: RestText.fraction(value / total)
                )
            })
        case "area", "sparkline":
            // Handing the renderer a series is what makes it draw a line rather
            // than columns — the whole difference between these skins and Bar.
            return .chart(stats: [RestStat(label: "Now", value: suffix(values.last ?? 0))], series: values)
        default:
            return .chart(stats: RestText.chartStats(values, unit: unit))
        }
    }
}

/// The drawing, one `Canvas` for every skin.
struct ChartPlot: View {
    let skin: String
    let bars: [BarChartWidget.Bar]
    let unit: String
    let accent: Color
    let gauge: (min: Double, max: Double)
    let scatterX: JSONObject

    var body: some View {
        let values = bars.map(\.value)
        Canvas { context, size in
            guard !bars.isEmpty else { return }
            let inset = 6.0
            let plot = CGRect(x: inset, y: inset, width: max(0, size.width - inset * 2), height: max(0, size.height - inset * 2))
            switch skin {
            case "line", "area", "sparkline":
                let domain = BarChartWidget.domain(values, includeZero: skin != "sparkline")
                let points = values.enumerated().map { index, value in
                    CGPoint(x: plot.minX + (values.count > 1 ? CGFloat(index) / CGFloat(values.count - 1) : 0.5) * plot.width, y: plot.minY + CGFloat((domain.max - value) / (domain.max - domain.min)) * plot.height)
                }
                var path = Path()
                for (index, point) in points.enumerated() { if index == 0 { path.move(to: point) } else { path.addLine(to: point) } }
                if skin == "area" {
                    var fill = path
                    fill.addLine(to: CGPoint(x: points.last!.x, y: plot.maxY))
                    fill.addLine(to: CGPoint(x: points[0].x, y: plot.maxY))
                    fill.closeSubpath()
                    context.fill(fill, with: .color(accent.opacity(0.18)))
                }
                context.stroke(path, with: .color(accent), style: StrokeStyle(lineWidth: skin == "sparkline" ? 1.5 : 2, lineCap: .round, lineJoin: .round))
                if skin != "sparkline" {
                    for point in points { context.fill(Path(ellipseIn: CGRect(x: point.x - 3, y: point.y - 3, width: 6, height: 6)), with: .color(accent)) }
                }
            case "donut", "pie":
                let total = values.reduce(0.0) { $0 + max(0, $1) }
                let center = CGPoint(x: size.width / 2, y: size.height / 2)
                let radius = min(size.width, size.height) / 2 - 2
                var start = -Double.pi / 2
                for bar in bars where bar.value > 0 && total > 0 {
                    let sweep = bar.value / total * 2 * .pi
                    var path = Path()
                    if skin == "pie" { path.move(to: center) }
                    path.addArc(center: center, radius: skin == "pie" ? radius : radius - 5, startAngle: .radians(start), endAngle: .radians(start + sweep), clockwise: false)
                    if skin == "pie" {
                        path.closeSubpath()
                        context.fill(path, with: .color(Color(hex: bar.color)))
                    } else {
                        context.stroke(path, with: .color(Color(hex: bar.color)), style: StrokeStyle(lineWidth: 10))
                    }
                    start += sweep
                }
            case "gauge", "progress_ring":
                let latest = values.last ?? 0
                let fraction: Double = skin == "gauge" ? RestText.fraction((latest - gauge.min) / (gauge.max - gauge.min)) : RestText.fraction(abs(latest) / max(values.map(abs).max() ?? 1, 1))
                let center = CGPoint(x: size.width / 2, y: skin == "gauge" ? size.height - 6 : size.height / 2)
                let radius = skin == "gauge" ? min(size.width / 2, size.height) - 8 : min(size.width, size.height) / 2 - 6
                let startAngle = skin == "gauge" ? Double.pi : -Double.pi / 2
                let span = skin == "gauge" ? Double.pi : 2 * Double.pi
                var track = Path()
                track.addArc(center: center, radius: radius, startAngle: .radians(startAngle), endAngle: .radians(startAngle + span), clockwise: false)
                context.stroke(track, with: .color(Color.lift.opacity(0.08)), style: StrokeStyle(lineWidth: 8, lineCap: .round))
                var needle = Path()
                needle.addArc(center: center, radius: radius, startAngle: .radians(startAngle), endAngle: .radians(startAngle + span * fraction), clockwise: false)
                context.stroke(needle, with: .color(accent), style: StrokeStyle(lineWidth: 8, lineCap: .round))
                let text = Text("\(RestText.number(latest))\(unit)").font(.grove(size: 15, weight: .bold)).foregroundStyle(accent)
                context.draw(text, at: CGPoint(x: center.x, y: skin == "gauge" ? center.y - 14 : center.y))
            case "heatmap":
                let columns = 7
                let peak = max(values.map(abs).max() ?? 1, 1)
                let rows = Int((Double(bars.count) / Double(columns)).rounded(.up))
                let cell = min(plot.width / CGFloat(columns), plot.height / CGFloat(max(1, rows)))
                for (index, bar) in bars.enumerated() {
                    let column = index % columns
                    let row = index / columns
                    let rect = CGRect(x: plot.minX + CGFloat(column) * cell + 1, y: plot.minY + CGFloat(row) * cell + 1, width: cell - 2, height: cell - 2)
                    context.fill(Path(roundedRect: rect, cornerRadius: 2), with: .color(accent.opacity(0.1 + 0.9 * RestText.fraction(abs(bar.value) / peak))))
                }
            case "scatter":
                let xs = bars.enumerated().map { index, bar in scatterX.finite(bar.id) ?? Double(index + 1) }
                let xDomain = BarChartWidget.domain(xs, includeZero: false)
                let yDomain = BarChartWidget.domain(values)
                for (index, bar) in bars.enumerated() {
                    let x = plot.minX + CGFloat((xs[index] - xDomain.min) / (xDomain.max - xDomain.min)) * plot.width
                    let y = plot.minY + CGFloat((yDomain.max - bar.value) / (yDomain.max - yDomain.min)) * plot.height
                    context.fill(Path(ellipseIn: CGRect(x: x - 4, y: y - 4, width: 8, height: 8)), with: .color(Color(hex: bar.color)))
                }
            default:
                let domain = BarChartWidget.domain(values)
                let zeroY = plot.minY + CGFloat(domain.max / (domain.max - domain.min)) * plot.height
                let slot = plot.width / CGFloat(bars.count)
                let width = max(2, slot * 0.7)
                for (index, bar) in bars.enumerated() {
                    let y = plot.minY + CGFloat((domain.max - bar.value) / (domain.max - domain.min)) * plot.height
                    let rect = CGRect(x: plot.minX + CGFloat(index) * slot + (slot - width) / 2, y: min(y, zeroY), width: width, height: max(1, abs(zeroY - y)))
                    context.fill(Path(roundedRect: rect, cornerRadius: 3), with: .color(Color(hex: bar.color)))
                }
                var baseline = Path()
                baseline.move(to: CGPoint(x: plot.minX, y: zeroY))
                baseline.addLine(to: CGPoint(x: plot.maxX, y: zeroY))
                context.stroke(baseline, with: .color(Color.lift.opacity(0.14)), lineWidth: 1)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(skin) chart, \(bars.count) values")
    }
}
