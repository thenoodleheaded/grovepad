import XCTest
import GrovepadCore
@testable import GrovepadChrome

/// Palette search, availability, the jump list, creation and the leap.
final class SurfacesCommandPaletteTests: XCTestCase {
    private func fixture() -> (BoardDocument, ChromeState, CommandPaletteModel, RecordingCamera) {
        let (document, _, _) = makeDocument()
        let chrome = ChromeState()
        let tabs = CanvasTabsModel(document: document, mint: .counting(prefix: "tab-"))
        let camera = RecordingCamera()
        var opened: [String] = []
        let services = PaletteServices(camera: camera, openShortcuts: { opened.append("shortcuts") }, openSettingsData: { opened.append("data") }, openTree: { opened.append("tree") }, copyToClipboard: { opened.append("copy:\($0)") })
        let palette = CommandPaletteModel(document: document, chrome: chrome, tabs: tabs, services: services, mint: .counting(prefix: "p-"))
        return (document, chrome, palette, camera)
    }

    func testFuzzyScoreAndMatchFollowTheWeb() {
        XCTAssertEqual(PaletteFuzzy.score("note", "My Notes"), 3)
        XCTAssertEqual(PaletteFuzzy.score("my notes", "notes for my exam"), 2)
        XCTAssertEqual(PaletteFuzzy.score("mns", "my notes"), 1)
        XCTAssertEqual(PaletteFuzzy.score("xyz", "my notes"), 0)
        XCTAssertEqual(PaletteFuzzy.score("", "anything"), 0)
        XCTAssertTrue(PaletteFuzzy.matches("", "anything"))
        XCTAssertTrue(PaletteFuzzy.matches("zi", "Zoom In"))
        XCTAssertFalse(PaletteFuzzy.matches("q", "Zoom In"))
        var data = JSONObject()
        data["text"] = .string("  The landlord called  ")
        data["blob"] = .string("data:image/png;base64,AAAA")
        data["items"] = .array([.object({ var o = JSONObject(); o["label"] = .string("rent"); return o }())])
        XCTAssertEqual(PaletteFuzzy.contentText(data), "The landlord called rent")
        XCTAssertEqual(PaletteFuzzy.excerpt("The landlord called about the rent on Monday", query: "rent", radius: 6), "…t the rent on Mo…")
    }

    func testHistoryActionsAreOmittedWhenInert() {
        let (document, _, palette, _) = fixture()
        XCTAssertEqual(CommandPaletteModel.historyActionIds(canUndo: false, canRedo: false), [])
        XCTAssertFalse(palette.availableActionIds.contains("action-undo"))
        _ = document.createWidget(type: "text", at: Vector2D(x: 9000, y: 9000), title: "History")
        XCTAssertTrue(palette.availableActionIds.contains("action-undo"))
        XCTAssertFalse(palette.availableActionIds.contains("action-redo"))
        document.undo()
        XCTAssertTrue(palette.availableActionIds.contains("action-redo"))
        palette.setQuery("undo")
        XCTAssertFalse(palette.results.contains { $0.id == "action-undo" })
        XCTAssertTrue(palette.results.contains { $0.id == "action-redo" })
    }

    func testSearchFindsCardsAndCanvasesOfTheWorkspaceByScore() throws {
        let (document, chrome, palette, _) = fixture()
        let landlord = document.createWidget(type: "text", at: .zero, title: "Landlord")!
        document.updateWidgetData(landlord) { $0["text"] = .string("call about the rent") }
        let counter = document.createWidget(type: "counter", at: Vector2D(x: 400, y: 0), title: "Rent tally")!
        let door = document.createWidget(type: "canvas_node", at: Vector2D(x: 800, y: 0), title: "Rent folder")!
        let inner = try XCTUnwrap(document.widget(door)?.data.string("canvasId"))
        let other = document.createWorkspace(name: "Other", mint: .counting(prefix: "o-"))
        _ = document.createWidget(type: "text", at: .zero, title: "Rent elsewhere")
        document.switchWorkspace("ws")
        _ = other

        palette.setQuery("rent")
        let widgets = palette.results.filter { $0.kind != .action }
        XCTAssertEqual(Set(widgets.map(\.id)), [landlord, counter, door, inner], "title, content and canvas hits; the other workspace is out")
        XCTAssertEqual(widgets.first { $0.id == landlord }?.subtitle.hasPrefix("Text · “"), true, "a pure content hit shows the excerpt")
        XCTAssertEqual(widgets.first { $0.id == inner }?.subtitle, "Canvas")
        palette.setCategory(.widgets)
        XCTAssertFalse(palette.results.contains { $0.kind == .action })
        palette.setCategory(.actions)
        XCTAssertTrue(palette.results.allSatisfy { $0.kind == .action })

        palette.setCategory(.all)
        palette.setQuery("")
        chrome.recordVisit(inner)
        let jump = palette.results
        XCTAssertLessThanOrEqual(jump.filter { $0.kind == .action }.count, 4, "an empty query shows four actions")
        XCTAssertEqual(jump.first { $0.kind == .canvas }?.id, inner, "recent canvases lead the jump list")
        XCTAssertEqual(jump.filter { $0.kind == .widget }.count, 3)
    }

    func testCreateNoteMathAndFallbackResults() {
        let (document, chrome, palette, camera) = fixture()
        camera.pan = Vector2D(x: -200, y: -100)
        palette.setQuery("new tasks")
        let create = palette.results.first { $0.isCreate && $0.id.hasSuffix("checklist") }!
        palette.execute(create)
        let created = document.board.widgets.values.first!
        XCTAssertEqual(created.type, "checklist")
        XCTAssertEqual(created.position, Vector2D(x: 720, y: 400), "spawned at the view centre, snapped")
        XCTAssertEqual(document.selection, [created.id])
        XCTAssertEqual(chrome.renamingWidgetId, created.id)
        XCTAssertFalse(chrome.paletteOpen)

        palette.setQuery("2 * (3 + 4) % ")
        XCTAssertEqual(palette.results.first?.title, "= 0.14")
        XCTAssertEqual(PaletteMath.evaluate("12 + 3 * 2"), 18)
        XCTAssertEqual(PaletteMath.evaluate("-(4 / 2)"), -2)
        XCTAssertNil(PaletteMath.evaluate("1 / 0"))
        XCTAssertNil(PaletteMath.evaluate("abc"))
        XCTAssertNil(PaletteMath.evaluate("(1 + 2"))

        palette.setQuery("buy oat milk")
        let note = palette.results.first { $0.id.hasPrefix("note:") }!
        XCTAssertEqual(note.title, "Create “buy oat milk”")
        palette.execute(note)
        XCTAssertEqual(document.board.widgets.values.last?.title, "buy oat milk")
        XCTAssertEqual(document.board.widgets.values.last?.type, "text")
        document.undo()
        document.undo()
        XCTAssertTrue(document.board.widgets.isEmpty, "both creations undo")
    }

    func testNavigationResultsJumpCanvasesAndActionsRun() throws {
        let (document, chrome, palette, camera) = fixture()
        let door = document.createWidget(type: "canvas_node", at: .zero, title: "Inner")!
        let inner = try XCTUnwrap(document.widget(door)?.data.string("canvasId"))
        document.navigate(to: inner)
        let card = document.createWidget(type: "text", at: Vector2D(x: 480, y: 480), title: "Deep card")!
        document.navigate(to: "root")

        chrome.paletteOpen = true
        palette.setQuery("deep")
        palette.execute(palette.results.first { $0.id == card }!)
        XCTAssertEqual(document.activeCanvasId, inner)
        XCTAssertEqual(document.selection, [card])
        XCTAssertEqual(camera.log.last?.hasPrefix("fitRect:480,480,"), true)
        XCTAssertFalse(chrome.paletteOpen)
        XCTAssertEqual(chrome.canvasVisits.first, inner)

        document.navigate(to: "root")
        palette.setQuery("inner")
        palette.execute(palette.results.first { $0.kind == .canvas }!)
        XCTAssertEqual(document.activeCanvasId, inner)

        palette.setQuery("zoom in")
        palette.execute(palette.results.first { $0.id == "action-zoom-in" }!)
        XCTAssertEqual(camera.zoom, 1.25)
        palette.setQuery("fit")
        palette.execute(palette.results.first { $0.id == "action-fit-all" }!)
        XCTAssertEqual(camera.log.last?.hasPrefix("fitRect:480,480,"), true, "fits the current canvas")

        chrome.paletteInitialQuery = "landlord"
        palette.open()
        XCTAssertEqual(palette.query, "landlord")
        XCTAssertNil(chrome.paletteInitialQuery)
        XCTAssertTrue(chrome.paletteOpen)
        palette.moveFocus(by: 5)
        XCTAssertLessThan(palette.focusedIndex, max(1, palette.results.count))
    }
}
