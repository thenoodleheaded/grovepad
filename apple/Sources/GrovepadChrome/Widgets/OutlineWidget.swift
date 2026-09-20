import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Outline (`components/widgets/modules/OutlineWidget.tsx`, `outlineSkinModel.ts`,
// `restingFaces/outline.ts`). One hierarchy of `{ id, text, depth, collapsed }`
// items, seven dresses; the skin field is `skin`. Every skin is the same row
// list with its own markers and context words, so this port draws the list
// for all seven: text, depth (indent / outdent, 0…5), collapse and remove
// are edited in place; adding inserts after the last item at its depth.
//
// work_breakdown and collapsible_brief are schema extensions: their pockets
// (`skinStates[skin].items`, `expandedIds`) are read for the markers and the
// resting face, never edited, and removing an item takes its extras with it
// (`dataWithoutOutlineItem`).
// ---------------------------------------------------------------------------

public struct OutlineWidget: WidgetRenderer {
    public static let type = "outline"
    static let skins = ["tree", "roman", "scenes", "sitemap", "course", "work_breakdown", "collapsible_brief"]
    static let extensionSkins: Set<String> = ["work_breakdown", "collapsible_brief"]
    static let maxItems = 240
    static let maxDepth = 5

    /// `SKIN_META` / the resting `EYEBROWS`: the open card's own heading.
    static let eyebrows: [String: (label: String, hint: String)] = [
        "tree": ("Idea tree", "Branches stay close to their roots"),
        "roman": ("Formal outline", "Document-ready hierarchy"),
        "scenes": ("Story board", "Acts, scenes, and beats"),
        "sitemap": ("Site structure", "Sections, pages, and routes"),
        "course": ("Learning path", "Modules, lessons, and exercises"),
        "work_breakdown": ("Delivery plan", "Owners, effort, and completion"),
        "collapsible_brief": ("Expandable brief", "Headings with supporting detail"),
    ]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "tree"
    }

    /// One normalised item (`outlineItems`): the record plus its readings.
    struct Item {
        var id: String
        var text: String
        var depth: Int
        var collapsed: Bool
    }

    static func items(_ data: JSONObject) -> [Item] {
        (data.array("items") ?? []).prefix(maxItems).enumerated().compactMap { index, raw in
            guard let record = raw.objectValue else { return nil }
            let id = record.str("id")
            let depth = record.finite("depth").map { Int($0.rounded(.towardZero)) } ?? 0
            return Item(
                id: id.isEmpty ? "outline-\(index)" : id,
                text: String(record.str("text").prefix(2_000)),
                depth: max(0, min(maxDepth, depth)),
                collapsed: record.bool("collapsed") == true
            )
        }
    }

    struct Visible {
        var item: Item
        var index: Int
        var hasChildren: Bool
    }

    /// `visibleOutlineItems`: rows under a collapsed branch stay hidden.
    static func visibleItems(_ items: [Item]) -> [Visible] {
        var visible: [Visible] = []
        var collapsedDepths: [Int] = []
        for (index, item) in items.enumerated() {
            while let last = collapsedDepths.last, last >= item.depth { collapsedDepths.removeLast() }
            let hidden = !collapsedDepths.isEmpty
            let hasChildren = index + 1 < items.count && items[index + 1].depth > item.depth
            if !hidden { visible.append(Visible(item: item, index: index, hasChildren: hasChildren)) }
            if !hidden, item.collapsed, hasChildren { collapsedDepths.append(item.depth) }
        }
        return visible
    }

    static func siblingOrdinal(_ items: [Item], _ index: Int) -> Int {
        guard items.indices.contains(index) else { return 1 }
        let depth = items[index].depth
        var ordinal = 1
        var cursor = index - 1
        while cursor >= 0 {
            let candidate = items[cursor]
            if candidate.depth < depth { break }
            if candidate.depth == depth { ordinal += 1 }
            cursor -= 1
        }
        return ordinal
    }

    static func roman(_ value: Int) -> String {
        let units: [(Int, String)] = [(100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
        var remaining = max(1, min(399, value))
        var result = ""
        for (amount, glyph) in units {
            while remaining >= amount { result += glyph; remaining -= amount }
        }
        return result
    }

    static func alpha(_ value: Int) -> String {
        var remaining = max(1, value)
        var result = ""
        while remaining > 0 {
            remaining -= 1
            result = String(UnicodeScalar(65 + remaining % 26)!) + result
            remaining /= 26
        }
        return result
    }

    /// `outlineRomanMarker`: I. / A. / 1. by depth.
    static func romanMarker(_ items: [Item], _ index: Int) -> String {
        let depth = items.indices.contains(index) ? items[index].depth : 0
        let ordinal = siblingOrdinal(items, index)
        if depth % 3 == 0 { return "\(roman(ordinal))." }
        if depth % 3 == 1 { return "\(alpha(ordinal))." }
        return "\(ordinal)."
    }

    /// `outlineContextLabel`: the word a blank row holds its place with.
    static func contextLabel(skin: String, depth: Int) -> String {
        switch skin {
        case "scenes": return depth == 0 ? "Act" : depth == 1 ? "Scene" : "Beat"
        case "sitemap": return depth == 0 ? "Section" : depth == 1 ? "Page" : "Route"
        case "course": return depth == 0 ? "Module" : depth == 1 ? "Lesson" : "Exercise"
        case "work_breakdown": return depth == 0 ? "Deliverable" : depth == 1 ? "Workstream" : "Task"
        case "collapsible_brief": return depth == 0 ? "Heading" : "Point"
        default: return depth == 0 ? "Root" : "Branch"
        }
    }

    struct WorkDetail {
        var owner: String
        var estimate: String
        var complete: Bool
    }

    /// `outlineWorkDetails`: the delivery plan's pocket, read only.
    static func workDetails(_ data: JSONObject) -> [String: WorkDetail] {
        let source = data.skinState("work_breakdown").object("items") ?? JSONObject()
        var result: [String: WorkDetail] = [:]
        for (id, raw) in source.entries.prefix(maxItems) {
            let detail = raw.objectValue ?? JSONObject()
            let owner = String(detail.str("owner").prefix(80))
            let estimate = String(detail.str("estimate").prefix(40))
            let complete = detail.bool("complete") == true
            if !owner.isEmpty || !estimate.isEmpty || complete { result[id] = WorkDetail(owner: owner, estimate: estimate, complete: complete) }
        }
        return result
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = OutlineWidget.skin(data)
        let items = OutlineWidget.items(data)
        let visible = OutlineWidget.visibleItems(items)
        let details = OutlineWidget.workDetails(data)
        let accent = Color(hex: context.accent)
        let meta = OutlineWidget.eyebrows[skin] ?? OutlineWidget.eyebrows["tree"]!
        let topLevel = items.filter { $0.depth == 0 }.count
        let addAfter = { (index: Int) in
            let id = context.mint()
            context.update { data in
                var list = data.array("items") ?? []
                var record = JSONObject()
                record["id"] = .string(id)
                record["text"] = .string("")
                record["depth"] = .number(Double(index >= 0 && index < items.count ? items[index].depth : 0))
                record["collapsed"] = .bool(false)
                list.insert(.object(record), at: min(list.count, index + 1))
                data["items"] = .array(list)
                data["skin"] = .string(skin)
            }
        }
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 0) {
                    GlassLabel(meta.label)
                    Text(meta.hint).font(GlassType.label).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Text("\(topLevel) roots · \(items.count) items").font(GlassType.label).monospacedDigit().foregroundStyle(.secondary)
            }
            if OutlineWidget.extensionSkins.contains(skin) {
                NotesSkinNote("Shown as the list — owners, effort and supporting notes arrive with the \(meta.label.lowercased()) later.")
            }
            if skin == "work_breakdown" {
                let completed = items.filter { details[$0.id]?.complete == true }.count
                let completion = items.isEmpty ? 0.0 : Double(completed) / Double(items.count)
                HStack(spacing: 6) {
                    Text("\(Int(jsRound(completion * 100)))% complete").font(GlassType.label).monospacedDigit()
                    Capsule().fill(Color.lift.opacity(0.08)).frame(height: 4)
                        .overlay(alignment: .leading) { GeometryReader { proxy in Capsule().fill(accent).frame(width: proxy.size.width * CGFloat(completion)) } }
                }
            }
            if visible.isEmpty {
                FlowButton("Start your outline", symbol: "plus", accent: accent) { addAfter(-1) }
            }
            ForEach(visible, id: \.item.id) { entry in
                let item = entry.item
                HStack(spacing: 6) {
                    marker(skin: skin, entry: entry, items: items, details: details, accent: accent)
                        .padding(.leading, CGFloat(item.depth) * 14)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(OutlineWidget.contextLabel(skin: skin, depth: item.depth)).font(GlassType.label).foregroundStyle(.secondary)
                        CardTextField(skin == "scenes" ? "Describe this beat…" : "Outline item…", text: item.text) { next in
                            context.update { data in
                                data.patchRecord(in: "items", id: item.id) { $0["text"] = .string(next) }
                                data["skin"] = .string(skin)
                            }
                        }
                    }
                    if entry.hasChildren {
                        GhostButton(item.collapsed ? "chevron.right" : "chevron.down", label: item.collapsed ? "Expand \(item.text.isEmpty ? "branch" : item.text)" : "Collapse \(item.text.isEmpty ? "branch" : item.text)") {
                            context.update { data in
                                data.patchRecord(in: "items", id: item.id) { $0["collapsed"] = .bool(!item.collapsed) }
                                data["skin"] = .string(skin)
                            }
                        }
                    }
                    GhostButton("arrow.left.to.line", label: "Outdent \(item.text.isEmpty ? "item" : item.text)") {
                        guard item.depth > 0 else { return }
                        context.update { data in
                            data.patchRecord(in: "items", id: item.id) { $0["depth"] = .number(Double(max(0, item.depth - 1))) }
                            data["skin"] = .string(skin)
                        }
                    }
                    .opacity(item.depth == 0 ? 0.35 : 1)
                    GhostButton("arrow.right.to.line", label: "Indent \(item.text.isEmpty ? "item" : item.text)") {
                        guard item.depth < OutlineWidget.maxDepth, entry.index > 0 else { return }
                        context.update { data in
                            data.patchRecord(in: "items", id: item.id) { $0["depth"] = .number(Double(min(OutlineWidget.maxDepth, item.depth + 1))) }
                            data["skin"] = .string(skin)
                        }
                    }
                    .opacity(item.depth >= OutlineWidget.maxDepth || entry.index == 0 ? 0.35 : 1)
                    RowDeleteButton(label: "Remove \(item.text.isEmpty ? "item" : item.text)") {
                        context.update { data in
                            // `dataWithoutOutlineItem`: the item and its extras in every pocket.
                            data.removeRecord(in: "items", id: item.id)
                            data.removeFromEverySkinPocket(id: item.id, in: ["items"])
                            if let states = data.object("skinStates") {
                                for skinKey in states.keys {
                                    data.patchSkinState(skinKey) { state in
                                        guard let expanded = state.array("expandedIds") else { return }
                                        let kept = expanded.filter { $0.stringValue != item.id }
                                        if kept.isEmpty { _ = state.removeValue(forKey: "expandedIds") } else { state["expandedIds"] = .array(kept) }
                                    }
                                }
                            }
                            data["skin"] = .string(skin)
                        }
                    }
                }
            }
            HStack {
                FlowButton("Add \(skin == "scenes" ? "beat" : skin == "course" ? "lesson" : "item")", symbol: "plus", accent: accent) { addAfter(items.count - 1) }
                Spacer(minLength: 0)
                Text("Tap ← → to lift or nest").font(GlassType.label).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    @ViewBuilder
    private func marker(skin: String, entry: Visible, items: [Item], details: [String: WorkDetail], accent: Color) -> some View {
        let item = entry.item
        Group {
            switch skin {
            case "roman":
                Text(OutlineWidget.romanMarker(items, entry.index)).font(GlassType.label).monospacedDigit().foregroundStyle(.secondary)
            case "scenes":
                if item.depth == 0 {
                    Image(systemName: "film").font(.system(size: 11)).foregroundStyle(accent)
                } else {
                    Text(OutlineWidget.romanMarker(items, entry.index).replacingOccurrences(of: ".", with: "")).font(GlassType.label).foregroundStyle(.secondary)
                }
            case "sitemap":
                Image(systemName: entry.hasChildren || item.depth == 0 ? "folder" : "doc").font(.system(size: 11)).foregroundStyle(item.depth == 0 ? accent : .secondary)
            case "course", "work_breakdown":
                let complete = details[item.id]?.complete == true
                Image(systemName: complete ? "checkmark.circle.fill" : item.depth == 0 ? "book" : "circle").font(.system(size: 11)).foregroundStyle(complete ? accent : .secondary)
            case "collapsible_brief":
                Image(systemName: "chevron.right").font(.system(size: 11)).foregroundStyle(.secondary)
            default:
                Circle().fill(accent).frame(width: 5, height: 5)
            }
        }
        .frame(width: 22, alignment: .trailing)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `outlineRestingFace`: the rows the open card is showing, with what each
    /// skin adds — roman leads, story ordinals, sitemap tones, course checks,
    /// the delivery plan's completion meter.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let items = OutlineWidget.items(data)
        let skin = OutlineWidget.skin(data)
        if !items.contains(where: { !JavaScript.trim($0.text).isEmpty }) { return .icon }
        let visible = OutlineWidget.visibleItems(items)
        let shown = visible.prefix(RestingFaceMeasure.rowLimit)
        let overflow = max(0, visible.count - shown.count)
        let details = OutlineWidget.workDetails(data)
        let rows: [RestRow] = shown.map { entry in
            let item = entry.item
            let blank = JavaScript.trim(item.text).isEmpty
            var row = RestRow(
                key: item.id,
                label: blank ? OutlineWidget.contextLabel(skin: skin, depth: item.depth) : RestText.compact(item.text, 26),
                indent: item.depth,
                tone: blank ? .muted : nil
            )
            switch skin {
            case "roman":
                row.lead = OutlineWidget.romanMarker(items, entry.index)
            case "scenes":
                if item.depth == 0 { row.tone = row.tone ?? .accent } else { row.lead = OutlineWidget.romanMarker(items, entry.index).replacingOccurrences(of: ".", with: "") }
            case "sitemap":
                let leaf = !entry.hasChildren && item.depth > 0
                row.tone = row.tone ?? (item.depth == 0 ? .accent : leaf ? .muted : nil)
            case "course":
                row.done = details[item.id]?.complete == true
            case "work_breakdown":
                row.done = details[item.id]?.complete == true
                let trailing = details[item.id].map { $0.estimate.isEmpty ? $0.owner : $0.estimate } ?? ""
                if !trailing.isEmpty { row.value = RestText.compact(trailing, 12) }
            case "collapsible_brief":
                row.tone = row.tone ?? (item.depth == 0 ? nil : .muted)
            default:
                break
            }
            return row
        }
        let label = OutlineWidget.eyebrows[skin]?.label ?? "Idea tree"
        if skin == "work_breakdown" {
            let completed = items.filter { details[$0.id]?.complete == true }.count
            let completion = items.isEmpty ? 0.0 : Double(completed) / Double(items.count)
            return .rows(rows: rows, overflow: overflow, eyebrow: RestEyebrow(label: label, note: "\(Int(jsRound(completion * 100)))%"), meter: completion)
        }
        return NotesAndStudyFamily.dressed(.rows(rows: rows, overflow: overflow, eyebrow: RestEyebrow(label: label)), type: OutlineWidget.type, data: data)
    }
}
