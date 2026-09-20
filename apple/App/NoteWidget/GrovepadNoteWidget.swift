import SwiftUI
import WidgetKit

// The WidgetKit Note widget (docs/native-os-widgets.md): one Text card the
// person chose in Grovepad ("Show in widget"), read-only, refreshed only
// when the app asks (`.never` timeline — no periodic wakeups). Ported from
// `src-tauri/native/apple/GrovepadNoteWidget.swift`; the App Group bridge is
// now a JSON file the app writes (`NoteWidgetPayloadReader`).

struct NoteEntry: TimelineEntry {
    let date: Date
    let note: NotePayload?
}

struct NoteProvider: TimelineProvider {
    func placeholder(in context: Context) -> NoteEntry {
        NoteEntry(
            date: Date(),
            note: NotePayload(
                id: "preview",
                title: "Today",
                text: "Keep the important thought where you can see it.",
                color: "yellow",
                mode: "sticky"
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (NoteEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : currentEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NoteEntry>) -> Void) {
        completion(Timeline(entries: [currentEntry()], policy: .never))
    }

    private func currentEntry() -> NoteEntry {
        NoteEntry(date: Date(), note: NoteWidgetPayloadReader.read())
    }
}

struct NoteWidgetView: View {
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
            return "Choose “Show in widget” on a Text card in Grovepad to keep it here."
        }
        return text
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
                .font(.system(size: family == .systemSmall ? 16 : 19, weight: .regular, design: .rounded))
                .foregroundColor(Color(red: 0.18, green: 0.16, blue: 0.10))
                .lineLimit(family == .systemSmall ? 6 : 5)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .padding(family == .systemSmall ? 14 : 17)
        .containerBackground(for: .widget) { background }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title). \(text)")
    }
}

struct GrovepadNoteWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: NoteWidgetContract.widgetKind, provider: NoteProvider()) { entry in
            NoteWidgetView(entry: entry)
        }
        .configurationDisplayName("Grovepad Note")
        .description("Keep one Note from your canvas on your Home Screen or desktop.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

/// One extension, two widgets: the Note (one Text card chosen in the app)
/// and the Grovepad Widget (any card, chosen from Edit Widget).
@main
struct GrovepadNoteWidgetBundle: WidgetBundle {
    var body: some Widget {
        GrovepadCardWidget()
        GrovepadNoteWidget()
    }
}
