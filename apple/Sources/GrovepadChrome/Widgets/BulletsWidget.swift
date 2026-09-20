import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Bullets (`components/widgets/modules/BulletsWidget.tsx`, `bulletSkinModel.ts`,
// `restingFaces/text.ts bulletsRestingFace`). One list, three skins: dots,
// numbered, nested_outline (levels and collapsed ids in the skin pocket).
// The skin field is `skin`. Adding goes through the `add_item` command so a
// tap and a wire append the same record.
// ---------------------------------------------------------------------------

public struct BulletsWidget: WidgetRenderer {
    public static let type = "bullets"
    static let skins: Set<String> = ["dots", "numbered", "nested_outline"]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "dots"
    }

    /// `bulletOutlineState`: one level per item, clamped to parent + 1 and 3.
    static func outlineLevels(_ items: [JSONObject], state: JSONObject) -> [String: Int] {
        let raw = state.object("levels") ?? JSONObject()
        var levels: [String: Int] = [:]
        var previous = 0
        for (index, item) in items.enumerated() {
            let id = item.str("id")
            let requested = raw.finite(id).map { Int(jsRound($0)) } ?? 0
            let level = index == 0 ? 0 : min(3, max(0, min(requested, previous + 1)))
            if level > 0 { levels[id] = level }
            previous = level
        }
        return levels
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = BulletsWidget.skin(data)
        let items = data.recordList("items")
        let levels = skin == "nested_outline" ? BulletsWidget.outlineLevels(items, state: data.skinState("nested_outline")) : [:]
        let accent = Color(hex: context.accent)
        return VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element["id"]) { index, item in
                let id = item.str("id")
                HStack(spacing: 8) {
                    marker(skin: skin, index: index, accent: accent)
                        .padding(.leading, CGFloat(levels[id] ?? 0) * 14)
                    CardTextField("Point", text: item.str("text")) { next in
                        context.update { $0.patchRecord(in: "items", id: id) { $0["text"] = .string(next) } }
                    }
                    RowDeleteButton(label: "Remove point") {
                        context.update { $0.removeRecord(in: "items", id: id) }
                    }
                }
            }
            // No solo-button island (Article XIX): the add control sits in the flow.
            Button { context.runCommand("add_item") } label: {
                Label("Add point", systemImage: "plus")
                    .font(GlassType.body)
                    .foregroundStyle(accent)
            }
            .buttonStyle(.plain)
            .touchTarget()
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func marker(skin: String, index: Int, accent: Color) -> some View {
        Group {
            if skin == "numbered" {
                Text("\(index + 1).").font(GlassType.body).monospacedDigit().foregroundStyle(.secondary)
            } else {
                Circle().fill(accent).frame(width: 6, height: 6)
            }
        }
        .frame(width: 22, alignment: .trailing)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// The folded card is the open card's island: the same markers against
    /// the same points, minus the add control. No eyebrow — the list IS the label.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let items = data.recordList("items").filter { !$0.trimmedStr("text").isEmpty }
        if items.isEmpty { return .icon }
        let skin = BulletsWidget.skin(data)
        if skin == "nested_outline" {
            let state = data.skinState("nested_outline")
            let levels = BulletsWidget.outlineLevels(items, state: state)
            let collapsed = Set((state.array("collapsedIds") ?? []).compactMap(\.stringValue))
            var rows: [RestRow] = []
            var hiddenBelow: Int?
            var total = 0
            for (index, item) in items.enumerated() {
                let id = item.str("id")
                let level = levels[id] ?? 0
                if let hidden = hiddenBelow {
                    if level > hidden { continue }
                    hiddenBelow = nil
                }
                let next = index + 1 < items.count ? items[index + 1] : nil
                let hasChildren = next.map { (levels[$0.str("id")] ?? 0) > level } ?? false
                let isCollapsed = hasChildren && collapsed.contains(id)
                total += 1
                if rows.count < RestingFaceMeasure.rowLimit {
                    rows.append(RestRow(
                        key: id, label: RestText.compact(item.str("text"), 26),
                        value: isCollapsed ? "···" : nil, marker: true, indent: level, tone: isCollapsed ? .muted : nil
                    ))
                }
                if isCollapsed { hiddenBelow = level }
            }
            return .rows(rows: rows, overflow: max(0, items.count - rows.count))
        }
        let visible = items.prefix(RestingFaceMeasure.rowLimit)
        let rows = visible.enumerated().map { index, item in
            RestRow(
                key: item.str("id"), label: RestText.compact(item.str("text"), 32),
                lead: skin == "numbered" ? "\(index + 1)" : nil, marker: skin != "numbered"
            )
        }
        return .rows(rows: rows, overflow: max(0, items.count - rows.count))
    }
}
