import XCTest
import SwiftUI
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// The grammars added in the polish pass — text, clock, chart, stars,
/// columns, the richer grid, bars, gauge, lines, chain, split — each
/// measured to the web's `modelSize` rule for a representative model (the
/// 6.2 pt/char estimate stands in for the canvas measurement; every tile is
/// grid-snapped and bounded), and each rendered to a non-empty bitmap at the
/// tile it was measured for. The sparkline geometry is checked for its mark
/// ceiling. The catalogue dress is checked for the new headings.
final class RestingFaceGrammarTests: XCTestCase {
    private let box = Size(width: 240, height: 160)

    private func size(_ model: RestingFaceModel) -> Size {
        RestingFaceMeasure.size(of: model, widgetSize: box)
    }

    /// A month-like run of dense cells: every fifth day marked, the fourth "today".
    static func denseCells(_ count: Int) -> [RestCell] {
        var cells: [RestCell] = []
        for index in 0..<count {
            let fill: Double? = index % 5 == 0 ? 0.6 : nil
            let tone: RestTone? = index % 4 == 0 ? nil : .muted
            cells.append(RestCell(key: "d\(index)", text: String(index + 1), tone: tone, fill: fill, current: index == 3))
        }
        return cells
    }

    static func pips(_ count: Int, lit: Int) -> [RestChip] {
        var chips: [RestChip] = []
        for index in 0..<count {
            chips.append(RestChip(key: "r\(index)", text: String(index + 1), tone: .muted, filled: index < lit))
        }
        return chips
    }

    static func nodes(_ count: Int, prefix: String, captioned: Bool) -> [RestNode] {
        var nodes: [RestNode] = []
        for index in 0..<count {
            let caption: String? = captioned ? String(index) : nil
            nodes.append(RestNode(key: "n\(index)", label: "\(prefix) \(index)", caption: caption, current: index == 1))
        }
        return nodes
    }

    private func onGrid(_ size: Size, _ message: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(size.width.truncatingRemainder(dividingBy: CanvasGeometry.gridSize), 0, "\(message): width on the grid", file: file, line: line)
        XCTAssertEqual(size.height.truncatingRemainder(dividingBy: CanvasGeometry.gridSize), 0, "\(message): height on the grid", file: file, line: line)
    }

    // MARK: - Sizes

    func testTextMeasuresToItsLinesAndClampsAtSix() {
        // "hello": 31 pt of text on one line → 55 wide, 34 tall, snapped.
        XCTAssertEqual(size(.text(text: "hello")), Size(width: 80, height: 40))
        // Sixty characters wrap onto two 216 pt lines inside the 240 ceiling.
        let sixty = String(repeating: "abcdef", count: 10)
        XCTAssertEqual(size(.text(text: sixty)), Size(width: 240, height: 80))
        // Four hundred characters would be twelve lines; the tile stops at six.
        let long = String(repeating: "abcdefghij", count: 40)
        XCTAssertEqual(size(.text(text: long)), Size(width: 240, height: 120))
    }

    func testClockDialIsSquareAndTheOtherShapesStack() {
        XCTAssertEqual(size(.clock(shape: .dial)), Size(width: 120, height: 120), "three cells square, room for the readout inside the bezel")
        let chips = (0..<8).map { RestChip(key: "round-\($0)", text: String($0 + 1), tone: .muted, filled: $0 < 1) }
        let intervals = RestingFaceModel.clock(
            shape: .intervals,
            eyebrow: RestEyebrow(label: "Intervals", note: "Work 1/8", tone: .bad),
            chips: chips,
            rows: [RestRow(key: "plan", label: "5:00 on", value: "0:30 off", tone: .muted)]
        )
        // Eight pips run 180 pt wide; 20 + 14 + 28 + 21 + 16 = 99 tall.
        XCTAssertEqual(size(intervals), Size(width: 240, height: 120))
        let hourglass = RestingFaceModel.clock(shape: .hourglass, eyebrow: RestEyebrow(label: "Quiet timer", note: "Ready"))
        // Nothing hangs off the readout: the readout's own 92 pt floor, 20 + 14 + 28 tall.
        XCTAssertEqual(size(hourglass), Size(width: 160, height: 80))
    }

    func testStarsAndChartAreFixedTiles() {
        XCTAssertEqual(size(.stars(value: 3)), Size(width: 120, height: 40), "five 16 pt stars with 4 pt gaps inside the padding")
        XCTAssertEqual(size(.chart(stats: [RestStat(label: "Now", value: "5")])), Size(width: 240, height: 80), "140 of plot plus the 64 pt rail, two cells tall")
        XCTAssertEqual(size(.chart(stats: [], series: [1, 2, 3])), Size(width: 240, height: 80), "the plot claims its width whether or not the rail has readouts")
    }

    func testGaugeMeasuresTheDialBesideItsText() {
        let gauge = RestingFaceModel.gauge(progress: 0.72, primary: "72%", secondary: "Progress")
        // 46 dial + 10 + 42.16 of caps → 98.16 + padding → 160 wide; 20 + 46 tall → 80.
        XCTAssertEqual(size(gauge), Size(width: 160, height: 80))
        let dressed = gauge.wearingEyebrow(RestEyebrow(label: "Ring"))
        XCTAssertEqual(dressed, gauge, "a gauge is a single reading and never takes a heading")
        let captioned = RestingFaceModel.gauge(progress: 0.5, primary: "12h", secondary: "Maths", caption: "of 24h", tone: .accent, eyebrow: RestEyebrow(label: "Hours"))
        // The caption (31.62) is the widest text: 46 + 10 + 31.62 → 111.6 → 120;
        // the eyebrow's 14 pt still fits inside the second cell.
        XCTAssertEqual(size(captioned), Size(width: 120, height: 80))
    }

    func testSplitMeasuresBothSidesAndTheDivider() {
        let split = RestingFaceModel.split(
            left: RestReadout(primary: "12", secondary: "Was"),
            right: RestReadout(primary: "15", secondary: "Now", tone: .good),
            divider: "→"
        )
        // 17.36 + 19.44 + 17.36 + padding = 78.16 → 80; 20 + 30 → 80 (never one cell).
        XCTAssertEqual(size(split), Size(width: 80, height: 80))
        let wide = RestingFaceModel.split(
            left: RestReadout(primary: "1:23:45", secondary: "Player one"),
            right: RestReadout(primary: "0:59:59", secondary: "Player two"),
            divider: "vs",
            eyebrow: RestEyebrow(label: "Chess clock", note: "Running")
        )
        // Two 60.76 pt readouts either side of a 26.88 pt "vs" → 172.4 → 200.
        XCTAssertEqual(size(wide), Size(width: 200, height: 80))
    }

    func testLinesMeasureTheLedgerAndItsTotal() {
        let lines = RestingFaceModel.lines(
            lines: [RestLine(key: "sum", left: "2 + 3", dim: true)],
            eyebrow: RestEyebrow(label: "Result"),
            mono: true,
            total: RestLine(key: "result", left: "=", right: "5", tone: .accent)
        )
        // The eyebrow (37 pt) is the widest thing; 20 + 14 + 13 + 18 = 65 tall.
        XCTAssertEqual(size(lines), Size(width: 80, height: 80))
        let five = RestingFaceModel.lines(lines: (0..<5).map { RestLine(key: "l\($0)", left: "line \($0)") })
        XCTAssertEqual(size(five), Size(width: 80, height: 120), "five 13 pt lines run past the second cell")
        XCTAssertEqual(size(.lines(lines: [])), Size(width: 40, height: 40), "an empty ledger still measures one line")
    }

    func testBarsMeasureTheWidestLabelAgainstTheTrackFloor() {
        let bars = RestingFaceModel.bars(bars: [
            RestBar(key: "exams", label: "Exams", value: "90%", fraction: 0.9, tone: .good),
            RestBar(key: "labs", label: "Labs", value: "0%", fraction: 0, tone: .bad),
        ])
        // Widest row 57.6 pt, under the 78 pt track floor → 102 → 120; 20 + 32 → 80.
        XCTAssertEqual(size(bars), Size(width: 120, height: 80))
        let four = RestingFaceModel.bars(bars: (0..<4).map { RestBar(key: "b\($0)", label: "Bar \($0)", value: "1", fraction: 0.5) }, eyebrow: RestEyebrow(label: "Grade", note: "45%"))
        XCTAssertEqual(size(four), Size(width: 120, height: 120))
    }

    func testChainMeasuresNodesAlongOrDownTheTile() {
        let nodes = ["Not start…", "In progre…", "Blocked", "Done"].enumerated().map { RestNode(key: "n\($0.offset)", label: $0.element, current: $0.offset == 0) }
        let linear = RestingFaceModel.chain(nodes: nodes, shape: .linear, overflow: 0)
        // 4 × 46 + 3 × 12 = 220 → 244 → 280; 20 + 30 → 80.
        XCTAssertEqual(size(linear), Size(width: 280, height: 80))
        XCTAssertEqual(size(.chain(nodes: nodes, shape: .circular, overflow: 0)), Size(width: 280, height: 80), "the return arc's 10 pt still fits")
        XCTAssertEqual(size(.chain(nodes: nodes, shape: .doubly, overflow: 2)), Size(width: 280, height: 80), "+2 adds a connector and 18 pt")
        let stack = RestingFaceModel.chain(nodes: nodes.prefix(3).map { RestNode(key: $0.key, label: "Alpha") }, shape: .stack, overflow: 0)
        XCTAssertEqual(size(stack), Size(width: 80, height: 80), "a stack reads down like rows")
        let eight = (0..<8).map { RestNode(key: "n\($0)", label: "Step \($0)") }
        XCTAssertLessThanOrEqual(size(.chain(nodes: eight, shape: .linear, overflow: 0)).width, RestingFaceMeasure.maxWideTile, "the wide ceiling holds")
    }

    func testColumnsMeasureBandsAsWideAsTheirMembersAndAsTallAsTheirFullest() {
        let items = (0..<3).map { RestRow(key: "i\($0)", label: "Task one") }
        let columns = [
            RestColumn(key: "todo", label: "Todo", items: items, overflow: 0),
            RestColumn(key: "done", label: "Done", items: items, overflow: 0),
        ]
        // Each column 53.65 pt: 107.3 + 6 → 137 → 160; 13 + 39 → 72 → 80.
        XCTAssertEqual(size(.columns(columns: columns)), Size(width: 160, height: 80))
        // wrap 1 stacks the same two columns: 80 wide, 2 × 52 + 6 → 130 → 160.
        XCTAssertEqual(size(.columns(columns: columns, wrap: 1)), Size(width: 80, height: 160))
        XCTAssertEqual(size(.columns(columns: [])), Size(width: 40, height: 40), "no lanes is still a tile")
    }

    func testGridMeasuresTextColumnsFromTheirWidestCellAndDenseCellsAsSquares() {
        let table = RestingFaceModel.grid(
            cols: 2,
            cells: [RestCell(key: "a", text: "Apples"), RestCell(key: "b", text: "3", tone: .muted), RestCell(key: "c", text: "Pears"), RestCell(key: "d", text: "12", tone: .muted)],
            eyebrow: nil, header: ["Name", "Qty"], dense: false
        )
        // Columns 37.2 + 18.6 + 8 = 63.8 → 88 → 120; 20 + 14 + 28 → 80.
        XCTAssertEqual(size(table), Size(width: 120, height: 80))
        let week = RestingFaceGrammarTests.denseCells(21)
        XCTAssertEqual(size(.grid(cols: 7, cells: week)), Size(width: 160, height: 80), "7 × 15 + 6 × 2 = 117 → 141 → 160; 20 + 45 + 4 → 80")
        XCTAssertEqual(size(.grid(cols: 7, cells: week, header: ["M", "T", "W", "T", "F", "S", "S"])), Size(width: 160, height: 120), "the header row adds a cell's height")
        XCTAssertLessThanOrEqual(size(.grid(cols: 24, cells: (0..<48).map { RestCell(key: "c\($0)", text: "") })).width, RestingFaceMeasure.maxWideTile)
    }

    func testFaceKeepsTheTitleCapsuleFloorAndTheTasksShrink() {
        let face = RestingFaceMeasure.face(.stars(value: 2), type: "rating", title: "A rather long widget name", widgetSize: box)
        XCTAssertEqual(face.size.height, 40)
        XCTAssertGreaterThan(face.size.width, 120, "never narrower than its own name")
        onGrid(face.size, "stars under a long title")
        let tasks = RestingFaceMeasure.face(.columns(columns: [RestColumn(key: "a", label: "Backlog", items: [RestRow(key: "i", label: "Write tests")], overflow: 0)]), type: "checklist", title: "T", widgetSize: box)
        onGrid(tasks.size, "a Tasks board a tenth smaller")
    }

    // MARK: - Bounds

    func testSparklineSamplesToTheMarkCeilingAndKeepsBothEnds() {
        let values = (0..<200).map(Double.init)
        let line = RestSparkline.linePoints(values, width: 100, height: 40)
        XCTAssertEqual(line.count, RestingFaceMeasure.markSampleLimit)
        XCTAssertEqual(line.first, CGPoint(x: 0, y: 40), "the first point sits on the floor of a rising series")
        XCTAssertEqual(line.last, CGPoint(x: 100, y: 0))
        let flat = RestSparkline.linePoints([3, 3, 3], width: 100, height: 40)
        XCTAssertEqual(Set(flat.map(\.y)), [20], "a flat series sits on the mid-line")
        let bars = RestSparkline.bars(values.map { RestSparkline.Point(value: $0) }, width: 100, height: 40)
        XCTAssertEqual(bars.count, RestingFaceMeasure.markSampleLimit)
        let mixed = RestSparkline.bars([RestSparkline.Point(value: -2), RestSparkline.Point(value: 2)], width: 20, height: 40)
        XCTAssertEqual(mixed.map(\.y), [20, 0], "bars grow from the zero baseline in both directions")
        let ring = RestSparkline.donut([RestSparkline.Point(value: 1), RestSparkline.Point(value: -5), RestSparkline.Point(value: 3)])
        XCTAssertEqual(ring.map(\.fraction), [0.25, 0.75], "negatives take no arc")
        XCTAssertEqual(ring.last?.offset, 0.25)
    }

    func testChartStatsReadNowChangeAndPeak() {
        XCTAssertEqual(RestText.chartStats([3, 5], unit: "").map(\.value), ["5", "+2"])
        XCTAssertEqual(RestText.chartStats([8, 2, 5], unit: "%").map { "\($0.label)=\($0.value)" }, ["Now=5%", "Change=−3%", "Peak=8%"])
        XCTAssertEqual(RestText.chartStats([4], unit: "").map(\.label), ["Now"], "one point has no change")
        XCTAssertEqual(RestText.chartStats([], unit: ""), [])
    }

    func testCatalogueDressHeadsTheNewGrammarsButNotSingleReadings() {
        let name = RestEyebrow(label: "Tape")
        XCTAssertEqual(RestingFaceModel.lines(lines: [], mono: true).wearingEyebrow(name).eyebrow, name)
        XCTAssertEqual(RestingFaceModel.chain(nodes: [], shape: .linear, overflow: 0).wearingEyebrow(name).eyebrow, name)
        XCTAssertEqual(RestingFaceModel.bars(bars: []).wearingEyebrow(name).eyebrow, name)
        XCTAssertEqual(RestingFaceModel.columns(columns: []).wearingEyebrow(name).eyebrow, name)
        XCTAssertEqual(RestingFaceModel.split(left: RestReadout(primary: "1", secondary: "a"), right: RestReadout(primary: "2", secondary: "b")).wearingEyebrow(name).eyebrow, name)
        XCTAssertEqual(RestingFaceModel.clock(shape: .laps).wearingEyebrow(name).eyebrow, name)
        let kept = RestEyebrow(label: "Mine")
        XCTAssertEqual(RestingFaceModel.bars(bars: [], eyebrow: kept).wearingEyebrow(name).eyebrow, kept, "an eyebrow of its own is kept")
        XCTAssertNil(RestingFaceModel.text(text: "words").wearingEyebrow(name).eyebrow)
        XCTAssertNil(RestingFaceModel.stars(value: 1).wearingEyebrow(name).eyebrow)
        XCTAssertNil(RestingFaceModel.chart(stats: []).wearingEyebrow(name).eyebrow)
        XCTAssertEqual(RestingFaceModel.clock(shape: .dial).wearingEyebrow(name).eyebrow, name, "a dial takes the name like any clock; its square tile and centred readout ignore it, as the web's do")
    }

    // MARK: - Renders

    #if canImport(AppKit)
    /// Distinct pixel values across a coarse sample of the bitmap: a blank
    /// tile has one, a drawn face has many.
    private func variety(_ image: CGImage) -> Int {
        guard let data = image.dataProvider?.data, let bytes = CFDataGetBytePtr(data) else { return 0 }
        let stride = image.bytesPerRow
        let step = max(1, min(image.width, image.height) / 24)
        var seen = Set<UInt32>()
        for y in Swift.stride(from: 0, to: image.height, by: step) {
            for x in Swift.stride(from: 0, to: image.width, by: step) {
                let offset = y * stride + x * 4
                seen.insert(UInt32(bytes[offset]) | UInt32(bytes[offset + 1]) << 8 | UInt32(bytes[offset + 2]) << 16)
            }
        }
        return seen.count
    }

    func testEveryNewGrammarRendersANonEmptyBitmapAtItsMeasuredTile() throws {
        FieldClock.now = .conformance
        defer { FieldClock.reset() }
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "timekeeper", at: .zero, title: "Tk"))
        let widget = document.widget(id)!
        let definition = try XCTUnwrap(WidgetRegistry.definition(for: "timekeeper"))
        var models: [(String, RestingFaceModel)] = []
        models.append(("text", .text(text: "The words themselves, clamped to six lines of ten-point type.")))
        models.append(("clock dial", .clock(shape: .dial)))
        let plan = RestRow(key: "plan", label: "5:00 on", value: "0:30 off", tone: .muted)
        models.append(("clock intervals", .clock(shape: .intervals, eyebrow: RestEyebrow(label: "Intervals", note: "Work 1/8"), chips: RestingFaceGrammarTests.pips(8, lit: 2), rows: [plan])))
        let set = RestRow(key: "set", label: "Set for", value: "5:00", tone: .muted)
        models.append(("clock hourglass", .clock(shape: .hourglass, eyebrow: RestEyebrow(label: "Quiet timer", note: "Ready"), rows: [set])))
        let stats = [RestStat(label: "Now", value: "5"), RestStat(label: "Change", value: "+2")]
        models.append(("chart", .chart(stats: stats, series: [3, 1, 4, 1, 5])))
        models.append(("stars", .stars(value: 3)))
        let todo = RestColumn(key: "a", label: "Todo", note: "2", items: [RestRow(key: "i", label: "Write"), RestRow(key: "j", label: "Ship", done: true)], overflow: 1)
        let done = RestColumn(key: "b", label: "Done", tone: .good, items: [RestRow(key: "k", label: "Plan", value: "3")], overflow: 0)
        models.append(("columns", .columns(columns: [todo, done], wrap: nil, eyebrow: RestEyebrow(label: "Board"))))
        let tableCells = [RestCell(key: "a", text: "Apples"), RestCell(key: "b", text: "3", tone: .muted)]
        models.append(("grid text", .grid(cols: 2, cells: tableCells, eyebrow: RestEyebrow(label: "Table", note: "1×2"), header: ["Name", "Qty"], dense: false)))
        let dayHeader = ["M", "T", "W", "T", "F", "S", "S"]
        models.append(("grid dense", .grid(cols: 7, cells: RestingFaceGrammarTests.denseCells(21), eyebrow: RestEyebrow(label: "September", note: "2026"), header: dayHeader)))
        let exams = RestBar(key: "a", label: "Exams", value: "90%", fraction: 0.9, tone: .good)
        let labs = RestBar(key: "b", label: "Labs", value: "20%", fraction: 0.2, tone: .bad)
        models.append(("bars", .bars(bars: [exams, labs], eyebrow: RestEyebrow(label: "Grade", note: "45%"))))
        models.append(("gauge", .gauge(progress: 0.72, primary: "72%", secondary: "Progress", caption: "28% to go", tone: .accent, eyebrow: RestEyebrow(label: "Ring"))))
        let ledger = [RestLine(key: "a", left: "2 + 3", dim: true), RestLine(key: "b", left: "x", right: "4", tone: .accent)]
        let total = RestLine(key: "t", left: "=", right: "5", tone: .accent)
        models.append(("lines", .lines(lines: ledger, eyebrow: RestEyebrow(label: "Result"), mono: true, total: total)))
        models.append(("chain circular", .chain(nodes: RestingFaceGrammarTests.nodes(4, prefix: "Step", captioned: true), shape: .circular, overflow: 2, eyebrow: RestEyebrow(label: "Pipeline"))))
        models.append(("chain stack", .chain(nodes: RestingFaceGrammarTests.nodes(3, prefix: "Layer", captioned: true), shape: .stack, overflow: 1)))
        let was = RestReadout(primary: "12", secondary: "Was")
        let now = RestReadout(primary: "15", secondary: "Now", tone: .good)
        models.append(("split", .split(left: was, right: now, divider: "→", eyebrow: RestEyebrow(label: "Percent change", note: "+25%", tone: .good))))
        for (name, model) in models {
            let face = RestingFaceMeasure.face(model, type: widget.type, title: widget.title, widgetSize: widget.size)
            onGrid(face.size, name)
            let context = WidgetRestContext(widget: widget, definition: definition, face: face, canvasName: { _ in nil })
            let image = try XCTUnwrap(WidgetBitmapProvider.render(WidgetRestingFaceView(context: context), scale: 1), "\(name) renders")
            XCTAssertEqual(image.width, Int(face.size.width), "\(name) bitmap is the measured tile")
            XCTAssertEqual(image.height, Int(face.size.height), name)
            XCTAssertGreaterThan(variety(image), 1, "\(name) draws something on the tile")
        }
    }
    #endif
}
