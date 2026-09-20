import XCTest
import QuartzCore
import GrovepadCore
@testable import GrovepadCanvas

final class CanvasHostTests: XCTestCase {
    final class Bitmaps: RestingBitmapProvider {
        var versions: [String: Int] = [:]
        var renders: [String] = []
        /// Stands in for a face that has not been measured yet.
        var declines = false
        var released: [String] = []
        /// The scale each card was last rendered at.
        var scales: [String: CGFloat] = [:]
        func dataVersion(for widget: Widget) -> Int { versions[widget.id] ?? 0 }
        func releaseBitmap(for id: String) { released.append(id) }
        func restingBitmap(for widget: Widget, size: Size, scale: CGFloat) -> CGImage? {
            renders.append(widget.id)
            scales[widget.id] = scale
            if declines { return nil }
            let width = max(1, Int(size.width * Double(scale)))
            let height = max(1, Int(size.height * Double(scale)))
            let context = CGContext(
                data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                space: CGColorSpace(name: CGColorSpace.sRGB)!,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )!
            return context.makeImage()
        }
    }

    final class LiveHost: LiveCardHost {
        var mounted: Set<String> = []
        var updates = 0
        func mountLiveCard(_ widget: Widget, frame: WorldRect, in worldLayer: CALayer) { mounted.insert(widget.id) }
        func updateLiveCard(_ widget: Widget, frame: WorldRect) { updates += 1 }
        func unmountLiveCard(id: String) { mounted.remove(id) }
    }

    var scheduler: ManualScheduler!
    var camera: CameraEngine!
    var controller: CanvasHostController!
    var bitmaps: Bitmaps!
    var live: LiveHost!

    override func setUp() {
        super.setUp()
        scheduler = ManualScheduler()
        camera = CameraEngine(scheduler: scheduler)
        camera.setViewportSize(Size(width: 1000, height: 800))
        controller = CanvasHostController(camera: camera, restContext: .none, screenScale: 2)
        bitmaps = Bitmaps()
        live = LiveHost()
        controller.bitmapProvider = bitmaps
        controller.liveHost = live
    }

    func widgets(_ count: Int) -> [Widget] {
        (0..<count).map { index in
            makeWidget(id: "w\(index)", x: Double(index % 4) * 300, y: Double(index / 4) * 240, width: 240, height: 160)
        }
    }

    func testHostLayerBuildsItsTree() {
        let host = controller.hostLayer
        XCTAssertTrue(host.sublayers?.contains(host.worldLayer) ?? false)
        XCTAssertTrue(host.worldLayer.sublayers?.contains(host.edgeLayer) ?? false)
        XCTAssertEqual(host.worldLayer.anchorPoint, .zero)
        XCTAssertEqual(host.edgeLayer.screenScale, 2)
    }

    func testPanAndZoomSetOnlyTheWorldTransform() {
        controller.apply(CanvasHostInput(widgets: widgets(8)))
        let host = controller.hostLayer
        let cardFrames = host.cardLayers.mapValues { ($0.position, $0.bounds) }
        let writesBefore = host.transformWrites
        camera.panBy(Vector2D(x: 30, y: -20))
        camera.zoomAtPoint(1.5, focal: Vector2D(x: 500, y: 400))
        XCTAssertEqual(host.transformWrites, writesBefore + 2)
        let t = host.worldLayer.transform
        XCTAssertEqual(Double(t.m11), 1.5, accuracy: 1e-9)
        XCTAssertEqual(Double(t.m22), 1.5, accuracy: 1e-9)
        XCTAssertEqual(Double(t.m41), camera.frame.pan.x, accuracy: 1e-9)
        XCTAssertEqual(Double(t.m42), camera.frame.pan.y, accuracy: 1e-9)
        for (id, layer) in host.cardLayers {
            XCTAssertEqual(layer.position, cardFrames[id]!.0)
            XCTAssertEqual(layer.bounds, cardFrames[id]!.1)
        }
        XCTAssertEqual(bitmaps.renders.count, 8, "no bitmap is re-rendered by camera motion")
    }

    /// No culling window (owner's decision, 18 Sep 2026): a card never
    /// pops out and back in because the camera moved.
    func testRestingLayersStayMountedWhereverTheCameraGoes() {
        controller.apply(CanvasHostInput(widgets: widgets(8)))
        XCTAssertEqual(controller.restingCardIds.count, 8)
        XCTAssertEqual(Set(bitmaps.renders), controller.restingCardIds)
        let layers = controller.hostLayer.cardLayers
        camera.setView(Vector2D(x: -50_000, y: -50_000), 1)
        XCTAssertEqual(controller.restingCardIds.count, 8, "flying away unmounts nothing")
        camera.setView(.zero, 1)
        XCTAssertEqual(controller.restingCardIds.count, 8)
        for (id, layer) in controller.hostLayer.cardLayers {
            XCTAssertTrue(layer === layers[id], "\(id) is the same tile, never rebuilt")
        }
        XCTAssertEqual(bitmaps.renders.count, 8, "and never re-rendered")
    }

    func testBitmapsRefreshOnlyOnADataVersionChange() {
        controller.apply(CanvasHostInput(widgets: widgets(2)))
        XCTAssertEqual(bitmaps.renders.sorted(), ["w0", "w1"])
        controller.refreshRestingBitmaps()
        XCTAssertEqual(bitmaps.renders.count, 2, "same versions, no re-render")
        bitmaps.versions["w1"] = 1
        controller.refreshRestingBitmaps()
        XCTAssertEqual(bitmaps.renders.count, 3)
        XCTAssertEqual(bitmaps.renders.filter { $0 == "w1" }.count, 2)
        XCTAssertEqual(controller.hostLayer.cardLayers["w1"]?.dataVersion, 1)
        XCTAssertNotNil(controller.hostLayer.cardLayers["w1"]?.contents)
    }

    /// A resting bitmap is a ROUNDED tile with transparent corners, so the
    /// board's ground shows through them. The accent block a card wears
    /// before its bitmap arrives is a placeholder, not a backing: it has to
    /// be rounded like the tile, and it has to go the moment the tile
    /// lands, or every resting card sits on a hard square of accent.
    func testRestingPlaceholderIsRoundedAndLeavesWhenTheBitmapLands() {
        let none = Bitmaps()
        none.declines = true
        controller.bitmapProvider = none
        controller.apply(CanvasHostInput(widgets: widgets(2)))
        let placeholder = controller.hostLayer.cardLayers["w0"]
        XCTAssertNotNil(placeholder?.backgroundColor, "a card with no bitmap yet still shows its accent block")
        XCTAssertEqual(placeholder?.cornerRadius, CGFloat(CanvasHostLayer.cardCornerRadius), "the placeholder is a rounded card, not a square")
        XCTAssertNil(placeholder?.contents)

        controller.bitmapProvider = bitmaps
        none.versions["w0"] = 1
        bitmaps.versions["w0"] = 1
        controller.refreshRestingBitmaps()
        let settled = controller.hostLayer.cardLayers["w0"]
        XCTAssertNotNil(settled?.contents)
        XCTAssertNil(settled?.backgroundColor, "the tile paints its own plate; a backing would fill its corners")
    }

    func testSelectedCardsMountLiveHoveredOnesOnlyLightUpAndBothReleaseAfter() {
        controller.apply(CanvasHostInput(widgets: widgets(4), selection: ["w1"], hover: "w2"))
        XCTAssertEqual(live.mounted, ["w1"], "a click opens a card; the pointer passing over one does not")
        XCTAssertEqual(Set(controller.restingCardIds), ["w0", "w2", "w3"])
        controller.apply(CanvasHostInput(widgets: widgets(4), selection: [], hover: nil))
        XCTAssertEqual(live.mounted, [])
        XCTAssertEqual(controller.restingCardIds.count, 4)
    }

    /// The owner's rule: zoomed all the way out, every card still shows its
    /// resting tile — no placeholder boxes, no title-only blocks.
    func testEveryCardKeepsItsRestingTileAtTenPercentZoom() {
        controller.apply(CanvasHostInput(widgets: widgets(8), selection: ["w0"]))
        let layers = controller.hostLayer.cardLayers
        camera.setView(.zero, 0.1)
        XCTAssertEqual(camera.frame.zoom, 0.1, accuracy: 1e-9)
        XCTAssertEqual(live.mounted, ["w0"], "the open card stays live")
        XCTAssertEqual(controller.restingCardIds, Set((1..<8).map { "w\($0)" }), "every other card is still a tile")
        for (id, layer) in controller.hostLayer.cardLayers {
            XCTAssertTrue(layer === layers[id], "\(id) keeps the same tile layer")
            XCTAssertNotNil(layer.contents, "\(id) still shows its bitmap")
            XCTAssertNil(layer.backgroundColor, "\(id) is not a placeholder block")
            XCTAssertEqual(layer.dataVersion, 0)
        }
        // A board sync at 10 % changes nothing either.
        controller.apply(CanvasHostInput(widgets: widgets(8), selection: ["w0"]))
        XCTAssertEqual(controller.restingCardIds.count, 7)
        XCTAssertTrue(controller.hostLayer.cardLayers.values.allSatisfy { $0.contents != nil })
        XCTAssertEqual(ResidencyTier.allCases, [.live, .resting], "there is no far tier")
    }

    /// Zoomed in, a tile rendered at the screen scale would be a blurry
    /// blow-up: once the camera rests, tiles in view are re-rendered at the
    /// zoom's scale — the same face, more pixels — and go back down when
    /// zoomed out again or scrolled out of view.
    func testTilesInViewAreReRenderedSharpAfterZoomingIn() {
        controller.apply(CanvasHostInput(widgets: widgets(8)))
        XCTAssertTrue(bitmaps.scales.values.allSatisfy { $0 == 2 }, "rendered at the screen scale at 100 %")
        camera.zoomAtPoint(2, focal: .zero)
        XCTAssertEqual(bitmaps.renders.count, 8, "nothing re-renders mid-motion")
        controller.sharpenRestingBitmaps()
        // At 2× the viewport (1000 × 800 pt, plus the margin) covers world
        // x < 600, y < 500: w0, w1, w4, w5.
        for id in ["w0", "w1", "w4", "w5"] {
            XCTAssertEqual(bitmaps.scales[id], 4, "\(id) in view: screen scale × zoom")
            XCTAssertEqual(controller.hostLayer.cardLayers[id]?.renderedScale, 4)
        }
        for id in ["w3", "w7"] {
            XCTAssertEqual(bitmaps.scales[id], 2, "\(id) out of view keeps the screen scale")
        }
        let renders = bitmaps.renders.count
        controller.sharpenRestingBitmaps()
        XCTAssertEqual(bitmaps.renders.count, renders, "already sharp: no work")
        camera.setView(.zero, 0.1)
        controller.sharpenRestingBitmaps()
        XCTAssertTrue(controller.hostLayer.cardLayers.values.allSatisfy { $0.renderedScale == 2 }, "zoomed out, back to the screen scale, never lower")
    }

    func testEdgesMountDiffAndRescaleWithZoom() {
        let a = makeWidget(id: "a", x: 0, y: 0, width: 200, height: 100)
        let b = makeWidget(id: "b", x: 0, y: 300, width: 200, height: 100)
        let route = routeEdge(from: EdgeNode(frame: a.frame), to: EdgeNode(frame: b.frame))
        let relation = EdgeDescriptor(id: "r1", route: route.curve, mid: route.mid, semantics: .relation(type: .parent, strict: false, hoverAccent: nil))
        let away = CubicCurve(start: Vector2D(x: 90_000, y: 0), c1: Vector2D(x: 90_000, y: 0), c2: Vector2D(x: 90_100, y: 0), end: Vector2D(x: 90_100, y: 0))
        let offscreen = EdgeDescriptor(id: "far", route: away, mid: away.point(at: 0.5), semantics: .dependency)
        controller.apply(CanvasHostInput(widgets: [a, b], edges: [relation, offscreen]))
        let edges = controller.hostLayer.edgeLayer
        XCTAssertEqual(edges.mountedEdgeIds, ["r1", "far"], "no culling: an edge never pops in or out under a pan")
        let group = edges.group(for: "r1")!
        XCTAssertEqual(group.shape(.main)?.lineWidth, 2)
        XCTAssertNil(group.shape(.track))
        camera.zoomAtPoint(2, focal: .zero)
        XCTAssertEqual(group.shape(.main)?.lineWidth, 2, "a line zooms with the board: same thickness next to its cards")
        XCTAssertEqual(group.shape(.hit)?.lineWidth, 7, "the pointer's target stays in screen points")
        camera.setView(.zero, 0.1)
        XCTAssertEqual(Double(group.shape(.main)?.lineWidth ?? 0), EdgeGroupLayer.hairline / 0.1, accuracy: 1e-9, "far out, a hairline floor keeps it visible")
        controller.apply(CanvasHostInput(widgets: [a, b], edges: []))
        XCTAssertTrue(edges.mountedEdgeIds.isEmpty)
    }

    func testTheFocusSnapshotIsTheBoardUprightAndTakenOnlyWhenACardOpens() {
        let host = CanvasHostLayer()
        host.bounds = CGRect(x: 0, y: 0, width: 800, height: 600)
        host.setCamera(CameraFrame(pan: Vector2D(x: 30, y: 20), zoom: 1))
        // A red square in the region's top-left corner, far from the card
        // (so it is at the rim, where nothing is blurred).
        let marker = CALayer()
        marker.frame = CGRect(x: 0, y: 0, width: 30, height: 30)
        marker.backgroundColor = CGColor(srgbRed: 1, green: 0, blue: 0, alpha: 1)
        host.worldLayer.addSublayer(marker)
        let region = WorldRect(x: 0, y: 0, width: 400, height: 300)
        let image = try! XCTUnwrap(host.captureFocusImage(region: region, dark: false))
        let data = try! XCTUnwrap(image.dataProvider?.data as Data?)
        let row = image.bytesPerRow, px = image.bitsPerPixel / 8
        func pixel(_ x: Int, _ y: Int) -> (UInt8, UInt8, UInt8) {
            let i = y * row + x * px
            return (data[i], data[i + 1], data[i + 2])
        }
        XCTAssertGreaterThan(pixel(4, 4).0, 200, "top-left of the image is the region's top-left")
        XCTAssertLessThan(pixel(4, 4).1, 60)
        XCTAssertGreaterThan(pixel(4, image.height - 5).1, 150, "and the bottom is not red")

        // Opening takes one; a glide and a same-size resync take none.
        let card = WorldRect(x: 120, y: 120, width: 160, height: 60)
        let captures = host.focusCaptures
        host.setFocus(card, tile: WorldRect(x: 160, y: 130, width: 80, height: 40), dark: false,
                      transition: LayerTransition(duration: 0.3, controlPoints: CardMotion.layoutControlPoints))
        XCTAssertEqual(host.focusCaptures, captures + 1)
        host.setFocus(card, dark: false, transition: nil)
        XCTAssertEqual(host.focusCaptures, captures + 1, "nothing changed: no new snapshot")
        XCTAssertNil(host.focusLayer.backgroundFilters, "no live blur for the compositor to redo every frame")
        host.setFocus(nil, dark: false, transition: nil)
        XCTAssertNil(host.focusRect)
        XCTAssertNil(host.focusLayer.contents, "the image is let go once closed")
    }

    func testALineRunsUnderEveryCardNeverAcrossOne() {
        let a = makeWidget(id: "a", x: 0, y: 0, width: 200, height: 100)
        let b = makeWidget(id: "b", x: 0, y: 300, width: 200, height: 100)
        controller.apply(CanvasHostInput(widgets: [a, b]))
        let world = controller.hostLayer.worldLayer
        let edgeIndex = try! XCTUnwrap(world.sublayers?.firstIndex(of: controller.hostLayer.edgeLayer))
        for id in ["a", "b"] {
            let card = try! XCTUnwrap(controller.hostLayer.cardLayers[id])
            XCTAssertGreaterThan(world.sublayers!.firstIndex(of: card)!, edgeIndex, "\(id) is drawn over the lines")
        }
    }

    func testARouteMovedByAnOpeningCardGlidesInsteadOfJumping() {
        let a = makeWidget(id: "a", x: 0, y: 0, width: 200, height: 100)
        let b = makeWidget(id: "b", x: 0, y: 300, width: 200, height: 100)
        let near = routeEdge(from: EdgeNode(frame: a.frame), to: EdgeNode(frame: b.frame))
        controller.apply(CanvasHostInput(widgets: [a, b], edges: [EdgeDescriptor(id: "r", route: near.curve, mid: near.mid, semantics: .dependency)]))
        var grown = b
        grown.size = Size(width: 400, height: 300)
        let far = routeEdge(from: EdgeNode(frame: a.frame), to: EdgeNode(frame: grown.frame))
        let edges = controller.hostLayer.edgeLayer
        edges.transition = LayerTransition(duration: CardMotion.openDuration, controlPoints: CardMotion.layoutControlPoints)
        controller.apply(CanvasHostInput(widgets: [a, grown], edges: [EdgeDescriptor(id: "r", route: far.curve, mid: far.mid, semantics: .dependency)]))
        edges.transition = nil
        let main = try! XCTUnwrap(edges.group(for: "r")?.shape(.main))
        XCTAssertNotNil(main.animation(forKey: "gp.transition.path"), "the line bends to the new size on the card's curve")
    }

    func testWirePulseReplaysOnlyOnANewKey() {
        let curve = flowCurve(start: Vector2D(x: 200, y: 50), end: Vector2D(x: 500, y: 250)).curve
        func wire(_ key: Double?) -> EdgeDescriptor {
            EdgeDescriptor(id: "w", route: curve, mid: curve.point(at: 0.5), semantics: .wire(valueType: .number, isTrigger: false, enabled: true, damped: false), pulseKey: key)
        }
        controller.apply(CanvasHostInput(widgets: [], edges: [wire(nil)]))
        let edges = controller.hostLayer.edgeLayer
        XCTAssertNil(edges.group(for: "w")?.shape(.pulse))
        controller.apply(CanvasHostInput(widgets: [], edges: [wire(1)]))
        let pulse = edges.group(for: "w")!.shape(.pulse)!
        XCTAssertNotNil(pulse.animation(forKey: "gp-wire-fire"))
        XCTAssertEqual(pulse.animation(forKey: "gp-wire-fire")?.duration ?? 0, 0.9, accuracy: 1e-9)
        // The animation is worthless without a path to run along. Every
        // `<EdgePath>` on the web is always handed its `d`; a stroke that
        // appears AFTER the group mounted, while the route is unchanged, used
        // to be created empty — so no delivery pulse ever drew.
        XCTAssertEqual(pulse.path, curve.cgPath, "the pulse stroke follows the wire")
    }

    /// The same trap for every other late stroke: a highlight that arrives
    /// when the critical path lights up, a track that appears when a
    /// dependency resolves. None of them changes the route.
    func testAStrokeAddedAfterTheGroupMountedStillGetsItsPath() {
        let a = makeWidget(id: "a", x: 0, y: 0, width: 200, height: 100)
        let b = makeWidget(id: "b", x: 0, y: 300, width: 200, height: 100)
        let route = routeEdge(from: EdgeNode(frame: a.frame), to: EdgeNode(frame: b.frame))
        func relation(highlighted: Bool) -> EdgeDescriptor {
            EdgeDescriptor(id: "r1", route: route.curve, mid: route.mid, semantics: .relation(type: .parent, strict: false, hoverAccent: nil), highlighted: highlighted)
        }
        controller.apply(CanvasHostInput(widgets: [a, b], edges: [relation(highlighted: false)]))
        let group = controller.hostLayer.edgeLayer.group(for: "r1")!
        XCTAssertNil(group.shape(.highlight), "no highlight yet")
        // Light the critical path: the route is identical, only the paint moves.
        controller.apply(CanvasHostInput(widgets: [a, b], edges: [relation(highlighted: true)]))
        let highlight = group.shape(.highlight)!
        XCTAssertEqual(highlight.path, route.curve.cgPath, "a late highlight draws the same route")
        XCTAssertEqual(group.shape(.main)?.path, route.curve.cgPath, "and the strokes that were already there keep theirs")
    }

    func testHexColorsParse() {
        let color = CGColor.fromHex("#31a6ff")
        let components = color.components!
        XCTAssertEqual(Double(components[0]), 0x31 / 255.0, accuracy: 1e-6)
        XCTAssertEqual(Double(components[1]), 0xa6 / 255.0, accuracy: 1e-6)
        XCTAssertEqual(Double(components[2]), 1, accuracy: 1e-6)
        XCTAssertEqual(Double(components[3]), 1, accuracy: 1e-6)
        XCTAssertEqual(Double(CGColor.fromHex("#fff").components![0]), 1, accuracy: 1e-6)
        XCTAssertEqual(Double(CGColor.fromHex("#00000080").components![3]), 128 / 255.0, accuracy: 1e-6)
        XCTAssertEqual(Double(CGColor.fromHex("nope").components![3]), 0, accuracy: 1e-6)
    }

    // MARK: - Cached tiles are released with the card, not with the tier

    func testACardLeavingTheCanvasReleasesItsBitmapAndPanningReleasesNothing() {
        let board = widgets(8)
        controller.apply(CanvasHostInput(widgets: board))
        camera.setView(Vector2D(x: -20_000, y: -20_000), 1)
        controller.apply(CanvasHostInput(widgets: board))
        XCTAssertTrue(bitmaps.released.isEmpty, "a pan keeps every tile")

        controller.apply(CanvasHostInput(widgets: Array(board.prefix(5))))
        XCTAssertEqual(Set(bitmaps.released), ["w5", "w6", "w7"], "deleted cards release their tiles")
        XCTAssertEqual(Set(bitmaps.released).count, bitmaps.released.count, "each card releases once")
    }

    func testACardThatOnlyWentLiveKeepsItsBitmap() {
        // Expanding a card takes it out of the resting tier but it is still
        // resident, and it will want the same tile back the moment it rests.
        let board = widgets(4)
        controller.apply(CanvasHostInput(widgets: board, edges: [], selection: [], hover: nil, editing: [], wired: []))
        controller.apply(CanvasHostInput(
            widgets: board, edges: [], selection: ["w0"], hover: nil, editing: ["w0"], wired: []
        ))
        XCTAssertTrue(live.mounted.contains("w0"), "the card really did go live")
        XCTAssertFalse(bitmaps.released.contains("w0"), "a tier change is not leaving the canvas")
    }

    func testGroupLinesRideTheWorldTransformAndZoomWithTheBoard() {
        let host = CanvasHostLayer()
        host.bounds = CGRect(x: 0, y: 0, width: 800, height: 600)
        host.setCamera(CameraFrame(pan: .zero, zoom: 1))
        let lines = [WorldRect(x: 100, y: 90, width: 400, height: 2), WorldRect(x: 100, y: 510, width: 400, height: 2)]
        host.setGlueLines(lines, dark: true)
        XCTAssertTrue(host.glueLineLayer.superlayer === host.worldLayer, "inside the world: the camera moves them with the cards, in one commit")
        let layers = host.glueLineLayer.sublayers ?? []
        XCTAssertEqual(layers.map(\.frame), [CGRect(x: 100, y: 90, width: 400, height: 2), CGRect(x: 100, y: 510, width: 400, height: 2)])
        let transforms = host.transformWrites
        host.setCamera(CameraFrame(pan: Vector2D(x: 40, y: -30), zoom: 1))
        XCTAssertEqual(host.transformWrites, transforms + 1, "a pan touches the world transform only")
        XCTAssertEqual(host.glueLineLayer.sublayers?.first?.frame, CGRect(x: 100, y: 90, width: 400, height: 2))
        host.setCamera(CameraFrame(pan: .zero, zoom: 0.25))
        XCTAssertEqual(Double(host.glueLineLayer.sublayers?.first?.frame.height ?? 0), 2, accuracy: 1e-9, "zooms with the board, like the cards")
        host.setCamera(CameraFrame(pan: .zero, zoom: 0.1))
        XCTAssertEqual(Double(host.glueLineLayer.sublayers?.first?.frame.height ?? 0), 5, accuracy: 1e-9, "far out, never under the hairline")
        host.setGlueLines([], dark: true)
        XCTAssertTrue(host.glueLineLayer.sublayers?.isEmpty ?? true)
    }
}
