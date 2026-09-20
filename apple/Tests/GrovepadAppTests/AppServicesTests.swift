import XCTest
import GrovepadCore
import GrovepadChrome
import GrovepadCloud
@testable import GrovepadApp

/// The small services: cloud settings, share-export naming, haptic names,
/// the package importer's remapping, the debouncer.
final class AppServicesTests: XCTestCase {
    func testBlankCloudEntriesKeepTheAppInGuestMode() {
        XCTAssertNil(CloudSettings.configuration(from: nil))
        XCTAssertNil(CloudSettings.configuration(from: [CloudSettings.urlKey: "", CloudSettings.anonKeyKey: ""]))
        XCTAssertNil(CloudSettings.configuration(from: [CloudSettings.urlKey: "https://x.supabase.co", CloudSettings.anonKeyKey: "YOUR_KEY"]))
        let configuration = CloudSettings.configuration(from: [CloudSettings.urlKey: " https://x.supabase.co ", CloudSettings.anonKeyKey: "anon"])
        XCTAssertEqual(configuration?.url.absoluteString, "https://x.supabase.co")
        XCTAssertEqual(configuration?.redirectURL.absoluteString, "grovepad://auth/callback")
    }

    func testShareExportFileNameIsSafeAndDated() throws {
        let date = Date(timeIntervalSince1970: 1_789_000_000)
        XCTAssertEqual(ShareExport.fileName(title: "Study / plan: 2", date: date), "Grovepad — Study - plan- 2 2026-09-10.grovepad")
        XCTAssertEqual(ShareExport.fileName(title: "   ", date: date), "Grovepad — Board 2026-09-10.grovepad")
        let url = try ShareExport.temporaryFile(bytes: [1, 2, 3], fileName: "a/b.grovepad")
        XCTAssertEqual(url.lastPathComponent, "b.grovepad")
        XCTAssertEqual(try Data(contentsOf: url), Data([1, 2, 3]))
        try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
    }

    @MainActor
    func testHapticNamesMatchTheWebAndThePlugin() {
        XCTAssertEqual(HapticKind.allCases.map(\.rawValue), ["detent", "commit", "limit"])
        let haptics = Haptics()
        haptics.tap(.commit)
        haptics.tap(.limit)
        XCTAssertEqual(haptics.log, [.commit, .limit], "a tap is logged and never throws, on every platform")
    }

    func testDebouncerFiresOnceAfterTheLastCall() {
        let timers = ManualTimerSource()
        let debouncer = Debouncer(delayMs: 500, timers: timers)
        var fired = 0
        debouncer.schedule { fired += 1 }
        timers.advance(byMs: 300)
        debouncer.schedule { fired += 10 }
        timers.advance(byMs: 300)
        XCTAssertEqual(fired, 0)
        timers.advance(byMs: 200)
        XCTAssertEqual(fired, 10)
        XCTAssertFalse(debouncer.isPending)
        debouncer.schedule { fired += 100 }
        debouncer.flush()
        XCTAssertEqual(fired, 110)
        timers.advance(byMs: 1000)
        XCTAssertEqual(fired, 110, "a flushed action never fires again")
    }

    func testPackageImportTitleStripsTheExtension() {
        XCTAssertEqual(PackageImport.title(forFileName: "Study plan.grovepad"), "Study plan")
        XCTAssertEqual(PackageImport.title(forFileName: "board.JSON"), "board")
        XCTAssertEqual(PackageImport.title(forFileName: ".grovepad"), "Imported board")
    }

    func testPackageImportRemapsGluesRelationsAndUnknownRecords() throws {
        var imported = AppCoordinator.emptyBoard(mint: .counting(prefix: "in-"), clock: .conformance)
        let document = BoardDocument(board: imported, mint: .counting(prefix: "w-"), clock: .conformance)
        let a = try XCTUnwrap(document.createWidget(type: "text", at: .zero, title: "A"))
        let b = try XCTUnwrap(document.createWidget(type: "text", at: Vector2D(x: 400, y: 0), title: "B"))
        _ = try XCTUnwrap(document.addRelation(from: a, to: b, type: .parent))
        _ = try XCTUnwrap(document.addGlue([a, b]))
        imported = document.board
        var unknown = JSONObject()
        unknown["id"] = .string("rel-x")
        unknown["fromId"] = .string(a)
        unknown["toId"] = .string(b)
        unknown["kind"] = .string("future")
        imported.unknownRelations["rel-x"] = unknown
        imported.activePacks = ["study"]

        let current = AppCoordinator.emptyBoard(mint: .counting(prefix: "cur-"), clock: .conformance)
        let result = PackageImport.apply(ImportedPackage(board: imported, media: []), to: current, mode: .newWorkspace, title: "Pack", mint: .counting(prefix: "new-"), clock: .conformance)
        let board = result.board
        XCTAssertEqual(result.workspaceIds, ["new-0001"], "workspaces are minted first, in a stable order")
        let rootCanvasId: String? = board.workspaces["new-0001"]?.rootCanvasId
        XCTAssertEqual(rootCanvasId, "new-0002")
        let workspaceId: String? = board.canvases["new-0002"]?.workspaceId
        XCTAssertEqual(workspaceId, "new-0001")
        let relation = try XCTUnwrap(board.relations.values.first)
        let fromTitle: String? = board.widgets[relation.fromId]?.title
        let toTitle: String? = board.widgets[relation.toId]?.title
        XCTAssertEqual(fromTitle, "A")
        XCTAssertEqual(toTitle, "B")
        let glue = try XCTUnwrap(board.glues.values.first)
        let glueTitles: [String] = glue.widgetIds.compactMap { board.widgets[$0]?.title }
        XCTAssertEqual(glueTitles, ["A", "B"])
        let future = try XCTUnwrap(board.unknownRelations.values.first)
        XCTAssertEqual(future.string("kind"), "future", "law 5: the rest of an unknown record is untouched")
        let futureFrom: String? = board.widgets[future.string("fromId") ?? ""]?.title
        XCTAssertEqual(futureFrom, "A")
        XCTAssertEqual(board.activePacks, ["study"])
        XCTAssertEqual(board.activeCanvasId, "new-0002")
        XCTAssertEqual(result.landingCanvasId, "new-0002")
    }

    func testSyncLinesAreHonestPlainWords() {
        XCTAssertEqual(AccountViewModel.syncLine(.guest, lastSyncedAt: nil), "Local only — sign in to sync across devices")
        XCTAssertEqual(AccountViewModel.syncLine(.offline, lastSyncedAt: nil), "Offline — changes are safe here and will sync when the network returns")
        XCTAssertEqual(AccountViewModel.syncLine(.compatibilityBlock(foundVersion: 4), lastSyncedAt: nil), "The cloud board was saved by a newer Grovepad (format 4); update to sync")
        XCTAssertTrue(AccountViewModel.syncLine(.synced, lastSyncedAt: Date().timeIntervalSince1970 * 1000).hasPrefix("Synced"))
    }
}
