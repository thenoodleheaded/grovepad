import AppIntents
import SwiftUI
import WidgetKit
import GrovepadHomeWidget

// The "Grovepad Widget" home-screen / desktop widget (docs/native-os-widgets.md).
// Edit Widget asks for a Canvas, then for a Widget on that canvas; the widget
// then shows everything that card holds, drawn from the snapshot the app keeps
// in the App Group (`HomeWidgetSync`). Read-only; a tap opens Grovepad on the
// card. The timeline never polls: the app asks WidgetKit to reload when a card
// changes, and a running countdown asks for one refresh when it reaches zero.

// MARK: - Configuration

struct CanvasChoice: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Canvas"
    static var defaultQuery = CanvasChoiceQuery()

    let id: String
    let name: String
    let path: String
    let count: Int

    init(_ canvas: HomeWidgetCatalog.Canvas) {
        id = canvas.id
        name = canvas.name
        path = canvas.path
        count = canvas.widgets.count
    }

    var displayRepresentation: DisplayRepresentation {
        let widgets = count == 1 ? "1 widget" : "\(count) widgets"
        return DisplayRepresentation(title: "\(name)", subtitle: "\(path) · \(widgets)", image: .init(systemName: "rectangle.3.group"))
    }
}

struct CanvasChoiceQuery: EntityStringQuery {
    func entities(for identifiers: [CanvasChoice.ID]) async throws -> [CanvasChoice] {
        let canvases = WidgetMirror.catalog()?.canvases ?? []
        return identifiers.compactMap { id in canvases.first { $0.id == id }.map(CanvasChoice.init) }
    }

    func suggestedEntities() async throws -> [CanvasChoice] {
        (WidgetMirror.catalog()?.canvases ?? []).map(CanvasChoice.init)
    }

    func entities(matching string: String) async throws -> [CanvasChoice] {
        (WidgetMirror.catalog()?.canvases ?? [])
            .filter { $0.name.localizedCaseInsensitiveContains(string) || $0.path.localizedCaseInsensitiveContains(string) }
            .map(CanvasChoice.init)
    }
}

struct CardChoice: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Widget"
    static var defaultQuery = CardChoiceQuery()

    let id: String
    let title: String
    let kind: String
    let symbol: String
    let canvasName: String

    init(_ entry: HomeWidgetCatalog.Entry, canvas: HomeWidgetCatalog.Canvas) {
        id = entry.id
        title = entry.title
        kind = entry.kind
        symbol = entry.symbol
        canvasName = canvas.name
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)", subtitle: "\(kind) · \(canvasName)", image: .init(systemName: symbol))
    }
}

struct CardChoiceQuery: EntityStringQuery {
    /// The canvas chosen above: the list offers only its widgets.
    @IntentParameterDependency<GrovepadCardIntent>(\.$canvas)
    var chosen

    func entities(for identifiers: [CardChoice.ID]) async throws -> [CardChoice] {
        guard let catalog = WidgetMirror.catalog() else { return [] }
        return identifiers.compactMap { id in catalog.entry(widgetId: id).map { CardChoice($0.entry, canvas: $0.canvas) } }
    }

    func suggestedEntities() async throws -> [CardChoice] {
        choices()
    }

    func entities(matching string: String) async throws -> [CardChoice] {
        choices().filter { $0.title.localizedCaseInsensitiveContains(string) || $0.kind.localizedCaseInsensitiveContains(string) }
    }

    private func choices() -> [CardChoice] {
        guard let catalog = WidgetMirror.catalog() else { return [] }
        let canvases = chosen.flatMap { catalog.canvas(id: $0.canvas.id) }.map { [$0] } ?? catalog.canvases
        return canvases.flatMap { canvas in canvas.widgets.map { CardChoice($0, canvas: canvas) } }
    }
}

struct GrovepadCardIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Choose a widget"
    static var description = IntentDescription("Pick a canvas, then the widget on it to keep on your Home Screen or desktop.")

    @Parameter(title: "Canvas")
    var canvas: CanvasChoice?

    @Parameter(title: "Widget")
    var card: CardChoice?

    static var parameterSummary: some ParameterSummary {
        Summary {
            \.$canvas
            \.$card
        }
    }
}

// MARK: - Timeline

enum WidgetMirror {
    static func folder() -> HomeWidgetFolder? { HomeWidgetFolder.appGroup() }
    static func catalog() -> HomeWidgetCatalog? { folder()?.readCatalog() }
}

struct CardEntry: TimelineEntry {
    let date: Date
    let content: HomeWidgetContent

    var accent: String {
        if case .card(let card) = content { return card.accent }
        return "#34d399"
    }

    var url: URL? {
        if case .card(let card) = content { return HomeWidgetContract.openURL(widgetId: card.id) }
        return nil
    }
}

struct CardProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> CardEntry {
        CardEntry(date: Date(), content: .card(CardProvider.sample))
    }

    func snapshot(for configuration: GrovepadCardIntent, in context: Context) async -> CardEntry {
        if context.isPreview, configuration.card == nil { return placeholder(in: context) }
        return entry(for: configuration)
    }

    func timeline(for configuration: GrovepadCardIntent, in context: Context) async -> Timeline<CardEntry> {
        let entry = entry(for: configuration)
        // A running countdown reads "0:00" by itself at the end; one refresh
        // then shows its finished state. Nothing else ever wakes the widget.
        if case .card(let card) = entry.content, let end = card.live?.countsDownToMs {
            let endDate = Date(timeIntervalSince1970: end / 1000)
            if endDate > entry.date { return Timeline(entries: [entry], policy: .after(endDate.addingTimeInterval(1))) }
        }
        return Timeline(entries: [entry], policy: .never)
    }

    private func entry(for configuration: GrovepadCardIntent) -> CardEntry {
        let now = Date()
        guard let folder = WidgetMirror.folder(), let catalog = folder.readCatalog() else {
            return CardEntry(date: now, content: .unavailable)
        }
        guard let chosen = configuration.card else { return CardEntry(date: now, content: .unconfigured) }
        guard catalog.entry(widgetId: chosen.id) != nil, let card = folder.readCard(widgetId: chosen.id) else {
            return CardEntry(date: now, content: .missing(title: chosen.title))
        }
        return CardEntry(date: now, content: .card(card))
    }

    /// The gallery's picture of what the widget does.
    static let sample = HomeWidgetCard(
        id: "sample",
        canvasId: "sample",
        canvasName: "This week",
        title: "Launch prep",
        kind: "Tasks",
        skin: nil,
        symbol: "checklist",
        accent: "#34d399",
        face: .rows(
            eyebrow: HomeEyebrow(label: "Tasks", note: "2/5"),
            rows: [
                HomeRow(label: "Draft the announcement", done: true),
                HomeRow(label: "Record the demo", done: true),
                HomeRow(label: "Final review with Sam", done: false),
                HomeRow(label: "Schedule the post", done: false),
                HomeRow(label: "Celebrate", done: false),
            ],
            overflow: 0,
            meter: 0.4
        )
    )
}

// MARK: - The widget

struct GrovepadCardWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CardEntry

    private var layout: HomeWidgetLayout {
        switch family {
        case .systemSmall: return .small
        case .systemMedium: return .medium
        case .systemLarge: return .large
        case .systemExtraLarge: return .extraLarge
        #if os(iOS)
        case .accessoryRectangular: return .rectangular
        case .accessoryInline: return .inline
        case .accessoryCircular: return .circular
        #endif
        default: return .medium
        }
    }

    var body: some View {
        HomeWidgetView(content: entry.content, layout: layout, now: entry.date)
            .containerBackground(for: .widget) {
                if layout == .circular {
                    AccessoryWidgetBackground()
                } else if layout == .rectangular || layout == .inline {
                    Color.clear
                } else {
                    HomeWidgetBackground(accent: entry.accent)
                }
            }
            .widgetURL(entry.url)
    }
}

struct GrovepadCardWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: HomeWidgetContract.widgetKind, intent: GrovepadCardIntent.self, provider: CardProvider()) { entry in
            GrovepadCardWidgetView(entry: entry)
        }
        .configurationDisplayName("Grovepad Widget")
        .description("Keep any widget from one of your canvases on your Home Screen or desktop.")
        .supportedFamilies(GrovepadCardWidget.families)
    }

    static var families: [WidgetFamily] {
        #if os(iOS)
        [.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge, .accessoryRectangular, .accessoryInline, .accessoryCircular]
        #else
        [.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge]
        #endif
    }
}
