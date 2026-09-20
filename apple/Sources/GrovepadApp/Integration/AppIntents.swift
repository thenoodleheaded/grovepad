import Foundation
import AppIntents
import GrovepadCore
import GrovepadChrome

// ---------------------------------------------------------------------------
// App Intents (roadmap phase 7): Siri, Shortcuts and Spotlight can open a
// canvas by name, add a Text card holding some words, and add a flashcard
// to a Study Deck. Each intent is a thin shell over the coordinator's
// `IntentActions` (tested); the canvas is an `AppEntity` so "Open <canvas>
// in Grovepad" resolves against the board. The App Shortcuts provider (the
// phrases) lives in the app target, where the metadata extractor needs it;
// `GrovepadAppIntentsPackage` is what the app target registers.
// ---------------------------------------------------------------------------

public struct GrovepadAppIntentsPackage: AppIntentsPackage {}

/// The coordinator behind the running app; an intent can arrive before a
/// window did, so the shell starts here too (idempotent).
@MainActor
func intentCoordinator() throws -> AppCoordinator {
    let shell = AppShell.obtain()
    shell.start()
    return shell.coordinator
}

extension IntentActionError: CustomLocalizedStringResourceConvertible {
    public var localizedStringResource: LocalizedStringResource { "\(description)" }
}

// MARK: - Canvas entity

public struct CanvasEntity: AppEntity, Identifiable, Sendable {
    public static let typeDisplayRepresentation: TypeDisplayRepresentation = "Canvas"
    public static let defaultQuery = CanvasEntityQuery()

    public var id: String
    @Property(title: "Name") public var name: String
    @Property(title: "Workspace") public var workspaceName: String
    @Property(title: "Path") public var path: String

    public init(_ entry: CanvasEntry) {
        id = entry.id
        name = entry.name
        workspaceName = entry.workspaceName
        path = entry.path
    }

    public var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", subtitle: "\(path)")
    }
}

public struct CanvasEntityQuery: EntityQuery, EntityStringQuery, Sendable {
    public init() {}

    @MainActor
    public func entities(for identifiers: [String]) async throws -> [CanvasEntity] {
        let coordinator = try intentCoordinator()
        return identifiers.compactMap { coordinator.canvasEntry(id: $0) }.map(CanvasEntity.init)
    }

    @MainActor
    public func entities(matching string: String) async throws -> [CanvasEntity] {
        let coordinator = try intentCoordinator()
        let query = string.trimmingCharacters(in: .whitespacesAndNewlines)
        return coordinator.canvasEntries
            .filter { query.isEmpty || PaletteFuzzy.matches(query, $0.name) || PaletteFuzzy.matches(query, $0.path) }
            .map(CanvasEntity.init)
    }

    @MainActor
    public func suggestedEntities() async throws -> [CanvasEntity] {
        try intentCoordinator().canvasEntries.prefix(12).map(CanvasEntity.init)
    }
}

// MARK: - Intents

public struct OpenBoardIntent: AppIntent {
    public static let title: LocalizedStringResource = "Open Canvas"
    public static let description = IntentDescription("Opens a canvas of your Grovepad board.")
    public static let openAppWhenRun = true

    @Parameter(title: "Canvas")
    public var canvas: CanvasEntity

    public init() {}

    public init(canvas: CanvasEntity) {
        self.canvas = canvas
    }

    public static var parameterSummary: some ParameterSummary {
        Summary("Open \(\.$canvas)")
    }

    @MainActor
    public func perform() async throws -> some IntentResult & ProvidesDialog {
        let coordinator = try intentCoordinator()
        guard coordinator.openCanvas(id: canvas.id) else { throw IntentActionError.noSuchCanvas(canvas.name) }
        return .result(dialog: "Opened \(canvas.name)")
    }
}

public struct AddNoteIntent: AppIntent {
    public static let title: LocalizedStringResource = "Add Note"
    public static let description = IntentDescription("Adds a Text card with your words to the canvas you have open.")
    public static let openAppWhenRun = false

    @Parameter(title: "Text", inputOptions: String.IntentInputOptions(multiline: true))
    public var text: String

    @Parameter(title: "Title")
    public var noteTitle: String?

    public init() {}

    public static var parameterSummary: some ParameterSummary {
        Summary("Add a note saying \(\.$text)") {
            \.$noteTitle
        }
    }

    @MainActor
    public func perform() async throws -> some IntentResult & ProvidesDialog {
        let coordinator = try intentCoordinator()
        _ = try coordinator.addNote(text: text, title: noteTitle)
        coordinator.flushAll()
        let where_ = coordinator.canvasEntry(id: coordinator.document.activeCanvasId)?.name ?? "the canvas"
        return .result(dialog: "Added a note to \(where_)")
    }
}

public struct AddFlashcardIntent: AppIntent {
    public static let title: LocalizedStringResource = "Add Flashcard"
    public static let description = IntentDescription("Adds a flashcard to a Study Deck — a named one, the deck on the open canvas, or a new deck.")
    public static let openAppWhenRun = false

    @Parameter(title: "Front")
    public var front: String

    @Parameter(title: "Back")
    public var back: String

    @Parameter(title: "Deck")
    public var deck: String?

    public init() {}

    public static var parameterSummary: some ParameterSummary {
        Summary("Add a flashcard \(\.$front) / \(\.$back)") {
            \.$deck
        }
    }

    @MainActor
    public func perform() async throws -> some IntentResult & ProvidesDialog {
        let coordinator = try intentCoordinator()
        let result = try coordinator.addFlashcard(front: front, back: back, deck: deck)
        coordinator.flushAll()
        let deckTitle = coordinator.document.widget(result.deckId)?.title ?? "the deck"
        return .result(dialog: "Added a flashcard to \(deckTitle)")
    }
}
