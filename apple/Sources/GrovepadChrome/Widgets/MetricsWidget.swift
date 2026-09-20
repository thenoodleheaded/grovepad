import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Metrics (`components/widgets/modules/MetricsWidget.tsx`,
// `metricsSkinModel.ts`, `restingFaces/catalog.ts metricsFace`). A row of
// tiles — id, label, value (authored as text: "1.2k", "98%"), unit, trend —
// read seven ways; the skin field is `skin`. Every write is `{ ...data, tiles }`:
// a tile edit patches its record in place, adding mints an id and a flat
// `"0"` tile. The `value_1` port writes the first tile's value as a number's
// text, the way the web does.
//
// Ported skins: kpi_tiles, big_number, scoreboard, traffic_lights. delta,
// target and executive_strip render the tiles with a note and read their
// pockets for the folded face only.
// ---------------------------------------------------------------------------

public struct MetricsWidget: WidgetRenderer {
    public static let type = "metrics"
    static let skins: Set<String> = ["kpi_tiles", "big_number", "scoreboard", "traffic_lights", "delta", "target", "executive_strip"]
    static let trends = ["up", "down", "flat"]
    static let trendMarks = ["up": "↑", "down": "↓", "flat": "→"]
    static let trendTones: [String: RestTone] = ["up": .good, "down": .bad, "flat": .muted]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "kpi_tiles"
    }

    struct Tile { var id: String, label: String, value: String, unit: String, trend: String }

    static func tiles(_ data: JSONObject) -> [Tile] {
        data.recordList("tiles").enumerated().map { index, tile in
            let trend = tile.str("trend")
            let value: String
            if let number = tile.number("value") { value = JavaScript.numberString(number) } else { value = tile.str("value") }
            return Tile(id: tile.string("id") ?? "tile-\(index)", label: tile.str("label"), value: value, unit: tile.str("unit"), trend: trends.contains(trend) ? trend : "flat")
        }
    }

    /// `tileNumber`: the number inside authored text, or 0.
    static func number(_ value: String) -> Double {
        if let direct = Double(JavaScript.trim(value)), direct.isFinite { return direct }
        let digits = value.filter { $0.isNumber || $0 == "." || $0 == "-" }
        let parsed = JavaScript.parseFloat(digits)
        return parsed.isFinite ? parsed : 0
    }

    static func reading(_ tile: Tile) -> String { "\(tile.value.isEmpty ? "—" : tile.value)\(tile.unit)" }

    static func trendColor(_ trend: String, accent: Color) -> Color {
        restToneColor(trendTones[trend], accent: accent)
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = MetricsWidget.skin(data)
        let tiles = MetricsWidget.tiles(data)
        let accent = Color(hex: context.accent)
        let patch = { (id: String, key: String, value: JSONValue) in
            context.update { $0.patchRecord(in: "tiles", id: id) { $0[key] = value } }
        }
        return VStack(alignment: .leading, spacing: 6) {
            if !["kpi_tiles", "big_number", "scoreboard", "traffic_lights"].contains(skin) {
                SkinNote("Shown as tiles — the \(skin.replacingOccurrences(of: "_", with: " ")) skin arrives later.")
            }
            VStack(alignment: .leading, spacing: 6) {
                if skin == "big_number", let lead = tiles.first {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            CardTextField("Value", text: lead.value) { patch(lead.id, "value", .string($0)) }
                                .font(GlassType.hero).foregroundStyle(MetricsWidget.trendColor(lead.trend, accent: accent))
                            Text(lead.unit).font(GlassType.heroUnit).foregroundStyle(.secondary)
                        }
                        tileRow(context, tile: lead, accent: accent, showValue: false)
                    }
                    ForEach(tiles.dropFirst(), id: \.id) { tile in tileRow(context, tile: tile, accent: accent, showValue: true) }
                } else if skin == "kpi_tiles" {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)], spacing: 6) {
                        ForEach(tiles, id: \.id) { tile in
                            Island(padding: 8) {
                                VStack(alignment: .leading, spacing: 0) {
                                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                                        CardTextField("Value", text: tile.value) { patch(tile.id, "value", .string($0)) }
                                            .font(GlassType.value).foregroundStyle(accent)
                                        CardTextField("Unit", text: tile.unit) { patch(tile.id, "unit", .string($0)) }
                                            .font(GlassType.heroUnit).foregroundStyle(.secondary).frame(width: 30)
                                    }
                                    tileRow(context, tile: tile, accent: accent, showValue: false)
                                }
                            }
                        }
                    }
                } else {
                    ForEach(tiles, id: \.id) { tile in tileRow(context, tile: tile, accent: accent, showValue: true) }
                }
            }
            Button {
                context.update { data in
                    var tile = JSONObject()
                    tile["id"] = .string(context.mint())
                    tile["label"] = .string("")
                    tile["value"] = .string("0")
                    tile["unit"] = .string("")
                    tile["trend"] = .string("flat")
                    data.appendRecord(in: "tiles", tile)
                }
            } label: {
                Label("Add metric", systemImage: "plus").font(GlassType.body).foregroundStyle(accent)
            }
            .buttonStyle(.plain)
            .touchTarget()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    /// One tile as a row: the trend button cycles up → down → flat, the
    /// label and (when shown) the value edit in place, delete always present.
    private func tileRow(_ context: WidgetCardContext, tile: Tile, accent: Color, showValue: Bool) -> some View {
        let color = MetricsWidget.trendColor(tile.trend, accent: accent)
        return HStack(spacing: 6) {
            Button {
                let next = MetricsWidget.trends[(MetricsWidget.trends.firstIndex(of: tile.trend)! + 1) % MetricsWidget.trends.count]
                context.update { $0.patchRecord(in: "tiles", id: tile.id) { $0["trend"] = .string(next) } }
            } label: {
                Group {
                    if MetricsWidget.skin(context.data) == "traffic_lights" {
                        Circle().fill(color).frame(width: 12, height: 12)
                    } else {
                        Text(MetricsWidget.trendMarks[tile.trend] ?? "→").font(GlassType.value).foregroundStyle(color)
                    }
                }
                .frame(width: 20)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Trend \(tile.trend == "up" ? "rising" : tile.trend == "down" ? "falling" : "steady"), change")
            .touchTarget()
            CardTextField("Label", text: tile.label) { next in
                context.update { $0.patchRecord(in: "tiles", id: tile.id) { $0["label"] = .string(next) } }
            }
            .foregroundStyle(.secondary)
            if showValue {
                CardTextField("Value", text: tile.value) { next in
                    context.update { $0.patchRecord(in: "tiles", id: tile.id) { $0["value"] = .string(next) } }
                }
                .font(GlassType.value).multilineTextAlignment(.trailing).foregroundStyle(accent).frame(width: 64)
                CardTextField("Unit", text: tile.unit) { next in
                    context.update { $0.patchRecord(in: "tiles", id: tile.id) { $0["unit"] = .string(next) } }
                }
                .font(GlassType.heroUnit).foregroundStyle(.secondary).frame(width: 30)
            }
            RowDeleteButton(label: "Remove \(tile.label.isEmpty ? "metric" : tile.label)") {
                context.update { $0.removeRecord(in: "tiles", id: tile.id) }
            }
        }
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `metricsFace`: one number the size of the card for `big_number`; lit
    /// chips for `traffic_lights`; bars of each reading against the largest
    /// for `target`; rows with the trend mark otherwise.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let tiles = MetricsWidget.tiles(data)
        if tiles.isEmpty { return .icon }
        let skin = MetricsWidget.skin(data)
        if skin == "big_number" {
            let lead = tiles[0]
            return .metric(primary: RestText.compact(MetricsWidget.reading(lead), 12), secondary: RestText.compact(lead.label.isEmpty ? "Metric" : lead.label, 20), tone: MetricsWidget.trendTones[lead.trend])
        }
        if skin == "traffic_lights" {
            let visible = Array(tiles.prefix(RestingFaceMeasure.cellLimit))
            return .chips(chips: visible.map { tile in RestChip(key: tile.id, text: RestText.compact(tile.label.isEmpty ? "Metric" : tile.label, 14), tone: MetricsWidget.trendTones[tile.trend], filled: true) }, overflow: max(0, tiles.count - visible.count))
        }
        if skin == "target" {
            let shown = Array(tiles.prefix(RestingFaceMeasure.barLimit))
            let peak = max(1, shown.map { abs(MetricsWidget.number($0.value)) }.max() ?? 1)
            return .bars(bars: shown.map { tile in
                RestBar(key: tile.id, label: RestText.compact(tile.label.isEmpty ? "Metric" : tile.label, 18), value: RestText.compact(MetricsWidget.reading(tile), 10), fraction: RestText.fraction(abs(MetricsWidget.number(tile.value)) / peak), tone: MetricsWidget.trendTones[tile.trend])
            })
        }
        let visible = Array(tiles.prefix(RestingFaceMeasure.rowLimit))
        return .rows(rows: visible.map { tile in
            RestRow(key: tile.id, label: RestText.compact(tile.label.isEmpty ? "Metric" : tile.label, 20), value: RestText.compact("\(MetricsWidget.trendMarks[tile.trend] ?? "")\(MetricsWidget.reading(tile))", 12), tone: MetricsWidget.trendTones[tile.trend])
        }, overflow: max(0, tiles.count - visible.count))
    }
}
