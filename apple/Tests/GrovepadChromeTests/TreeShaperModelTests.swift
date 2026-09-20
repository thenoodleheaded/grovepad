import XCTest
import SwiftUI
import GrovepadCore
@testable import GrovepadChrome

/// The shaper's pointer rules (`GhostTreeShaper.tsx`), picker and lifecycle —
/// the parts the conformance scenario does not drive — and its surfaces render.
final class TreeShaperModelTests: XCTestCase {
    private func started() -> (TreeShaperModel, String) {
        let shaper = TreeShaperModel(mint: .counting(prefix: "n-"))
        shaper.start(at: Vector2D(x: 413, y: -27))
        return (shaper, shaper.config!.nodes[0].id)
    }

    func testStartSnapsTheOriginAndPlacesOneEmptyRoot() {
        let (shaper, root) = started()
        XCTAssertEqual(shaper.config?.originX, 400)
        XCTAssertEqual(shaper.config?.originY, -40)
        XCTAssertEqual(shaper.config?.nodes, [GhostTreeNode(id: root, parentId: nil, order: 0, x: 400, y: -40)])
        XCTAssertEqual(shaper.config?.unconfiguredCount, 1)
    }

    func testTravelUnderTheDirectionLockIsATapThatOpensThePicker() {
        let (shaper, root) = started()
        shaper.pressBegan(root)
        shaper.pressMoved(root, translation: Vector2D(x: 3, y: -3.9), zoom: 1)
        shaper.pressEnded(root, additive: false)
        XCTAssertEqual(shaper.config?.nodes.count, 1, "no shaping under 4 pt")
        XCTAssertEqual(shaper.pickerTarget, [root])
        XCTAssertEqual(shaper.pickerAnchor?.id, root)
    }

    func testDragStepsAreScreenTravelOverZoomInTwoCellUnitsAndNeverATap() {
        let (shaper, root) = started()
        shaper.pressBegan(root)
        // 80 world units per node: 79 screen points at zoom 0.5 is 158 world → one child.
        shaper.pressMoved(root, translation: Vector2D(x: 2, y: 79), zoom: 0.5)
        XCTAssertEqual(shaper.config?.nodes.count, 2)
        shaper.pressMoved(root, translation: Vector2D(x: 2, y: 80), zoom: 0.5)
        XCTAssertEqual(shaper.config?.nodes.count, 3, "absolute from the grab point")
        // Back inside the lock: the base returns, and the release is still not a tap.
        shaper.pressMoved(root, translation: Vector2D(x: 1, y: 1), zoom: 0.5)
        XCTAssertEqual(shaper.config?.nodes.count, 1)
        shaper.pressEnded(root, additive: false)
        XCTAssertNil(shaper.pickerTarget)
    }

    func testAPrunedPointStaysPaintedUntilTheDragEnds() {
        let (shaper, root) = started()
        shaper.shape(root, direction: .down, steps: 1)
        let child = shaper.config!.nodes[1].id
        shaper.pressBegan(child)
        shaper.pressMoved(child, translation: Vector2D(x: 0, y: -90), zoom: 1)
        XCTAssertFalse(shaper.config!.nodes.contains { $0.id == child }, "dragging a leaf up prunes it")
        XCTAssertTrue(shaper.isClosing(child))
        XCTAssertEqual(shaper.renderedNodes.map(\.id), [child, root])
        shaper.pressEnded(child, additive: false)
        XCTAssertEqual(shaper.renderedNodes.map(\.id), [root])
        XCTAssertNil(shaper.pickerTarget)
    }

    func testAdditiveTapsBuildASelectionThatTheNextTapEditsInBulk() {
        let (shaper, root) = started()
        shaper.shape(root, direction: .right, steps: 2)
        let ids = shaper.config!.nodes.map(\.id)
        for id in [ids[1], ids[2]] {
            shaper.pressBegan(id)
            shaper.pressEnded(id, additive: true)
        }
        XCTAssertEqual(shaper.selectedNodeIds, [ids[1], ids[2]])
        shaper.pressBegan(root)
        shaper.pressEnded(root, additive: false)
        XCTAssertEqual(shaper.pickerTarget, [ids[1], ids[2]], "a plain tap edits the selection, not the tapped point")
        XCTAssertEqual(shaper.pickerInitialTypes, [], "a bulk edit starts blank")
        shaper.confirmPicker(["text", "counter"])
        XCTAssertEqual(shaper.config!.nodes.map(\.widgetTypes), [[], ["text", "counter"], ["text", "counter"]])
        XCTAssertNil(shaper.pickerTarget)
        XCTAssertEqual(shaper.selectedNodeIds, [])
    }

    func testSinglePointPickerReplacesAndClears() {
        let (shaper, root) = started()
        shaper.setWidgetTypes(root, ["text", "text", "counter"])
        XCTAssertEqual(shaper.config?.nodes[0].widgetTypes, ["text", "counter"], "deduplicated")
        shaper.pressBegan(root)
        shaper.pressEnded(root, additive: false)
        XCTAssertEqual(shaper.pickerInitialTypes, ["text", "counter"])
        shaper.confirmPicker([])
        XCTAssertEqual(shaper.config?.nodes[0].widgetTypes, [], "Clear node")
    }

    func testMarqueeGathersPointsItTouches() {
        let (shaper, root) = started()
        shaper.shape(root, direction: .down, steps: 1)
        let child = shaper.config!.nodes[1]
        XCTAssertEqual(shaper.nodeIds(intersecting: WorldRect(x: child.x + 39, y: child.y + 39, width: 10, height: 10)), [child.id])
        shaper.addToSelection([child.id, child.id])
        XCTAssertEqual(shaper.selectedNodeIds, [child.id])
    }

    func testCommitIsRefusedWhileAPointIsEmptyAndCancelForgetsEverything() {
        let (shaper, root) = started()
        let (document, _, _) = makeDocument()
        shaper.shape(root, direction: .down, steps: 1)
        shaper.setWidgetTypes(root, ["text"])
        XCTAssertNil(shaper.commit(into: document))
        XCTAssertTrue(shaper.isActive)
        XCTAssertTrue(document.board.widgets.isEmpty)
        shaper.toggleSelected(root)
        shaper.cancel()
        XCTAssertFalse(shaper.isActive)
        XCTAssertEqual(shaper.selectedNodeIds, [])
        XCTAssertTrue(shaper.renderedNodes.isEmpty)
    }

    func testCommittedCardsAreIconsOnTheActiveCanvas() throws {
        let (shaper, root) = started()
        let (document, _, _) = makeDocument()
        shaper.setWidgetTypes(root, ["counter"])
        let ids = try XCTUnwrap(shaper.commit(into: document))
        let card = try XCTUnwrap(document.widget(ids[0]))
        XCTAssertEqual(card.canvasId, "root")
        XCTAssertEqual(card.iconified, true)
        XCTAssertEqual(card.size, CanvasGeometry.iconifiedSize)
        XCTAssertEqual(card.expandedSize, WidgetRegistry.definition(for: "counter")?.defaultSize)
        XCTAssertTrue(document.board.glues.isEmpty, "a single-card point is not welded")
    }

    func testToolbarStartsTheShaperAtTheViewCentre() {
        let (document, _, _) = makeDocument()
        let chrome = ChromeState()
        let camera = RecordingCamera()
        camera.pan = Vector2D(x: -200, y: -100)
        ToolbarModel(document: document, chrome: chrome, tabs: CanvasTabsModel(document: document), camera: camera).shapeTree()
        XCTAssertEqual(chrome.treeShaper.config?.originX, CanvasGeometry.snapToGrid(camera.viewCenterWorld.x))
        XCTAssertEqual(chrome.treeShaper.config?.originY, CanvasGeometry.snapToGrid(camera.viewCenterWorld.y))
    }

    #if canImport(AppKit)
    func testSurfacesRender() throws {
        let (document, _, _) = makeDocument()
        let chrome = ChromeState()
        let library = AddWidgetModel(document: document, prefs: InMemoryWidgetPickerPrefs())
        chrome.treeShaper.start(at: Vector2D(x: 200, y: 200))
        let root = chrome.treeShaper.config!.nodes[0].id
        chrome.treeShaper.shape(root, direction: .down, steps: 2)
        chrome.treeShaper.setWidgetTypes(root, ["text", "counter", "toggle"])
        chrome.treeShaper.pressBegan(root)
        chrome.treeShaper.pressEnded(root, additive: false)
        for phone in [true, false] {
            let adaptation = ChromeAdaptation(width: phone ? 390 : 1400, activeInput: phone ? .touch : .mouse)
            func render<V: View>(_ view: V) -> CGImage? {
                WidgetBitmapProvider.render(view.environment(\.chromeAdaptation, adaptation), scale: 1)
            }
            XCTAssertNotNil(render(GhostTreeOverlay(shaper: chrome.treeShaper, chrome: chrome).frame(width: 800, height: 600)))
            let hud = try XCTUnwrap(render(ShaperHUDView(shaper: chrome.treeShaper, document: document).frame(width: phone ? 390 : 700)))
            XCTAssertGreaterThanOrEqual(hud.height, 44)
            XCTAssertNotNil(render(GhostNodePickerSheet(library: library, shaper: chrome.treeShaper).frame(width: phone ? 390 : 408, height: 500)))
        }
        // Regular widths: the full-window gallery, blocks in a grid, for both callers.
        let adaptation = ChromeAdaptation(width: 1400, activeInput: .mouse)
        for gallery in [
            AnyView(GhostNodePickerGallery(library: library, shaper: chrome.treeShaper)),
            AnyView(AddWidgetGallery(model: library, at: .zero, chrome: chrome)),
        ] {
            let image = try XCTUnwrap(WidgetBitmapProvider.render(gallery.environment(\.chromeAdaptation, adaptation).frame(width: 1280, height: 800), scale: 1))
            XCTAssertEqual(image.width, 1280)
        }
    }
    #endif
}
