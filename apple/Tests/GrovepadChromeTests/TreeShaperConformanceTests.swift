import XCTest
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// The tree shaper against `treeShaper.json`, which the web code generated:
/// icon packing and contours (`ghostTreePresentation.ts`), accent dashes,
/// the committed layout (`treeCommitLayout.ts`), and a shaping scenario
/// driven through the web store — every step's ghost nodes and the exact
/// records its commit writes.
final class TreeShaperConformanceTests: XCTestCase {
    private func pack() throws -> JSONValue { try ChromePack.json("treeShaper.json") }

    private func numbers(_ value: JSONValue?) -> [Double] { value?.arrayValue?.compactMap(\.numberValue) ?? [] }
    private func strings(_ value: JSONValue?) -> [String] { value?.arrayValue?.compactMap(\.stringValue) ?? [] }
    private func js(_ value: Double) -> String { JSNumberFormatter.string(value) }

    /// `roundedPolygonPath`'s SVG text from the port's contour.
    private func svg(_ contour: GhostContour?) -> String {
        guard let contour else { return "" }
        var path = "M \(js(contour.start.x)) \(js(contour.start.y))"
        for corner in contour.corners {
            path += " Q \(js(corner.control.x)) \(js(corner.control.y)) \(js(corner.end.x)) \(js(corner.end.y))"
            path += " L \(js(corner.lineTo.x)) \(js(corner.lineTo.y))"
        }
        return path + " Z"
    }

    func testIconGridsAndContours() throws {
        let grids = try XCTUnwrap(pack()["grids"]?.arrayValue)
        XCTAssertEqual(grids.count, 11)
        for expected in grids {
            let count = Int(try XCTUnwrap(expected["count"]?.numberValue))
            let grid = GhostTree.grid(count: count)
            XCTAssertEqual(Double(grid.columns), expected["columns"]?.numberValue, "columns for \(count)")
            XCTAssertEqual(Double(grid.rows), expected["rows"]?.numberValue, "rows for \(count)")
            XCTAssertEqual(grid.rowCounts.map(Double.init), numbers(expected["rowCounts"]), "rowCounts for \(count)")
            XCTAssertEqual(grid.width, expected["width"]?.numberValue, "width for \(count)")
            XCTAssertEqual(grid.height, expected["height"]?.numberValue, "height for \(count)")
            let placements = expected["placements"]?.arrayValue ?? []
            XCTAssertEqual(grid.placements.count, placements.count)
            for (actual, want) in zip(grid.placements, placements) {
                XCTAssertEqual(actual.x, want["x"]?.numberValue)
                XCTAssertEqual(actual.y, want["y"]?.numberValue)
            }
            XCTAssertEqual(svg(GhostTree.contour(grid)), expected["contour"]?.stringValue, "contour for \(count)")
        }
    }

    func testAccentDashes() throws {
        for expected in try XCTUnwrap(pack()["dashes"]?.arrayValue) {
            let index = Int(expected["index"]!.numberValue!), count = Int(expected["count"]!.numberValue!)
            let dash = GhostTree.accentDash(index: index, count: count)
            XCTAssertEqual(dash.pattern.map(js).joined(separator: " "), expected["dasharray"]?.stringValue)
            let offset = try XCTUnwrap(expected["dashoffset"]?.numberValue)
            let period = dash.pattern.reduce(0, +)
            XCTAssertEqual(dash.phase, (offset.truncatingRemainder(dividingBy: period) + period).truncatingRemainder(dividingBy: period), "phase \(index)/\(count)")
        }
    }

    func testCommittedLayout() throws {
        for input in try XCTUnwrap(pack()["commitLayouts"]?.arrayValue) {
            let nodes = (input["nodes"]?.arrayValue ?? []).map { node in
                TreeCommitNode(
                    id: node["id"]!.stringValue!, parentId: node["parentId"]?.stringValue, order: Int(node["order"]!.numberValue!),
                    widgetSizes: (node["widgetSizes"]?.arrayValue ?? []).map { Size(width: $0["width"]!.numberValue!, height: $0["height"]!.numberValue!) }
                )
            }
            let placements = TreeCommitLayout.layout(nodes, originX: input["originX"]!.numberValue!, originY: input["originY"]!.numberValue!)
            let expected = input["placements"]?.arrayValue ?? []
            XCTAssertEqual(placements.count, expected.count)
            for (actual, want) in zip(placements, expected) {
                XCTAssertEqual(actual.nodeId, want["nodeId"]?.stringValue)
                let positions = want["widgetPositions"]?.arrayValue ?? []
                XCTAssertEqual(actual.widgetPositions.count, positions.count, actual.nodeId)
                for (position, target) in zip(actual.widgetPositions, positions) {
                    XCTAssertEqual(position.x, target["x"]?.numberValue, actual.nodeId)
                    XCTAssertEqual(position.y, target["y"]?.numberValue, actual.nodeId)
                }
            }
        }
    }

    private func assertNodes(_ actual: [GhostTreeNode], _ expected: JSONValue?, _ label: String, file: StaticString = #filePath, line: UInt = #line) {
        let want = expected?.arrayValue ?? []
        XCTAssertEqual(actual.count, want.count, "\(label): node count", file: file, line: line)
        for (node, target) in zip(actual, want) {
            XCTAssertEqual(node.id, target["id"]?.stringValue, "\(label): id", file: file, line: line)
            XCTAssertEqual(node.parentId, target["parentId"]?.stringValue, "\(label): parent of \(node.id)", file: file, line: line)
            XCTAssertEqual(Double(node.order), target["order"]?.numberValue, "\(label): order of \(node.id)", file: file, line: line)
            XCTAssertEqual(node.x, target["x"]?.numberValue, "\(label): x of \(node.id)", file: file, line: line)
            XCTAssertEqual(node.y, target["y"]?.numberValue, "\(label): y of \(node.id)", file: file, line: line)
            XCTAssertEqual(node.widgetTypes, strings(target["widgetTypes"]), "\(label): types of \(node.id)", file: file, line: line)
        }
    }

    /// Replays the web store's scenario through `TreeShaperModel`, then
    /// commits into a document on the same canvas id with the same id rule.
    func testShapingScenarioAndCommitBytes() throws {
        let scenario = try XCTUnwrap(pack()["scenario"])
        let steps = try XCTUnwrap(scenario["steps"]?.arrayValue)
        let shaper = TreeShaperModel(mint: .counting())
        shaper.start(at: Vector2D(x: scenario["origin"]!["x"]!.numberValue!, y: scenario["origin"]!["y"]!.numberValue!))
        assertNodes(shaper.config?.nodes ?? [], steps[0]["nodes"], "start")

        var index = 1
        while index < steps.count {
            let step = steps[index]
            let label = "step \(index) \(step["op"]?.stringValue ?? "")"
            let nodes = shaper.config?.nodes ?? []
            switch step["op"]?.stringValue {
            case "shape":
                // Steps sharing a `gesture` number are one drag (absolute from its base).
                let nodeIndex = Int(step["node"]!.numberValue!)
                let direction = GhostShapeDirection(rawValue: step["direction"]!.stringValue!)!
                let nodeId = nodes[nodeIndex].id
                shaper.beginGesture()
                repeat {
                    let current = steps[index]
                    shaper.shape(nodeId, direction: direction, steps: Int(current["steps"]!.numberValue!))
                    assertNodes(shaper.config?.nodes ?? [], current["nodes"], "step \(index) shape")
                    index += 1
                } while index < steps.count && steps[index]["gesture"]?.numberValue == step["gesture"]?.numberValue
                shaper.endGesture()
                continue
            case "setTypes":
                shaper.setWidgetTypes(nodes[Int(step["node"]!.numberValue!)].id, strings(step["types"]))
            case "addTypes":
                shaper.addWidgetTypes(numbers(step["targets"]).map { nodes[Int($0)].id }, strings(step["types"]))
            default:
                XCTFail("unknown op in \(label)")
            }
            assertNodes(shaper.config?.nodes ?? [], step["nodes"], label)
            index += 1
        }

        let commit = try XCTUnwrap(scenario["commit"])
        let canvasId = try XCTUnwrap(commit["canvasId"]?.stringValue)
        var board = Board()
        board.workspaces["ws"] = Workspace(id: "ws", name: "Workspace", rootCanvasId: canvasId, createdAt: 1_789_000_000_000)
        board.canvases[canvasId] = CanvasMeta(id: canvasId, name: "Root", workspaceId: "ws", parentCanvasId: nil)
        board.activeWorkspaceId = "ws"
        board.activeCanvasId = canvasId
        let (document, undo, _) = makeDocument(board: board)
        XCTAssertEqual(shaper.config?.originX, commit["originX"]?.numberValue)
        XCTAssertEqual(shaper.config?.originY, commit["originY"]?.numberValue)

        let created = try XCTUnwrap(shaper.commit(into: document, mint: .counting()))
        XCTAssertFalse(shaper.isActive, "the shaper closes on commit")
        XCTAssertEqual(created, strings(commit["selection"]))
        XCTAssertEqual(document.selection, strings(commit["selection"]))
        XCTAssertEqual(document.board.widgets.values.map { JSONWriter.stringify(.object($0.record)) }, strings(commit["widgets"]))
        XCTAssertEqual(document.board.glues.values.map { JSONWriter.stringify(.object($0.record)) }, strings(commit["glues"]))
        XCTAssertEqual(document.board.relations.values.map { JSONWriter.stringify(.object($0.record)) }, strings(commit["relations"]))

        XCTAssertTrue(undo.canUndo)
        document.undo()
        XCTAssertTrue(document.board.widgets.isEmpty, "Create Tree is one undo step")
        XCTAssertTrue(document.board.glues.isEmpty)
        XCTAssertTrue(document.board.relations.isEmpty)
    }

}
