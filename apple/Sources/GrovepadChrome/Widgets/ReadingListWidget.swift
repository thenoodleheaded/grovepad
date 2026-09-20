import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Reading List (`components/widgets/modules/ReadingListWidget.tsx`,
// `restingFaces/catalog.ts readingListFace`). Books and articles with a
// queued → reading → done status that cycles on a tap. The skin field is
// `skin` (absent on a fresh card; the catalogue's first skin, bookshelf, is
// the default). The web draws the shelf as book spines; this port draws the
// same items as a ledger (the reading_queue arrangement) for every skin,
// because a spine of vertical text is not a 44 pt target. reading_log and
// citation_trail are schema extensions and add a note. `reset` re-queues
// everything.
// ---------------------------------------------------------------------------

public struct ReadingListWidget: WidgetRenderer {
    public static let type = "reading_list"
    static let skins = ["bookshelf", "reading_queue", "curriculum", "reference_library", "reading_log", "citation_trail"]
    static let extensionSkins: Set<String> = ["reading_log", "citation_trail"]
    static let nextStatus = ["queued": "reading", "reading": "done", "done": "queued"]
    static let statusWords = ["queued": "Queued", "reading": "Reading", "done": "Done"]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "bookshelf"
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = ReadingListWidget.skin(data)
        let items = data.recordList("items")
        let done = items.filter { $0.str("status") == "done" }.count
        let accent = Color(hex: context.accent)
        return VStack(alignment: .leading, spacing: 4) {
            if skin != "reading_queue" {
                NotesSkinNote(ReadingListWidget.extensionSkins.contains(skin)
                    ? "Shown as the reading queue — the \(skin.replacingOccurrences(of: "_", with: " ")) details arrive later."
                    : "Shown as the reading queue — the \(skin.replacingOccurrences(of: "_", with: " ")) arrangement arrives later.")
            }
            ForEach(items, id: \.["id"]) { item in
                let id = item.str("id")
                let status = item.str("status")
                let word = ReadingListWidget.statusWords[status] ?? (status.isEmpty ? "Queued" : status)
                HStack(spacing: 8) {
                    Button {
                        context.update { $0.patchRecord(in: "items", id: id) { $0["status"] = .string(ReadingListWidget.nextStatus[status] ?? "reading") } }
                    } label: {
                        Text(word)
                            .font(GlassType.label)
                            .foregroundStyle(status == "done" ? Color(hex: "#34d399") : status == "reading" ? accent : Color.secondary)
                            .frame(width: 58)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(Color.lift.opacity(0.07)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(item.str("title").isEmpty ? "Untitled" : item.str("title")) — \(word). Tap to mark \(ReadingListWidget.statusWords[ReadingListWidget.nextStatus[status] ?? "reading"] ?? "reading")")
                    .touchTarget()
                    CardTextField("Title…", text: item.str("title")) { next in
                        context.update { $0.patchRecord(in: "items", id: id) { $0["title"] = .string(next) } }
                    }
                    .strikethrough(status == "done")
                    RowDeleteButton(label: "Remove item") {
                        context.update { $0.removeRecord(in: "items", id: id) }
                    }
                }
            }
            HStack {
                FlowButton("Add item", symbol: "plus", accent: accent) {
                    let id = context.mint()
                    context.update { data in
                        var record = JSONObject()
                        record["id"] = .string(id)
                        record["title"] = .string("")
                        record["status"] = .string("queued")
                        data.appendRecord(in: "items", record)
                    }
                }
                Spacer(minLength: 0)
                if !items.isEmpty {
                    Text("\(done)/\(items.count) read").font(GlassType.label).monospacedDigit().foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `readingListFace`: each title with its status word, done ones checked.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let items = data.recordList("items")
        if items.isEmpty { return .icon }
        let visible = items.prefix(RestingFaceMeasure.rowLimit)
        let rows = visible.enumerated().map { index, item -> RestRow in
            let status = item.str("status")
            let id = item.str("id")
            return RestRow(
                key: id.isEmpty ? "book-\(index)" : id,
                label: RestText.compact(item.str("title").isEmpty ? "Untitled" : item.str("title"), 24),
                done: status == "finished" || status == "done",
                value: status.isEmpty ? nil : RestText.compact(status.replacingOccurrences(of: "_", with: " "), 10)
            )
        }
        return NotesAndStudyFamily.dressed(.rows(rows: rows, overflow: max(0, items.count - rows.count)), type: ReadingListWidget.type, data: data)
    }
}
