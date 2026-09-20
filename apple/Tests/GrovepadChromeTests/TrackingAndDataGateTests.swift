import XCTest
import SwiftUI
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// The phase-8 gate for the tracking, data and input family, per widget:
/// creatable, editable (data and commands), undoable, resizable, skinnable
/// (every catalogued skin accepted), persists (round trip byte-identical),
/// renders resting and live. Then one behaviour seam per widget: a tap and a
/// wire agree, and the folded face reads the same model the card does.
final class TrackingAndDataGateTests: XCTestCase {
    private let family = TrackingAndDataFamily.types

    override func setUp() {
        super.setUp()
        // The date_picker and timekeeper readings are clock-relative; freeze
        // the field clock the way the pack does so a face is deterministic.
        FieldClock.now = .conformance
    }

    override func tearDown() {
        FieldClock.reset()
        super.tearDown()
    }

    private func definition(_ type: String) -> WidgetDefinition { WidgetRegistry.definition(for: type)! }

    private func dataMinter() -> IdMinter {
        let minter = IdMinter.counting()
        _ = minter()
        return minter
    }

    private func renderer(_ type: String) -> AnyWidgetRenderer { WidgetRendererRegistry.renderer(for: type) }

    // MARK: Registered

    func testFamilyIsRegisteredInRegistryOrder() {
        XCTAssertEqual(family.count, 15)
        for type in family {
            XCTAssertEqual(renderer(type).type, type, "\(type) has its own renderer")
            XCTAssertNotNil(WidgetRegistry.definition(for: type), "\(type) is in the registry")
        }
        XCTAssertEqual(WidgetRendererRegistry.portedTypes.filter { family.contains($0) }, family, "the family registers in registry order")
    }

    // MARK: Creatable

    func testCreatable() throws {
        for type in family {
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
        for type in family {
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

    // MARK: Undoable

    func testUndoableAndRedoable() throws {
        for type in family {
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
        }
    }

    // MARK: Resizable

    func testResizableClampsToTheRules() throws {
        for type in family {
            let (document, _, _) = makeDocument()
            let id = try XCTUnwrap(document.createWidget(type: type, at: .zero, title: type))
            let widget = document.widget(id)!
            let rules = definition(type).sizingRules(for: widget.data)
            document.resizeWidget(id, to: Size(width: 5000, height: 5000))
            XCTAssertEqual(document.widget(id)?.size, DragResize.clampFullSize(Size(width: 5000, height: 5000), rules: rules), "\(type) ceiling")
            document.resizeWidget(id, to: Size(width: 1, height: 1))
            XCTAssertEqual(document.widget(id)?.size, DragResize.clampFullSize(Size(width: 40, height: 40), rules: rules), "\(type) floor")
            document.resizeWidget(id, to: Size(width: 333, height: 197), snap: true)
            let snapped = DragResize.clampFullSize(Size(width: 320, height: 200), rules: rules)
            XCTAssertEqual(document.widget(id)?.size, snapped, "\(type) snaps on release")
            document.setIconified(id, true)
            XCTAssertEqual(document.widget(id)?.size, CanvasGeometry.iconifiedSize, type)
            document.setIconified(id, false)
            XCTAssertEqual(document.widget(id)?.size, snapped, "\(type) restores the dormant size")
            document.setLocked([id], true)
            document.resizeWidget(id, to: Size(width: 400, height: 400))
            XCTAssertEqual(document.widget(id)?.size, snapped, "\(type) locked ignores resize")
        }
    }

    // MARK: Skinnable

    func testSkinnableAcceptsEveryCataloguedSkin() throws {
        for type in family {
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
                XCTAssertGreaterThanOrEqual(face.size.width, CanvasGeometry.iconMinEdge, "\(type)/\(skin.value)")
                #if canImport(AppKit)
                let context = try XCTUnwrap(document.cardContext(for: widget))
                XCTAssertNotNil(WidgetBitmapProvider.render(WidgetCardView(context: context), scale: 1), "\(type)/\(skin.value) live card renders")
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
        for (index, type) in family.enumerated() {
            let id = try XCTUnwrap(document.createWidget(type: type, at: Vector2D(x: Double(index) * 400, y: 0), title: "\(type) card"))
            document.setSkin(id, value: definition(type).skins[1].value)
        }
        let first = BoardSerializer.serializedText(document.board)
        let parsed = try XCTUnwrap(BoardParser.parsePersistedBoard(try JSONParser.parse(first)))
        XCTAssertEqual(parsed.widgets.count, family.count)
        XCTAssertEqual(BoardSerializer.serializedText(parsed), first, "serialize → parse → serialize is identical")
        for type in family {
            XCTAssertTrue(parsed.widgets.values.contains { $0.type == type && $0.opaqueSource == nil }, "\(type) hydrates as itself")
        }
    }

    // MARK: Renders resting and live

    func testRendersRestingAndLive() throws {
        for type in family {
            let (document, _, _) = makeDocument()
            let id = try XCTUnwrap(document.createWidget(type: type, at: .zero, title: "\(type) card"))
            let widget = document.widget(id)!
            let definition = definition(type)
            let renderer = renderer(type)

            // The card's accent is the worn skin's hue.
            XCTAssertEqual(CardAccent.accent(for: widget), definition.accent(for: widget.data), type)

            let face = renderer.restingFaceMeasured(widget)
            XCTAssertEqual(face.size.width.truncatingRemainder(dividingBy: 40), 0, "\(type) tile width on the grid")
            XCTAssertEqual(face.size.height.truncatingRemainder(dividingBy: 40), 0, "\(type) tile height on the grid")
            XCTAssertGreaterThanOrEqual(face.size.width, CanvasGeometry.iconMinEdge, type)
            XCTAssertEqual(WidgetRestContextFactory.restingTileSize(widget), face.size, "\(type) rests")
            #if canImport(AppKit)
            let provider = WidgetBitmapProvider(canvasName: { document.canvasName($0) })
            let image = try XCTUnwrap(provider.restingBitmap(for: widget, size: face.size, scale: 2), "\(type) resting bitmap")
            XCTAssertEqual(image.width, Int(face.size.width * 2), type)
            XCTAssertEqual(image.height, Int(face.size.height * 2), type)
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

        let habit = document.createWidget(type: "habit", at: .zero, title: "H")!
        XCTAssertEqual(renderer("habit").restingFace(document.widget(habit)!), .metric(primary: "0/7", secondary: "This week", progress: 0))

        let status = document.createWidget(type: "status", at: .zero, title: "S")!
        XCTAssertEqual(renderer("status").restingFace(document.widget(status)!), .metric(primary: "Not started", secondary: "Status", progress: 0, tone: .muted))
        document.setSkin(status, value: "pipeline")
        guard case .chain(let steps, let shape, _, _) = renderer("status").restingFace(document.widget(status)!) else { return XCTFail("pipeline chain") }
        XCTAssertEqual(steps.map(\.label), ["Not start…", "In progre…", "Blocked", "Done"], "compacted to ten, as the web's chain nodes are")
        XCTAssertEqual(steps.map(\.current), [true, false, false, false])
        XCTAssertEqual(shape, .linear)
        document.setSkin(status, value: "progress")
        XCTAssertEqual(renderer("status").restingFace(document.widget(status)!), .gauge(progress: 0, primary: "0%", secondary: "Not started", caption: "Status", tone: .muted))

        let rating = document.createWidget(type: "rating", at: .zero, title: "R")!
        document.updateWidgetData(rating) { $0["value"] = .number(4) }
        XCTAssertEqual(renderer("rating").restingFace(document.widget(rating)!), .stars(value: 4))
        document.setSkin(rating, value: "emoji")
        guard case .text(let emoji, _) = renderer("rating").restingFace(document.widget(rating)!) else { return XCTFail("emoji text") }
        XCTAssertFalse(emoji.isEmpty)

        let mood = document.createWidget(type: "mood_tracker", at: .zero, title: "M")!
        XCTAssertEqual(renderer("mood_tracker").restingFace(document.widget(mood)!), .icon, "an unlogged week rests as an icon")

        let links = document.createWidget(type: "links", at: .zero, title: "L")!
        // Default data carries no `skin`, and the web's `data.skin === 'bookmark_grid'` then folds to rows.
        guard case .rows(let linkRows, _, _, _) = renderer("links").restingFace(document.widget(links)!) else { return XCTFail("link rows") }
        XCTAssertEqual(linkRows.map(\.label), ["grovepad"])
        XCTAssertEqual(linkRows.first?.value, "example.com")
        document.setSkin(links, value: "bookmark_grid")
        guard case .chips(let chips, _, _) = renderer("links").restingFace(document.widget(links)!) else { return XCTFail("bookmark chips") }
        XCTAssertEqual(chips.map(\.text), ["grovepad"])

        let poll = document.createWidget(type: "poll", at: .zero, title: "P")!
        guard case .rows(let pollRows, _, _, _) = renderer("poll").restingFace(document.widget(poll)!) else { return XCTFail("poll rows") }
        XCTAssertEqual(pollRows.map(\.value), ["—", "—"])

        let text = document.createWidget(type: "text_input", at: .zero, title: "T")!
        XCTAssertEqual(renderer("text_input").restingFace(document.widget(text)!), .icon)
        document.setField(text, "value", .text("hello"))
        XCTAssertEqual(renderer("text_input").restingFace(document.widget(text)!), .text(text: "hello"), "the words themselves")
        document.setSkin(text, value: "command")
        guard case .lines(let promptLines, let commandEyebrow, let commandMono, _) = renderer("text_input").restingFace(document.widget(text)!) else { return XCTFail("command lines") }
        XCTAssertEqual(promptLines.first?.left, "❯ hello")
        XCTAssertEqual(commandEyebrow?.label, "Command")
        XCTAssertTrue(commandMono)

        let metrics = document.createWidget(type: "metrics", at: .zero, title: "K")!
        guard case .rows(let tiles, _, _, _) = renderer("metrics").restingFace(document.widget(metrics)!) else { return XCTFail("metric rows") }
        XCTAssertEqual(tiles.map(\.value), ["↑128", "→3.2k"])

        let chart = document.createWidget(type: "bar_chart", at: .zero, title: "C")!
        guard case .chart(let stats, let series) = renderer("bar_chart").restingFace(document.widget(chart)!) else { return XCTFail("chart") }
        XCTAssertEqual(stats.map(\.label), ["Now", "Change"])
        XCTAssertEqual(stats.map(\.value), ["5", "+2"])
        XCTAssertNil(series, "the plot reads the card's own bars")
        document.setSkin(chart, value: "sparkline")
        guard case .chart(_, let history) = renderer("bar_chart").restingFace(document.widget(chart)!) else { return XCTFail("sparkline chart") }
        XCTAssertEqual(history?.count, BarChartWidget.bars(document.widget(chart)!.data).count, "a supplied series draws a line")
        document.setSkin(chart, value: "progress_ring")
        guard case .gauge = renderer("bar_chart").restingFace(document.widget(chart)!) else { return XCTFail("ring gauge") }

        let table = document.createWidget(type: "table", at: .zero, title: "Tb")!
        guard case .grid(let tableCols, let cells, let tableEyebrow, let tableHeader, let dense) = renderer("table").restingFace(document.widget(table)!) else { return XCTFail("table grid") }
        XCTAssertEqual(tableCols, 3)
        XCTAssertEqual(cells.count, 6, "two records across three columns")
        XCTAssertEqual(tableHeader?.count, 3)
        XCTAssertFalse(dense, "a text grid, not a lattice")
        XCTAssertEqual(tableEyebrow, RestEyebrow(label: "Table", note: "2×3"))

        let formula = document.createWidget(type: "formula", at: .zero, title: "F")!
        guard case .lines(let sum, let formulaEyebrow, let formulaMono, let formulaTotal) = renderer("formula").restingFace(document.widget(formula)!) else { return XCTFail("formula lines") }
        XCTAssertEqual(sum.count, 1)
        XCTAssertEqual(formulaTotal?.right, "0")
        XCTAssertTrue(formulaMono)
        XCTAssertEqual(formulaEyebrow?.label, "Result")

        let calculator = document.createWidget(type: "calculator", at: .zero, title: "=")!
        XCTAssertEqual(renderer("calculator").restingFace(document.widget(calculator)!), .icon)

        let date = document.createWidget(type: "date_picker", at: .zero, title: "D")!
        let reading = DateSkinModel.reading(document.widget(date)!.data)
        XCTAssertEqual(renderer("date_picker").restingFace(document.widget(date)!), .metric(primary: reading.phrase, secondary: DateSkinModel.mediumDayText(reading.day)))

        let calendar = document.createWidget(type: "calendar", at: .zero, title: "Cal")!
        guard case .grid(let cols, let days, let calendarEyebrow, let dayHeader, let denseMonth) = renderer("calendar").restingFace(document.widget(calendar)!) else { return XCTFail("month grid") }
        XCTAssertEqual(cols, 7)
        XCTAssertEqual(days.count, 42)
        XCTAssertEqual(dayHeader?.count, 7)
        XCTAssertTrue(denseMonth)
        XCTAssertEqual(days.filter(\.current).count, 1, "today is ringed")
        XCTAssertEqual(calendarEyebrow?.note, "2026")

        let time = document.createWidget(type: "timekeeper", at: .zero, title: "Tk")!
        XCTAssertEqual(renderer("timekeeper").restingFace(document.widget(time)!), .clock(shape: .dial), "the readout is read at paint time")
        XCTAssertEqual(TimekeeperClock.reading(document.widget(time)!.data, nowMs: FieldClock.nowMs())?.readout, "05:00")
        document.setSkin(time, value: "chess_clock")
        guard case .split(let leftSide, _, let divider, _) = renderer("timekeeper").restingFace(document.widget(time)!) else { return XCTFail("chess split") }
        XCTAssertEqual(divider, "vs")
        XCTAssertFalse(leftSide.primary.isEmpty)
        document.setSkin(time, value: "intervals")
        guard case .clock(let intervalShape, let intervalEyebrow, let pips, let plan) = renderer("timekeeper").restingFace(document.widget(time)!) else { return XCTFail("intervals clock") }
        XCTAssertEqual(intervalShape, .intervals)
        XCTAssertEqual(intervalEyebrow?.label, "Intervals")
        XCTAssertLessThanOrEqual(pips.count, RestingFaceMeasure.chipLimit)
        XCTAssertEqual(plan.count, 1)
    }

    // MARK: A tap and a wire agree

    func testHabitToggleWritesDaysAndStreakTogether() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "habit", at: .zero, title: "H"))
        document.updateWidgetData(id) { HabitWidget.write(&$0, days: [true, false, true, false, false, false, false], skin: "week_grid") }
        let data = document.widget(id)!.data
        XCTAssertEqual(data.number("streak"), 2)
        XCTAssertEqual(fieldDescriptor("habit", "streak")?.get(data), .number(2), "the port reads the same count")
        XCTAssertEqual(data.keys, ["label", "days", "streak", "skin"], "keys keep their order")
        XCTAssertEqual(HabitWidget.bestRun(HabitWidget.days(data)), 1)
        document.runCommand(id, "reset")
        XCTAssertEqual(document.widget(id)!.data.number("streak"), 0)
    }

    func testStatusChoosesThroughTheSetter() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "status", at: .zero, title: "S"))
        document.setField(id, "status", .text("blocked"))
        XCTAssertEqual(document.widget(id)!.data.string("value"), "blocked")
        document.setField(id, "status", .text("nonsense"))
        XCTAssertEqual(document.widget(id)!.data.string("value"), "blocked", "an illegal state is refused")
        XCTAssertEqual(fieldDescriptor("status", "progress")?.get(document.widget(id)!.data), .number(50))
        document.runCommand(id, "check_all")
        XCTAssertEqual(document.widget(id)!.data.string("value"), "done")
    }

    func testTextInputWritesThroughTheSetterAndKeepsSkinInStep() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "text_input", at: .zero, title: "T"))
        document.setSkin(id, value: "tags")
        let context = try XCTUnwrap(document.cardContext(for: document.widget(id)!))
        TextInputWidget.writeValue(context, skin: "tags", "alpha, beta, alpha")
        XCTAssertEqual(document.widget(id)!.data.string("value"), "alpha, beta, alpha", "the value is the canonical string")
        XCTAssertEqual(TextInputWidget.tags(document.widget(id)!.data.str("value")), ["alpha", "beta"], "the chips are a reading of it")
        XCTAssertEqual(document.widget(id)!.data.bool("multiline"), false)
        XCTAssertEqual(fieldDescriptor("text_input", "has_value")?.get(document.widget(id)!.data), .bool(true))
        XCTAssertEqual(TextInputWidget.withRun(["b"], "a"), ["a", "b"])
        XCTAssertTrue(TextInputWidget.link("https://example.com/x").valid)
        XCTAssertFalse(TextInputWidget.link("ftp://example.com").valid)
        XCTAssertTrue(TextInputWidget.email("me@example.com").valid)
    }

    func testFormulaInputsWriteThroughTheirSettersAndTheAnswerFollows() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "formula", at: .zero, title: "F"))
        let context = try XCTUnwrap(document.cardContext(for: document.widget(id)!))
        FormulaWidget.setValue(context, skin: "two_input", key: "a", 6)
        FormulaWidget.setValue(context, skin: "two_input", key: "b", 7)
        XCTAssertEqual(FormulaSkinModel.value(document.widget(id)!.data), 13)
        XCTAssertEqual(fieldDescriptor("formula", "result")?.get(document.widget(id)!.data), .number(13), "the card and the port read one answer")
        FormulaWidget.setValue(context, skin: "two_input", key: "c", 2)
        XCTAssertEqual(document.widget(id)!.data.number("inputCount"), 3, "writing an unopened slot opens it")
        XCTAssertEqual(document.widget(id)!.data.string("skin"), "two_input")
    }

    func testPollVotesAndOptionsGoThroughTheModel() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "poll", at: .zero, title: "P"))
        let first = PollSkinModel.options(document.widget(id)!.data["options"])[0].id
        document.updateWidgetData(id) { data in
            PollWidget.normalize(&data, skin: "bars")
            data = PollSkinModel.castVote(data, first)
        }
        XCTAssertEqual(fieldDescriptor("poll", "votes")?.get(document.widget(id)!.data), .number(1))
        XCTAssertEqual(fieldDescriptor("poll", "leader")?.get(document.widget(id)!.data), .text("Option A"))
        document.updateWidgetData(id) { $0 = PollSkinModel.addOption($0, id: "new-1") }
        XCTAssertEqual(PollSkinModel.options(document.widget(id)!.data["options"]).count, 3)
        document.updateWidgetData(id) { $0 = PollWidget.removeOption($0, "new-1") }
        XCTAssertEqual(PollSkinModel.options(document.widget(id)!.data["options"]).count, 2)
        XCTAssertEqual(document.widget(id)!.data.keys, ["skin", "question", "options"])
        document.runCommand(id, "reset")
        XCTAssertEqual(fieldDescriptor("poll", "votes")?.get(document.widget(id)!.data), .number(0))
    }

    func testCalendarMarksAreASortedSet() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "calendar", at: .zero, title: "C"))
        document.updateWidgetData(id) { CalendarWidget.writeMarked(&$0, ["2026-09-12", "2026-09-03", "2026-09-12"], skin: "month") }
        XCTAssertEqual(CalendarWidget.marked(document.widget(id)!.data), ["2026-09-03", "2026-09-12"])
        XCTAssertEqual(fieldDescriptor("calendar", "marked_count")?.get(document.widget(id)!.data), .number(2))
        XCTAssertEqual(document.widget(id)!.data.keys, ["year", "month", "markedDates", "skin"])
        let grid = CalendarWidget.monthGrid(year: 2026, month: 8)
        XCTAssertEqual(grid.count, 42)
        XCTAssertEqual(grid.first?.iso, "2026-08-31", "September 2026 starts on a Tuesday; the grid on the Monday before")
        XCTAssertEqual(CalendarWidget.weekDayKeys("2026-09-10").first, "2026-09-07")
    }

    func testRatingClampsToOneDecimalAndTheWireToWholeStars() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "rating", at: .zero, title: "R"))
        XCTAssertEqual(RatingWidget.clamp(4.26), 4.3)
        XCTAssertEqual(RatingWidget.clamp(.string("9")), 5)
        XCTAssertEqual(RatingWidget.format(3.5), "3.5")
        XCTAssertEqual(RatingWidget.npsScore(4.5), 9)
        XCTAssertEqual(RatingWidget.npsBand(9), "Promoter")
        document.setField(id, "value", .number(3.6))
        XCTAssertEqual(document.widget(id)!.data.number("value"), 4, "a wire rounds to whole stars")
        document.runCommand(id, "reset")
        XCTAssertEqual(document.widget(id)!.data.number("value"), 0)
    }

    func testCalculatorCommitEvaluatesWithTheSharedEvaluator() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "calculator", at: .zero, title: "="))
        let context = try XCTUnwrap(document.cardContext(for: document.widget(id)!))
        CalculatorWidget.commit(context, skin: "basic", "2*(3+4)")
        XCTAssertEqual(document.widget(id)!.data.string("result"), "14")
        XCTAssertEqual(fieldDescriptor("calculator", "result")?.get(document.widget(id)!.data), .number(14))
        CalculatorWidget.commit(context, skin: "basic", "2*(")
        XCTAssertEqual(document.widget(id)!.data.string("result"), "Error")
        CalculatorWidget.commit(context, skin: "basic", "")
        XCTAssertEqual(document.widget(id)!.data.string("result"), "")
        XCTAssertEqual(document.widget(id)!.data.keys, ["expression", "result", "skin"])
    }

    func testChartBarsAndTheSeriesPortAgree() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "bar_chart", at: .zero, title: "C"))
        let bars = BarChartWidget.bars(document.widget(id)!.data)
        XCTAssertEqual(bars.map(\.value), [3, 5])
        document.updateWidgetData(id) { data in
            data.patchRecord(in: "bars", id: bars[0].id) { $0["value"] = .number(9) }
            data["mode"] = .string("line")
        }
        XCTAssertEqual(fieldDescriptor("bar_chart", "total")?.get(document.widget(id)!.data), .number(14))
        XCTAssertEqual(fieldDescriptor("bar_chart", "latest")?.get(document.widget(id)!.data), .number(5))
        XCTAssertEqual(BarChartWidget.domain([2, 2]).min, 0, "zero is always in the domain")
        XCTAssertEqual(BarChartWidget.domain([2, 2]).max, 2)
        XCTAssertEqual(BarChartWidget.domain([2, 2], includeZero: false).max, 3, "a flat series is padded by max(1, 10%)")
        document.setField(id, "series", .series([SeriesPoint(t: 0, v: 1), SeriesPoint(t: 1, v: 2), SeriesPoint(t: 2, v: 3)]))
        XCTAssertEqual(BarChartWidget.bars(document.widget(id)!.data).map(\.value), [1, 2, 3])
    }

    func testTableCellsRowsAndColumns() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "table", at: .zero, title: "T"))
        let context = try XCTUnwrap(document.cardContext(for: document.widget(id)!))
        var rows = TableWidget.rows(document.widget(id)!.data)
        rows[1][2] = "12"
        rows[2][2] = "30"
        TableWidget.write(context, rows)
        let data = document.widget(id)!.data
        XCTAssertEqual(fieldDescriptor("table", "row_count")?.get(data), .number(2))
        let records = TableWidget.records(TableWidget.rows(data))
        XCTAssertEqual(TableWidget.numericColumn(records, columnCount: 3), 2)
        XCTAssertEqual(TableWidget.numeric("1,200"), 1200)
        XCTAssertEqual(TableWidget.headers([["", "b"]]), ["Column 1", "b"])
        document.setSkin(id, value: "compact_ledger")
        guard case .lines(let ledger, _, let ledgerMono, let ledgerTotal) = renderer("table").restingFace(document.widget(id)!) else { return XCTFail("ledger lines") }
        XCTAssertEqual(ledger.map(\.right), ["12", "30"], "each row's number, right-aligned")
        XCTAssertEqual(ledgerTotal, RestLine(key: "total", left: "Σ", right: "42", tone: .accent))
        XCTAssertTrue(ledgerMono)
    }

    func testMetricsTilesAndTheValuePortAgree() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "metrics", at: .zero, title: "K"))
        document.setField(id, "value_1", .number(256))
        XCTAssertEqual(MetricsWidget.tiles(document.widget(id)!.data)[0].value, "256")
        XCTAssertEqual(MetricsWidget.number("1.2k"), 1.2)
        XCTAssertEqual(MetricsWidget.number("98%"), 98)
        let first = MetricsWidget.tiles(document.widget(id)!.data)[0].id
        document.updateWidgetData(id) { $0.patchRecord(in: "tiles", id: first) { $0["trend"] = .string("down") } }
        XCTAssertEqual(MetricsWidget.tiles(document.widget(id)!.data)[0].trend, "down")
        XCTAssertEqual(document.widget(id)!.data.recordList("tiles")[0].keys, ["id", "label", "value", "unit", "trend"])
    }

    func testLinksAddThroughTheCommandAndReadHosts() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "links", at: .zero, title: "L"))
        document.runCommand(id, "add_item", mint: .counting(prefix: "new-"))
        let links = LinksWidget.links(document.widget(id)!.data)
        XCTAssertEqual(links.count, 2)
        XCTAssertEqual(links[1].label, "")
        XCTAssertEqual(links[1].url, "")
        XCTAssertEqual(LinksWidget.host(of: "https://www.example.com/path"), "example.com")
        XCTAssertEqual(LinksWidget.host(of: "not a url"), "")
        XCTAssertEqual(fieldDescriptor("links", "count")?.get(document.widget(id)!.data), .number(1))
    }

    func testMoodCyclesAndKeepsTheSkinPocket() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "mood_tracker", at: .zero, title: "M"))
        document.setSkin(id, value: "trend")
        XCTAssertEqual(MoodTrackerWidget.next(nil), 0)
        XCTAssertEqual(MoodTrackerWidget.next(4), nil)
        document.updateWidgetData(id) { data in
            var slots = MoodTrackerWidget.days(data)
            slots[2] = MoodTrackerWidget.next(slots[2])
            data["days"] = .array(slots.map { $0.map { .number(Double($0)) } ?? .null })
        }
        let data = document.widget(id)!.data
        XCTAssertEqual(MoodTrackerWidget.days(data), [nil, nil, 0, nil, nil, nil, nil])
        XCTAssertEqual(data.string("skin"), "trend", "the port keeps the skin the web's write would drop")
        XCTAssertEqual(fieldDescriptor("mood_tracker", "logged_count")?.get(data), .number(1))
        XCTAssertEqual(
            renderer("mood_tracker").restingFace(document.widget(id)!),
            .chart(stats: [RestStat(label: "Now", value: "☀️")], series: [5]),
            "the trend plots the logged week inverted, so a rising line is a better week"
        )
    }

    func testDatePickerWritesThroughTheNormalizedBase() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "date_picker", at: .zero, title: "D"))
        document.setSkin(id, value: "deadline")
        let context = try XCTUnwrap(document.cardContext(for: document.widget(id)!))
        var lead = JSONObject()
        lead["leadDays"] = .number(14)
        DatePickerWidget.patchState(context, skin: "deadline", lead)
        let data = document.widget(id)!.data
        XCTAssertEqual(DateSkinModel.deadlineLeadDays(data), 14)
        XCTAssertEqual(data.keys, ["label", "date", "time", "includeTime", "mode", "skinStates"])
        DatePickerWidget.patch(context, skin: "deadline") { $0["date"] = .string("2026-09-12") }
        XCTAssertEqual(fieldDescriptor("date_picker", "days_until")?.get(document.widget(id)!.data), .number(2), "two days after the frozen clock's day")
        XCTAssertEqual(renderer("date_picker").restingFace(document.widget(id)!), .metric(primary: "2", secondary: "Days left", progress: DateSkinModel.deadlineProgress(2, 14)))
    }

    func testTimekeeperReadsTheSharedClockAndWritesTheWebsPockets() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "timekeeper", at: .zero, title: "T"))
        let start = 1_789_000_000_000.0
        // Start the countdown the way the transport does.
        document.updateWidgetData(id) { data in
            var pocket = data.object("countdown")!
            pocket["endAt"] = .number(start + 300_000)
            data["countdown"] = .object(pocket)
        }
        var data = document.widget(id)!.data
        XCTAssertEqual(fieldDescriptor("timekeeper", "running")?.get(data), .bool(true), "the running port agrees with the tap")
        XCTAssertEqual(TimekeeperClock.reading(data, nowMs: start)?.readout, "05:00")
        XCTAssertEqual(TimekeeperClock.reading(data, nowMs: start + 61_000)?.readout, "03:59")
        XCTAssertTrue(TimekeeperClock.isRunning(data))

        // One shared clock beats for every card; a beat re-reads the dial.
        let clock = SharedClock(clock: .fixed(ms: start))
        XCTAssertFalse(clock.isRunning)
        clock.tick(nowMs: start + 120_000)
        XCTAssertEqual(TimekeeperClock.reading(data, nowMs: clock.nowMs)?.readout, "03:00")
        let stop = clock.start(every: 60)
        XCTAssertTrue(clock.isRunning)
        stop()
        stop()
        XCTAssertFalse(clock.isRunning, "the disposer is idempotent")

        document.runCommand(id, "reset")
        data = document.widget(id)!.data
        XCTAssertEqual(data.object("countdown")?["endAt"], .null)
        XCTAssertEqual(data.object("countdown")?.number("remainingSeconds"), 300)
        XCTAssertEqual(data.object("countdown")?.keys, ["label", "durationSeconds", "remainingSeconds", "endAt"], "the pocket keeps its key order")

        document.setSkin(id, value: "stopwatch")
        document.updateWidgetData(id) { data in
            var pocket = data.object("stopwatch")!
            pocket["startedAt"] = .number(start)
            data["stopwatch"] = .object(pocket)
        }
        XCTAssertEqual(TimekeeperClock.reading(document.widget(id)!.data, nowMs: start + 1_234)?.readout, "00:01.23")
        XCTAssertEqual(formatClock(3661), "1:01:01")
        XCTAssertEqual(formatStopwatch(61_234), "01:01.23")

        // `add_zone` through the Core command validates like a wire.
        document.setSkin(id, value: "world_clock")
        let context = try XCTUnwrap(document.cardContext(for: document.widget(id)!))
        context.update { data in
            data = commandsFor("timekeeper").first { $0.key == "add_zone" }!.run(data, .text("Asia/Dubai"), context.mint)
            data = commandsFor("timekeeper").first { $0.key == "add_zone" }!.run(data, .text("Not/AZone"), context.mint)
        }
        XCTAssertEqual(TimekeeperWidget.zones(document.widget(id)!.data), ["America/New_York", "Europe/London", "Asia/Tokyo", "Asia/Dubai"])
        XCTAssertEqual(TimekeeperWidget.zoneLabel("Asia/Kolkata"), "Mumbai")
        XCTAssertEqual(TimekeeperWidget.zoneLabel("Europe/Isle_of_Man"), "Isle of Man")
        XCTAssertEqual(TimekeeperWidget.zoneReading("Not/AZone", nowMs: start).time, "--:--")
    }

    func testWireWritesNeverRegisterUndo() throws {
        let (document, undo, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "status", at: .zero, title: "S"))
        undo.removeAllActions()
        document.applyWireWrites([id: ["value": "done"]])
        XCTAssertEqual(document.widget(id)?.data.string("value"), "done")
        XCTAssertFalse(undo.canUndo, "circuit law 3: wire writes register nothing")
    }
}
