import XCTest
import GrovepadCore
@testable import GrovepadCanvas

final class GlassBudgetTests: XCTestCase {
    /// Ten cards in a row, 200 apart.
    let row: [GlassCard] = (0..<10).map { GlassCard(id: "c\($0)", frame: WorldRect(x: Double($0) * 200, y: 0, width: 100, height: 100)) }

    func testNearestCardsToThePointerGetGlassUpToTheLimit() {
        var budget = GlassBudget(limit: 3)
        let allowed = budget.update(pointer: Vector2D(x: 450, y: 50), cards: row)
        XCTAssertEqual(allowed, ["c1", "c2", "c3"])
        XCTAssertTrue(budget.allows("c2"))
        XCTAssertFalse(budget.allows("c9"))
    }

    func testReduceTransparencyGrantsNothing() {
        var budget = GlassBudget(limit: 6, reduceTransparency: true)
        XCTAssertEqual(budget.update(pointer: Vector2D(x: 50, y: 50), cards: row), [])
        var none = GlassBudget(limit: 0)
        XCTAssertEqual(none.update(pointer: Vector2D(x: 50, y: 50), cards: row), [])
    }

    func testSmallPointerMovementKeepsTheSetStable() {
        var budget = GlassBudget(limit: 2, hysteresisMargin: 24)
        // Pointer between c1 (200..300) and c2 (400..500) — nearer c1.
        budget.update(pointer: Vector2D(x: 340, y: 50), cards: row)
        XCTAssertEqual(budget.allowed, ["c1", "c2"])
        // Drift toward c3: c3 gets nearer than c1 but not by the margin.
        budget.update(pointer: Vector2D(x: 355, y: 50), cards: row)
        XCTAssertEqual(budget.allowed, ["c1", "c2"], "jitter does not swap glass")
        // A clear move past the margin lets c3 take c1's glass.
        budget.update(pointer: Vector2D(x: 500, y: 50), cards: row)
        XCTAssertEqual(budget.allowed, ["c2", "c3"])
    }

    func testCardsThatDisappearLeaveTheSetAndANilPointerKeepsIt() {
        var budget = GlassBudget(limit: 2)
        budget.update(pointer: Vector2D(x: 50, y: 50), cards: row)
        XCTAssertEqual(budget.allowed, ["c0", "c1"])
        budget.update(pointer: nil, cards: Array(row.dropFirst()))
        XCTAssertEqual(budget.allowed, ["c1"])
        budget.update(pointer: nil, cards: row)
        XCTAssertEqual(budget.allowed, ["c1"])
    }

    func testDistanceIsZeroInsideAndEdgeDistanceOutside() {
        let frame = WorldRect(x: 0, y: 0, width: 100, height: 100)
        XCTAssertEqual(GlassBudget.distance(from: Vector2D(x: 50, y: 50), to: frame), 0)
        XCTAssertEqual(GlassBudget.distance(from: Vector2D(x: 130, y: 50), to: frame), 30)
        XCTAssertEqual(GlassBudget.distance(from: Vector2D(x: 130, y: 140), to: frame), 50)
    }

    /// Lowering the limit — Settings → visual quality, or a device the app
    /// decides to be gentler on — has to take glass back. The budget only
    /// ever inserted or swapped, so six cards kept their glass forever after
    /// the limit dropped to two, and the setting did nothing.
    func testALoweredLimitTakesGlassBack() {
        var budget = GlassBudget(limit: 6)
        XCTAssertEqual(budget.update(pointer: Vector2D(x: 450, y: 50), cards: row).count, 6)
        budget.limit = 2
        let trimmed = budget.update(pointer: Vector2D(x: 450, y: 50), cards: row)
        XCTAssertEqual(trimmed, ["c1", "c2"], "the two nearest keep it — c2 holds the pointer, c1 and c3 tie at 150 and the id breaks it")
        XCTAssertFalse(budget.allows("c0"))

        // And with the pointer off the canvas, where the set is otherwise
        // held exactly as it was.
        var parked = GlassBudget(limit: 6)
        XCTAssertEqual(parked.update(pointer: Vector2D(x: 450, y: 50), cards: row).count, 6)
        parked.limit = 3
        XCTAssertEqual(parked.update(pointer: nil, cards: row).count, 3)
        // Dropping to nothing empties it.
        parked.limit = 0
        XCTAssertEqual(parked.update(pointer: nil, cards: row), [])
    }
}
