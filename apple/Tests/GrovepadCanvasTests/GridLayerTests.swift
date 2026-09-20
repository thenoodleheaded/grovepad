import XCTest
import QuartzCore
import GrovepadCore
@testable import GrovepadCanvas

final class GridLayerTests: XCTestCase {
    private let viewport = CGSize(width: 800, height: 600)

    func testGridSitsOnWorldCellsAndPansWithoutRedrawing() {
        let grid = GridLayer()
        grid.update(frame: CameraFrame(pan: Vector2D(x: 0, y: 0), zoom: 1), viewport: viewport)
        XCTAssertFalse(grid.isHidden)
        XCTAssertEqual(grid.drawnSpacing, 40)
        XCTAssertEqual(grid.bounds.size, CGSize(width: 880, height: 680))
        XCTAssertEqual(grid.position, CGPoint(x: -40, y: -40))
        grid.display()
        XCTAssertEqual(grid.drawCount, 1)

        // A pan of 1.5 cells slides the layer half a cell; no new bitmap.
        grid.update(frame: CameraFrame(pan: Vector2D(x: 60, y: -20), zoom: 1), viewport: viewport)
        XCTAssertEqual(grid.position, CGPoint(x: -20, y: -20))
        XCTAssertFalse(grid.needsDisplay())
    }

    func testZoomRescalesTheCellAndFadesTheGridOutWhenDense() {
        let grid = GridLayer()
        grid.update(frame: CameraFrame(pan: .zero, zoom: 2), viewport: viewport)
        XCTAssertEqual(grid.drawnSpacing, 80)
        XCTAssertEqual(grid.opacity, 1)

        grid.update(frame: CameraFrame(pan: .zero, zoom: 0.275), viewport: viewport)
        XCTAssertEqual(Double(grid.opacity), 0.5, accuracy: 0.001, "11 pt cells: half way through the fade")

        grid.update(frame: CameraFrame(pan: .zero, zoom: 0.1), viewport: viewport)
        XCTAssertTrue(grid.isHidden, "4 pt cells would be a haze")
    }

    func testCanvasIntensityDrivesTheGridThroughTheHost() {
        let host = CanvasHostLayer()
        host.bounds = CGRect(origin: .zero, size: viewport)
        host.setCamera(.identity)
        host.setGridIntensity(40)
        XCTAssertEqual(Double(host.gridLayer.opacity), 0.4, accuracy: 0.001)
        host.setGridIntensity(0)
        XCTAssertTrue(host.gridLayer.isHidden)
        XCTAssertEqual(host.sublayers?.firstIndex { $0 === host.gridLayer }, 1, "the grid sits above the aura and beneath the world")
        XCTAssertTrue(host.sublayers?[2] === host.worldLayer, "one grid, no second copy")
    }

    func testTheLitGridShowsOnlyThroughTheCardsPoolsAndStaysPinnedToTheViewport() {
        let host = CanvasHostLayer()
        host.bounds = CGRect(origin: .zero, size: viewport)
        host.setCamera(CameraFrame(pan: Vector2D(x: 60, y: -20), zoom: 1))
        XCTAssertTrue(host.gridLayer.mask === host.gridReveal, "the grid is only ever seen through the cards' pools")
        XCTAssertEqual(host.gridReveal.frame, CGRect(x: 20, y: 20, width: 800, height: 600), "the mask sits on the viewport inside the sliding grid")

        XCTAssertEqual(host.gridReveal.paintedCount, 0, "no cards, no light")
        host.auraLayer.setEmitters([AuraEmitter(id: "a", rect: WorldRect(x: 100, y: 100, width: 200, height: 120), accent: "#34d399")])
        XCTAssertEqual(host.gridReveal.paintedCount, 1)

        host.auraLayer.isEnabled = false
        XCTAssertEqual(host.gridReveal.paintedCount, 1, "the grid still lights with Ambient glow off")
        host.auraLayer.budget = .low
        XCTAssertEqual(host.gridReveal.paintedCount, 0, "the lightest quality paints no lit grid")
    }

    /// No bitmap reuse mid-motion (owner's decision, 18 Sep 2026): every
    /// zoom step redraws the cells for the new spacing at once, unscaled.
    func testEveryZoomRedrawsTheGridAtOnceNeverScalingAnOldPicture() {
        let host = CanvasHostLayer()
        host.bounds = CGRect(origin: .zero, size: viewport)
        host.setCamera(.identity)
        host.gridLayer.displayIfNeeded()
        let draws = host.gridLayer.drawCount
        host.setCamera(CameraFrame(pan: Vector2D(x: 30, y: 0), zoom: 1.1))
        XCTAssertEqual(host.gridLayer.drawnSpacing, 44, accuracy: 1e-9, "drawn for the new zoom straight away")
        XCTAssertTrue(CATransform3DIsIdentity(host.gridLayer.transform), "never a scaled copy")
        XCTAssertTrue(CATransform3DIsIdentity(host.gridReveal.transform))
        host.gridLayer.displayIfNeeded()
        XCTAssertEqual(host.gridLayer.drawCount, draws + 1)
        XCTAssertEqual(Double(host.gridLayer.bounds.width), 888, accuracy: 1e-6)
        XCTAssertEqual(Double(host.gridLayer.bounds.height), 688, accuracy: 1e-6)
    }

    func testTheGridDrawsLinesOnlyAtAFixedHairline() {
        XCTAssertEqual(GridLayer.lineWidth, 1)
        let grid = GridLayer()
        grid.update(frame: CameraFrame(pan: .zero, zoom: 3), viewport: viewport)
        grid.display()
        XCTAssertEqual(grid.drawCount, 1)
    }
}
