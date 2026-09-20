import XCTest
import GrovepadCore
@testable import GrovepadChrome

/// The widget library: bands, ranked search, public-only, pack gating with a
/// reason, and creation through the document (undoable).
final class SurfacesAddWidgetTests: XCTestCase {
    private func fixture(favorites: [String] = [], recents: [String] = []) -> (BoardDocument, AddWidgetModel, InMemoryWidgetPickerPrefs) {
        let (document, _, _) = makeDocument()
        let prefs = InMemoryWidgetPickerPrefs(favorites: favorites, recents: recents)
        return (document, AddWidgetModel(document: document, prefs: prefs, mint: .counting(prefix: "w-")), prefs)
    }

    func testBandsFollowPinnedRecentThenCategoryOrder() {
        let (_, model, _) = fixture(favorites: ["flashcards"], recents: ["checklist", "decision"])
        let groups = model.groups
        XCTAssertEqual(groups[0].label, "Pinned")
        XCTAssertEqual(groups[0].entries.map(\.type), ["flashcards"])
        XCTAssertEqual(groups[1].label, "Recent")
        XCTAssertEqual(groups[1].entries.map(\.type), ["checklist", "decision"])
        let categoryLabels = groups.dropFirst(2).compactMap(\.label)
        let expected = WidgetCategory.order.map(\.label).filter { categoryLabels.contains($0) }
        XCTAssertEqual(categoryLabels, expected, "families in registry order")
        XCTAssertFalse(groups.dropFirst(2).flatMap(\.entries).contains { ["flashcards", "checklist", "decision"].contains($0.type) }, "no type lists twice")
        XCTAssertTrue(model.flat.allSatisfy { WidgetRegistry.isPublic($0.type) })
    }

    func testOnlyTheStudyWidgetsAreOffered() {
        let (_, model, _) = fixture()
        XCTAssertEqual(Set(model.flat.map(\.type)), WidgetDefinition.offeredTypes.filter { WidgetRegistry.definition(for: $0) != nil })
        XCTAssertEqual(model.choose("counter", at: .zero), .unknown, "a hidden type cannot be created from the library")
        model.setQuery("count")
        XCTAssertNil(model.flat.first { $0.type == "counter" }, "nor found by search")
    }

    func testSearchRanksPrefixOverSubstringOverDescription() {
        let (_, model, _) = fixture()
        model.setQuery("flash")
        let results = model.groups.flatMap(\.entries)
        XCTAssertEqual(results.first?.type, "flashcards", "label prefix outranks the rest")
        XCTAssertTrue(results.allSatisfy { $0.label.lowercased().contains("flash") || $0.description.lowercased().contains("flash") || $0.category.label.lowercased().contains("flash") })
        XCTAssertEqual(model.groups.count, 1)
        XCTAssertNil(model.groups[0].label, "one ranked list while searching")
        model.setQuery("zzzz-nothing")
        XCTAssertTrue(model.groups.isEmpty)
        XCTAssertEqual(model.count, 0)
        model.setQuery("")
        XCTAssertEqual(model.activeIndex, 0)
        model.moveActive(by: 3)
        XCTAssertEqual(model.activeIndex, 3)
        model.moveActive(by: -10)
        XCTAssertEqual(model.activeIndex, 0)
        model.moveActive(by: 10_000)
        XCTAssertEqual(model.activeIndex, model.count - 1)
    }

    func testPackGatedTypesStayHiddenUntilThePackIsOn() {
        // Outline is a pack widget and is not in the study list, so the model's
        // pack rule is checked through its entry; the lists never show it.
        let (document, model, _) = fixture()
        let outline = WidgetRegistry.definition(for: "outline")!
        XCTAssertNil(model.flat.first { $0.type == "outline" })
        XCTAssertEqual(model.entry(outline).lockedReason, "Turn on the Creative Writing pack in Settings → Data")
        XCTAssertEqual(model.choose("outline", at: .zero), .unknown)
        XCTAssertTrue(document.board.widgets.isEmpty, "a hidden type creates nothing")

        document.loadBoard({ var board = makeBoard(); board.activePacks = ["creative_writing"]; return board }())
        XCTAssertNil(model.entry(outline).lockedReason, "unlocked once the pack is on")
        document.togglePack("creative_writing")
        XCTAssertEqual(document.board.activePacks, [])
        document.togglePack("creative_writing")
        XCTAssertEqual(document.board.activePacks, ["creative_writing"])
        XCTAssertTrue(DomainPacks.available.contains { $0.pack.id == "creative_writing" && $0.widgets.contains("Outline") })
        XCTAssertFalse(DomainPacks.available.contains { $0.pack.id == "game_dev" }, "a pack with no public widget is not offered")
        XCTAssertEqual(model.choose("not-a-type", at: .zero), .unknown)
    }

    func testChoosingCreatesThroughTheDocumentAtASnappedPoint() {
        let (document, model, prefs) = fixture()
        let chrome = ChromeState()
        chrome.openAddWidget(at: Vector2D(x: 123, y: 456))
        let outcome = model.choose("checklist", at: Vector2D(x: 123, y: 456), chrome: chrome)
        guard case .created(let id) = outcome else { return XCTFail("expected a created id, got \(outcome)") }
        let widget = document.widget(id)!
        XCTAssertEqual(widget.type, "checklist")
        XCTAssertEqual(widget.title, "Tasks")
        XCTAssertEqual(widget.position, Vector2D(x: 120, y: 440))
        XCTAssertEqual(widget.size, WidgetRegistry.defaultSize(for: "checklist"))
        XCTAssertEqual(document.selection, [id])
        XCTAssertEqual(chrome.renamingWidgetId, id)
        XCTAssertFalse(chrome.addWidgetOpen, "the surface closes after placing")
        XCTAssertEqual(prefs.recentTypes, ["checklist"])
        XCTAssertEqual(model.groups.first?.label, "Recent")
        document.undo()
        XCTAssertNil(document.widget(id))
        model.toggleFavorite("checklist")
        XCTAssertEqual(prefs.favoriteTypes, ["checklist"])
        XCTAssertEqual(model.groups.first?.label, "Pinned")
    }
}
