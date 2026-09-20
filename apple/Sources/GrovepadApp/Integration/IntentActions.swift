import Foundation
import GrovepadCore
import GrovepadChrome

// ---------------------------------------------------------------------------
// The coordinator actions the App Intents, Spotlight and Handoff call: open
// a canvas (by id or by name), add a Text card holding some words, add a
// flashcard to a Study Deck. Pure document work through the same
// `BoardDocument` mutations the chrome uses, so an intent is undoable and
// autosaved like a tap. Tested here; the intent structs are thin.
// ---------------------------------------------------------------------------

/// One canvas as Siri, Shortcuts and Spotlight name it.
public struct CanvasEntry: Equatable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var workspaceName: String
    /// Origin › … › this canvas (one segment for a root).
    public var path: String
}

public enum IntentActionError: Error, Equatable, CustomStringConvertible {
    case noSuchCanvas(String)
    case emptyText
    case couldNotCreate(String)

    public var description: String {
        switch self {
        case .noSuchCanvas(let name): "No canvas called “\(name)”"
        case .emptyText: "There is nothing to add"
        case .couldNotCreate(let what): "Could not create \(what)"
        }
    }
}

@MainActor
public extension AppCoordinator {
    // MARK: - Canvases

    var canvasEntries: [CanvasEntry] {
        let board = document.board
        return board.canvases.values.map { canvas in
            let path = document.canvasPath(to: canvas.id).map { displayName($0.name, "Canvas") }
            return CanvasEntry(
                id: canvas.id,
                name: displayName(canvas.name, "Canvas"),
                workspaceName: displayName(board.workspaces[canvas.workspaceId]?.name ?? "", "Workspace"),
                path: path.joined(separator: " › ")
            )
        }
    }

    func canvasEntry(id: String) -> CanvasEntry? {
        canvasEntries.first { $0.id == id }
    }

    /// `findCanvas`: an exact name first (case-insensitive), then the best
    /// fuzzy match by the palette's own scoring, the active canvas winning ties.
    func findCanvas(named name: String) -> CanvasEntry? {
        let query = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return nil }
        let entries = canvasEntries
        if let exact = entries.first(where: { $0.name.caseInsensitiveCompare(query) == .orderedSame }) { return exact }
        let scored = entries.map { ($0, PaletteFuzzy.score(query, $0.name)) }.filter { $0.1 > 0 }
        return scored.max { lhs, rhs in
            if lhs.1 != rhs.1 { return lhs.1 < rhs.1 }
            return (lhs.0.id == document.activeCanvasId ? 1 : 0) < (rhs.0.id == document.activeCanvasId ? 1 : 0)
        }?.0
    }

    /// Land every window on the canvas (tabs and document agree), as an
    /// import does. Returns false for an id the board does not hold.
    @discardableResult
    func openCanvas(id canvasId: String) -> Bool {
        guard document.board.canvases.contains(canvasId) else { return false }
        if let session = activeSession ?? sessions.first {
            session.environment.tabs.navigate(to: canvasId)
        }
        document.navigate(to: canvasId)
        return true
    }

    /// Open a canvas and, when the target is a card, select it too.
    @discardableResult
    func reveal(_ identifier: SpotlightIdentifier) -> Bool {
        switch identifier {
        case .canvas(let id):
            return openCanvas(id: id)
        case .widget(let id):
            guard let widget = document.widget(id), openCanvas(id: widget.canvasId) else { return false }
            document.select(id)
            return true
        }
    }

    // MARK: - Cards

    /// Where a new card lands: under the lowest card on the canvas, aligned
    /// with the leftmost one; the origin on an empty canvas.
    func nextCardPosition(on canvasId: String) -> Vector2D {
        let widgets = document.board.widgets(on: canvasId)
        guard !widgets.isEmpty else { return .zero }
        let left = widgets.map(\.position.x).min() ?? 0
        let bottom = widgets.map { $0.position.y + $0.size.height }.max() ?? 0
        return Vector2D(x: left, y: bottom + 40)
    }

    /// `AddNoteIntent`: a Text card on the active canvas holding `text`; the
    /// title is the first line unless one is given.
    @discardableResult
    func addNote(text: String, title: String? = nil) throws -> String {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { throw IntentActionError.emptyText }
        let heading = (title?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 }
            ?? String((body.split(whereSeparator: { $0.isNewline }).first ?? "Note").prefix(80))
        // One undo step for the whole intent (create + words), like a gesture.
        document.beginGesture(named: "Add Note")
        defer { document.endGesture() }
        guard let id = document.createWidget(type: "text", at: nextCardPosition(on: document.activeCanvasId), title: heading) else {
            throw IntentActionError.couldNotCreate("a Text card")
        }
        document.updateWidgetData(id, coalesce: false) { data in
            data["text"] = .string(body)
        }
        return id
    }

    /// The Study Deck a flashcard joins: the named deck on the board, else
    /// the first deck on the active canvas, else nil (a new one is made).
    func findDeck(named name: String?) -> Widget? {
        let decks = document.board.widgets.values.filter { $0.type == "flashcards" }
        if let name = name?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty {
            if let exact = decks.first(where: { $0.title.caseInsensitiveCompare(name) == .orderedSame }) { return exact }
            return decks.filter { PaletteFuzzy.score(name, $0.title) > 0 }
                .max { PaletteFuzzy.score(name, $0.title) < PaletteFuzzy.score(name, $1.title) }
        }
        return decks.first { $0.canvasId == document.activeCanvasId }
    }

    /// `AddFlashcardIntent`: a card on a deck. A fresh deck's one blank
    /// card is filled rather than left empty beside the new one.
    @discardableResult
    func addFlashcard(front: String, back: String, deck deckName: String? = nil) throws -> (deckId: String, cardId: String) {
        let front = front.trimmingCharacters(in: .whitespacesAndNewlines)
        let back = back.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !front.isEmpty || !back.isEmpty else { throw IntentActionError.emptyText }
        document.beginGesture(named: "Add Flashcard")
        defer { document.endGesture() }
        let deckId: String
        if let deck = findDeck(named: deckName) {
            deckId = deck.id
        } else {
            let title = (deckName?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 } ?? "Study Deck"
            guard let id = document.createWidget(type: "flashcards", at: nextCardPosition(on: document.activeCanvasId), title: title) else {
                throw IntentActionError.couldNotCreate("a Study Deck")
            }
            deckId = id
        }
        var cardId = ""
        let mint = self.mint
        document.updateWidgetData(deckId, coalesce: false) { data in
            var cards = data.array("cards") ?? []
            let blank = cards.count == 1 && (cards[0].objectValue.map { ($0.string("front") ?? "").isEmpty && ($0.string("back") ?? "").isEmpty } ?? false)
            if blank, var record = cards[0].objectValue {
                record["front"] = .string(front)
                record["back"] = .string(back)
                cardId = record.string("id") ?? ""
                cards[0] = .object(record)
                data["cards"] = .array(cards)
                data["current"] = .number(0)
            } else {
                var record = JSONObject()
                cardId = mint()
                record["id"] = .string(cardId)
                record["front"] = .string(front)
                record["back"] = .string(back)
                cards.append(.object(record))
                data["cards"] = .array(cards)
            }
        }
        return (deckId, cardId)
    }

    private func displayName(_ name: String, _ fallback: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }
}
