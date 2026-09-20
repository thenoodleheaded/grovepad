import XCTest
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
@testable import GrovepadApp

/// The coordinator actions behind `OpenBoardIntent`, `AddNoteIntent` and
/// `AddFlashcardIntent` (`IntentActions.swift`): canvas lookup by name,
/// navigation, the Text card, the flashcard on a new or existing deck.
@MainActor
final class IntegrationIntentsTests: XCTestCase {
    private var directory: URL!
    private var coordinator: AppCoordinator!
    private var session: WindowSession!

    override func setUp() {
        super.setUp()
        directory = AppFixtures.temporaryDirectory("intents")
        coordinator = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource())
        coordinator.start()
        session = coordinator.makeSession()
    }

    override func tearDown() {
        coordinator.dispose()
        try? FileManager.default.removeItem(at: directory)
        super.tearDown()
    }

    private var document: BoardDocument { coordinator.document }

    func testCanvasEntriesCarryTheirPathAndFindCanvasPrefersAnExactName() throws {
        let root = document.activeCanvasId
        document.renameCanvas(root, name: "Origin")
        let door = try XCTUnwrap(document.createWidget(type: "canvas_node", at: .zero, title: "Biology"))
        let inner = try XCTUnwrap(document.widget(door)?.data.string("canvasId"))
        let entries = coordinator.canvasEntries
        XCTAssertEqual(entries.map(\.name), ["Origin", "Biology"])
        XCTAssertEqual(entries.last?.path, "Origin › Biology")
        XCTAssertEqual(entries.last?.workspaceName, "Workspace")

        XCTAssertEqual(coordinator.findCanvas(named: "biology")?.id, inner, "case does not matter")
        XCTAssertEqual(coordinator.findCanvas(named: "bio")?.id, inner, "a fuzzy hit still opens")
        XCTAssertNil(coordinator.findCanvas(named: "chemistry"))
        XCTAssertNil(coordinator.findCanvas(named: "   "))
    }

    func testOpenCanvasMovesTheWindowAndTheDocument() throws {
        let door = try XCTUnwrap(document.createWidget(type: "canvas_node", at: .zero, title: "Inner"))
        let inner = try XCTUnwrap(document.widget(door)?.data.string("canvasId"))
        XCTAssertTrue(coordinator.openCanvas(id: inner))
        XCTAssertEqual(document.activeCanvasId, inner)
        XCTAssertEqual(session.environment.tabs.openTabs.map(\.canvasId), [inner], "the window's tab follows")
        XCTAssertFalse(coordinator.openCanvas(id: "nope"))
        XCTAssertEqual(document.activeCanvasId, inner)
    }

    func testAddNoteMakesATextCardOnTheOpenCanvasAndIsUndoable() throws {
        let existing = try XCTUnwrap(document.createWidget(type: "counter", at: Vector2D(x: 100, y: 100), title: "Tally"))
        let id = try coordinator.addNote(text: "  Buy milk\nand eggs  ")
        let widget = try XCTUnwrap(document.widget(id))
        XCTAssertEqual(widget.type, "text")
        XCTAssertEqual(widget.canvasId, document.activeCanvasId)
        XCTAssertEqual(widget.title, "Buy milk", "the first line names the card")
        XCTAssertEqual(widget.data.string("text"), "Buy milk\nand eggs")
        XCTAssertEqual(widget.data.string("mode"), "plain", "the registry defaults stay")
        let tally = try XCTUnwrap(document.widget(existing))
        XCTAssertEqual(widget.position.x, tally.position.x)
        XCTAssertGreaterThanOrEqual(widget.position.y, tally.position.y + tally.size.height, "lands under the lowest card")

        let titled = try coordinator.addNote(text: "body", title: "Heading")
        XCTAssertEqual(document.widget(titled)?.title, "Heading")

        XCTAssertThrowsError(try coordinator.addNote(text: "   ")) { XCTAssertEqual($0 as? IntentActionError, .emptyText) }

        document.undo()
        XCTAssertNil(document.widget(titled), "an intent is one undo step: create and words together")
        XCTAssertNotNil(document.widget(id))
        document.redo()
        XCTAssertEqual(document.widget(titled)?.data.string("text"), "body")
    }

    func testAddFlashcardFillsAFreshDecksBlankCardThenAppends() throws {
        let first = try coordinator.addFlashcard(front: "Mitochondria", back: "Powerhouse", deck: nil)
        let deck = try XCTUnwrap(document.widget(first.deckId))
        XCTAssertEqual(deck.type, "flashcards")
        XCTAssertEqual(deck.title, "Study Deck")
        var cards = deck.data.array("cards")?.compactMap(\.objectValue) ?? []
        XCTAssertEqual(cards.count, 1, "the registry's one blank card is filled, not left beside the new one")
        XCTAssertEqual(cards[0].string("front"), "Mitochondria")
        XCTAssertEqual(cards[0].string("back"), "Powerhouse")
        XCTAssertEqual(cards[0].string("id"), first.cardId)
        XCTAssertNotNil(deck.data.object("vocabulary"), "the other pockets survive (law 5)")

        let second = try coordinator.addFlashcard(front: "Ribosome", back: "Protein factory", deck: nil)
        XCTAssertEqual(second.deckId, first.deckId, "the deck on the open canvas takes the next card")
        cards = document.widget(first.deckId)?.data.array("cards")?.compactMap(\.objectValue) ?? []
        XCTAssertEqual(cards.map { $0.string("front") }, ["Mitochondria", "Ribosome"])
        XCTAssertEqual(document.widget(first.deckId)?.data.number("current"), 0, "browsing position is untouched")

        // A named deck: found by title, made when missing.
        let named = try coordinator.addFlashcard(front: "Bonjour", back: "Hello", deck: "French")
        XCTAssertNotEqual(named.deckId, first.deckId)
        XCTAssertEqual(document.widget(named.deckId)?.title, "French")
        let again = try coordinator.addFlashcard(front: "Merci", back: "Thanks", deck: "french")
        XCTAssertEqual(again.deckId, named.deckId)

        XCTAssertThrowsError(try coordinator.addFlashcard(front: " ", back: "", deck: nil))
    }

    func testCanvasEntityWrapsAnEntry() throws {
        let entry = try XCTUnwrap(coordinator.canvasEntry(id: document.activeCanvasId))
        let entity = CanvasEntity(entry)
        XCTAssertEqual(entity.id, entry.id)
        XCTAssertEqual(entity.name, "Canvas")
        XCTAssertEqual(entity.path, "Canvas")
    }
}
