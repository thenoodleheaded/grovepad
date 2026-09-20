import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Link List (`components/widgets/modules/LinksWidget.tsx`,
// `restingFaces/text.ts linksRestingFace`). Labelled external links, edited
// inline; the arrow opens one. Adding goes through the `add_item` command
// (an empty payload appends the same `{ id, label: "", url: "" }` record the
// web's own button writes), so a tap and a wire append alike. The skin field
// is `skin`.
//
// Ported skins: bookmark_grid (a two-column wall of tiles), reading_queue,
// resource_list, link_in_bio (the list). research_trail, watch_later and
// health_monitor render the list with a note; pockets are preserved.
// ---------------------------------------------------------------------------

public struct LinksWidget: WidgetRenderer {
    public static let type = "links"
    static let skins: Set<String> = ["bookmark_grid", "reading_queue", "resource_list", "link_in_bio", "research_trail", "watch_later", "health_monitor"]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "bookmark_grid"
    }

    /// `hostnameOf`: the host without a leading `www.`, or "".
    static func host(of url: String) -> String {
        guard let parsed = URL(string: JavaScript.trim(url)), let host = parsed.host, let scheme = parsed.scheme, !scheme.isEmpty else { return "" }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    struct Link { var id: String, label: String, url: String }

    static func links(_ data: JSONObject) -> [Link] {
        data.recordList("items").enumerated().map { index, entry in
            Link(id: entry.string("id") ?? "link-\(index)", label: entry.str("label"), url: entry.str("url"))
        }
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = LinksWidget.skin(data)
        let items = LinksWidget.links(data)
        let accent = Color(hex: context.accent)
        return VStack(alignment: .leading, spacing: 4) {
            if !["bookmark_grid", "reading_queue", "resource_list", "link_in_bio"].contains(skin) {
                SkinNote("Shown as a list — the \(skin.replacingOccurrences(of: "_", with: " ")) skin arrives later.")
            }
            if skin == "bookmark_grid" {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)], spacing: 6) {
                    ForEach(items, id: \.id) { item in
                        Island(padding: 8) { row(context, item: item, accent: accent, stacked: true) }
                    }
                }
            } else {
                ForEach(items, id: \.id) { item in
                    row(context, item: item, accent: accent, stacked: false)
                }
            }
            Button { context.runCommand("add_item") } label: {
                Label("Add link", systemImage: "plus").font(GlassType.body).foregroundStyle(accent)
            }
            .buttonStyle(.plain)
            .touchTarget()
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    @ViewBuilder
    private func row(_ context: WidgetCardContext, item: Link, accent: Color, stacked: Bool) -> some View {
        let host = LinksWidget.host(of: item.url)
        let fields = Group {
            CardTextField("Link label", text: item.label) { next in
                context.update { $0.patchRecord(in: "items", id: item.id) { $0["label"] = .string(next) } }
            }
            CardTextField("Link URL", text: item.url) { next in
                context.update { $0.patchRecord(in: "items", id: item.id) { $0["url"] = .string(next) } }
            }
            .font(GlassType.label)
            .foregroundStyle(.secondary)
        }
        let actions = HStack(spacing: 0) {
            if !host.isEmpty, let url = URL(string: JavaScript.trim(item.url)) {
                SwiftUI.Link(destination: url) {
                    Image(systemName: "arrow.up.right.square").font(.system(size: 13, weight: .semibold)).foregroundStyle(accent)
                }
                .accessibilityLabel("Open \(host)")
                .touchTarget()
            }
            RowDeleteButton(label: "Remove link") {
                context.update { $0.removeRecord(in: "items", id: item.id) }
            }
        }
        if stacked {
            VStack(alignment: .leading, spacing: 0) {
                fields
                HStack { Text(host).font(GlassType.label).foregroundStyle(.secondary).lineLimit(1); Spacer(minLength: 0); actions }
            }
        } else {
            HStack(spacing: 6) {
                Image(systemName: "link").font(.system(size: 10)).foregroundStyle(.secondary)
                fields
                actions
            }
        }
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// A bookmark grid folds to chips; every other skin to rows with the
    /// host as the trailing value.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let links = LinksWidget.links(data).map { Link(id: $0.id, label: JavaScript.trim($0.label), url: JavaScript.trim($0.url)) }.filter { !$0.label.isEmpty || !$0.url.isEmpty }
        if links.isEmpty { return .icon }
        if data.string("skin") == "bookmark_grid" {
            let shown = Array(links.prefix(RestingFaceMeasure.cellLimit))
            return .chips(
                chips: shown.map { link in
                    let host = LinksWidget.host(of: link.url)
                    return RestChip(key: link.id, text: RestText.compact(!link.label.isEmpty ? link.label : !host.isEmpty ? host : link.url, 14), filled: true)
                },
                overflow: max(0, links.count - shown.count)
            )
        }
        let visible = Array(links.prefix(RestingFaceMeasure.rowLimit))
        return .rows(
            rows: visible.map { link in
                let host = LinksWidget.host(of: link.url)
                let hasValue = !link.label.isEmpty && !host.isEmpty
                return RestRow(key: link.id, label: RestText.compact(!link.label.isEmpty ? link.label : !host.isEmpty ? host : link.url, 26), value: hasValue ? RestText.compact(host, 16) : nil, tone: hasValue ? .muted : nil)
            },
            overflow: max(0, links.count - visible.count)
        )
    }
}
