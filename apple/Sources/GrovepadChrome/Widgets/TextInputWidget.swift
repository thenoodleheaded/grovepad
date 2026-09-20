import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Text Input (`components/widgets/modules/TextInputWidget.tsx`,
// `textInputSkinModel.ts`, `restingFaces/text.ts textInputRestingFace`). One
// string, seven ways to ask for it: whichever skin is worn the card emits
// the same `value`, and every write goes through the `value` field setter
// with `skin` and `multiline` kept in step (`patch`). The skin field is
// `skin`.
//
// Ported skins: single_line, multiline, search, url, email, tags (chips over
// the same comma-separated value), command (the prompt with its run
// history in the skin's pocket).
// ---------------------------------------------------------------------------

public struct TextInputWidget: WidgetRenderer {
    public static let type = "text_input"
    static let skins: [String] = ["single_line", "multiline", "search", "url", "email", "tags", "command"]
    static let placeholders: [String: String] = [
        "single_line": "Type a value…", "multiline": "Write the passage this card should carry…", "search": "Search for…", "url": "example.com/page",
        "email": "name@example.com", "tags": "Add a tag", "command": "deploy --preview",
    ]
    static let tagLimit = 24
    static let tagLength = 32
    static let historyLimit = 12

    public init() {}

    /// `textInputSkinMode`: the worn skin, else the shape `multiline` wrote.
    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        if skins.contains(raw) { return raw }
        return data.bool("multiline") == true ? "multiline" : "single_line"
    }

    static func placeholder(_ skin: String, own: String) -> String {
        let trimmed = JavaScript.trim(own)
        return trimmed.isEmpty ? (placeholders[skin] ?? "") : own
    }

    /// `textInputTags`: split on commas, trimmed, bounded, unique (case-insensitively).
    static func tags(_ raw: String) -> [String] {
        var seen = Set<String>()
        var tags: [String] = []
        for piece in raw.split(separator: ",", omittingEmptySubsequences: false) {
            let tag = JavaScript.prefix(JavaScript.trim(String(piece)), utf16Count: tagLength)
            if tag.isEmpty { continue }
            let key = tag.lowercased()
            if seen.contains(key) { continue }
            seen.insert(key)
            tags.append(tag)
            if tags.count >= tagLimit { break }
        }
        return tags
    }

    static func joinTags(_ tags: [String]) -> String { tags.joined(separator: ", ") }

    /// `textInputHistory`: bounded, de-duplicated, validated.
    static func history(_ raw: JSONValue?) -> [String] {
        guard let items = raw?.arrayValue else { return [] }
        var seen = Set<String>()
        var entries: [String] = []
        for item in items {
            guard let text = item.stringValue else { continue }
            let entry = JavaScript.prefix(JavaScript.trim(text), utf16Count: 240)
            if entry.isEmpty || seen.contains(entry) { continue }
            seen.insert(entry)
            entries.append(entry)
            if entries.count >= historyLimit { break }
        }
        return entries
    }

    /// `withCommandRun`: most recent first, never the same line twice.
    static func withRun(_ history: [String], _ entry: String) -> [String] {
        let line = JavaScript.trim(entry)
        if line.isEmpty { return history }
        return TextInputWidget.history(.array(([line] + history).map { .string($0) }))
    }

    /// `textInputLink`: only http(s) becomes a link; the host is what a folded card shows.
    static func link(_ raw: String) -> (valid: Bool, host: String, scheme: String) {
        let value = JavaScript.trim(raw)
        guard !value.isEmpty, let url = URL(string: value), let scheme = url.scheme?.lowercased() else { return (false, "", "") }
        guard scheme == "http" || scheme == "https", let host = url.host, !host.isEmpty else { return (false, "", scheme) }
        return (true, host, scheme)
    }

    /// `textInputEmail`: `user@domain.tld`.
    static func email(_ raw: String) -> (valid: Bool, domain: String) {
        let value = JavaScript.trim(raw)
        let parts = value.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty, !parts[0].contains(where: \.isWhitespace) else { return (false, "") }
        let domain = String(parts[1])
        guard let dot = domain.lastIndex(of: "."), domain.distance(from: domain.index(after: dot), to: domain.endIndex) >= 2, !domain.contains(where: \.isWhitespace), dot != domain.startIndex else { return (false, "") }
        return (true, domain)
    }

    /// `patch({ value })`: the field setter, with `skin` and `multiline` kept in step.
    static func writeValue(_ context: WidgetCardContext, skin: String, _ value: String) {
        context.update { data in
            if let setter = fieldDescriptor("text_input", "value")?.set {
                data = setter(data, .text(value), context.mint)
            }
            data["skin"] = .string(skin)
            data["multiline"] = .bool(skin == "multiline")
        }
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = TextInputWidget.skin(data)
        let value = data.str("value")
        let accent = Color(hex: context.accent)
        let placeholder = TextInputWidget.placeholder(skin, own: data.str("placeholder"))
        return VStack(alignment: .leading, spacing: 6) {
            CardTextField("Label", text: data.str("label")) { next in
                context.update { $0["label"] = .string(next); $0["skin"] = .string(skin) }
            }
            .foregroundStyle(.secondary)
            switch skin {
            case "multiline":
                TextEditor(text: Binding(get: { value }, set: { TextInputWidget.writeValue(context, skin: skin, $0) }))
                    .font(GlassType.body)
                    .scrollContentBackground(.hidden)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .frame(minHeight: GlassTokens.touchTarget)
                    .accessibilityLabel(data.str("label", "Text"))
                    .overlay(alignment: .topLeading) {
                        if value.isEmpty { Text(placeholder).font(GlassType.body).foregroundStyle(.tertiary).padding(.leading, 5).padding(.top, 8).allowsHitTesting(false) }
                    }
            case "tags":
                let tags = TextInputWidget.tags(value)
                if !tags.isEmpty {
                    FlowChips(tags) { tag in
                        HStack(spacing: 2) {
                            Text(tag).font(GlassType.label).foregroundStyle(accent)
                            RowDeleteButton(label: "Remove \(tag)") {
                                TextInputWidget.writeValue(context, skin: skin, TextInputWidget.joinTags(tags.filter { $0.lowercased() != tag.lowercased() }))
                            }
                        }
                        .padding(.leading, 8)
                        .background(Capsule().fill(accent.opacity(0.16)))
                    }
                }
                TagAdder(placeholder: placeholder) { addition in
                    TextInputWidget.writeValue(context, skin: skin, TextInputWidget.joinTags(TextInputWidget.tags("\(value), \(addition)")))
                }
            case "command":
                let history = TextInputWidget.history(data.skinState("command")["history"])
                HStack(spacing: 6) {
                    Text("❯").font(.system(size: 13, weight: .bold, design: .monospaced)).foregroundStyle(accent)
                    CardTextField(placeholder, text: value) { next in TextInputWidget.writeValue(context, skin: skin, next) }
                        .font(.system(size: 13, design: .monospaced))
                    GhostButton("return", label: "Run command") {
                        context.update { data in
                            var pocket = data.skinState("command")
                            pocket["history"] = .array(TextInputWidget.withRun(history, value).map { .string($0) })
                            data["skin"] = .string(skin)
                            data["multiline"] = .bool(false)
                            data.setSkinState("command", pocket)
                        }
                    }
                }
                ForEach(Array(history.prefix(4).enumerated()), id: \.offset) { _, entry in
                    Text("  \(entry)").font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary).lineLimit(1)
                }
            default:
                HStack(spacing: 6) {
                    if skin == "search" { Image(systemName: "magnifyingglass").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary) }
                    if skin == "url" { Image(systemName: "link").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary) }
                    if skin == "email" { Image(systemName: "envelope").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary) }
                    CardTextField(placeholder, text: value) { next in TextInputWidget.writeValue(context, skin: skin, next) }
                    if !value.isEmpty {
                        GhostButton("xmark.circle.fill", label: "Clear") { TextInputWidget.writeValue(context, skin: skin, "") }
                    }
                }
                if skin == "url", !JavaScript.trim(value).isEmpty {
                    let link = TextInputWidget.link(value)
                    Text(link.valid ? link.host : link.scheme.isEmpty ? "Not a link" : "\(link.scheme): is not a web link").font(GlassType.label).foregroundStyle(link.valid ? Color.secondary : Color(hex: "#f87171"))
                }
                if skin == "email", !JavaScript.trim(value).isEmpty {
                    let email = TextInputWidget.email(value)
                    Text(email.valid ? email.domain : "Check address").font(GlassType.label).foregroundStyle(email.valid ? Color.secondary : Color(hex: "#f59e0b"))
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// Tags fold to chips, an address to a row under its host, a query to a
    /// row with the search glyph, a command to its prompt line over what has
    /// already been run; plain text to the words themselves.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let value = JavaScript.trim(data.str("value"))
        let skin = TextInputWidget.skin(data)
        let label = JavaScript.trim(data.str("label"))
        if skin == "tags" {
            let tags = TextInputWidget.tags(data.str("value"))
            if tags.isEmpty { return .icon }
            let visible = Array(tags.prefix(RestingFaceMeasure.cellLimit))
            return .chips(chips: visible.enumerated().map { index, tag in RestChip(key: "\(tag)-\(index)", text: RestText.compact(tag, 14), filled: true) }, overflow: max(0, tags.count - visible.count))
        }
        if skin == "command" {
            let history = TextInputWidget.history(data.skinState("command")["history"])
            if value.isEmpty, history.isEmpty { return .icon }
            let lines = [RestLine(key: "prompt", left: "❯ \(RestText.compact(value.isEmpty ? "…" : value, 24))", tone: .accent)]
                + history.prefix(RestingFaceMeasure.lineLimit - 1).enumerated().map { index, entry in RestLine(key: "history-\(index)", left: "  \(RestText.compact(entry, 24))", dim: true) }
            return .lines(lines: lines, eyebrow: RestEyebrow(label: "Command", note: history.isEmpty ? nil : "\(history.count) run"), mono: true)
        }
        if value.isEmpty { return .icon }
        if skin == "url" {
            let link = TextInputWidget.link(value)
            return .rows(
                rows: [RestRow(key: "url", label: RestText.compact(value, 34), tone: link.valid ? nil : .bad)],
                overflow: 0,
                eyebrow: RestEyebrow(label: "Link", note: link.valid ? link.host : link.scheme.isEmpty ? "Not a link" : "\(link.scheme):", tone: link.valid ? nil : .bad)
            )
        }
        if skin == "email" {
            let email = TextInputWidget.email(value)
            return .rows(rows: [RestRow(key: "address", label: RestText.compact(value, 34), tone: email.valid ? nil : .warn)], overflow: 0, eyebrow: RestEyebrow(label: "Email", note: email.valid ? email.domain : "Check address"))
        }
        if skin == "search" {
            return .rows(rows: [RestRow(key: "query", label: RestText.compact(value, 32), lead: "⌕", tone: .accent)], overflow: 0, eyebrow: RestEyebrow(label: RestText.compact(label.isEmpty ? "Search" : label, 18)))
        }
        // single_line and multiline: the words themselves.
        return .text(text: RestText.compact(value, RestingFaceMeasure.textClamp))
    }
}

/// Chips that wrap onto new lines as the card allows.
struct FlowChips<Content: View>: View {
    let items: [String]
    let content: (String) -> Content

    init(_ items: [String], @ViewBuilder content: @escaping (String) -> Content) {
        self.items = items
        self.content = content
    }

    var body: some View {
        // A simple row-breaking layout: chips flow left to right, wrapping.
        FlowLayout(spacing: 4) {
            ForEach(items, id: \.self) { item in content(item) }
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 320
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > bounds.width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            subview.place(at: CGPoint(x: bounds.minX + x, y: bounds.minY + y), proposal: .unspecified)
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// A draft field that adds a tag on submit and clears itself.
struct TagAdder: View {
    let placeholder: String
    let onAdd: (String) -> Void
    @State private var draft = ""

    var body: some View {
        HStack(spacing: 4) {
            TextField(placeholder, text: $draft)
                .textFieldStyle(.plain)
                .font(GlassType.body)
                .frame(minHeight: GlassTokens.touchTarget)
                .onSubmit { commit() }
                .accessibilityLabel("New tag")
            GhostButton("plus", label: "Add tag") { commit() }
        }
    }

    private func commit() {
        let value = JavaScript.trim(draft)
        guard !value.isEmpty else { return }
        onAdd(value)
        draft = ""
    }
}
