import XCTest
@testable import GrovepadCore

/// `device.json`: every resolve case (current payload, legacy fallback,
/// dropped tabs, malformed input) resolves to the same navigation state the
/// web produced and serializes to the same bytes.
final class DeviceStateConformanceTests: XCTestCase {
    func testEveryDeviceCaseMatchesThePack() throws {
        let pack = try ConformancePack.object("device.json")
        let cases = pack.array("cases") ?? []
        XCTAssertGreaterThan(cases.count, 5)
        for item in cases {
            guard let entry = item.objectValue, let name = entry.string("name") else { return XCTFail("malformed device case") }
            let topology = try XCTUnwrap(entry.object("topology"), "\(name): topology")
            var workspaces = OrderedMap<Workspace>()
            for (id, record) in (topology.object("workspaces") ?? JSONObject()).entries {
                workspaces[id] = Workspace(record: try XCTUnwrap(record.objectValue))
            }
            var canvases = OrderedMap<CanvasMeta>()
            for (id, record) in (topology.object("canvases") ?? JSONObject()).entries {
                canvases[id] = CanvasMeta(record: try XCTUnwrap(record.objectValue))
            }
            // `raw: input.raw ?? null` — the generator wrote null for an absent payload.
            let raw = entry["raw"]
            let resolved = DeviceStateCodec.resolvePersistedDeviceState(
                raw, workspaces: workspaces, canvases: canvases,
                legacyFallback: entry.object("legacyFallback"), mint: .counting()
            )
            let expected = try XCTUnwrap(entry.object("resolved"), "\(name): resolved")
            XCTAssertEqual(resolved.activeWorkspaceId, expected.string("activeWorkspaceId"), "\(name): activeWorkspaceId")
            XCTAssertEqual(resolved.activeCanvasId, expected.string("activeCanvasId"), "\(name): activeCanvasId")
            XCTAssertEqual(resolved.activeTabId, expected.string("activeTabId"), "\(name): activeTabId")
            let expectedTabs = (expected.array("openTabs") ?? []).compactMap { tab -> CanvasTab? in
                guard let id = tab["id"]?.stringValue, let canvasId = tab["canvasId"]?.stringValue else { return nil }
                return CanvasTab(id: id, canvasId: canvasId)
            }
            XCTAssertEqual(resolved.openTabs, expectedTabs, "\(name): openTabs")
            XCTAssertEqual(DeviceStateCodec.canvasViewsJSON(resolved.canvasViews), expected["canvasViews"], "\(name): canvasViews")
            assertSameText(DeviceStateCodec.serializedText(resolved), entry.string("serialized"), "\(name): serialized")
        }
    }

    func testLegacyFallbackFromABoardFeedsTheResolver() throws {
        let parsed = try JSONParser.parse(try ConformancePack.text("boards/edges.json"))
        let board = try XCTUnwrap(BoardParser.parsePersistedBoard(parsed))
        let fallback = DeviceStateCodec.legacyFallback(from: board)
        let state = DeviceStateCodec.resolvePersistedDeviceState(nil, board: board, legacyFallback: fallback, mint: .counting())
        XCTAssertEqual(state.activeWorkspaceId, board.activeWorkspaceId)
        XCTAssertEqual(state.activeCanvasId, board.activeCanvasId)
        XCTAssertEqual(state.canvasViews, board.canvasViews)
        XCTAssertEqual(state.openTabs, [CanvasTab(id: "uuid-0001", canvasId: board.activeCanvasId)])
        XCTAssertEqual(state.activeTabId, "uuid-0001")
    }

    func testResolveCanvasTabsNeverLeavesTheActiveTabPointingElsewhere() {
        var canvases = OrderedMap<CanvasMeta>()
        canvases["a"] = CanvasMeta(id: "a", name: "A", workspaceId: "w", parentCanvasId: nil)
        canvases["b"] = CanvasMeta(id: "b", name: "B", workspaceId: "w", parentCanvasId: "a")
        let tabs = [CanvasTab(id: "t1", canvasId: "a"), CanvasTab(id: "t2", canvasId: "b")]
        // The active tab is retargeted in place when the active canvas moved.
        let moved = DeviceStateCodec.resolveCanvasTabs(openTabs: tabs, activeTabId: "t1", activeCanvasId: "b", canvases: canvases, mint: .counting())
        XCTAssertEqual(moved.openTabs, [CanvasTab(id: "t1", canvasId: "b"), CanvasTab(id: "t2", canvasId: "b")])
        XCTAssertEqual(moved.activeTabId, "t1")
        // With no canvases at all the row is empty.
        let none = DeviceStateCodec.resolveCanvasTabs(openTabs: tabs, activeTabId: "t1", activeCanvasId: "a", canvases: [:], mint: .counting())
        XCTAssertEqual(none, DeviceStateCodec.CanvasTabPosition(openTabs: [], activeTabId: "", activeCanvasId: ""))
    }
}
