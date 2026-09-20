import XCTest
import SwiftUI
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// The ten notes / planning / study widgets, in registry order.
let notesAndStudyTypes = ["code", "outline", "pros_cons", "decision", "meeting_notes", "goal_tracker", "reading_list", "grade_calc", "formula_sheet", "citation"]

/// The phase-8 gate for the notes and study family, the same seven checks
/// as `WidgetGateTests`: creatable, editable (data + commands), undoable,
/// resizable, skinnable, persists, renders resting and live — plus the
/// faces each widget folds to and the tap-and-wire agreements.
final class NotesAndStudyGateTests: XCTestCase {
    private func definition(_ type: String) -> WidgetDefinition { WidgetRegistry.definition(for: type)! }

    private func dataMinter() -> IdMinter {
        let minter = IdMinter.counting()
        _ = minter()
        return minter
    }

    private func renderer(_ type: String) -> AnyWidgetRenderer { WidgetRendererRegistry.renderer(for: type) }

    /// The id of the first record in one list slot of a widget's data.
    private func firstId(_ document: BoardDocument, _ widgetId: String, _ key: String) -> String {
        document.widget(widgetId)!.data.recordList(key).first?.string("id") ?? ""
    }

    // MARK: Registered

    func testEveryTypeHasItsOwnRenderer() {
        for type in notesAndStudyTypes {
            XCTAssertEqual(renderer(type).type, type, "\(type) is registered, not the placeholder")
            XCTAssertTrue(WidgetRendererRegistry.portedTypes.contains(type), type)
        }
        XCTAssertEqual(NotesAndStudyFamily.renderers.map(\.type), notesAndStudyTypes, "the family registers exactly its ten, in registry order")
    }

    // MARK: Creatable

    func testCreatable() throws {
        for type in notesAndStudyTypes {
            let (document, _, _) = makeDocument()
            let definition = definition(type)
            let id = try XCTUnwrap(document.createWidget(type: type, at: Vector2D(x: 37, y: 81), title: "My \(definition.label)"), type)
            XCTAssertEqual(id, "uuid-0001", type)
            let widget = try XCTUnwrap(document.widget(id), type)
            XCTAssertEqual(widget.type, type)
            XCTAssertEqual(widget.position, Vector2D(x: 40, y: 80), "\(type) snaps to the grid")
            XCTAssertEqual(widget.size, definition.defaultSize, type)
            XCTAssertEqual(widget.record.keys, ["id", "type", "title", "canvasId", "position", "size", "data", "metadata"], type)
            XCTAssertEqual(widget.data, definition.defaultData(mint: dataMinter()), "\(type) default data")
            XCTAssertTrue(document.canUndo, "\(type) creation is one undo step")
        }
    }

    // MARK: Editable

    func testEditableThroughDataAndCommands() throws {
        for type in notesAndStudyTypes {
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
            for descriptor in fieldsFor(type) where descriptor.set != nil {
                clock.advance(ms: 1000)
                let before = document.widget(id)!.data
                let expected = descriptor.set!(before, .number(7), .counting())
                document.setField(id, descriptor.key, .number(7))
                XCTAssertEqual(document.widget(id)?.data, expected, "\(type).\(descriptor.key) writes through the setter")
            }
        }
    }

    func testCodeSetterAndWireAgree() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "code", at: .zero, title: "Snippet"))
        document.setField(id, "code", .text("let x = 1"))
        XCTAssertEqual(document.widget(id)?.data.string("code"), "let x = 1")
        XCTAssertEqual(document.widget(id)?.data.keys, ["language", "code"], "the setter keeps the key order")
        XCTAssertEqual(fieldDescriptor("code", "code")?.get(document.widget(id)!.data), .text("let x = 1"))
    }

    func testDecisionAddItemRunsTheCommand() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "decision", at: .zero, title: "Pick"))
        document.runCommand(id, "add_item")
        XCTAssertEqual(DecisionWidget.options(document.widget(id)!.data), ["", "", "New option"])
        document.updateWidgetData(id) { $0["pickedIndex"] = .number(2) }
        XCTAssertEqual(fieldDescriptor("decision", "picked")?.get(document.widget(id)!.data), .text("New option"))
    }

    func testGoalPercentClampsThroughTheSetter() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "goal_tracker", at: .zero, title: "Goal"))
        document.setSkin(id, value: "simple")
        document.setField(id, "percent", .number(140))
        XCTAssertEqual(document.widget(id)?.data.object("simple")?.number("percent"), 100)
        XCTAssertEqual(document.widget(id)?.data.object("simple")?.keys, ["label", "percent"])
        document.runCommand(id, "reset")
        XCTAssertEqual(document.widget(id)?.data.object("simple")?.number("percent"), 0)
        document.setSkin(id, value: "milestones")
        document.runCommand(id, "check_all")
        XCTAssertEqual(fieldDescriptor("goal_tracker", "complete")?.get(document.widget(id)!.data), .bool(true))
        XCTAssertEqual(fieldDescriptor("goal_tracker", "percent")?.get(document.widget(id)!.data), .number(100))
    }

    func testMeetingUncheckAllAndReadingListReset() throws {
        let (document, _, _) = makeDocument()
        let meeting = try XCTUnwrap(document.createWidget(type: "meeting_notes", at: .zero, title: "M"))
        document.updateWidgetData(meeting) { data in
            var record = JSONObject()
            record["id"] = .string("a1")
            record["text"] = .string("Ship it")
            record["done"] = .bool(true)
            data.appendRecord(in: "actions", record)
        }
        XCTAssertEqual(fieldDescriptor("meeting_notes", "actions_done")?.get(document.widget(meeting)!.data), .bool(true))
        document.runCommand(meeting, "uncheck_all")
        XCTAssertEqual(document.widget(meeting)!.data.recordList("actions").first?.bool("done"), false)

        let reading = try XCTUnwrap(document.createWidget(type: "reading_list", at: .zero, title: "R"))
        let itemId = document.widget(reading)!.data.recordList("items")[0].string("id")!
        document.updateWidgetData(reading) { $0.patchRecord(in: "items", id: itemId) { $0["status"] = .string("done") } }
        XCTAssertEqual(fieldDescriptor("reading_list", "done_count")?.get(document.widget(reading)!.data), .number(1))
        document.runCommand(reading, "reset")
        XCTAssertEqual(document.widget(reading)!.data.recordList("items").first?.string("status"), "queued")
    }

    func testRemovingAnItemTakesItsPocketsWithIt() throws {
        var data = JSONObject()
        data["items"] = .array([.object(["id": "x", "text": "One", "depth": 0, "collapsed": false]), .object(["id": "y", "text": "Two", "depth": 1, "collapsed": false])])
        data["skinStates"] = .object([
            "work_breakdown": .object(["items": .object(["x": .object(["owner": "Ann"]), "y": .object(["estimate": "2d"])])]),
            "collapsible_brief": .object(["expandedIds": .array(["x"]), "items": .object(["x": .object(["notes": "n"])])]),
        ])
        data.removeRecord(in: "items", id: "x")
        data.removeFromEverySkinPocket(id: "x", in: ["items"])
        XCTAssertEqual(data.recordList("items").map { $0.string("id") }, ["y"])
        XCTAssertEqual(data.object("skinStates")?.object("work_breakdown")?.object("items")?.keys, ["y"])
        XCTAssertNil(data.object("skinStates")?.object("collapsible_brief")?.object("items"), "an emptied pocket goes")
        XCTAssertEqual(data.object("skinStates")?.object("collapsible_brief")?.array("expandedIds")?.count, 1, "untouched keys stay")
        data.removeFromEverySkinPocket(id: "y", in: ["items"])
        XCTAssertNil(data.object("skinStates")?.object("work_breakdown"), "an emptied skin state goes")
    }

    // MARK: Undoable

    func testUndoableAndRedoable() throws {
        for type in notesAndStudyTypes {
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

    // MARK: Resizable

    func testResizableClampsToTheRules() throws {
        for type in notesAndStudyTypes {
            let (document, _, _) = makeDocument()
            let id = try XCTUnwrap(document.createWidget(type: type, at: .zero, title: type))
            let rules = definition(type).sizingRules(for: document.widget(id)!.data)
            document.resizeWidget(id, to: Size(width: 5000, height: 5000))
            XCTAssertEqual(document.widget(id)?.size, DragResize.clampFullSize(Size(width: 5000, height: 5000), rules: rules), "\(type) ceiling")
            document.resizeWidget(id, to: Size(width: 1, height: 1))
            XCTAssertEqual(document.widget(id)?.size, DragResize.clampFullSize(Size(width: 40, height: 40), rules: rules), "\(type) floor")
            document.resizeWidget(id, to: Size(width: 333, height: 197), snap: true)
            let snapped = DragResize.clampFullSize(Size(width: 320, height: 200), rules: rules)
            XCTAssertEqual(document.widget(id)?.size, snapped, "\(type) snaps on release")
            document.setIconified(id, true)
            XCTAssertEqual(document.widget(id)?.size, CanvasGeometry.iconifiedSize, type)
            XCTAssertEqual(document.widget(id)?.expandedSize, snapped, "\(type) parks the dormant size")
            document.setIconified(id, false)
            XCTAssertEqual(document.widget(id)?.size, snapped, "\(type) restores the dormant size")
            document.setLocked([id], true)
            document.resizeWidget(id, to: Size(width: 400, height: 400))
            XCTAssertEqual(document.widget(id)?.size, snapped, "\(type) locked ignores resize")
        }
    }

    // MARK: Skinnable

    func testSkinnable() throws {
        for type in notesAndStudyTypes {
            let (document, _, clock) = makeDocument()
            let definition = definition(type)
            let id = try XCTUnwrap(document.createWidget(type: type, at: .zero, title: type))
            XCTAssertFalse(definition.skins.isEmpty, "\(type) has skins")
            let keysBefore = document.widget(id)!.data.keys
            let expectedKeys = keysBefore.contains(definition.skinField) ? keysBefore : keysBefore + [definition.skinField]
            for skin in definition.skins {
                clock.advance(ms: 1000)
                XCTAssertTrue(document.setSkin(id, value: skin.value), "\(type) accepts \(skin.value)")
                let widget = document.widget(id)!
                XCTAssertEqual(widget.data.string(definition.skinField), skin.value, "\(type) writes \(definition.skinField)")
                XCTAssertEqual(widget.data.keys, expectedKeys, "\(type) keeps its key order while changing skin")
                XCTAssertEqual(definition.accent(for: widget.data), skin.accent, "\(type) wears the skin's accent")
                let face = renderer(type).restingFaceMeasured(widget)
                XCTAssertEqual(face.size.width.truncatingRemainder(dividingBy: 40), 0, "\(type)/\(skin.value) tile on the grid")
                #if canImport(AppKit)
                let context = try XCTUnwrap(document.cardContext(for: widget))
                XCTAssertNotNil(WidgetBitmapProvider.render(WidgetCardView(context: context), scale: 1), "\(type)/\(skin.value) body renders")
                #endif
            }
            XCTAssertFalse(document.setSkin(id, value: "not-a-skin"), type)
            document.undo()
            XCTAssertEqual(document.widget(id)!.data.string(definition.skinField), definition.skins[definition.skins.count - 2].value, "\(type) skin change is undoable")
        }
    }

    // MARK: Persists

    func testPersistsThroughTheCanonicalRoundTrip() throws {
        let (document, _, _) = makeDocument()
        for (index, type) in notesAndStudyTypes.enumerated() {
            let id = try XCTUnwrap(document.createWidget(type: type, at: Vector2D(x: Double(index) * 400, y: 0), title: "\(type) card"))
            document.setSkin(id, value: definition(type).skins[1].value)
        }
        let codeId = try XCTUnwrap(document.board.widgets.values.first { $0.type == "code" }?.id)
        document.setField(codeId, "code", .text("print(\"hi\")\n  return 1"))
        let first = BoardSerializer.serializedText(document.board)
        let parsed = try XCTUnwrap(BoardParser.parsePersistedBoard(try JSONParser.parse(first)))
        XCTAssertEqual(parsed.widgets.count, 10)
        let second = BoardSerializer.serializedText(parsed)
        XCTAssertEqual(first, second, "serialize → parse → serialize is identical")
        for type in notesAndStudyTypes {
            XCTAssertTrue(parsed.widgets.values.contains { $0.type == type && $0.opaqueSource == nil }, "\(type) hydrates as itself")
        }
        XCTAssertTrue(first.contains("print(\\\"hi\\\")\\n  return 1"))
    }

    // MARK: Renders resting and live

    func testRendersRestingAndLive() throws {
        for type in notesAndStudyTypes {
            let (document, _, _) = makeDocument()
            let id = try XCTUnwrap(document.createWidget(type: type, at: .zero, title: "\(type) card"))
            if type == "code" { document.setField(id, "code", .text("let a = 1\nlet b = 2")) }
            let widget = document.widget(id)!
            let definition = definition(type)
            let renderer = renderer(type)

            // The card's accent is the worn skin's hue.
            XCTAssertEqual(CardAccent.accent(for: widget), definition.accent(for: widget.data), type)

            let face = renderer.restingFaceMeasured(widget)
            XCTAssertEqual(face.size.width.truncatingRemainder(dividingBy: 40), 0, "\(type) tile width on the grid")
            XCTAssertEqual(face.size.height.truncatingRemainder(dividingBy: 40), 0, "\(type) tile height on the grid")
            XCTAssertGreaterThanOrEqual(face.size.width, CanvasGeometry.iconMinEdge, type)
            XCTAssertTrue(definition.restingFace, "\(type) rests")
            XCTAssertEqual(WidgetRestContextFactory.restingTileSize(widget), face.size, type)
            #if canImport(AppKit)
            let provider = WidgetBitmapProvider(canvasName: { document.canvasName($0) })
            let image = try XCTUnwrap(provider.restingBitmap(for: widget, size: face.size, scale: 2), "\(type) resting bitmap")
            XCTAssertEqual(image.width, Int(face.size.width * 2), type)
            XCTAssertEqual(image.height, Int(face.size.height * 2), type)
            _ = provider.restingBitmap(for: widget, size: face.size, scale: 2)
            XCTAssertEqual(provider.renders, 1, "\(type) second ask is cached")

            let context = try XCTUnwrap(document.cardContext(for: widget))
            let live = try XCTUnwrap(WidgetBitmapProvider.render(WidgetCardView(context: context), scale: 1), "\(type) live card image")
            XCTAssertEqual(live.width, Int(widget.size.width), type)
            XCTAssertEqual(live.height, Int(widget.size.height + (definition.titleChrome ? widgetTitleRowHeight : 0)), "\(type) title row above the box")
            #endif
        }
    }

    // MARK: Faces

    func testRestingFaceGrammar() throws {
        let (document, _, _) = makeDocument()

        let code = document.createWidget(type: "code", at: .zero, title: "Snippet")!
        XCTAssertEqual(renderer("code").restingFace(document.widget(code)!), .icon, "an empty snippet rests as an icon")
        document.updateWidgetData(code) { $0["code"] = .string("  if (a) {\n\n    return b\n}"); $0["language"] = .string("ts") }
        guard case .lines(let codeLines, let codeEyebrow, let codeMono, _) = renderer("code").restingFace(document.widget(code)!) else { return XCTFail("lines") }
        XCTAssertEqual(codeLines.map(\.left), ["  if (a) {", "    return b", "}"], "clipped, never compacted")
        XCTAssertEqual(codeEyebrow, RestEyebrow(label: "ts", note: "4 lines"))
        XCTAssertTrue(codeMono, "monospaced and un-wrapped")
        document.setSkin(code, value: "terminal")
        guard case .lines(let termLines, _, _, _) = renderer("code").restingFace(document.widget(code)!) else { return XCTFail("lines") }
        XCTAssertEqual(termLines.first?.left, "$   if (a) {")
        document.setSkin(code, value: "diff")
        document.updateWidgetData(code) { $0["code"] = .string("+added\n-removed\n same") }
        guard case .lines(let diffLines, _, _, _) = renderer("code").restingFace(document.widget(code)!) else { return XCTFail("lines") }
        XCTAssertEqual(diffLines.map(\.tone), [.good, .bad, nil])

        let outline = document.createWidget(type: "outline", at: .zero, title: "O")!
        guard case .rows(let treeRows, _, let treeEyebrow, _) = renderer("outline").restingFace(document.widget(outline)!) else { return XCTFail("rows") }
        XCTAssertEqual(treeRows.map(\.label), ["First idea"])
        XCTAssertEqual(treeEyebrow, RestEyebrow(label: "Idea tree"))
        document.updateWidgetData(outline) { data in
            data.appendRecord(in: "items", ["id": "b", "text": "Branch", "depth": 1, "collapsed": false])
            data.appendRecord(in: "items", ["id": "c", "text": "Leaf", "depth": 2, "collapsed": false])
            data.patchRecord(in: "items", id: "b") { $0["collapsed"] = .bool(true) }
        }
        document.setSkin(outline, value: "roman")
        guard case .rows(let romanRows, _, _, _) = renderer("outline").restingFace(document.widget(outline)!) else { return XCTFail("rows") }
        XCTAssertEqual(romanRows.map(\.lead), ["I.", "A."], "a collapsed branch hides its children")
        XCTAssertEqual(romanRows.map(\.indent), [0, 1])
        document.setSkin(outline, value: "work_breakdown")
        document.updateWidgetData(outline) { $0["skinStates"] = .object(["work_breakdown": .object(["items": .object(["b": .object(["complete": true, "estimate": "3d"])])])]) }
        guard case .rows(let workRows, _, let workEyebrow, let workMeter) = renderer("outline").restingFace(document.widget(outline)!) else { return XCTFail("rows") }
        XCTAssertEqual(workRows.map(\.done), [false, true])
        XCTAssertEqual(workRows.last?.value, "3d")
        XCTAssertEqual(workEyebrow, RestEyebrow(label: "Delivery plan", note: "33%"))
        XCTAssertEqual(workMeter.map { ($0 * 100).rounded() }, 33)

        let sheet = document.createWidget(type: "pros_cons", at: .zero, title: "P")!
        XCTAssertEqual(renderer("pros_cons").restingFace(document.widget(sheet)!), .icon, "blank rows do not tip the scale")
        let proId = document.widget(sheet)!.data.recordList("pros")[0].string("id")!
        document.updateWidgetData(sheet) { $0.patchRecord(in: "pros", id: proId) { $0["text"] = .string("Cheaper") } }
        guard case .rows(let pcRows, _, let pcEyebrow, _) = renderer("pros_cons").restingFace(document.widget(sheet)!) else { return XCTFail("rows") }
        XCTAssertEqual(pcRows.map(\.value), ["pro"])
        XCTAssertEqual(pcEyebrow, RestEyebrow(label: "Balance"), "the catalogue dress names the skin")
        document.setSkin(sheet, value: "reversible_irreversible")
        guard case .rows(let revRows, _, _, _) = renderer("pros_cons").restingFace(document.widget(sheet)!) else { return XCTFail("rows") }
        XCTAssertEqual(revRows.map(\.value), ["undoable"])

        let decision = document.createWidget(type: "decision", at: .zero, title: "D")!
        document.updateWidgetData(decision) { $0["options"] = .array(["Tea", "Coffee"]); $0["pickedIndex"] = .number(1) }
        guard case .rows(let pickRows, _, let pickEyebrow, _) = renderer("decision").restingFace(document.widget(decision)!) else { return XCTFail("rows") }
        XCTAssertEqual(pickRows.map(\.lead), [nil, "★"])
        XCTAssertEqual(pickRows.map(\.tone), [.muted, .accent])
        XCTAssertNil(pickEyebrow, "a legacy mode is not dressed")
        document.setSkin(decision, value: "weighted")
        guard case .rows(let weightedRows, _, _, _) = renderer("decision").restingFace(document.widget(decision)!) else { return XCTFail("rows") }
        XCTAssertEqual(weightedRows.map(\.value), ["×1", "×1"])
        document.setSkin(decision, value: "wheel")
        guard case .rows(_, _, let wheelEyebrow, _) = renderer("decision").restingFace(document.widget(decision)!) else { return XCTFail("rows") }
        XCTAssertEqual(wheelEyebrow, RestEyebrow(label: "Wheel"))

        let meeting = document.createWidget(type: "meeting_notes", at: .zero, title: "M")!
        XCTAssertEqual(renderer("meeting_notes").restingFace(document.widget(meeting)!), .icon, "nothing typed rests as an icon")
        document.updateWidgetData(meeting) { data in
            data.appendRecord(in: "actions", ["id": "t1", "text": "Budget", "done": false])
            data["skinStates"] = .object(["agenda": .object(["items": .object(["t1": .object(["minutes": "15"])])])])
        }
        guard case .rows(let agendaRows, _, let agendaEyebrow, _) = renderer("meeting_notes").restingFace(document.widget(meeting)!) else { return XCTFail("rows") }
        XCTAssertEqual(agendaRows.first?.lead, "1")
        XCTAssertEqual(agendaRows.first?.value, "15 min")
        XCTAssertEqual(agendaEyebrow?.label, "Agenda")
        XCTAssertEqual(agendaEyebrow?.note, "15 min")
        document.setSkin(meeting, value: "stand_up")
        document.updateWidgetData(meeting) { $0["notes"] = .string("Ship the port\nWrite the tests") }
        guard case .columns(let lanes, let wrap, let laneEyebrow) = renderer("meeting_notes").restingFace(document.widget(meeting)!) else { return XCTFail("columns") }
        XCTAssertEqual(lanes.map(\.label), ["Yesterday", "Today", "Blockers", "Asks"], "the stand-up's lanes")
        XCTAssertEqual(lanes.map { $0.items.count }, [0, 2, 0, 1])
        XCTAssertNil(wrap)
        XCTAssertEqual(laneEyebrow?.label, "Stand-up")
        document.setSkin(meeting, value: "retrospective")
        guard case .columns(let quadrants, let retroWrap, _) = renderer("meeting_notes").restingFace(document.widget(meeting)!) else { return XCTFail("columns") }
        XCTAssertEqual(quadrants.count, 4)
        XCTAssertEqual(retroWrap, 2, "a 2×2 matrix stays a matrix")

        let goal = document.createWidget(type: "goal_tracker", at: .zero, title: "G")!
        XCTAssertEqual(renderer("goal_tracker").restingFace(document.widget(goal)!), .icon, "a blank milestone and no goal is nothing")
        document.updateWidgetData(goal) { data in
            data["goal"] = .string("Launch")
            data.patchRecord(in: "milestones", id: data.recordList("milestones")[0].string("id")!) { $0["label"] = .string("Beta"); $0["done"] = .bool(true) }
        }
        guard case .rows(let goalRows, _, let goalEyebrow, let goalMeter) = renderer("goal_tracker").restingFace(document.widget(goal)!) else { return XCTFail("rows") }
        XCTAssertEqual(goalRows.map(\.done), [true])
        XCTAssertEqual(goalEyebrow, RestEyebrow(label: "Launch", note: "1/1"))
        XCTAssertEqual(goalMeter, 1)
        document.setSkin(goal, value: "simple")
        XCTAssertEqual(renderer("goal_tracker").restingFace(document.widget(goal)!), .gauge(progress: 0.4, primary: "40%", secondary: "Progress", tone: .accent))
        document.setSkin(goal, value: "hours")
        document.updateWidgetData(goal) { $0["hours"] = .object(["subject": "Maths", "targetHours": 10, "loggedHours": 10]) }
        XCTAssertEqual(renderer("goal_tracker").restingFace(document.widget(goal)!), .gauge(progress: 1, primary: "10h", secondary: "Maths", caption: "of 10h", tone: .good))
        document.setSkin(goal, value: "okr")
        guard case .bars(let krBars, let krEyebrow) = renderer("goal_tracker").restingFace(document.widget(goal)!) else { return XCTFail("bars") }
        XCTAssertEqual(krBars.map(\.value), ["0%"])
        XCTAssertEqual(krBars.map(\.fraction), [0])
        XCTAssertEqual(krEyebrow, RestEyebrow(label: "Objective", note: "Meaningful objective"))
        document.setSkin(goal, value: "thermometer")
        guard case .rows(_, _, let thermoEyebrow, _) = renderer("goal_tracker").restingFace(document.widget(goal)!) else { return XCTFail("rows") }
        XCTAssertEqual(thermoEyebrow, RestEyebrow(label: "Thermometer"), "a catalogue skin is named by the dress")

        let reading = document.createWidget(type: "reading_list", at: .zero, title: "R")!
        guard case .rows(let bookRows, _, let bookEyebrow, _) = renderer("reading_list").restingFace(document.widget(reading)!) else { return XCTFail("rows") }
        XCTAssertEqual(bookRows.first, RestRow(key: firstId(document, reading, "items"), label: "Untitled", done: false, value: "queued"))
        XCTAssertNil(bookEyebrow, "no skin named, no dress")

        let grades = document.createWidget(type: "grade_calc", at: .zero, title: "Gr")!
        let examsId = firstId(document, grades, "components")
        document.updateWidgetData(grades) { $0.patchRecord(in: "components", id: examsId) { $0["score"] = .number(90) } }
        guard case .bars(let gradeBars, let gradeEyebrow) = renderer("grade_calc").restingFace(document.widget(grades)!) else { return XCTFail("bars") }
        XCTAssertEqual(gradeBars.map(\.value), ["90%", "0%"])
        XCTAssertEqual(gradeBars.map(\.fraction), [0.9, 0])
        XCTAssertEqual(gradeBars.map(\.tone), [.good, .bad])
        XCTAssertEqual(gradeEyebrow, RestEyebrow(label: "Grade", note: "45%"))
        XCTAssertEqual(fieldDescriptor("grade_calc", "grade")?.get(document.widget(grades)!.data), .number(45), "the face and the port agree")

        let formulas = document.createWidget(type: "formula_sheet", at: .zero, title: "F")!
        let formulaId = firstId(document, formulas, "formulas")
        document.updateWidgetData(formulas) { $0.patchRecord(in: "formulas", id: formulaId) { $0["name"] = .string("Pythagoras"); $0["expression"] = .string("c = √(a² + b²)") } }
        guard case .lines(let refLines, _, let refMono, _) = renderer("formula_sheet").restingFace(document.widget(formulas)!) else { return XCTFail("lines") }
        XCTAssertEqual(refLines.first?.left, "Pythagoras")
        XCTAssertEqual(refLines.first?.right, "c = √(a² + b²)")
        XCTAssertTrue(refMono)
        document.setSkin(formulas, value: "equation_cards")
        guard case .lines(let deckLines, let deckEyebrow, _, _) = renderer("formula_sheet").restingFace(document.widget(formulas)!) else { return XCTFail("lines") }
        XCTAssertEqual(deckLines.first?.left, "c = √(a² + b²)", "the deck leads with the equation")
        XCTAssertEqual(deckLines.first?.right, "c")
        XCTAssertEqual(deckEyebrow, RestEyebrow(label: "Equation Cards"), "the dress names a ledger too")
        document.setSkin(formulas, value: "exam_strip")
        guard case .lines(let stripLines, _, _, _) = renderer("formula_sheet").restingFace(document.widget(formulas)!) else { return XCTFail("lines") }
        XCTAssertEqual(stripLines.first?.left, "1. Pythagoras")
        document.setSkin(formulas, value: "derivation")
        document.updateWidgetData(formulas) { $0["skinStates"] = .object(["derivation": .object(["steps": .object([formulaId: .array(["a² + b² = c²", "c² = a² + b²"])])])]) }
        guard case .chain(let ladder, let ladderShape, let ladderOverflow, let ladderEyebrow) = renderer("formula_sheet").restingFace(document.widget(formulas)!) else { return XCTFail("chain") }
        XCTAssertEqual(ladder.map(\.label), ["a² + b² = c²", "c² = a² + b²", "c = √(a² + b²)"], "the steps, landing on the result")
        XCTAssertEqual(ladder.last?.caption, "Pythagoras")
        XCTAssertEqual(ladderShape, .linear)
        XCTAssertEqual(ladderOverflow, 0)
        XCTAssertEqual(ladderEyebrow, RestEyebrow(label: "Derivation"))

        let citation = document.createWidget(type: "citation", at: .zero, title: "C")!
        let sourceId = firstId(document, citation, "sources")
        document.updateWidgetData(citation) { $0.patchRecord(in: "sources", id: sourceId) { $0["author"] = .string("Knuth"); $0["year"] = .string("1968") } }
        guard case .rows(let citeRows, _, _, _) = renderer("citation").restingFace(document.widget(citation)!) else { return XCTFail("rows") }
        XCTAssertEqual(citeRows.first, RestRow(key: sourceId, label: "Knuth", value: "1968", lead: "APA"))
        XCTAssertEqual(CitationWidget.format(style: "MLA", source: document.widget(citation)!.data.recordList("sources")[0]), "Knuth. \"Title.\" 1968.")
    }

    func testOutlineMarkersAndVisibility() {
        let items = [
            OutlineWidget.Item(id: "a", text: "A", depth: 0, collapsed: false),
            OutlineWidget.Item(id: "b", text: "B", depth: 1, collapsed: true),
            OutlineWidget.Item(id: "c", text: "C", depth: 2, collapsed: false),
            OutlineWidget.Item(id: "d", text: "D", depth: 1, collapsed: false),
            OutlineWidget.Item(id: "e", text: "E", depth: 0, collapsed: false),
        ]
        XCTAssertEqual(OutlineWidget.visibleItems(items).map(\.item.id), ["a", "b", "d", "e"])
        XCTAssertEqual((0..<5).map { OutlineWidget.romanMarker(items, $0) }, ["I.", "A.", "1.", "B.", "II."])
        XCTAssertEqual(OutlineWidget.alpha(27), "AA")
        XCTAssertEqual(OutlineWidget.roman(399), "CCCXCIX")
        XCTAssertEqual(OutlineWidget.contextLabel(skin: "scenes", depth: 2), "Beat")
    }
}
