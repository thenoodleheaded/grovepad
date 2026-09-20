import XCTest
import QuartzCore
import GrovepadCore
@testable import GrovepadCanvas

final class AuraLayerTests: XCTestCase {
    private let viewport = CGSize(width: 1000, height: 600)

    func testPoolMatchesTheWebFormula() {
        // auraScreenPool(200, 100, 1, 1000, 600, dark): worldHalo = max(71.34, 141.42·0.45·1.86 = 118.37);
        // halo = min(118.37 · 2.5, 300) = 295.9.
        let pool = AuraGeometry.screenPool(width: 200, height: 100, zoom: 1, viewport: viewport, tuning: .dark)
        XCTAssertEqual(pool.halo, 295.93, accuracy: 0.01)
        XCTAssertEqual(pool.radiusX, 100 + pool.halo, accuracy: 0.0001)
        XCTAssertEqual(pool.radiusY, 50 + pool.halo, accuracy: 0.0001)
        let far = AuraGeometry.screenPool(width: 200, height: 100, zoom: 0.25, viewport: viewport, tuning: .dark)
        XCTAssertLessThan(far.halo, pool.halo, "glows shrink with their cards")
        XCTAssertEqual(AuraGeometry.screenPool(width: 1, height: 1, zoom: 0, viewport: viewport, tuning: .dark).halo, 0)
    }

    func testBufferAndBudgetsMatchTheWebTiers() {
        XCTAssertEqual(AuraGeometry.bufferScale(viewport: viewport, quality: 1), 0.56, accuracy: 0.0001)
        XCTAssertEqual(AuraGeometry.bufferScale(viewport: CGSize(width: 400, height: 300), quality: 1), 0.65, accuracy: 0.0001)
        XCTAssertEqual(AuraBudget.high.applied(to: .dark), .dark)
        let balanced = AuraBudget.balanced.applied(to: .dark)
        XCTAssertEqual(balanced.maxEmitters, 7)
        XCTAssertEqual(balanced.alpha, 0.855 * 0.85, accuracy: 0.0001)
        XCTAssertFalse(AuraBudget.low.render)
    }

    func testCullsOffscreenRanksGluedFirstAndCapsEmitters() {
        let aura = AuraLayer()
        aura.update(frame: CameraFrame(pan: .zero, zoom: 1), viewport: viewport)
        var emitters = (0..<20).map { AuraEmitter(id: "w\($0)", rect: WorldRect(x: Double($0) * 40, y: 100, width: 80 + Double($0), height: 80), accent: "#a3e635") }
        emitters.append(AuraEmitter(id: "far", rect: WorldRect(x: 50_000, y: 0, width: 80, height: 80), accent: "#a3e635"))
        emitters.append(AuraEmitter(id: "glued", rect: WorldRect(x: 10, y: 10, width: 10, height: 10), accent: "#f472b6"))
        aura.setEmitters(emitters)
        aura.gluedIds = ["glued"]
        let pools = aura.visiblePools()
        XCTAssertEqual(pools.count, AuraTuning.dark.maxEmitters)
        XCTAssertEqual(pools.first?.emitter.id, "glued")
        XCTAssertEqual(pools[1].emitter.id, "w19", "then the largest on screen")
        XCTAssertFalse(pools.contains { $0.emitter.id == "far" })
    }

    func testPaintsOnlyWhenEnabledAndHostSitsItBeneathTheGrid() {
        let host = CanvasHostLayer()
        XCTAssertEqual(host.sublayers?.first, host.auraLayer)
        let aura = host.auraLayer
        aura.update(frame: CameraFrame(pan: .zero, zoom: 1), viewport: viewport)
        aura.setEmitters([AuraEmitter(id: "a", rect: WorldRect(x: 100, y: 100, width: 200, height: 120), accent: "#60a5fa")])
        XCTAssertEqual(aura.paintedCount, 1)
        XCTAssertEqual(aura.sublayers?.count, 1, "one pool, one sublayer")
        XCTAssertNotNil(aura.sublayers?.first?.contents, "showing a pre-rendered falloff")
        aura.isEnabled = false
        XCTAssertTrue(aura.isHidden)
        XCTAssertEqual(aura.paintedCount, 0)
        aura.isEnabled = true
        aura.budget = .low
        XCTAssertTrue(aura.isHidden, "the Light tier paints nothing")
        aura.budget = .high
        aura.isDark = false
        XCTAssertEqual(aura.opacity, 0.62, accuracy: 0.001)
        XCTAssertEqual(aura.paintedCount, 1)
    }

    func testTheGlowFollowsADraggedCardByMovingALayerNotByRepainting() {
        let aura = AuraLayer()
        aura.update(frame: CameraFrame(pan: .zero, zoom: 1), viewport: viewport)
        aura.setEmitters([
            AuraEmitter(id: "a", rect: WorldRect(x: 100, y: 100, width: 200, height: 120), accent: "#60a5fa"),
            AuraEmitter(id: "b", rect: WorldRect(x: 600, y: 300, width: 200, height: 120), accent: "#60a5fa"),
        ])
        let before = aura.poolRects().first { $0.emitter.id == "a" }!.rect
        let layer = aura.sublayers!.first { $0.frame == before }!
        let image = layer.contents as AnyObject?
        aura.moveEmitters(["a": WorldRect(x: 160, y: 140, width: 200, height: 120)])
        XCTAssertEqual(layer.frame, before.offsetBy(dx: 60, dy: 40), "the same layer slid with the card")
        XCTAssertTrue(layer.contents as AnyObject? === image, "nothing was painted again")
        // A card just past the viewport edge already has its pool placed
        // as soon as any of its glow can show.
        aura.update(frame: CameraFrame(pan: Vector2D(x: -500, y: 0), zoom: 1), viewport: viewport)
        XCTAssertEqual(aura.paintedCount, 2)
    }

    func testTheLitGridFollowsThePoolsEvenWithTheGlowOff() {
        let host = CanvasHostLayer()
        host.bounds = CGRect(origin: .zero, size: viewport)
        host.setCamera(.identity)
        host.auraLayer.setEmitters([AuraEmitter(id: "a", rect: WorldRect(x: 100, y: 100, width: 200, height: 120), accent: "#34d399")])
        XCTAssertEqual(host.gridReveal.paintedCount, 1)
        host.auraLayer.isEnabled = false
        XCTAssertEqual(host.gridReveal.paintedCount, 1)
        host.auraLayer.moveEmitters(["a": WorldRect(x: 300, y: 100, width: 200, height: 120)])
        XCTAssertEqual(host.gridReveal.sublayers?.first?.frame, host.auraLayer.poolRects().first?.rect)
    }

    /// Values produced by the web's `paperPigment` (auraTuning.ts).
    func testPaperPigmentMatchesTheWeb() {
        func pigment(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> [Int] {
            AuraLayer.paperPigment([r / 255, g / 255, b / 255]).map { Int(($0 * 255).rounded()) }
        }
        XCTAssertEqual(pigment(134, 239, 172), [43, 182, 93])
        XCTAssertEqual(pigment(167, 228, 114), [107, 182, 43])
        XCTAssertEqual(pigment(125, 211, 252), [43, 137, 182])
        XCTAssertEqual(pigment(226, 232, 240), [226, 232, 240], "a grey stays grey")
    }

    func testLightPoolsAreAsDenseAndWideAsTheDarkOnes() {
        XCTAssertEqual(AuraTuning.light.maxEmitters, AuraTuning.dark.maxEmitters)
        XCTAssertEqual(AuraTuning.light.reach, AuraTuning.dark.reach)
        XCTAssertEqual(AuraTuning.light.alpha * AuraTuning.light.coreAlpha, 0.62, accuracy: 0.0001)
    }

    func testAPoolGrowsWithItsCardInsteadOfJumping() {
        let aura = AuraLayer()
        aura.update(frame: CameraFrame(pan: .zero, zoom: 1), viewport: viewport)
        aura.setEmitters([AuraEmitter(id: "a", rect: WorldRect(x: 100, y: 100, width: 80, height: 80), accent: "#86efac")])
        let pool = try! XCTUnwrap(aura.sublayers?.first)
        let before = pool.frame
        aura.setEmitters([AuraEmitter(id: "a", rect: WorldRect(x: 60, y: 60, width: 320, height: 240), accent: "#86efac")],
                         transition: LayerTransition(duration: 0.3, controlPoints: (0.22, 1, 0.36, 1)))
        XCTAssertNotEqual(pool.frame, before)
        XCTAssertNotNil(pool.animation(forKey: "gp.transition.bounds"), "the glow grows on the card's curve")
        // A pan or a drag never glides: it follows the camera exactly.
        aura.moveEmitters(["a": WorldRect(x: 90, y: 60, width: 320, height: 240)])
        XCTAssertEqual(pool.animationKeys()?.contains("gp.transition.position") ?? false, true, "the running glide is not cut, only the model moves")
    }
}
