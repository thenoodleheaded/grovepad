import XCTest
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// Widget groups against `glue.json`, which the web's `glueGeometry.ts`
/// generated over pinned Text cards and plain icons: seam insets, the
/// envelopes and title row, the ⌥-drag snap, pull-off, components, the
/// push and pull re-packs, gap closing, spreading, folding, unfolding and
/// reconcile — every number and every rewritten record byte for byte.
final class GlueConformanceTests: XCTestCase {
    // The web-generated fixtures use pinned cards as "never resting".
    override func setUp() {
        super.setUp()
    }

    override func tearDown() {
        super.tearDown()
    }

    private func pack() throws -> JSONValue { try ChromePack.json("glue.json") }

    private func widget(_ text: String) throws -> Widget {
        let value = try JSONParser.parse(Array(text.utf8))
        return Widget(record: try XCTUnwrap(value.objectValue))
    }

    private func widgets(_ value: JSONValue?) throws -> OrderedMap<Widget> {
        var map = OrderedMap<Widget>()
        for text in value?.arrayValue ?? [] {
            let w = try widget(try XCTUnwrap(text.stringValue))
            map[w.id] = w
        }
        return map
    }

    private func rect(_ value: JSONValue?) -> WorldRect? {
        guard let value, let x = value["x"]?.numberValue, let y = value["y"]?.numberValue,
              let width = value["width"]?.numberValue, let height = value["height"]?.numberValue else { return nil }
        return WorldRect(x: x, y: y, width: width, height: height)
    }

    private func strings(_ value: JSONValue?) -> [String] { value?.arrayValue?.compactMap(\.stringValue) ?? [] }

    /// Each widget's canonical bytes, keyed by id, against the pack's.
    private func assertRecords(_ actual: OrderedMap<Widget>, _ expected: JSONValue?, _ label: String, file: StaticString = #filePath, line: UInt = #line) throws {
        let object = try XCTUnwrap(expected?.objectValue, label)
        XCTAssertEqual(actual.keys, object.keys, "\(label): ids", file: file, line: line)
        for (id, text) in object.entries {
            XCTAssertEqual(actual[id].map { JSONWriter.stringify($0.json) }, text.stringValue, "\(label): \(id)", file: file, line: line)
        }
    }

    private func restoreText(_ map: GlueGeometry.RestoreMap) -> String {
        JSONWriter.stringify(GlueGeometry.restoreJSON(map))
    }

    func testPackIsPopulated() throws {
        let pack = try pack()
        XCTAssertEqual(pack["board"]?.arrayValue?.count, 6)
        XCTAssertEqual(pack["snaps"]?.arrayValue?.count, 7)
        XCTAssertEqual(pack["reflow"]?.arrayValue?.count, 3)
        XCTAssertEqual(pack["compact"]?.arrayValue?.count, 3)
        XCTAssertEqual(pack["layouts"]?.arrayValue?.count, 11)
        XCTAssertEqual(pack["reconcile"]?.arrayValue?.count, 3)
        XCTAssertEqual(pack["spread"]?.objectValue?.count, 6)
    }

    func testInsetsEnvelopesAndTitleRows() throws {
        let pack = try pack()
        let board = try widgets(pack["board"])
        for entry in pack["insets"]?.arrayValue ?? [] {
            let id = try XCTUnwrap(entry["id"]?.stringValue)
            let insets = GlueGeometry.memberInsets(id, memberIds: ["a", "b", "c"], widgets: board)
            XCTAssertEqual(insets.left, entry["insets"]?["left"]?.numberValue, "left \(id)")
            XCTAssertEqual(insets.right, entry["insets"]?["right"]?.numberValue, "right \(id)")
            XCTAssertEqual(insets.top, entry["insets"]?["top"]?.numberValue, "top \(id)")
            XCTAssertEqual(insets.bottom, entry["insets"]?["bottom"]?.numberValue, "bottom \(id)")
        }
        for entry in pack["iconInsets"]?.arrayValue ?? [] {
            let id = try XCTUnwrap(entry["id"]?.stringValue)
            let insets = GlueGeometry.memberInsets(id, memberIds: ["e", "f"], widgets: board)
            XCTAssertEqual([insets.left, insets.right, insets.top, insets.bottom],
                           ["left", "right", "top", "bottom"].map { entry["insets"]?[$0]?.numberValue ?? -1 }, "icon \(id)")
        }
        XCTAssertEqual(GlueGeometry.chromeEnvelope(["a", "b", "c"], widgets: board), rect(pack["chromeEnvelope"]))
        XCTAssertEqual(GlueGeometry.frameEnvelope(["a", "b", "c"], widgets: board), rect(pack["frameEnvelope"]))
        for entry in pack["titleRows"]?.arrayValue ?? [] {
            let name = entry["name"]?.stringValue
            XCTAssertEqual(GlueGeometry.titleRowRect(["a", "b", "c"], widgets: board, name: name), rect(entry["rect"]), "title row for \(name ?? "nil")")
        }
    }

    func testSnapPullOffAndComponents() throws {
        let pack = try pack()
        let board = try widgets(pack["board"])
        for probe in pack["snaps"]?.arrayValue ?? [] {
            var dragged = try XCTUnwrap(board[try XCTUnwrap(probe["id"]?.stringValue)])
            dragged.position = Vector2D(x: probe["x"]!.numberValue!, y: probe["y"]!.numberValue!)
            let snap = GlueGeometry.findSnap(dragged, widgets: board)
            let expected = probe["snap"]
            if expected == nil || expected == .null {
                XCTAssertNil(snap, "no bond at \(dragged.position)")
                continue
            }
            XCTAssertEqual(snap?.targetId, expected?["targetId"]?.stringValue, "target at \(dragged.position)")
            XCTAssertEqual(snap?.axis.rawValue, expected?["axis"]?.stringValue, "axis at \(dragged.position)")
            XCTAssertEqual(snap?.position.x, expected?["position"]?["x"]?.numberValue, "x at \(dragged.position)")
            XCTAssertEqual(snap?.position.y, expected?["position"]?["y"]?.numberValue, "y at \(dragged.position)")
        }
        for probe in pack["pulledFree"]?.arrayValue ?? [] {
            var a = board["a"]!
            a.position = Vector2D(x: probe["x"]!.numberValue!, y: probe["y"]!.numberValue!)
            XCTAssertEqual(GlueGeometry.pulledFreeOfCluster(a, memberIds: ["a", "b", "c"], widgets: board), probe["free"]?.boolValue)
        }
        let components = GlueGeometry.connectedComponents(["a", "b", "c", "d", "e", "f"], widgets: board)
        XCTAssertEqual(components, (pack["components"]?.arrayValue ?? []).map(strings))
    }

    private func boxes(_ value: JSONValue?) -> [WeldedBox] {
        (value?.arrayValue ?? []).map { WeldedBox(id: $0["id"]!.stringValue!, rect: rect($0["rect"])!) }
    }

    private func assertMoved(_ actual: OrderedMap<Vector2D>, _ expected: JSONValue?, _ label: String) {
        let object = expected?.objectValue ?? JSONObject()
        XCTAssertEqual(actual.keys, object.keys, "\(label): ids")
        for (id, point) in object.entries {
            XCTAssertEqual(actual[id]?.x, point["x"]?.numberValue, "\(label): \(id).x")
            XCTAssertEqual(actual[id]?.y, point["y"]?.numberValue, "\(label): \(id).y")
        }
    }

    func testReflowAndCompact() throws {
        let pack = try pack()
        let reflowBoxes = boxes(pack["reflowBoxes"])
        for entry in pack["reflow"]?.arrayValue ?? [] {
            let anchors = strings(entry["anchors"])
            assertMoved(GlueGeometry.reflowWeldedCluster(reflowBoxes, anchorIds: anchors), entry["moved"], "reflow \(anchors)")
        }
        let compactBoxes = boxes(pack["compactBoxes"])
        for entry in pack["compact"]?.arrayValue ?? [] {
            let anchors = strings(entry["anchors"])
            assertMoved(GlueGeometry.compactWeldedCluster(compactBoxes, anchorIds: anchors), entry["moved"], "compact \(anchors)")
        }
        for entry in pack["layouts"]?.arrayValue ?? [] {
            let count = Int(entry["count"]!.numberValue!)
            let layout = GlueGeometry.collapsedClusterLayout(count)
            XCTAssertEqual(layout.width, entry["width"]?.numberValue, "width \(count)")
            XCTAssertEqual(layout.height, entry["height"]?.numberValue, "height \(count)")
            XCTAssertEqual(layout.offsets.flatMap { [$0.x, $0.y] },
                           (entry["offsets"]?.arrayValue ?? []).flatMap { [$0["x"]!.numberValue!, $0["y"]!.numberValue!] }, "offsets \(count)")
        }
    }

    func testCloseGapsSpreadFoldAndReconcile() throws {
        let pack = try pack()
        let board = try widgets(pack["board"])
        let gapped = try widgets(pack["gapped"])
        for entry in pack["closeGaps"]?.arrayValue ?? [] {
            let anchors = strings(entry["anchors"])
            try assertRecords(GlueGeometry.closeClusterGaps(gapped, memberIds: ["a", "b", "c"], anchorIds: anchors), entry["widgets"], "closeGaps \(anchors)")
        }
        try assertRecords(GlueGeometry.spreadClusterMembers(board, memberIds: ["a", "b", "c"]), pack["spread"], "spread")

        let folded = GlueGeometry.refoldCollapsedCluster(board, memberIds: ["a", "b", "c"], existingRestore: nil, previousFoldedAt: nil)
        try assertRecords(folded.widgets, pack["refold"]?["widgets"], "refold")
        XCTAssertEqual(restoreText(folded.restore), pack["refold"]?["restore"]?.stringValue)
        XCTAssertEqual(folded.anchor.x, pack["refold"]?["anchor"]?["x"]?.numberValue)
        XCTAssertEqual(folded.anchor.y, pack["refold"]?["anchor"]?["y"]?.numberValue)

        // The folded block dragged 120 right, 80 up; `d` joins it.
        var dragged = folded.widgets
        for id in ["a", "b", "c"] {
            var w = dragged[id]!
            w.position = Vector2D(x: w.position.x + 120, y: w.position.y - 80)
            dragged[id] = w
        }
        let again = GlueGeometry.refoldCollapsedCluster(dragged, memberIds: ["a", "b", "c", "d"], existingRestore: folded.restore, previousFoldedAt: folded.anchor)
        try assertRecords(again.widgets, pack["refoldAgain"]?["widgets"], "refoldAgain")
        XCTAssertEqual(restoreText(again.restore), pack["refoldAgain"]?["restore"]?.stringValue)

        var glue = WidgetGlue(id: "g1", widgetIds: ["a", "b", "c"])
        glue.collapsed = true
        glue.record["restore"] = GlueGeometry.restoreJSON(folded.restore)
        glue.foldedAt = folded.anchor
        let released = GlueGeometry.unfoldReleasedFoldedMembers(dragged, previous: ["g1": glue], next: [:])
        try assertRecords(released, pack["unfoldReleased"], "unfoldReleased")

        var mixed = WidgetGlue(id: "g1", widgetIds: ["a", "b", "c", "d", "e", "f"])
        mixed.name = "Mixed"
        let glues: OrderedMap<WidgetGlue> = ["g1": mixed, "g2": WidgetGlue(id: "g2", widgetIds: ["a", "b"])]
        let reconciled = try XCTUnwrap(GlueGeometry.reconcile(board, glues: glues, mint: .counting(prefix: "uuid-")))
        XCTAssertEqual(reconciled.values.map { JSONWriter.stringify(.object($0.record)) }, strings(pack["reconcile"]))
    }
}
