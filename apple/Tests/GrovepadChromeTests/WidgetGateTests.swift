import XCTest
import SwiftUI
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// The phase-3 gate, per widget: creatable, editable, undoable, resizable,
/// skinnable, persists, renders resting and live.
final class WidgetGateTests: XCTestCase {
    private func definition(_ type: String) -> WidgetDefinition { WidgetRegistry.definition(for: type)! }

    /// A counting minter that starts after the widget id the document mints first.
    private func dataMinter() -> IdMinter {
        let minter = IdMinter.counting()
        _ = minter()
        return minter
    }

    // MARK: Creatable

    func testCreatable() throws {
        for type in phaseThreeTypes {
            let (document, _, _) = makeDocument()
            let definition = definition(type)
            let id = try XCTUnwrap(document.createWidget(type: type, at: Vector2D(x: 37, y: 81), title: "My \(definition.label)"), type)
            XCTAssertEqual(id, "uuid-0001", type)
            let widget = try XCTUnwrap(document.widget(id), type)
            XCTAssertEqual(widget.type, type)
            XCTAssertEqual(widget.title, "My \(definition.label)")
            XCTAssertEqual(widget.canvasId, "root")
            XCTAssertEqual(widget.position, Vector2D(x: 40, y: 80), "\(type) snaps to the grid")
            XCTAssertEqual(widget.size, definition.defaultSize, type)
            XCTAssertEqual(widget.metadata.record, WidgetMetadata().record, type)
            XCTAssertEqual(widget.record.keys, ["id", "type", "title", "canvasId", "position", "size", "data", "metadata"], type)
            if type == "canvas_node" {
                XCTAssertEqual(widget.data.string("canvasId"), "uuid-0002")
                let canvas = try XCTUnwrap(document.canvas("uuid-0002"))
                XCTAssertEqual(canvas.name, "My Canvas")
                XCTAssertEqual(canvas.parentCanvasId, "root")
                XCTAssertEqual(canvas.workspaceId, "ws")
                XCTAssertEqual(widget.data.keys, ["canvasId", "skin"])
            } else {
                XCTAssertEqual(widget.data, definition.defaultData(mint: dataMinter()), "\(type) default data")
            }
            XCTAssertTrue(document.canUndo, "\(type) creation is one undo step")
        }
    }

    func testCreationRefusesUnknownTypes() {
        let (document, _, _) = makeDocument()
        XCTAssertNil(document.createWidget(type: "media", at: .zero, title: "Nope"), "out of the first build")
        XCTAssertNil(document.createWidget(type: "no_such_type", at: .zero, title: "Nope"))
        XCTAssertTrue(document.board.widgets.isEmpty)
        XCTAssertFalse(document.canUndo)
    }

    // MARK: Editable

    func testEditableThroughDataAndCommands() throws {
        for type in phaseThreeTypes {
            let (document, _, clock) = makeDocument()
            let id = try XCTUnwrap(document.createWidget(type: type, at: .zero, title: type))
            document.updateWidgetData(id) { $0["probe"] = .string("edited") }
            XCTAssertEqual(document.widget(id)?.data.string("probe"), "edited", type)
            XCTAssertEqual(document.widget(id)?.data.keys.last, "probe", "\(type) appends in place")

            for command in commandsFor(type) {
                clock.advance(ms: 1000)
                let before = document.widget(id)!.data
                let expected = command.run(before, nil, .counting(prefix: "cmd-"))
                document.runCommand(id, command.key, mint: .counting(prefix: "cmd-"))
                XCTAssertEqual(document.widget(id)?.data, expected, "\(type).\(command.key) runs the Core command")
            }
            if let descriptor = fieldsFor(type).first(where: { $0.set != nil }) {
                let before = document.widget(id)!.data
                let expected = descriptor.set!(before, .number(7), .counting())
                document.setField(id, descriptor.key, .number(7))
                XCTAssertEqual(document.widget(id)?.data, expected, "\(type).\(descriptor.key) writes through the setter")
            }
        }
    }

    func testCounterTapAndWireAgree() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "counter", at: .zero, title: "Tally"))
        document.updateWidgetData(id) { $0["step"] = .number(3) }
        document.runCommand(id, "increment")
        document.runCommand(id, "increment")
        document.runCommand(id, "decrement")
        XCTAssertEqual(document.widget(id)?.data.number("count"), 3)
        document.runCommand(id, "reset")
        XCTAssertEqual(document.widget(id)?.data.number("count"), 0)
    }

    func testNumberInputClampsThroughTheSetter() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "number_input", at: .zero, title: "N"))
        document.setField(id, "value", .number(500))
        XCTAssertEqual(document.widget(id)?.data.number("value"), 100)
        document.setField(id, "value", .text("-9"))
        XCTAssertEqual(document.widget(id)?.data.number("value"), 0)
        document.runCommand(id, "increment")
        XCTAssertEqual(document.widget(id)?.data.number("value"), 1)
    }

    func testChecklistToggleWritesStatusAndDone() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "checklist", at: .zero, title: "Tasks"))
        let itemId = document.widget(id)!.data.recordList("items")[0].string("id")!
        document.updateWidgetData(id) { data in
            data.patchRecord(in: "items", id: itemId) { $0["status"] = .string("done"); $0["done"] = .bool(true) }
        }
        let item = document.widget(id)!.data.recordList("items")[0]
        XCTAssertEqual(item.string("status"), "done")
        XCTAssertEqual(item.bool("done"), true)
        XCTAssertEqual(item.keys, ["id", "label", "done", "status", "due", "day", "time", "start", "span", "quadrant"], "keys keep their order")
        XCTAssertEqual(fieldDescriptor("checklist", "done_count")?.get(document.widget(id)!.data), .number(1))
        document.runCommand(id, "add_item", mint: .counting(prefix: "new-"))
        XCTAssertEqual(document.widget(id)!.data.recordList("items").last?.string("label"), "New task")
    }

    // MARK: Undoable

    func testUndoableAndRedoable() throws {
        for type in phaseThreeTypes {
            let (document, undo, clock) = makeDocument()
            let empty = document.board
            let id = try XCTUnwrap(document.createWidget(type: type, at: .zero, title: type))
            let created = document.board
            clock.advance(ms: 1000)
            document.updateWidgetData(id) { $0["probe"] = .number(1) }
            let edited = document.board
            XCTAssertNotEqual(created, edited, type)

            document.undo()
            XCTAssertEqual(document.board, created, "\(type) undo restores the exact prior board")
            document.undo()
            XCTAssertEqual(document.board, empty, "\(type) undo past creation")
            XCTAssertFalse(undo.canUndo, type)
            document.redo()
            XCTAssertEqual(document.board, created, "\(type) redo re-applies creation")
            document.redo()
            XCTAssertEqual(document.board, edited, "\(type) redo re-applies the edit")
            XCTAssertFalse(undo.canRedo, type)
        }
    }

    func testSameTagEditsCoalesceAndWireWritesNeverRegister() throws {
        let (document, undo, clock) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "text", at: .zero, title: "Note"))
        let created = document.board
        document.updateWidgetData(id) { $0["text"] = .string("a") }
        clock.advance(ms: 100)
        document.updateWidgetData(id) { $0["text"] = .string("ab") }
        clock.advance(ms: 100)
        document.updateWidgetData(id) { $0["text"] = .string("abc") }
        document.undo()
        XCTAssertEqual(document.board, created, "three keystrokes inside the window are one step")
        document.redo()
        XCTAssertEqual(document.widget(id)?.data.string("text"), "abc")

        undo.removeAllActions()
        XCTAssertFalse(undo.canUndo)
        document.applyWireWrites([id: ["text": "from a wire"]])
        XCTAssertEqual(document.widget(id)?.data.string("text"), "from a wire")
        XCTAssertFalse(undo.canUndo, "circuit law 3: wire writes register nothing")
    }

    // MARK: Resizable

    func testResizableClampsToTheRules() throws {
        for type in phaseThreeTypes {
            let (document, _, _) = makeDocument()
            let id = try XCTUnwrap(document.createWidget(type: type, at: .zero, title: type))
            let widget = document.widget(id)!
            let rules = definition(type).sizingRules(for: widget.data)
            document.resizeWidget(id, to: Size(width: 5000, height: 5000))
            let ceiling = DragResize.clampFullSize(Size(width: 5000, height: 5000), rules: rules)
            XCTAssertEqual(document.widget(id)?.size, ceiling, "\(type) ceiling")
            XCTAssertLessThanOrEqual(document.widget(id)!.size.width, CanvasGeometry.widgetMaxEdge)
            document.resizeWidget(id, to: Size(width: 1, height: 1))
            let floor = DragResize.clampFullSize(Size(width: 40, height: 40), rules: rules)
            XCTAssertEqual(document.widget(id)?.size, floor, "\(type) floor")
            document.resizeWidget(id, to: Size(width: 333, height: 197), snap: true)
            let snapped = DragResize.clampFullSize(Size(width: 320, height: 200), rules: rules)
            XCTAssertEqual(document.widget(id)?.size, snapped, "\(type) snaps on release")

            // The icon path: one fixed 2×2 square that no resize changes.
            document.setIconified(id, true)
            XCTAssertEqual(document.widget(id)?.size, CanvasGeometry.iconifiedSize, type)
            XCTAssertEqual(document.widget(id)?.expandedSize, snapped, "\(type) parks the dormant size")
            document.resizeWidget(id, to: Size(width: 130, height: 130))
            XCTAssertEqual(document.widget(id)?.size, CanvasGeometry.iconifiedSize, "\(type) an icon is never resized")
            document.setIconified(id, false)
            XCTAssertEqual(document.widget(id)?.size, snapped, "\(type) restores the dormant size")
            XCTAssertNil(document.widget(id)?.expandedSize)

            document.setLocked([id], true)
            document.resizeWidget(id, to: Size(width: 400, height: 400))
            XCTAssertEqual(document.widget(id)?.size, snapped, "\(type) locked ignores resize")
        }
    }

    func testIconRoundTripRecentresExactly() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "counter", at: Vector2D(x: 200, y: 200), title: "C"))
        let restingTile = WidgetRestContextFactory.restingTileSize
        document.restingTileSize = restingTile
        let before = document.widget(id)!
        document.setIconified(id, true)
        let tile = restingTile(before)!
        XCTAssertEqual(document.widget(id)?.position, Vector2D(x: 200 + (tile.width - 80) / 2, y: 200 + (tile.height - 80) / 2))
        document.setIconified(id, false)
        XCTAssertEqual(document.widget(id)?.position, before.position, "a round trip is exactly reversible")
        XCTAssertEqual(document.widget(id)?.size, before.size)
    }

    // MARK: Skinnable

    func testSkinnable() throws {
        for type in phaseThreeTypes {
            let (document, _, clock) = makeDocument()
            let definition = definition(type)
            let id = try XCTUnwrap(document.createWidget(type: type, at: .zero, title: type))
            XCTAssertFalse(definition.skins.isEmpty, "\(type) has skins")
            // `{ ...data, [skinField]: value }`: an existing slot keeps its place,
            // a missing one (toggle, number_input) is appended once.
            let keysBefore = document.widget(id)!.data.keys
            let expectedKeys = keysBefore.contains(definition.skinField) ? keysBefore : keysBefore + [definition.skinField]
            for skin in definition.skins {
                clock.advance(ms: 1000)
                XCTAssertTrue(document.setSkin(id, value: skin.value), "\(type) accepts \(skin.value)")
                let data = document.widget(id)!.data
                XCTAssertEqual(data.string(definition.skinField), skin.value, "\(type) writes \(definition.skinField)")
                XCTAssertEqual(data.keys, expectedKeys, "\(type) keeps its key order while changing skin")
                XCTAssertEqual(definition.accent(for: data), skin.accent, "\(type) wears the skin's accent")
                XCTAssertEqual(document.widget(id).map { WidgetRendererRegistry.renderer(for: type).restingFace($0) } != nil, true)
            }
            XCTAssertFalse(document.setSkin(id, value: "not-a-skin"), type)
            document.undo()
            XCTAssertEqual(document.widget(id)!.data.string(definition.skinField), definition.skins[definition.skins.count - 2].value, "\(type) skin change is undoable")
        }
    }

    // MARK: Persists

    func testPersistsThroughTheCanonicalRoundTrip() throws {
        let (document, _, _) = makeDocument()
        for (index, type) in phaseThreeTypes.enumerated() {
            let id = try XCTUnwrap(document.createWidget(type: type, at: Vector2D(x: Double(index) * 400, y: 0), title: "\(type) card"))
            document.setSkin(id, value: definition(type).skins[1].value)
        }
        let textId = try XCTUnwrap(document.board.widgets.values.first { $0.type == "text" }?.id)
        document.updateWidgetData(textId) { $0["text"] = .string("Hello, world") }
        let first = BoardSerializer.serializedText(document.board)
        let parsed = try XCTUnwrap(BoardParser.parsePersistedBoard(try JSONParser.parse(first)))
        XCTAssertEqual(parsed.widgets.count, 8)
        XCTAssertEqual(parsed.canvases.count, 2)
        let second = BoardSerializer.serializedText(parsed)
        XCTAssertEqual(first, second, "serialize → parse → serialize is identical")
        for type in phaseThreeTypes {
            XCTAssertTrue(parsed.widgets.values.contains { $0.type == type && $0.opaqueSource == nil }, "\(type) hydrates as itself")
        }
        XCTAssertTrue(first.contains("\"Hello, world\""))
    }

    // MARK: Renders resting and live

    func testRendersRestingAndLive() throws {
        for type in phaseThreeTypes {
            let (document, _, _) = makeDocument()
            let id = try XCTUnwrap(document.createWidget(type: type, at: .zero, title: "\(type) card"))
            if type == "text" { document.updateWidgetData(id) { $0["text"] = .string("Resting text") } }
            let widget = document.widget(id)!
            let definition = definition(type)
            let renderer = WidgetRendererRegistry.renderer(for: type)
            XCTAssertEqual(renderer.type, type, "\(type) has its own renderer")

            // The card's accent is the worn skin's hue.
            XCTAssertEqual(CardAccent.accent(for: widget), definition.accent(for: widget.data), type)

            // Resting tier: a measured, grid-snapped tile and its bitmap.
            let face = renderer.restingFaceMeasured(widget)
            XCTAssertEqual(face.size.width.truncatingRemainder(dividingBy: 40), 0, "\(type) tile width on the grid")
            XCTAssertEqual(face.size.height.truncatingRemainder(dividingBy: 40), 0, "\(type) tile height on the grid")
            XCTAssertGreaterThanOrEqual(face.size.width, CanvasGeometry.iconMinEdge, type)
            XCTAssertGreaterThanOrEqual(face.size.height, type == "canvas_node" || type == "toggle" || type == "counter" || type == "number_input" ? 40 : 40, type)
            if definition.restingFace {
                XCTAssertEqual(WidgetRestContextFactory.restingTileSize(widget), face.size, type)
            } else {
                XCTAssertNil(WidgetRestContextFactory.restingTileSize(widget), "\(type) never rests")
            }
            #if canImport(AppKit)
            let provider = WidgetBitmapProvider(canvasName: { document.canvasName($0) })
            let image = try XCTUnwrap(provider.restingBitmap(for: widget, size: face.size, scale: 2), "\(type) resting bitmap")
            XCTAssertEqual(image.width, Int(face.size.width * 2), type)
            XCTAssertEqual(image.height, Int(face.size.height * 2), type)
            XCTAssertEqual(provider.dataVersion(for: widget), provider.dataVersion(for: widget), "\(type) stable version")
            _ = provider.restingBitmap(for: widget, size: face.size, scale: 2)
            XCTAssertEqual(provider.renders, 1, "\(type) second ask is cached")

            // Live tier: the card body renders inside its shell at the widget's size.
            let context = try XCTUnwrap(document.cardContext(for: widget))
            let card = WidgetBitmapProvider.render(WidgetCardView(context: context), scale: 1)
            let live = try XCTUnwrap(card, "\(type) live card image")
            XCTAssertEqual(live.width, Int(widget.size.width), type)
            let expectedHeight = widget.size.height + (definition.titleChrome ? widgetTitleRowHeight : 0)
            XCTAssertEqual(live.height, Int(expectedHeight), "\(type) title row above the box")
            #endif
        }
    }

    func testRestingFaceGrammar() throws {
        let (document, _, _) = makeDocument()
        let text = document.createWidget(type: "text", at: .zero, title: "Note")!
        XCTAssertEqual(WidgetRendererRegistry.renderer(for: "text").restingFace(document.widget(text)!), .icon, "an empty note rests as an icon")
        document.updateWidgetData(text) { $0["text"] = .string("Something written"); $0["mode"] = .string("sticky") }
        let noteFace = WidgetRendererRegistry.renderer(for: "text").restingFaceMeasured(document.widget(text)!)
        XCTAssertEqual(noteFace.model, .note(skin: "sticky"))
        XCTAssertEqual(noteFace.size, Size(width: 280, height: 200), "320×200 at the sticky scale, snapped up")

        let canvas = document.createWidget(type: "canvas_node", at: .zero, title: "Door")!
        XCTAssertEqual(WidgetRendererRegistry.renderer(for: "canvas_node").restingFaceMeasured(document.widget(canvas)!).size, Size(width: 160, height: 80))
        XCTAssertNil(WidgetRestContextFactory.restingTileSize(document.widget(canvas)!), "restingFace: false")

        let toggle = document.createWidget(type: "toggle", at: .zero, title: "T")!
        XCTAssertEqual(WidgetRendererRegistry.renderer(for: "toggle").restingFace(document.widget(toggle)!), .boolean(label: "Off", active: false, shape: .switch))
        document.setSkin(toggle, value: "availability")
        document.updateWidgetData(toggle) { $0["value"] = .bool(true) }
        XCTAssertEqual(WidgetRendererRegistry.renderer(for: "toggle").restingFace(document.widget(toggle)!), .boolean(label: "Available", active: true, shape: .switch, tone: .good))

        let checklist = document.createWidget(type: "checklist", at: .zero, title: "Tasks")!
        let face = WidgetRendererRegistry.renderer(for: "checklist").restingFaceMeasured(document.widget(checklist)!)
        guard case .rows(let rows, let overflow, let eyebrow, let meter) = face.model else { return XCTFail("rows") }
        XCTAssertEqual(rows.map(\.label), ["New task"])
        XCTAssertEqual(rows.first?.done, false)
        XCTAssertEqual(overflow, 0)
        XCTAssertEqual(eyebrow, RestEyebrow(label: "Tasks", note: "0/1"))
        XCTAssertEqual(meter, 0)

        let counter = document.createWidget(type: "counter", at: .zero, title: "C")!
        document.updateWidgetData(counter) { $0["count"] = .number(7) }
        guard case .grid(let cols, let cells, _, _, _) = WidgetRendererRegistry.renderer(for: "counter").restingFace(document.widget(counter)!) else { return XCTFail("grid") }
        XCTAssertEqual(cols, 2)
        XCTAssertEqual(cells.map(\.text), ["卌", "||"])
        document.setSkin(counter, value: "clicker")
        XCTAssertEqual(WidgetRendererRegistry.renderer(for: "counter").restingFace(document.widget(counter)!), .metric(primary: "7", secondary: "Tally"))

        let number = document.createWidget(type: "number_input", at: .zero, title: "N")!
        document.setField(number, "value", .number(25))
        XCTAssertEqual(WidgetRendererRegistry.renderer(for: "number_input").restingFace(document.widget(number)!), .metric(primary: "25", secondary: "Value", progress: 0.25))

        let cards = document.createWidget(type: "flashcards", at: .zero, title: "Deck")!
        guard case .rows(let cardRows, _, _, _) = WidgetRendererRegistry.renderer(for: "flashcards").restingFace(document.widget(cards)!) else { return XCTFail("rows") }
        XCTAssertEqual(cardRows.first?.lead, "?")
        XCTAssertEqual(cardRows.first?.label, "Card")

        let bullets = document.createWidget(type: "bullets", at: .zero, title: "B")!
        guard case .rows(let bulletRows, _, let bulletEyebrow, _) = WidgetRendererRegistry.renderer(for: "bullets").restingFace(document.widget(bullets)!) else { return XCTFail("rows") }
        XCTAssertEqual(bulletRows.map(\.label), ["First point"])
        XCTAssertTrue(bulletRows[0].marker)
        XCTAssertNil(bulletEyebrow, "the list IS the label")
    }

    #if canImport(AppKit)
    func testAnIconShowsOnlyItsIconFaceNeverItsRestingFace() throws {
        let (document, _, _) = makeDocument()
        for type in ["toggle", "calculator", "text"] {
            let id = try XCTUnwrap(document.createWidget(type: type, at: .zero, title: type))
            document.setIconified(id, true)
            let widget = try XCTUnwrap(document.widget(id))
            let definition = try XCTUnwrap(WidgetRegistry.definition(for: type))
            let provider = WidgetBitmapProvider(canvasName: { _ in nil })
            let tile = try XCTUnwrap(provider.restingBitmap(for: widget, size: widget.size, scale: 2))
            let glyph = WidgetRestContext(widget: widget, definition: definition, face: RestingFace(model: .icon, size: widget.size), canvasName: { _ in nil })
            let expected = try XCTUnwrap(WidgetBitmapProvider.render(WidgetRestingFaceView(context: glyph), scale: 2, colorScheme: .dark))
            XCTAssertEqual(tile.dataProvider?.data as Data?, expected.dataProvider?.data as Data?, "\(type): an icon draws the icon glyph")
        }
    }
    #endif

    func testRestContextFromTheRegistry() throws {
        let (document, _, _) = makeDocument()
        let counter = document.createWidget(type: "counter", at: .zero, title: "C")!
        let canvas = document.createWidget(type: "canvas_node", at: .zero, title: "Door")!
        let context = WidgetRestContextFactory.make()
        XCTAssertTrue(context.isResting(document.widget(counter)!))
        XCTAssertFalse(context.isResting(document.widget(canvas)!))
        document.setPinned(counter, true)
        XCTAssertFalse(context.isResting(document.widget(counter)!), "a pinned card is held open")
        document.setPinned(counter, false)
        document.setIconified(counter, true)
        XCTAssertFalse(context.isResting(document.widget(counter)!), "an icon never rests")
        XCTAssertTrue(context.iconPeeksOpen(document.widget(counter)!))
        let expanded = WidgetRestContextFactory.make(expandedWidgetId: counter)
        XCTAssertTrue(expanded.isRestExpanded(document.widget(counter)!))
    }
}
