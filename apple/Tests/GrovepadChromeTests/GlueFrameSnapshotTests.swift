#if os(macOS)
import XCTest
import SwiftUI
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// Renders the group frame layer (boundary lines, title row, ⌥-drag halo)
/// over three welded card boxes. Proves it lays out and draws; set
/// `GROVEPAD_SNAPSHOT_DIR` to keep the PNG for a look by eye.
@MainActor
final class GlueFrameSnapshotTests: XCTestCase {
    // These fixtures use pinned cards as "never resting" (the web's rule).
    override func setUp() {
        super.setUp()
    }

    override func tearDown() {
        super.tearDown()
    }

    func testFrameLayerRenders() throws {
        var board = makeBoard()
        for (id, x, y) in [("a", 80.0, 140.0), ("b", 320.0, 140.0), ("c", 320.0, 340.0), ("d", 700, 140)] {
            var metadata = WidgetMetadata()
            metadata.pinned = true
            if id == "a" { metadata.favorite = true }
            board.widgets[id] = Widget(id: id, type: "text", title: id.uppercased(), canvasId: "root", position: Vector2D(x: x, y: y), size: Size(width: 240, height: 160), data: JSONObject(), metadata: metadata)
        }
        var glue = WidgetGlue(id: "g", widgetIds: ["a", "b", "c"])
        glue.name = "Sprint plan"
        board.glues["g"] = glue
        let frames = GlueFrameModel.frames(board: board, canvasId: "root")
        XCTAssertEqual(frames.count, 1)
        let frame = try XCTUnwrap(frames.first)
        XCTAssertEqual(frame.envelope, WorldRect(x: 80, y: 100, width: 480, height: 400))
        XCTAssertEqual(frame.members, WorldRect(x: 80, y: 140, width: 480, height: 360), "the stored boxes, with no drawn rects given")
        XCTAssertEqual(frame.boundaryLines, [WorldRect(x: 80, y: 140 - 8 - 2, width: 480, height: 2), WorldRect(x: 80, y: 500 + 8, width: 480, height: 2)], "0.2 of a cell clear of the members")
        XCTAssertEqual(frame.titleY, 140 - 8 - 2 - 28, "the title row stands on the top line")

        let insets = GlueGeometry.renderInsets(glues: board.glues, widgets: board.widgets, canvasId: "root")
        let noop = GlueFrameActions(rename: { _, _ in }, toggleCompleted: { _ in }, toggleFavorite: { _ in }, delete: { _ in }, setCollapsed: { _, _ in }, ungroup: { _ in })
        let halo = GlueIntentOutline(kind: .weldTarget, rect: board.widgets["d"]!.frame, accent: "#34d399")
        let view = ZStack(alignment: .topLeading) {
            Color(red: 0.07, green: 0.08, blue: 0.08)
            ForEach(["a", "b", "c", "d"], id: \.self) { id in
                let w = board.widgets[id]!
                let rect = (insets[id] ?? .zero).apply(to: w.frame)
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color(white: 0.16))
                    .overlay(Text(w.title).foregroundStyle(.white))
                    .frame(width: rect.width, height: rect.height)
                    .offset(x: rect.x, y: rect.y)
            }
            GlueClusterLayerView(frames: frames, intents: [halo], zoom: 1, pan: .zero, actions: noop)
        }
        .frame(width: 1000, height: 560)
        .environment(\.colorScheme, .dark)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 2
        let image = try XCTUnwrap(renderer.cgImage)
        XCTAssertEqual(image.width, 2000)
        if let dir = ProcessInfo.processInfo.environment["GROVEPAD_SNAPSHOT_DIR"] {
            let url = URL(fileURLWithPath: dir).appendingPathComponent("glue-frame.png")
            let dest = try XCTUnwrap(CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil))
            CGImageDestinationAddImage(dest, image, nil)
            XCTAssertTrue(CGImageDestinationFinalize(dest))
        }
    }
}
#endif
