import XCTest
import GrovepadCore
@testable import GrovepadApp

/// StoreKit mapping through the controller with a fake entitlement source.
@MainActor
final class SubscriptionControllerTests: XCTestCase {
    private var directory: URL!
    private let now = 1_789_000_000_000.0
    private let day = 24 * 60 * 60 * 1000.0

    override func setUp() {
        super.setUp()
        directory = AppFixtures.temporaryDirectory("subscription")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: directory)
        super.tearDown()
    }

    private func controller(entitlements: [StoreKitEntitlement], row: SubscriptionRecord? = nil, rowError: Error? = nil) -> (SubscriptionController, FakeEntitlementSource, FakeRowSource) {
        let source = FakeEntitlementSource()
        source.entitlements = entitlements
        let rows = FakeRowSource()
        rows.record = row
        rows.error = rowError
        let controller = SubscriptionController(cache: SubscriptionCacheStore(storeDirectory: directory), clock: .fixed(ms: now), rowSource: rows, entitlementSource: source)
        return (controller, source, rows)
    }

    func testAnAppStoreReceiptEntitlesAnAccountWithoutAWebRow() async {
        let (controller, source, rows) = controller(entitlements: [StoreKitEntitlement(productId: "app.grovepad.air.yearly", expiresAtMs: now + 200 * day)])
        var seen: [SubscriptionState] = []
        controller.onChange = { seen.append($0) }
        controller.adopt(userId: "u1")
        await controller.settle()
        XCTAssertEqual(source.reads, 1, "adopting an account refreshes once")
        XCTAssertEqual(rows.fetches, 1)
        XCTAssertTrue(controller.state.entitlements.isSubscribed)
        XCTAssertEqual(controller.state.entitlements.source, .air)
        XCTAssertEqual(controller.state.record?.origin, .appStore)
        XCTAssertEqual(controller.state.record?.billingInterval, .year)
        XCTAssertEqual(controller.state.status, .ready)
        XCTAssertEqual(controller.statusLine, "Grovepad Air (App Store)")
        XCTAssertEqual(seen.map(\.status), [.loading, .ready])
        XCTAssertEqual(controller.cache.read(userId: "u1")?.record?.origin, .appStore, "the receipt's record is cached like a web row")
    }

    func testTheWebRowWinsWheneverItEntitles() async {
        let web = SubscriptionRecord(plan: .airStudent, status: .active, billingInterval: .month, currentPeriodEnd: SubscriptionRules.isoString(ms: now + 10 * day))
        let (controller, _, _) = controller(entitlements: [StoreKitEntitlement(productId: "app.grovepad.air.monthly", expiresAtMs: now + 5 * day)], row: web)
        controller.adopt(userId: "u1")
        await controller.refreshNow(userId: "u1")
        XCTAssertEqual(controller.state.record, web)
        XCTAssertEqual(controller.statusLine, "Grovepad Air")
    }

    func testARevokedReceiptAndNoRowIsFreeWithARetentionClock() async {
        let (controller, _, _) = controller(entitlements: [StoreKitEntitlement(productId: "app.grovepad.air.monthly", expiresAtMs: now + 20 * day, revokedAtMs: now - day)])
        controller.adopt(userId: "u1")
        await controller.refreshNow(userId: "u1")
        XCTAssertFalse(controller.state.entitlements.isSubscribed)
        XCTAssertEqual(controller.state.record?.status, .lapsed)
        XCTAssertEqual(controller.statusLine, "Free — cloud copies kept 89 more days")
    }

    func testAFailedReadKeepsTheCachedEntitlement() async {
        let cache = SubscriptionCacheStore(storeDirectory: directory)
        cache.write(SubscriptionCacheStore.Entry(userId: "u1", record: SubscriptionRecord(plan: .air, status: .active, billingInterval: .year, currentPeriodEnd: SubscriptionRules.isoString(ms: now + 30 * day)), fetchedAt: now - day))
        let (controller, _, _) = controller(entitlements: [], rowError: CloudTransportError.offline)
        controller.adopt(userId: "u1")
        XCTAssertTrue(controller.state.fromCache)
        XCTAssertTrue(controller.state.entitlements.isSubscribed)
        await controller.refreshNow(userId: "u1")
        XCTAssertTrue(controller.state.entitlements.isSubscribed, "a plane keeps a paying customer working")
        guard case .error = controller.state.status else { return XCTFail("the failure is reported, not swallowed") }
    }

    func testSignOutResetsToFree() async {
        let (controller, _, _) = controller(entitlements: [StoreKitEntitlement(productId: "app.grovepad.air.yearly", expiresAtMs: now + 200 * day)])
        controller.adopt(userId: "u1")
        await controller.refreshNow(userId: "u1")
        controller.adopt(userId: nil)
        XCTAssertEqual(controller.state, SubscriptionState())
        XCTAssertEqual(controller.statusLine, "Free — everything on this device, no cloud sync")
    }

    func testProductTableCoversEveryPlanAndInterval() {
        let pairs = StoreKitEntitlementMapping.products.values.map { "\($0.plan.rawValue):\($0.interval.rawValue)" }.sorted()
        XCTAssertEqual(pairs, ["air:month", "air:year", "air_student:month", "air_student:year"])
    }
}
