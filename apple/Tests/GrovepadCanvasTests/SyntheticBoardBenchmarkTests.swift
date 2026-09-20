import XCTest
import QuartzCore
import GrovepadCore
@testable import GrovepadCanvas

// ---------------------------------------------------------------------------
// The roadmap's 5,000-card synthetic board, run through the planner and the
// canvas host on the build machine. There is no culling window and no far
// tier (owner's decision, 18 Sep 2026): every card is a mounted tile, so
// camera motion must stay a transform write however many cards there are.
// These ceilings are generous regression tripwires, NOT the phase-2 gate: the gate is 120 Hz with zero dropped
// frames over 10 s on the oldest supported iPad and Mac, measured with
// Instruments (Core Animation / Metal System Trace) on a device. Nothing here
// measures that.
// ---------------------------------------------------------------------------

final class SyntheticBoardBenchmarkTests: XCTestCase {
    static let cardCount = 5000
    static let columns = 80

    static func syntheticBoard() -> [Widget] {
        (0..<cardCount).map { index in
            makeWidget(
                id: "card-\(index)",
                title: "Card \(index)",
                x: Double(index % columns) * 300,
                y: Double(index / columns) * 240,
                width: 240,
                height: 160
            )
        }
    }

    func measureMilliseconds(_ block: () -> Void) -> Double {
        let start = CACurrentMediaTime()
        block()
        return (CACurrentMediaTime() - start) * 1000
    }

    func testReplanOverFiveThousandCardsStaysUnderTheCeiling() {
        let controller = ResidencyController(restContext: .none)
        controller.setWidgets(Self.syntheticBoard())
        controller.replan() // warm up
        controller.urgentIds = ["card-7"]
        var samples: [Double] = []
        for _ in 1...10 {
            samples.append(measureMilliseconds { _ = controller.replan() })
        }
        let median = samples.sorted()[samples.count / 2]
        print("[bench] replan median \(median) ms over \(Self.cardCount) cards")
        XCTAssertLessThan(median, 8, "replan median \(median) ms over 5,000 cards")
        XCTAssertEqual(controller.plan!.orderedIds.count, Self.cardCount, "every card is planned")
    }

    func testCameraMotionOverFiveThousandTilesMountsNothing() {
        let camera = CameraEngine(scheduler: ManualScheduler())
        camera.setViewportSize(Size(width: 1440, height: 900))
        let controller = CanvasHostController(camera: camera, restContext: .none, screenScale: 2)
        controller.apply(CanvasHostInput(widgets: Self.syntheticBoard()))
        XCTAssertEqual(controller.restingCardIds.count, Self.cardCount)
        let layers = controller.hostLayer.cardLayers.count
        let elapsed = measureMilliseconds {
            for step in 1...600 {
                camera.setView(Vector2D(x: -Double(step) * 20, y: 0), step % 2 == 0 ? 0.1 : 0.5)
            }
        }
        print("[bench] camera frame \(elapsed / 600) ms over \(Self.cardCount) tiles")
        XCTAssertEqual(controller.hostLayer.cardLayers.count, layers, "no tile comes or goes with the camera")
        XCTAssertLessThan(elapsed / 600, 16, "\(elapsed / 600) ms per camera frame")
    }

    func testEdgeLayerAppliesAThousandEdgesUnderTheCeiling() {
        let widgets = Self.syntheticBoard()
        var descriptors: [EdgeDescriptor] = []
        for index in stride(from: 0, to: 2000, by: 2) {
            let from = EdgeNode(frame: widgets[index].frame)
            let to = EdgeNode(frame: widgets[index + 1].frame)
            let route = routeEdge(from: from, to: to)
            descriptors.append(EdgeDescriptor(id: "e\(index)", route: route.curve, mid: route.mid, semantics: .relation(type: .parent, strict: false, hoverAccent: nil)))
        }
        let layer = EdgeLayer()
        let visible = WorldRect(x: -1000, y: -1000, width: 30000, height: 8000)
        let elapsed = measureMilliseconds {
            layer.apply(descriptors, visibleWorldRect: visible, zoom: 0.5)
        }
        XCTAssertEqual(layer.mountedEdgeIds.count, 1000)
        XCTAssertLessThan(elapsed, 120, "edge mount \(elapsed) ms for 1,000 edges")
        let rescale = measureMilliseconds { layer.setZoom(0.75) }
        print("[bench] edge mount \(elapsed) ms, rescale \(rescale) ms for 1,000 edges")
        XCTAssertLessThan(rescale, 30, "edge rescale \(rescale) ms")
    }
}
