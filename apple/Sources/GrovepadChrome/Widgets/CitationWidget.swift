import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Citations (`components/widgets/modules/CitationWidget.tsx`,
// `restingFaces/catalog.ts citationFace`). A source manager `{ id, title,
// author, year }` with an APA / MLA / Chicago toggle; each source copies
// itself formatted in the chosen style. The skin field is `skin` (absent on
// a fresh card; bibliography is the default). Every catalogue skin dresses
// this one body; literature_matrix and evidence_map are schema extensions
// and add a note.
// ---------------------------------------------------------------------------

public struct CitationWidget: WidgetRenderer {
    public static let type = "citation"
    static let styles = ["APA", "MLA", "Chicago"]
    static let skins = ["bibliography", "source_cards", "annotated", "footnotes", "literature_matrix", "evidence_map"]
    static let extensionSkins: Set<String> = ["literature_matrix", "evidence_map"]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "bibliography"
    }

    /// `formatSource`: enough to paste and refine.
    static func format(style: String, source: JSONObject) -> String {
        let author = source.trimmedStr("author").isEmpty ? "Author" : source.trimmedStr("author")
        let year = source.trimmedStr("year").isEmpty ? "n.d." : source.trimmedStr("year")
        let title = source.trimmedStr("title").isEmpty ? "Title" : source.trimmedStr("title")
        if style == "MLA" { return "\(author). \"\(title).\" \(year)." }
        if style == "Chicago" { return "\(author). \(title). \(year)." }
        return "\(author) (\(year)). \(title)."
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = CitationWidget.skin(data)
        let style = data.str("style", "APA")
        let sources = data.recordList("sources")
        let accent = Color(hex: context.accent)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                ForEach(CitationWidget.styles, id: \.self) { candidate in
                    Button { context.update { $0["style"] = .string(candidate) } } label: {
                        Text(candidate)
                            .font(GlassType.label)
                            .foregroundStyle(style == candidate ? accent : Color.secondary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(style == candidate ? accent.opacity(0.18) : Color.clear))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(candidate) style")
                    .accessibilityAddTraits(style == candidate ? .isSelected : [])
                    .touchTarget()
                }
                Spacer(minLength: 0)
            }
            if CitationWidget.extensionSkins.contains(skin) {
                NotesSkinNote("Shown as the bibliography — the \(skin.replacingOccurrences(of: "_", with: " ")) columns arrive later.")
            }
            ForEach(sources, id: \.["id"]) { source in
                let id = source.str("id")
                Island(padding: 8) {
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 6) {
                            CardTextField("Title…", text: source.str("title")) { next in
                                context.update { $0.patchRecord(in: "sources", id: id) { $0["title"] = .string(next) } }
                            }
                            .font(GlassType.value)
                            CopyButton(label: "Copy citation") { NotesAndStudyFamily.copyToPasteboard(CitationWidget.format(style: style, source: source)) }
                            RowDeleteButton(label: "Remove source") {
                                context.update { $0.removeRecord(in: "sources", id: id) }
                            }
                        }
                        HStack(spacing: 6) {
                            CardTextField("Author…", text: source.str("author")) { next in
                                context.update { $0.patchRecord(in: "sources", id: id) { $0["author"] = .string(next) } }
                            }
                            .foregroundStyle(.secondary)
                            CardTextField("Year", text: source.str("year")) { next in
                                context.update { $0.patchRecord(in: "sources", id: id) { $0["year"] = .string(next) } }
                            }
                            .frame(width: 56)
                            .multilineTextAlignment(.trailing)
                            .foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            HStack {
                FlowButton("Add source", symbol: "plus", accent: accent) {
                    let id = context.mint()
                    context.update { data in
                        var record = JSONObject()
                        record["id"] = .string(id)
                        record["title"] = .string("")
                        record["author"] = .string("")
                        record["year"] = .string("")
                        data.appendRecord(in: "sources", record)
                    }
                }
                Spacer(minLength: 0)
                Text("\(sources.count) source\(sources.count == 1 ? "" : "s")").font(GlassType.label).monospacedDigit().foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `citationFace`: author (or title) and year per source; the style
    /// leads the first entry as the sheet's own heading.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let sources = data.recordList("sources")
        if sources.isEmpty { return .icon }
        let visible = sources.prefix(RestingFaceMeasure.rowLimit)
        let rows = visible.enumerated().map { index, source -> RestRow in
            let id = source.str("id")
            let author = source.str("author")
            let title = source.str("title")
            return RestRow(
                key: id.isEmpty ? "source-\(index)" : id,
                label: RestText.compact(author.isEmpty ? (title.isEmpty ? "Untitled source" : title) : author, 24),
                value: source.str("year").isEmpty ? nil : source.str("year"),
                lead: index == 0 ? data.str("style", "APA") : nil
            )
        }
        return NotesAndStudyFamily.dressed(.rows(rows: rows, overflow: max(0, sources.count - rows.count)), type: CitationWidget.type, data: data)
    }
}
