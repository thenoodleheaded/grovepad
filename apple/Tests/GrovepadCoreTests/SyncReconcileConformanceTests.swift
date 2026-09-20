import XCTest
@testable import GrovepadCore

/// The phase-6 gate over `apple/Conformance/reconcile/*.json`: every case's
/// `mergedJson` byte for byte (JSON.stringify of the merged board), the
/// `merged` object, and the `keptBothTitles` list, with the pack's counting
/// id minter (`uuid-0001, …`).
final class SyncReconcileConformanceTests: XCTestCase {
    private static let cases = ["with-baseline", "no-baseline-union", "identical", "local-only-moved", "cloud-only-moved"]

    private func run(_ name: String) throws {
        let pack = try ConformancePack.object("reconcile/\(name).json")
        let base = pack.object("base")
        let local = try XCTUnwrap(pack.object("local"), "\(name) local")
        let cloud = try XCTUnwrap(pack.object("cloud"), "\(name) cloud")
        let result = mergeBoardsThreeWay(base: base, local: local, cloud: cloud, mint: .counting())
        assertSameText(JSONWriter.stringify(.object(result.board)), pack.string("mergedJson"), "reconcile/\(name) mergedJson")
        XCTAssertEqual(result.board, pack.object("merged"), "reconcile/\(name) merged")
        XCTAssertEqual(result.keptBothTitles, ConformancePack.stringList(pack["keptBothTitles"]), "reconcile/\(name) keptBothTitles")
    }

    func testEveryReconcileCaseMatchesThePack() throws {
        for name in Self.cases { try run(name) }
    }

    func testWithBaselineKeepsBothVersionsOfTheConflictedCard() throws {
        let pack = try ConformancePack.object("reconcile/with-baseline.json")
        let result = mergeBoardsThreeWay(base: pack.object("base"), local: pack.object("local")!, cloud: pack.object("cloud")!, mint: .counting())
        let widgets = result.board.object("widgets")!
        // The cloud copy holds the shared id; this device's copy lands below it.
        XCTAssertEqual(widgets.object("a")?.object("data")?["text"], .string("cloud a"))
        XCTAssertEqual(widgets.object("uuid-0001")?.object("data")?["text"], .string("local a"))
        XCTAssertEqual(widgets.object("uuid-0001")?.object("position")?["y"], .number(240))
        XCTAssertEqual(result.keptBothTitles, ["a (this device)"])
        // A delete racing an edit loses: c was deleted here, edited there.
        XCTAssertEqual(widgets.object("c")?.object("data")?["text"], .string("cloud edited c"))
        // Packs: education switched on here survives; life switched off there is honored.
        XCTAssertEqual(result.board["activePacks"], .array([.string("education")]))
    }

    func testMergingIsIdempotent() throws {
        let pack = try ConformancePack.object("reconcile/with-baseline.json")
        let first = mergeBoardsThreeWay(base: pack.object("base"), local: pack.object("local")!, cloud: pack.object("cloud")!, mint: .counting()).board
        let second = mergeBoardsThreeWay(base: first, local: first, cloud: first, mint: .counting())
        XCTAssertEqual(second.board, first)
        XCTAssertTrue(second.keptBothTitles.isEmpty)
    }

    func testKeptBothTitleRules() {
        XCTAssertEqual(ThreeWayMerge.keptBothTitle(.string("  Notes ")), .string("Notes (this device)"))
        XCTAssertEqual(ThreeWayMerge.keptBothTitle(.string("   ")), .string("Card (this device)"))
        XCTAssertEqual(ThreeWayMerge.keptBothTitle(.string("Notes (this device)")), .string("Notes (this device)"))
        let long = String(repeating: "x", count: 100)
        let clipped = ThreeWayMerge.keptBothTitle(.string(long)).stringValue!
        XCTAssertEqual(clipped.utf16.count, 80)
        XCTAssertTrue(clipped.hasSuffix(" (this device)"))
    }

    func testEditBeatsDeleteInBothDirections() throws {
        let pack = try ConformancePack.object("reconcile/with-baseline.json")
        let base = pack.object("base")!
        var deleted = base
        deleted["widgets"] = .object(JSONObject())
        var edited = base
        var widgets = base.object("widgets")!
        var a = widgets.object("a")!
        a["data"] = .object(["text": "edited"])
        widgets["a"] = .object(a)
        edited["widgets"] = .object(widgets)
        let deletedHere = mergeBoardsThreeWay(base: base, local: deleted, cloud: edited, mint: .counting())
        let deletedThere = mergeBoardsThreeWay(base: base, local: edited, cloud: deleted, mint: .counting())
        XCTAssertEqual(deletedHere.board.object("widgets")?.object("a")?.object("data")?["text"], .string("edited"))
        XCTAssertEqual(deletedThere.board.object("widgets")?.object("a")?.object("data")?["text"], .string("edited"))
        XCTAssertTrue(deletedHere.keptBothTitles.isEmpty)
        XCTAssertTrue(deletedThere.keptBothTitles.isEmpty)
    }
}
