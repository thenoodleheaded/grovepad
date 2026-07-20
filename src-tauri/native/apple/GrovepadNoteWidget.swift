import SwiftUI
import WidgetKit

private let suiteName = "group.com.grovepad.widgets"
private let payloadKey = "note_widget_payload_v1"
private let widgetKind = "GrovepadNoteWidget"

private struct NotePayload: Decodable {
    let id: String
    let title: String
    let text: String
    let color: String
    let mode: String
    let attribution: String
}

private struct WidgetPayload: Decodable {
    let schemaVersion: Int
    let note: NotePayload?
}

private struct NoteEntry: TimelineEntry {
    let date: Date
    let note: NotePayload?
}

private struct NoteProvider: TimelineProvider {
    func placeholder(in context: Context) -> NoteEntry {
        NoteEntry(
            date: Date(),
            note: NotePayload(
                id: "preview",
                title: "Today",
                text: "Keep the important thought where you can see it.",
                color: "yellow",
                mode: "sticky",
                attribution: ""
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (NoteEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : currentEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NoteEntry>) -> Void) {
        // Note changes are event-driven by the containing app. `.never` avoids
        // periodic wakeups and preserves WidgetKit's daily refresh budget.
        completion(Timeline(entries: [currentEntry()], policy: .never))
    }

    private func currentEntry() -> NoteEntry {
        guard
            let raw = UserDefaults(suiteName: suiteName)?.string(forKey: payloadKey),
            let bytes = raw.data(using: .utf8),
            let payload = try? JSONDecoder().decode(WidgetPayload.self, from: bytes),
            payload.schemaVersion == 1
        else {
            return NoteEntry(date: Date(), note: nil)
        }
        return NoteEntry(date: Date(), note: payload.note)
    }
}

private struct NoteWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: NoteEntry

    private let inkBrown = Color(red: 0.33, green: 0.26, blue: 0.10)

    private var background: Color {
        switch entry.note?.color {
        case "pink": Color(red: 0.99, green: 0.84, blue: 0.89)
        case "blue": Color(red: 0.81, green: 0.92, blue: 1.00)
        case "green": Color(red: 0.83, green: 0.95, blue: 0.85)
        case "purple": Color(red: 0.91, green: 0.85, blue: 1.00)
        default: Color(red: 1.00, green: 0.94, blue: 0.65)
        }
    }

    private var title: String {
        guard let title = entry.note?.title, !title.isEmpty else { return "Grovepad Note" }
        return title
    }

    private var text: String {
        guard let text = entry.note?.text, !text.isEmpty else {
            return "Choose a Note in Grovepad to keep it here."
        }
        return entry.note?.mode == "quote" ? "“\(text)”" : text
    }

    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemSmall ? 7 : 10) {
            HStack(spacing: 6) {
                Image(systemName: "square.and.pencil")
                    .font(.caption.weight(.semibold))
                Text(title)
                    .font(.caption.weight(.bold))
                    .lineLimit(1)
            }
            .foregroundColor(inkBrown.opacity(0.82))

            Text(text)
                .font(.system(
                    size: family == .systemSmall ? 16 : 19,
                    weight: .regular,
                    design: .rounded
                ))
                .foregroundColor(Color(red: 0.18, green: 0.16, blue: 0.10))
                .lineLimit(family == .systemSmall ? 6 : 5)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

            if let attribution = entry.note?.attribution, !attribution.isEmpty {
                Text("— \(attribution)")
                    .font(.caption2)
                    .foregroundColor(inkBrown.opacity(0.75))
                    .lineLimit(1)
            }
        }
        .padding(family == .systemSmall ? 14 : 17)
        .grovepadWidgetBackground(background)
    }
}

private extension View {
    @ViewBuilder
    func grovepadWidgetBackground(_ color: Color) -> some View {
        if #available(iOS 17.0, macOS 14.0, *) {
            containerBackground(for: .widget) { color }
        } else {
            background(color)
        }
    }
}

@main
struct GrovepadNoteWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: widgetKind, provider: NoteProvider()) { entry in
            NoteWidgetView(entry: entry)
        }
        .configurationDisplayName("Grovepad Note")
        .description("Keep one Note from your canvas on your Home Screen or desktop.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
