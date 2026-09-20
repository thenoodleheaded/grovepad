import XCTest
import GrovepadCore
@testable import GrovepadChrome

/// Every in-scope type wears a real identity mark in its title row — never
/// the placeholder — every skin wears its web icon's stand-in, and every mark names an
/// SF Symbol the system actually has.
final class WidgetSymbolsTests: XCTestCase {
    private var inScope: [String] { phaseThreeTypes + notesAndStudyTypes + TrackingAndDataFamily.types }

    func testEveryInScopeTypeHasANonPlaceholderSymbol() {
        XCTAssertEqual(inScope.count, 33)
        for type in inScope {
            let symbol = WidgetSymbols.symbol(for: type)
            XCTAssertNotEqual(symbol, WidgetSymbols.placeholder, "\(type) wears its own mark")
            XCTAssertFalse(symbol.isEmpty, type)
        }
        XCTAssertEqual(WidgetSymbols.symbol(for: "not_a_widget"), WidgetSymbols.placeholder, "an unknown type wears the placeholder")
    }

    func testEverySkinWearsTheWebsOwnIcon() throws {
        XCTAssertEqual(WidgetSymbols.symbol(for: "text", skin: "sticky"), "note.text")            // StickyNote
        XCTAssertEqual(WidgetSymbols.symbol(for: "text", skin: "typewriter"), "pencil.line")      // PenLine
        XCTAssertEqual(WidgetSymbols.symbol(for: "text", skin: "plain"), WidgetSymbols.symbol(for: "text"))
        XCTAssertEqual(WidgetSymbols.symbol(for: "bullets", skin: "numbered"), "list.number")     // ListOrdered
        XCTAssertEqual(WidgetSymbols.symbol(for: "rating", skin: "emoji"), "face.smiling")        // Smile
        XCTAssertEqual(WidgetSymbols.symbol(for: "timekeeper", skin: "pomodoro"), "cup.and.saucer") // Coffee
        XCTAssertEqual(WidgetSymbols.symbol(for: "rating", skin: "no_such_skin"), WidgetSymbols.symbol(for: "rating"), "an unknown skin keeps the type's mark")

        for type in inScope {
            let definition = try XCTUnwrap(WidgetRegistry.definition(for: type), type)
            for skin in definition.skins {
                let icon = try XCTUnwrap(skin.icon, "\(type).\(skin.value) carries the web's icon name")
                XCTAssertEqual(WidgetSymbols.symbol(for: type, skin: skin.value), WidgetSymbols.byLucide[icon], "\(type).\(skin.value) wears \(icon)'s stand-in")
            }
        }
    }

    #if canImport(AppKit)
    func testEverySymbolNamesARealSFSymbol() {
        var names = Set(inScope.map { WidgetSymbols.symbol(for: $0) })
        names.formUnion(WidgetSymbols.byLucide.values)
        names.insert(WidgetSymbols.placeholder)
        for name in names.sorted() {
            XCTAssertNotNil(NSImage(systemSymbolName: name, accessibilityDescription: nil), "\(name) is an SF Symbol on this system")
        }
    }
    #endif

    /// The resting ICON face is the same mark. It used to draw
    /// `square.dashed` for every type, so an empty Text card rested as a
    /// dashed square instead of a document.
    func testTheRestingIconFaceWearsTheTypesOwnMark() throws {
        for type in inScope {
            let definition = try XCTUnwrap(WidgetRegistry.definition(for: type), type)
            var widget = Widget(id: "w", type: type, title: "T", canvasId: "root", position: .zero, size: definition.defaultSize, data: definition.defaultData(mint: .counting()))
            widget.record["data"] = .object(JSONObject())
            let context = WidgetRestContext(widget: widget, definition: definition, face: RestingFace(model: .icon, size: Size(width: 40, height: 40)))
            let symbol = WidgetSymbols.symbol(for: context.widget.type, skin: context.skinValue)
            XCTAssertNotEqual(symbol, WidgetSymbols.placeholder, "\(type) rests as its own mark, not a dashed square")
            XCTAssertEqual(symbol, WidgetSymbols.symbol(for: type, skin: context.skinValue), "the resting mark is the title row's mark")
        }
    }

    /// The add-widget picker draws each TYPE's own web face (a miniature of
    /// its layout), not a family glyph: every listed row resolves through the
    /// generated per-type table.
    func testTheWidgetPickerDrawsEachTypesOwnFace() throws {
        // Every pack on; the picker still lists only the study widgets (owner,
        // 21 Sep 2026), so each of those has a face and the rest just keep theirs.
        var board = makeBoard()
        board.activePacks = DomainPacks.all.map(\.id)
        let (document, _, _) = makeDocument(board: board)
        let model = AddWidgetModel(document: document, prefs: InMemoryWidgetPickerPrefs())
        model.setQuery("")
        let entries = model.groups.flatMap(\.entries)
        let listed = Set(entries.map(\.type))
        XCTAssertEqual(listed, WidgetDefinition.offeredTypes.filter { WidgetRegistry.definition(for: $0) != nil })
        for type in inScope {
            let face = try XCTUnwrap(WidgetFacesData.faceByType[type], "\(type) has its own face")
            XCTAssertEqual(WidgetFaces.shapes(type: type, category: "structure"), WidgetFaces.parse(WidgetFacesData.faces[face]))
        }
    }
}
